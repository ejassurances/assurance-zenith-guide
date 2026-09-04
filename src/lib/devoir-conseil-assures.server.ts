import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ageDepuisDateNaissance,
  assuresEmprunteur,
  type PersonneEmprunteur,
} from "@/lib/recueil-besoins-schemas";

/**
 * Enrichissement « par assuré » du devoir de conseil emprunteur.
 *
 * Un dossier emprunteur = un prêt, plusieurs têtes assurées. Le devoir de
 * conseil doit présenter, pour CHAQUE emprunteur : son identité, son profil de
 * tarification, sa quotité, ses exigences propres et l'assurance qui le
 * concerne (contrat en cours ou devis retenu). Aucune donnée n'est déduite :
 * on ne restitue que ce qui existe dans le recueil, les contrats et les devis.
 */

export type CouvertureAssure = {
  origine: "contrat" | "devis" | null;
  compagnie: string | null;
  produit: string | null;
  formule: string | null;
  numero: string | null;
  type_cotisation: string | null;
  cotisation_mensuelle: number | null;
  cout_total: number | null;
  garanties: string | null;
  quotite_pct: number | null;
};

export type AssureDevoir = {
  rang: number;
  lien: string;
  lien_libelle: string;
  nom: string | null;
  date_naissance: string | null;
  age: number | null;
  csp: string | null;
  fumeur: boolean;
  quotite_pct: number | null;
  exigences: string[];
  couverture: CouvertureAssure | null;
  couvertures_etudiees: CouvertureAssure[];
};

const LIEN_LABEL: Record<string, string> = {
  principal: "Emprunteur principal",
  co_emprunteur: "Co-emprunteur",
  caution: "Caution",
  associe: "Associé",
};

const num = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

function nomAssureRecueil(p: Record<string, unknown>): string | null {
  const nom = [p.prenom, p.nom]
    .map((v) => (typeof v === "string" ? v.trim() : ""))
    .filter(Boolean)
    .join(" ");
  return nom || null;
}

/** Exigences propres à une tête, déduites uniquement des champs du recueil. */
function exigencesAssure(a: PersonneEmprunteur, recueil: Record<string, unknown>): string[] {
  const out: string[] = [];
  if (a.quotite_pct != null) out.push(`Quotité assurée demandée : ${a.quotite_pct} %`);
  if (a.csp) out.push(`Catégorie socio-professionnelle : ${a.csp}`);
  out.push(a.fumeur ? "Statut fumeur déclaré" : "Statut non-fumeur déclaré");
  const niveau = recueil.niveau_garanties_souhaite;
  if (typeof niveau === "string" && niveau) {
    const libelles: Record<string, string> = {
      conserver: "Conserver un niveau de garanties au moins équivalent au contrat en cours",
      ameliorer: "Faire évoluer la couverture par rapport au contrat en cours",
      peu_importe: "Aucune préférence exprimée sur le niveau de garanties",
    };
    out.push(libelles[niveau] ?? niveau);
  }
  const priorites = recueil.garanties_prioritaires ?? recueil.garanties_souhaitees;
  if (Array.isArray(priorites) && priorites.length > 0) {
    out.push(`Garanties prioritaires exprimées : ${priorites.filter(Boolean).join(", ")}`);
  }
  return out;
}

/**
 * Construit la liste des assurés du dossier avec, pour chacun, la couverture
 * qui le concerne. Ne lance jamais d'erreur : à défaut de donnée, la tête est
 * restituée avec `couverture: null`.
 */
