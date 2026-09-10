/**
 * CD-SI-001-B — LOT 3 : MOTEUR DE CROISEMENT (couche serveur).
 * Référence exclusive : docs/CD-SI-001-B-LOT3-DESIGN-V1.2.md
 *
 * Responsabilités, dans cet ordre strict :
 *  1. lecture du contexte `DETECTED` produit par le Lot 2 (`crm_emails.ai_context`) ;
 *  2. lecture seule des référentiels métier réels (§5 du DESIGN V1.2) ;
 *  3. croisement doctrinal N1..N9 par la couche pure `email-context-resolution` ;
 *  4. validation par le validateur du Lot 1 (aucun second schéma) ;
 *  5. unique mutation autorisée : `UPDATE public.crm_emails SET ai_context = ...`.
 *
 * INTERDICTIONS APPLIQUÉES : aucune écriture de FK (`client_id`, `dossier_id`,
 * `contrat_id`, `compagnie_id`), aucun INSERT/UPSERT/DELETE/RPC mutante, aucune
 * création de client, prospect, contrat, produit, document ou tâche, aucun appel
 * Gemini, aucun branchement Gmail, aucune modification de `triage_ia` / `triage_le`,
 * jamais `CONFIRMED`, aucun scoring, `preuves[].poids` ni lu ni écrit.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  croiserContexteEmail,
  referentielVide,
  type ClientRef,
  type CompagnieRef,
  type ContratRef,
  type DocumentRef,
  type DossierRef,
  type ProduitRef,
  type ReferentielCroisement,
  type ResultatCroisement,
} from "./email-context-resolution";
import { lireContexteEmail } from "./email-context-schema";
import type { EmailContext } from "./email-context-types";
import type { Database, Json } from "@/integrations/supabase/types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Référentiel unique : src/lib/referentiels.ts
import { STATUTS_DOSSIER_ACTIFS_SET as STATUTS_DOSSIER_ACTIFS } from "./referentiels";

export type MotifNonTraitement =
  | "email_introuvable"
  | "contexte_non_conforme"
  | "statut_non_eligible"
  | "referentiel_indisponible"
  | "sortie_non_conforme"
  | "validation_humaine_existante"
  | "contexte_saisi_par_humain"
  /** Q.11 : état modifié entre la lecture (T0) et l'écriture gardée (T2). */
  | "garde_optimiste"
  /** Q.11 : échec BDD lors de l'unique UPDATE gardé. */
  | "erreur_base";

export interface ResultatResolutionEmail {
  ecrit: boolean;
  motif?: MotifNonTraitement | string;
  /** Q.11 : détail non structurant (message BDD). Aucune donnée personnelle. */
  detail?: string;
  statut?: ResultatCroisement["statut"];
  contexte?: EmailContext;
  resolutions?: ResultatCroisement["resolutions"];
}

const txt = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/* ------------------------------------------------------------------ */
/* Garde d'idempotence — reprise de la doctrine du Lot 2 (§11)          */
/* ------------------------------------------------------------------ */

/**
 * Le Lot 3 ne traite que des contextes `DETECTED` et n'écrase jamais une
 * validation humaine ni un statut hérité d'un lot ultérieur (`CONFIRMED`).
 */
export function peutCroiserContexte(
  existant: unknown,
  options: { force?: boolean } = {},
): { autorise: boolean; raison?: MotifNonTraitement } {
  const courant = lireContexteEmail(existant);
  if (!courant) return { autorise: false, raison: "contexte_non_conforme" };
  const analyse = courant.analyse;
  if (analyse?.validated_at || analyse?.validated_by) {
    return { autorise: false, raison: "validation_humaine_existante" };
  }
  if (analyse?.provenance?.source === "humain") {
    return { autorise: false, raison: "contexte_saisi_par_humain" };
  }
  if (analyse?.statut === "CONFIRMED") {
    return { autorise: false, raison: "statut_non_eligible" };
  }
  const statut = analyse?.statut ?? "DETECTED";
  if (statut !== "DETECTED" && !options.force) {
    return { autorise: false, raison: "statut_non_eligible" };
  }
  return { autorise: true };
}

