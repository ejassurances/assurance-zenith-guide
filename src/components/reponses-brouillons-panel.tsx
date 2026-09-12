import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  listerBrouillonsReponse,
  rejeterBrouillonReponse,
  validerBrouillonReponse,
  type BrouillonReponse,
} from "@/lib/reponses-brouillons.functions";

/**
 * Cas AMBIGUS : l'agent n'envoie pas seul, il propose un brouillon.
 * Rien ne part de cet écran sans validation humaine.
 */
export function ReponsesBrouillonsPanel() {
  const [items, setItems] = useState<BrouillonReponse[] | null>(null);
  const [enCours, setEnCours] = useState<string | null>(null);
  const lister = useServerFn(listerBrouillonsReponse);
  const valider = useServerFn(validerBrouillonReponse);
  const rejeter = useServerFn(rejeterBrouillonReponse);

  const load = async () => {
    try {
      setItems(await lister());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Chargement impossible");
      setItems([]);
    }
  };
  useEffect(() => {
    load();
  }, []);

  const agir = async (id: string, action: "valider" | "rejeter") => {
    setEnCours(id);
    try {
      if (action === "valider") {
        await valider({ data: { id } });
        toast.success("Réponse validée : elle part aux prochaines heures d'ouverture.");
      } else {
        await rejeter({ data: { id } });
        toast.success("Brouillon écarté : aucun email ne sera envoyé.");
      }
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action impossible");
    } finally {
      setEnCours(null);
    }
  };

  return (
    <div className="crm-card p-5">
      <h2 className="font-serif text-lg font-medium text-ink">Réponses à valider avant envoi</h2>
      <p className="mt-2 text-sm text-ink-soft">
        L'agent ne répond jamais aux messages purement informationnels, et il n'envoie rien seul
        quand le message est ambigu : il prépare la réponse ci-dessous et attend votre validation.
      </p>

      {items === null ? (
        <p className="mt-4 text-sm text-ink-muted">Chargement…</p>
      ) : items.length === 0 ? (
        <p className="mt-4 text-sm text-ink-muted">Aucune réponse en attente de validation.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {items.map((b) => (
            <li key={b.id} className="rounded-xl border border-line p-4">
              <p className="text-sm font-medium text-ink">{b.titre}</p>
              <p className="mt-1 text-xs text-ink-muted">
                À {b.destinataire} · {b.canal}
                {b.sujet_recu ? ` · reçu : ${b.sujet_recu}` : ""}
                {b.created_at ? ` · ${new Date(b.created_at).toLocaleString("fr-FR")}` : ""}
              </p>
              <p className="mt-1 text-xs text-[#B99B3F]">Motif : {b.motif}</p>
              <div className="mt-3 space-y-2 text-sm text-ink-soft">
                {b.paragraphes.map((p, i) => (
                  <p key={i}>{p}</p>
                ))}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={enCours === b.id}
                  onClick={() => agir(b.id, "valider")}
                  className="rounded-full bg-[#0A192F] px-4 py-1.5 text-xs text-white disabled:opacity-50"
                >
                  Valider et envoyer
                </button>
                <button
                  type="button"
                  disabled={enCours === b.id}
                  onClick={() => agir(b.id, "rejeter")}
                  className="rounded-full border border-line px-4 py-1.5 text-xs text-ink-soft hover:bg-surface disabled:opacity-50"
                >
                  Ne pas répondre
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
