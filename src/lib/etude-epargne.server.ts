/**
 * ÉTUDE ÉPARGNE (assurance-vie / PER) — production de l'analyse comparative.
 *
 * Chaîne : relevé(s) annuel(s) du prospect (extraction documentaire) + recueil
 * des besoins + catalogue produits du cabinet → comparatif de frais à rendement
 * constaté identique + projections 3 / 8 / 10 ans.
 *
 * Garde-fous :
 *  - aucun rendement inventé : sans performance constatée au relevé, l'étude est
 *    enregistrée « indisponible » avec son motif ;
 *  - aucun frais inventé : un produit sans frais renseignés au catalogue est
 *    écarté du comparatif ;
 *  - l'étude est une aide à la décision : le devoir de conseil reste produit et
 *    validé par un humain.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  comparerEpargne,
  contratActuelDepuisExtraction,
  REPARTITION_PROFIL,
  type ComparatifEpargne,
  type ContratEpargneActuel,
  type OffreEpargneCabinet,
  type ProfilRisque,
} from "./epargne-analyse";

type Admin = SupabaseClient<any, any, any>;

export interface ResultatEtudeEpargne {
  etude_id: string | null;
  statut: "produite" | "indisponible" | "hors_perimetre";
  motif: string | null;
  produit_retenu: OffreEpargneCabinet | null;
  comparatif: ComparatifEpargne | null;
  offres_comparees: number;
}

function nombre(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v.replace(",", "."));
    if (Number.isFinite(n)) return n;
  }
  return null;
}

/** Produits d'épargne ACTIFS du catalogue, avec leurs frais renseignés. */
export async function offresEpargneCabinet(admin: Admin): Promise<OffreEpargneCabinet[]> {
  const { data: familles } = await admin.from("produit_familles").select("id, branches");
  const ids = ((familles ?? []) as { id: string; branches: string[] | null }[])
    .filter((f) => (f.branches ?? []).includes("epargne_retraite"))
    .map((f) => f.id);
  if (ids.length === 0) return [];

  const { data: produits } = await admin
    .from("produits")
    .select("id, nom, assureur_porteur, frais_versement_pct, frais_gestion_pct, statut, famille_id")
    .eq("statut", "actif")
    .in("famille_id", ids);

  return ((produits ?? []) as any[]).map((p) => ({
    produit_id: p.id as string,
    produit_nom: p.nom as string,
    assureur: (p.assureur_porteur as string | null) ?? null,
    frais_versement_pct: nombre(p.frais_versement_pct),
    frais_gestion_pct: nombre(p.frais_gestion_pct),
  }));
}

/** Dernière extraction de relevé de placement rattachée au dossier. */
async function dernierReleve(admin: Admin, dossierId: string): Promise<ContratEpargneActuel | null> {
  const { data: docs } = await admin
    .from("documents")
    .select("id")
    .eq("dossier_id", dossierId)
    .is("archive_le", null);
  const docIds = ((docs ?? []) as { id: string }[]).map((d) => d.id);
  if (docIds.length === 0) return null;

  const { data: extractions } = await admin
    .from("doc_extractions")
    .select("extracted_data, type_document, created_at")
    .in("document_id", docIds)
    .eq("type_document", "releves_placements")
    .eq("statut", "extrait")
    .order("created_at", { ascending: false })
    .limit(1);
  const ligne = ((extractions ?? []) as any[])[0];
  if (!ligne) return null;
  return contratActuelDepuisExtraction((ligne.extracted_data ?? null) as Record<string, unknown> | null);
}

/**
 * Produit (ou reproduit) l'étude épargne d'un dossier et l'enregistre dans
 * `etudes_epargne`. N'avance aucun statut réglementaire.
 */
export async function produireEtudeEpargne(
  admin: Admin,
  params: { dossierId: string; userId?: string | null },
): Promise<ResultatEtudeEpargne> {
  const { data: dossierRow } = await admin
    .from("dossiers")
    .select("id, client_id, type_assurance, recueil_besoins")
    .eq("id", params.dossierId)
    .maybeSingle();
  const dossier = dossierRow as any;
  if (!dossier) throw new Error("Dossier introuvable");
  if (dossier.type_assurance !== "epargne_retraite") {
    return {
      etude_id: null,
      statut: "hors_perimetre",
      motif: "L'étude épargne ne concerne que la branche Épargne & Retraite.",
      produit_retenu: null,
      comparatif: null,
      offres_comparees: 0,
    };
  }

  const recueil = (dossier.recueil_besoins ?? {}) as Record<string, unknown>;
  const profil = (["prudent", "equilibre", "dynamique"].includes(String(recueil["profil_risque"]))
    ? (recueil["profil_risque"] as ProfilRisque)
    : null) as ProfilRisque | null;
  const actuel = await dernierReleve(admin, params.dossierId);

  // Point de départ : encours transférable constaté, sinon versement initial
  // envisagé au recueil. Un prospect sans contrat démarre donc bien de 0 + ses
  // versements prévus.
  const capitalInitial =
    nombre(actuel?.valeur_actuelle) ?? nombre(recueil["montant_initial"]) ?? 0;
  const versementMensuel = nombre(recueil["versements_mensuels"]) ?? 0;

  const offres = await offresEpargneCabinet(admin);
  const eligibles = offres.filter(
    (o) => o.frais_versement_pct !== null && o.frais_gestion_pct !== null,
  );

  let retenu: OffreEpargneCabinet | null = null;
  let meilleur: ComparatifEpargne | null = null;
  for (const offre of eligibles) {
    const c = comparerEpargne({ actuel, offre, capital_initial: capitalInitial, versement_mensuel: versementMensuel });
    if (!c.disponible) {
      if (!meilleur) meilleur = c;
      continue;
    }
    const valeur10 = c.projections.find((p) => p.annees === 10)?.valeur_cabinet ?? 0;
    const reference = meilleur?.disponible
      ? (meilleur.projections.find((p) => p.annees === 10)?.valeur_cabinet ?? 0)
      : -1;
    if (valeur10 > reference) {
      meilleur = c;
      retenu = offre;
    }
  }

  const indisponible = !meilleur || !meilleur.disponible;
  const motif = indisponible
    ? (meilleur?.motif ??
      "Aucun produit d'épargne actif avec frais renseignés au catalogue : comparaison non disponible.")
    : null;

  const { data: inserted, error } = await admin
    .from("etudes_epargne")
    .insert({
      dossier_id: params.dossierId,
      client_id: dossier.client_id ?? null,
      produit_id: retenu?.produit_id ?? null,
      profil_risque: profil,
      contrat_actuel: (actuel ?? {}) as never,
      offre_cabinet: (retenu ?? {}) as never,
      hypotheses: {
        capital_initial: capitalInitial,
        versement_mensuel: versementMensuel,
        source_rendement: actuel ? "contrat_actuel" : "aucune",
        horizon_ans: nombre(recueil["horizon_ans"]),
        repartition_profil: profil ? REPARTITION_PROFIL[profil] : null,
        offres_eligibles: eligibles.length,
      } as never,
      comparatif: (meilleur ?? {}) as never,
      statut: indisponible ? "indisponible" : "produite",
      motif_indisponibilite: motif,
      created_by: params.userId ?? null,
    })
    .select("id")
    .maybeSingle();
  if (error) throw new Error(error.message);

  return {
    etude_id: (inserted as { id: string } | null)?.id ?? null,
    statut: indisponible ? "indisponible" : "produite",
    motif,
    produit_retenu: retenu,
    comparatif: meilleur,
    offres_comparees: eligibles.length,
  };
}
