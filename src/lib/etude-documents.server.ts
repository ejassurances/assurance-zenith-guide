/**
 * EXPLOITATION MÉTIER DES DOCUMENTS ANALYSÉS (emprunteur & épargne).
 *
 * Point d'entrée unique appelé après la chaîne documentaire (classification →
 * rattachement → extraction → complétude) :
 *
 *  - offre de prêt / tableau d'amortissement  → pré-remplissage du recueil
 *    emprunteur puis, si le prêt est complet, envoi de la lettre de mission
 *    (délai DER et heures d'ouverture assurés par le circuit existant) ;
 *  - relevé annuel de placement (AV / PER)    → production de l'étude épargne
 *    (comparatif de frais + projections 3 / 8 / 10 ans).
 *
 * Garde-fous : aucune donnée inventée, aucune valeur humaine écrasée, aucune
 * étape réglementaire franchie (le devoir de conseil reste humain), erreurs
 * isolées document par document.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import type { SupabaseClient } from "@supabase/supabase-js";
import { prefillRecueilEmprunteur } from "./pret-prefill";

type Admin = SupabaseClient<any, any, any>;

export interface ResultatExploitation {
  traite: boolean;
  type_document: string | null;
  actions: string[];
  erreurs: string[];
}

async function extractionDocument(
  admin: Admin,
  documentId: string,
): Promise<{ type: string; donnees: Record<string, unknown> } | null> {
  const { data } = await admin
    .from("doc_extractions")
    .select("type_document, extracted_data, statut, created_at")
    .eq("document_id", documentId)
    .eq("statut", "extrait")
    .order("created_at", { ascending: false })
    .limit(1);
  const ligne = ((data ?? []) as any[])[0];
  if (!ligne) return null;
  return {
    type: String(ligne.type_document ?? ""),
    donnees: (ligne.extracted_data ?? {}) as Record<string, unknown>,
  };
}

/** Pré-remplit le recueil emprunteur du dossier depuis une offre de prêt. */
async function exploiterOffrePret(
  admin: Admin,
  params: { dossierId: string; donnees: Record<string, unknown>; userId: string | null },
  actions: string[],
): Promise<void> {
  const { data: dossierRow } = await admin
    .from("dossiers")
    .select("id, statut, type_assurance, recueil_besoins, client_email")
    .eq("id", params.dossierId)
    .maybeSingle();
  const dossier = dossierRow as any;
  if (!dossier || dossier.type_assurance !== "emprunteur") return;

  const { recueil, ajouts, manquants } = prefillRecueilEmprunteur(
    (dossier.recueil_besoins ?? null) as Record<string, unknown> | null,
    params.donnees,
  );

  if (ajouts.length > 0) {
    const { error } = await admin
      .from("dossiers")
      .update({ recueil_besoins: recueil as never })
      .eq("id", params.dossierId);
    if (error) throw new Error(error.message);
    actions.push(`recueil emprunteur pré-rempli (${ajouts.join(", ")})`);
    await admin.from("dossier_etapes_historique").insert({
      dossier_id: params.dossierId,
      ancienne_etape: dossier.statut,
      nouvelle_etape: dossier.statut,
      commentaire: `Offre de prêt analysée : ${ajouts.join(", ")} reportés au recueil des besoins.`.slice(0, 500),
      par: params.userId,
    });
  }

  if (manquants.length > 0) {
    actions.push(`recueil incomplet (${manquants.join(", ")}) — lettre de mission non déclenchée`);
    return;
  }

  // Le prêt et les assurés sont complets : la lettre de mission peut partir.
  // Le délai DER et le report hors horaires restent assurés par le circuit
  // existant ; un échec n'interrompt rien (reprise par le job quotidien).
  try {
    const { data: lm } = await admin
      .from("lettres_mission")
      .select("id")
      .eq("dossier_id", params.dossierId)
      .neq("statut", "annulee")
      .limit(1)
      .maybeSingle();
    if (lm) {
      actions.push("lettre de mission déjà émise");
      return;
    }
    if (!dossier.client_email) {
      actions.push("aucun email client : lettre de mission à envoyer manuellement");
      return;
    }
    const { envoyerLettreMission, dateReferenceDer } = await import("./lettres-mission.server");
    const { etatDelaiLettreMission } = await import("./lettre-mission-delai");
    const { APP_URL } = await import("./app-url");
    const { data: dossierClient } = await admin
      .from("dossiers")
      .select("client_id")
      .eq("id", params.dossierId)
      .maybeSingle();
    const derLe = await dateReferenceDer(admin, (dossierClient as any)?.client_id ?? null);
    const etat = etatDelaiLettreMission(derLe);
    if (!etat.autorise) {
      actions.push(`lettre de mission différée : ${etat.motif ?? "délai non écoulé"}`);
      return;
    }
    await envoyerLettreMission(admin, params.dossierId, params.userId ?? "", APP_URL);
    actions.push("lettre de mission envoyée");
  } catch (e) {
    actions.push(
      `lettre de mission non envoyée (reprise automatique) : ${e instanceof Error ? e.message : "erreur"}`,
    );
  }
}

