import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { creerTacheAdmin } from "@/lib/agent-taches.server";

/**
 * Transformation d'un dossier confirmé par la compagnie en contrat du
 * portefeuille.
 *
 * Dès que la compagnie confirme l'adhésion (retour compagnie, étape
 * « contrat validé » ou « contrat actif »), le contrat doit exister dans le
 * CRM : le client devient actif, le chiffre d'affaires et les commissions sont
 * comptés, et le contrat porte une date de fin (échéance principale).
 *
 * La signature de la lettre de mission et du devoir de conseil ne conditionne
 * PAS l'existence du contrat — l'assurance est en place. En revanche, si ces
 * documents ne sont pas signés, une tâche de régularisation est créée pour que
 * le dossier DDA soit complété sans délai.
 */

type Client = SupabaseClient<Database>;

function ajouterMois(iso: string, mois: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  const jour = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + mois);
  const dernier = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(jour, dernier));
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** Personnes assurées sur le prêt, telles que saisies dans le recueil. */
function assuresDuPret(
  recueil: unknown,
): { libelle: string | null; quotite_pct: number | null }[] {
  const valeur = (recueil as Record<string, unknown> | null)?.["assures"];
  if (!Array.isArray(valeur)) return [];
  return valeur
    .filter((p): p is Record<string, unknown> => !!p && typeof p === "object")
    .map((p) => {
      const q = Number(p["quotite_pct"] ?? NaN);
      const nom = typeof p["nom"] === "string" && p["nom"] ? p["nom"] : null;
      const lien = typeof p["lien"] === "string" ? p["lien"] : "";
      return {
        libelle: nom ?? (lien === "co_emprunteur" ? "Co-emprunteur" : lien === "principal" ? null : lien || null),
        quotite_pct: Number.isFinite(q) && q > 0 ? q : null,
      };
    });
}

export interface ResultatContratDossier {
  contrat_id: string;
  /** Un contrat par personne assurée sur le prêt (emprunteur). */
  contrats_ids: string[];
  deja_existant: boolean;
  prime_annuelle: number | null;
  date_effet: string;
  date_echeance: string;
  dda_a_regulariser: boolean;
}

