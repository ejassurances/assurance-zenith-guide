/**
 * CD-SI-001-B — LOT 4 : MOTEUR D'AUTORISATION DES FK (couche serveur).
 * Référence exclusive : docs/CD-SI-001-B-LOT4-DESIGN-V1.2.md
 *
 * Responsabilités, dans cet ordre strict :
 *  1. lecture de la ligne `crm_emails` (FK observées + `ai_context`) ;
 *  2. validation du contexte par le validateur du Lot 1 (aucun second schéma) ;
 *  3. lecture seule des référentiels réels (réutilisation du lecteur Lot 3) ;
 *  4. évaluation pure de l'autorisation (`evaluerAutorisationFk`) ;
 *  5. unique mutation : un `UPDATE` conditionnel mono-ligne posant les FK autorisées
 *     ET `ai_context` dans la même instruction, sous garde optimiste complète.
 *
 * INTERDICTIONS APPLIQUÉES : aucun INSERT / UPSERT / DELETE / RPC mutante, aucune
 * création de client, prospect, contrat, produit, document ou tâche, aucun appel
 * Gemini, aucun appel ni branchement Gmail, aucune modification de `triage_ia` /
 * `triage_le`, aucune migration, jamais `CONFIRMED` automatique, aucun scoring,
 * `preuves[].poids` ni lu ni écrit. Aucune FK n'est jamais remise à `NULL`.
 *
 * Le moteur reste ISOLÉ : aucun appelant de production n'est branché (§29).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { lireContexteEmail } from "./email-context-schema";
import type { EmailContext } from "./email-context-types";
import {
  lireReferentiel,
  lecteurSupabase,
  type LecteurLot3,
} from "./email-context-resolver.server";
import {
  contexteApresEcriture,
  evaluerAutorisationFk,
  referentielLot4Vide,
  type ChampFk,
  type DecisionLot4,
  type EtatEmailObserve,
  type ReferentielLot4,
} from "./email-fk-authorization";
import type { Database, Json } from "@/integrations/supabase/types";

export interface LigneEmailLot4 {
  id: string;
  ai_context: unknown;
  client_id: string | null;
  dossier_id: string | null;
  contrat_id: string | null;
  compagnie_id: string | null;
}

export interface ResultatEcritureFk {
  /** Nombre de lignes réellement affectées : 0 ⇒ REFUS (jamais un succès). */
  lignesAffectees: number;
  erreur: string | null;
}

/** Couche d'écriture du Lot 4 : une seule instruction conditionnelle autorisée. */
export interface EcrivainLot4 {
  lireEmail(emailId: string): Promise<LigneEmailLot4 | null>;
  appliquerEcritures(args: {
    observe: LigneEmailLot4;
    observeAiContext: EmailContext;
    valeurs: Partial<Record<ChampFk, string>>;
    aiContext: EmailContext;
  }): Promise<ResultatEcritureFk>;
}

export type MotifResultatLot4 =
  | "email_introuvable"
  | "contexte_non_conforme"
  | "referentiel_indisponible"
  | "sortie_non_conforme"
  | "refus"
  | "garde_optimiste"
  | "erreur_base";

export interface ResultatAutorisationLot4 {
  ecrit: boolean;
  motif?: MotifResultatLot4;
  decision?: DecisionLot4;
  contexte?: EmailContext;
  detail?: string;
}

/** Conversion sûre vers `Json` (aucun `any`, aucun cast). */
function enJson(valeur: unknown): Json {
  if (valeur === null || valeur === undefined) return null;
  if (typeof valeur === "string" || typeof valeur === "number" || typeof valeur === "boolean") {
    return valeur;
  }
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

/**
 * Adaptateur Supabase de la surface d'écriture conçue en N.2.
 * Garde optimiste : 4 FK observées + `ai_context` complet + `analyse.statut`
 * + `analyse.validated_by` + `analyse.validated_at` + `analyse.provenance.source`.
 */
export function ecrivainSupabase(client: SupabaseClient<Database>): EcrivainLot4 {
  return {
    async lireEmail(emailId) {
      const { data, error } = await client
        .from("crm_emails")
        .select("id, ai_context, client_id, dossier_id, contrat_id, compagnie_id")
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
      };
    },
    async appliquerEcritures({ observe, observeAiContext, valeurs, aiContext }) {
      const analyse = observeAiContext.analyse;
      let requete = client
        .from("crm_emails")
        .update({ ...valeurs, ai_context: enJson(aiContext) })
        .eq("id", observe.id)
        // 1. les 4 FK observées (aucune FK n'est jamais remise à NULL)
        .filter("client_id", observe.client_id ? "eq" : "is", observe.client_id ?? null)
        .filter("dossier_id", observe.dossier_id ? "eq" : "is", observe.dossier_id ?? null)
        .filter("contrat_id", observe.contrat_id ? "eq" : "is", observe.contrat_id ?? null)
        .filter("compagnie_id", observe.compagnie_id ? "eq" : "is", observe.compagnie_id ?? null)
        // 2. `ai_context` complet observé (détection de tout lost update)
        .filter("ai_context", "eq", JSON.stringify(enJson(observeAiContext)))
        // 3. `analyse.statut` observé
        .filter("ai_context->analyse->>statut", "eq", analyse?.statut ?? "");

      // 4-6. sentinelles humaines observées
      requete = analyse?.validated_by
        ? requete.filter("ai_context->analyse->>validated_by", "eq", analyse.validated_by)
        : requete.filter("ai_context->analyse->>validated_by", "is", null);
      requete = analyse?.validated_at
        ? requete.filter("ai_context->analyse->>validated_at", "eq", analyse.validated_at)
        : requete.filter("ai_context->analyse->>validated_at", "is", null);
      requete = analyse?.provenance?.source
        ? requete.filter(
            "ai_context->analyse->provenance->>source",
            "eq",
            analyse.provenance.source,
          )
        : requete.filter("ai_context->analyse->provenance->>source", "is", null);

      const { data, error } = await requete.select("id");
      if (error) return { lignesAffectees: 0, erreur: error.message };
      return { lignesAffectees: (data ?? []).length, erreur: null };
    },
  };
}

