import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";

import { supabase } from "@/integrations/supabase/client";
import {
  pilotageDelais,
  type Alerte,
  type Gravite,
  type PieceDelai,
  type ReclamationDelai,
  type SinistreDelai,
} from "@/lib/delais-pilotage";

const STYLE: Record<Gravite, string> = {
  critique: "border-red-300 bg-red-50 text-red-800",
  alerte: "border-amber-300 bg-amber-50 text-amber-800",
  vigilance: "border-line bg-surface-elevated text-ink-soft",
};

const LIBELLE_GRAVITE: Record<Gravite, string> = {
  critique: "Hors délai",
  alerte: "Échéance proche",
  vigilance: "À surveiller",
};

/**
 * Pilotage des délais (D7) : réclamations hors délai réglementaire, sinistres
 * sans mouvement ou non transmis, pièces obligatoires manquantes.
 * Lecture seule : aucune écriture, aucun envoi d'email.
 */
export function PilotageDelaisPanel() {
  const [alertes, setAlertes] = useState<Alerte[]>([]);
  const [compteurs, setCompteurs] = useState<Record<Gravite, number>>({
    critique: 0,
    alerte: 0,
    vigilance: 0,
  });
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [rec, sin, pie] = await Promise.all([
        supabase
          .from("reclamations")
          .select("id, reference, statut, date_ouverture, date_accuse_reception, date_cloture")
          .limit(500),
        supabase
          .from("sinistres")
          .select("id, reference, statut, etape, declare_le, declare_compagnie_le, updated_at, clos_le")
          .limit(500),
        supabase
          .from("sinistre_pieces")
          .select("sinistre_id, libelle, obligatoire, statut")
          .limit(2000),
      ]);
      const err = rec.error || sin.error || pie.error;
      if (err) {
        setErreur(err.message);
        setLoading(false);
        return;
      }
      const res = pilotageDelais({
        reclamations: (rec.data ?? []) as ReclamationDelai[],
        sinistres: (sin.data ?? []) as SinistreDelai[],
        pieces: (pie.data ?? []) as PieceDelai[],
      });
      setAlertes(res.alertes);
      setCompteurs(res.compteurs);
      setLoading(false);
    })();
  }, []);

  return (
    <section className="crm-card p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-ink">Pilotage des délais</h2>
          <p className="text-sm text-ink-muted">
            Accusé de réclamation sous 10 jours ouvrés, réponse sous 2 mois, transmission
            compagnie sous 5 jours, relance après 15 jours sans mouvement.
          </p>
        </div>
        <div className="flex gap-2 text-xs">
          {(["critique", "alerte", "vigilance"] as Gravite[]).map((g) => (
            <span key={g} className={"rounded-full border px-3 py-1 " + STYLE[g]}>
              {LIBELLE_GRAVITE[g]} : {compteurs[g]}
            </span>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="mt-4 text-sm text-ink-muted">Analyse des délais…</p>
      ) : erreur ? (
        <p className="mt-4 text-sm text-red-600">{erreur}</p>
      ) : alertes.length === 0 ? (
        <p className="mt-4 text-sm text-ink-muted">Aucun dossier hors délai. Tout est à jour.</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {alertes.map((a) => (
            <li
              key={a.cle}
              className={"flex flex-wrap items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm " + STYLE[a.gravite]}
            >
              <span>
                <span className="font-medium">{a.libelle}</span>
                <span className="block text-xs opacity-80">{a.detail}</span>
              </span>
              {a.categorie === "reclamation" ? (
                <Link to="/espace/conformite" className="text-xs underline">
                  Ouvrir
                </Link>
              ) : (
                <Link
                  to="/espace/sinistres/$id"
                  params={{ id: a.cible_id }}
                  className="text-xs underline"
                >
                  Ouvrir
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
