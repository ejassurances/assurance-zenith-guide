import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SITE } from "@/lib/site";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: `Connexion — CRM ${SITE.name}` },
      { name: "description", content: "Accès sécurisé au CRM du cabinet EJ Partners Assurances." },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
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
      setError(
        err instanceof Error && /invalid login/i.test(err.message)
          ? "Identifiants incorrects."
          : err instanceof Error
            ? err.message
            : "Erreur de connexion",
      );
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
    setForgotMsg(
      error
        ? { type: "err", text: error.message }
        : {
            type: "ok",
            text: "Si un compte existe pour cette adresse, un e-mail de réinitialisation vient d'être envoyé.",
          },
    );
  };

  const inputClass =
    "mt-1.5 w-full rounded-lg border border-white/15 bg-white/5 px-3.5 py-2.5 text-sm text-white placeholder:text-white/35 outline-none transition focus:border-[var(--crm-gold)] focus:ring-2 focus:ring-[var(--crm-gold)]/25";
  const labelClass = "text-[11px] font-semibold uppercase tracking-[0.14em] text-white/55";
  const buttonClass =
    "w-full rounded-lg bg-[var(--crm-gold)] px-5 py-2.5 text-sm font-semibold text-[#0a192f] transition hover:brightness-110 disabled:opacity-50";

  return (
    <div className="crm-theme min-h-screen bg-[#0a192f]">
      <div className="flex min-h-screen items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <div className="flex flex-col items-center text-center">
            <img
              src="/logo-ej-partners.png"
              alt={`Logo ${SITE.name}`}
              className="size-14 rounded-xl object-cover ring-1 ring-[var(--crm-gold)]/40"
            />
            <h1 className="mt-5 text-2xl font-bold tracking-tight text-white">{SITE.name}</h1>
            <p className="mt-1.5 text-sm text-white/55">CRM interne — accès sécurisé</p>
            <span className="mt-4 h-px w-16 bg-[var(--crm-gold)]/60" />
          </div>

          <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.04] p-7 shadow-2xl backdrop-blur">
            {!forgotOpen ? (
              <>
                <h2 className="text-base font-semibold text-white">Connexion</h2>
                <p className="mt-1 text-xs text-white/50">
                  Administrateur, mandataire, prescripteur ou client.
                </p>

                <form onSubmit={submit} className="mt-6 space-y-4">
                  <div>
                    <label htmlFor="email" className={labelClass}>Email</label>
                    <input
                      id="email"
                      type="email"
                      autoComplete="email"
                      required
                      placeholder="prenom.nom@ej-assurances.fr"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label htmlFor="password" className={labelClass}>Mot de passe</label>
                    <div className="relative">
                      <input
                        id="password"
                        type={showPwd ? "text" : "password"}
                        autoComplete="current-password"
                        required
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className={`${inputClass} pr-16`}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPwd((v) => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-white/50 hover:text-white"
                      >
                        {showPwd ? "Masquer" : "Afficher"}
                      </button>
                    </div>
                  </div>

                  {error && (
                    <p className="rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                      {error}
                    </p>
                  )}

                  <button type="submit" disabled={loading} className={buttonClass}>
                    {loading ? "Connexion…" : "Se connecter"}
                  </button>
                </form>

                <button
                  type="button"
                  onClick={() => {
                    setForgotOpen(true);
                    setForgotEmail(email);
                    setForgotMsg(null);
                  }}
                  className="mt-4 w-full text-center text-xs text-white/55 underline underline-offset-4 hover:text-white"
                >
                  Mot de passe oublié ?
                </button>

                <p className="mt-6 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-3 text-[11px] leading-relaxed text-white/50">
                  Les accès sont créés exclusivement par le cabinet. Aucune inscription libre :
                  contactez votre administrateur pour obtenir un compte.
                </p>
              </>
            ) : (
              <form onSubmit={requestReset} className="space-y-4">
                <h2 className="text-base font-semibold text-white">Réinitialiser le mot de passe</h2>
                <div>
                  <label htmlFor="forgot" className={labelClass}>Adresse e-mail du compte</label>
                  <input
                    id="forgot"
                    type="email"
                    required
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    className={inputClass}
                  />
                  <p className="mt-1.5 text-xs text-white/45">
                    Vous recevrez un lien pour définir un nouveau mot de passe.
                  </p>
                </div>

                {forgotMsg && (
                  <p
                    className={`rounded-lg px-3 py-2 text-sm ${
                      forgotMsg.type === "ok"
                        ? "border border-[var(--crm-gold)]/30 bg-[var(--crm-gold)]/10 text-[var(--crm-gold)]"
                        : "border border-red-400/30 bg-red-500/10 text-red-200"
                    }`}
                  >
                    {forgotMsg.text}
                  </p>
                )}

                <button type="submit" disabled={forgotLoading} className={buttonClass}>
                  {forgotLoading ? "Envoi…" : "Envoyer le lien"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setForgotOpen(false);
                    setForgotMsg(null);
                  }}
                  className="w-full text-center text-xs text-white/55 underline underline-offset-4 hover:text-white"
                >
                  Retour à la connexion
                </button>
              </form>
            )}
          </div>

          <p className="mt-6 text-center text-[11px] text-white/35">
            {SITE.name} · {SITE.orias} · SIRET {SITE.siret}
          </p>
        </div>
      </div>
    </div>
  );
}
