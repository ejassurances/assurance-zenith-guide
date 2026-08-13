import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/**
 * Espace client : le client met à jour ses coordonnées et télécharge ses
 * propres documents. Les écritures passent par le serveur (liste blanche de
 * champs) car la RLS de la table clients réserve l'écriture au cabinet.
 */

const optionalText = (max: number) => z.string().trim().max(max).optional().nullable();

const coordonneesSchema = z.object({
  civilite: optionalText(20),
  prenom: optionalText(100),
  nom: z.string().trim().min(1).max(100),
  email2: optionalText(255),
  mobile: optionalText(30),
  telephone: optionalText(30),
  adresse: optionalText(255),
  complement_adresse: optionalText(255),
  code_postal: optionalText(10),
  ville: optionalText(120),
  pays: optionalText(80),
  preference_contact: optionalText(30),
});

const norm = (v?: string | null) => {
  const t = (v ?? "").trim();
  return t.length === 0 ? null : t;
};

export const majMesCoordonnees = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => coordonneesSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: client } = await supabaseAdmin
      .from("clients")
      .select("id")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!client) throw new Error("Aucune fiche client rattachée à votre compte.");

    const patch = {
      civilite: norm(data.civilite),
      prenom: norm(data.prenom),
      nom: data.nom.trim(),
      email2: norm(data.email2),
      mobile: norm(data.mobile),
      telephone: norm(data.telephone),
      adresse: norm(data.adresse),
      complement_adresse: norm(data.complement_adresse),
      code_postal: norm(data.code_postal),
      ville: norm(data.ville),
      pays: norm(data.pays),
      preference_contact: norm(data.preference_contact),
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabaseAdmin.from("clients").update(patch).eq("id", client.id);
    if (error) throw new Error(error.message);

    await supabaseAdmin.from("activites").insert({
      client_id: client.id,
      type: "systeme",
      titre: "Coordonnées modifiées par le client",
      contenu: "Mise à jour effectuée depuis l'espace client.",
      created_by: context.userId,
    });

    return { ok: true };
  });

const BUCKETS = ["conformite-documents", "dossier-documents"] as const;

/** URL signée d'un document du client (pièce KYC ou document de dossier). */
export const monFichierUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        source: z.enum(["kyc", "document"]),
        id: z.string().uuid(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: client } = await supabaseAdmin
      .from("clients")
      .select("id")
      .eq("user_id", context.userId)
      .maybeSingle();

    const table = data.source === "kyc" ? "client_kyc_documents" : "documents";
    const { data: row } = await supabaseAdmin
      .from(table)
      .select("storage_path, client_id")
      .eq("id", data.id)
      .maybeSingle();
    if (!row) throw new Error("Document introuvable");

    // Accès autorisé au client propriétaire, sinon on retombe sur la RLS staff.
    const proprietaire = client && (row as { client_id: string | null }).client_id === client.id;
    if (!proprietaire) {
      const { data: visible } = await context.supabase.from(table).select("id").eq("id", data.id).maybeSingle();
      if (!visible) throw new Error("Accès refusé");
    }

    const path = (row as { storage_path: string }).storage_path;
    for (const bucket of BUCKETS) {
      const { data: signed } = await supabaseAdmin.storage.from(bucket).createSignedUrl(path, 300);
      if (signed?.signedUrl) return { url: signed.signedUrl };
    }
    throw new Error("Fichier indisponible");
  });
