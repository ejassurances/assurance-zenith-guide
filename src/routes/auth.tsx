import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SITE } from "@/lib/site";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: `Espace client — ${SITE.name}` },
      { name: "description", content: "Connexion à l'espace client, mandataire et prescripteur du cabinet EJ Partners Assurances." },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotMsg, setForgotMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/espace" });
    });
  }, [navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      navigate({ to: "/espace" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setLoading(false);
    }
  };

  const requestReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotMsg(null);
    setForgotLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setForgotLoading(false);
    if (error) {
      setForgotMsg({ type: "err", text: error.message });
    } else {
      setForgotMsg({
        type: "ok",
        text: "Si un compte existe pour cette adresse, un e-mail de réinitialisation vient d'être envoyé.",
      });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-line">
        <div className="container-page flex h-16 items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5">
            <img src="/logo-ej-partners.png" alt="" className="size-8 rounded-md object-cover" />
            <span className="font-serif text-base font-medium">{SITE.shortName}</span>
          </Link>
          <Link
            to="/"
            className="rounded-full border border-line px-4 py-1.5 text-sm text-ink-soft hover:bg-surface"
          >
            ← Retour au site
          </Link>
        </div>
      </header>

      <div className="container-page flex items-center justify-center py-16">
        <div className="w-full max-w-md rounded-2xl border border-line bg-surface-elevated p-8 shadow-sm">
          <h1 className="font-serif text-2xl font-medium text-ink">Connexion à l'espace</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Espace client, mandataire, prescripteur ou administrateur.
          </p>

          {!forgotOpen ? (
            <>
              <form onSubmit={submit} className="mt-6 space-y-4">
                <div>
                  <label className="text-xs font-medium uppercase tracking-wide text-ink-muted">Email</label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="mt-1 w-full rounded-md border border-line bg-background px-3 py-2 text-sm outline-none focus:border-ink"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium uppercase tracking-wide text-ink-muted">Mot de passe</label>
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="mt-1 w-full rounded-md border border-line bg-background px-3 py-2 text-sm outline-none focus:border-ink"
                  />
                </div>

                {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
                >
                  {loading ? "..." : "Se connecter"}
                </button>
              </form>

              <button
                type="button"
                onClick={() => {
                  setForgotOpen(true);
                  setForgotEmail(email);
                  setForgotMsg(null);
                }}
                className="mt-4 w-full text-center text-sm text-ink-muted underline underline-offset-4 hover:text-ink"
              >
                Mot de passe oublié ?
              </button>

              <div className="mt-6 rounded-md border border-line bg-surface px-3 py-3 text-xs text-ink-muted">
                Les comptes sont créés par le cabinet EJ Partners Assurances : administrateur, mandataire, ou
                automatiquement lorsque vous nous adressez une demande depuis le site (contact, recueil de besoins,
                simulateur). Pour un nouvel accès, contactez-nous via{" "}
                <Link to="/contact" className="text-ink underline underline-offset-4">
                  la page contact
                </Link>
                .
              </div>
            </>
          ) : (
            <form onSubmit={requestReset} className="mt-6 space-y-4">
              <div>
                <label className="text-xs font-medium uppercase tracking-wide text-ink-muted">
                  Adresse e-mail du compte
                </label>
                <input
                  type="email"
                  required
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  className="mt-1 w-full rounded-md border border-line bg-background px-3 py-2 text-sm outline-none focus:border-ink"
                />
                <p className="mt-1 text-xs text-ink-muted">
                  Vous recevrez un lien pour définir un nouveau mot de passe.
                </p>
              </div>

              {forgotMsg && (
                <p
                  className={`rounded-md px-3 py-2 text-sm ${
                    forgotMsg.type === "ok" ? "bg-surface text-ink" : "bg-destructive/10 text-destructive"
                  }`}
                >
                  {forgotMsg.text}
                </p>
              )}

              <button
                type="submit"
                disabled={forgotLoading}
                className="w-full rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
              >
                {forgotLoading ? "..." : "Envoyer le lien"}
              </button>

              <button
                type="button"
                onClick={() => {
                  setForgotOpen(false);
                  setForgotMsg(null);
                }}
                className="w-full text-center text-sm text-ink-muted underline underline-offset-4 hover:text-ink"
              >
                Retour à la connexion
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
