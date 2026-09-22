import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader, getRequestIP } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const offreSchema = z.object({
  compagnie: z.string().max(200),
  produit: z.string().max(200),
  formule: z.string().max(200).nullable().optional(),
  cotisation_mensuelle: z.number().nullable().optional(),
  cout_total: z.number().nullable().optional(),
  statut: z.enum(["retenue", "equivalente", "ecartee"]),
  commentaire: z.string().max(2000).nullable().optional(),
});

const saisieSchema = z.object({
  dossier_id: z.string().uuid(),
  /** Validation / relecture : génère ou met à jour le brouillon sans envoyer au client. */
  sans_envoi: z.boolean().optional(),
  recommandation: z.string().min(10).max(5000),
  motifs: z.string().min(10).max(5000),
  mises_en_garde: z.string().max(5000).optional(),
  compagnie: z.string().max(200).optional(),
  produit: z.string().max(200).optional(),
  cotisation_mensuelle: z.number().nullable().optional(),
  /** Mode de calcul de la cotisation emprunteur : CI (constante) ou CRD (dégressive). */
  type_cotisation: z.enum(["CI", "CRD"]).nullable().optional(),
  cotisation_min: z.number().nullable().optional(),
  cotisation_max: z.number().nullable().optional(),
  montant_total: z.number().nullable().optional(),
  frais_dossier: z.number().nullable().optional(),
  frais_souscription: z.number().nullable().optional(),
  frais_courtage: z.number().nullable().optional(),
  frais_adhesion: z.number().nullable().optional(),
  economie_estimee: z.number().nullable().optional(),
  garanties: z.string().max(5000).optional(),
  exigences_client: z.string().max(5000).optional(),
  offres: z.array(offreSchema).max(6).optional(),
  assiette: z.enum(["capital_initial", "capital_restant_du"]).optional(),
  capital_assure: z.number().nullable().optional(),
  capital_restant_du: z.number().nullable().optional(),
  quotite: z.number().nullable().optional(),
  duree_mois: z.number().nullable().optional(),
  ipid_remis: z.boolean().optional(),
  cg_remis: z.boolean().optional(),
  tarifs_remis: z.boolean().optional(),
  der_remis: z.boolean().optional(),
});

/** Génération native + envoi du devoir de conseil au client. */
export const envoyerDevoirConseilFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => saisieSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { envoyerDevoirConseil } = await import("./devoir-conseil.server");
    const { dossier_id, sans_envoi, ...saisie } = data;
    void sans_envoi;
    // La validation par le cabinet est le seul geste manuel : l'envoi au client
    // est déclenché automatiquement par le job une fois le délai écoulé.
    const res = await envoyerDevoirConseil(context.supabase, dossier_id, context.userId, saisie, {
      sansEnvoi: true,
      valider: true,
    });
    return { ok: true, ...res };
  });

const signerSchema = z.object({
  devoir_id: z.string().uuid(),
  signature_png: z.string().min(100).max(500_000),
  /** Le client demande, lors de cette même signature, l'échelonnement des frais de courtage sur 12 mois. */
  echelonnement_demande: z.boolean().optional(),
});