/* ------------------------------------------------------------------ */
/* Lecture seule des référentiels métier (§5)                          */
/* ------------------------------------------------------------------ */

/**
 * Abstraction de lecture strictement typée, locale au Lot 3.
 * Aucun `any`, aucun cast : chaque méthode expose exactement la lecture
 * autorisée par le §5 du DESIGN V1.2, plus l'unique mutation `ai_context`.
 */
export interface LectureBornee<L> {
  /** Lignes lues. */
  lignes: L[];
  /** `true` si la lecture a pu être tronquée : la liste n'est PAS exhaustive. */
  tronquee: boolean;
}

export interface LigneEmailLot3 {
  id: string;
  ai_context: unknown;
  client_id: string | null;
  dossier_id: string | null;
  contrat_id: string | null;
  compagnie_id: string | null;
  /**
   * Q.11 / R-UA-1 : jeton de version transporté de manière OPAQUE.
   * Jamais parsé, jamais reformaté, jamais tronqué, jamais `toISOString()`.
   */
  updated_at: string;
}

/** Q.11 : paramètres de l'unique mutation gardée du Lot 3 (état observé unique). */
export interface ParamsEcritureAiContext {
  emailId: string;
  /** UNIQUE état observé à T0, porteur de la garde optimiste. */
  observe: LigneEmailLot3;
  /** Contexte à écrire. */
  contexte: EmailContext;
}

/** Q.11 : résultat discriminant de l'unique mutation gardée. */
export interface ResultatEcritureAiContext {
  lignesAffectees: number;
  erreur: string | null;
}

export interface LecteurLot3 {
  lireEmail(emailId: string): Promise<LigneEmailLot3 | null>;
  clientsParIdentite(filtre: string): Promise<LectureBornee<ClientRef>>;
  dossiersParFiltre(filtre: string): Promise<LectureBornee<DossierRef>>;
  dossiersParClients(clientIds: readonly string[]): Promise<LectureBornee<DossierRef>>;
  /**
   * Références internes communiquées par l'assureur (table
   * `dossier_references_externes`) : rattachement sur preuve EXACTE uniquement.
   * Optionnel pour rester compatible avec les lecteurs de test existants.
   */
  dossiersParReferencesExternes?(references: readonly string[]): Promise<LectureBornee<DossierRef>>;
  contratsParFiltre(filtre: string): Promise<LectureBornee<ContratRef>>;
  contratsParClients(clientIds: readonly string[]): Promise<LectureBornee<ContratRef>>;
  compagniesToutes(): Promise<LectureBornee<CompagnieRef>>;
  produitsParFiltre(filtre: string): Promise<LectureBornee<ProduitRef>>;
  produitsParIds(ids: readonly string[]): Promise<LectureBornee<ProduitRef>>;
  documentsParFiltre(filtre: string): Promise<LectureBornee<DocumentRef>>;
  /**
   * Unique mutation autorisée du Lot 3, GARDÉE (Q.11 — option C).
   * Aucune signature ne permet d'écrire `ai_context` sans état observé.
   */
  ecrireAiContext(params: ParamsEcritureAiContext): Promise<ResultatEcritureAiContext>;
}

/* ------------------------------------------------------------------ */
/* Q.11 — composition de la garde optimiste (fonction pure, testable)  */
/* ------------------------------------------------------------------ */

export interface PredicatGarde {
  colonne: string;
  operateur: "eq" | "is";
  valeur: string | null;
}

/** Sentinelles humaines détectées dans un état observé (défense en profondeur). */
export function sentinellesHumaines(aiContext: unknown): {
  presente: boolean;
  validated_by: string | null;
  validated_at: string | null;
  source: string | null;
  statut: string | null;
} {
  const contexte = lireContexteEmail(aiContext);
  const analyse = contexte?.analyse;
  const validated_by = analyse?.validated_by ?? null;
  const validated_at = analyse?.validated_at ?? null;
  const source = analyse?.provenance?.source ?? null;
  const statut = analyse?.statut ?? null;
  return {
    presente: Boolean(validated_by || validated_at || source === "humain" || statut === "CONFIRMED"),
    validated_by,
    validated_at,
    source,
    statut,
  };
}

