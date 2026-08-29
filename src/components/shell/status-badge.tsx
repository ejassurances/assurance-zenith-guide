/**
 * Pastille d'état colorée selon le statut métier (présentation uniquement).
 */
const TONS: Record<string, string> = {
  succes: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  info: "bg-sky-50 text-sky-700 ring-sky-600/20",
  attente: "bg-amber-50 text-amber-700 ring-amber-600/20",
  neutre: "bg-surface text-ink-soft ring-line",
  alerte: "bg-rose-50 text-rose-700 ring-rose-600/20",
};

export type StatusTon = keyof typeof TONS;

const MOTS: Array<[RegExp, StatusTon]> = [
  [/souscrit|sign|valid|actif|conforme|payé|regl|clotur/i, "succes"],
  [/proposition|devis|étude|etude|envoy|transmis/i, "info"],
  [/attente|valider|cours|instruction|relance|brouillon/i, "attente"],
  [/refus|resili|résili|litige|retard|bloqu|manquant/i, "alerte"],
];

export function tonPourStatut(statut: string): StatusTon {
  for (const [re, ton] of MOTS) if (re.test(statut)) return ton;
  return "neutre";
}

export function StatusBadge({ statut, ton }: { statut: string; ton?: StatusTon }) {
  const t = ton ?? tonPourStatut(statut);
  return (
    <span
      className={
        "inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset " +
        TONS[t]
      }
    >
      {statut}
    </span>
  );
}
