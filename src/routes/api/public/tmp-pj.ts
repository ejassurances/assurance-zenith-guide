import { createFileRoute } from "@tanstack/react-router";

/** Route temporaire de régularisation : récupère une pièce jointe Gmail. */
export const Route = createFileRoute("/api/public/tmp-pj")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const id = url.searchParams.get("id");
        if (!id) return new Response("id requis", { status: 400 });
        const { lireMessage, telechargerPieceJointe } = await import("@/lib/gmail.server");
        const msg = await lireMessage(id);
        const pj = msg.pieces_jointes.filter((p) => p.attachment_id);
        const idx = Number(url.searchParams.get("pj") ?? "-1");
        if (idx < 0) {
          return Response.json({
            sujet: msg.sujet,
            de: msg.de,
            date: msg.date,
            texte: msg.texte?.slice(0, 6000) ?? null,
            pieces: pj.map((p, i) => ({ i, nom: p.nom, mime: p.mime, taille: p.taille })),
          });
        }
        const cible = pj[idx];
        if (!cible?.attachment_id) return new Response("pj introuvable", { status: 404 });
        const { base64 } = await telechargerPieceJointe(id, cible.attachment_id);
        return Response.json({ nom: cible.nom, base64 });
      },
    },
  },
});
