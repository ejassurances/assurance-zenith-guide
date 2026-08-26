/**
 * CD-SI-001-B — LOT 3 : MOTEUR DE CROISEMENT (couche pure).
 * Référence exclusive : docs/CD-SI-001-B-LOT3-DESIGN-V1.2.md
 *
 * Chaîne doctrinale imposée :
 *   preuve -> niveau doctrinal (N1..N9) -> unicité -> convergence -> contradiction -> proposition
 *
 * INVARIANTS ABSOLUS (§2.1, §9, §10, §13 du DESIGN V1.2) :
 *  - aucune FK CRM écrite : le moteur ne produit que des propositions dans `ai_context` ;
 *  - `CONFIRMED` est impossible : seules les sorties DETECTED / PROPOSED / AMBIGUOUS /
 *    A_QUALIFIER existent ;
 *  - aucun scoring : aucune formule, pondération, addition ou majoration ;
 *  - `preuves[].poids` n'est JAMAIS écrit et JAMAIS lu pour décider ;
 *  - aucun champ JSON nouveau : schéma Lot 1 `1.1.0` inchangé ;
 *  - `compagnie_id_propose` n'existe pas : une proposition de compagnie passe uniquement
 *    par `correspondant.compagnie_id` (jamais la FK `crm_emails.compagnie_id`) ;
 *  - multi-candidats : contournement assumé « une entrée par candidat + `ambiguities` ».
 *
 * Module pur : aucun accès réseau, aucun accès base, aucun appel Gemini.
 */
import {
  EMAIL_CONTEXT_SCHEMA_VERSION,
  type Ambiguity,
  type AmbiguityType,
  type EmailContext,
  type EmailContextStatus,
  type Evidence,
  type EvidenceType,
} from "./email-context-types";

/** Niveaux doctrinaux, strictement ceux de CD-SI-001-B-TECH-V1.2. */
export const NIVEAUX_DOCTRINAUX = [
  "N1",
  "N2",
  "N3",
  "N4",
  "N5",
  "N6",
  "N7",
  "N8",
  "N9",
] as const;
export type NiveauDoctrinal = (typeof NIVEAUX_DOCTRINAUX)[number];

/**
 * Niveaux admissibles pour porter seuls une proposition (N1 à N6).
 * N7 (nom/prénom cité seul), N8 (historique faible) et N9 (facteur contextuel,
 * notamment dossier unique actif) ne sont JAMAIS promus : aucune accumulation.
 * Ceci est une appartenance d'ensemble, pas un score.
 */
const NIVEAUX_PROPOSABLES: readonly NiveauDoctrinal[] = ["N1", "N2", "N3", "N4", "N5", "N6"];

export type EntiteResolue = "client" | "dossier" | "contrat" | "compagnie" | "produit" | "document";

export interface PreuveCroisement {
  id: string;
  niveau: NiveauDoctrinal;
  type: EvidenceType;
  /** Extrait factuel — sert aussi à tracer le niveau doctrinal (aucun champ `niveau` créé). */
  extrait: string | null;
  /** Cible technique lue, ex. `clients.email` ; porte la trace du niveau doctrinal. */
  cible: string;
  entite: EntiteResolue;
  /** Candidats désignés par cette preuve (UUID des référentiels lus). */
  candidats: string[];
  /** Index de l'entrée `ai_context` d'origine, lorsque la preuve provient d'une entrée. */
  index?: number;
}

/* ------------------------------------------------------------------ */
/* Référentiels lus (lecture seule, fournis par la couche serveur)     */
/* ------------------------------------------------------------------ */

export interface ClientRef {
  id: string;
  nom?: string | null;
  prenom?: string | null;
  email?: string | null;
  email2?: string | null;
  telephone?: string | null;
  statut?: string | null;
}
export interface DossierRef {
  id: string;
  reference?: string | null;
  client_id?: string | null;
  statut?: string | null;
}
export interface ContratRef {
  id: string;
  numero?: string | null;
  client_id?: string | null;
  dossier_id?: string | null;
  compagnie_id?: string | null;
  produit_id?: string | null;
  statut?: string | null;
}
export interface CompagnieRef {
  id: string;
  nom?: string | null;
  contact_email?: string | null;
  site_web?: string | null;
}
export interface ProduitRef {
  id: string;
  nom?: string | null;
  code_produit?: string | null;
  compagnie_id?: string | null;
}
export interface DocumentRef {
  id: string;
  nom?: string | null;
  client_id?: string | null;
  dossier_id?: string | null;
  contrat_id?: string | null;
}

