/**
 * Preuves réellement archivées dans le logiciel pour un dossier emprunteur.
 * Lecture seule : sert uniquement à ne cocher une étape réglementaire que si
 * son acte existe (lettre de mission signée, devis, devoir de conseil signé,
 * contrat). Un dossier repris du portefeuille reste affiché comme « repris ».
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { PreuvesParcours } from "@/lib/parcours-emprunteur";

export function usePreuvesParcours(dossierId: string | null, actif: boolean) {
  const [preuves, setPreuves] = useState<PreuvesParcours | null>(null);

  useEffect(() => {
    if (!dossierId || !actif) return setPreuves(null);
    let annule = false;
    (async () => {
      const [lm, devis, dc, contrats] = await Promise.all([
        supabase
          .from("lettres_mission")
          .select("id")
          .eq("dossier_id", dossierId)
          .not("signed_at", "is", null)
          .limit(1),
        supabase.from("dossier_devis").select("id").eq("dossier_id", dossierId).limit(1),
        supabase
          .from("devoirs_conseil")
          .select("id")
          .eq("dossier_id", dossierId)
          .not("signed_at", "is", null)
          .limit(1),
        supabase.from("contrats").select("id").eq("dossier_id", dossierId).limit(1),
      ]);
      if (annule) return;
      setPreuves({
        lettreMissionSignee: (lm.data?.length ?? 0) > 0,
        devisEnregistres: (devis.data?.length ?? 0) > 0,
        devoirConseilSigne: (dc.data?.length ?? 0) > 0,
        contrats: (contrats.data?.length ?? 0) > 0,
      });
    })();
    return () => {
      annule = true;
    };
  }, [dossierId, actif]);

  return preuves;
}
