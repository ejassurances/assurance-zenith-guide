import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import {
  classerDevisDossierFn,
  retenirDevisDossierFn,
  creerDevisTarifFixeFn,
} from "@/lib/devis-classement.functions";
import { neolianeTariferDossier } from "@/lib/neoliane.functions";
import { brancheTarifableNeoliane, nbAssuresNeoliane } from "@/lib/neoliane/branches";
import { ugipTariferDossier } from "@/lib/ugip.functions";
import { nbAssuresUgip } from "@/lib/ugip/eligibilite";
import { simulassurTariferDossier } from "@/lib/simulassur.functions";
import { brancheTarifableSimulassur, nbAssuresSimulassur } from "@/lib/simulassur/eligibilite";

/** 1er jour du mois suivant (AAAA-MM-JJ) — date d'effet proposée par défaut. */
function premierDuMoisSuivant(): string {
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth() + 1, 1)).toISOString().slice(0, 10);
}

export type DossierDevis = {
  id: string;
  dossier_id: string;
  compagnie_id: string | null;
  produit_id: string | null;
  formule_id: string | null;
  cotisation_mensuelle: number | null;
  /** Mode de calcul de la cotisation : CI (capital initial, constante) ou CRD (capital restant dû, dégressive). */
  type_cotisation: "CI" | "CRD" | null;
  cotisation_min: number | null;
  cotisation_max: number | null;
  /** Montant total de l'assurance sur la durée du prêt (point d'entrée de la saisie manuelle). */
  montant_total_saisi: number | null;
  source: "manuel" | "api" | "pdf";
  garanties_resume: string | null;
  quotite_pct: number | null;
  /** Tête assurée visée par ce devis (1 = assuré principal, 2 = co-emprunteur). Un devis = une tête. */
  assure_rang: number | null;
  assureur_porteur: string | null;
  created_at: string;
};

type LigneClassement = { dossier_devis_id: string; rang: number; justification: string };
type Classement = {
  id: string;
  genere_le: string;
  modele_ia: string | null;
  classement: LigneClassement[];
  statut: string;
  route: string | null;
  profils_specifiques: string[] | null;
};


type Ref = { id: string; nom: string };
type ProduitRef = {
  id: string;
  nom: string;
  compagnie_id: string;
  famille_id: string;
  assureur_porteur: string | null;
};

type FormuleRef = { id: string; nom: string; produit_id: string; actif: boolean };
type FormuleFixe = { id: string; nom: string; tarif_fixe: number | null; actif: boolean };
type OptionFixe = { id: string; nom: string; tarif_fixe: number | null; description: string | null };

const inp = "w-full rounded-md border border-line bg-background px-3 py-2 text-sm";
const eur = (n: number) => `${n.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} € / mois`;