export interface ReferentielCroisement {
  clients: ClientRef[];
  dossiers: DossierRef[];
  contrats: ContratRef[];
  compagnies: CompagnieRef[];
  produits: ProduitRef[];
  documents: DocumentRef[];
  /** Rattachements déjà posés sur la ligne email (CD-SI-001-A) — contexte faible N8. */
  rattachementsExistants?: {
    client_id?: string | null;
    dossier_id?: string | null;
    contrat_id?: string | null;
    compagnie_id?: string | null;
  };
  /** Dossiers considérés actifs, par client — facteur contextuel N9 uniquement. */
  dossiersActifsParClient?: Record<string, string[]>;
  /**
   * Référentiels dont l'exhaustivité de lecture N'EST PAS garantie (liste
   * potentiellement tronquée). Toute entité adossée à un tel référentiel est
   * traitée comme ambiguë : aucune proposition ne peut en découler.
   * Valeurs attendues : noms de tables réelles (`clients`, `dossiers`,
   * `contrats`, `compagnies`, `produits`, `documents`).
   */
  referentielsTronques?: string[];
}

export function referentielVide(): ReferentielCroisement {
  return { clients: [], dossiers: [], contrats: [], compagnies: [], produits: [], documents: [] };
}

/* ------------------------------------------------------------------ */
/* Normalisations                                                      */
/* ------------------------------------------------------------------ */

const DOMAINES_GENERIQUES = new Set([
  "gmail.com",
  "googlemail.com",
  "hotmail.com",
  "hotmail.fr",
  "outlook.com",
  "outlook.fr",
  "live.fr",
  "yahoo.fr",
  "yahoo.com",
  "orange.fr",
  "wanadoo.fr",
  "free.fr",
  "sfr.fr",
  "laposte.net",
  "icloud.com",
  "me.com",
  "bbox.fr",
  "numericable.fr",
  "aol.com",
  "protonmail.com",
  "proton.me",
]);

