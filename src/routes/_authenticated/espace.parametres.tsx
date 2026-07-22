import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/_authenticated/espace/parametres")({
  component: Parametres,
});

function Parametres() {
  const { user, role } = useAuth();

  const [fullName, setFullName] = useState<string>((user?.user_metadata as { full_name?: string })?.full_name ?? "");
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const [currentPwd, setCurrentPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [savingPwd, setSavingPwd] = useState(false);
  const [pwdMsg, setPwdMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSavingProfile(true);
    setProfileMsg(null);
    const [{ error: authErr }, { error: profErr }] = await Promise.all([
      supabase.auth.updateUser({ data: { full_name: fullName } }),
      supabase.from("profiles").update({ full_name: fullName } as never).eq("id", user!.id),
    ]);
    setSavingProfile(false);
    if (authErr || profErr) {
      setProfileMsg({ type: "err", text: (authErr || profErr)!.message });
    } else {
      setProfileMsg({ type: "ok", text: "Profil mis à jour." });
    }
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwdMsg(null);
    if (newPwd.length < 8) {
      setPwdMsg({ type: "err", text: "Le nouveau mot de passe doit contenir au moins 8 caractères." });
      return;
    }
    if (newPwd !== confirmPwd) {
      setPwdMsg({ type: "err", text: "Les deux mots de passe ne correspondent pas." });
      return;
    }
    setSavingPwd(true);
    // Revérifie le mot de passe actuel via une tentative de connexion silencieuse.
    const verif = await supabase.auth.signInWithPassword({
      email: user!.email!,
      password: currentPwd,
    });
    if (verif.error) {
      setSavingPwd(false);
      setPwdMsg({ type: "err", text: "Mot de passe actuel incorrect." });
      return;
    }
    const { error } = await supabase.auth.updateUser({ password: newPwd });
    setSavingPwd(false);
    if (error) {
      setPwdMsg({ type: "err", text: error.message });
      return;
    }
    setCurrentPwd("");
    setNewPwd("");
    setConfirmPwd("");
    setPwdMsg({ type: "ok", text: "Mot de passe modifié avec succès." });
  }

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h1 className="font-serif text-3xl">Paramètres du compte</h1>
        <p className="mt-1 text-sm text-ink-muted">
          {user?.email} · {role}
        </p>
      </div>

      <form onSubmit={saveProfile} className="space-y-4 rounded-lg border border-line bg-surface p-5">
        <h2 className="font-serif text-lg">Profil</h2>
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-muted">Nom complet</label>
          <input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="w-full rounded-md border border-line bg-background px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-muted">Adresse e-mail</label>
          <input
            value={user?.email ?? ""}
            readOnly
            className="w-full rounded-md border border-line bg-surface-elevated px-3 py-2 text-sm text-ink-muted"
          />
          <p className="mt-1 text-xs text-ink-muted">
            La modification de l'adresse e-mail se fait sur demande auprès de l'administrateur.
          </p>
        </div>
        {profileMsg && (
          <p className={`text-sm ${profileMsg.type === "ok" ? "text-emerald-700" : "text-red-700"}`}>
            {profileMsg.text}
          </p>
        )}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={savingProfile}
            className="rounded-md bg-ink px-5 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
          >
            {savingProfile ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      </form>

      <form onSubmit={changePassword} className="space-y-4 rounded-lg border border-line bg-surface p-5">
        <h2 className="font-serif text-lg">Changer de mot de passe</h2>
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-muted">Mot de passe actuel</label>
          <input
            type="password"
            value={currentPwd}
            onChange={(e) => setCurrentPwd(e.target.value)}
            autoComplete="current-password"
            required
            className="w-full rounded-md border border-line bg-background px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-muted">Nouveau mot de passe</label>
          <input
            type="password"
            value={newPwd}
            onChange={(e) => setNewPwd(e.target.value)}
            autoComplete="new-password"
            required
            minLength={8}
            className="w-full rounded-md border border-line bg-background px-3 py-2 text-sm"
          />
          <p className="mt-1 text-xs text-ink-muted">Minimum 8 caractères.</p>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-muted">Confirmer le nouveau mot de passe</label>
          <input
            type="password"
            value={confirmPwd}
            onChange={(e) => setConfirmPwd(e.target.value)}
            autoComplete="new-password"
            required
            minLength={8}
            className="w-full rounded-md border border-line bg-background px-3 py-2 text-sm"
          />
        </div>
        {pwdMsg && (
          <p className={`text-sm ${pwdMsg.type === "ok" ? "text-emerald-700" : "text-red-700"}`}>{pwdMsg.text}</p>
        )}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={savingPwd}
            className="rounded-md bg-ink px-5 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
          >
            {savingPwd ? "Modification…" : "Modifier le mot de passe"}
          </button>
        </div>
      </form>
    </div>
  );
}
