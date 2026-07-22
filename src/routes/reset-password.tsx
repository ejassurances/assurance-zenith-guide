import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SITE } from "@/lib/site";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: `Réinitialiser le mot de passe — ${SITE.name}` },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: ResetPassword,
});

function ResetPassword() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    // Supabase place la session de récupération dans l'URL (hash) ou renvoie
    // un événement PASSWORD_RECOVERY.
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    if (password.length < 8) {
      setMsg({ type: "err", text: "Le mot de passe doit contenir au moins 8 caractères." });
      return;
    }
    if (password !== confirm) {
      setMsg({ type: "err", text: "Les deux mots de passe ne correspondent pas." });
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      setMsg({ type: "err", text: error.message });
      return;
    }
    setMsg({ type: "ok", text: "Mot de passe mis à jour. Redirection…" });
    setTimeout(() => navigate({ to: "/espace" }), 1200);
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-line">
        <div className="container-page flex h-16 items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5">
            <img src="/logo-ej-partners.png" alt="" className="size-8 rounded-md object-cover" />
            <span className="font-serif text-base font-medium">{SITE.shortName}</span>
          </Link>
          <Link to="/" className="rounded-full border border-line px-4 py-1.5 text-sm text-ink-soft hover:bg-surface">
            ← Retour au site
          </Link>
        </div>
      </header>

      <div className="container-page flex items-center justify-center py-16">
        <div className="w-full max-w-md rounded-2xl border border-line bg-surface-elevated p-8 shadow-sm">
          <h1 className="font-serif text-2xl font-medium">Définir un nouveau mot de passe</h1>

          {!ready ? (
            <p className="mt-4 text-sm text-ink-muted">
              Ce lien de réinitialisation semble invalide ou expiré. Depuis{" "}
              <Link to="/auth" className="text-ink underline underline-offset-4">
                la page de connexion
              </Link>
              , cliquez à nouveau sur « Mot de passe oublié ».
            </p>
          ) : (
            <form onSubmit={submit} className="mt-6 space-y-4">
              <div>
                <label className="text-xs font-medium uppercase tracking-wide text-ink-muted">
                  Nouveau mot de passe
                </label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="mt-1 w-full rounded-md border border-line bg-background px-3 py-2 text-sm outline-none focus:border-ink"
                />
              </div>
              <div>
                <label className="text-xs font-medium uppercase tracking-wide text-ink-muted">
                  Confirmer le mot de passe
                </label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="mt-1 w-full rounded-md border border-line bg-background px-3 py-2 text-sm outline-none focus:border-ink"
                />
              </div>

              {msg && (
                <p
                  className={`rounded-md px-3 py-2 text-sm ${
                    msg.type === "ok" ? "bg-surface text-ink" : "bg-destructive/10 text-destructive"
                  }`}
                >
                  {msg.text}
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
              >
                {loading ? "..." : "Mettre à jour"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