const txt = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const bas = (v: unknown): string => txt(v).toLowerCase();
const ref = (v: unknown): string => txt(v).toUpperCase().replace(/[^A-Z0-9]/g, "");
const tel = (v: unknown): string => txt(v).replace(/[^0-9]/g, "").replace(/^0033/, "0");
const domaine = (email: unknown): string => {
  const e = bas(email);
  const i = e.lastIndexOf("@");
  return i === -1 ? "" : e.slice(i + 1);
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/* ------------------------------------------------------------------ */
/* 1. Identification et qualification des preuves                      */
/* ------------------------------------------------------------------ */

export function collecterPreuves(
  contexte: EmailContext,
  referentiel: ReferentielCroisement,
): PreuveCroisement[] {
  const preuves: PreuveCroisement[] = [];
  let n = 0;
  const ajouter = (p: Omit<PreuveCroisement, "id">): void => {
    if (p.candidats.length === 0) return;
    preuves.push({ ...p, id: `L3-${p.niveau}-${++n}` });
  };

  /* --- N1 : référence dossier explicite ou UUID direct --- */
  (contexte.dossiers_detectes ?? []).forEach((d, index) => {
    const brut = txt(d.reference_citee);
    if (!brut) return;
    const cle = ref(brut);
    const candidats = UUID.test(brut)
      ? referentiel.dossiers.filter((x) => x.id.toLowerCase() === brut.toLowerCase()).map((x) => x.id)
      : referentiel.dossiers.filter((x) => ref(x.reference) === cle && cle.length > 0).map((x) => x.id);
    ajouter({
      niveau: "N1",
      type: "reference_explicite",
      extrait: `N1 — référence dossier citée : ${brut}`,
      cible: "dossiers.reference",
      entite: "dossier",
      candidats,
      index,
    });
  });

  /* --- N2 : correspondance unique de l'email expéditeur --- */
  const emailExpediteur = bas(contexte.correspondant?.email);
  if (emailExpediteur) {
    const candidats = referentiel.clients
      .filter((c) => bas(c.email) === emailExpediteur || bas(c.email2) === emailExpediteur)
      .map((c) => c.id);
    ajouter({
      niveau: "N2",
      type: "email_expediteur",
      extrait: `N2 — email expéditeur : ${emailExpediteur}`,
      cible: "clients.email",
      entite: "client",
      candidats,
    });
  }

  /* --- N3 : numéro de police / souscription exact unique --- */
  (contexte.contrats_detectes ?? []).forEach((c, index) => {
    const brut = txt(c.numero_police);
    const cle = ref(brut);
    if (!cle) return;
    const candidats = referentiel.contrats.filter((x) => ref(x.numero) === cle).map((x) => x.id);
    ajouter({
      niveau: "N3",
      type: "reference_explicite",
      extrait: `N3 — numéro de police cité : ${brut}`,
      cible: "contrats.numero",
      entite: "contrat",
      candidats,
      index,
    });
  });

  /* --- N4 : domaine d'email professionnel unique (public.compagnies) --- */
  const dom = domaine(emailExpediteur);
  if (dom && !DOMAINES_GENERIQUES.has(dom)) {
    const candidats = referentiel.compagnies
      .filter((c) => domaine(c.contact_email) === dom || bas(c.site_web).includes(dom))
      .map((c) => c.id);
    ajouter({
      niveau: "N4",
      type: "email_expediteur",
      extrait: `N4 — domaine professionnel : ${dom}`,
      cible: "compagnies.contact_email",
      entite: "compagnie",
      candidats,
    });
  }

  /* --- N5 / N7 : personnes détectées --- */
  (contexte.personnes_detectees ?? []).forEach((p, index) => {
    const mail = bas(p.email);
    const phone = tel(p.telephone);
    const parMail = mail
      ? referentiel.clients.filter((c) => bas(c.email) === mail || bas(c.email2) === mail)
      : [];
    const parTel = phone ? referentiel.clients.filter((c) => tel(c.telephone) === phone) : [];
    const forts = [...new Set([...parMail, ...parTel].map((c) => c.id))];
    if (forts.length > 0) {
      ajouter({
        niveau: "N5",
        type: "email_corps",
        extrait: `N5 — personne citée avec email/téléphone : ${mail || phone}`,
        cible: mail ? "clients.email" : "clients.telephone",
        entite: "client",
        candidats: forts,
        index,
      });
      return;
    }
    // N7 — strictement « nom/prénom cité seul ». Jamais promu.
    const nom = bas(p.nom);
    const prenom = bas(p.prenom);
    if (!nom && !prenom) return;
    const candidats = referentiel.clients
      .filter((c) => (!nom || bas(c.nom) === nom) && (!prenom || bas(c.prenom) === prenom))
      .map((c) => c.id);
    ajouter({
      niveau: "N7",
      type: "email_corps",
      extrait: `N7 — nom/prénom cité seul : ${[prenom, nom].filter(Boolean).join(" ")}`,
      cible: "clients.nom",
      entite: "client",
      candidats,
      index,
    });
  });

  /* --- N6 : corrélation documentaire CD-SI-002 déjà existante --- */
  (contexte.documents_associes ?? []).forEach((d, index) => {
    const nomFichier = bas(d.nom_fichier);
    if (!nomFichier) return;
    const docs = referentiel.documents.filter((x) => bas(x.nom) === nomFichier);
    if (docs.length === 0) return;
    ajouter({
      niveau: "N6",
      type: "piece_jointe",
      extrait: `N6 — document déjà connu : ${txt(d.nom_fichier)}`,
      cible: "documents.nom",
      entite: "document",
      candidats: docs.map((x) => x.id),
      index,
    });
    const clients = [...new Set(docs.map((x) => txt(x.client_id)).filter(Boolean))];
    if (clients.length > 0) {
      ajouter({
        niveau: "N6",
        type: "piece_jointe",
        extrait: `N6 — client porté par le document ${txt(d.nom_fichier)}`,
        cible: "documents.client_id",
        entite: "client",
        candidats: clients,
      });
    }
    const dossiers = [...new Set(docs.map((x) => txt(x.dossier_id)).filter(Boolean))];
    if (dossiers.length > 0) {
      ajouter({
        niveau: "N6",
        type: "piece_jointe",
        extrait: `N6 — dossier porté par le document ${txt(d.nom_fichier)}`,
        cible: "documents.dossier_id",
        entite: "dossier",
        candidats: dossiers,
      });
    }
  });

  /* --- N7 : libellé produit cité seul --- */
  (contexte.produits_cites ?? []).forEach((p, index) => {
    const lib = bas(p.libelle);
    if (!lib) return;
    const candidats = referentiel.produits
      .filter((x) => bas(x.nom) === lib || bas(x.code_produit) === lib)
      .map((x) => x.id);
    ajouter({
      niveau: "N7",
      type: "email_corps",
      extrait: `N7 — libellé produit cité seul : ${txt(p.libelle)}`,
      cible: "produits.nom",
      entite: "produit",
      candidats,
      index,
    });
  });

  /* --- Rebonds doctrinaux : le contrat N3 dérive client / dossier / compagnie / produit --- */
  for (const p of [...preuves]) {
    if (p.entite !== "contrat") continue;
    const contrats = referentiel.contrats.filter((c) => p.candidats.includes(c.id));
    const derive = (
      cle: "client_id" | "dossier_id" | "compagnie_id" | "produit_id",
      entite: EntiteResolue,
    ): void => {
      const ids = [...new Set(contrats.map((c) => txt(c[cle])).filter(Boolean))];
      ajouter({
        niveau: p.niveau,
        type: "reference_explicite",
        extrait: `${p.niveau} — ${entite} dérivé du contrat identifié (${p.extrait ?? ""})`,
        cible: `contrats.${cle}`,
        entite,
        candidats: ids,
      });
    };
    derive("client_id", "client");
    derive("dossier_id", "dossier");
    derive("compagnie_id", "compagnie");
    derive("produit_id", "produit");
  }

  /* --- Rebond doctrinal : le dossier N1 dérive son client --- */
  for (const p of [...preuves]) {
    if (p.entite !== "dossier" || p.cible !== "dossiers.reference") continue;
    const ids = [
      ...new Set(
        referentiel.dossiers
          .filter((d) => p.candidats.includes(d.id))
          .map((d) => txt(d.client_id))
          .filter(Boolean),
      ),
    ];
    ajouter({
      niveau: p.niveau,
      type: "reference_explicite",
      extrait: `${p.niveau} — client porté par le dossier référencé`,
      cible: "dossiers.client_id",
      entite: "client",
      candidats: ids,
    });
  }

  /* --- N8 : historique relationnel faible (rattachements CD-SI-001-A déjà posés) --- */
  const hist = referentiel.rattachementsExistants ?? {};
  const histo: [EntiteResolue, string, string][] = [
    ["client", txt(hist.client_id), "crm_emails.client_id"],
    ["dossier", txt(hist.dossier_id), "crm_emails.dossier_id"],
    ["contrat", txt(hist.contrat_id), "crm_emails.contrat_id"],
    ["compagnie", txt(hist.compagnie_id), "crm_emails.compagnie_id"],
  ];
  for (const [entite, id, cible] of histo) {
    if (!id) continue;
    ajouter({
      niveau: "N8",
      type: "thread",
      extrait: `N8 — rattachement historique faible (${entite})`,
      cible,
      entite,
      candidats: [id],
    });
  }

  /* --- N9 : facteur contextuel, notamment dossier unique actif --- */
  const actifs = referentiel.dossiersActifsParClient ?? {};
  const clientsPreuves = [
    ...new Set(preuves.filter((p) => p.entite === "client").flatMap((p) => p.candidats)),
  ];
  for (const clientId of clientsPreuves) {
    const liste = actifs[clientId] ?? [];
    if (liste.length !== 1) continue;
    ajouter({
      niveau: "N9",
      type: "autre",
      extrait: "N9 — dossier unique actif du client (facteur contextuel)",
      cible: "dossiers.statut",
      entite: "dossier",
      candidats: [liste[0]!],
    });
  }

  return preuves;
}

/* ------------------------------------------------------------------ */
/* 2. Unicité, convergence, contradictions                             */
/* ------------------------------------------------------------------ */

export interface ResolutionEntite {
  entite: EntiteResolue;
  /** Candidat proposable, uniquement si convergence sans contradiction. */
  propose: string | null;
  /** Contradiction réelle entre preuves indépendantes. */
  contradiction: boolean;
  /** Arbitrage humain nécessaire (contradiction ou multi-candidats). */
  ambigu: boolean;
  candidats: string[];
  preuves: PreuveCroisement[];
  motif?: string;
}

/**
 * Ordre imposé (§8.1) : unicité par preuve, puis contradictions, puis convergence,
 * puis seulement proposition. Aucune arithmétique n'intervient.
 */
export function resoudreEntite(
  entite: EntiteResolue,
  preuves: PreuveCroisement[],
): ResolutionEntite {
  const pertinentes = preuves.filter((p) => p.entite === entite);
  const candidats = [...new Set(pertinentes.flatMap((p) => p.candidats))];
  const base: ResolutionEntite = {
    entite,
    propose: null,
    contradiction: false,
    ambigu: false,
    candidats,
    preuves: pertinentes,
  };
  if (pertinentes.length === 0) return base;

  const uniques = pertinentes.filter((p) => p.candidats.length === 1);
  const multiples = pertinentes.filter((p) => p.candidats.length > 1);

  // Contradiction : deux preuves indépendantes uniques désignent deux objets différents.
  const idsUniques = [...new Set(uniques.map((p) => p.candidats[0]!))];
  if (idsUniques.length > 1) {
    return {
      ...base,
      contradiction: true,
      ambigu: true,
      motif: "preuves indépendantes divergentes",
    };
  }

  // Multi-candidats sur une même preuve : arbitrage humain, aucune sélection automatique.
  if (multiples.length > 0 && idsUniques.length === 0) {
    return { ...base, ambigu: true, motif: "plusieurs candidats pour une même preuve" };
  }

  // Une preuve multiple qui ne contient pas le candidat unique est une contradiction.
  if (idsUniques.length === 1 && multiples.some((p) => !p.candidats.includes(idsUniques[0]!))) {
    return {
      ...base,
      contradiction: true,
      ambigu: true,
      motif: "candidats concurrents non convergents",
    };
  }

  if (idsUniques.length !== 1) return base;

  // Convergence : seule une preuve N1..N6 unique autorise une proposition.
  const porteuse = uniques.find((p) => NIVEAUX_PROPOSABLES.includes(p.niveau));
  if (!porteuse) {
    return { ...base, motif: "signaux faibles ou contextuels uniquement (N7 à N9)" };
  }
  return { ...base, propose: idsUniques[0]!, motif: `preuve ${porteuse.niveau} convergente` };
}

/* ------------------------------------------------------------------ */
/* 3. Construction de la sortie `ai_context`                           */
/* ------------------------------------------------------------------ */

export interface ResultatCroisement {
  contexte: EmailContext;
  statut: Exclude<EmailContextStatus, "CONFIRMED">;
  resolutions: Record<EntiteResolue, ResolutionEntite>;
  preuves: PreuveCroisement[];
}

const TYPE_AMBIGUITE: Partial<Record<EntiteResolue, AmbiguityType>> = {
  client: "client_multiple",
  dossier: "dossier_multiple",
  contrat: "contrat_multiple",
};

/**
 * Croise le contexte DETECTED du Lot 2 avec les référentiels lus.
 * N'écrit aucune FK, ne produit jamais `CONFIRMED`, ne touche pas `preuves[].poids`.
 */
export function croiserContexteEmail(
  contexte: EmailContext,
  referentiel: ReferentielCroisement,
  options: { analyseLe?: string } = {},
): ResultatCroisement {
  const analyseLe = options.analyseLe ?? new Date().toISOString();
  const preuves = collecterPreuves(contexte, referentiel);
  const resolutions = {} as Record<EntiteResolue, ResolutionEntite>;
  for (const entite of [
    "client",
    "dossier",
    "contrat",
    "compagnie",
    "produit",
    "document",
  ] as EntiteResolue[]) {
    resolutions[entite] = resoudreEntite(entite, preuves);
  }

  // Sécurité relationnelle : une liste de candidats potentiellement tronquée ne peut
  // jamais être considérée comme exhaustive. L'entité concernée devient ambiguë et
  // aucune proposition n'est produite sur cette base (aucun scoring, aucun arbitrage).
  const tronques = new Set(referentiel.referentielsTronques ?? []);
  if (tronques.size > 0) {
    for (const entite of Object.keys(resolutions) as EntiteResolue[]) {
      if (!tronques.has(TABLE_PAR_ENTITE[entite])) continue;
      const r = resolutions[entite];
      if (!r.propose && r.candidats.length === 0) continue;
      resolutions[entite] = {
        ...r,
        propose: null,
        ambigu: true,
        motif: "exhaustivité du référentiel non garantie (lecture potentiellement tronquée)",
      };
    }
  }

  const ambiguites: Ambiguity[] = [...(contexte.ambiguities ?? [])];
  const provenance = (p: PreuveCroisement[]) => ({
    source: "regle_deterministe" as const,
    champ: p[0]?.cible ?? null,
    modele: null,
    detecte_le: analyseLe,
    preuve_ids: p.map((x) => x.id),
  });

  const statutEntree = (r: ResolutionEntite): EmailContextStatus =>
    r.ambigu ? "AMBIGUOUS" : r.propose ? "PROPOSED" : "DETECTED";




  // Dossiers — une entrée par candidat lorsque l'arbitrage est nécessaire.
  const rDossier = resolutions.dossier;
  let dossiers = contexte.dossiers_detectes ?? [];
  if (rDossier.preuves.length > 0) {
    const statut = statutEntree(rDossier);
    const indexes = new Set(rDossier.preuves.map((p) => p.index).filter((i) => i !== undefined));
    dossiers = dossiers.flatMap((d, index) => {
      if (!indexes.has(index)) return [d];
      const prov = { ...d.provenance, ...provenance(rDossier.preuves) };
      if (rDossier.propose) {
        return [{ ...d, dossier_id_propose: rDossier.propose, statut, provenance: prov }];
      }
      if (rDossier.ambigu && rDossier.candidats.length > 1) {
        return rDossier.candidats.map(() => ({
          ...d,
          dossier_id_propose: null,
          statut,
          provenance: prov,
        }));
      }
      return [{ ...d, dossier_id_propose: null, statut, provenance: prov }];
    });
  }

  // Contrats
  const rContrat = resolutions.contrat;
  let contrats = contexte.contrats_detectes ?? [];
  if (rContrat.preuves.length > 0) {
    const statut = statutEntree(rContrat);
    const indexes = new Set(rContrat.preuves.map((p) => p.index).filter((i) => i !== undefined));
    contrats = contrats.flatMap((c, index) => {
      if (!indexes.has(index)) return [c];
      const prov = { ...c.provenance, ...provenance(rContrat.preuves) };
      if (rContrat.propose) {
        return [{ ...c, contrat_id_propose: rContrat.propose, statut, provenance: prov }];
      }
      if (rContrat.ambigu && rContrat.candidats.length > 1) {
        return rContrat.candidats.map(() => ({
          ...c,
          contrat_id_propose: null,
          statut,
          provenance: prov,
        }));
      }
      return [{ ...c, contrat_id_propose: null, statut, provenance: prov }];
    });
  }

  // Personnes — proposition client
  const rClient = resolutions.client;
  let personnes = contexte.personnes_detectees ?? [];
  if (rClient.preuves.length > 0) {
    const statut = statutEntree(rClient);
    const indexes = new Set(rClient.preuves.map((p) => p.index).filter((i) => i !== undefined));
    personnes = personnes.flatMap((p, index) => {
      if (!indexes.has(index)) return [p];
      const prov = { ...p.provenance, ...provenance(rClient.preuves) };
      if (rClient.propose) {
        return [{ ...p, client_id_propose: rClient.propose, statut, provenance: prov }];
      }
      if (rClient.ambigu && rClient.candidats.length > 1) {
        return rClient.candidats.map(() => ({
          ...p,
          client_id_propose: null,
          statut,
          provenance: prov,
        }));
      }
      return [{ ...p, client_id_propose: null, statut, provenance: prov }];
    });
  }

  // Produits
  const rProduit = resolutions.produit;
  let produits = contexte.produits_cites ?? [];
  if (rProduit.preuves.length > 0) {
    const statut = statutEntree(rProduit);
    const indexes = new Set(rProduit.preuves.map((p) => p.index).filter((i) => i !== undefined));
    produits = produits.map((p, index) =>
      indexes.has(index)
        ? {
            ...p,
            produit_id_propose: rProduit.propose ?? null,
            statut,
            provenance: { ...p.provenance, ...provenance(rProduit.preuves) },
          }
        : p,
    );
  }

  // Documents
  const rDocument = resolutions.document;
  let documents = contexte.documents_associes ?? [];
  if (rDocument.preuves.length > 0) {
    const statut = statutEntree(rDocument);
    const indexes = new Set(rDocument.preuves.map((p) => p.index).filter((i) => i !== undefined));
    documents = documents.map((d, index) =>
      indexes.has(index)
        ? {
            ...d,
            document_id_propose: rDocument.propose ?? null,
            statut,
            provenance: { ...d.provenance, ...provenance(rDocument.preuves) },
          }
        : d,
    );
  }

  // Ambiguïtés — une entrée par entité à arbitrer.
  for (const r of Object.values(resolutions)) {
    if (!r.ambigu) continue;
    ambiguites.push({
      type: r.contradiction ? "donnees_contradictoires" : (TYPE_AMBIGUITE[r.entite] ?? "autre"),
      description: `Lot 3 — ${r.entite} : ${r.motif ?? "arbitrage humain nécessaire"} (niveaux ${[
        ...new Set(r.preuves.map((p) => p.niveau)),
      ].join(", ")})`,
      candidats: r.candidats,
      resolution_requise: true,
    });
  }

  const contradiction = Object.values(resolutions).some((r) => r.contradiction);
  const ambigu = Object.values(resolutions).some((r) => r.ambigu);
  const propositions = Object.values(resolutions).filter((r) => r.propose).length;
  const statut: Exclude<EmailContextStatus, "CONFIRMED"> =
    contradiction || ambigu ? "AMBIGUOUS" : propositions > 0 ? "PROPOSED" : "DETECTED";

  // Correspondant : client proposé et compagnie proposée via `correspondant.compagnie_id`
  // uniquement. `compagnie_id_propose` n'existe pas et la FK `crm_emails.compagnie_id`
  // n'est jamais écrite.
  const rCompagnie = resolutions.compagnie;
  const correspondant = {
    ...(contexte.correspondant ?? {}),
    client_id: rClient.propose ?? contexte.correspondant?.client_id ?? null,
    compagnie_id: rCompagnie.propose ?? contexte.correspondant?.compagnie_id ?? null,
    statut: ambigu ? ("AMBIGUOUS" as const) : rClient.propose || rCompagnie.propose ? ("PROPOSED" as const) : (contexte.correspondant?.statut ?? "DETECTED"),
    provenance: {
      ...(contexte.correspondant?.provenance ?? {}),
      ...provenance([...rClient.preuves, ...rCompagnie.preuves]),
    },
  };

  // `preuves[]` : uniquement les champs existants du schéma 1.1.0.
  // `poids` n'est jamais écrit par le Lot 3 ; les preuves du Lot 2 sont conservées telles quelles.
  const preuvesSortie: Evidence[] = [
    ...(contexte.preuves ?? []),
    ...preuves.map((p) => ({
      id: p.id,
      type: p.type,
      extrait: p.extrait,
      cible: p.cible,
    })),
  ];

  const sortie: EmailContext = {
    ...contexte,
    schema_version: EMAIL_CONTEXT_SCHEMA_VERSION,
    correspondant,
    personnes_detectees: personnes,
    dossiers_detectes: dossiers,
    contrats_detectes: contrats,
    produits_cites: produits,
    documents_associes: documents,
    preuves: preuvesSortie,
    ambiguities: ambiguites,
    analyse: {
      ...(contexte.analyse ?? {}),
      statut,
      analyse_le: analyseLe,
      validation_humaine_requise: true,
      validated_by: null,
      validated_at: null,
      modifications_apportees: [
        ...(contexte.analyse?.modifications_apportees ?? []),
        `lot3_croisement:${statut}`,
      ],
      provenance: {
        source: "regle_deterministe",
        champ: "lot3_croisement",
        modele: null,
        detecte_le: analyseLe,
        preuve_ids: preuves.map((p) => p.id),
      },
    },
  };

  return { contexte: sortie, statut, resolutions, preuves };
}
