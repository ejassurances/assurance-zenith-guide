/**
 * Correspondance branches du CRM ↔ produits Néoliane (EZ API) et construction
 * des payloads de profil attendus par `POST /profile` / `generateprices`.
 *
 * Ce module est pur (aucun accès réseau ni base) : il est importable côté
 * navigateur pour afficher ce qui sera transmis avant l'appel.
 */

import {
  assuresEmprunteur,
  personnesAssurees,
  type PersonneAssuree,
} from "../recueil-besoins-schemas";
import { REGIME_NEOLIANE, type ProductType } from "./referentiels";

export interface ProfilNeolianeMembre {
  socialSecurityScheme: string;
  birthYear: number;
  familyMember: string;
}

export interface ProfilNeoliane {
  profileHealth?: ProfilNeolianeMembre[];
  profileMembers?: ProfilNeolianeMembre[];
  pet?: Record<string, unknown>;
}

/** Produits Néoliane couverts par chaque branche du CRM. */
export const PRODUITS_PAR_BRANCHE: Record<string, ProductType[]> = {
  sante: ["sante"],
  prevoyance: ["deces", "ijh", "ijhtc", "pmr", "dependance", "maccid", "sda"],
  prevoyance_sante: ["sante", "deces", "ijh", "pmr"],
  emprunteur: ["pemp"],
  accidents_vie: ["gav"],
  juridique: ["pj"],
  animaux: ["pet"],
  expatrie: ["nomade"],
};

/** La branche est-elle tarifiable via l'API Néoliane ? */
export function brancheTarifableNeoliane(branche: string): boolean {
  return (PRODUITS_PAR_BRANCHE[branche] ?? []).length > 0;
}

/**
 * Produits à demander pour un dossier. En prévoyance, les besoins cochés dans
 * le recueil restreignent la liste ; sinon on interroge tous les produits de
 * la branche.
 */
export function produitsNeolianePourDossier(
  branche: string,
  recueil: unknown,
): ProductType[] {
  const tous = PRODUITS_PAR_BRANCHE[branche] ?? [];
  if (branche !== "prevoyance") return tous;

  const v = (recueil ?? {}) as Record<string, unknown>;
  const choisis: ProductType[] = [];
  if (v["besoin_deces"] === true) choisis.push("deces");
  if (v["besoin_incapacite"] === true) choisis.push("ijh", "ijhtc");
  if (v["besoin_invalidite"] === true) choisis.push("pmr");
  if (v["besoin_dependance"] === true) choisis.push("dependance");
  if (v["besoin_deces_accidentel"] === true) choisis.push("maccid", "sda");
  return choisis.length > 0 ? choisis : tous;
}

/** Produit principal (celui porté par le profil Néoliane). */
export function produitPrincipalNeoliane(branche: string, recueil: unknown): ProductType | null {
  return produitsNeolianePourDossier(branche, recueil)[0] ?? null;
}

function membresDepuisPersonnes(personnes: PersonneAssuree[]): ProfilNeolianeMembre[] {
  const membres: ProfilNeolianeMembre[] = [];
  let enfants = 0;
  let principalFait = false;

  for (const p of personnes) {
    const annee = Number((p.date_naissance || "").slice(0, 4));
    if (!annee || Number.isNaN(annee)) continue;

    let familyMember: string;
    if (p.lien === "conjoint") familyMember = "spouse";
    else if (!principalFait && (p.lien === "soi_meme" || p.lien === "")) {
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

/** CSP du recueil emprunteur → régime social Néoliane. */
const REGIME_DEPUIS_CSP: Record<string, string> = {
  cadre: "employee",
  employe: "employee",
  artisan: "selfEmployed",
  profession_liberale: "selfEmployed",
  tns: "selfEmployed",
  fonctionnaire: "civilServant",
  retraite: "retiredEmployee",
  sans_activite: "unemployed",
};

/** Payload « pet » depuis un recueil animaux. */
function profilAnimal(recueil: unknown): Record<string, unknown> | null {
  const v = (recueil ?? {}) as Record<string, unknown>;
  const espece = typeof v["espece"] === "string" ? v["espece"] : "";
  const naissance = typeof v["date_naissance"] === "string" ? v["date_naissance"] : "";
  if (!espece || !naissance) return null;
  return {
    species: espece === "chien" ? 2 : 1,
    birthDate: naissance,
    ...(typeof v["race"] === "string" && v["race"] ? { breed: v["race"] } : {}),
  };
}

/**
 * Construit le profil Néoliane pour un dossier, selon sa branche.
 * Retourne `null` si les informations minimales attendues par l'API sont
 * absentes du recueil des besoins.
 */
export function construireProfilNeoliane(branche: string, recueil: unknown): ProfilNeoliane | null {
  if (branche === "animaux") {
    const pet = profilAnimal(recueil);
    return pet ? { pet } : null;
  }

  const v = (recueil ?? {}) as Record<string, unknown>;

  if (branche === "emprunteur") {
    const membres: ProfilNeolianeMembre[] = [];
    let principalFait = false;
    for (const a of assuresEmprunteur(v["assures"])) {
      const annee = Number((a.date_naissance || "").slice(0, 4));
      if (!annee || Number.isNaN(annee)) continue;
      const estPrincipal = !principalFait && a.lien !== "co_emprunteur";
      if (estPrincipal) principalFait = true;
      membres.push({
        familyMember: estPrincipal ? "holder" : "spouse",
        birthYear: annee,
        socialSecurityScheme: REGIME_DEPUIS_CSP[a.csp] ?? "employee",
      });
    }
    return membres.length > 0 ? { profileMembers: membres } : null;
  }

  const personnes = personnesAssurees(v["assures"]);
  const membres = membresDepuisPersonnes(personnes);
  if (membres.length === 0) return null;
  // La santé attend `profileHealth`, les autres produits `profileMembers`.
  return branche === "sante" || branche === "prevoyance_sante"
    ? { profileHealth: membres, profileMembers: membres }
    : { profileMembers: membres };
}

/** Nombre d'assurés transmissibles à Néoliane pour ce dossier (affichage UI). */
export function nbAssuresNeoliane(branche: string, recueil: unknown): number {
  const p = construireProfilNeoliane(branche, recueil);
  if (!p) return 0;
  if (p.pet) return 1;
  return (p.profileHealth ?? p.profileMembers ?? []).length;
}
