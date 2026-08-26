/**
 * CD-SI-001-B — LOT 4 : MOTEUR D'AUTORISATION DES FK (couche pure).
 * Référence exclusive : docs/CD-SI-001-B-LOT4-DESIGN-V1.2.md
 *
 * Le Lot 4 est une COUCHE D'AUTORISATION : sa finalité première est de REFUSER.
 * Il n'extrait rien, n'appelle ni Gemini ni Gmail, ne crée aucune entité, ne
 * produit jamais `CONFIRMED`, n'utilise aucun scoring et ne lit jamais
 * `preuves[].poids`.
 *
 * Chaîne doctrinale imposée (§J.1) :
 *   statut global -> preuves -> niveau porteur -> candidats -> exhaustivité
 *   -> contradictions -> convergence -> autorisation -> garde optimiste
 *
 * Module pur : aucun accès réseau, aucun accès base.
 */
import type {
  ClientRef,
  CompagnieRef,
  ContratRef,
  DocumentRef,
  DossierRef,
} from "./email-context-resolution";
import type { EmailContext } from "./email-context-types";

/* ------------------------------------------------------------------ */
/* Domaine du Lot 4                                                    */
/* ------------------------------------------------------------------ */

/** Les 4 seules FK maîtresses concernées (§20 / E). */
export const CHAMPS_FK = ["client_id", "dossier_id", "contrat_id", "compagnie_id"] as const;
export type ChampFk = (typeof CHAMPS_FK)[number];

/** Niveaux porteurs admissibles d'une écriture (D.4). Aucun autre niveau ne porte. */
export const NIVEAUX_PORTEURS = ["N1", "N2", "N3", "N4"] as const;
export type NiveauPorteur = (typeof NIVEAUX_PORTEURS)[number];

export type ModeEcriture = "preuve_directe" | "rebond";

export type MotifRefusLot4 =
  | "contexte_non_conforme"
  | "validation_humaine_existante"
  | "statut_confirmed"
  | "contexte_ambigu"
  | "statut_non_eligible"
  | "referentiel_non_exhaustif"
  | "niveau_porteur_indetermine"
  | "candidat_multiple"
  | "candidat_inexistant"
  | "uuid_invalide"
  | "contradiction"
  | "deja_rattache"
  | "aucune_preuve_porteuse"
  | "garde_optimiste"
  | "erreur_base";

export interface EcritureFk {
  champ: ChampFk;
  /** UUID cible, vérifié en forme et en existence. */
  valeur: string;
  /** Niveau doctrinal porteur — jamais promu, jamais déduit d'un score. */
  niveau: NiveauPorteur;
  mode: ModeEcriture;
  preuve_ids: string[];
}

export interface RefusFk {
  champ?: ChampFk;
  motif: MotifRefusLot4;
  detail?: string;
}

/** État observé de la ligne `crm_emails` avant décision (base de la garde optimiste). */
export interface EtatEmailObserve {
  id: string;
  client_id: string | null;
  dossier_id: string | null;
  contrat_id: string | null;
  compagnie_id: string | null;
  /** `ai_context` observé, tel que relu et validé par le validateur Lot 1. */
  ai_context: EmailContext;
}

/** Référentiels lus en seule lecture (mêmes objets réels que le Lot 3). */
export interface ReferentielLot4 {
  clients: ClientRef[];
  dossiers: DossierRef[];
  contrats: ContratRef[];
  compagnies: CompagnieRef[];
  documents: DocumentRef[];
  /** Tables dont l'exhaustivité de lecture n'est pas garantie (D.3 / I.5). */
  referentielsTronques?: string[];
}

export interface DecisionLot4 {
  autorise: boolean;
  ecritures: EcritureFk[];
  refus: RefusFk[];
  /** Identifiants de preuves Lot 3 effectivement invoqués. */
  preuve_ids: string[];
}

export function referentielLot4Vide(): ReferentielLot4 {
  return { clients: [], dossiers: [], contrats: [], compagnies: [], documents: [] };
}

/* ------------------------------------------------------------------ */
/* Normalisations documentaires (aucune tolérance approchée)           */
/* ------------------------------------------------------------------ */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ID_PREUVE_LOT3 = /^L3-(N[1-9])-\d+$/;