/**
 * Exploite un document dont l'extraction est disponible. Sans effet si le
 * document n'est pas rattaché à un dossier ou si son type n'est pas exploitable.
 */
export async function exploiterDocumentEtude(
  admin: Admin,
  documentId: string,
  userId: string | null = null,
): Promise<ResultatExploitation> {
  const actions: string[] = [];
  const erreurs: string[] = [];

  const { data: docRow } = await admin
    .from("documents")
    .select("id, dossier_id")
    .eq("id", documentId)
    .maybeSingle();
  const dossierId = (docRow as { dossier_id: string | null } | null)?.dossier_id ?? null;
  const extraction = await extractionDocument(admin, documentId);
  if (!extraction || !dossierId) {
    return { traite: false, type_document: extraction?.type ?? null, actions, erreurs };
  }

  try {
    if (extraction.type === "offre_pret") {
      await exploiterOffrePret(admin, { dossierId, donnees: extraction.donnees, userId }, actions);
    } else if (extraction.type === "releves_placements") {
      const { produireEtudeEpargne } = await import("./etude-epargne.server");
      const res = await produireEtudeEpargne(admin, { dossierId, userId });
      actions.push(
        res.statut === "produite"
          ? `étude épargne produite (${res.produit_retenu?.produit_nom ?? "produit du cabinet"})`
          : `étude épargne non produite : ${res.motif ?? res.statut}`,
      );
    } else {
      return { traite: false, type_document: extraction.type, actions, erreurs };
    }
  } catch (e) {
    erreurs.push(e instanceof Error ? e.message : "erreur inconnue");
  }

  return { traite: erreurs.length === 0, type_document: extraction.type, actions, erreurs };
}

/**
 * Après SIGNATURE de la lettre de mission : lancement de l'étude et de la
 * tarification. Aucune production de devoir de conseil : cet acte reste en
 * validation humaine (ACPR / DDA).
 */
export async function lancerEtudeApresLettreMission(
  admin: Admin,
  dossierId: string,
  userId: string | null = null,
): Promise<{ branche: string | null; actions: string[]; erreurs: string[] }> {
  const actions: string[] = [];
  const erreurs: string[] = [];
  const { data: dossierRow } = await admin
    .from("dossiers")
    .select("id, type_assurance")
    .eq("id", dossierId)
    .maybeSingle();
  const branche = (dossierRow as { type_assurance: string | null } | null)?.type_assurance ?? null;

  try {
    if (branche === "epargne_retraite") {
      const { produireEtudeEpargne } = await import("./etude-epargne.server");
      const res = await produireEtudeEpargne(admin, { dossierId, userId });
      actions.push(
        res.statut === "produite"
          ? "étude épargne produite"
          : `étude épargne non produite : ${res.motif ?? res.statut}`,
      );
    } else if (branche === "emprunteur") {
      const { tariferDossierUgip } = await import("./ugip/tarification.server");
      const res = await tariferDossierUgip(admin, { dossierId }, userId ?? "");
      actions.push(`tarification emprunteur : ${JSON.stringify(res).slice(0, 200)}`);
    }
  } catch (e) {
    erreurs.push(e instanceof Error ? e.message : "erreur inconnue");
  }

  return { branche, actions, erreurs };
}