/**
 * Prédicats de la garde optimiste Q.11 (option C) :
 * `ai_context` complet observé + `analyse.statut` + les trois sentinelles JSON
 * + `updated_at` observé (transmis de manière opaque, R-UA-1).
 * Les 4 FK sont volontairement EXCLUES (Q.3) : le Lot 3 ne mute aucune FK.
 */
export function composerGardeQ11(observe: LigneEmailLot3): PredicatGarde[] {
  const s = sentinellesHumaines(observe.ai_context);
  return [
    { colonne: "ai_context", operateur: "eq", valeur: JSON.stringify(enJson(observe.ai_context)) },
    // M-1 (V1.2) — NULL-SAFE : statut présent → `eq.<valeur>` ; statut absent → `is.null`.
    // Aucune conversion en chaîne vide, aucune valeur artificielle (`DETECTED`).
    {
      colonne: "ai_context->analyse->>statut",
      operateur: s.statut === null ? "is" : "eq",
      valeur: s.statut,
    },
    {
      colonne: "ai_context->analyse->>validated_by",
      operateur: s.validated_by ? "eq" : "is",
      valeur: s.validated_by,
    },
    {
      colonne: "ai_context->analyse->>validated_at",
      operateur: s.validated_at ? "eq" : "is",
      valeur: s.validated_at,
    },
    {
      colonne: "ai_context->analyse->provenance->>source",
      operateur: s.source ? "eq" : "is",
      valeur: s.source,
    },
    // R-UA-1 : valeur brute, ni parsée ni normalisée. R-UA-3 : composante de la garde.
    { colonne: "updated_at", operateur: "eq", valeur: observe.updated_at },
  ];
}

/** R-UA-2 : `updated_at` absent, vide ou non exploitable → refus sûr, aucune écriture. */
export function updatedAtExploitable(valeur: unknown): boolean {
  return typeof valeur === "string" && valeur.trim().length > 0;
}

/**
 * Option B (défense en profondeur) : le Lot 3 ne doit jamais effacer une sentinelle
 * humaine présente dans l'état entrant. Aucun champ JSON créé.
 */
export function preserverSentinellesHumaines(entrant: EmailContext, sortant: EmailContext): EmailContext {
  const a = entrant.analyse;
  if (!a?.validated_by && !a?.validated_at && a?.provenance?.source !== "humain") return sortant;
  const analyseSortie = { ...(sortant.analyse ?? {}) };
  if (a?.validated_by) analyseSortie.validated_by = a.validated_by;
  if (a?.validated_at) analyseSortie.validated_at = a.validated_at;
  if (a?.validated_by || a?.validated_at) analyseSortie.validation_humaine_requise = false;
  if (a?.provenance?.source === "humain") {
    analyseSortie.provenance = { ...(analyseSortie.provenance ?? {}), source: "humain" };
  }
  return { ...sortant, analyse: analyseSortie };
}

/** Plafonds de lecture ; `PAGE` sert à la pagination exhaustive des compagnies. */
const PLAFOND_CIBLE = 50;
const PLAFOND_LIE = 200;
const PAGE = 1000;
const PAGES_MAX = 50;

/** Conversion sûre vers `Json` (aucun cast, aucun `any`). */
function enJson(valeur: unknown): Json {
  if (valeur === null || valeur === undefined) return null;
  if (typeof valeur === "string" || typeof valeur === "number" || typeof valeur === "boolean") return valeur;
  if (Array.isArray(valeur)) return valeur.map((v) => enJson(v));
  if (typeof valeur === "object") {
    const objet: { [cle: string]: Json } = {};
    for (const [cle, v] of Object.entries(valeur)) {
      if (v !== undefined) objet[cle] = enJson(v);
    }
    return objet;
  }
  return null;
}