export const signerDevoirConseil = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => signerSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: devoir, error } = await supabase
      .from("devoirs_conseil")
      .select("id, statut, dossier_id, client_id, contenu, clients:client_id(user_id)")
      .eq("id", data.devoir_id)
      .maybeSingle();
    if (error || !devoir) throw new Error("Devoir de conseil introuvable");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((devoir as any).clients?.user_id !== userId) throw new Error("Non autorisé");
    if (devoir.statut === "signe") throw new Error("Document déjà signé");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fraisCourtage = Number((devoir as any).contenu?.conseil?.frais_courtage ?? 0);
    const echelonnementDemande = !!data.echelonnement_demande;
    const echelonnementMontantMensuel =
      echelonnementDemande && fraisCourtage > 0 ? Math.round((fraisCourtage / 12) * 100) / 100 : null;

    const { error: upErr } = await supabase
      .from("devoirs_conseil")
      .update({
        statut: "signe",
        signature_png: data.signature_png,
        signed_at: new Date().toISOString(),
        signed_ip: getRequestIP({ xForwardedFor: true }) ?? null,
        signed_ua: getRequestHeader("user-agent") ?? null,
        echelonnement_demande: echelonnementDemande,
        echelonnement_montant_mensuel: echelonnementMontantMensuel,
      })
      .eq("id", data.devoir_id);
    if (upErr) throw new Error(upErr.message);

    // Avancement du pipeline + historique : trigger SQL devoir_conseil_avance_dossier
    // (le client signataire n'a pas les droits RLS sur la table dossiers).

    // Archivage du PDF signé (le client n'a pas de droit d'écriture sur le stockage).
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { archiverDevoirConseil } = await import("./devoir-conseil-archive.server");
      await archiverDevoirConseil(supabaseAdmin, data.devoir_id, userId);
    } catch (e) {
      // La signature reste valide ; l'échec est tracé et repris par le job
      // nocturne de reprise des PDF DDA (plus d'échec silencieux).
      console.error("[dda] archivage devoir de conseil signé échoué", e);
    }

    return { ok: true };
  });

const refuserSchema = z.object({
  devoir_id: z.string().uuid(),
  motif: z.string().min(3).max(2000),
});

export const refuserDevoirConseil = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => refuserSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: devoir, error } = await supabase
      .from("devoirs_conseil")
      .select("id, statut, dossier_id, clients:client_id(user_id)")
      .eq("id", data.devoir_id)
      .maybeSingle();
    if (error || !devoir) throw new Error("Devoir de conseil introuvable");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((devoir as any).clients?.user_id !== userId) throw new Error("Non autorisé");
    if (devoir.statut === "signe") throw new Error("Document déjà signé");

    const { error: upErr } = await supabase
      .from("devoirs_conseil")
      .update({
        statut: "refuse",
        refus_motif: data.motif,
        refuse_le: new Date().toISOString(),
        signed_ip: getRequestIP({ xForwardedFor: true }) ?? null,
        signed_ua: getRequestHeader("user-agent") ?? null,
      })
      .eq("id", data.devoir_id);
    if (upErr) throw new Error(upErr.message);

    // Avancement du pipeline + historique : trigger SQL devoir_conseil_avance_dossier.

    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { archiverDevoirConseil } = await import("./devoir-conseil-archive.server");
      await archiverDevoirConseil(supabaseAdmin, data.devoir_id, userId);
    } catch (e) {
      // Le refus reste enregistré ; l'échec est tracé et repris par le job
      // nocturne de reprise des PDF DDA.
      console.error("[dda] archivage devoir de conseil refusé échoué", e);
    }

    // Analyse IA du motif de refus (contre-proposition ou clôture en perdu).
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { analyserRefusDevoirConseil } = await import("./devoir-conseil-refus-analyse.server");
      await analyserRefusDevoirConseil(supabaseAdmin, data.devoir_id);
    } catch (e) {
      console.error("[refus] analyse IA non réalisée", e);
    }

    return { ok: true };
  });

/** URL signée du PDF du devoir de conseil (staff ou client concerné). */
export const pdfDevoirConseil = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ devoir_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    // La lecture applique la RLS : si le devoir n'est pas visible, accès refusé.
    const { data: devoir, error } = await context.supabase
      .from("devoirs_conseil")
      .select("id")
      .eq("id", data.devoir_id)
      .maybeSingle();
    if (error || !devoir) throw new Error("Devoir de conseil introuvable ou accès refusé");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { urlPdfDevoirConseil } = await import("./devoir-conseil-archive.server");
    const url = await urlPdfDevoirConseil(supabaseAdmin, data.devoir_id, context.userId);
    if (!url) throw new Error("PDF indisponible");
    return { url };
  });

const etapeSchema = z.object({
  dossier_id: z.string().uuid(),
  etape: z.enum([
    "nouveau",
    "en_cours",
    "lettre_mission_envoyee",
    "dda_validee",
    "devis_en_cours",
    "devoir_conseil_envoye",
    "devoir_conseil_signe",
    "devoir_conseil_refuse",
    "souscription_envoyee",
    "contrat_valide",
    "contrat_actif",
    "cloture",
    "perdu",
  ]),
  commentaire: z.string().max(1000).optional(),
});

