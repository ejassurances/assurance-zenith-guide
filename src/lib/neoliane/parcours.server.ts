/**
 * Machine d'état du parcours Néoliane (§4 du cahier d'intégration) —
 * SERVEUR UNIQUEMENT.
 *
 * Chaque étape n'est franchissable que si la précédente a réussi ET que les
 * identifiants Néoliane ont été persistés dans `neoliane_parcours`.
 */

import {
  creerOffre,
  creerPanier,
  creerProfil,
  deposerDocumentsSignes,
  finaliserOffre,
  genererPrix,
  lireChampsOffre,
  lireChoixPrelevement,
  lireDocumentsSignature,
  lireInfosResiliation,
  lirePanier,
  lireProduitsCouplables,
  majOffre,
  remplacerPanier,
  validerOffre,
  type CreerProfilInput,
  type DocumentSigne,
  type LignePanier,
  type OffreInput,
  type ProfileMember,
} from "./api.server";
import { messageTechnique, reduireReponseNeoliane } from "./redaction";
import type { EtapeParcours } from "./referentiels";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Sb = any;

export interface Parcours {
  id: string;
  dossier_id: string | null;
  client_id: string | null;
  product_type: string;
  date_effet: string | null;
  profile_id: string | null;
  cart_id: string | null;
  offer_id: string | null;
  contract_ids: string[];
  pricing_ids: unknown;
  etape: string;
  statut: string;
  avertissements: unknown;
  derniere_erreur: string | null;
}

const ORDRE: EtapeParcours[] = [
  "profil",
  "tarifs",
  "panier",
  "offre",
  "finalisation",
  "documents",
  "depot_signature",
  "validation",
  "termine",
];

function rangEtape(e: string) {
  const i = ORDRE.indexOf(e as EtapeParcours);
  return i < 0 ? 0 : i;
}

/** Avance l'étape sans jamais régresser. */
function etapeMax(actuelle: string, cible: EtapeParcours) {
  return rangEtape(cible) > rangEtape(actuelle) ? cible : actuelle;
}

export async function chargerParcours(sb: Sb, id: string): Promise<Parcours> {
  const { data, error } = await sb.from("neoliane_parcours").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Parcours Néoliane introuvable.");
  return data as Parcours;
}

export async function parcoursDuDossier(sb: Sb, dossierId: string): Promise<Parcours | null> {
  const { data, error } = await sb
    .from("neoliane_parcours")
    .select("*")
    .eq("dossier_id", dossierId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as Parcours | null) ?? null;
}

/**
 * Écriture du parcours. Minimisation RGPD centralisée ici : les réponses
 * Néoliane et les avertissements sont réduits aux identifiants techniques, et
 * les erreurs à un diagnostic court, avant toute persistance.
 */
async function majParcours(sb: Sb, id: string, patch: Record<string, unknown>) {
  const nettoye: Record<string, unknown> = { ...patch };
  if ("derniere_reponse" in nettoye) {
    nettoye["derniere_reponse"] = reduireReponseNeoliane(nettoye["derniere_reponse"]);
  }
  if ("avertissements" in nettoye) {
    nettoye["avertissements"] = reduireReponseNeoliane(nettoye["avertissements"]);
  }
  if (typeof nettoye["derniere_erreur"] === "string") {
    nettoye["derniere_erreur"] = messageTechnique(nettoye["derniere_erreur"] as string);
  }
  const { data, error } = await sb
    .from("neoliane_parcours")
    .update(nettoye)
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as Parcours;
}

async function enregistrerErreur(sb: Sb, id: string, e: unknown) {
  const message = messageTechnique((e as Error)?.message ?? "Erreur inconnue");
  await sb.from("neoliane_parcours").update({ derniere_erreur: message }).eq("id", id);
  return message;
}


/** Exécute une étape en journalisant l'erreur éventuelle sur le parcours. */
async function etape<T>(sb: Sb, id: string, fn: () => Promise<T>): Promise<T> {
  try {
    const r = await fn();
    await sb.from("neoliane_parcours").update({ derniere_erreur: null }).eq("id", id);
    return r;
  } catch (e) {
    throw new Error(await enregistrerErreur(sb, id, e));
  }
}

/* ------------------------------------------------------------------ */
/* Étape 2 — profil                                                   */
/* ------------------------------------------------------------------ */

export interface DemarrerInput {
  dossierId?: string | null;
  clientId?: string | null;
  productType: string;
  zipCode: string;
  dateEffect: string;
  profileHealth?: ProfileMember[];
  profileMembers?: ProfileMember[];
  pet?: Record<string, unknown>;
}