/** Projette le référentiel Lot 3 (lecture seule) sur le périmètre du Lot 4. */
export async function lireReferentielLot4(
  lecteur: LecteurLot3,
  contexte: EmailContext,
  observe: LigneEmailLot4,
): Promise<ReferentielLot4> {
  const complet = await lireReferentiel(lecteur, contexte, {
    client_id: observe.client_id,
    dossier_id: observe.dossier_id,
    contrat_id: observe.contrat_id,
    compagnie_id: observe.compagnie_id,
  });
  return {
    ...referentielLot4Vide(),
    clients: complet.clients,
    dossiers: complet.dossiers,
    contrats: complet.contrats,
    compagnies: complet.compagnies,
    documents: complet.documents,
    referentielsTronques: complet.referentielsTronques,
  };
}

/**
 * Orchestration : lecture -> validation -> référentiels -> évaluation -> UPDATE conditionnel.
 * Aucune écriture n'a lieu si la décision n'est pas `autorise`. Une affectation de
 * 0 ligne vaut REFUS : aucun faux succès, aucune reprise aveugle, aucun écrasement.
 */
export async function autoriserEtEcrireFkEmail(
  emailId: string,
  options: {
    force?: boolean;
    decideLe?: string;
    lecteur?: LecteurLot3;
    ecrivain?: EcrivainLot4;
  } = {},
): Promise<ResultatAutorisationLot4> {
  const admin = options.lecteur && options.ecrivain
    ? null
    : (await import("@/integrations/supabase/client.server")).supabaseAdmin;
  const lecteur = options.lecteur ?? lecteurSupabase(admin!);
  const ecrivain = options.ecrivain ?? ecrivainSupabase(admin!);

  const ligne = await ecrivain.lireEmail(emailId);
  if (!ligne) return { ecrit: false, motif: "email_introuvable" };

  const contexte = lireContexteEmail(ligne.ai_context);
  if (!contexte) return { ecrit: false, motif: "contexte_non_conforme" };

  let referentiel: ReferentielLot4;
  try {
    referentiel = await lireReferentielLot4(lecteur, contexte, ligne);
  } catch (e) {
    console.error("[email-context/lot4] référentiel indisponible", e);
    return { ecrit: false, motif: "referentiel_indisponible" };
  }

  const etat: EtatEmailObserve = {
    id: ligne.id,
    client_id: ligne.client_id,
    dossier_id: ligne.dossier_id,
    contrat_id: ligne.contrat_id,
    compagnie_id: ligne.compagnie_id,
    ai_context: contexte,
  };

  const decision = evaluerAutorisationFk(etat, referentiel, { force: options.force });
  if (!decision.autorise) return { ecrit: false, motif: "refus", decision };

  const nouveauContexte = contexteApresEcriture(etat, decision, { decideLe: options.decideLe });
  const valide = lireContexteEmail(nouveauContexte);
  if (!valide) return { ecrit: false, motif: "sortie_non_conforme", decision };

  const valeurs: Partial<Record<ChampFk, string>> = {};
  for (const ecriture of decision.ecritures) valeurs[ecriture.champ] = ecriture.valeur;

  const resultat = await ecrivain.appliquerEcritures({
    observe: ligne,
    observeAiContext: contexte,
    valeurs,
    aiContext: valide,
  });
  if (resultat.erreur) {
    return { ecrit: false, motif: "erreur_base", decision, detail: resultat.erreur };
  }
  if (resultat.lignesAffectees !== 1) {
    // Course détectée : état modifié entre lecture et écriture. Aucune reprise aveugle.
    return { ecrit: false, motif: "garde_optimiste", decision };
  }

  return { ecrit: true, decision, contexte: valide };
}