export async function creerContratDepuisDossier(
  client: Client,
  dossierId: string,
  userId: string,
  options?: { date_effet?: string | null; numero?: string | null; duree_mois?: number | null },
): Promise<ResultatContratDossier> {
  const { data: dossier, error } = await client
    .from("dossiers")
    .select(
      "id, reference, client_id, type_assurance, duree_mois, capital, compagnie_id, produit_id, recueil_besoins, economie_estimee",
    )
    .eq("id", dossierId)
    .maybeSingle();
  if (error || !dossier) throw new Error("Dossier introuvable ou accès refusé");
  if (!dossier.client_id) throw new Error("Dossier sans fiche client : rattachez le client avant de créer le contrat.");

  // Idempotence : un dossier (un prêt) ne produit qu'un jeu de contrats.
  const { data: existants } = await client
    .from("contrats")
    .select("id, prime_annuelle, date_effet, date_echeance")
    .eq("dossier_id", dossierId)
    .order("created_at", { ascending: true });
  const existant = (existants ?? [])[0];
  if (existant) {
    return {
      contrat_id: existant.id,
      contrats_ids: (existants ?? []).map((c) => c.id),
      deja_existant: true,
      prime_annuelle: existant.prime_annuelle,
      date_effet: existant.date_effet ?? "",
      date_echeance: existant.date_echeance ?? "",
      dda_a_regulariser: false,
    };
  }

  // Devis retenu au classement, sinon le dernier devis saisi.
  const { data: classement } = await client
    .from("dossier_devis_classements")
    .select("devis_retenu_id")
    .eq("dossier_id", dossierId)
    .not("devis_retenu_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let devis: {
    compagnie_id: string | null;
    produit_id: string | null;
    cotisation_mensuelle: number | null;
    montant_total_saisi: number | null;
    quotite_pct: number | null;
    taux_commission: number | null;
    commission_base: string | null;
  } | null = null;

  if (classement?.devis_retenu_id) {
    const { data } = await client
      .from("dossier_devis")
      .select(
        "compagnie_id, produit_id, cotisation_mensuelle, montant_total_saisi, quotite_pct, taux_commission, commission_base",
      )
      .eq("id", classement.devis_retenu_id)
      .maybeSingle();
    devis = data ?? null;
  }
  if (!devis) {
    const { data } = await client
      .from("dossier_devis")
      .select(
        "compagnie_id, produit_id, cotisation_mensuelle, montant_total_saisi, quotite_pct, taux_commission, commission_base",
      )
      .eq("dossier_id", dossierId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    devis = data ?? null;
  }

  const compagnieId = devis?.compagnie_id ?? dossier.compagnie_id ?? null;
  const produitId = devis?.produit_id ?? dossier.produit_id ?? null;

  const [compagnie, produit] = await Promise.all([
    compagnieId
      ? client.from("compagnies").select("nom").eq("id", compagnieId).maybeSingle()
      : Promise.resolve({ data: null }),
    produitId ? client.from("produits").select("nom").eq("id", produitId).maybeSingle() : Promise.resolve({ data: null }),
  ]);

  const estEmprunteur = dossier.type_assurance === "emprunteur";
  const primeAnnuelle =
    devis?.cotisation_mensuelle != null
      ? Math.round(Number(devis.cotisation_mensuelle) * 12 * 100) / 100
      : devis?.montant_total_saisi != null && !estEmprunteur
        ? Number(devis.montant_total_saisi)
        : null;

  const dateEffet = options?.date_effet ?? new Date().toISOString().slice(0, 10);
  const dureeMois = options?.duree_mois ?? (estEmprunteur ? dossier.duree_mois ?? 12 : 12);
  const dateEcheance = ajouterMois(dateEffet, Math.max(1, dureeMois));

  // Emprunteur : le dossier porte UN prêt, mais chaque personne assurée sur ce
  // prêt donne lieu à SON contrat (quotité propre, prime au prorata de la
  // quotité lorsque seule la prime globale du prêt est connue).
  const assures = estEmprunteur ? assuresDuPret(dossier.recueil_besoins) : [];
  const totalQuotites = assures.reduce((s, a) => s + (a.quotite_pct ?? 0), 0);

  const lignes =
    assures.length > 0
      ? assures.map((a) => {
          const part =
            primeAnnuelle == null
              ? null
              : totalQuotites > 0 && a.quotite_pct != null
                ? Math.round(((primeAnnuelle * a.quotite_pct) / totalQuotites) * 100) / 100
                : Math.round((primeAnnuelle / assures.length) * 100) / 100;
          return { quotite: a.quotite_pct, prime: part, libelle: a.libelle };
        })
      : [{ quotite: devis?.quotite_pct ?? null, prime: primeAnnuelle, libelle: null as string | null }];

  const contratsIds: string[] = [];
  for (const ligne of lignes) {
    const { data: cree, error: insErr } = await client
      .from("contrats")
      .insert({
        client_id: dossier.client_id,
        dossier_id: dossierId,
        numero: options?.numero ?? null,
        assureur: compagnie.data?.nom ?? "À compléter",
        produit: produit.data?.nom ?? dossier.type_assurance ?? "Contrat",
        compagnie_id: compagnieId,
        produit_id: produitId,
        date_effet: dateEffet,
        date_echeance: dateEcheance,
        duree_mois: dureeMois,
        prime_annuelle: ligne.prime,
        fractionnement: devis?.cotisation_mensuelle != null ? "mensuel" : "annuel",
        statut: "actif",
        is_emprunteur: estEmprunteur,
        capital_initial: estEmprunteur ? dossier.capital : null,
        quotite: ligne.quotite,
        // Source UNIQUE de la rémunération : le taux saisi sur le devis retenu.
        // Stocké en fraction sur la fiche contrat (5 % → 0,05).
        commission_cabinet_taux: tauxEnFraction(devis?.taux_commission ?? null),
        co_emprunteur: ligne.libelle,
        created_by: userId,
      })
      .select("id")
      .single();
    if (insErr || !cree) throw new Error(insErr?.message ?? "Création du contrat impossible");
    contratsIds.push(cree.id);

    // Commission prévisionnelle du contrat de CET assuré, dérivée du seul taux
    // du devis (aucun second calcul). Donnée interne : table staff uniquement.
    if (devis?.taux_commission != null) {
      const base: BaseCommission = devis.commission_base === "economie_realisee" ? "economie_realisee" : "prime";
      const prevu = commissionDepuisDevis(
        { taux: Number(devis.taux_commission), base },
        {
          cotisationMensuelle: ligne.prime != null ? Math.round((Number(ligne.prime) / 12) * 100) / 100 : null,
          economie: dossier.economie_estimee != null ? Number(dossier.economie_estimee) : null,
          moisRestants:
            moisRestantsRecueil(dossier.type_assurance ?? null, dossier.recueil_besoins as Record<string, unknown>) ??
            dureeMois,
          quotitePct: ligne.quotite,
          totalQuotites: totalQuotites > 0 ? totalQuotites : null,
        },
      );
      if (prevu.mensuel != null) {
        const { data: dejaPrevu } = await client
          .from("commission_previsions")
          .select("id")
          .eq("contrat_id", cree.id)
          .maybeSingle();
        if (!dejaPrevu) {
          await client.from("commission_previsions").insert({
            dossier_id: dossierId,
            contrat_id: cree.id,
            branche: dossier.type_assurance ?? null,
            compagnie_id: compagnieId,
            montant_mensuel_estime: prevu.mensuel,
            mois_restants_initial: prevu.mois,
            montant_previsionnel_total: prevu.total,
            date_estimation: new Date().toISOString().slice(0, 10),
            periodicite: "mensuelle",
            statut: "estime",
          } as never);
        }
      }
    }
  }


  // Le client produit du chiffre d'affaires : il n'est plus un prospect.
  await client.from("clients").update({ statut: "actif" }).eq("id", dossier.client_id).eq("statut", "prospect");

  // Contrôle DDA : lettre de mission et devoir de conseil signés ?
  const [lm, dc] = await Promise.all([
    client.from("lettres_mission").select("statut").eq("dossier_id", dossierId),
    client.from("devoirs_conseil").select("statut").eq("dossier_id", dossierId),
  ]);
  const lmSignee = (lm.data ?? []).some((l) => l.statut === "signee");
  const dcSigne = (dc.data ?? []).some((d) => d.statut === "signe");
  const manquants = [
    lmSignee ? null : (lm.data ?? []).length > 0 ? "lettre de mission envoyée, signature en attente" : "lettre de mission à envoyer",
    dcSigne ? null : (dc.data ?? []).length > 0 ? "devoir de conseil envoyé, signature en attente" : "devoir de conseil à envoyer",
  ].filter(Boolean) as string[];

  if (manquants.length > 0) {
    await creerTacheAdmin(client, {
      titre: `Régulariser le dossier DDA — contrat en place — ${dossier.reference}`,
      description: [
        `Le contrat est confirmé par la compagnie et actif au portefeuille (${compagnie.data?.nom ?? "assureur à compléter"} — ${produit.data?.nom ?? dossier.type_assurance}).`,
        `Effet : ${dateEffet} · Échéance : ${dateEcheance}${primeAnnuelle != null ? ` · Prime annuelle : ${primeAnnuelle} €` : ""}`,
        `À régulariser : ${manquants.join(" ; ")}.`,
        "Rappel ACPR : le contrat ne doit pas rester sans devoir de conseil signé.",
      ].join("\n"),
      client_id: dossier.client_id,
      priorite: "urgente",
      created_by: userId,
    });
  }

  await client.from("activites").insert({
    client_id: dossier.client_id,
    type: "systeme",
    titre:
      contratsIds.length > 1
        ? `Contrats créés au portefeuille (${contratsIds.length} assurés du prêt)`
        : "Contrat créé au portefeuille (confirmation compagnie)",
    contenu: [
      `Dossier ${dossier.reference}`,
      `${compagnie.data?.nom ?? "Assureur à compléter"} — ${produit.data?.nom ?? dossier.type_assurance}`,
      `Effet ${dateEffet} · fin ${dateEcheance}`,
      primeAnnuelle != null ? `Prime annuelle du prêt : ${primeAnnuelle} €` : null,
      lignes.length > 1
        ? `Un contrat par assuré : ${lignes
            .map(
              (l) =>
                `${l.libelle ?? "assuré principal"}${l.quotite != null ? ` — quotité ${l.quotite} %` : ""}${
                  l.prime != null ? ` — ${l.prime} €/an` : ""
                }`,
            )
            .join(" ; ")}`
        : null,
      manquants.length > 0 ? `Documents DDA à régulariser : ${manquants.join(" ; ")}` : "Dossier DDA complet.",
    ]
      .filter(Boolean)
      .join("\n"),
    created_by: userId,
  });

  return {
    contrat_id: contratsIds[0]!,
    contrats_ids: contratsIds,
    deja_existant: false,
    prime_annuelle: primeAnnuelle,
    date_effet: dateEffet,
    date_echeance: dateEcheance,
    dda_a_regulariser: manquants.length > 0,
  };
}