const txt = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const bas = (v: unknown): string => txt(v).toLowerCase();
const refNorm = (v: unknown): string => txt(v).toUpperCase().replace(/[^A-Z0-9]/g, "");
const tel = (v: unknown): string =>
  txt(v).replace(/[^0-9]/g, "").replace(/^0033/, "0");

const domaineEmail = (email: unknown): string => {
  const e = bas(email);
  const i = e.lastIndexOf("@");
  return i === -1 ? "" : e.slice(i + 1);
};

/** Domaine canonique d'un `compagnies.site_web` — I.4, égalité stricte ensuite. */
export function domaineCanonique(valeur: unknown): string {
  let v = bas(valeur);
  if (!v) return "";
  v = v.replace(/^[a-z]+:\/\//, "");
  v = v.split("/")[0] ?? "";
  v = v.split("?")[0] ?? "";
  v = v.replace(/^www\./, "");
  return v;
}

/** Domaines grand public / mutualisés exclus de N4 (I.4). */
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

const TABLE_PAR_CHAMP: Record<ChampFk, string> = {
  client_id: "clients",
  dossier_id: "dossiers",
  contrat_id: "contrats",
  compagnie_id: "compagnies",
};

/* ------------------------------------------------------------------ */
/* Niveau porteur (C.3 / C.3.1 / C.3.2)                                */
/* ------------------------------------------------------------------ */

/** Niveau lisible dans un identifiant de preuve Lot 3 — INDICE AUXILIAIRE seulement. */
export function niveauIndicatifPreuve(id: unknown): string | null {
  const m = ID_PREUVE_LOT3.exec(txt(id));
  return m ? (m[1] ?? null) : null;
}

/**
 * Preuves Lot 3 du niveau attendu, référencées par l'entrée `ai_context` traitée.
 * Les preuves héritées du Lot 2 (identifiant hors convention `L3-<niveau>-<n>`)
 * ne sont JAMAIS porteuses (C.3.2).
 */
function preuvesPorteuses(
  contexte: EmailContext,
  preuveIds: readonly string[] | undefined,
  niveau: NiveauPorteur,
): string[] {
  const existantes = new Set((contexte.preuves ?? []).map((p) => txt(p.id)));
  return [...new Set((preuveIds ?? []).map(txt))]
    .filter((id) => existantes.has(id) && niveauIndicatifPreuve(id) === niveau)
    .sort();
}

/* ------------------------------------------------------------------ */
/* Candidats par niveau — vérification champ par champ des champs réels */
/* ------------------------------------------------------------------ */

interface CandidatNiveau {
  niveau: NiveauPorteur;
  /** Candidats issus d'une correspondance exacte du référentiel exhaustif. */
  candidats: string[];
  preuve_ids: string[];
  /** `true` si le niveau porteur n'est pas reconstituable de manière sûre. */
  indetermine: boolean;
}

const vide = (niveau: NiveauPorteur): CandidatNiveau => ({
  niveau,
  candidats: [],
  preuve_ids: [],
  indetermine: false,
});

/** N1 — référence dossier explicite (exacte et unique) ou UUID dossier existant. */
function candidatsN1(contexte: EmailContext, ref: ReferentielLot4): CandidatNiveau {
  const resultat = vide("N1");
  for (const d of contexte.dossiers_detectes ?? []) {
    const brut = txt(d.reference_citee);
    if (!brut) continue;
    const cle = refNorm(brut);
    const trouves = UUID.test(brut)
      ? ref.dossiers.filter((x) => x.id.toLowerCase() === brut.toLowerCase())
      : ref.dossiers.filter((x) => cle.length > 0 && refNorm(x.reference) === cle);
    if (trouves.length === 0) continue;
    const preuves = preuvesPorteuses(contexte, d.provenance?.preuve_ids, "N1");
    if (preuves.length === 0) {
      resultat.indetermine = true;
      continue;
    }
    resultat.candidats.push(...trouves.map((x) => x.id));
    resultat.preuve_ids.push(...preuves);
  }
  resultat.candidats = [...new Set(resultat.candidats)];
  resultat.preuve_ids = [...new Set(resultat.preuve_ids)].sort();
  return resultat;
}

/** N2 — email EXPÉDITEUR exact et unique. Jamais un email cité dans le corps. */
function candidatsN2(contexte: EmailContext, ref: ReferentielLot4): CandidatNiveau {
  const resultat = vide("N2");
  const email = bas(contexte.correspondant?.email);
  if (!email) return resultat;
  const trouves = ref.clients.filter((c) => bas(c.email) === email || bas(c.email2) === email);
  if (trouves.length === 0) return resultat;
  const preuves = preuvesPorteuses(contexte, contexte.correspondant?.provenance?.preuve_ids, "N2");
  if (preuves.length === 0) {
    resultat.indetermine = true;
    return resultat;
  }
  resultat.candidats = [...new Set(trouves.map((c) => c.id))];
  resultat.preuve_ids = preuves;
  return resultat;
}

/** N3 — numéro de police cité, correspondance exacte et unique sur `contrats.numero`. */
function candidatsN3(contexte: EmailContext, ref: ReferentielLot4): CandidatNiveau {
  const resultat = vide("N3");
  for (const c of contexte.contrats_detectes ?? []) {
    const cle = refNorm(c.numero_police);
    if (!cle) continue;
    const trouves = ref.contrats.filter((x) => refNorm(x.numero) === cle);
    if (trouves.length === 0) continue;
    const preuves = preuvesPorteuses(contexte, c.provenance?.preuve_ids, "N3");
    if (preuves.length === 0) {
      resultat.indetermine = true;
      continue;
    }
    resultat.candidats.push(...trouves.map((x) => x.id));
    resultat.preuve_ids.push(...preuves);
  }
  resultat.candidats = [...new Set(resultat.candidats)];
  resultat.preuve_ids = [...new Set(resultat.preuve_ids)].sort();
  return resultat;
}

/** N4 — domaine professionnel expéditeur, exact et unique sur `compagnies`. */
function candidatsN4(contexte: EmailContext, ref: ReferentielLot4): CandidatNiveau {
  const resultat = vide("N4");
  const dom = domaineEmail(contexte.correspondant?.email);
  if (!dom || DOMAINES_GENERIQUES.has(dom)) return resultat;
  const trouves = ref.compagnies.filter(
    (c) => domaineEmail(c.contact_email) === dom || domaineCanonique(c.site_web) === dom,
  );
  if (trouves.length === 0) return resultat;
  const preuves = preuvesPorteuses(contexte, contexte.correspondant?.provenance?.preuve_ids, "N4");
  if (preuves.length === 0) {
    resultat.indetermine = true;
    return resultat;
  }
  resultat.candidats = [...new Set(trouves.map((c) => c.id))];
  resultat.preuve_ids = preuves;
  return resultat;
}

/** N5 — clients désignés par une personne citée (email/téléphone). JAMAIS porteur. */
function clientsN5(contexte: EmailContext, ref: ReferentielLot4): string[] {
  const ids = new Set<string>();
  for (const p of contexte.personnes_detectees ?? []) {
    const mail = bas(p.email);
    const phone = tel(p.telephone);
    for (const c of ref.clients) {
      if (mail && (bas(c.email) === mail || bas(c.email2) === mail)) ids.add(c.id);
      if (phone && tel(c.telephone) === phone) ids.add(c.id);
    }
  }
  return [...ids];
}

/** N6 — documents déjà rattachés (via `documents.file_name`). JAMAIS porteur. */
function rattachementsN6(
  contexte: EmailContext,
  ref: ReferentielLot4,
): { client: string[]; dossier: string[]; contrat: string[] } {
  const client = new Set<string>();
  const dossier = new Set<string>();
  const contrat = new Set<string>();
  for (const d of contexte.documents_associes ?? []) {
    const nom = bas(d.nom_fichier);
    if (!nom) continue;
    for (const doc of ref.documents.filter((x) => bas(x.nom) === nom)) {
      if (txt(doc.client_id)) client.add(txt(doc.client_id));
      if (txt(doc.dossier_id)) dossier.add(txt(doc.dossier_id));
      if (txt(doc.contrat_id)) contrat.add(txt(doc.contrat_id));
    }
  }
  return { client: [...client], dossier: [...dossier], contrat: [...contrat] };
}

/* ------------------------------------------------------------------ */
/* Évaluation d'autorisation                                           */
/* ------------------------------------------------------------------ */

const refuser = (refus: RefusFk[]): DecisionLot4 => ({
  autorise: false,
  ecritures: [],
  refus,
  preuve_ids: [],
});

/**
 * Évalue l'autorisation d'écriture des 4 FK maîtresses.
 * Aucune écriture n'est effectuée ici : la décision est pure et déterministe.
 */
export function evaluerAutorisationFk(
  etat: EtatEmailObserve,
  referentiel: ReferentielLot4,
  options: { force?: boolean } = {},
): DecisionLot4 {
  const contexte = etat.ai_context;
  const analyse = contexte.analyse;

  /* 1. Sentinelles humaines — protection ABSOLUE, `force` sans effet (L.2). */
  if (txt(analyse?.validated_by) || txt(analyse?.validated_at)) {
    return refuser([{ motif: "validation_humaine_existante" }]);
  }
  if (analyse?.provenance?.source === "humain") {
    return refuser([{ motif: "validation_humaine_existante", detail: "provenance.source=humain" }]);
  }
  if (analyse?.statut === "CONFIRMED") return refuser([{ motif: "statut_confirmed" }]);

  /* 2. Statut global : `AMBIGUOUS` bloque tout (J.4) ; seul `PROPOSED` est éligible. */
  if (analyse?.statut === "AMBIGUOUS") return refuser([{ motif: "contexte_ambigu" }]);
  if (analyse?.statut !== "PROPOSED") {
    return refuser([{ motif: "statut_non_eligible", detail: analyse?.statut ?? "absent" }]);
  }
  void options.force; // `force` ne peut jamais élargir le périmètre d'autorisation.

  /* 3. Exhaustivité des référentiels (D.3 / I.5) — blocage total. */
  const tronques = [...new Set(referentiel.referentielsTronques ?? [])];
  if (tronques.length > 0) {
    return refuser([{ motif: "referentiel_non_exhaustif", detail: tronques.join(",") }]);
  }

  /* 4. Preuves et niveaux porteurs, champ par champ. */
  const n1 = candidatsN1(contexte, referentiel);
  const n2 = candidatsN2(contexte, referentiel);
  const n3 = candidatsN3(contexte, referentiel);
  const n4 = candidatsN4(contexte, referentiel);
  const niveaux = [n1, n2, n3, n4];

  if (niveaux.some((n) => n.indetermine)) {
    return refuser([
      {
        motif: "niveau_porteur_indetermine",
        detail: niveaux.filter((n) => n.indetermine).map((n) => n.niveau).join(","),
      },
    ]);
  }

  /* 5. Unicité par niveau : plusieurs candidats = arbitrage humain (H.3 / J.2). */
  for (const n of niveaux) {
    if (n.candidats.length > 1) {
      return refuser([{ motif: "candidat_multiple", detail: n.niveau }]);
    }
  }

  const dossierN1 = n1.candidats[0] ?? null;
  const clientN2 = n2.candidats[0] ?? null;
  const contratN3 = n3.candidats[0] ?? null;
  const compagnieN4 = n4.candidats[0] ?? null;

  /* 6. Rebonds descendants autorisés (H.2), sans promotion de niveau. */
  const contrat = contratN3 ? referentiel.contrats.find((c) => c.id === contratN3) : undefined;
  if (contratN3 && !contrat) return refuser([{ motif: "candidat_inexistant", champ: "contrat_id" }]);
  const dossierRef = dossierN1 ? referentiel.dossiers.find((d) => d.id === dossierN1) : undefined;
  if (dossierN1 && !dossierRef) {
    return refuser([{ motif: "candidat_inexistant", champ: "dossier_id" }]);
  }

  const clientRebondContrat = txt(contrat?.client_id) || null;
  const dossierRebondContrat = txt(contrat?.dossier_id) || null;
  const compagnieRebondContrat = txt(contrat?.compagnie_id) || null;
  const clientRebondDossier = txt(dossierRef?.client_id) || null;

  /* 7. Contradictions — antérieures à toute autorisation (J.1). */
  const contradictions: string[] = [];
  const divergence = (nom: string, valeurs: (string | null)[]): void => {
    const distinctes = [...new Set(valeurs.filter((v): v is string => Boolean(v)))];
    if (distinctes.length > 1) contradictions.push(nom);
  };

  divergence("client", [clientN2, clientRebondContrat, clientRebondDossier]);
  divergence("dossier", [dossierN1, dossierRebondContrat]);
  divergence("compagnie", [compagnieN4, compagnieRebondContrat]);

  const clientRetenu = clientN2 ?? clientRebondContrat ?? clientRebondDossier ?? null;

  // Cohérence descendante : le dossier et le contrat retenus doivent appartenir au client retenu.
  const dossierRetenu = dossierN1 ?? dossierRebondContrat ?? null;
  if (clientRetenu && dossierRetenu) {
    const d = referentiel.dossiers.find((x) => x.id === dossierRetenu);
    if (d && txt(d.client_id) && txt(d.client_id) !== clientRetenu) contradictions.push("dossier_client");
  }
  if (clientRetenu && contrat && txt(contrat.client_id) && txt(contrat.client_id) !== clientRetenu) {
    contradictions.push("contrat_client");
  }

  // N5 / N6 : jamais porteurs, mais toute divergence bloque (D.2 / J.2).
  const n5 = clientsN5(contexte, referentiel);
  if (clientRetenu && n5.length > 0 && !n5.includes(clientRetenu)) contradictions.push("n5_divergent");
  const n6 = rattachementsN6(contexte, referentiel);
  if (clientRetenu && n6.client.length > 0 && !n6.client.includes(clientRetenu)) {
    contradictions.push("n6_client_divergent");
  }
  if (dossierRetenu && n6.dossier.length > 0 && !n6.dossier.includes(dossierRetenu)) {
    contradictions.push("n6_dossier_divergent");
  }
  if (contratN3 && n6.contrat.length > 0 && !n6.contrat.includes(contratN3)) {
    contradictions.push("n6_contrat_divergent");
  }

  if (contradictions.length > 0) {
    return refuser([{ motif: "contradiction", detail: [...new Set(contradictions)].join(",") }]);
  }

  /* 8. Convergence -> autorisation, strictement selon la matrice D.4 / E. */
  const candidates: EcritureFk[] = [];
  const ajouter = (
    champ: ChampFk,
    valeur: string | null,
    niveau: NiveauPorteur,
    mode: ModeEcriture,
    preuve_ids: string[],
  ): void => {
    if (!valeur || candidates.some((c) => c.champ === champ)) return;
    candidates.push({ champ, valeur, niveau, mode, preuve_ids: [...preuve_ids].sort() });
  };

  ajouter("contrat_id", contratN3, "N3", "preuve_directe", n3.preuve_ids);
  ajouter("dossier_id", dossierN1, "N1", "preuve_directe", n1.preuve_ids);
  ajouter("dossier_id", dossierRebondContrat, "N3", "rebond", n3.preuve_ids);
  ajouter("client_id", clientN2, "N2", "preuve_directe", n2.preuve_ids);
  ajouter("client_id", clientRebondContrat, "N3", "rebond", n3.preuve_ids);
  ajouter("client_id", clientRebondDossier, "N1", "rebond", n1.preuve_ids);
  ajouter("compagnie_id", compagnieN4, "N4", "preuve_directe", n4.preuve_ids);
  ajouter("compagnie_id", compagnieRebondContrat, "N3", "rebond", n3.preuve_ids);

  /* 9. Contrôles pré-écriture obligatoires (N.4). */
  const refus: RefusFk[] = [];
  const ecritures: EcritureFk[] = [];
  const existePar: Record<ChampFk, (id: string) => boolean> = {
    client_id: (id) => referentiel.clients.some((c) => c.id === id),
    dossier_id: (id) => referentiel.dossiers.some((d) => d.id === id),
    contrat_id: (id) => referentiel.contrats.some((c) => c.id === id),
    compagnie_id: (id) => referentiel.compagnies.some((c) => c.id === id),
  };

  for (const candidat of candidates) {
    if (!UUID.test(candidat.valeur)) {
      return refuser([{ champ: candidat.champ, motif: "uuid_invalide" }]);
    }
    // Existence : contrôlée dans le référentiel lu pour une preuve directe.
    // Pour un rebond, la valeur provient d'une FK réelle de la ligne source lue en base
    // (`contrats.client_id`, `contrats.dossier_id`, `contrats.compagnie_id`,
    // `dossiers.client_id`) : son existence est garantie par la contrainte FK PostgreSQL,
    // et toute violation résiduelle provoque de toute façon un rejet global (M.5).
    if (candidat.mode === "preuve_directe" && !existePar[candidat.champ](candidat.valeur)) {
      return refuser([
        {
          champ: candidat.champ,
          motif: "candidat_inexistant",
          detail: TABLE_PAR_CHAMP[candidat.champ],
        },
      ]);
    }

    const actuel = etat[candidat.champ];
    if (actuel) {
      if (actuel !== candidat.valeur) {
        return refuser([
          { champ: candidat.champ, motif: "contradiction", detail: "fk_existante_divergente" },
        ]);
      }
      refus.push({ champ: candidat.champ, motif: "deja_rattache" });
      continue;
    }
    ecritures.push(candidat);
  }

  if (ecritures.length === 0) {
    refus.push({
      motif: refus.length > 0 ? "deja_rattache" : "aucune_preuve_porteuse",
    });
    return { autorise: false, ecritures: [], refus, preuve_ids: [] };
  }

  return {
    autorise: true,
    ecritures,
    refus,
    preuve_ids: [...new Set(ecritures.flatMap((e) => e.preuve_ids))].sort(),
  };
}

/* ------------------------------------------------------------------ */
/* Traçabilité : `modifications_apportees` (K.5) et provenance          */
/* ------------------------------------------------------------------ */

/**
 * Clé normative et déterministe à 6 composantes (K.5) :
 *   source|champ|ancienne_valeur|nouvelle_valeur|niveau_ou_mode|preuve_ids
 */
export function cleModification(entree: {
  source: string;
  champ: string;
  ancienne_valeur: string | null;
  nouvelle_valeur: string | null;
  niveau_ou_mode: string;
  preuve_ids: readonly string[];
}): string {
  const ids = [...entree.preuve_ids].sort();
  return [
    entree.source,
    entree.champ.toLowerCase(),
    entree.ancienne_valeur ?? "null",
    entree.nouvelle_valeur ?? "null",
    entree.niveau_ou_mode,
    ids.length > 0 ? ids.join(",") : "-",
  ].join("|");
}

export function cleEcriture(etat: EtatEmailObserve, ecriture: EcritureFk): string {
  return cleModification({
    source: "regle_deterministe",
    champ: ecriture.champ,
    ancienne_valeur: etat[ecriture.champ],
    nouvelle_valeur: ecriture.valeur,
    niveau_ou_mode: ecriture.mode === "rebond" ? "rebond" : ecriture.niveau,
    preuve_ids: ecriture.preuve_ids,
  });
}

/**
 * Contexte à écrire dans la même instruction que les FK (M.3).
 * Ne change jamais `analyse.statut` (aucun `CONFIRMED` automatique), ne touche
 * ni `preuves[].poids`, ni les preuves héritées du Lot 2, ni `validated_*`.
 */
export function contexteApresEcriture(
  etat: EtatEmailObserve,
  decision: DecisionLot4,
  options: { decideLe?: string } = {},
): EmailContext {
  const decideLe = options.decideLe ?? new Date().toISOString();
  const contexte = etat.ai_context;
  const existantes = contexte.analyse?.modifications_apportees ?? [];
  const ajouts = decision.ecritures
    .map((e) => cleEcriture(etat, e))
    .filter((cle) => !existantes.includes(cle));

  return {
    ...contexte,
    analyse: {
      ...(contexte.analyse ?? {}),
      modifications_apportees: [...existantes, ...[...new Set(ajouts)]],
      provenance: {
        ...(contexte.analyse?.provenance ?? {}),
        source: "regle_deterministe",
        champ: "lot4_autorisation_fk",
        modele: null,
        detecte_le: decideLe,
        preuve_ids: decision.preuve_ids,
      },
    },
  };
}
