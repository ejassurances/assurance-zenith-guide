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
import {
  croiserContexteEmail,
  referentielVide,
  type ReferentielCroisement,
  type ResultatCroisement,
} from "./email-context-resolution";
import { lireContexteEmail } from "./email-context-schema";
import type { EmailContext } from "./email-context-types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUTS_DOSSIER_ACTIFS = new Set([
  "nouveau",
  "en_cours",
  "lettre_mission_envoyee",
  "dda_validee",
  "devis_en_cours",
  "devoir_conseil_envoye",
  "devoir_conseil_signe",
  "souscription_envoyee",
  "contrat_valide",
  "contrat_actif",
]);

export type MotifNonTraitement =
  | "email_introuvable"
  | "contexte_non_conforme"
  | "statut_non_eligible"
  | "referentiel_indisponible"
  | "sortie_non_conforme"
  | "validation_humaine_existante"
  | "contexte_saisi_par_humain";

export interface ResultatResolutionEmail {
  ecrit: boolean;
  motif?: MotifNonTraitement | string;
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

interface ClientSupabase {
  from: (table: string) => any;
}

/**
 * Construit le référentiel de candidats par requêtes SELECT strictement ciblées.
 * Aucune écriture, aucune RPC, aucune table hors §5 du DESIGN V1.2.
 */
export async function lireReferentiel(
  db: ClientSupabase,
  contexte: EmailContext,
  rattachementsExistants: ReferentielCroisement["rattachementsExistants"] = {},
): Promise<ReferentielCroisement> {
  const referentiel: ReferentielCroisement = { ...referentielVide(), rattachementsExistants };

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
    const { data } = await db
      .from("clients")
      .select("id, nom, prenom, email, email2, telephone, statut")
      .or(filtres)
      .limit(50);
    referentiel.clients = data ?? [];
  }

  // dossiers — par référence citée, puis dossiers des clients candidats (contexte N9)
  const clientIds = [...new Set(referentiel.clients.map((c) => c.id))];
  const refsUuid = [...refsDossier].filter((r) => UUID.test(r));
  if (refsDossier.size > 0 || clientIds.length > 0) {
    const dossiers: ReferentielCroisement["dossiers"] = [];
    if (refsDossier.size > 0) {
      const { data } = await db
        .from("dossiers")
        .select("id, reference, client_id, statut")
        .or(
          [ou(["reference"], refsDossier), refsUuid.length > 0 ? `id.in.(${refsUuid.join(",")})` : ""]
            .filter(Boolean)
            .join(","),
        )
        .limit(50);
      dossiers.push(...(data ?? []));
    }
    if (clientIds.length > 0) {
      const { data } = await db
        .from("dossiers")
        .select("id, reference, client_id, statut")
        .in("client_id", clientIds)
        .limit(200);
      dossiers.push(...(data ?? []));
    }
    const vus = new Set<string>();
    referentiel.dossiers = dossiers.filter((d) => (vus.has(d.id) ? false : (vus.add(d.id), true)));
  }

  // contrats — par numéro de police cité, puis contrats des clients candidats
  if (numerosContrat.size > 0 || clientIds.length > 0) {
    const contrats: ReferentielCroisement["contrats"] = [];
    if (numerosContrat.size > 0) {
      const { data } = await db
        .from("contrats")
        .select("id, numero, client_id, dossier_id, compagnie_id, produit_id, statut")
        .or(ou(["numero"], numerosContrat))
        .limit(50);
      contrats.push(...(data ?? []));
    }
    if (clientIds.length > 0) {
      const { data } = await db
        .from("contrats")
        .select("id, numero, client_id, dossier_id, compagnie_id, produit_id, statut")
        .in("client_id", clientIds)
        .limit(200);
      contrats.push(...(data ?? []));
    }
    const vus = new Set<string>();
    referentiel.contrats = contrats.filter((c) => (vus.has(c.id) ? false : (vus.add(c.id), true)));
  }

  // compagnies — N4 (domaine professionnel) et compagnies dérivées des contrats
  {
    const { data } = await db.from("compagnies").select("id, nom, contact_email, site_web").limit(500);
    referentiel.compagnies = data ?? [];
  }

