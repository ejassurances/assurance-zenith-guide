/**
 * Pilotage des délais — Domaine 7 (Sinistres & demandes).
 *
 * Calculs purs, sans accès base : les vues passent des lignes déjà lues et
 * récupèrent des alertes hiérarchisées. Aucune écriture, aucun envoi d'email.
 *
 * Délais de référence du cabinet :
 *  - Réclamation : accusé de réception sous 10 jours ouvrés, réponse sous
 *    2 mois (recommandation ACPR 2022-R-01).
 *  - Sinistre : transmission à la compagnie sous 5 jours après déclaration,
 *    puis relance si aucun mouvement depuis 15 jours.
 *  - Pièces obligatoires manquantes : bloquant tant qu'elles ne sont pas reçues.
 */

export const DELAI_ACCUSE_JOURS_OUVRES = 10;
export const DELAI_REPONSE_JOURS = 60;
export const DELAI_TRANSMISSION_JOURS = 5;
export const DELAI_SANS_MOUVEMENT_JOURS = 15;

export type Gravite = "critique" | "alerte" | "vigilance";

export type Categorie = "reclamation" | "sinistre" | "pieces";

export interface Alerte {
  cle: string;
  categorie: Categorie;
  gravite: Gravite;
  /** Identifiant de la réclamation ou du sinistre concerné. */
  cible_id: string;
  libelle: string;
  detail: string;
  jours: number;
}

export interface ReclamationDelai {
  id: string;
  reference?: string | null;
  statut: string;
  date_ouverture: string;
  date_accuse_reception?: string | null;
  date_cloture?: string | null;
}

export interface SinistreDelai {
  id: string;
  reference?: string | null;
  statut: string;
  etape?: string | null;
  declare_le?: string | null;
  declare_compagnie_le?: string | null;
  updated_at: string;
  clos_le?: string | null;
}

export interface PieceDelai {
  sinistre_id: string;
  libelle: string;
  obligatoire: boolean;
  statut: string;
}

const JOUR_MS = 86_400_000;

/** Nombre de jours calendaires écoulés entre `depuis` et `maintenant`. */
export function joursEcoules(depuis: string, maintenant: Date): number {
  const d = new Date(depuis).getTime();
  if (Number.isNaN(d)) return 0;
  return Math.max(0, Math.floor((maintenant.getTime() - d) / JOUR_MS));
}

/** Jours ouvrés (lundi–vendredi) écoulés, jours fériés non déduits. */
export function joursOuvresEcoules(depuis: string, maintenant: Date): number {
  const debut = new Date(depuis);
  if (Number.isNaN(debut.getTime())) return 0;
  let n = 0;
  const curseur = new Date(
    Date.UTC(debut.getUTCFullYear(), debut.getUTCMonth(), debut.getUTCDate()),
  );
  const fin = Date.UTC(
    maintenant.getUTCFullYear(),
    maintenant.getUTCMonth(),
    maintenant.getUTCDate(),
  );
  while (curseur.getTime() < fin) {
    curseur.setUTCDate(curseur.getUTCDate() + 1);
    const j = curseur.getUTCDay();
    if (j !== 0 && j !== 6) n += 1;
  }
  return n;
}

function estClose(statut: string, cloture?: string | null): boolean {
  return Boolean(cloture) || statut === "clos" || statut === "refuse" || statut === "cloturee";
}

/** Alertes de délai sur les réclamations en cours. */
export function alertesReclamations(rows: ReclamationDelai[], maintenant = new Date()): Alerte[] {
  const out: Alerte[] = [];
  for (const r of rows) {
    if (estClose(r.statut, r.date_cloture)) continue;
    const nom = r.reference || r.id.slice(0, 8);

    if (!r.date_accuse_reception) {
      const jo = joursOuvresEcoules(r.date_ouverture, maintenant);
      if (jo >= DELAI_ACCUSE_JOURS_OUVRES) {
        out.push({
          cle: `rec-accuse-${r.id}`,
          categorie: "reclamation",
          gravite: "critique",
          cible_id: r.id,
          libelle: `Réclamation ${nom} — accusé de réception hors délai`,
          detail: `${jo} jours ouvrés sans accusé (limite ${DELAI_ACCUSE_JOURS_OUVRES}).`,
          jours: jo,
        });
      } else if (jo >= DELAI_ACCUSE_JOURS_OUVRES - 3) {
        out.push({
          cle: `rec-accuse-proche-${r.id}`,
          categorie: "reclamation",
          gravite: "vigilance",
          cible_id: r.id,
          libelle: `Réclamation ${nom} — accusé de réception à envoyer`,
          detail: `${jo} jours ouvrés écoulés sur ${DELAI_ACCUSE_JOURS_OUVRES}.`,
          jours: jo,
        });
      }
    }

    const jc = joursEcoules(r.date_ouverture, maintenant);
    if (jc >= DELAI_REPONSE_JOURS) {
      out.push({
        cle: `rec-reponse-${r.id}`,
        categorie: "reclamation",
        gravite: "critique",
        cible_id: r.id,
        libelle: `Réclamation ${nom} — réponse hors délai réglementaire`,
        detail: `${jc} jours depuis l'ouverture (limite ${DELAI_REPONSE_JOURS}).`,
        jours: jc,
      });
    } else if (jc >= DELAI_REPONSE_JOURS - 15) {
      out.push({
        cle: `rec-reponse-proche-${r.id}`,
        categorie: "reclamation",
        gravite: "alerte",
        cible_id: r.id,
        libelle: `Réclamation ${nom} — échéance de réponse proche`,
        detail: `${jc} jours depuis l'ouverture sur ${DELAI_REPONSE_JOURS}.`,
        jours: jc,
      });
    }
  }
  return out;
}

