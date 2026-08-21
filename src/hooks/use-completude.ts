/**
 * Lectures d'affichage pour les jauges de complétude (aucune écriture, aucune
 * règle métier nouvelle : on ne fait que compter l'existant).
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { CompletudeItem } from "@/components/completude-rings";

const pct = (n: number, total: number) => (total <= 0 ? 0 : Math.round((n / total) * 100));

export function useCompletudeClient(clientId: string): CompletudeItem[] | null {
  const [items, setItems] = useState<CompletudeItem[] | null>(null);

  useEffect(() => {
    let annule = false;
    (async () => {
      const [kyc, dossiers, der] = await Promise.all([
        supabase.from("client_kyc_documents").select("type,statut").eq("client_id", clientId),
        supabase.from("dossiers").select("id,recueil_besoins").eq("client_id", clientId),
        supabase
          .from("client_der_envois")
          .select("statut")
          .eq("client_id", clientId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      const docs = (kyc.data ?? []) as { type: string; statut: string }[];
      const attendus = ["cni", "justificatif_domicile", "rib"];
      const valides = attendus.filter((t) => docs.some((d) => d.type === t && d.statut === "valide")).length;

      const rows = (dossiers.data ?? []) as { id: string; recueil_besoins: unknown }[];
      const recueilOk = rows.filter(
        (d) => d.recueil_besoins && Object.keys(d.recueil_besoins as object).length > 0,
      ).length;

      const ids = rows.map((d) => d.id);
      let lmOk = 0;
      let dcOk = 0;
      if (ids.length > 0) {
        const [lm, dc] = await Promise.all([
          supabase.from("lettres_mission").select("statut").in("dossier_id", ids),
          supabase.from("devoirs_conseil").select("statut").in("dossier_id", ids),
        ]);
        lmOk = ((lm.data ?? []) as { statut: string }[]).some((r) => r.statut === "signee") ? 1 : 0;
        dcOk = ((dc.data ?? []) as { statut: string }[]).some((r) => r.statut === "signe") ? 1 : 0;
      }
      const derStatut = (der.data as { statut: string } | null)?.statut;
      const derOk = derStatut === "signe" || derStatut === "envoye" ? 1 : 0;

      const next: CompletudeItem[] = [
        { key: "kyc", label: "KYC — pièces d'identité", value: pct(valides, attendus.length) },
        {
          key: "recueil",
          label: "Recueil des besoins",
          value: rows.length === 0 ? 0 : pct(recueilOk, rows.length),
          neutre: rows.length === 0,
        },
        { key: "dda", label: "Documents DDA", value: pct(derOk + lmOk + dcOk, 3) },
      ];
      if (!annule) setItems(next);
    })();
    return () => {
      annule = true;
    };
  }, [clientId]);

  return items;
}

export function useCompletudeDossier(dossierId: string, clientId: string | null): CompletudeItem[] | null {
  const [items, setItems] = useState<CompletudeItem[] | null>(null);

  useEffect(() => {
    let annule = false;
    (async () => {
      const [pieces, dossier, lm, dc, der] = await Promise.all([
        supabase.from("dossier_pieces_requises").select("statut,obligatoire").eq("dossier_id", dossierId),
        supabase.from("dossiers").select("recueil_besoins").eq("id", dossierId).maybeSingle(),
        supabase.from("lettres_mission").select("statut").eq("dossier_id", dossierId),
        supabase.from("devoirs_conseil").select("statut").eq("dossier_id", dossierId),
        clientId
          ? supabase
              .from("client_der_envois")
              .select("statut")
              .eq("client_id", clientId)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle()
          : Promise.resolve({ data: null }),
      ]);

      const rows = (pieces.data ?? []) as { statut: string; obligatoire: boolean | null }[];
      const requises = rows.filter((r) => r.obligatoire !== false);
      const okPieces = requises.filter((r) => r.statut === "validee" || r.statut === "valide").length;

      const recueil = (dossier.data as { recueil_besoins: unknown } | null)?.recueil_besoins;
      const recueilRempli = recueil && Object.keys(recueil as object).length > 0;

      const lmOk = ((lm.data ?? []) as { statut: string }[]).some((r) => r.statut === "signee") ? 1 : 0;
      const dcOk = ((dc.data ?? []) as { statut: string }[]).some((r) => r.statut === "signe") ? 1 : 0;
      const derStatut = (der.data as { statut: string } | null)?.statut;
      const derOk = derStatut === "signe" || derStatut === "envoye" ? 1 : 0;

      const next: CompletudeItem[] = [
        {
          key: "pieces",
          label: "KYC — pièces du dossier",
          value: requises.length === 0 ? 0 : pct(okPieces, requises.length),
          neutre: requises.length === 0,
        },
        { key: "recueil", label: "Recueil des besoins", value: recueilRempli ? 100 : 0 },
        { key: "dda", label: "Documents DDA", value: pct(derOk + lmOk + dcOk, 3) },
      ];
      if (!annule) setItems(next);
    })();
    return () => {
      annule = true;
    };
  }, [dossierId, clientId]);

  return items;
}