  // produits
  const produitIds = [...new Set(referentiel.contrats.map((c) => txt(c.produit_id)).filter(Boolean))];
  if (libellesProduit.size > 0 || produitIds.length > 0) {
    const produits: ReferentielCroisement["produits"] = [];
    if (libellesProduit.size > 0) {
      const { data } = await db
        .from("produits")
        .select("id, nom, code_produit, compagnie_id")
        .or(ou(["nom", "code_produit"], libellesProduit))
        .limit(50);
      produits.push(...(data ?? []));
    }
    if (produitIds.length > 0) {
      const { data } = await db
        .from("produits")
        .select("id, nom, code_produit, compagnie_id")
        .in("id", produitIds)
        .limit(200);
      produits.push(...(data ?? []));
    }
    const vus = new Set<string>();
    referentiel.produits = produits.filter((p) => (vus.has(p.id) ? false : (vus.add(p.id), true)));
  }

  // documents — corrélation CD-SI-002 en lecture seule
  if (nomsFichier.size > 0) {
    const { data } = await db
      .from("documents")
      .select("id, nom, client_id, dossier_id, contrat_id")
      .or(ou(["nom"], nomsFichier))
      .limit(50);
    referentiel.documents = data ?? [];
  }

  // Facteur contextuel N9 : dossier unique actif par client
  const actifs: Record<string, string[]> = {};
  for (const d of referentiel.dossiers) {
    const cid = txt(d.client_id);
    if (!cid || !STATUTS_DOSSIER_ACTIFS.has(txt(d.statut))) continue;
    (actifs[cid] ??= []).push(d.id);
  }
  referentiel.dossiersActifsParClient = actifs;

  return referentiel;
}

/* ------------------------------------------------------------------ */
/* Orchestration : lecture -> croisement -> validation -> unique UPDATE */
/* ------------------------------------------------------------------ */

export async function croiserEtEnregistrerContexteEmail(
  emailId: string,
  options: { force?: boolean; analyseLe?: string; db?: ClientSupabase } = {},
): Promise<ResultatResolutionEmail> {
  const db =
    options.db ??
    (await import("@/integrations/supabase/client.server")).supabaseAdmin as unknown as ClientSupabase;

  const { data, error } = await db
    .from("crm_emails")
    .select("id, ai_context, client_id, dossier_id, contrat_id, compagnie_id")
    .eq("id", emailId)
    .maybeSingle();
  if (error || !data) return { ecrit: false, motif: "email_introuvable" };

  const garde = peutCroiserContexte(data.ai_context, { force: options.force });
  if (!garde.autorise) return { ecrit: false, motif: garde.raison };

  const contexte = lireContexteEmail(data.ai_context);
  if (!contexte) return { ecrit: false, motif: "contexte_non_conforme" };

  let referentiel: ReferentielCroisement;
  try {
    referentiel = await lireReferentiel(db, contexte, {
      client_id: data.client_id ?? null,
      dossier_id: data.dossier_id ?? null,
      contrat_id: data.contrat_id ?? null,
      compagnie_id: data.compagnie_id ?? null,
    });
  } catch (e) {
    console.error("[email-context/lot3] référentiel indisponible", e);
    return { ecrit: false, motif: "referentiel_indisponible" };
  }

  const resultat = croiserContexteEmail(contexte, referentiel, { analyseLe: options.analyseLe });

  // Validation runtime Lot 1 — rejet avant persistance si non conforme.
  const valide = lireContexteEmail(resultat.contexte);
  if (!valide) return { ecrit: false, motif: "sortie_non_conforme" };

  // UNIQUE MUTATION AUTORISÉE DU LOT 3.
  const { error: erreurEcriture } = await db
    .from("crm_emails")
    .update({ ai_context: valide as unknown as never })
    .eq("id", emailId);
  if (erreurEcriture) return { ecrit: false, motif: erreurEcriture.message };

  return {
    ecrit: true,
    statut: resultat.statut,
    contexte: valide,
    resolutions: resultat.resolutions,
  };
}
