/* eslint-disable @typescript-eslint/no-explicit-any */

export type ReparationLigne = {
  type: "lettre_mission" | "devoir_conseil";
  id: string;
  reference: string | null;
  ok: boolean;
  path?: string;
  erreur?: string;
};

/**
 * Reprise des PDF DDA manquants : lettres de mission signées sans PDF archivé
 * et devoirs de conseil signés/refusés dont le PDF n'a pas été régénéré après
 * la réponse du client. Utilise le client de service (aucune limite RLS).
 */
export async function reparerPdfDdaManquants(): Promise<{
  lignes: ReparationLigne[];
  total_ok: number;
  total_erreur: number;
}> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { archiverLettreMissionSignee } = await import("./lettre-mission-archive.server");
  const { archiverDevoirConseil } = await import("./devoir-conseil-archive.server");

  const lignes: ReparationLigne[] = [];

  const { data: lettres } = await supabaseAdmin
    .from("lettres_mission")
    .select("id, contenu, envoye_par, created_by, pdf_storage_path")
    .eq("statut", "signee");

  for (const l of (lettres ?? []) as any[]) {
    if (l.pdf_storage_path) continue;
    const reference = l.contenu?.dossier?.reference ?? null;
    try {
      const res = await archiverLettreMissionSignee(
        supabaseAdmin as any,
        l.id,
        l.envoye_par ?? l.created_by,
      );
      lignes.push({ type: "lettre_mission", id: l.id, reference, ok: true, path: res.path });
    } catch (e) {
      lignes.push({
        type: "lettre_mission",
        id: l.id,
        reference,
        ok: false,
        erreur: e instanceof Error ? `${e.message}` : String(e),
      });
    }
  }

  const { data: devoirs } = await supabaseAdmin
    .from("devoirs_conseil")
    .select("id, statut, pdf_path, contenu, created_by")
    .in("statut", ["signe", "refuse"]);

  for (const d of (devoirs ?? []) as any[]) {
    // Le PDF définitif porte le suffixe « -signe » : son absence signale que
    // l'archivage post-réponse client n'a jamais abouti.
    if (d.statut === "signe" && d.pdf_path?.includes("-signe")) continue;
    const reference = d.contenu?.dossier?.reference ?? null;
    try {
      const res = await archiverDevoirConseil(supabaseAdmin as any, d.id, d.created_by ?? null);
      lignes.push({ type: "devoir_conseil", id: d.id, reference, ok: true, path: res.path });
    } catch (e) {
      lignes.push({
        type: "devoir_conseil",
        id: d.id,
        reference,
        ok: false,
        erreur: e instanceof Error ? `${e.message}` : String(e),
      });
    }
  }

  return {
    lignes,
    total_ok: lignes.filter((l) => l.ok).length,
    total_erreur: lignes.filter((l) => !l.ok).length,
  };
}
