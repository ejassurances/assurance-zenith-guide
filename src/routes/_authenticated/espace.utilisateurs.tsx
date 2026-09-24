import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { PageHeader } from "@/components/page-header";
import { IconUsersGroup } from "@tabler/icons-react";
import { creerMandataire } from "@/lib/mandataires.functions";
import { creerContratMandataire } from "@/lib/mandataire-contrat.functions";

export const Route = createFileRoute("/_authenticated/espace/utilisateurs")({
  component: UsersPage,
});

type Profile = {
  id: string;
  email: string | null;
  full_name: string | null;
  company: string | null;
  phone: string | null;
};
type Role = "admin" | "mandataire" | "client" | "prescripteur";

function UsersPage() {
  const { role: myRole } = useAuth();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [rolesByUser, setRolesByUser] = useState<Record<string, Role[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const creer = useServerFn(creerMandataire);
  const [formOuvert, setFormOuvert] = useState(false);
  const [nom, setNom] = useState("");
  const [prenom, setPrenom] = useState("");
  const [email, setEmail] = useState("");
  const [tauxCommission, setTauxCommission] = useState("");
  const [zoneNonConcurrence, setZoneNonConcurrence] = useState("");
  const [creation, setCreation] = useState(false);
  const [creationMsg, setCreationMsg] = useState<string | null>(null);
  const envoyerContrat = useServerFn(creerContratMandataire);
  const [contratEnCours, setContratEnCours] = useState<string | null>(null);
  const [contratMsg, setContratMsg] = useState<Record<string, string>>({});

  const envoyerLeContrat = async (userId: string) => {
    setContratEnCours(userId);
    try {
      const res = await envoyerContrat({ data: { mandataire_id: userId } });
      setContratMsg((s) => ({
        ...s,
        [userId]: res.ok
          ? res.email_sent
            ? `Contrat ${res.reference} envoyé.`
            : `Contrat ${res.reference} créé, mail non envoyé.`
          : res.error,
      }));
    } catch (e) {
      setContratMsg((s) => ({ ...s, [userId]: e instanceof Error ? e.message : "Erreur." }));
    } finally {
      setContratEnCours(null);
    }
  };

  const load = async () => {
    setLoading(true);
    const [{ data: p }, { data: r, error: rErr }] = await Promise.all([
      supabase.from("profiles").select("id,email,full_name,company,phone"),
      supabase.from("user_roles").select("user_id,role"),
    ]);
    if (rErr) setError(rErr.message);
    setProfiles(p ?? []);
    const map: Record<string, Role[]> = {};
    for (const row of r ?? []) {
      const arr = map[row.user_id] ?? [];
      arr.push(row.role as Role);
      map[row.user_id] = arr;
    }
    setRolesByUser(map);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  if (myRole !== "admin") {
    return <p className="text-sm text-ink-muted">Accès réservé aux administrateurs.</p>;
  }

  const setRole = async (userId: string, newRole: Role) => {
    // remove existing then set
    await supabase.from("user_roles").delete().eq("user_id", userId);
    await supabase.from("user_roles").insert({ user_id: userId, role: newRole });
    load();
  };

  const creerNouveauMandataire = async () => {
    if (!nom.trim() || !email.trim()) {
      setCreationMsg("Le nom et l'email sont obligatoires.");
      return;
    }
    setCreation(true);
    setCreationMsg(null);
    try {
      const res = await creer({
        data: {
          nom: nom.trim(),
          prenom: prenom.trim() || undefined,
          email: email.trim(),
          taux_commission: tauxCommission ? Number(tauxCommission) : undefined,
          zone_non_concurrence: zoneNonConcurrence.trim() || undefined,
        },
      });
      if (!res.ok) {
        setCreationMsg(res.error);
        return;
      }
      setCreationMsg(
        res.email_sent
          ? "Compte mandataire créé, mot de passe provisoire envoyé par mail."
          : `Compte créé, mais l'envoi du mail a échoué : ${res.email_error ?? "raison inconnue"}.`,
      );
      setNom("");
      setPrenom("");
      setEmail("");
      setTauxCommission("");
      setZoneNonConcurrence("");
      await load();
    } catch (e) {
      setCreationMsg(e instanceof Error ? e.message : "Erreur lors de la création.");
    } finally {
      setCreation(false);
    }
  };

  return (
    <div>
      <PageHeader
        eyebrow="Administration"
        title="Utilisateurs"
        description="Attribuez à chaque utilisateur son rôle : administrateur, mandataire, prescripteur ou client."
        icon={IconUsersGroup}
      />
      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

      <div className="mt-6">
        <button
          type="button"
          onClick={() => setFormOuvert((v) => !v)}
          className="rounded-full border border-line px-4 py-2 text-sm font-medium hover:bg-surface"
        >
          {formOuvert ? "Annuler" : "+ Nouveau mandataire"}
        </button>
      </div>

      {formOuvert && (
        <div className="crm-card mt-4 space-y-4 p-6">
          <div>
            <p className="crm-eyebrow">Nouveau mandataire</p>
            <p className="mt-1 text-xs text-ink-muted">
              Crée le compte (mot de passe provisoire envoyé par mail) et attribue le rôle
              mandataire. Le contrat interne mandataire et l'activation d'équipe se font
              séparément, une fois le compte créé.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-xs font-medium text-ink-muted">Nom *</label>
              <input
                value={nom}
                onChange={(e) => setNom(e.target.value)}
                className="mt-1 w-full rounded-lg border border-line bg-background px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-ink-muted">Prénom</label>
              <input
                value={prenom}
                onChange={(e) => setPrenom(e.target.value)}
                className="mt-1 w-full rounded-lg border border-line bg-background px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-ink-muted">Email *</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full rounded-lg border border-line bg-background px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-ink-muted">
                Taux de commission (ex. 0.15 pour 15 %)
              </label>
              <input
                type="number"
                step="0.0001"
                value={tauxCommission}
                onChange={(e) => setTauxCommission(e.target.value)}
                className="mt-1 w-full rounded-lg border border-line bg-background px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-ink-muted">
                Zone de référence (non-concurrence, 30 km autour)
              </label>
              <input
                value={zoneNonConcurrence}
                onChange={(e) => setZoneNonConcurrence(e.target.value)}
                placeholder="Ex. commune ou adresse d'exercice habituel"
                className="mt-1 w-full rounded-lg border border-line bg-background px-3 py-2 text-sm"
              />
            </div>
          </div>
          {creationMsg && <p className="text-sm text-ink">{creationMsg}</p>}
          <button
            type="button"
            onClick={() => void creerNouveauMandataire()}
            disabled={creation}
            className="rounded-full bg-[#0A192F] px-5 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {creation ? "Création…" : "Créer le compte mandataire"}
          </button>
        </div>
      )}

      <div className="crm-card mt-8 overflow-hidden">
        {loading ? (
          <p className="p-6 text-sm text-ink-muted">Chargement…</p>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="border-b border-line bg-background/50 text-left text-xs uppercase tracking-wide text-ink-muted">
              <tr>
                <th className="px-4 py-3">Nom</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Rôle</th>
                <th className="px-4 py-3">Contrat mandataire</th>
              </tr>
            </thead>
            <tbody>
              {profiles.map((p) => {
                const current = (rolesByUser[p.id] ?? [])[0];
                return (
                  <tr key={p.id} className="border-b border-line last:border-0">
                    <td className="px-4 py-3">{p.full_name ?? "—"}</td>
                    <td className="px-4 py-3">{p.email ?? "—"}</td>
                    <td className="px-4 py-3">
                      <select
                        value={current ?? ""}
                        onChange={(e) => setRole(p.id, e.target.value as Role)}
                        className="rounded-md border border-line bg-background px-2 py-1 text-sm"
                      >
                        <option value="" disabled>
                          —
                        </option>
                        <option value="admin">Administrateur</option>
                        <option value="mandataire">Mandataire</option>
                        <option value="prescripteur">Prescripteur</option>
                        <option value="client">Client</option>
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      {current === "mandataire" && (
                        <div className="space-y-1">
                          <button
                            type="button"
                            onClick={() => void envoyerLeContrat(p.id)}
                            disabled={contratEnCours === p.id}
                            className="rounded-full border border-line px-3 py-1 text-xs font-medium hover:bg-surface disabled:opacity-60"
                          >
                            {contratEnCours === p.id ? "Envoi…" : "Envoyer le contrat"}
                          </button>
                          {contratMsg[p.id] && <p className="text-xs text-ink-muted">{contratMsg[p.id]}</p>}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        )}
      </div>
    </div>
  );
}
