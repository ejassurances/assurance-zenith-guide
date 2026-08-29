import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { estEmailInterne } from "@/lib/domaines-internes";
import { extraireDomaine, nomPartenairePourDomaine } from "@/lib/partenaires-domaines";
import { estFournisseurFinance, estEmailGroupement } from "@/lib/routage-specifique";

/**
 * Garde-fou « pas de fiche client pour un non-client ».
 *
 * Aucune fiche client / prospect ne doit être ouverte pour un expéditeur qui est
 * en réalité une compagnie, un fournisseur, le groupement, une adresse interne
 * au cabinet ou une adresse technique (no-reply, service résiliation, etc.).
 */

/** Adresses techniques : aucune personne derrière, jamais un client. */
const MOTIFS_TECHNIQUES =
  /^(no.?reply|ne.?pas.?repondre|donotreply|postmaster|mailer.daemon|notification[s]?|newsletter|contact|info|service|support|resiliation|substitution[s]?|facture[s]?|comptabilite|abonnement[s]?|alerte[s]?)(?![a-z])/i;

export type MotifNonClient =
  | "interne"
  | "partenaire"
  | "compagnie"
  | "fournisseur"
  | "groupement"
  | "technique";

export type VerdictExpediteur =
  | { client_possible: true }
  | { client_possible: false; motif: MotifNonClient; detail: string };

/** Domaines des compagnies et fournisseurs enregistrés en base. */
async function domainesEnBase(
  admin: SupabaseClient<Database>,
): Promise<{ compagnies: Map<string, string>; fournisseurs: Map<string, string> }> {
  const compagnies = new Map<string, string>();
  const fournisseurs = new Map<string, string>();
  const [c, f] = await Promise.all([
    admin.from("compagnies").select("nom, contact_email, site_web, email_reclamations"),
    admin.from("fournisseurs").select("nom, email, domaines_email, site_web"),
  ]);
  for (const l of c.data ?? []) {
    for (const v of [l.contact_email, l.site_web, l.email_reclamations]) {
      const d = extraireDomaine(v);
      if (d) compagnies.set(d, l.nom);
    }
  }
  for (const l of (f.data ?? []) as Array<{
    nom: string;
    email: string | null;
    domaines_email: string[] | null;
    site_web: string | null;
  }>) {
    const valeurs = [l.email, l.site_web, ...(l.domaines_email ?? [])];
    for (const v of valeurs) {
      const d = extraireDomaine(v);
      if (d) fournisseurs.set(d, l.nom);
    }
  }
  return { compagnies, fournisseurs };
}

/**
 * L'expéditeur peut-il légitimement donner lieu à une fiche client / prospect ?
 * Lecture seule : n'écrit rien et ne lève pas d'erreur.
 */
export async function verifierExpediteurClientPossible(
  admin: SupabaseClient<Database>,
  email: string | null | undefined,
): Promise<VerdictExpediteur> {
  if (!email) return { client_possible: false, motif: "technique", detail: "Adresse expéditeur absente" };
  const adresse = email.toLowerCase().trim();
  const locale = adresse.split("@")[0] ?? "";
  const domaine = extraireDomaine(adresse);

  if (estEmailInterne(adresse))
    return { client_possible: false, motif: "interne", detail: "Adresse interne au cabinet" };
  if (estEmailGroupement(adresse))
    return { client_possible: false, motif: "groupement", detail: "Groupement Conseillons Ensemble" };
  if (estFournisseurFinance(adresse))
    return { client_possible: false, motif: "fournisseur", detail: "Fournisseur du cabinet (Direction Financière)" };

  const { compagnies, fournisseurs } = await domainesEnBase(admin);
  const partenaire = nomPartenairePourDomaine(domaine, compagnies);
  if (partenaire)
    return { client_possible: false, motif: "partenaire", detail: `Compagnie / partenaire : ${partenaire}` };

  if (domaine) {
    const parties = domaine.split(".");
    const racine = parties.length > 2 ? parties.slice(-2).join(".") : domaine;
    const fournisseur = fournisseurs.get(domaine) ?? fournisseurs.get(racine);
    if (fournisseur)
      return { client_possible: false, motif: "fournisseur", detail: `Fournisseur : ${fournisseur}` };
  }

  if (MOTIFS_TECHNIQUES.test(locale))
    return { client_possible: false, motif: "technique", detail: `Adresse technique (${locale})` };

  return { client_possible: true };
}
