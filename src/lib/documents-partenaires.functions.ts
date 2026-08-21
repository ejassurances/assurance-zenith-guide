import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const depotSchema = z.object({
  produit_id: z.string().uuid(),
  type: z.string().min(1).max(64),
  nom: z.string().min(1).max(200),
  version: z.string().max(60).nullable().optional(),
  mime_type: z.string().max(120).nullable().optional(),
  interne: z.boolean().optional(),
  /** Contenu du fichier encodé en base64 (24 Mo maximum côté transport). */
  contenu_base64: z.string().min(1).max(34_000_000),
});

/**
 * Dépose une CG / IPID / notice sur le Drive du cabinet
 * (04_PARTENAIRES_ET_COMPAGNIES/[Compagnie]/[Branche]) et n'enregistre que le
 * lien dans le CRM — aucun fichier lourd n'est conservé côté CRM.
 */
export const deposerDocumentProduitDrive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => depotSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { deposerDocumentProduitSurDrive } = await import("@/lib/documents-partenaires.server");
    const contenu = Uint8Array.from(Buffer.from(data.contenu_base64, "base64"));
    if (contenu.byteLength === 0) throw new Error("Le fichier est vide");
    return await deposerDocumentProduitSurDrive(context.supabase as never, {
      produit_id: data.produit_id,
      type: data.type,
      nom: data.nom,
      version: data.version ?? null,
      mime_type: data.mime_type ?? null,
      interne: data.interne ?? false,
      contenu,
      uploaded_by: context.userId,
    });
  });

/** Lien du dossier Drive d'une branche de compagnie (consultation directe). */
export const dossierDrivePartenaire = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ compagnie: z.string().nullable(), branche: z.string().nullable() }).parse(input),
  )
  .handler(async ({ data }) => {
    const { assurerDossierPartenaire } = await import("@/lib/documents-partenaires.server");
    return await assurerDossierPartenaire(data.compagnie, data.branche);
  });
