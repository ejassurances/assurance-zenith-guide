import { createFileRoute } from "@tanstack/react-router";

/** Reprise ponctuelle des PDF DDA manquants (protégée par la clé publiable). */
export const Route = createFileRoute("/api/public/dda-pdf-repair")({
  server: {
    handlers: {

      GET: async ({ request }) => {
        const anon =
          process.env["SUPABASE_PUBLISHABLE_KEY"] || process.env["VITE_SUPABASE_PUBLISHABLE_KEY"] || null;
        if (!anon || request.headers.get("apikey") !== anon) {
          return new Response("Unauthorized", { status: 401 });
        }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { assurerArborescenceClient, DRIVE_REGISTRE_DDA } = await import("@/lib/drive-arborescence.server");
        const { assurerDossier, assurerChemin } = await import("@/lib/google-drive.server");
        const ids = ["a438c3bb-fcdf-4757-9b9b-fde965c85080","073a8175-28d3-41e0-bf72-24f2587dc1eb","00578742-5cf3-48d6-b27c-4b235a51236c"];
        const out: unknown[] = [];
        try {
          for (const id of ids) {
            const { folder_id } = await assurerArborescenceClient(supabaseAdmin as never, id);
            const cible = await assurerDossier("02_Recueil_et_Conformite", folder_id);
            const res = await fetch(
              `https://connector-gateway.lovable.dev/google_drive/drive/v3/files?q=${encodeURIComponent(`'${cible}' in parents and trashed=false`)}&fields=files(name,size)`,
              { headers: { Authorization: `Bearer ${process.env["LOVABLE_API_KEY"]}`, "X-Connection-Api-Key": process.env["GOOGLE_DRIVE_API_KEY"]! } },
            );
            out.push({ id, files: await res.json() });
          }
          const reg = await assurerChemin(DRIVE_REGISTRE_DDA);
          const res = await fetch(
            `https://connector-gateway.lovable.dev/google_drive/drive/v3/files?q=${encodeURIComponent(`'${reg}' in parents and trashed=false`)}&fields=files(name)`,
            { headers: { Authorization: `Bearer ${process.env["LOVABLE_API_KEY"]}`, "X-Connection-Api-Key": process.env["GOOGLE_DRIVE_API_KEY"]! } },
          );
          out.push({ registre: await res.json() });
        } catch (e) {
          out.push({ error: e instanceof Error ? e.message : String(e) });
        }
        return Response.json(out);
      },
      POST: async ({ request }) => {
        const anon =
          process.env["SUPABASE_PUBLISHABLE_KEY"] || process.env["VITE_SUPABASE_PUBLISHABLE_KEY"] || null;
        if (!anon || request.headers.get("apikey") !== anon) {
          return new Response("Unauthorized", { status: 401 });
        }
        const { reparerPdfDdaManquants } = await import("@/lib/dda-pdf-repair.server");
        try {
          return Response.json(await reparerPdfDdaManquants());
        } catch (e) {
          return Response.json({ error: e instanceof Error ? e.message : "erreur" }, { status: 500 });
        }
      },
    },
  },
});
