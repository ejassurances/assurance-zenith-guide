import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { SITE } from "@/lib/site";
import { useServerFn } from "@tanstack/react-start";
import { envoyerDerEmail } from "@/lib/der-sign.functions";

/* Carte statut DER — affichée dans l'onglet Conformité client */

type Envoi = {
  id: string;
  statut: string;
  envoye_le: string | null;
  email_destinataire: string | null;
  signed_at: string | null;
  created_at: string;
};

type Modele = { id: string; storage_path: string; version: string };

const STATUT_LABEL: Record<string, string> = {
  a_envoyer: "À envoyer",
  envoye: "Envoyé",
  echec: "Échec",
  signe: "Signé",
};
const STATUT_CLASS: Record<string, string> = {
  a_envoyer: "bg-amber-100 text-amber-900 border-amber-300",
  envoye: "bg-emerald-100 text-emerald-900 border-emerald-300",
  echec: "bg-red-100 text-red-900 border-red-300",
  signe: "bg-blue-100 text-blue-900 border-blue-300",
};

export function DerStatusCard({
  clientId,
  clientEmail,
  canEdit,
}: {
  clientId: string;
  clientEmail: string | null;
  canEdit: boolean;
}) {
  const { user } = useAuth();
  const envoyerDerEmailFn = useServerFn(envoyerDerEmail);
  const [envoi, setEnvoi] = useState<Envoi | null>(null);
  const [modele, setModele] = useState<Modele | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [email, setEmail] = useState(clientEmail ?? "");

  const load = async () => {
    const [envRes, modRes] = await Promise.all([
      supabase
        .from("client_der_envois")
        .select("id,statut,envoye_le,email_destinataire,signed_at,created_at")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase.from("der_modele").select("id,storage_path,version").eq("actif", true).maybeSingle(),
    ]);
    setEnvoi((envRes.data as Envoi | null) ?? null);
    setModele((modRes.data as Modele | null) ?? null);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [clientId]);

  const envoyer = async () => {
    const dest = email.trim();
    if (!dest) return alert("Renseignez l'email destinataire.");
    if (!modele) return alert("Aucun DER actif - l'admin doit d'abord activer un modele.");
    setSending(true);
    try {
      await envoyerDerEmailFn({ data: { client_id: clientId, email: dest } });
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Echec de l'envoi du DER.");
    } finally {
      setSending(false);
    }
  };

  const marquerEchec = async () => {
    if (!envoi) return;
    await supabase.from("client_der_envois").update({ statut: "echec" }).eq("id", envoi.id);
    load();
  };

  if (loading) return null;

  const statut = envoi?.statut ?? "a_envoyer";
  const badgeClass = STATUT_CLASS[statut] ?? STATUT_CLASS.a_envoyer;
  const label = STATUT_LABEL[statut] ?? statut;
  const dejaEnvoye = statut === "envoye" || statut === "signe";

  return (
    <div className="rounded-2xl border border-line bg-surface-elevated p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="font-serif text-lg font-medium">Document d'Entrée en Relation (DER)</h3>
          <p className="mt-1 text-xs text-ink-muted">
            {modele ? `Modèle actif : ${modele.version}` : "Aucun modèle DER actif dans le cabinet."}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            <span className={`rounded-full border px-3 py-1 font-medium ${badgeClass}`}>{label}</span>
            {envoi?.envoye_le && (
              <span className="text-ink-muted">
                Envoyé le {new Date(envoi.envoye_le).toLocaleDateString("fr-FR")}
                {envoi.email_destinataire ? ` à ${envoi.email_destinataire}` : ""}
              </span>
            )}
            {envoi?.signed_at && (
              <span className="text-ink-muted">· Signé le {new Date(envoi.signed_at).toLocaleDateString("fr-FR")}</span>
            )}
          </div>
        </div>
        {canEdit && (
          <div className="flex flex-col items-end gap-2">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@client.fr"
              className="w-64 rounded-md border border-line bg-surface px-3 py-1.5 text-sm"
            />
            <div className="flex gap-2">
              {dejaEnvoye && (
                <button
                  type="button"
                  onClick={marquerEchec}
                  className="rounded-full border border-line px-3 py-1.5 text-xs text-ink-muted hover:bg-surface"
                >
                  Marquer échec
                </button>
              )}
              <button
                type="button"
                onClick={envoyer}
                disabled={sending || !modele}
                className="rounded-full bg-ink px-4 py-1.5 text-xs font-medium text-white disabled:opacity-50"
              >
                {sending ? "…" : dejaEnvoye ? "Renvoyer le DER" : "Envoyer le DER"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
