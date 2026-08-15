/**
 * Résolution de l'assureur porteur d'un devis reçu d'un connecteur API
 * (SimulAssur, UGIP, Néoliane) — SERVEUR UNIQUEMENT.
 *
 * Les devis créés par API ne sont pas rattachés à un produit du catalogue
 * (`produit_id` vide) : l'assureur porteur est donc stocké directement sur la
 * ligne `dossier_devis.assureur_porteur`, afin que la détection des doublons
 * inter-grossistes du classement IA puisse fonctionner.
 *
 * Deux sources, dans cet ordre :
 *   1. la valeur fournie par l'API du partenaire (SimulAssur renvoie la société
 *      porteuse de l'offre) ;
 *   2. à défaut, le produit du catalogue de la même compagnie dont le nom
 *      correspond au libellé de l'offre — son champ `assureur_porteur` est
 *      alors repris.
 *
 * Aucune valeur n'est devinée : sans correspondance, la colonne reste vide.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
type Sb = any;

function nettoyer(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return s.length > 1 ? s.slice(0, 120) : null;
}

export interface ResolutionPorteurInput {
  /** Compagnie / grossiste CRM associé au devis (peut être absent). */
  compagnieId?: string | null;
  /** Libellé de l'offre renvoyé par le partenaire (nom de produit / gamme). */
  libelleProduit?: string | null;
  /** Assureur porteur explicitement renvoyé par l'API, si disponible. */
  porteurApi?: string | null;
}

/** Assureur porteur d'une offre API, ou `null` si non identifiable. */
export async function resoudreAssureurPorteur(
  supabase: Sb,
  input: ResolutionPorteurInput,
): Promise<string | null> {
  const direct = nettoyer(input.porteurApi);
  if (direct) return direct;

  const libelle = nettoyer(input.libelleProduit);
  if (!libelle || !input.compagnieId) return null;

  const { data } = await supabase
    .from("produits")
    .select("nom, assureur_porteur")
    .eq("compagnie_id", input.compagnieId)
    .not("assureur_porteur", "is", null);

  const produits = ((data ?? []) as { nom: string; assureur_porteur: string | null }[]).filter(
    (p) => nettoyer(p.assureur_porteur),
  );
  if (produits.length === 0) return null;

  const norm = (s: string) =>
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  const cible = norm(libelle);

  // Correspondance exacte, puis inclusion du nom catalogue dans le libellé API.
  const exact = produits.find((p) => norm(p.nom) === cible);
  if (exact) return nettoyer(exact.assureur_porteur);
  const inclus = produits
    .filter((p) => norm(p.nom).length >= 4 && cible.includes(norm(p.nom)))
    .sort((a, b) => norm(b.nom).length - norm(a.nom).length)[0];
  return inclus ? nettoyer(inclus.assureur_porteur) : null;
}

/**
 * Version « lot » : résout l'assureur porteur de plusieurs offres d'un même
 * connecteur en une seule lecture du catalogue.
 */
export async function resoudreAssureursPorteurs(
  supabase: Sb,
  compagnieId: string | null,
  offres: { libelleProduit?: string | null; porteurApi?: string | null }[],
): Promise<(string | null)[]> {
  const resultats: (string | null)[] = [];
  for (const o of offres) {
    resultats.push(
      await resoudreAssureurPorteur(supabase, {
        compagnieId,
        libelleProduit: o.libelleProduit ?? null,
        porteurApi: o.porteurApi ?? null,
      }),
    );
  }
  return resultats;
}
