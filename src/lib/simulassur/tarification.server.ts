/**
 * Tarification emprunteur Simulassur (POST /api/pricing, mode synchrone) à
 * partir du dossier CRM — SERVEUR UNIQUEMENT.
 *
 * Les offres exploitables alimentent le comparatif de devis du dossier
 * (`dossier_devis`, source « api »). Les erreurs par produit sont remontées au
 * conseiller sans faire échouer les produits tarifés avec succès.
 */

import { callSimulassur, masquerSecretsSimulassur } from "./api.server";
import { lireRecueilSimulassur, manquesIdentiteSimulassur } from "./eligibilite";
import {
  empreintePayload,
  payloadTarification,
  premierDuMoisSuivant,
  type ClientSimulassur,
} from "./mapping.server";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Sb = any;

export interface OffreSimulassur {
  produitCode: string;
  produitNom: string;
  assureur: string;
  coutTotal: number;
  coutTotalAvecFrais: number | null;
  taeaPct: number | null;
  cotisationAnnuelleMoyenne: number | null;
  coutDouzePremiersMois: number | null;
  eligible: boolean;
  erreur: string | null;
}

function nb(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function texte(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/**
 * Normalise la réponse de tarification, organisée par produit. Les clés et la
 * casse variant selon les produits, chaque valeur est cherchée de façon souple.
 */
export function normaliserOffres(data: unknown): OffreSimulassur[] {
  const racine = (data ?? {}) as Record<string, unknown>;
  const bloc =
    (racine["DATA"] as Record<string, unknown> | undefined) ??
    (racine["data"] as Record<string, unknown> | undefined) ??
    (racine["results"] as Record<string, unknown> | undefined) ??
    racine;

  const entrees: [string, Record<string, unknown>][] = Array.isArray(bloc)
    ? (bloc as Record<string, unknown>[]).map((o, i) => [texte(o["product"]) || String(i + 1), o])
    : Object.entries(bloc as Record<string, unknown>)
        .filter((e): e is [string, Record<string, unknown>] => !!e[1] && typeof e[1] === "object")
        .map((e) => [e[0], e[1]]);

  const offres: OffreSimulassur[] = [];
  for (const [cle, o] of entrees) {
    const erreurBrute =
      o["error"] ?? o["errors"] ?? (o["ERROR"] as unknown) ?? (o["message"] as unknown) ?? null;
    const erreur =
      erreurBrute && (typeof erreurBrute !== "object" || Object.keys(erreurBrute).length > 0)
        ? masquerSecretsSimulassur(
            typeof erreurBrute === "string" ? erreurBrute : JSON.stringify(erreurBrute),
          ).slice(0, 300)
        : null;

    const coutTotal = nb(o["totalCost"]) ?? nb(o["totalcost"]) ?? 0;
    const taea = nb(o["taea"]);
    const societe = (o["company"] ?? o["insurer"] ?? {}) as Record<string, unknown> | string;
    const assureur =
      typeof societe === "string"
        ? societe
        : texte(societe["name"]) || texte(societe["label"]) || texte(o["companyName"]);

    offres.push({
      produitCode: cle,
      produitNom: texte(o["productLabel"]) || texte(o["label"]) || texte(o["name"]) || cle,
      assureur,
      coutTotal: coutTotal ?? 0,
      coutTotalAvecFrais: nb(o["totalCostWithFees"]),
      // La documentation demande d'afficher le TAEA multiplié par 100.
      taeaPct: taea === null ? null : Math.round(taea * 100 * 1000) / 1000,
      cotisationAnnuelleMoyenne: nb(o["averageAnnualpremium"]) ?? nb(o["averageAnnualPremium"]),
      coutDouzePremiersMois: nb(o["firstTwelveMonthsCost"]),
      eligible: !erreur && (coutTotal ?? 0) > 0,
      erreur,
    });
  }
  return offres;
}

export interface TariferDossierSimulassurInput {
  dossierId: string;
  dateEffet?: string | undefined;
  codeBanque?: string | null | undefined;
  produits?: string[] | undefined;
  /** Rejoue la demande même si une demande identique vient d'être envoyée. */
  forcer?: boolean | undefined;
}

/**
 * Tarifie un dossier emprunteur auprès de Simulassur, enregistre les offres
 * exploitables en devis comparés et met à jour le suivi Simulassur du dossier.
 */
export async function tariferDossierSimulassur(
  supabase: Sb,
  input: TariferDossierSimulassurInput,
  userId: string,
) {
  const { data: dos, error: errDos } = await supabase
    .from("dossiers")
    .select("id, client_id, type_assurance, recueil_besoins")
    .eq("id", input.dossierId)
    .maybeSingle();
  if (errDos) throw new Error(errDos.message);
  if (!dos) throw new Error("Dossier introuvable.");
  if (String(dos.type_assurance ?? "") !== "emprunteur") {
    throw new Error("La tarification Simulassur ne couvre que la branche assurance emprunteur.");
  }
  if (!dos.client_id) throw new Error("Rattachez le dossier à un client avant de tarifer.");

  const lu = lireRecueilSimulassur(dos.recueil_besoins);
  if (!lu.ok || !lu.valeurs) {
    throw new Error(`Recueil incomplet pour Simulassur : complétez ${lu.manques.join(", ")}.`);
  }
  const recueil = lu.valeurs;

  const { data: client } = await supabase
    .from("clients")
    .select(
      "id, civilite, nom, prenom, email, telephone, adresse, code_postal, ville, date_naissance, situation_familiale, profession",
    )
    .eq("id", dos.client_id)
    .maybeSingle();
  if (!client) throw new Error("Fiche client introuvable.");

  const manques = manquesIdentiteSimulassur(client as ClientSimulassur);
  if (manques.length > 0) {
    throw new Error(
      `Simulassur exige des informations réelles pour l'assuré : complétez ${manques.join(", ")} sur la fiche client.`,
    );
  }

  const dateEffet = /^\d{4}-\d{2}-\d{2}$/.test(input.dateEffet ?? "")
    ? (input.dateEffet as string)
    : premierDuMoisSuivant();

  const payload = payloadTarification({
    dossierId: input.dossierId,
    recueil,
    // Le coassuré partage la fiche client tant qu'il n'a pas sa propre fiche.
    clientsParRang: recueil.assures.map(() => client as ClientSimulassur),
    dateEffet,
    codeBanque: input.codeBanque ?? null,
    ...(input.produits ? { produits: input.produits } : {}),
  });
  const hash = await empreintePayload(payload);

  const { data: suivi } = await supabase
    .from("simulassur_dossiers")
    .select("id, request_hash, updated_at")
    .eq("dossier_id", input.dossierId)
    .maybeSingle();

  // Anti double-clic : une demande identique dans les 60 s n'est pas rejouée.
  if (
    !input.forcer &&
    suivi?.request_hash === hash &&
    suivi?.updated_at &&
    Date.now() - new Date(suivi.updated_at as string).getTime() < 60_000
  ) {
    throw new Error(
      "Une demande de tarification identique vient d'être envoyée à Simulassur : attendez le résultat avant de relancer.",
    );
  }

  const res = await callSimulassur({
    method: "POST",
    path: "/api/pricing",
    body: payload,
    supabase,
    dossierId: input.dossierId,
  });

  if (!res.ok) {
    await majSuivi(supabase, input.dossierId, dos.client_id as string, userId, {
      request_hash: hash,
      derniere_erreur: res.erreur?.message ?? `HTTP ${res.status}`,
    });
    throw new Error(res.erreur?.message ?? `Simulassur a refusé la demande (HTTP ${res.status}).`);
  }

  const offres = normaliserOffres(res.data);
  const exploitables = offres.filter((o) => o.eligible).sort((a, b) => a.coutTotal - b.coutTotal);
  const erreursProduits = offres.filter((o) => o.erreur).map((o) => `${o.produitNom} : ${o.erreur}`);

  if (exploitables.length === 0) {
    await majSuivi(supabase, input.dossierId, dos.client_id as string, userId, {
      request_hash: hash,
      derniere_erreur: erreursProduits[0] ?? "Aucune offre exploitable retournée.",
    });
    throw new Error(
      `Simulassur n'a retourné aucune offre exploitable.\n${erreursProduits.slice(0, 5).join("\n")}`.trim(),
    );
  }

  const { data: comp } = await supabase
    .from("compagnies")
    .select("id")
    .ilike("nom", "%simulassur%")
    .limit(1)
    .maybeSingle();
  const compagnieId = (comp?.id as string | undefined) ?? null;

  const quotiteTotale = recueil.assures.reduce((s, p) => s + (p.quotite_pct ?? 0), 0);
  const retenues = exploitables.slice(0, 5);

  const lignes = retenues.map((o) => ({
    dossier_id: input.dossierId,
    compagnie_id: compagnieId,
    produit_id: null,
    formule_id: null,
    cotisation_mensuelle: Math.round((o.coutTotal / recueil.dureeMois) * 100) / 100,
    quotite_pct: quotiteTotale > 0 && quotiteTotale <= 100 ? quotiteTotale : null,
    garanties_resume:
      `${o.produitNom}${o.assureur ? ` — ${o.assureur}` : ""} (Simulassur ${o.produitCode}) — ` +
      `Décès, PTIA, IPT, ITT/ITP franchise 90 j. Coût total ${o.coutTotal.toLocaleString("fr-FR")} € ` +
      `sur ${recueil.dureeMois} mois` +
      (o.taeaPct !== null ? ` — TAEA ${o.taeaPct.toFixed(3)} %` : "") +
      (o.cotisationAnnuelleMoyenne
        ? ` — cotisation annuelle moyenne ${o.cotisationAnnuelleMoyenne.toLocaleString("fr-FR")} €`
        : ""),
    source: "api",
    saisi_par: userId,
  }));

  const { data: devisCrees, error: errIns } = await supabase
    .from("dossier_devis")
    .insert(lignes)
    .select("id");
  if (errIns) throw new Error(errIns.message);

  const racine = (res.data ?? {}) as Record<string, unknown>;
  const meta = (racine["DATA"] ?? racine["data"] ?? {}) as Record<string, unknown>;
  const quoteId =
    texte(meta["quoteId"]) || texte(racine["quoteId"]) || texte(meta["ID"]) || texte(meta["id"]);
  const simulationId = texte(meta["simulationId"]) || texte(racine["simulationId"]);

  await majSuivi(supabase, input.dossierId, dos.client_id as string, userId, {
    request_hash: hash,
    derniere_erreur: null,
    ...(quoteId ? { quote_id: quoteId } : {}),
    ...(simulationId ? { simulation_id: simulationId } : {}),
  });

  return {
    dateEffet,
    nbAssures: recueil.assures.length,
    nbOffres: offres.length,
    nbOffresExploitables: exploitables.length,
    nbDevisCrees: (devisCrees as { id: string }[] | null)?.length ?? lignes.length,
    quoteId: quoteId || null,
    compagnieTrouvee: !!compagnieId,
    erreursProduits: erreursProduits.slice(0, 5),
    correlationId: res.correlationId,
  };
}

/** Crée ou met à jour la ligne de suivi Simulassur du dossier. */
export async function majSuivi(
  supabase: Sb,
  dossierId: string,
  clientId: string | null,
  userId: string,
  champs: Record<string, unknown>,
) {
  const { data } = await supabase
    .from("simulassur_dossiers")
    .select("id")
    .eq("dossier_id", dossierId)
    .maybeSingle();
  if (data?.id) {
    await supabase.from("simulassur_dossiers").update(champs).eq("id", data.id);
    return data.id as string;
  }
  const { data: cree, error } = await supabase
    .from("simulassur_dossiers")
    .insert({ dossier_id: dossierId, client_id: clientId, created_by: userId, ...champs })
    .select("id")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return cree?.id as string;
}