/** Devis comparés saisis manuellement par le staff — base du comparatif du devoir de conseil. */
export function DossierDevisPanel({
  dossierId,
  branche,
  userId,
  onChanged,
}: {
  dossierId: string;
  branche?: string | null;
  userId: string;
  onChanged?: () => void;
}) {
  const [devis, setDevis] = useState<DossierDevis[]>([]);
  const [compagnies, setCompagnies] = useState<Ref[]>([]);
  const [produits, setProduits] = useState<ProduitRef[]>([]);
  const [formules, setFormules] = useState<FormuleRef[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [classement, setClassement] = useState<Classement | null>(null);
  const [iaEtat, setIaEtat] = useState<"idle" | "classement" | "selection">("idle");
  const [iaMsg, setIaMsg] = useState<string | null>(null);
  const lancerClassement = useServerFn(classerDevisDossierFn);
  const retenirOffre = useServerFn(retenirDevisDossierFn);
  const creerFixe = useServerFn(creerDevisTarifFixeFn);

  /** Produit du dossier en tarification fixe : formules et options à cotisation connue. */
  const [produitFixe, setProduitFixe] = useState<{ id: string; nom: string } | null>(null);
  const [formulesFixes, setFormulesFixes] = useState<FormuleFixe[]>([]);
  const [optionsFixes, setOptionsFixes] = useState<OptionFixe[]>([]);
  const [fixeFormuleId, setFixeFormuleId] = useState("");
  const [fixeOptionIds, setFixeOptionIds] = useState<string[]>([]);
  const [fixeEtat, setFixeEtat] = useState<"idle" | "envoi">("idle");

  /** Tarification API Néoliane (toutes branches couvertes). */
  const tariferNeoliane = useServerFn(neolianeTariferDossier);
  const [nbAssuresApi, setNbAssuresApi] = useState(0);
  const [neoDate, setNeoDate] = useState(premierDuMoisSuivant());
  const [neoEtat, setNeoEtat] = useState<"idle" | "appel">("idle");
  const [neoMsg, setNeoMsg] = useState<string | null>(null);
  const [neoErr, setNeoErr] = useState<string | null>(null);

  /** Tarification API UGIP Assurances (branche emprunteur). */
  const tariferUgip = useServerFn(ugipTariferDossier);
  const [nbAssuresUgipApi, setNbAssuresUgipApi] = useState(0);
  const [ugipDate, setUgipDate] = useState(premierDuMoisSuivant());
  const [ugipEtat, setUgipEtat] = useState<"idle" | "appel">("idle");
  const [ugipMsg, setUgipMsg] = useState<string | null>(null);
  const [ugipErr, setUgipErr] = useState<string | null>(null);

  /** Tarification API Simulassur (branche emprunteur). */
  const tariferSimulassur = useServerFn(simulassurTariferDossier);
  const [nbAssuresSimu, setNbAssuresSimu] = useState(0);
  const [simuDate, setSimuDate] = useState(premierDuMoisSuivant());
  const [simuEtat, setSimuEtat] = useState<"idle" | "appel">("idle");
  const [simuMsg, setSimuMsg] = useState<string | null>(null);
  const [simuErr, setSimuErr] = useState<string | null>(null);

  /** Comparatif : par défaut une seule offre par assureur porteur (doublons de canaux masqués). */
  const [afficherDoublons, setAfficherDoublons] = useState(false);

  /** Base de comparaison issue du recueil des besoins emprunteur (pas de ressaisie). */
  const [moisRestants, setMoisRestants] = useState<number | null>(null);
  const [crdRecueil, setCrdRecueil] = useState<number | null>(null);

  const [form, setForm] = useState({
    compagnie_id: "",
    produit_id: "",
    formule_id: "",
    montant_total_saisi: "",
    type_cotisation: "" as "" | "CI" | "CRD",
    cotisation_mensuelle: "",
    cotisation_min: "",
    cotisation_max: "",
    quotite_pct: "",
    garanties_resume: "",
    assure_rang: "1",
  });

  /** Têtes assurées issues du recueil des besoins (co-emprunteurs inclus). */
  const [assuresRecueil, setAssuresRecueil] = useState<{ rang: number; label: string }[]>([]);

  /** Mensuel moyen dérivé : montant total sur la durée ÷ mois restants du recueil. */
  const mensuelMoyenDerive =
    form.montant_total_saisi && moisRestants && moisRestants > 0
      ? Number(form.montant_total_saisi) / moisRestants
      : null;

  const load = useCallback(async () => {
    const [d, c, p, cl, dos] = await Promise.all([
      supabase
        .from("dossier_devis")
        .select("id,dossier_id,compagnie_id,produit_id,formule_id,cotisation_mensuelle,type_cotisation,cotisation_min,cotisation_max,montant_total_saisi,source,garanties_resume,quotite_pct,assure_rang,assureur_porteur,created_at")
        .eq("dossier_id", dossierId)
        .is("archive_le", null)
        .order("created_at", { ascending: true }),
      supabase.from("compagnies").select("id,nom").order("nom"),
      supabase.from("produits").select("id,nom,compagnie_id,famille_id,assureur_porteur").order("nom"),
      supabase
        .from("dossier_devis_classements")
        .select("id,genere_le,modele_ia,classement,statut,route,profils_specifiques")
        .eq("dossier_id", dossierId)
        .eq("statut", "propose")
        .order("genere_le", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("dossiers")
        .select("produit_id,type_assurance,recueil_besoins,mode_recommandation")
        .eq("id", dossierId)
        .maybeSingle(),
    ]);
    if (d.error) setErr(d.error.message);
    setDevis((d.data as DossierDevis[]) ?? []);
    setCompagnies((c.data as Ref[]) ?? []);
    setProduits((p.data as ProduitRef[]) ?? []);
    setClassement((cl.data as Classement | null) ?? null);

    const dossier = dos.data as
      | {
          produit_id: string | null;
          type_assurance: string | null;
          recueil_besoins: unknown;
          mode_recommandation?: string | null;
        }
      | null;
    const recueil = (dossier?.recueil_besoins ?? {}) as Record<string, unknown>;
    const brancheDossier = dossier?.type_assurance ?? "";
    setModeReco(dossier?.mode_recommandation ?? "auto");
    setRecueilDossier(recueil);

    const nb = (v: unknown) => {
      const n = Number(v);
      return Number.isFinite(n) && n > 0 ? n : null;
    };
    const assures = Array.isArray(recueil["assures"]) ? (recueil["assures"] as Record<string, unknown>[]) : [];
    setAssuresRecueil(
      assures.map((a, i) => ({
        rang: i + 1,
        label: `${
          a?.["lien"] === "co_emprunteur" ? "Co-emprunteur" : "Assuré principal"
        }${a?.["quotite_pct"] ? ` — quotité ${a["quotite_pct"]} %` : ""}`,
      })),
    );
    setMoisRestants(nb(recueil["mois_restants"]) ?? nb(recueil["duree_mois"]));
    setCrdRecueil(nb(recueil["capital_restant_du"]) ?? nb(recueil["capital"]));
    setNbAssuresApi(
      brancheTarifableNeoliane(brancheDossier) ? nbAssuresNeoliane(brancheDossier, recueil) : 0,
    );
    setNbAssuresUgipApi(nbAssuresUgip(brancheDossier, recueil));
    setNbAssuresSimu(
      brancheTarifableSimulassur(brancheDossier) ? nbAssuresSimulassur(brancheDossier, recueil) : 0,
    );


    const produitDossierId = dossier?.produit_id ?? null;
    if (!produitDossierId) {
      setProduitFixe(null);
      setFormulesFixes([]);
      setOptionsFixes([]);
      return;
    }
    const { data: prod } = await supabase
      .from("produits")
      .select("id,nom,mode_tarification")
      .eq("id", produitDossierId)
      .maybeSingle();
    const pr = prod as { id: string; nom: string; mode_tarification: string } | null;
    if (!pr || pr.mode_tarification !== "fixe") {
      setProduitFixe(null);
      setFormulesFixes([]);
      setOptionsFixes([]);
      return;
    }
    setProduitFixe({ id: pr.id, nom: pr.nom });
    const [fm, op] = await Promise.all([
      supabase
        .from("produit_formules")
        .select("id,nom,tarif_fixe,actif")
        .eq("produit_id", pr.id)
        .eq("actif", true)
        .order("ordre"),
      supabase
        .from("produit_options")
        .select("id,nom,tarif_fixe,description")
        .eq("produit_id", pr.id)
        .eq("actif", true)
        .order("ordre"),
    ]);
    setFormulesFixes((fm.data as FormuleFixe[]) ?? []);
    setOptionsFixes((op.data as OptionFixe[]) ?? []);
  }, [dossierId]);



  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    (async () => {
      if (!form.produit_id) return setFormules([]);
      const { data } = await supabase
        .from("produit_formules")
        .select("id,nom,produit_id,actif")
        .eq("produit_id", form.produit_id)
        .order("ordre");
      setFormules(((data as FormuleRef[]) ?? []).filter((f) => f.actif));
    })();
  }, [form.produit_id]);

  const nomCompagnie = (id: string | null) => compagnies.find((c) => c.id === id)?.nom ?? "—";
  const nomProduit = (id: string | null) => produits.find((p) => p.id === id)?.nom ?? "—";

  /** Assureur porteur d'un devis : produit du catalogue en priorité, sinon valeur renvoyée par l'API. */
  const porteurDevis = (d: DossierDevis | undefined) => {
    if (!d) return null;
    const viaProduit = produits.find((p) => p.id === d.produit_id)?.assureur_porteur ?? null;
    const nom = (viaProduit || d.assureur_porteur || "").trim();
    return nom ? nom : null;
  };

  /** Regroupement des devis du dossier par assureur porteur (au moins 2 offres du même porteur). */
  const groupesPorteur = new Map<string, { nom: string; canaux: string[]; devisIds: string[] }>();
  for (const d of devis) {
    const nom = porteurDevis(d);
    if (!nom) continue;
    const cle = nom.toLowerCase();
    const g = groupesPorteur.get(cle) ?? { nom, canaux: [], devisIds: [] };
    const canal = nomCompagnie(d.compagnie_id);
    if (canal !== "—" && !g.canaux.includes(canal)) g.canaux.push(canal);
    g.devisIds.push(d.id);
    groupesPorteur.set(cle, g);
  }
  const porteurPartage = (d: DossierDevis | undefined) => {
    const nom = porteurDevis(d);
    if (!nom) return null;
    const g = groupesPorteur.get(nom.toLowerCase());
    return g && g.devisIds.length > 1 ? g : null;
  };

  /**
   * Offre retenue par défaut dans un groupe de même assureur porteur : la moins
   * chère, priorité au tarif automatique (API) à égalité — même règle que la
   * sélection automatique du classement emprunteur.
   */
  const representantsGroupe = new Set<string>();
  for (const g of groupesPorteur.values()) {
    if (g.devisIds.length < 2) continue;
    const membres = g.devisIds.map((id) => devis.find((x) => x.id === id)).filter((x): x is DossierDevis => !!x);
    const tarifes = membres.filter((m) => m.cotisation_mensuelle != null);
    const tri = (tarifes.length > 0 ? tarifes : membres).sort((a, b) => {
      const pa = a.cotisation_mensuelle == null ? Infinity : Number(a.cotisation_mensuelle);
      const pb = b.cotisation_mensuelle == null ? Infinity : Number(b.cotisation_mensuelle);
      if (pa !== pb) return pa - pb;
      return (a.source === "api" ? 0 : 1) - (b.source === "api" ? 0 : 1);
    });
    if (tri[0]) representantsGroupe.add(tri[0].id);
  }
  /** Un devis est masqué s'il fait partie d'un groupe sans en être l'offre retenue. */
  const estDoublonMasque = (d: DossierDevis | undefined) => {
    if (!d) return false;
    const g = porteurPartage(d);
    return g != null && !representantsGroupe.has(d.id);
  };
  const nbDoublonsMasques = devis.filter((d) => estDoublonMasque(d)).length;
  const devisAffiches = afficherDoublons ? devis : devis.filter((d) => !estDoublonMasque(d));



  const ajouter = async () => {
    setErr(null);
    if (!form.compagnie_id || !form.produit_id) {
      setErr("Choisissez une compagnie et un produit.");
      return;
    }
    if (assuresRecueil.length >= 2 && !form.assure_rang) {
      setErr(
        "Ce dossier comporte un co-emprunteur : indiquez la tête assurée visée. Un devis combiné unique est interdit (DDA).",
      );
      return;
    }
    setSaving(true);
    const mensuel = form.cotisation_mensuelle
      ? Number(form.cotisation_mensuelle)
      : mensuelMoyenDerive != null
        ? Math.round(mensuelMoyenDerive * 100) / 100
        : null;
    const { error } = await supabase.from("dossier_devis").insert({
      dossier_id: dossierId,
      compagnie_id: form.compagnie_id,
      produit_id: form.produit_id,
      formule_id: form.formule_id || null,
      montant_total_saisi: form.montant_total_saisi ? Number(form.montant_total_saisi) : null,
      type_cotisation: form.type_cotisation || null,
      cotisation_mensuelle: mensuel,
      cotisation_min: form.type_cotisation === "CRD" && form.cotisation_min ? Number(form.cotisation_min) : null,
      cotisation_max: form.type_cotisation === "CRD" && form.cotisation_max ? Number(form.cotisation_max) : null,
      quotite_pct: form.quotite_pct ? Number(form.quotite_pct) : null,
      assure_rang: form.assure_rang ? Number(form.assure_rang) : 1,
      garanties_resume: form.garanties_resume.trim() || null,
      source: "manuel",
      saisi_par: userId,
    });
    setSaving(false);
    if (error) return setErr(error.message);
    setForm({
      compagnie_id: "",
      produit_id: "",
      formule_id: "",
      montant_total_saisi: "",
      type_cotisation: "",
      cotisation_mensuelle: "",
      cotisation_min: "",
      cotisation_max: "",
      quotite_pct: "",
      garanties_resume: "",
      assure_rang: "1",
    });
    await load();
    onChanged?.();
  };

  /** Traçabilité ACPR : le devis n'est jamais supprimé, il est archivé (masqué). */
  const supprimer = async (d: DossierDevis) => {
    if (!confirm("Archiver ce devis ? Il sera retiré du comparatif mais conservé comme preuve (ACPR).")) return;
    const { error } = await supabase
      .from("dossier_devis")
      .update({ archive_le: new Date().toISOString() })
      .eq("id", d.id);
    if (error) return setErr(error.message);
    await load();
    onChanged?.();
  };

  const produitsVisibles = produits.filter((p) => !form.compagnie_id || p.compagnie_id === form.compagnie_id);

  const demanderClassement = async () => {
    setIaMsg(null);
    setErr(null);
    setIaEtat("classement");
    try {
      await lancerClassement({ data: { dossier_id: dossierId } });
      await load();
      setIaMsg("Classement IA généré — à vous de retenir l'offre.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Classement IA impossible");
    } finally {
      setIaEtat("idle");
    }
  };

  const retenir = async (devisId: string) => {
    if (!classement) return;
    if (!confirm("Retenir cette offre et générer le devoir de conseil en brouillon (sans envoi au client) ?")) return;
    setIaMsg(null);
    setErr(null);
    setIaEtat("selection");
    try {
      await retenirOffre({ data: { classement_id: classement.id, devis_id: devisId } });
      await load();
      setIaMsg(
        "Offre retenue : compagnie et produit reportés sur le dossier, devoir de conseil créé en brouillon. L'envoi au client reste à déclencher manuellement.",
      );
      onChanged?.();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Sélection impossible");
    } finally {
      setIaEtat("idle");
    }
  };


  const formuleFixeChoisie = formulesFixes.find((f) => f.id === fixeFormuleId) ?? null;
  const totalFixe =
    (formuleFixeChoisie?.tarif_fixe == null ? 0 : Number(formuleFixeChoisie.tarif_fixe)) +
    optionsFixes
      .filter((o) => fixeOptionIds.includes(o.id))
      .reduce((s, o) => s + (o.tarif_fixe == null ? 0 : Number(o.tarif_fixe)), 0);

  const genererDepuisTarifFixe = async () => {
    if (!fixeFormuleId) return;
    if (
      !confirm(
        "Créer ce devis comme seule offre du dossier et générer le devoir de conseil en brouillon (sans envoi au client) ?",
      )
    )
      return;
    setErr(null);
    setIaMsg(null);
    setFixeEtat("envoi");
    try {
      await creerFixe({ data: { dossier_id: dossierId, formule_id: fixeFormuleId, option_ids: fixeOptionIds } });
      await load();
      setIaMsg(
        "Devis créé depuis le tarif fixe du produit et devoir de conseil généré en brouillon. L'envoi au client reste à déclencher manuellement.",
      );
      onChanged?.();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Génération impossible");
    } finally {
      setFixeEtat("idle");
    }
  };

  const recupererTarifsNeoliane = async () => {
    setNeoErr(null);
    setNeoMsg(null);
    setNeoEtat("appel");
    try {
      const res = (await tariferNeoliane({ data: { dossier_id: dossierId, date_effet: neoDate } })) as {
        nbDevisCrees: number;
        nbTarifs: number;
        nbAssures: number;
        compagnieTrouvee: boolean;
      };
      await load();
      setNeoMsg(
        `${res.nbDevisCrees} devis Néoliane ajoutés au dossier (${res.nbTarifs} tarifs retournés pour ${res.nbAssures} assuré(s)).` +
          (res.compagnieTrouvee ? "" : " Compagnie « Néoliane » introuvable en base : les devis sont créés sans compagnie."),
      );
      onChanged?.();
    } catch (e) {
      setNeoErr(e instanceof Error ? e.message : "Appel Néoliane impossible");
    } finally {
      setNeoEtat("idle");
    }
  };

  const recupererTarifsUgip = async () => {
    setUgipErr(null);
    setUgipMsg(null);
    setUgipEtat("appel");
    try {
      const res = (await tariferUgip({ data: { dossier_id: dossierId, date_effet: ugipDate } })) as {
        nbDevisCrees: number;
        nbTarifs: number;
        nbProduitsInterroges: number;
        nbAssures: number;
        compagnieTrouvee: boolean;
        echecs: string[];
      };
      await load();
      setUgipMsg(
        `${res.nbDevisCrees} devis UGIP ajoutés au dossier (${res.nbTarifs} tarifs obtenus sur ${res.nbProduitsInterroges} produits interrogés, ${res.nbAssures} assuré(s)).` +
          (res.compagnieTrouvee ? "" : " Compagnie « UGIP » introuvable en base : les devis sont créés sans compagnie.") +
          (res.echecs.length > 0 ? `\nProduits écartés : ${res.echecs.join(" · ")}` : ""),
      );
      onChanged?.();
    } catch (e) {
      setUgipErr(e instanceof Error ? e.message : "Appel UGIP impossible");
    } finally {
      setUgipEtat("idle");
    }
  };





  const recupererTarifsSimulassur = async () => {
    setSimuErr(null);
    setSimuMsg(null);
    setSimuEtat("appel");
    try {
      const res = (await tariferSimulassur({
        data: { dossier_id: dossierId, date_effet: simuDate },
      })) as {
        nbDevisCrees: number;
        nbOffres: number;
        nbOffresExploitables: number;
        nbAssures: number;
        compagnieTrouvee: boolean;
        erreursProduits: string[];
      };
      await load();
      setSimuMsg(
        `${res.nbDevisCrees} devis Simulassur ajoutés au dossier (${res.nbOffresExploitables} offres exploitables sur ${res.nbOffres} retournées, ${res.nbAssures} assuré(s)).` +
          (res.compagnieTrouvee
            ? ""
            : " Compagnie « Simulassur » introuvable en base : les devis sont créés sans compagnie.") +
          (res.erreursProduits.length > 0
            ? `\nProduits écartés : ${res.erreursProduits.join(" · ")}`
            : ""),
      );
      onChanged?.();
    } catch (e) {
      setSimuErr(e instanceof Error ? e.message : "Appel Simulassur impossible");
    } finally {
      setSimuEtat("idle");
    }
  };

  return (
    <div className="rounded-2xl border border-line bg-surface-elevated p-5">
      <h2 className="font-serif text-lg font-medium text-ink">Devis comparés</h2>
      <p className="mt-1 text-xs text-ink-muted">
        {produitFixe
          ? `Produit à tarification fixe (${produitFixe.nom}) : le devis est repris directement du tarif renseigné sur la fiche produit, sans ressaisie ni classement IA.`
          : `Saisie manuelle des devis étudiés pour ce dossier${branche ? ` (${branche})` : ""}. Ils alimentent le tableau des offres comparées du devoir de conseil.`}
      </p>


      {err && <p className="mt-2 text-sm text-destructive">{err}</p>}

      {nbDoublonsMasques > 0 && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[color:var(--crm-gold)]/40 bg-[color:var(--crm-gold)]/10 px-3 py-2">
          <p className="text-xs text-ink-soft">
            {nbDoublonsMasques} offre(s) masquée(s) : même assureur porteur distribué par plusieurs canaux — seule
            l'offre la moins chère (priorité au tarif automatique) est affichée.
          </p>
          <button
            onClick={() => setAfficherDoublons((v) => !v)}
            className="rounded-full border border-line bg-surface px-3 py-1.5 text-xs text-ink"
          >
            {afficherDoublons ? "Masquer les doublons de canaux" : "Afficher tous les canaux (y compris doublons)"}
          </button>
        </div>
      )}

      {assuresRecueil.length >= 2 &&
        assuresRecueil.some((a) => !devis.some((d) => (d.assure_rang ?? 1) === a.rang)) && (
          <p className="mt-4 rounded-xl border border-[color:var(--crm-gold)]/50 bg-[color:var(--crm-gold)]/10 px-3 py-2 text-sm text-ink">
            Prêt à deux têtes : un devis distinct est obligatoire pour chaque assuré. Manquant pour{" "}
            {assuresRecueil
              .filter((a) => !devis.some((d) => (d.assure_rang ?? 1) === a.rang))
              .map((a) => a.label)
              .join(", ")}
            .
          </p>
        )}

      <div className="mt-4 space-y-2">
        {devis.length === 0 && <p className="text-sm text-ink-muted">Aucun devis saisi pour ce dossier.</p>}
        {devisAffiches.map((d) => {
          const formule = d.formule_id;
          const groupeListe = porteurPartage(d);
          return (
            <div
              key={d.id}
              className={`rounded-xl border bg-surface p-3 text-sm ${
                groupeListe
                  ? "border-l-4 border-l-[color:var(--crm-gold)] border-[color:var(--crm-gold)]/40"
                  : "border-line"
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium text-ink">
                  {assuresRecueil.length >= 2 && (
                    <span className="mr-2 rounded-full border border-[color:var(--crm-gold)]/50 px-2 py-0.5 text-xs text-ink-soft">
                      {assuresRecueil.find((a) => a.rang === (d.assure_rang ?? 1))?.label ??
                        `Tête ${d.assure_rang ?? 1}`}
                    </span>
                  )}
                  {nomCompagnie(d.compagnie_id)} — {nomProduit(d.produit_id)}
                  {formule && <FormuleNom formuleId={formule} />}
                </p>
                <div className="flex items-center gap-3">
                  <span className="text-right text-ink-soft">
                    {d.montant_total_saisi != null && (
                      <span className="block">
                        {Number(d.montant_total_saisi).toLocaleString("fr-FR")} € au total sur la durée du prêt
                      </span>
                    )}
                    <span className="block">
                      {d.cotisation_mensuelle != null
                        ? `${Number(d.cotisation_mensuelle).toLocaleString("fr-FR")} € / mois${
                            d.type_cotisation === "CRD" ? " en moyenne" : ""
                          }`
                        : "Cotisation mensuelle non renseignée"}
                    </span>
                    {d.type_cotisation && (
                      <span className="block text-xs text-ink-muted">
                        {d.type_cotisation === "CI"
                          ? "CI — cotisation constante sur le capital initial"
                          : `CRD — cotisation dégressive${
                              d.cotisation_min != null && d.cotisation_max != null
                                ? ` (de ${Number(d.cotisation_min).toLocaleString("fr-FR")} € à ${Number(
                                    d.cotisation_max,
                                  ).toLocaleString("fr-FR")} €)`
                                : ""
                            }`}
                      </span>
                    )}
                  </span>
                  <button onClick={() => supprimer(d)} className="text-xs text-red-700 underline underline-offset-4">
                    Archiver
                  </button>
                </div>
              </div>
              {groupeListe && (
                <p className="mt-2 rounded-md bg-surface-elevated/70 px-2 py-1 text-xs text-ink-soft">
                  Même assureur porteur : <strong>{groupeListe.nom}</strong> — disponible via{" "}
                  {groupeListe.canaux.join(", ")}
                </p>
              )}
              {d.garanties_resume && (
                <p className="mt-1 whitespace-pre-wrap text-xs text-ink-soft">{d.garanties_resume}</p>
              )}
            </div>
          );
        })}

      </div>

      {nbAssuresApi > 0 && (
        <div className="mt-4 space-y-3 rounded-xl border border-line bg-surface p-4">
          <div>
            <h3 className="text-sm font-medium text-ink">Tarification Néoliane (API)</h3>
            <p className="mt-1 text-xs text-ink-muted">
              {nbAssuresApi} assuré(s) du recueil seront transmis à Néoliane pour cette branche. Les tarifs obtenus
              sont ajoutés automatiquement au comparatif ; la saisie manuelle reste toujours possible.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <label className="block">
              <span className="text-xs font-medium uppercase tracking-wide text-ink-muted">Date d'effet</span>
              <input type="date" value={neoDate} onChange={(e) => setNeoDate(e.target.value)} className={inp} />
            </label>
            <button
              onClick={recupererTarifsNeoliane}
              disabled={neoEtat === "appel" || !neoDate}
              className="rounded-full bg-ink px-5 py-2 text-sm text-primary-foreground disabled:opacity-50"
            >
              {neoEtat === "appel" ? "Appel Néoliane…" : "Récupérer les tarifs Néoliane"}
            </button>
          </div>
          {neoMsg && <p className="text-sm text-emerald-700">{neoMsg}</p>}
          {neoErr && <p className="whitespace-pre-wrap text-sm text-destructive">{neoErr}</p>}
        </div>
      )}

      {nbAssuresUgipApi > 0 && (
        <div className="mt-4 space-y-3 rounded-xl border border-line bg-surface p-4">
          <div>
            <h3 className="text-sm font-medium text-ink">Tarification UGIP Assurances (API)</h3>
            <p className="mt-1 text-xs text-ink-muted">
              {nbAssuresUgipApi} assuré(s) du recueil, avec leur quotité, seront transmis à UGIP sur l'ensemble des
              produits emprunteur commercialisés (bases capital initial et capital restant dû). Les 5 offres les moins
              chères sont ajoutées au comparatif, garanties Décès, PTIA, IPT et ITT franchise 90 jours.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <label className="block">
              <span className="text-xs font-medium uppercase tracking-wide text-ink-muted">Date d'effet</span>
              <input type="date" value={ugipDate} onChange={(e) => setUgipDate(e.target.value)} className={inp} />
            </label>
            <button
              onClick={recupererTarifsUgip}
              disabled={ugipEtat === "appel" || !ugipDate}
              className="rounded-full bg-ink px-5 py-2 text-sm text-primary-foreground disabled:opacity-50"
            >
              {ugipEtat === "appel" ? "Appel UGIP…" : "Récupérer les tarifs UGIP"}
            </button>
          </div>
          {ugipMsg && <p className="whitespace-pre-wrap text-sm text-emerald-700">{ugipMsg}</p>}
          {ugipErr && <p className="whitespace-pre-wrap text-sm text-destructive">{ugipErr}</p>}
        </div>
      )}



      {nbAssuresSimu > 0 && (
        <div className="mt-4 space-y-3 rounded-xl border border-line bg-surface p-4">
          <div>
            <h3 className="text-sm font-medium text-ink">Tarification Simulassur (API)</h3>
            <p className="mt-1 text-xs text-ink-muted">
              {nbAssuresSimu} assuré(s) du recueil, avec leur quotité, sont transmis à Simulassur avec les
              caractéristiques du prêt. Les 5 offres les moins chères sont ajoutées au comparatif (Décès, PTIA, IPT,
              ITT/ITP franchise 90 jours), avec coût total et TAEA.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <label className="block">
              <span className="text-xs font-medium uppercase tracking-wide text-ink-muted">Date d'effet</span>
              <input type="date" value={simuDate} onChange={(e) => setSimuDate(e.target.value)} className={inp} />
            </label>
            <button
              onClick={recupererTarifsSimulassur}
              disabled={simuEtat === "appel" || !simuDate}
              className="rounded-full bg-ink px-5 py-2 text-sm text-primary-foreground disabled:opacity-50"
            >
              {simuEtat === "appel" ? "Appel Simulassur…" : "Récupérer les tarifs Simulassur"}
            </button>
          </div>
          {simuMsg && <p className="whitespace-pre-wrap text-sm text-emerald-700">{simuMsg}</p>}
          {simuErr && <p className="whitespace-pre-wrap text-sm text-destructive">{simuErr}</p>}
        </div>
      )}

      {produitFixe && (
        <div className="mt-4 space-y-3 border-t border-line pt-4">
          <div>
            <h3 className="text-sm font-medium text-ink">Tarif fixe du produit</h3>
            <p className="mt-1 text-xs text-ink-muted">
              Choisissez la formule et les options souhaitées : le total est calculé automatiquement et devient la
              seule offre du dossier. Aucun classement IA n'est nécessaire.
            </p>
          </div>

          {formulesFixes.length === 0 && (
            <p className="text-sm text-ink-muted">
              Aucune formule active avec tarif fixe sur ce produit — renseignez-les sur la fiche produit.
            </p>
          )}

          {formulesFixes.length > 0 && (
            <>
              <label className="block sm:max-w-sm">
                <span className="text-xs font-medium uppercase tracking-wide text-ink-muted">Formule</span>
                <select value={fixeFormuleId} onChange={(e) => setFixeFormuleId(e.target.value)} className={inp}>
                  <option value="">— Choisir —</option>
                  {formulesFixes.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.nom}
                      {f.tarif_fixe == null ? " (tarif non renseigné)" : ` — ${eur(Number(f.tarif_fixe))}`}
                    </option>
                  ))}
                </select>
              </label>

              {optionsFixes.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">Options</p>
                  {optionsFixes.map((o) => (
                    <label key={o.id} className="flex items-start gap-2 text-sm text-ink">
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={fixeOptionIds.includes(o.id)}
                        onChange={(e) =>
                          setFixeOptionIds((l) => (e.target.checked ? [...l, o.id] : l.filter((x) => x !== o.id)))
                        }
                      />
                      <span>
                        {o.nom}
                        <span className="text-ink-soft">
                          {" "}
                          — {o.tarif_fixe == null ? "tarif non renseigné" : eur(Number(o.tarif_fixe))}
                        </span>
                        {o.description && <span className="block text-xs text-ink-muted">{o.description}</span>}
                      </span>
                    </label>
                  ))}
                </div>
              )}

              <p className="text-sm font-medium text-ink">
                Total calculé : <span className="text-ink-soft">{eur(totalFixe)}</span>
              </p>

              <button
                onClick={genererDepuisTarifFixe}
                disabled={!fixeFormuleId || fixeEtat !== "idle"}
                className="rounded-full bg-ink px-4 py-2 text-sm text-primary-foreground disabled:opacity-60"
              >
                {fixeEtat === "envoi" ? "Génération…" : "Créer ce devis et générer le devoir de conseil"}
              </button>
              {iaMsg && <p className="text-sm text-emerald-700">{iaMsg}</p>}
            </>
          )}
        </div>
      )}

      {!produitFixe && (
      <div className="mt-4 border-t border-line pt-4">

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-medium text-ink">Classement IA des devis</h3>
            <p className="mt-1 text-xs text-ink-muted">
              L'IA classe les devis saisis au regard du recueil des besoins et justifie chaque rang. Elle ne décide
              pas : vous retenez l'offre, ce qui génère le devoir de conseil en brouillon (aucun envoi au client).
            </p>
          </div>
          <button
            onClick={demanderClassement}
            disabled={devis.length < 2 || iaEtat !== "idle"}
            className="rounded-full border border-line px-4 py-2 text-sm text-ink disabled:opacity-50"
          >
            {iaEtat === "classement" ? "Analyse en cours…" : "Lancer le classement IA"}
          </button>
        </div>
        {devis.length < 2 && (
          <p className="mt-2 text-xs text-ink-muted">Saisissez au moins 2 devis pour activer le classement.</p>
        )}
        {iaMsg && <p className="mt-2 text-sm text-emerald-700">{iaMsg}</p>}

        {classement && (
          <div className="mt-3 space-y-2">
            <p className="text-xs text-ink-muted">
              Généré le {new Date(classement.genere_le).toLocaleString("fr-FR")}
              {classement.modele_ia ? ` · ${classement.modele_ia}` : ""}
            </p>
            {[...classement.classement]
              .sort((a, b) => a.rang - b.rang)
              .filter((l) => afficherDoublons || !estDoublonMasque(devis.find((x) => x.id === l.dossier_devis_id)))
              .map((l) => {
                const d = devis.find((x) => x.id === l.dossier_devis_id);
                const groupe = porteurPartage(d);

                const kereisCatalogue = compagnies.find((c) => /kereis/i.test(c.nom));
                const kereisManquant =
                  groupe != null &&
                  kereisCatalogue != null &&
                  !groupe.canaux.some((c) => /kereis/i.test(c));
                return (
                  <div
                    key={l.dossier_devis_id}
                    className={`rounded-xl border p-3 text-sm ${
                      groupe
                        ? "border-l-4 border-l-[color:var(--crm-gold)] border-[color:var(--crm-gold)]/40 bg-[color:var(--crm-gold)]/10"
                        : "border-[color:var(--crm-gold)]/40 bg-[color:var(--crm-gold)]/5"
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <p className="font-medium text-ink">
                        <span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-ink text-xs text-primary-foreground">
                          {l.rang}
                        </span>
                        {d ? `${nomCompagnie(d.compagnie_id)} — ${nomProduit(d.produit_id)}` : "Devis supprimé"}
                        {d?.formule_id && <FormuleNom formuleId={d.formule_id} />}
                        {d?.cotisation_mensuelle != null && (
                          <span className="ml-2 text-ink-soft">
                            {Number(d.cotisation_mensuelle).toLocaleString("fr-FR")} € / mois
                          </span>
                        )}
                      </p>
                      {d && (
                        <button
                          onClick={() => retenir(d.id)}
                          disabled={iaEtat !== "idle"}
                          className="rounded-full bg-ink px-3 py-1.5 text-xs text-primary-foreground disabled:opacity-60"
                        >
                          {iaEtat === "selection" ? "Traitement…" : "Retenir cette offre"}
                        </button>
                      )}
                    </div>
                    {groupe && (
                      <p className="mt-2 rounded-md bg-surface/70 px-2 py-1 text-xs text-ink-soft">
                        Même assureur porteur : <strong>{groupe.nom}</strong> — disponible via{" "}
                        {groupe.canaux.join(", ")}
                        {kereisManquant && (
                          <>
                            {" "}
                            · Aucun devis {kereisCatalogue?.nom} pour cet assureur porteur : faites un devis chez{" "}
                            {kereisCatalogue?.nom} pour {groupe.nom} et ajoutez-le au comparatif avant de retenir une
                            offre.
                          </>
                        )}
                      </p>
                    )}
                    <p className="mt-2 whitespace-pre-wrap text-xs text-ink-soft">{l.justification}</p>
                  </div>
                );
              })}

          </div>
        )}
      </div>
      )}

      {!produitFixe && (
      <div className="mt-4 grid gap-3 border-t border-line pt-4 sm:grid-cols-2">

        <label className="block">
          <span className="text-xs font-medium uppercase tracking-wide text-ink-muted">Compagnie</span>
          <select
            value={form.compagnie_id}
            onChange={(e) => setForm({ ...form, compagnie_id: e.target.value, produit_id: "", formule_id: "" })}
            className={inp}
          >
            <option value="">— Choisir —</option>
            {compagnies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nom}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-xs font-medium uppercase tracking-wide text-ink-muted">Produit</span>
          <select
            value={form.produit_id}
            onChange={(e) => setForm({ ...form, produit_id: e.target.value, formule_id: "" })}
            className={inp}
          >
            <option value="">— Choisir —</option>
            {produitsVisibles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nom}
              </option>
            ))}
          </select>
        </label>
        {formules.length > 0 && (
          <label className="block">
            <span className="text-xs font-medium uppercase tracking-wide text-ink-muted">Formule</span>
            <select
              value={form.formule_id}
              onChange={(e) => setForm({ ...form, formule_id: e.target.value })}
              className={inp}
            >
              <option value="">— Aucune —</option>
              {formules.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nom}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="block sm:col-span-2">
          <span className="text-xs font-medium uppercase tracking-wide text-ink-muted">
            Montant total de l'assurance sur la durée du prêt (€)
          </span>
          <input
            type="number"
            step="0.01"
            value={form.montant_total_saisi}
            onChange={(e) => setForm({ ...form, montant_total_saisi: e.target.value })}
            className={inp}
          />
          <span className="mt-1 block text-xs text-ink-muted">
            Donnée d'entrée principale : c'est le montant figurant sur le devis de l'assureur pour la durée totale du
            prêt.
            {moisRestants
              ? ` Recueil des besoins : ${moisRestants} mois restants${
                  crdRecueil ? ` · capital restant dû ${crdRecueil.toLocaleString("fr-FR")} €` : ""
                }.`
              : " Renseignez « mois restants » dans le recueil des besoins pour dériver automatiquement le mensuel moyen."}
            {mensuelMoyenDerive != null &&
              ` Mensuel moyen calculé : ${mensuelMoyenDerive.toLocaleString("fr-FR", {
                maximumFractionDigits: 2,
              })} € / mois.`}
          </span>
        </label>
        <label className="block">
          <span className="text-xs font-medium uppercase tracking-wide text-ink-muted">Mode de calcul (CI / CRD)</span>
          <select
            value={form.type_cotisation}
            onChange={(e) =>
              setForm({ ...form, type_cotisation: e.target.value as "" | "CI" | "CRD" })
            }
            className={inp}
          >
            <option value="">— À préciser —</option>
            <option value="CI">CI — capital initial (cotisation constante)</option>
            <option value="CRD">CRD — capital restant dû (cotisation dégressive)</option>
          </select>
        </label>
        <label className="block">
          <span className="text-xs font-medium uppercase tracking-wide text-ink-muted">
            Cotisation mensuelle {form.type_cotisation === "CRD" ? "moyenne " : ""}(€ / mois) — complémentaire
          </span>
          <input
            type="number"
            step="0.01"
            value={form.cotisation_mensuelle}
            onChange={(e) => setForm({ ...form, cotisation_mensuelle: e.target.value })}
            placeholder={
              mensuelMoyenDerive != null
                ? mensuelMoyenDerive.toLocaleString("fr-FR", { maximumFractionDigits: 2 })
                : undefined
            }
            className={inp}
          />
          <span className="mt-1 block text-xs text-ink-muted">
            Laissez vide pour reprendre automatiquement le mensuel moyen dérivé du montant total.
          </span>
        </label>
        {form.type_cotisation === "CRD" && (
          <>
            <label className="block">
              <span className="text-xs font-medium uppercase tracking-wide text-ink-muted">
                Mensualité la plus basse (€)
              </span>
              <input
                type="number"
                step="0.01"
                value={form.cotisation_min}
                onChange={(e) => setForm({ ...form, cotisation_min: e.target.value })}
                className={inp}
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium uppercase tracking-wide text-ink-muted">
                Mensualité la plus haute (€)
              </span>
              <input
                type="number"
                step="0.01"
                value={form.cotisation_max}
                onChange={(e) => setForm({ ...form, cotisation_max: e.target.value })}
                className={inp}
              />
            </label>
          </>
        )}
        {assuresRecueil.length >= 2 && (
          <label className="block sm:col-span-2">
            <span className="text-xs font-medium uppercase tracking-wide text-ink-muted">
              Tête assurée couverte par ce devis <span className="text-accent">*</span>
            </span>
            <select
              value={form.assure_rang}
              onChange={(e) => setForm({ ...form, assure_rang: e.target.value })}
              className={inp}
            >
              {assuresRecueil.map((a) => (
                <option key={a.rang} value={String(a.rang)}>
                  {a.label}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-xs text-ink-muted">
              Obligation DDA : sur un prêt à deux têtes, un devis distinct est établi par assuré. Le devis
              combiné unique est refusé.
            </span>
          </label>
        )}
        {branche === "emprunteur" && (
          <label className="block">
            <span className="text-xs font-medium uppercase tracking-wide text-ink-muted">Quotité assurée (%)</span>
            <input
              type="number"
              step="1"
              min={1}
              max={100}
              value={form.quotite_pct}
              onChange={(e) => setForm({ ...form, quotite_pct: e.target.value })}
              className={inp}
            />
            <span className="mt-1 block text-xs text-ink-muted">
              Nécessaire pour recalculer la cotisation en cas d'ajustement de quotité demandé par le client.
            </span>
          </label>
        )}
        <label className="block sm:col-span-2">
          <span className="text-xs font-medium uppercase tracking-wide text-ink-muted">Résumé des garanties</span>
          <textarea
            rows={2}
            value={form.garanties_resume}
            onChange={(e) => setForm({ ...form, garanties_resume: e.target.value })}
            className={inp}
          />
        </label>
        <div className="sm:col-span-2">
          <button
            onClick={ajouter}
            disabled={saving}
            className="rounded-full bg-ink px-4 py-2 text-sm text-primary-foreground disabled:opacity-60"
          >
            {saving ? "Enregistrement…" : "Ajouter ce devis"}
          </button>
        </div>
      </div>
      )}

    </div>
  );
}

function FormuleNom({ formuleId }: { formuleId: string }) {
  const [nom, setNom] = useState<string | null>(null);
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("produit_formules").select("nom").eq("id", formuleId).maybeSingle();
      setNom((data as { nom: string } | null)?.nom ?? null);
    })();
  }, [formuleId]);
  return nom ? <span className="text-ink-soft"> · formule {nom}</span> : null;
}