const borne = <L>(lignes: L[] | null, plafond: number): LectureBornee<L> => {
  const tout = lignes ?? [];
  return { lignes: tout.slice(0, plafond), tronquee: tout.length > plafond };
};

/**
 * Adaptateur du client Supabase serveur (typé via les types générés).
 * Les colonnes sélectionnées et les filtres sont identiques à l'implémentation auditée ;
 * seul le plafond est augmenté de 1 afin de DÉTECTER une troncature éventuelle.
 */
export function lecteurSupabase(client: SupabaseClient<Database>): LecteurLot3 {
  return {
    async lireEmail(emailId) {
      const { data, error } = await client
        .from("crm_emails")
        .select("id, ai_context, client_id, dossier_id, contrat_id, compagnie_id, updated_at")
        .eq("id", emailId)
        .maybeSingle();
      if (error || !data) return null;
      return {
        id: data.id,
        ai_context: data.ai_context,
        client_id: data.client_id,
        dossier_id: data.dossier_id,
        contrat_id: data.contrat_id,
        compagnie_id: data.compagnie_id,
        // R-UA-1 : chaîne brute telle que renvoyée par la couche d'accès.
        updated_at: data.updated_at,
      };
    },
    async clientsParIdentite(filtre) {
      const { data } = await client
        .from("clients")
        .select("id, nom, prenom, email, email2, telephone, statut")
        .or(filtre)
        .limit(PLAFOND_CIBLE + 1);
      return borne(data, PLAFOND_CIBLE);
    },
    async dossiersParFiltre(filtre) {
      const { data } = await client
        .from("dossiers")
        .select("id, reference, client_id, statut")
        .or(filtre)
        .limit(PLAFOND_CIBLE + 1);
      return borne(data, PLAFOND_CIBLE);
    },
    async dossiersParReferencesExternes(references) {
      const refs = [...references];
      if (refs.length === 0) return borne([], PLAFOND_CIBLE);
      const { data: liens } = await client
        .from("dossier_references_externes")
        .select("dossier_id, reference")
        .in("reference", refs)
        .limit(PLAFOND_CIBLE + 1);
      const ids = [...new Set(((liens ?? []) as { dossier_id: string }[]).map((l) => l.dossier_id))];
      if (ids.length === 0) return borne([], PLAFOND_CIBLE);
      const { data } = await client
        .from("dossiers")
        .select("id, reference, client_id, statut")
        .in("id", ids)
        .limit(PLAFOND_CIBLE + 1);
      return borne(data, PLAFOND_CIBLE);
    },
    async dossiersParClients(clientIds) {
      const { data } = await client
        .from("dossiers")
        .select("id, reference, client_id, statut")
        .in("client_id", [...clientIds])
        .limit(PLAFOND_LIE + 1);
      return borne(data, PLAFOND_LIE);
    },
    async contratsParFiltre(filtre) {
      const { data } = await client
        .from("contrats")
        .select("id, numero, client_id, dossier_id, compagnie_id, produit_id, statut")
        .or(filtre)
        .limit(PLAFOND_CIBLE + 1);
      return borne(data, PLAFOND_CIBLE);
    },
    async contratsParClients(clientIds) {
      const { data } = await client
        .from("contrats")
        .select("id, numero, client_id, dossier_id, compagnie_id, produit_id, statut")
        .in("client_id", [...clientIds])
        .limit(PLAFOND_LIE + 1);
      return borne(data, PLAFOND_LIE);
    },
    async compagniesToutes() {
      // Pagination complète : le référentiel compagnies est un facteur N4 et doit
      // être exhaustif. À défaut (dépassement de PAGES_MAX), la lecture est déclarée tronquée.
      const lignes: CompagnieRef[] = [];
      for (let page = 0; page < PAGES_MAX; page += 1) {
        const debut = page * PAGE;
        const { data } = await client
          .from("compagnies")
          .select("id, nom, contact_email, site_web")
          .range(debut, debut + PAGE - 1);
        const lot = data ?? [];
        lignes.push(...lot);
        if (lot.length < PAGE) return { lignes, tronquee: false };
      }
      return { lignes, tronquee: true };
    },
    async produitsParFiltre(filtre) {
      const { data } = await client
        .from("produits")
        .select("id, nom, code_produit, compagnie_id")
        .or(filtre)
        .limit(PLAFOND_CIBLE + 1);
      return borne(data, PLAFOND_CIBLE);
    },
    async produitsParIds(ids) {
      const { data } = await client
        .from("produits")
        .select("id, nom, code_produit, compagnie_id")
        .in("id", [...ids])
        .limit(PLAFOND_LIE + 1);
      return borne(data, PLAFOND_LIE);
    },
    async documentsParFiltre(filtre) {
      // Le typage généré révèle que la colonne réelle est `file_name` (et non `nom`).
      // La lecture reste strictement en SELECT ; `nom` est la clé logique de `DocumentRef`.
      const { data } = await client
        .from("documents")
        .select("id, file_name, client_id, dossier_id, contrat_id")
        .or(filtre)
        .limit(PLAFOND_CIBLE + 1);
      const lignes: DocumentRef[] = (data ?? []).map((d) => ({
        id: d.id,
        nom: d.file_name,
        client_id: d.client_id,
        dossier_id: d.dossier_id,
        contrat_id: d.contrat_id,
      }));
      return borne(lignes, PLAFOND_CIBLE);
    },
    async ecrireAiContext({ emailId, observe, contexte }) {
      // UNIQUE MUTATION AUTORISÉE DU LOT 3, portée par la garde optimiste Q.11.
      // Aucun retry, aucun second UPDATE, aucune FK mutée.
      let requete = client
        .from("crm_emails")
        .update({ ai_context: enJson(contexte) })
        .eq("id", emailId);
      for (const p of composerGardeQ11(observe)) {
        requete = requete.filter(p.colonne, p.operateur, p.valeur);
      }
      const { data, error } = await requete.select("id");
      if (error) return { lignesAffectees: 0, erreur: error.message };
      return { lignesAffectees: (data ?? []).length, erreur: null };
    },
  };
}

