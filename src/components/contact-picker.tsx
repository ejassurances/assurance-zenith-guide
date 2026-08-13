import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { carnetContacts, type CategorieContact, type ContactCrm } from "@/lib/contacts.functions";

const CATEGORIES: { value: CategorieContact | "tous"; label: string }[] = [
  { value: "tous", label: "Tous" },
  { value: "client", label: "Clients" },
  { value: "partenaire", label: "Partenaires" },
  { value: "mandataire", label: "Mandataires" },
  { value: "prescripteur", label: "Prescripteurs" },
];

const BADGE: Record<CategorieContact, string> = {
  client: "Client",
  partenaire: "Partenaire",
  mandataire: "Mandataire",
  prescripteur: "Prescripteur",
};

/** Carnet d'adresses CRM : sélection d'un destinataire par catégorie. */
export function ContactPicker({ onPick }: { onPick: (contact: ContactCrm) => void }) {
  const charger = useServerFn(carnetContacts);
  const [contacts, setContacts] = useState<ContactCrm[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<CategorieContact | "tous">("tous");

  useEffect(() => {
    let actif = true;
    charger({ data: {} })
      .then((r) => actif && setContacts(r.contacts))
      .catch((e) => actif && setError(e instanceof Error ? e.message : "Chargement impossible"));
    return () => {
      actif = false;
    };
  }, [charger]);

  const liste = useMemo(() => {
    const terme = q.trim().toLowerCase();
    return (contacts ?? [])
      .filter((c) => (cat === "tous" ? true : c.categorie === cat))
      .filter((c) => (terme ? `${c.nom} ${c.email} ${c.detail ?? ""}`.toLowerCase().includes(terme) : true))
      .slice(0, 200);
  }, [contacts, q, cat]);

  return (
    <div className="space-y-2 rounded-xl border border-line bg-background p-3">
      <div className="flex flex-wrap gap-1">
        {CATEGORIES.map((c) => (
          <button
            key={c.value}
            type="button"
            onClick={() => setCat(c.value)}
            className={
              "rounded-full px-3 py-1 text-xs transition-colors " +
              (cat === c.value ? "bg-ink text-primary-foreground" : "border border-line text-ink-soft hover:bg-surface")
            }
          >
            {c.label}
          </button>
        ))}
      </div>

      <input
        placeholder="Rechercher un contact…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="w-full rounded-md border border-line bg-surface-elevated px-3 py-2 text-sm"
      />

      {error && <p className="text-xs text-red-700">{error}</p>}
      {!contacts && !error && <p className="text-xs text-ink-muted">Chargement du carnet…</p>}

      <ul className="max-h-56 divide-y divide-line overflow-y-auto rounded-md">
        {liste.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              onClick={() => onPick(c)}
              className="flex w-full items-center justify-between gap-3 px-2 py-2 text-left text-sm hover:bg-surface"
            >
              <span className="min-w-0">
                <span className="block truncate font-medium text-ink">{c.nom}</span>
                <span className="block truncate text-xs text-ink-muted">
                  {c.email}
                  {c.detail ? ` · ${c.detail}` : ""}
                </span>
              </span>
              <span className="shrink-0 rounded-full border border-line px-2 py-0.5 text-[10px] uppercase tracking-wide text-ink-muted">
                {BADGE[c.categorie]}
              </span>
            </button>
          </li>
        ))}
        {contacts && liste.length === 0 && <li className="px-2 py-2 text-xs text-ink-muted">Aucun contact trouvé.</li>}
      </ul>
    </div>
  );
}
