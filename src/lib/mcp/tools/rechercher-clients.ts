import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "rechercher_clients",
  title: "Rechercher des clients",
  description:
    "Recherche les fiches clients du cabinet par nom, prénom, e-mail ou référence, et renvoie leurs coordonnées principales.",
  inputSchema: {
    recherche: z.string().trim().min(1).describe("Nom, prénom, e-mail ou référence à rechercher."),
    limite: z.number().int().min(1).max(50).optional().describe("Nombre maximum de fiches (10 par défaut)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ recherche, limite }, ctx) => {
    if (!ctx.isAuthenticated())
      return { content: [{ type: "text", text: "Non authentifié" }], isError: true };
    const supabase = supabaseForUser(ctx);
    const motif = `%${recherche.replace(/[%,]/g, " ")}%`;
    const { data, error } = await supabase
      .from("clients")
      .select("id, reference, civilite, nom, prenom, email, mobile, ville, statut, dda_statut, created_at")
      .or(`nom.ilike.${motif},prenom.ilike.${motif},email.ilike.${motif},reference.ilike.${motif}`)
      .order("created_at", { ascending: false })
      .limit(limite ?? 10);
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? []) }],
      structuredContent: { clients: data ?? [] },
    };
  },
});
