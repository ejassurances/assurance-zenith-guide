/**
 * Règles de routage nommément décidées par la direction, qui prévalent sur la
 * détection automatique (annuaire compagnies / classification IA).
 *
 * - « +Simple » est notre assurance RC Pro (fournisseur) : ses mails relèvent
 *   TOUJOURS de la Direction Financière — jamais d'un échange partenaire
 *   assureur ni d'un prospect.
 * - « Conseillons Ensemble » est notre groupement : si un renvoi est nécessaire,
 *   il se fait toujours vers le dirigeant.
 *
 * Module client-safe (réutilisé serveur et UI).
 */
import { extraireDomaine } from "@/lib/partenaires-domaines";

/** Fournisseurs dont les mails vont d'office en Direction Financière. */
export const DOMAINES_FOURNISSEUR_FINANCE: readonly string[] = [
  "plus-simple.fr",
  "plussimple.fr",
  "simple.fr",
];

/** Groupement du cabinet. */
export const DOMAINES_GROUPEMENT: readonly string[] = [
  "conseillons-ensemble.fr",
  "conseillonsensemble.fr",
  "conseillons-ensemble.com",
];

/** Adresse de renvoi unique pour les échanges du groupement. */
export const ADRESSE_GROUPEMENT = "erwan.jaffrelot@ej-assurances.fr";

function domaineDans(email: string | null | undefined, liste: readonly string[]): boolean {
  const d = extraireDomaine(email);
  if (!d) return false;
  const parties = d.split(".");
  const racine = parties.length > 2 ? parties.slice(-2).join(".") : d;
  return liste.includes(d) || liste.includes(racine);
}

/** Mail d'un fournisseur traité par la Direction Financière (ex. +Simple). */
export function estFournisseurFinance(email: string | null | undefined): boolean {
  return domaineDans(email, DOMAINES_FOURNISSEUR_FINANCE);
}

/** Mail du groupement (Conseillons Ensemble). */
export function estEmailGroupement(email: string | null | undefined): boolean {
  return domaineDans(email, DOMAINES_GROUPEMENT);
}
