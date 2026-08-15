/**
 * Module Tarification (EZ API Néoliane) — SERVEUR UNIQUEMENT.
 *
 * Deux niveaux :
 *  - `appelerTarification` : appel générique paramétrable (écran de diagnostic) ;
 *  - `tariferDossierNeoliane` : flux réel de toutes les branches couvertes
 *      1. POST /neoverse/public/profile            → profile_id
 *      2. POST /neoverse/public/profile/{id}/generateprices
 *      3. création des lignes dossier_devis (source = 'api').
 */

import { neolianeRequest } from "./client.server";
import {
  brancheTarifableNeoliane,
  construireProfilNeoliane,
  produitsNeolianePourDossier,
} from "./branches";
import { personnesAssurees } from "../recueil-besoins-schemas";

export const DEFAULT_TARIF_PATH = "/neoverse/public/ez/tarification";
export const NEOLIANE_PROFILE_PATH = "/neoverse/public/profile";

export interface TarificationInput {
  /** Chemin d'appel (surcharge la valeur par défaut / le secret). */
  path?: string | undefined;
  /** Payload métier envoyé à Néoliane. */
  payload: Record<string, unknown>;
  /** Certains endpoints EZ exigent le userApiKey dans le payload. */
  withUserApiKey?: boolean;
}

export function tarificationPath(override?: string | undefined) {
  return (override || process.env["NEOLIANE_TARIF_PATH"] || DEFAULT_TARIF_PATH).trim();
}

export async function appelerTarification(input: TarificationInput) {
  const res = await neolianeRequest({
    path: tarificationPath(input.path),
    method: "POST",
    payload: input.payload,
    withUserApiKey: input.withUserApiKey ?? true,
  });
  return {
    ok: res.ok,
    status: res.status,
    authMode: res.authMode,
    resultat: JSON.stringify(res.data ?? null),
  };
}

/* ------------------------------------------------------------------ */
/* Branche santé — flux réel                                          */
/* ------------------------------------------------------------------ */

/** Régimes du recueil → valeurs attendues par Néoliane. */
const REGIME_NEOLIANE: Record<string, string> = {
  salarie: "employee",
  tns: "selfEmployed",
  fonctionnaire: "civilServant",
  exploitant_agricole: "farmer",
  etudiant: "student",
  sans_emploi: "unemployed",
  alsace_moselle: "alsaceMoselle",
};

/** 1er jour du mois suivant, au format AAAA-MM-JJ. */
export function dateEffetParDefaut(from = new Date()): string {
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 1));
  return d.toISOString().slice(0, 10);
}

export interface ProfileHealthMember {
  socialSecurityScheme: string;
  birthYear: number;
  familyMember: string;
}

/** Construit `profileHealth` depuis les assurés du recueil santé. */
export function construireProfileHealth(recueil: unknown): ProfileHealthMember[] {
  const values = (recueil ?? {}) as Record<string, unknown>;
  const personnes = personnesAssurees(values["assures"]);
  const membres: ProfileHealthMember[] = [];
  let enfants = 0;
  let principalFait = false;

  for (const p of personnes) {
    const annee = Number((p.date_naissance || "").slice(0, 4));
    if (!annee || Number.isNaN(annee)) continue;

    let familyMember: string;
    if (p.lien === "conjoint") familyMember = "spouse";
    else if (p.lien === "soi_meme" && !principalFait) {
      familyMember = "holder";
      principalFait = true;
    } else {
      if (enfants > 4) continue;
      familyMember = `child.${enfants}`;
      enfants += 1;
    }

    membres.push({
      familyMember,
      birthYear: annee,
      socialSecurityScheme: REGIME_NEOLIANE[p.regime] ?? "employee",
    });
  }
  return membres;
}

type PriceLigne = {
  id?: string | number;
  label?: string;
  formulaLabel?: string;
  gammeLabel?: string;
  amount?: number | string;
  gammeId?: string | number;
  formulaId?: string | number;
  repartition?: unknown;
};

function extraireTarifs(data: unknown): PriceLigne[] {
  if (Array.isArray(data)) return data as PriceLigne[];
  const o = (data ?? {}) as Record<string, unknown>;
  for (const k of ["data", "result", "results", "products", "prices", "sante"]) {
    const v = o[k];
    if (Array.isArray(v)) return v as PriceLigne[];
    if (v && typeof v === "object") {
      const nested = extraireTarifs(v);
      if (nested.length) return nested;
    }
  }
  return [];
}

function messageApi(prefixe: string, status: number, data: unknown): string {
  let detail = "";
  try {
    detail = typeof data === "string" ? data : JSON.stringify(data);
  } catch {
    detail = "";
  }
  return `${prefixe} (HTTP ${status})${detail ? ` — ${detail.slice(0, 400)}` : ""}`;
}

export interface TariferDossierInput {
  dossierId: string;
  /** Date d'effet AAAA-MM-JJ ; par défaut le 1er du mois suivant. */
  dateEffet?: string | undefined;
}

/**
 * Flux complet, toutes branches couvertes par Néoliane :
 * profil (santé, prévoyance, GAV, PJ, animaux, nomade, emprunteur) → tarifs →
 * devis du dossier.
 */
