/** Scores de valeur client, calculés à la volée par la base. */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type Rpc = (name: string, args?: Record<string, unknown>) => Promise<{ data: unknown }>;

/** Map client_id → score de valeur (0-100) pour tous les clients accessibles. */
export function useScoresValeur() {
  const [scores, setScores] = useState<Record<string, number>>({});
  useEffect(() => {
    (async () => {
      const { data } = await (supabase.rpc as unknown as Rpc)("scores_valeur_clients");
      const rows = (data ?? []) as { client_id: string; score: number }[];
      const map: Record<string, number> = {};
      for (const r of rows) map[r.client_id] = Number(r.score ?? 0);
      setScores(map);
    })();
  }, []);
  return scores;
}

/** Score de valeur d'un client unique. */
export function useScoreValeur(clientId: string | null | undefined) {
  const [score, setScore] = useState<number | null>(null);
  useEffect(() => {
    if (!clientId) return;
    (async () => {
      const { data } = await (supabase.rpc as unknown as Rpc)("score_valeur_client", {
        p_client_id: clientId,
      });
      setScore(Number(data ?? 0));
    })();
  }, [clientId]);
  return score;
}