/** Changement d'étape du pipeline par le staff, avec traçabilité ACPR. */
export const changerEtapeDossier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => etapeSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: dossier, error } = await supabase
      .from("dossiers")
      .select("id, statut")
      .eq("id", data.dossier_id)
      .maybeSingle();
    if (error || !dossier) throw new Error("Dossier introuvable ou accès refusé");

    // Passage à « Devoir de conseil envoyé » : le document est généré
    // automatiquement depuis le modèle de la typologie, puis envoyé au client.
    if (data.etape === "devoir_conseil_envoye") {
      const { data: existant } = await supabase
        .from("devoirs_conseil")
        .select("id, statut")
        .eq("dossier_id", data.dossier_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!existant || existant.statut !== "signe") {
        const { genererDevoirConseilAuto } = await import("./devoir-conseil.server");
        await genererDevoirConseilAuto(supabase, data.dossier_id, userId);
        if (data.commentaire) {
          await supabase.from("dossier_etapes_historique").insert({
            dossier_id: data.dossier_id,
            ancienne_etape: dossier.statut,
            nouvelle_etape: data.etape,
            commentaire: data.commentaire,
            par: userId,
          });
        }
        return { ok: true, devoir_genere: true };
      }
    }

    // Passage à « Souscription envoyée » : transmission du dossier à la
    // compagnie et armement des relances automatiques J+3 / J+7.
    if (data.etape === "souscription_envoyee") {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { envoyerSouscriptionCompagnie } = await import("./souscription.server");
      const res = await envoyerSouscriptionCompagnie(supabaseAdmin, data.dossier_id, userId, {
        commentaire: data.commentaire ?? null,
      });
      return { ok: true, souscription_envoyee: true, destinataire: res.destinataire };
    }

    const { error: upErr } = await supabase
      .from("dossiers")
      .update({
        statut: data.etape,
        // Un retour compagnie stoppe les relances automatiques.
        ...(data.etape === "contrat_valide" || data.etape === "contrat_actif"
          ? { souscription_retour_le: new Date().toISOString() }
          : {}),
      })
      .eq("id", data.dossier_id);
    if (upErr) throw new Error(upErr.message);

    await supabase.from("dossier_etapes_historique").insert({
      dossier_id: data.dossier_id,
      ancienne_etape: dossier.statut,
      nouvelle_etape: data.etape,
      commentaire: data.commentaire ?? null,
      par: userId,
    });

    // Contrat confirmé par la compagnie : il entre au portefeuille (client
    // actif, chiffre d'affaires, date de fin), même si les documents DDA
    // restent à faire signer — une tâche de régularisation est alors créée.
    if (data.etape === "contrat_valide" || data.etape === "contrat_actif") {
      const { creerContratDepuisDossier } = await import("./contrat-depuis-dossier.server");
      const contrat = await creerContratDepuisDossier(supabase, data.dossier_id, userId);
      // Un contrat par assuré du prêt : chacun porte sa référence assureur,
      // son statut et sa commission prévisionnelle.
      return {
        ok: true,
        contrat_id: contrat.contrat_id,
        contrats_ids: contrat.contrats_ids,
        dda_a_regulariser: contrat.dda_a_regulariser,
      };
    }

    return { ok: true };
  });


/**
 * Le catalogue actif du cabinet ne contient-il qu'un seul produit pour la
 * branche du dossier ? Si oui, la règle « 3 devis minimum » ne s'applique pas
 * et le devoir de conseil bascule sur la mention « offre unique au catalogue ».
 */
export const catalogueOffreUniqueFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ branche: z.string().min(1).max(60) }).parse(input))
  .handler(async ({ data, context }) => {
    const { catalogueOffreUnique } = await import("./catalogue-branche.server");
    return { offre_unique: await catalogueOffreUnique(context.supabase, data.branche) };
  });
