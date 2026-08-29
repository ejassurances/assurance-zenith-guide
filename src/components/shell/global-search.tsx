/**
 * Recherche globale de la barre supérieure : clients et contrats.
 * Lecture seule (SELECT), résultats cliquables vers la fiche correspondante.
 */
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { IconSearch, IconUser, IconFileText } from "@tabler/icons-react";

import { supabase } from "@/integrations/supabase/client";

type Resultat = {
  id: string;
  type: "client" | "contrat";
  titre: string;
  detail: string;
  to: string;
};

export function GlobalSearch() {
  const navigate = useNavigate();
  const [terme, setTerme] = useState("");
  const [resultats, setResultats] = useState<Resultat[]>([]);
  const [ouvert, setOuvert] = useState(false);
  const [chargement, setChargement] = useState(false);
  const boite = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (boite.current && !boite.current.contains(e.target as Node)) setOuvert(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  useEffect(() => {
    const q = terme.trim();
    if (q.length < 2) {
      setResultats([]);
      return;
    }
    let annule = false;
    setChargement(true);
    const timer = setTimeout(async () => {
      const motif = `%${q}%`;
      const [clients, contrats] = await Promise.all([
        supabase
          .from("clients")
          .select("id, reference, nom, prenom, email")
          .or(`nom.ilike.${motif},prenom.ilike.${motif},email.ilike.${motif},reference.ilike.${motif}`)
          .limit(6),
        supabase
          .from("contrats")
          .select("id, numero, produit, assureur")
          .or(`numero.ilike.${motif},produit.ilike.${motif},assureur.ilike.${motif}`)
          .limit(6),
      ]);
      if (annule) return;
      const liste: Resultat[] = [
        ...(clients.data ?? []).map((c) => ({
          id: c.id,
          type: "client" as const,
          titre: [c.prenom, c.nom].filter(Boolean).join(" ") || c.reference,
          detail: [c.reference, c.email].filter(Boolean).join(" · "),
          to: `/espace/clients/${c.id}`,
        })),
        ...(contrats.data ?? []).map((c) => ({
          id: c.id,
          type: "contrat" as const,
          titre: c.produit || c.numero || "Contrat",
          detail: [c.assureur, c.numero].filter(Boolean).join(" · "),
          to: `/espace/contrats/${c.id}`,
        })),
      ];
      setResultats(liste);
      setChargement(false);
      setOuvert(true);
    }, 250);
    return () => {
      annule = true;
      clearTimeout(timer);
    };
  }, [terme]);

  const aller = (r: Resultat) => {
    setOuvert(false);
    setTerme("");
    navigate({ to: r.to });
  };

  return (
    <div ref={boite} className="relative w-full max-w-xl">
      <label className="flex items-center gap-2 rounded-full border border-line bg-surface px-4 py-2 transition-colors focus-within:border-[color:var(--crm-gold)]/60">
        <IconSearch size={16} className="shrink-0 text-ink-muted" aria-hidden="true" />
        <input
          value={terme}
          onChange={(e) => setTerme(e.target.value)}
          onFocus={() => resultats.length > 0 && setOuvert(true)}
          placeholder="Rechercher un client, un contrat…"
          aria-label="Recherche globale"
          className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-muted"
        />
      </label>

      {ouvert && terme.trim().length >= 2 && (
        <div className="crm-card absolute left-0 right-0 top-full z-30 mt-2 max-h-80 overflow-y-auto p-1">
          {chargement && <p className="px-3 py-2 text-xs text-ink-muted">Recherche…</p>}
          {!chargement && resultats.length === 0 && (
            <p className="px-3 py-2 text-xs text-ink-muted">Aucun résultat</p>
          )}
          {resultats.map((r) => (
            <button
              key={`${r.type}-${r.id}`}
              type="button"
              onClick={() => aller(r)}
              className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left transition-colors hover:bg-surface"
            >
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[color:var(--crm-gold)]/12 text-[color:var(--crm-gold)]">
                {r.type === "client" ? (
                  <IconUser size={14} aria-hidden="true" />
                ) : (
                  <IconFileText size={14} aria-hidden="true" />
                )}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm text-ink">{r.titre}</span>
                {r.detail && <span className="block truncate text-xs text-ink-muted">{r.detail}</span>}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
