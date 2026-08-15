/**
 * Catalogue complet des opérations EZ API / EZ Gestion Néoliane (§5 du cahier
 * d'intégration) — SERVEUR UNIQUEMENT.
 *
 * Toutes les fonctions passent par `neolianeRequest` (client unique :
 * authentification, cache de token, injection du userApiKey, normalisation des
 * erreurs). Aucun appel ne doit être fait depuis le navigateur.
 *
 * Journalisation : chaque appel produit une ligne technique avec identifiant de
 * corrélation, méthode, chemin, durée et code HTTP. Jamais de secret, d'IBAN,
 * de NIR ni de contenu Base64.
 */

import { neolianeRequest, type NeolianeResponse } from "./client.server";
import { readNeolianeCredentials } from "./config";
import { diagnosticErreur, masquerSecret } from "./redaction";
import type { EventName, FamilyMember, ProductType, SocialSecurityScheme } from "./referentiels";

export const EZ = "/neoverse/public";

function correlationId() {
  return `neo_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

interface AppelOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  payload?: Record<string, unknown> | undefined;
  withUserApiKey?: boolean;
  /** Chemin affiché dans les logs lorsque le chemin réel contient un secret. */
  logPath?: string;
}

/** Appel journalisé et normalisé vers l'API Néoliane. */
export async function appel<T = unknown>(
  path: string,
  options: AppelOptions = {},
): Promise<NeolianeResponse<T>> {
  const cid = correlationId();
  const debut = Date.now();
  const method = options.method ?? "GET";
  const pathLog = options.logPath ?? path;
  try {
    const res = await neolianeRequest<T>({
      path: `${EZ}${path}`,
      method,
      ...(options.payload !== undefined ? { payload: options.payload } : {}),
      withUserApiKey: options.withUserApiKey ?? false,
    });
    console.info(
      `[neoliane] ${cid} ${method} ${pathLog} → ${res.status} (${Date.now() - debut} ms, auth=${res.authMode})`,
    );
    return res;
  } catch (e) {
    console.error(
      `[neoliane] ${cid} ${method} ${pathLog} → échec en ${Date.now() - debut} ms : ${
        (e as Error)?.name ?? "Error"
      }`,
    );
    throw e;
  }
}

/**
 * Diagnostic technique d'une réponse en erreur : codes et libellés d'erreur
 * uniquement, sans le corps brut ni les valeurs de champs rejetées.
 */
export function messageErreurApi(prefixe: string, res: NeolianeResponse<unknown>): string {
  return diagnosticErreur(prefixe, res.status, res.data);
}

/** Renvoie la donnée utile, ou lève une erreur explicite. */
export function exiger<T>(prefixe: string, res: NeolianeResponse<T>): T {
  if (!res.ok) throw new Error(messageErreurApi(prefixe, res));
  return res.data;
}

/** Déballe `{ data: ... }` lorsque Néoliane encapsule la réponse. */
export function deballer(data: unknown): unknown {
  const o = data as Record<string, unknown> | null;
  if (o && typeof o === "object" && !Array.isArray(o) && "data" in o) return o["data"];
  return data;
}

/* ------------------------------------------------------------------ */
/* 2. Authentification / clé utilisateur                              */
/* ------------------------------------------------------------------ */

/** Valide la userApiKey et récupère le sousCode associé. */
export async function validerUserApiKey() {
  const { userApiKey } = readNeolianeCredentials();
  if (!userApiKey) throw new Error("NEOLIANE_USER_API_KEY absent.");
  const res = await appel<{ isValid?: boolean; sousCode?: string }>(
    `/user/api-key/${encodeURIComponent(userApiKey)}/validation`,
    // La clé ne doit jamais apparaître dans les journaux.
    { method: "POST", logPath: `/user/api-key/${masquerSecret(userApiKey)}/validation` },
  );
  const d = (deballer(res.data) ?? {}) as { isValid?: boolean; sousCode?: string };
  return { ok: res.ok, status: res.status, isValid: !!d.isValid, sousCode: d.sousCode ?? null };
}


/* ------------------------------------------------------------------ */
/* 5.1 Tarification et panier                                         */
/* ------------------------------------------------------------------ */

export interface ProfileMember {
  socialSecurityScheme: SocialSecurityScheme | string;
  birthYear: number;
  familyMember: FamilyMember | string;
}

export interface PetProfile {
  birthDate?: string;
  zipCode?: string;
  dateEffect?: string;
  /** 1 = chat, 2 = chien. */
  species?: number;
  formula?: string | number;
  [k: string]: unknown;
}

export interface CreerProfilInput {
  zipCode: string;
  dateEffect: string;
  productType: ProductType | string;
  profileHealth?: ProfileMember[];
  /** Prévoyance / couplages : membres concernés. */
  profileMembers?: ProfileMember[];
  pet?: PetProfile;
  [k: string]: unknown;
}

/** POST /profile — crée le profil et retourne le profileId. */
export async function creerProfil(input: CreerProfilInput) {
  const res = await appel<Record<string, unknown>>("/profile", {
    method: "POST",
    payload: input,
    withUserApiKey: true,
  });
  exiger("Création du profil Néoliane refusée", res);
  const d = (deballer(res.data) ?? {}) as Record<string, unknown>;
  const profileId = d["id"] ?? d["profileId"];
  if (profileId === undefined || profileId === null || profileId === "") {
    throw new Error(messageErreurApi("Réponse Néoliane sans identifiant de profil", res));
  }
  return { profileId: String(profileId), reponse: d };
}

/** POST /profile/{id}/generateprices — génère les tarifs. */
export async function genererPrix(
  profileId: string,
  payload: {
    types?: string[];
    profileMembers?: ProfileMember[];
    pet?: PetProfile;
    [k: string]: unknown;
  },
) {
  const res = await appel<unknown>(`/profile/${profileId}/generateprices`, {
    method: "POST",
    payload,
  });
  exiger("Génération des tarifs Néoliane refusée", res);
  return deballer(res.data);
}

/** GET /profile/{id}/prices — produits couplables au panier courant. */
export async function lireProduitsCouplables(profileId: string) {
  const res = await appel<unknown>(`/profile/${profileId}/prices`, { method: "GET" });
  exiger("Lecture des produits couplables refusée", res);
  return deballer(res.data);
}

export interface LignePanier {
  pricingId: string | number;
  /** Membres concernés (obligatoire en prévoyance / couplage). */
  members?: (FamilyMember | string)[];
  [k: string]: unknown;
}

/** POST /profile/{id}/cart — création du panier. */
export async function creerPanier(profileId: string, produits: LignePanier[]) {
  const res = await appel<unknown>(`/profile/${profileId}/cart`, {
    method: "POST",
    payload: { products: produits },
  });
  exiger("Création du panier Néoliane refusée", res);
  return deballer(res.data);
}

/**
 * PUT /profile/{id}/cart — remplacement TOTAL du panier : il faut renvoyer
 * l'intégralité des produits conservés (un payload vide vide le panier).
 */
export async function remplacerPanier(profileId: string, produits: LignePanier[]) {
  const res = await appel<unknown>(`/profile/${profileId}/cart`, {
    method: "PUT",
    payload: { products: produits },
  });
  exiger("Remplacement du panier Néoliane refusé", res);
  return deballer(res.data);
}

/** GET /profile/{id}/cart — état réel du panier (source de vérité). */
export async function lirePanier(profileId: string) {
  const res = await appel<unknown>(`/profile/${profileId}/cart`, { method: "GET" });
  exiger("Lecture du panier Néoliane refusée", res);
  return deballer(res.data);
}

/** POST /profile/{id}/pricing/{pricingId}/quotation/generate — devis PDF. */
export async function genererDevis(
  profileId: string,
  pricingId: string,
  identite: {
    civility: string;
    lastname: string;
    firstname: string;
    address: string;
    zipCode?: string;
    city?: string;
    email: string;
    [k: string]: unknown;
  },
) {
  const res = await appel<unknown>(
    `/profile/${profileId}/pricing/${pricingId}/quotation/generate`,
    {
      method: "POST",
      payload: { ...identite, b64: true },
    },
  );
  exiger("Génération du devis Néoliane refusée", res);
  return deballer(res.data);
}

/** GET /product/formulas-pet — formules Chien / Chat. */
export async function lireFormulesAnimal() {
  const res = await appel<unknown>("/product/formulas-pet", { method: "GET" });
  exiger("Lecture des formules Chien/Chat refusée", res);
  return deballer(res.data);
}

/** GET /product/{id}/documents?documentType=sales-documents — éditique. */
export async function lireSupportsDeVente(productId: string) {
  const res = await appel<unknown>(`/product/${productId}/documents?documentType=sales-documents`, {
    method: "GET",
  });
  exiger("Lecture des supports de vente refusée", res);
  return deballer(res.data);
}

/* ------------------------------------------------------------------ */
/* 5.2 Souscription                                                   */
/* ------------------------------------------------------------------ */

/** GET /profile/{id}/offer/fields — champs métier dynamiques. */
export async function lireChampsOffre(profileId: string) {
  const res = await appel<unknown>(`/profile/${profileId}/offer/fields`, { method: "GET" });
  exiger("Lecture des champs d'offre refusée", res);
  return deballer(res.data);
}

/** GET /profile/{id}/lrinfos — motifs et compagnies de résiliation. */
export async function lireInfosResiliation(profileId: string) {
  const res = await appel<unknown>(`/profile/${profileId}/lrinfos`, { method: "GET" });
  exiger("Lecture des informations de résiliation refusée", res);
  return deballer(res.data);
}

/** GET /profile/{id}/prelevementchoices — exige un panier existant. */
export async function lireChoixPrelevement(profileId: string) {
  const res = await appel<unknown>(`/profile/${profileId}/prelevementchoices`, { method: "GET" });
  if (res.status === 400) {
    throw new Error(
      "Les options de prélèvement ne sont disponibles qu'après création du panier : revenez à l'étape panier.",
    );
  }
  exiger("Lecture des options de prélèvement refusée", res);
  return deballer(res.data);
}

export interface OffreInput {
  profileId: string;
  prospectType?: string;
  brokerageFeeAmount?: number;
  sousCode?: string;
  persons?: unknown[];
  bank?: Record<string, unknown>;
  address?: Record<string, unknown>;
  cancellation?: unknown[];
  pet?: Record<string, unknown>;
  funeral?: Record<string, unknown>;
  [k: string]: unknown;
}

export interface ResultatOffre {
  ok: boolean;
  status: number;
  offerId: string | null;
  contractIds: string[];
  avertissements: unknown[];
  erreurs: unknown[];
  reponse: unknown;
}

function analyserRetourOffre(res: NeolianeResponse<unknown>): ResultatOffre {
  const d = (deballer(res.data) ?? {}) as Record<string, unknown>;
  const offerId = (d["offerId"] ?? d["id"] ?? null) as string | number | null;
  const contrats = (d["contracts"] ?? d["contractId"] ?? d["contractIds"] ?? []) as unknown;
  const contractIds: string[] = Array.isArray(contrats)
    ? contrats
        .map((c) => {
          if (c && typeof c === "object") {
            const o = c as Record<string, unknown>;
            return String(o["contractId"] ?? o["id"] ?? "");
          }
          return String(c);
        })
        .filter(Boolean)
    : contrats
      ? [String(contrats)]
      : [];
  const avertissements = (d["warnings"] ?? []) as unknown[];
  const erreurs = (d["errors"] ?? (res.ok ? [] : [res.data])) as unknown[];
  return {
    ok: res.ok,
    status: res.status,
    offerId: offerId === null || offerId === "" ? null : String(offerId),
    contractIds,
    avertissements: Array.isArray(avertissements) ? avertissements : [avertissements],
    erreurs: Array.isArray(erreurs) ? erreurs : [erreurs],
    reponse: d,
  };
}

/** POST /offer — crée l'offre à partir du profileId. */
export async function creerOffre(input: OffreInput): Promise<ResultatOffre> {
  const res = await appel<unknown>("/offer", { method: "POST", payload: input });
  return analyserRetourOffre(res);
}

/** PUT /offer/{offerId} — complète l'offre (mêmes retours que la création). */
export async function majOffre(
  offerId: string,
  input: Partial<OffreInput>,
): Promise<ResultatOffre> {
  const res = await appel<unknown>(`/offer/${offerId}`, {
    method: "PUT",
    payload: input as Record<string, unknown>,
  });
  return analyserRetourOffre(res);
}

/** GET /offer/{offerId} — relit l'offre. */
export async function lireOffre(offerId: string) {
  const res = await appel<unknown>(`/offer/${offerId}`, { method: "GET" });
  exiger("Lecture de l'offre refusée", res);
  return deballer(res.data);
}

/* ------------------------------------------------------------------ */
/* 5.3 Signature                                                      */
/* ------------------------------------------------------------------ */

/** POST /offer/{offerId}/finalize — verrouille l'offre (succès HTTP 201). */
export async function finaliserOffre(offerId: string, signType = "handSign") {
  const res = await appel<unknown>(`/offer/${offerId}/finalize`, {
    method: "POST",
    payload: { signType },
  });
  exiger("Finalisation de l'offre refusée", res);
  return deballer(res.data);
}

/** GET /offer/{offerId}/signature/documents — BA, SEPA, mandat (Base64). */
export async function lireDocumentsSignature(offerId: string) {
  const res = await appel<unknown>(`/offer/${offerId}/signature/documents`, { method: "GET" });
  exiger("Récupération des documents de signature refusée", res);
  return deballer(res.data);
}

export interface DocumentSigne {
  contractId: string;
  ba?: string;
  sepa?: string;
  resiliation?: { familyMember: string; file: string }[];
}

/** POST /offer/{offerId}/signature/documents — dépôt des documents signés. */
export async function deposerDocumentsSignes(offerId: string, documents: DocumentSigne[]) {
  const res = await appel<unknown>(`/offer/${offerId}/signature/documents`, {
    method: "POST",
    payload: { fileType: "base64", documents },
  });
  exiger("Dépôt des documents signés refusé", res);
  return deballer(res.data);
}

/** POST /offer/{offerId}/validate — validation contrat par contrat. */
export async function validerOffre(offerId: string) {
  const res = await appel<unknown>(`/offer/${offerId}/validate`, { method: "POST", payload: {} });
  const d = (deballer(res.data) ?? {}) as Record<string, unknown>;
  return {
    ok: res.ok,
    status: res.status,
    contratsValides: (d["contracts"] ?? d["validated"] ?? []) as unknown,
    erreurs: (d["errors"] ?? (res.ok ? [] : [res.data])) as unknown,
    reponse: d,
  };
}

/* ------------------------------------------------------------------ */
/* 5.4 EZ Gestion : abonnements et rafraîchissement                   */
/* ------------------------------------------------------------------ */

/** POST /ezflow/subscribe — un appel par type d'événement. */
export async function abonnerEvenement(eventName: EventName | string, callback: string) {
  const res = await appel<unknown>("/ezflow/subscribe", {
    method: "POST",
    payload: { eventName, callback },
  });
  exiger("Création de l'abonnement EZ Gestion refusée", res);
  return deballer(res.data);
}

/** GET /ezflow — abonnements existants et types manquants. */
export async function listerAbonnements() {
  const res = await appel<unknown>("/ezflow", { method: "GET" });
  exiger("Lecture des abonnements EZ Gestion refusée", res);
  return deballer(res.data);
}

/** DELETE /ezflow/{id} */
export async function supprimerAbonnement(id: string) {
  const res = await appel<unknown>(`/ezflow/${id}`, { method: "DELETE" });
  exiger("Suppression de l'abonnement EZ Gestion refusée", res);
  return deballer(res.data);
}

/** GET /contract/{contractId} — état courant du contrat. */
export async function rafraichirContrat(contractId: string) {
  const res = await appel<unknown>(`/contract/${contractId}`, { method: "GET" });
  exiger("Rafraîchissement du contrat refusé", res);
  return deballer(res.data);
}

/** GET /demarche/{demarcheId} — état d'une démarche de régularisation. */
export async function rafraichirDemarche(demarcheId: string) {
  const res = await appel<unknown>(`/demarche/${demarcheId}`, { method: "GET" });
  exiger("Rafraîchissement de la démarche refusé", res);
  return deballer(res.data);
}

/**
 * POST /contract/cancel — radiation de contrats (seule opération d'écriture
 * publiée sur un contrat existant).
 *
 * Limite documentée : ne fonctionne que pour les contrats non encore transmis
 * à Néoliane (en cours d'adhésion, en attente de signature, en cours de
 * signature), et uniquement pour des contrats visibles par le porteur de la
 * userApiKey. Succès = HTTP 204 avec corps vide.
 */
export async function radierContrats(contractIds: string[], comment?: string | undefined) {
  if (contractIds.length === 0) throw new Error("Aucun contrat à radier.");
  const res = await appel<unknown>("/contract/cancel", {
    method: "POST",
    payload: { contractIds, ...(comment ? { comment } : {}) },
    withUserApiKey: true,
  });
  exiger("Radiation des contrats refusée", res);
  return { ok: true, status: res.status, contractIds };
}
