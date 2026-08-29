/**
 * D4 — File de souscription « Prêts / Bloqués / Transmis ».
 * Vue pilotable en lecture seule : aucun envoi, aucune écriture ; la
 * transmission reste verrouillée par le garde-fou de `souscription.server.ts`.
 */
import { useCallback, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  IconCircleCheck,
  IconClockHour4,
  IconLock,
  IconRefresh,
} from "@tabler/icons-react";
import { fileSouscriptionFn } from "@/lib/souscription-file.functions";
import type { EtatFile, LigneFileSouscription } from "@/lib/souscription-file";

const COLONNES: {
  etat: EtatFile;
  titre: string;
  description: string;
  icon: typeof IconCircleCheck;
  badge: string;
}[] = [
  {
    etat: "pret",
    titre: "Prêts à transmettre",
    description: "Recueil, devis, devoir de conseil et pièces réunis.",
    icon: IconCircleCheck,
    badge: "bg-emerald-100 text-emerald-900",
  },
  {
    etat: "bloque",
    titre: "Bloqués",
    description: "Au moins un jalon manque : reprendre l'étape indiquée.",
    icon: IconLock,
    badge: "bg-red-100 text-red-900",
  },
  {
    etat: "transmis",
    titre: "Transmis en attente",
    description: "Dossiers envoyés à la compagnie, retour en attente.",
    icon: IconClockHour4,
    badge: "bg-amber-100 text-amber-900",
  },
];

export function SouscriptionFilePanel() {
  const charger = useServerFn(fileSouscriptionFn);
  const [lignes, setLignes] = useState<LigneFileSouscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await charger({ data: { limite: 100 } });
      setLignes(res.lignes);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur de chargement de la file.");
    } finally {
      setLoading(false);
    }
  }, [charger]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <p className="p-6 text-sm text-ink-muted">Chargement de la file…</p>;
  if (error)
    return (
      <p className="p-6 text-sm text-destructive">
        {error}{" "}
        <button onClick={load} className="underline">
          Réessayer
        </button>
      </p>
    );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-ink-muted">
          {lignes.length} dossier{lignes.length > 1 ? "s" : ""} dans la file de souscription.
        </p>
        <button
          onClick={load}
          className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-xs font-medium text-ink-soft transition hover:bg-background"
        >
          <IconRefresh size={14} /> Actualiser
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {COLONNES.map((col) => {
          const cartes = lignes.filter((l) => l.etat === col.etat);
          const Icon = col.icon;
          return (
            <div
              key={col.etat}
              className="flex flex-col rounded-2xl border border-line bg-surface-elevated"
            >
              <div className="flex items-center gap-2 border-b border-line px-4 py-3">
                <Icon size={18} className="text-ink-soft" />
                <div className="flex-1">
                  <h3 className="text-sm font-semibold text-ink">{col.titre}</h3>
                  <p className="text-xs text-ink-muted">{col.description}</p>
                </div>
                <span
                  className={`inline-flex min-w-7 justify-center rounded-full px-2 py-0.5 text-xs font-semibold ${col.badge}`}
                >
                  {cartes.length}
                </span>
              </div>
              <div className="divide-y divide-line">
                {cartes.length === 0 ? (
                  <p className="px-4 py-4 text-xs text-ink-muted">Aucun dossier.</p>
                ) : (
                  cartes.map((l) => <CarteFile key={l.dossier_id} ligne={l} />)
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CarteFile({ l }: { l: LigneFileSouscription }) {
  return (
    <div className="space-y-2 px-4 py-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <Link
            to="/espace/dossiers/$id"
            params={{ id: l.dossier_id }}
            className="text-sm font-medium text-ink hover:underline"
          >
            {l.reference}
          </Link>
          <p className="text-xs text-ink-muted">
            {l.client_nom}
            {l.produit_nom ? ` · ${l.produit_nom}` : ""}
            {l.compagnie_nom ? ` · ${l.compagnie_nom}` : ""}
          </p>
        </div>
        {l.etat === "transmis" && l.relances_nb != null && l.relances_nb > 0 && (
          <span className="shrink-0 rounded-full bg-surface px-2 py-0.5 text-xs text-ink-soft">
            {l.relances_nb} relance{l.relances_nb > 1 ? "s" : ""}
          </span>
        )}
      </div>

      {l.etat === "bloque" && (
        <ul className="space-y-1">
          {l.bloquants.map((b, i) => (
            <li key={i} className="text-xs text-red-900">
              • {b}
            </li>
          ))}
        </ul>
      )}

      {l.etat === "transmis" && l.envoye_le && (
        <p className="text-xs text-ink-muted">
          Transmis le {new Date(l.envoye_le).toLocaleDateString("fr-FR")}
        </p>
      )}

      {l.etape_reprise && (
        <Link
          to="/espace/dossiers/$id"
          params={{ id: l.dossier_id }}
          search={{ etape: l.etape_reprise }}
          className="inline-flex items-center gap-1 rounded-full bg-[#D4AF37] px-3 py-1 text-xs font-semibold text-[#0A192F] transition hover:brightness-95"
        >
          <IconRefresh size={13} /> Reprendre
        </Link>
      )}
    </div>
  );
}