/** Alertes de délai sur les sinistres en cours. */
export function alertesSinistres(rows: SinistreDelai[], maintenant = new Date()): Alerte[] {
  const out: Alerte[] = [];
  for (const s of rows) {
    if (estClose(s.statut, s.clos_le)) continue;
    const nom = s.reference || s.id.slice(0, 8);

    if (s.declare_le && !s.declare_compagnie_le) {
      const j = joursEcoules(s.declare_le, maintenant);
      if (j >= DELAI_TRANSMISSION_JOURS) {
        out.push({
          cle: `sin-transmission-${s.id}`,
          categorie: "sinistre",
          gravite: "critique",
          cible_id: s.id,
          libelle: `Sinistre ${nom} — non transmis à la compagnie`,
          detail: `${j} jours depuis la déclaration (limite ${DELAI_TRANSMISSION_JOURS}).`,
          jours: j,
        });
      }
    }

    const jm = joursEcoules(s.updated_at, maintenant);
    if (jm >= DELAI_SANS_MOUVEMENT_JOURS) {
      out.push({
        cle: `sin-sans-mouvement-${s.id}`,
        categorie: "sinistre",
        gravite: "alerte",
        cible_id: s.id,
        libelle: `Sinistre ${nom} — aucun mouvement`,
        detail: `${jm} jours sans mise à jour du dossier.`,
        jours: jm,
      });
    }
  }
  return out;
}

/** Alertes sur les pièces obligatoires non reçues. */
export function alertesPieces(pieces: PieceDelai[], sinistresOuverts: SinistreDelai[]): Alerte[] {
  const ouverts = new Map(
    sinistresOuverts.filter((s) => !estClose(s.statut, s.clos_le)).map((s) => [s.id, s]),
  );
  const parSinistre = new Map<string, string[]>();
  for (const p of pieces) {
    if (!p.obligatoire || p.statut === "recue" || p.statut === "validee") continue;
    if (!ouverts.has(p.sinistre_id)) continue;
    const liste = parSinistre.get(p.sinistre_id) ?? [];
    liste.push(p.libelle);
    parSinistre.set(p.sinistre_id, liste);
  }
  return [...parSinistre.entries()].map(([id, libelles]) => {
    const s = ouverts.get(id)!;
    return {
      cle: `pieces-${id}`,
      categorie: "pieces" as Categorie,
      gravite: "vigilance" as Gravite,
      cible_id: id,
      libelle: `Sinistre ${s.reference || id.slice(0, 8)} — ${libelles.length} pièce(s) obligatoire(s) manquante(s)`,
      detail: libelles.join(", "),
      jours: 0,
    };
  });
}

const ORDRE: Record<Gravite, number> = { critique: 0, alerte: 1, vigilance: 2 };

/** Assemble et hiérarchise toutes les alertes de délai. */
export function pilotageDelais(entree: {
  reclamations: ReclamationDelai[];
  sinistres: SinistreDelai[];
  pieces: PieceDelai[];
  maintenant?: Date;
}): { alertes: Alerte[]; compteurs: Record<Gravite, number> } {
  const maintenant = entree.maintenant ?? new Date();
  const alertes = [
    ...alertesReclamations(entree.reclamations, maintenant),
    ...alertesSinistres(entree.sinistres, maintenant),
    ...alertesPieces(entree.pieces, entree.sinistres),
  ].sort((a, b) => ORDRE[a.gravite] - ORDRE[b.gravite] || b.jours - a.jours);

  const compteurs: Record<Gravite, number> = { critique: 0, alerte: 0, vigilance: 0 };
  for (const a of alertes) compteurs[a.gravite] += 1;
  return { alertes, compteurs };
}
