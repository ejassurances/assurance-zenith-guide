/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/**
 * Module sinistres — consultation par le cabinet et actions manuelles.
 * Chaque action produit un brouillon (file d'attente client_reponses_ia)
 * édité puis envoyé par le staff : jamais d'envoi direct.
 */

async function exigerStaff(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const roles = ((data ?? []) as { role: string }[]).map((r) => r.role);
  if (!roles.includes("admin") && !roles.includes("mandataire")) throw new Error("Accès réservé au cabinet.");
}

const LISTE_SELECT =
  "id, client_id, contrat_id, statut, resume, action_recommandee, date_ouverture, clos_le, clients(nom, prenom, email)";

const DETAIL_SELECT =
  "id, client_id, contrat_id, statut, resume, description, analyse_couverture, action_recommandee, notes, date_ouverture, clos_le, gmail_message_id, created_at, clients(nom, prenom, email), contrats(numero, assureur, produit, compagnie_id)";

export const listeSinistres = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ statut: z.string().optional().nullable() }).parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    await exigerStaff(context.supabase, context.userId);
    let requete = (context.supabase as any)
      .from("sinistres")
      .select(LISTE_SELECT)
      .order("date_ouverture", { ascending: false })
      .limit(200);
    if (data.statut) requete = requete.eq("statut", data.statut);
    const { data: rows, error } = await requete;
    if (error) throw new Error(error.message);
    return { sinistres: (rows ?? []) as any[] };
  });

export const detailSinistre = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await exigerStaff(context.supabase, context.userId);
    const { data: row, error } = await (context.supabase as any)
      .from("sinistres")
      .select(DETAIL_SELECT)
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Sinistre introuvable.");
    const { data: brouillons } = await (context.supabase as any)
      .from("client_reponses_ia")
      .select("id, objet, corps, statut, motif, destinataire, created_at")
      .eq("client_id", (row as any).client_id)
      .eq("statut", "brouillon")
      .order("created_at", { ascending: false })
      .limit(10);
    return { sinistre: row as any, brouillons: (brouillons ?? []) as any[] };
  });

/** Prépare un brouillon de réponse (non couvert, ou transmission compagnie). */
export const preparerBrouillonSinistre = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ id: z.string().uuid(), type: z.enum(["reponse_non_couvert", "transmission_compagnie"]) })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await exigerStaff(context.supabase, context.userId);
    const { data: row, error } = await (context.supabase as any)
      .from("sinistres")
      .select(DETAIL_SELECT)
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const s = row as any;
    if (!s) throw new Error("Sinistre introuvable.");

    const client = s.clients ?? {};
    const nom = [client.prenom, client.nom].filter(Boolean).join(" ") || "Madame, Monsieur";
    const contrat = s.contrats ?? {};

    let destinataire: string | null = client.email ?? null;
    let objet: string;
    let corps: string;
    let motif: string;

    if (data.type === "reponse_non_couvert") {
      objet = `Votre déclaration de sinistre — contrat ${contrat.numero ?? ""}`.trim().slice(0, 200);
      corps = [
        `Bonjour ${nom},`,
        "",
        "Nous avons étudié la situation que vous nous avez décrite au regard des garanties de votre contrat.",
        "",
        `[Analyse interne à reformuler avant envoi : ${s.analyse_couverture ?? "non renseignée"}]`,
        "",
        "Les conditions générales de votre contrat restent la référence contractuelle.",
        "",
        "Cordialement,",
        "L'équipe EJ Partners Assurances",
      ].join("\n");
      motif = "Brouillon préparé depuis la fiche sinistre — réponse « non couvert » à valider avant envoi.";
    } else {
      if (contrat.compagnie_id) {
        const { data: comp } = await (context.supabase as any)
          .from("compagnies")
          .select("contact_email")
          .eq("id", contrat.compagnie_id)
          .maybeSingle();
        destinataire = (comp as any)?.contact_email ?? null;
      } else {
        destinataire = null;
      }
      objet = `Déclaration de sinistre — ${nom} — contrat ${contrat.numero ?? ""}`.trim().slice(0, 200);
      corps = [
        "Bonjour,",
        "",
        `Nous vous transmettons la déclaration de sinistre de notre client ${nom}.`,
        `Contrat : ${contrat.numero ?? "à préciser"} — ${contrat.produit ?? ""} (${contrat.assureur ?? ""})`,
        "",
        `Sinistre déclaré : ${s.resume ?? "à préciser"}`,
        "",
        "[Compléter : pièces jointes, date de survenance, coordonnées du client.]",
        "",
        `Copie à adresser au client : ${client.email ?? "email client absent de la fiche"}`,
        "",
        "Cordialement,",
        "L'équipe EJ Partners Assurances",
      ].join("\n");
      motif = "Brouillon préparé depuis la fiche sinistre — transmission compagnie (client en copie) à valider avant envoi.";
    }

    const { data: insere, error: insErr } = await (context.supabase as any)
      .from("client_reponses_ia")
      .insert({
        client_id: s.client_id,
        contrat_id: s.contrat_id,
        categorie: "niveau_0",
        statut: "brouillon",
        objet,
        corps,
        motif,
        destinataire,
        resume: s.resume,
        created_by: context.userId,
      })
      .select("id")
      .maybeSingle();
    if (insErr) throw new Error(insErr.message);

    if (data.type === "transmission_compagnie") {
      await (context.supabase as any)
        .from("sinistres")
        .update({ statut: "transmis_compagnie", updated_at: new Date().toISOString() })
        .eq("id", s.id);
    }

    return { ok: true, reponse_id: (insere as any)?.id ?? null };
  });

/** Clôture manuelle du dossier sinistre. */
export const cloturerSinistre = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), notes: z.string().trim().max(4000).optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await exigerStaff(context.supabase, context.userId);
    const maintenant = new Date().toISOString();
    const { error } = await (context.supabase as any)
      .from("sinistres")
      .update({
        statut: "clos",
        etape: "clos",
        clos_le: maintenant,
        updated_at: maintenant,
        ...(data.notes ? { notes: data.notes } : {}),
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