/** Crée (ou recrée) le profil Néoliane et ouvre un parcours persistant. */
export async function demarrerParcours(sb: Sb, input: DemarrerInput, userId: string) {
  const { data: cree, error } = await sb
    .from("neoliane_parcours")
    .insert({
      dossier_id: input.dossierId ?? null,
      client_id: input.clientId ?? null,
      product_type: input.productType,
      date_effet: input.dateEffect,
      cree_par: userId,
      etape: "profil",
      statut: "en_cours",
    })
    .select("*")
    .maybeSingle();
  if (error) throw new Error(error.message);
  const parcours = cree as Parcours;

  const payload: CreerProfilInput = {
    zipCode: input.zipCode,
    dateEffect: input.dateEffect,
    productType: input.productType,
    ...(input.profileHealth ? { profileHealth: input.profileHealth } : {}),
    ...(input.profileMembers ? { profileMembers: input.profileMembers } : {}),
    ...(input.pet ? { pet: input.pet } : {}),
  };

  const { profileId, reponse } = await etape(sb, parcours.id, () => creerProfil(payload));
  return await majParcours(sb, parcours.id, {
    profile_id: profileId,
    etape: "profil",
    derniere_reponse: reponse as unknown,
  });
}

/* ------------------------------------------------------------------ */
/* Étape 3 — tarifs                                                   */
/* ------------------------------------------------------------------ */

/**
 * Génère les tarifs. Attention : une nouvelle génération peut invalider les
 * pricingId précédents et vider le panier → on réinitialise l'état local.
 */
export async function genererTarifs(
  sb: Sb,
  parcoursId: string,
  payload: { types?: string[]; profileMembers?: ProfileMember[]; pet?: Record<string, unknown> },
) {
  const p = await chargerParcours(sb, parcoursId);
  if (!p.profile_id) throw new Error("Le profil Néoliane n'a pas encore été créé.");
  const data = await etape(sb, p.id, () => genererPrix(p.profile_id as string, payload));
  await majParcours(sb, p.id, {
    etape: etapeMax(p.etape, "tarifs"),
    cart_id: null,
    pricing_ids: [],
    derniere_reponse: data as unknown,
  });
  return data;
}

/* ------------------------------------------------------------------ */
/* Étapes 4/5 — panier et données dynamiques                          */
/* ------------------------------------------------------------------ */

function extraireCartId(panier: unknown): string | null {
  const o = (panier ?? {}) as Record<string, unknown>;
  const v = o["cartId"] ?? o["id"] ?? null;
  return v === null || v === "" ? null : String(v);
}

export async function composerPanier(
  sb: Sb,
  parcoursId: string,
  produits: LignePanier[],
  remplacer = false,
) {
  const p = await chargerParcours(sb, parcoursId);
  if (!p.profile_id) throw new Error("Le profil Néoliane n'a pas encore été créé.");
  if (rangEtape(p.etape) < rangEtape("tarifs")) {
    throw new Error("Générez les tarifs avant de composer le panier.");
  }
  const panier = await etape(sb, p.id, () =>
    remplacer || p.cart_id
      ? remplacerPanier(p.profile_id as string, produits)
      : creerPanier(p.profile_id as string, produits),
  );
  await majParcours(sb, p.id, {
    cart_id: extraireCartId(panier),
    pricing_ids: produits.map((x) => x.pricingId),
    etape: etapeMax(p.etape, "panier"),
    derniere_reponse: panier as unknown,
  });
  // Le panier retourné est la source de vérité (ajustements automatiques).
  return panier;
}

export async function consulterPanier(sb: Sb, parcoursId: string) {
  const p = await chargerParcours(sb, parcoursId);
  if (!p.profile_id) throw new Error("Profil Néoliane absent.");
  return await lirePanier(p.profile_id);
}

export async function produitsCouplables(sb: Sb, parcoursId: string) {
  const p = await chargerParcours(sb, parcoursId);
  if (!p.profile_id) throw new Error("Profil Néoliane absent.");
  return await lireProduitsCouplables(p.profile_id);
}

export async function donneesDynamiques(sb: Sb, parcoursId: string) {
  const p = await chargerParcours(sb, parcoursId);
  if (!p.profile_id) throw new Error("Profil Néoliane absent.");
  const champs = await lireChampsOffre(p.profile_id);
  const resiliation = await lireInfosResiliation(p.profile_id).catch(() => null);
  const prelevements = p.cart_id
    ? await lireChoixPrelevement(p.profile_id).catch((e) => ({ erreur: (e as Error).message }))
    : { erreur: "Panier non créé : options de prélèvement indisponibles." };
  return { champs, resiliation, prelevements };
}