/**
 * Construit le référentiel de candidats par requêtes SELECT strictement ciblées.
 * Aucune écriture, aucune RPC, aucune table hors §5 du DESIGN V1.2.
 * Toute lecture potentiellement tronquée est signalée dans `referentielsTronques`
 * afin qu'aucune proposition ne soit produite sur une liste non exhaustive.
 */
export async function lireReferentiel(
  db: LecteurLot3,
  contexte: EmailContext,
  rattachementsExistants: ReferentielCroisement["rattachementsExistants"] = {},
): Promise<ReferentielCroisement> {
  const referentiel: ReferentielCroisement = { ...referentielVide(), rattachementsExistants };
  const tronques = new Set<string>();

  const emails = new Set<string>();
  const telephones = new Set<string>();
  const noms = new Set<string>();
  const refsDossier = new Set<string>();
  const numerosContrat = new Set<string>();
  const libellesProduit = new Set<string>();
  const nomsFichier = new Set<string>();

  const corr = txt(contexte.correspondant?.email).toLowerCase();
  if (corr) emails.add(corr);
  for (const p of contexte.personnes_detectees ?? []) {
    if (txt(p.email)) emails.add(txt(p.email).toLowerCase());
    if (txt(p.telephone)) telephones.add(txt(p.telephone));
    if (txt(p.nom)) noms.add(txt(p.nom));
  }
  for (const d of contexte.dossiers_detectes ?? []) if (txt(d.reference_citee)) refsDossier.add(txt(d.reference_citee));
  for (const c of contexte.contrats_detectes ?? []) if (txt(c.numero_police)) numerosContrat.add(txt(c.numero_police));
  for (const p of contexte.produits_cites ?? []) if (txt(p.libelle)) libellesProduit.add(txt(p.libelle));
  for (const d of contexte.documents_associes ?? []) if (txt(d.nom_fichier)) nomsFichier.add(txt(d.nom_fichier));

  const nettoyer = (v: string): string => v.split(",").join(" ").split("(").join(" ").split(")").join(" ");
  const ou = (colonnes: string[], valeurs: Set<string>): string =>
    [...valeurs].flatMap((v) => colonnes.map((c) => `${c}.ilike.${nettoyer(v)}`)).join(",");

  // clients — candidats client / prospect technique (statut='prospect')
  if (emails.size > 0 || telephones.size > 0 || noms.size > 0) {
    const filtres = [
      ou(["email", "email2"], emails),
      ou(["telephone"], telephones),
      ou(["nom"], noms),
    ]
      .filter(Boolean)
      .join(",");
    const lecture = await db.clientsParIdentite(filtres);
    referentiel.clients = lecture.lignes;
    if (lecture.tronquee) tronques.add("clients");
  }

  // dossiers — par référence citée, puis dossiers des clients candidats (contexte N9)
  const clientIds = [...new Set(referentiel.clients.map((c) => c.id))];
  const refsUuid = [...refsDossier].filter((r) => UUID.test(r));
  if (refsDossier.size > 0 || clientIds.length > 0) {
    const dossiers: ReferentielCroisement["dossiers"] = [];
    if (refsDossier.size > 0) {
      const lecture = await db.dossiersParFiltre(
        [ou(["reference"], refsDossier), refsUuid.length > 0 ? `id.in.(${refsUuid.join(",")})` : ""]
          .filter(Boolean)
          .join(","),
      );
      dossiers.push(...lecture.lignes);
      if (lecture.tronquee) tronques.add("dossiers");
    }
    // Référence interne de l'assureur citée dans l'e-mail : preuve exacte
    // (au moins 5 caractères), jamais une simple ressemblance de nom.
    const refsExternes = [...refsDossier].filter((r) => r.length >= 5 && !UUID.test(r));
    if (refsExternes.length > 0 && db.dossiersParReferencesExternes) {
      const lecture = await db.dossiersParReferencesExternes(refsExternes);
      dossiers.push(...lecture.lignes);
      if (lecture.tronquee) tronques.add("dossiers");
    }
    if (clientIds.length > 0) {
      const lecture = await db.dossiersParClients(clientIds);
      dossiers.push(...lecture.lignes);
      if (lecture.tronquee) tronques.add("dossiers");
    }
    const vus = new Set<string>();
    referentiel.dossiers = dossiers.filter((d) => (vus.has(d.id) ? false : (vus.add(d.id), true)));
  }

  // contrats — par numéro de police cité, puis contrats des clients candidats
  if (numerosContrat.size > 0 || clientIds.length > 0) {
    const contrats: ReferentielCroisement["contrats"] = [];
    if (numerosContrat.size > 0) {
      const lecture = await db.contratsParFiltre(ou(["numero"], numerosContrat));
      contrats.push(...lecture.lignes);
      if (lecture.tronquee) tronques.add("contrats");
    }
    if (clientIds.length > 0) {
      const lecture = await db.contratsParClients(clientIds);
      contrats.push(...lecture.lignes);
      if (lecture.tronquee) tronques.add("contrats");
    }
    const vus = new Set<string>();
    referentiel.contrats = contrats.filter((c) => (vus.has(c.id) ? false : (vus.add(c.id), true)));
  }

  // compagnies — N4 (domaine professionnel) et compagnies dérivées des contrats
  {
    const lecture = await db.compagniesToutes();
    referentiel.compagnies = lecture.lignes;
    if (lecture.tronquee) tronques.add("compagnies");
  }

  // produits
  const produitIds = [...new Set(referentiel.contrats.map((c) => txt(c.produit_id)).filter(Boolean))];
  if (libellesProduit.size > 0 || produitIds.length > 0) {
    const produits: ReferentielCroisement["produits"] = [];
    if (libellesProduit.size > 0) {
      const lecture = await db.produitsParFiltre(ou(["nom", "code_produit"], libellesProduit));
      produits.push(...lecture.lignes);
      if (lecture.tronquee) tronques.add("produits");
    }
    if (produitIds.length > 0) {
      const lecture = await db.produitsParIds(produitIds);
      produits.push(...lecture.lignes);
      if (lecture.tronquee) tronques.add("produits");
    }
    const vus = new Set<string>();
    referentiel.produits = produits.filter((p) => (vus.has(p.id) ? false : (vus.add(p.id), true)));
  }

  // documents — corrélation CD-SI-002 en lecture seule
  if (nomsFichier.size > 0) {
    const lecture = await db.documentsParFiltre(ou(["file_name"], nomsFichier));
    referentiel.documents = lecture.lignes;
    if (lecture.tronquee) tronques.add("documents");
  }

  // Facteur contextuel N9 : dossier unique actif par client
  const actifs: Record<string, string[]> = {};
  for (const d of referentiel.dossiers) {
    const cid = txt(d.client_id);
    if (!cid || !STATUTS_DOSSIER_ACTIFS.has(txt(d.statut))) continue;
    (actifs[cid] ??= []).push(d.id);
  }
  referentiel.dossiersActifsParClient = actifs;
  referentiel.referentielsTronques = [...tronques];

  return referentiel;
}