export async function assuresDevoirConseil(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  dossierId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  dossier: any,
): Promise<AssureDevoir[]> {
  const recueil = (dossier?.recueil_besoins ?? {}) as Record<string, unknown>;
  const brutes = Array.isArray(recueil.assures) ? (recueil.assures as Record<string, unknown>[]) : [];
  const assures = assuresEmprunteur(recueil.assures);
  if (assures.length === 0) return [];

  /* Contrats du dossier (un contrat par tête après passage en contrat). */
  const { data: contratsData } = await supabase
    .from("contrats")
    .select(
      "id, client_id, numero, assureur, produit, prime_annuelle, quotite, statut, fractionnement, created_at",
    )
    .eq("dossier_id", dossierId)
    .order("created_at", { ascending: true });
  const contrats = (contratsData ?? []) as Record<string, unknown>[];

  const clientIds = contrats.map((c) => String(c.client_id ?? "")).filter(Boolean);
  const clientsParId = new Map<string, string>();
  if (clientIds.length > 0) {
    const { data: cl } = await supabase
      .from("clients")
      .select("id, nom, prenom")
      .in("id", Array.from(new Set(clientIds)));
    for (const c of (cl ?? []) as Record<string, unknown>[]) {
      const nom = [c.prenom, c.nom]
        .map((v) => (typeof v === "string" ? v.trim() : ""))
        .filter(Boolean)
        .join(" ");
      if (nom) clientsParId.set(String(c.id), nom);
    }
  }

  /* Devis du dossier + devis retenu par le classement. */
  const { data: devisData } = await supabase
    .from("dossier_devis")
    .select(
      "id, compagnie_id, produit_id, formule_id, cotisation_mensuelle, type_cotisation, montant_total_saisi, garanties_resume, quotite_pct, assure_rang, assureur_porteur, created_at",
    )
    .eq("dossier_id", dossierId)
    .order("created_at", { ascending: true });
  const devis = (devisData ?? []) as Record<string, unknown>[];

  const { data: classements } = await supabase
    .from("dossier_devis_classements")
    .select("devis_retenu_id")
    .eq("dossier_id", dossierId);
  const retenus = new Set(
    ((classements ?? []) as Record<string, unknown>[])
      .map((c) => String(c.devis_retenu_id ?? ""))
      .filter(Boolean),
  );

  /* Libellés compagnies / produits / formules des devis. */
  const nomsCompagnies = new Map<string, string>();
  const nomsProduits = new Map<string, string>();
  const nomsFormules = new Map<string, string>();
  const idsCompagnies = devis.map((d) => String(d.compagnie_id ?? "")).filter(Boolean);
  const idsProduits = devis.map((d) => String(d.produit_id ?? "")).filter(Boolean);
  const idsFormules = devis.map((d) => String(d.formule_id ?? "")).filter(Boolean);
  if (idsCompagnies.length > 0) {
    const { data } = await supabase.from("compagnies").select("id, nom").in("id", idsCompagnies);
    for (const r of (data ?? []) as Record<string, unknown>[]) nomsCompagnies.set(String(r.id), String(r.nom ?? ""));
  }
  if (idsProduits.length > 0) {
    const { data } = await supabase.from("produits").select("id, nom").in("id", idsProduits);
    for (const r of (data ?? []) as Record<string, unknown>[]) nomsProduits.set(String(r.id), String(r.nom ?? ""));
  }
  if (idsFormules.length > 0) {
    const { data } = await supabase.from("produit_formules").select("id, nom").in("id", idsFormules);
    for (const r of (data ?? []) as Record<string, unknown>[]) nomsFormules.set(String(r.id), String(r.nom ?? ""));
  }

  const couvertureDepuisDevis = (d: Record<string, unknown>): CouvertureAssure => ({
    origine: "devis",
    compagnie:
      nomsCompagnies.get(String(d.compagnie_id ?? "")) ??
      (typeof d.assureur_porteur === "string" ? d.assureur_porteur : null),
    produit: nomsProduits.get(String(d.produit_id ?? "")) ?? null,
    formule: nomsFormules.get(String(d.formule_id ?? "")) ?? null,
    numero: null,
    type_cotisation: typeof d.type_cotisation === "string" ? d.type_cotisation : null,
    cotisation_mensuelle: num(d.cotisation_mensuelle),
    cout_total: num(d.montant_total_saisi),
    garanties: typeof d.garanties_resume === "string" && d.garanties_resume ? d.garanties_resume : null,
    quotite_pct: num(d.quotite_pct),
  });

  const contratsRestants = [...contrats];

  return assures.map((a, index) => {
    const rang = index + 1;
    const brute = brutes[index] ?? {};

    /* Contrat de cette tête : quotité identique en priorité, sinon ordre. */
    let contrat: Record<string, unknown> | undefined;
    if (a.quotite_pct != null) {
      const i = contratsRestants.findIndex((c) => num(c.quotite) === a.quotite_pct);
      if (i >= 0) contrat = contratsRestants.splice(i, 1)[0];
    }
    if (!contrat && contratsRestants.length > 0 && contrats.length === assures.length) {
      contrat = contratsRestants.shift();
    }

    const devisTete = devis.filter((d) => (num(d.assure_rang) ?? 1) === rang);
    const devisRetenu = devisTete.find((d) => retenus.has(String(d.id))) ?? null;

    let couverture: CouvertureAssure | null = null;
    if (contrat) {
      const prime = num(contrat.prime_annuelle);
      couverture = {
        origine: "contrat",
        compagnie: typeof contrat.assureur === "string" ? contrat.assureur : null,
        produit: typeof contrat.produit === "string" ? contrat.produit : null,
        formule: null,
        numero: typeof contrat.numero === "string" ? contrat.numero : null,
        type_cotisation: devisRetenu && typeof devisRetenu.type_cotisation === "string"
          ? devisRetenu.type_cotisation
          : null,
        cotisation_mensuelle: prime != null ? Math.round((prime / 12) * 100) / 100 : null,
        cout_total: devisRetenu ? num(devisRetenu.montant_total_saisi) : null,
        garanties:
          devisRetenu && typeof devisRetenu.garanties_resume === "string"
            ? devisRetenu.garanties_resume
            : null,
        quotite_pct: num(contrat.quotite) ?? a.quotite_pct,
      };
    } else if (devisRetenu) {
      couverture = couvertureDepuisDevis(devisRetenu);
    }

    const nomContrat = contrat ? clientsParId.get(String(contrat.client_id ?? "")) ?? null : null;
    const nomDossier =
      a.lien === "principal" && typeof dossier?.client_nom === "string" ? dossier.client_nom : null;
    const nom: string | null = nomAssureRecueil(brute) || nomContrat || nomDossier;

    return {
      rang,
      lien: a.lien,
      lien_libelle: LIEN_LABEL[a.lien] ?? (a.lien || `Assuré ${rang}`),
      nom,
      date_naissance: a.date_naissance || null,
      age: a.date_naissance ? ageDepuisDateNaissance(a.date_naissance) : null,
      csp: a.csp || null,
      fumeur: a.fumeur,
      quotite_pct: a.quotite_pct,
      exigences: exigencesAssure(a, recueil),
      couverture,
      couvertures_etudiees: devisTete.map(couvertureDepuisDevis),
    };
  });
}
