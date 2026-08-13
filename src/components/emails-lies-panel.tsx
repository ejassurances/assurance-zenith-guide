import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { EmailComposeDialog, type EmailLiens } from "@/components/email-compose-dialog";

type CrmEmail = {
  id: string;
  gmail_message_id: string;
  direction: string;
  expediteur_nom: string | null;
  expediteur_email: string | null;
  destinataires: string | null;
  sujet: string | null;
  snippet: string | null;
  recu_le: string | null;
  notes: string | null;
  created_at: string;
};

/**
 * Liste des emails rattachés à un client, un dossier, un contrat ou une
 * compagnie, avec bouton d'envoi depuis la boîte du cabinet.
 */
export function EmailsLiesPanel({
  liens,
  destinataireParDefaut,
  titre = "Emails",
  canEdit = true,
}: {
  liens: EmailLiens;
  destinataireParDefaut?: string | null;
  titre?: string;
  canEdit?: boolean;
}) {
  const [emails, setEmails] = useState<CrmEmail[]>([]);
  const [loading, setLoading] = useState(true);
  const [compose, setCompose] = useState(false);

  const load = async () => {
    setLoading(true);
    let query = supabase.from("crm_emails").select("*").order("recu_le", { ascending: false, nullsFirst: false });
    if (liens.client_id) query = query.eq("client_id", liens.client_id);
    if (liens.dossier_id) query = query.eq("dossier_id", liens.dossier_id);
    if (liens.contrat_id) query = query.eq("contrat_id", liens.contrat_id);
    if (liens.compagnie_id) query = query.eq("compagnie_id", liens.compagnie_id);
    const { data } = await query;
    setEmails((data ?? []) as CrmEmail[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liens.client_id, liens.dossier_id, liens.contrat_id, liens.compagnie_id]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">{titre}</h3>
        {canEdit && (
          <button
            onClick={() => setCompose(true)}
            className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            Envoyer un email
          </button>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-ink-muted">Chargement…</p>
      ) : emails.length === 0 ? (
        <p className="text-sm text-ink-muted">Aucun email rattaché pour le moment.</p>
      ) : (
        <ul className="space-y-2">
          {emails.map((m) => (
            <li key={m.id} className="rounded-xl border border-line bg-surface-elevated p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={
                    "rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide " +
                    (m.direction === "sortant"
                      ? "border-line text-ink-muted"
                      : "border-[color:var(--crm-gold)] text-[color:var(--crm-gold)]")
                  }
                >
                  {m.direction === "sortant" ? "Envoyé" : "Reçu"}
                </span>
                <p className="text-sm font-medium text-ink">{m.sujet ?? "(sans objet)"}</p>
                <span className="ml-auto text-xs text-ink-muted">
                  {m.recu_le ? new Date(m.recu_le).toLocaleString("fr-FR") : ""}
                </span>
              </div>
              <p className="mt-1 text-xs text-ink-muted">
                {m.direction === "sortant"
                  ? `À ${m.destinataires ?? "—"}`
                  : `De ${m.expediteur_nom ?? ""} ${m.expediteur_email ? `<${m.expediteur_email}>` : ""}`}
              </p>
              {m.snippet && <p className="mt-2 whitespace-pre-wrap text-sm text-ink-soft">{m.snippet}</p>}
              {m.notes && <p className="mt-2 text-xs italic text-ink-muted">{m.notes}</p>}
            </li>
          ))}
        </ul>
      )}

      <EmailComposeDialog
        open={compose}
        onClose={() => setCompose(false)}
        onSent={load}
        defaultTo={destinataireParDefaut ?? ""}
        liens={liens}
      />
    </div>
  );
}
