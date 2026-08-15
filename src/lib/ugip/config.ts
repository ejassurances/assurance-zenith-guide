/**
 * Configuration de l'intégration UGIP Assurances (WS Tarification Emprunteur,
 * plateforme APPLI-KEY / Procento).
 *
 * Les identifiants ne sont JAMAIS en dur dans le code et ne sont jamais
 * exposés au navigateur. Ils sont lus dans les secrets du projet :
 *   - UGIP_IDENTIFIANT      (obligatoire — fourni par APPLI-KEY)
 *   - UGIP_CLE_POINT_VENTE  (facultatif)
 *   - UGIP_CLE_CONSEILLER   (facultatif)
 *   - UGIP_CLE_SOURCE_PROJET(facultatif — identification du système appelant)
 *   - UGIP_ENV              (facultatif : "recette" pour la plateforme de test)
 *
 * Tant que l'identifiant est absent, l'intégration reste inerte et renvoie un
 * message explicite (voir `ugipConfigStatus`).
 */

export const UGIP_URL_PRODUCTION =
  "https://ws-tarification.procento.fr/Tarification/CalculEmprunteur1";

export const UGIP_URL_RECETTE =
  "https://ws-tarification-recette1.procento.fr/Tarification/CalculEmprunteur1";

/** Version d'API attendue par le web service. */
export const UGIP_VERSION_API = 1;

export interface UgipCredentials {
  identifiant: string;
  clePointVente: string;
  cleConseiller: string;
  cleSourceProjet: string;
  /** "recette" bascule sur la plateforme de test. */
  environnement: "production" | "recette";
}

/** Lecture des secrets — À APPELER UNIQUEMENT dans un handler serveur. */
export function readUgipCredentials(): UgipCredentials {
  const env = (process.env["UGIP_ENV"] ?? "").trim().toLowerCase();
  return {
    identifiant: (process.env["UGIP_IDENTIFIANT"] ?? "").trim(),
    clePointVente: (process.env["UGIP_CLE_POINT_VENTE"] ?? "").trim(),
    cleConseiller: (process.env["UGIP_CLE_CONSEILLER"] ?? "").trim(),
    cleSourceProjet: (process.env["UGIP_CLE_SOURCE_PROJET"] ?? "").trim(),
    environnement: env === "recette" || env === "test" ? "recette" : "production",
  };
}

/** URL du web service selon l'environnement configuré. */
export function ugipUrl(creds = readUgipCredentials()): string {
  return creds.environnement === "recette" ? UGIP_URL_RECETTE : UGIP_URL_PRODUCTION;
}

export interface UgipConfigStatus {
  configured: boolean;
  hasIdentifiant: boolean;
  hasClePointVente: boolean;
  hasCleConseiller: boolean;
  environnement: "production" | "recette";
  missing: string[];
  message: string;
}

/** État de configuration, sans jamais révéler la valeur des secrets. */
export function ugipConfigStatus(): UgipConfigStatus {
  const c = readUgipCredentials();
  const missing: string[] = [];
  if (!c.identifiant) missing.push("UGIP_IDENTIFIANT");
  const configured = !!c.identifiant;
  return {
    configured,
    hasIdentifiant: !!c.identifiant,
    hasClePointVente: !!c.clePointVente,
    hasCleConseiller: !!c.cleConseiller,
    environnement: c.environnement,
    missing,
    message: configured
      ? `Intégration UGIP active (plateforme ${c.environnement}).`
      : "Intégration UGIP inactive : l'identifiant APPLI-KEY (UGIP_IDENTIFIANT) n'est pas renseigné dans les secrets du projet.",
  };
}