export async function tariferDossierNeoliane(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  input: TariferDossierInput,
  userId: string,
) {
  const { data: dos, error: errDos } = await supabase
    .from("dossiers")
    .select("id, type_assurance, recueil_besoins, client_id")
    .eq("id", input.dossierId)
    .maybeSingle();
  if (errDos) throw new Error(errDos.message);
  if (!dos) throw new Error("Dossier introuvable.");

  const branche = String(dos.type_assurance ?? "");
  if (!brancheTarifableNeoliane(branche)) {
    throw new Error(
      "Cette branche n'est pas tarifiée par l'API Néoliane : saisissez les devis manuellement.",
    );
  }

  const types = produitsNeolianePourDossier(branche, dos.recueil_besoins);
  const profil = construireProfilNeoliane(branche, dos.recueil_besoins);
  if (!profil) {
    throw new Error(
      branche === "animaux"
        ? "Recueil incomplet : renseignez l'espèce et la date de naissance de l'animal avant de tarifer."
        : "Aucun assuré exploitable dans le recueil des besoins : renseignez au moins une personne avec sa date de naissance.",
    );
  }

  let zipCode = "";
  if (dos.client_id) {
    const { data: cli } = await supabase
      .from("clients")
      .select("code_postal")
      .eq("id", dos.client_id)
      .maybeSingle();
    zipCode = (cli?.code_postal ?? "").toString().trim();
  }
  if (!/^\d{5}$/.test(zipCode)) {
    throw new Error(
      "Code postal du client absent ou invalide : complétez la fiche client avant de tarifer.",
    );
  }

  const dateEffect = /^\d{4}-\d{2}-\d{2}$/.test(input.dateEffet ?? "")
    ? (input.dateEffet as string)
    : dateEffetParDefaut();

  // 1) Création du profil
  const profil0 = await neolianeRequest<Record<string, unknown>>({
    path: NEOLIANE_PROFILE_PATH,
    method: "POST",
    payload: {
      zipCode,
      dateEffect,
      productType: types[0],
      ...(profil.profileHealth ? { profileHealth: profil.profileHealth } : {}),
      ...(profil.profileMembers ? { profileMembers: profil.profileMembers } : {}),
      ...(profil.pet ? { pet: { ...profil.pet, zipCode, dateEffect } } : {}),
    },
    withUserApiKey: true,
  });
  if (!profil0.ok) {
    throw new Error(messageApi("Création du profil Néoliane refusée", profil0.status, profil0.data));
  }
  const pd = (profil0.data ?? {}) as Record<string, unknown>;
  const profileId =
    (pd["id"] as string | number | undefined) ??
    ((pd["data"] as Record<string, unknown> | undefined)?.["id"] as string | number | undefined);
  if (profileId === undefined || profileId === null || profileId === "") {
    throw new Error(
      messageApi("Réponse Néoliane sans identifiant de profil", profil0.status, profil0.data),
    );
  }

  // 2) Génération des tarifs pour tous les produits de la branche
  const prix = await neolianeRequest<unknown>({
    path: `${NEOLIANE_PROFILE_PATH}/${profileId}/generateprices`,
    method: "POST",
    payload: {
      types,
      ...(profil.profileMembers ? { profileMembers: profil.profileMembers } : {}),
      ...(profil.pet ? { pet: { ...profil.pet, zipCode, dateEffect } } : {}),
    },
  });
  if (!prix.ok) {
    throw new Error(messageApi("Génération des tarifs Néoliane refusée", prix.status, prix.data));
  }

  const tarifs = extraireTarifs(prix.data);
  if (tarifs.length === 0) {
    throw new Error(
      "Néoliane n'a retourné aucun tarif pour ce profil (zone géographique non couverte, régime ou produit non éligible).",
    );
  }

  const montant = (l: PriceLigne) => {
    const n = Number(l.amount);
    return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY;
  };
  const retenus = [...tarifs].sort((a, b) => montant(a) - montant(b)).slice(0, 5);

  // 3) Création des devis comparés
  const { data: comp } = await supabase
    .from("compagnies")
    .select("id")
    .ilike("nom", "%oliane%")
    .limit(1)
    .maybeSingle();
  const compagnieId = (comp?.id as string | undefined) ?? null;

  const { resoudreAssureursPorteurs } = await import("@/lib/devis-assureur-porteur.server");
  const porteurs = await resoudreAssureursPorteurs(
    supabase,
    compagnieId,
    retenus.map((l) => ({ libelleProduit: (l.gammeLabel ?? l.label ?? "").toString() })),
  );

  const lignes = retenus.map((l, i) => {
    const gamme = (l.gammeLabel ?? l.label ?? "Néoliane").toString();
    const formule = (l.formulaLabel ?? "").toString();
    const m = montant(l);
    return {
      dossier_id: input.dossierId,
      compagnie_id: compagnieId,
      produit_id: null,
      formule_id: null,
      assureur_porteur: porteurs[i] ?? null,
      cotisation_mensuelle: Number.isFinite(m) ? m : null,
      garanties_resume: formule ? `${gamme} — formule ${formule}` : gamme,
      source: "api",
      saisi_par: userId,
    };
  });

  const { error: errIns } = await supabase.from("dossier_devis").insert(lignes);
  if (errIns) throw new Error(errIns.message);

  return {
    profileId: String(profileId),
    branche,
    produits: types,
    dateEffet: dateEffect,
    nbAssures: profil.pet ? 1 : (profil.profileHealth ?? profil.profileMembers ?? []).length,
    nbTarifs: tarifs.length,
    nbDevisCrees: lignes.length,
    compagnieTrouvee: !!compagnieId,
  };
}
