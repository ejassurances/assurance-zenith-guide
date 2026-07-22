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
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/espace" });
    });
  }, [navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/espace`,
            data: { full_name: fullName },
          },
        });
        if (error) throw error;
        setInfo("Compte créé. Vous pouvez vous connecter.");
        setMode("login");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate({ to: "/espace" });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container-page flex min-h-screen items-center justify-center py-16">
        <div className="w-full max-w-md rounded-2xl border border-line bg-surface-elevated p-8 shadow-sm">
          <Link to="/" className="mb-8 flex items-center gap-2.5">
            <img src="/logo-ej-partners.png" alt="" className="size-9 rounded-md object-cover" />
            <span className="font-serif text-lg font-medium tracking-tight">{SITE.shortName}</span>
          </Link>
          <h1 className="font-serif text-2xl font-medium text-ink">
            {mode === "login" ? "Connexion à l'espace" : "Créer un compte"}
          </h1>
          <p className="mt-1 text-sm text-ink-muted">
            {mode === "login"
              ? "Espace client, mandataire, prescripteur ou administrateur."
              : "Votre rôle sera configuré par un administrateur du cabinet."}
          </p>

          <form onSubmit={submit} className="mt-6 space-y-4">
            {mode === "signup" && (
              <div>
                <label className="text-xs font-medium uppercase tracking-wide text-ink-muted">Nom complet</label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="mt-1 w-full rounded-md border border-line bg-background px-3 py-2 text-sm outline-none focus:border-ink"
                />
              </div>
            )}
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
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 w-full rounded-md border border-line bg-background px-3 py-2 text-sm outline-none focus:border-ink"
              />
            </div>

            {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
            {info && <p className="rounded-md bg-surface px-3 py-2 text-sm text-ink">{info}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {loading ? "..." : mode === "login" ? "Se connecter" : "Créer le compte"}
            </button>
          </form>

          <button
            type="button"
            onClick={() => setMode(mode === "login" ? "signup" : "login")}
            className="mt-4 w-full text-center text-sm text-ink-muted hover:text-ink"
          >
            {mode === "login" ? "Créer un compte" : "J'ai déjà un compte"}
          </button>
        </div>
      </div>
    </div>
  );
}