/* ------------------------------------------------------------------ */
/* Étape 6 — offre                                                    */
/* ------------------------------------------------------------------ */

export async function enregistrerOffre(
  sb: Sb,
  parcoursId: string,
  corps: Omit<OffreInput, "profileId">,
) {
  const p = await chargerParcours(sb, parcoursId);
  if (!p.profile_id) throw new Error("Profil Néoliane absent.");
  if (rangEtape(p.etape) < rangEtape("panier")) {
    throw new Error("Composez le panier avant de créer l'offre.");
  }
  const res = await etape(sb, p.id, () =>
    p.offer_id
      ? majOffre(p.offer_id, { ...corps, profileId: p.profile_id as string })
      : creerOffre({ ...corps, profileId: p.profile_id as string }),
  );

  await majParcours(sb, p.id, {
    ...(res.offerId ? { offer_id: res.offerId } : {}),
    ...(res.contractIds.length ? { contract_ids: res.contractIds } : {}),
    avertissements: res.avertissements,
    // Les erreurs bloquantes n'autorisent pas le passage à l'étape suivante.
    etape: res.ok && res.erreurs.length === 0 ? etapeMax(p.etape, "offre") : p.etape,
    derniere_erreur: res.erreurs.length ? JSON.stringify(res.erreurs).slice(0, 800) : null,
    derniere_reponse: res.reponse as unknown,
  });
  return res;
}

/* ------------------------------------------------------------------ */
/* Étapes 7 à 10 — signature                                          */
/* ------------------------------------------------------------------ */

export async function finaliser(sb: Sb, parcoursId: string, signType = "handSign") {
  const p = await chargerParcours(sb, parcoursId);
  if (!p.offer_id) throw new Error("Aucune offre Néoliane à finaliser.");
  if (rangEtape(p.etape) < rangEtape("offre")) {
    throw new Error("Complétez l'offre avant de la finaliser.");
  }
  const data = await etape(sb, p.id, () => finaliserOffre(p.offer_id as string, signType));
  await majParcours(sb, p.id, {
    etape: etapeMax(p.etape, "finalisation"),
    derniere_reponse: data as unknown,
  });
  return data;
}

/** Récupère les documents préremplis (Base64) — jamais stockés en clair ici. */
export async function documentsASigner(sb: Sb, parcoursId: string) {
  const p = await chargerParcours(sb, parcoursId);
  if (!p.offer_id) throw new Error("Aucune offre Néoliane.");
  if (rangEtape(p.etape) < rangEtape("finalisation")) {
    throw new Error("Finalisez l'offre avant de récupérer les documents.");
  }
  const data = await etape(sb, p.id, () => lireDocumentsSignature(p.offer_id as string));
  await majParcours(sb, p.id, { etape: etapeMax(p.etape, "documents") });
  return data;
}

export async function deposerSignatures(sb: Sb, parcoursId: string, documents: DocumentSigne[]) {
  const p = await chargerParcours(sb, parcoursId);
  if (!p.offer_id) throw new Error("Aucune offre Néoliane.");
  if (rangEtape(p.etape) < rangEtape("documents")) {
    throw new Error("Récupérez les documents avant de déposer les versions signées.");
  }
  const inconnus = documents
    .map((d) => d.contractId)
    .filter((c) => p.contract_ids.length > 0 && !p.contract_ids.includes(c));
  if (inconnus.length) {
    throw new Error(`Contrat(s) inconnu(s) pour cette offre : ${inconnus.join(", ")}`);
  }
  const data = await etape(sb, p.id, () => deposerDocumentsSignes(p.offer_id as string, documents));
  await majParcours(sb, p.id, {
    etape: etapeMax(p.etape, "depot_signature"),
    derniere_reponse: data as unknown,
  });
  return data;
}

export async function validerSouscription(sb: Sb, parcoursId: string) {
  const p = await chargerParcours(sb, parcoursId);
  if (!p.offer_id) throw new Error("Aucune offre Néoliane.");
  if (rangEtape(p.etape) < rangEtape("depot_signature")) {
    throw new Error("Déposez les documents signés avant de valider.");
  }
  const res = await validerOffre(p.offer_id);
  const termine = res.ok && (!Array.isArray(res.erreurs) || res.erreurs.length === 0);
  await majParcours(sb, p.id, {
    etape: termine ? "termine" : etapeMax(p.etape, "validation"),
    statut: termine ? "valide" : "en_cours",
    derniere_erreur: termine ? null : JSON.stringify(res.erreurs).slice(0, 800),
    derniere_reponse: res.reponse as unknown,
  });
  return res;
}
