import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { SITE } from "@/lib/site";

type Envoi = {
  id: string;
  client_id: string;
  der_modele_id: string | null;
  envoye_par: string | null;
  envoye_le: string | null;
  email_destinataire: string | null;
  statut: string;
  notes: string | null;
  created_at: string;
  signed_at?: string | null;
  signed_ip?: string | null;
  signature_png?: string | null;
  document_hash?: string | null;
};

type Modele = {
  id: string;
  version: string;
  nom: string;
  storage_path: string;
  actif: boolean;
};

const STATUT_LABEL: Record<string, string> = {
  a_envoyer: "À envoyer",
  envoye: "Envoyé",
  echec: "Échec",
  signe: "Signé",
};
const STATUT_CLASS: Record<string, string> = {
  a_envoyer: "bg-amber-100 text-amber-900",
  envoye: "bg-emerald-100 text-emerald-900",
  echec: "bg-red-100 text-red-900",
  signe: "bg-blue-100 text-blue-900",
};

export function DerTab({ clientId, clientEmail }: { clientId: string; clientEmail: string | null }) {
  const { user } = useAuth();
  const [envois, setEnvois] = useState<Envoi[]>([]);
  const [modele, setModele] = useState<Modele | null>(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState(clientEmail ?? "");

  const load = async () => {
    setLoading(true);
    const [envRes, modRes] = await Promise.all([
      supabase
        .from("client_der_envois")
        .select("*")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false }),
      supabase.from("der_modele").select("*").eq("actif", true).maybeSingle(),
    ]);
    setEnvois((envRes.data ?? []) as Envoi[]);
    setModele((modRes.data as Modele | null) ?? null);
    setLoading(false);
  };
  useEffect(() => {
    load();
  }, [clientId]);

  const download = async () => {
    if (!modele) return;
    const { data } = await supabase.storage
      .from("conformite-documents")
      .createSignedUrl(modele.storage_path, 600);
    if (data) window.open(data.signedUrl, "_blank");
  };

  const markSent = async (envoiId: string) => {
    const dest = email.trim();
    if (!dest) return alert("Renseignez l'email destinataire.");
    if (!modele) return alert("Aucun DER actif — l'admin doit d'abord activer un modèle.");
    const { data: urlData } = await supabase.storage
      .from("conformite-documents")
      .createSignedUrl(modele.storage_path, 60 * 60 * 24 * 7);
    const link = urlData?.signedUrl ?? "";
    const subject = encodeURIComponent(`${SITE.shortName} — Document d'Entrée en Relation (DER)`);
    const body = encodeURIComponent(
      `Bonjour,\n\nConformément à la réglementation, veuillez trouver ci-joint (lien de téléchargement valable 7 jours) le Document d'Entrée en Relation (DER) du cabinet ${SITE.shortName}.\n\n${link}\n\nCe document précise le statut de votre courtier, les compagnies partenaires et les modalités de rémunération.\n\nCordialement,\nL'équipe ${SITE.shortName}`,
    );
    window.location.href = `mailto:${dest}?subject=${subject}&body=${body}`;
    await supabase
      .from("client_der_envois")
      .update({
        statut: "envoye",
        envoye_le: new Date().toISOString(),
        envoye_par: user?.id,
        email_destinataire: dest,
      })
      .eq("id", envoiId);
    load();
  };

  const createNew = async () => {
    if (!modele) return alert("Aucun DER actif.");
    await supabase.from("client_der_envois").insert({
      client_id: clientId,
      der_modele_id: modele.id,
      email_destinataire: email || null,
      statut: "a_envoyer",
    });
    load();
  };

  if (loading) return <p className="text-sm text-ink-muted">Chargement…</p>;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-line bg-surface-elevated p-5">
        <h3 className="font-serif text-lg font-medium">DER classique du cabinet</h3>
        {modele ? (
          <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm text-ink">
                {modele.nom} <span className="text-ink-muted">— v{modele.version}</span>
              </p>
              <p className="text-xs text-ink-muted">
                Le DER est envoyé au client à sa création. Vous pouvez le télécharger ou le renvoyer.
              </p>
            </div>
            <button
              onClick={download}
              className="rounded-full border border-line px-4 py-1.5 text-sm hover:bg-surface"
            >
              Télécharger le DER
            </button>
          </div>
        ) : (
          <p className="mt-2 text-sm text-amber-800">
            Aucun DER actif. L'administrateur doit activer un modèle depuis « DER (modèle) ».
          </p>
        )}
      </div>

      <div className="rounded-2xl border border-line bg-surface-elevated p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex-1">
            <label className="text-xs text-ink-muted">Email destinataire</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="prenom.nom@exemple.fr"
              className="mt-1 w-full rounded-md border border-line bg-background px-3 py-2 text-sm"
            />
          </div>
          <button
            onClick={createNew}
            className="rounded-full border border-line px-4 py-2 text-sm hover:bg-surface"
          >
            Nouvel envoi
          </button>
        </div>

        <div className="mt-4 overflow-x-auto">
          {envois.length === 0 ? (
            <p className="text-sm text-ink-muted">Aucun envoi enregistré.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b border-line text-left text-xs text-ink-muted">
                <tr>
                  <th className="px-2 py-2">Statut</th>
                  <th className="px-2 py-2">Destinataire</th>
                  <th className="px-2 py-2">Créé le</th>
                  <th className="px-2 py-2">Envoyé le</th>
                  <th className="px-2 py-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {envois.map((en) => (
                  <tr key={en.id} className="border-b border-line last:border-0">
                    <td className="px-2 py-2">
                      <span
                        className={
                          "rounded-full px-2 py-0.5 text-xs font-medium " +
                          (STATUT_CLASS[en.statut] ?? "bg-surface text-ink-soft")
                        }
                      >
                        {STATUT_LABEL[en.statut] ?? en.statut}
                      </span>
                    </td>
                    <td className="px-2 py-2 text-ink-soft">{en.email_destinataire ?? "—"}</td>
                    <td className="px-2 py-2 text-xs text-ink-muted">
                      {new Date(en.created_at).toLocaleDateString("fr-FR")}
                    </td>
                    <td className="px-2 py-2 text-xs text-ink-muted">
                      {en.envoye_le ? new Date(en.envoye_le).toLocaleString("fr-FR") : "—"}
                    </td>
                    <td className="px-2 py-2 text-right">
                      {en.statut !== "envoye" && (
                        <button
                          onClick={() => markSent(en.id)}
                          className="rounded-full bg-ink px-3 py-1 text-xs font-medium text-primary-foreground"
                        >
                          Envoyer par email
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