/* ------------------------------------------------------------------ */
/* Orchestration : lecture -> croisement -> validation -> unique UPDATE */
/* ------------------------------------------------------------------ */

export async function croiserEtEnregistrerContexteEmail(
  emailId: string,
  options: { force?: boolean; analyseLe?: string; db?: LecteurLot3 } = {},
): Promise<ResultatResolutionEmail> {
  const db =
    options.db ??
    lecteurSupabase((await import("@/integrations/supabase/client.server")).supabaseAdmin);

  const ligne = await db.lireEmail(emailId);
  if (!ligne) return { ecrit: false, motif: "email_introuvable" };

  const garde = peutCroiserContexte(ligne.ai_context, { force: options.force });
  if (!garde.autorise) return { ecrit: false, motif: garde.raison };

  // R-UA-2 : jeton de version inexploitable -> refus sûr, aucune écriture tentée.
  if (!updatedAtExploitable(ligne.updated_at)) {
    return { ecrit: false, motif: "garde_optimiste", detail: "updated_at_inexploitable" };
  }

  const contexte = lireContexteEmail(ligne.ai_context);
  if (!contexte) return { ecrit: false, motif: "contexte_non_conforme" };


  let referentiel: ReferentielCroisement;
  try {
    referentiel = await lireReferentiel(db, contexte, {
      client_id: ligne.client_id,
      dossier_id: ligne.dossier_id,
      contrat_id: ligne.contrat_id,
      compagnie_id: ligne.compagnie_id,
    });
  } catch (e) {
    console.error("[email-context/lot3] référentiel indisponible", e);
    return { ecrit: false, motif: "referentiel_indisponible" };
  }

  const resultat = croiserContexteEmail(contexte, referentiel, { analyseLe: options.analyseLe });

  // Option B (défense en profondeur) : jamais d'effacement d'une sentinelle humaine entrante.
  const preserve = preserverSentinellesHumaines(contexte, resultat.contexte);

  // Validation runtime Lot 1 — rejet avant persistance si non conforme.
  const valide = lireContexteEmail(preserve);
  if (!valide) return { ecrit: false, motif: "sortie_non_conforme" };

  // Unique UPDATE gardé. Aucun retry, aucune seconde tentative, quel que soit le résultat.
  const ecriture = await db.ecrireAiContext({ emailId, observe: ligne, contexte: valide });
  if (ecriture.erreur) return { ecrit: false, motif: "erreur_base", detail: ecriture.erreur };
  if (ecriture.lignesAffectees !== 1) {
    console.warn("[email-context/lot3] garde optimiste : état modifié entre lecture et écriture", emailId);
    return { ecrit: false, motif: "garde_optimiste" };
  }

  return {
    ecrit: true,
    statut: resultat.statut,
    contexte: valide,
    resolutions: resultat.resolutions,
  };
}
