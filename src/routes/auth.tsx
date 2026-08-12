import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SITE } from "@/lib/site";
import { useServerFn } from "@tanstack/react-start";
import { autoInscriptionClient } from "@/lib/client-espace.functions";

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

  const [signupOpen, setSignupOpen] = useState(false);
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPwd, setSignupPwd] = useState("");
  const [signupPwd2, setSignupPwd2] = useState("");
  const [signupLoading, setSignupLoading] = useState(false);
  const [signupMsg, setSignupMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const creerCompte = useServerFn(autoInscriptionClient);

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

  const submitSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setSignupMsg(null);
    if (signupPwd.length < 10) {
      setSignupMsg({ type: "err", text: "Le mot de passe doit contenir au moins 10 caractères." });
      return;
    }
    if (signupPwd !== signupPwd2) {
      setSignupMsg({ type: "err", text: "Les deux mots de passe ne correspondent pas." });
      return;
    }
    setSignupLoading(true);
    try {
      const res = await creerCompte({ data: { email: signupEmail, password: signupPwd } });
      if (!res.ok) {
        setSignupMsg({ type: "err", text: res.error });
      } else {
        const { error: signInErr } = await supabase.auth.signInWithPassword({
          email: signupEmail,
          password: signupPwd,
        });
        if (signInErr) {
          setSignupMsg({ type: "ok", text: "Votre espace est créé. Vous pouvez vous connecter." });
        } else {
          navigate({ to: "/espace/mon-espace" });
        }
      }
    } catch (err) {
      setSignupMsg({ type: "err", text: err instanceof Error ? err.message : "Erreur" });
    } finally {
      setSignupLoading(false);
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
    "mt-1.5 w-full rounded-lg border border-white/15 bg-white/5 px-3.5 py-2.5 text-sm text-white placeholder:text-white/35 outline-none transition focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/25";
  const labelClass = "text-[11px] font-semibold uppercase tracking-[0.14em] text-white/55";
  const buttonClass =
    "w-full rounded-lg bg-[#d4af37] px-5 py-2.5 text-sm font-semibold text-[#0a192f] transition hover:brightness-110 disabled:opacity-50";

  return (
    <div
      className="min-h-screen font-sans"
      style={{
        backgroundColor: "#0a192f",
        backgroundImage:
          "radial-gradient(80rem 40rem at 50% -10%, rgba(212,175,55,0.10), transparent 60%)",
        fontFamily: '"Plus Jakarta Sans", Inter, system-ui, sans-serif',
      }}
    >
      <div className="flex min-h-screen items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <div className="flex flex-col items-center text-center">
            <img
              src="/logo-ej-partners.png"
              alt={`Logo ${SITE.name}`}
              className="size-14 rounded-xl object-cover ring-1 ring-[#d4af37]/40"
            />
            <h1 className="mt-5 font-sans text-2xl font-bold tracking-tight text-white">{SITE.name}</h1>
            <p className="mt-1.5 text-sm text-white/55">CRM interne — accès sécurisé</p>
            <span className="mt-4 h-px w-16 bg-[#d4af37]/60" />
          </div>

          <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.04] p-7 shadow-2xl backdrop-blur">
            {!forgotOpen && !signupOpen ? (
              <>
                <h2 className="font-sans text-base font-semibold text-white">Connexion</h2>
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

                <button
                  type="button"
                  onClick={() => {
                    setSignupOpen(true);
                    setSignupEmail(email);
                    setSignupMsg(null);
                  }}
                  className="mt-2 w-full text-center text-xs text-[#d4af37] underline underline-offset-4 hover:brightness-125"
                >
                  Client du cabinet ? Activer mon espace
                </button>

                <p className="mt-6 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-3 text-[11px] leading-relaxed text-white/50">
                  Les accès collaborateurs sont créés exclusivement par le cabinet. L'activation d'espace est
                  réservée aux clients déjà enregistrés dans nos fichiers.
                </p>
              </>
            ) : forgotOpen ? (
              <form onSubmit={requestReset} className="space-y-4">
                <h2 className="font-sans text-base font-semibold text-white">Réinitialiser le mot de passe</h2>
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
                        ? "border border-[#d4af37]/30 bg-[#d4af37]/10 text-[#d4af37]"
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
            ) : (
              <form onSubmit={submitSignup} className="space-y-4">
                <h2 className="font-sans text-base font-semibold text-white">Activer mon espace client</h2>
                <p className="text-xs text-white/50">
                  Réservé aux clients du cabinet : utilisez l'adresse e-mail communiquée à votre conseiller.
                </p>
                <div>
                  <label htmlFor="signup-email" className={labelClass}>Adresse e-mail</label>
                  <input
                    id="signup-email"
                    type="email"
                    required
                    value={signupEmail}
                    onChange={(e) => setSignupEmail(e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label htmlFor="signup-pwd" className={labelClass}>Mot de passe</label>
                  <input
                    id="signup-pwd"
                    type="password"
                    required
                    autoComplete="new-password"
                    value={signupPwd}
                    onChange={(e) => setSignupPwd(e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label htmlFor="signup-pwd2" className={labelClass}>Confirmation</label>
                  <input
                    id="signup-pwd2"
                    type="password"
                    required
                    autoComplete="new-password"
                    value={signupPwd2}
                    onChange={(e) => setSignupPwd2(e.target.value)}
                    className={inputClass}
                  />
                </div>

                {signupMsg && (
                  <p
                    className={`rounded-lg px-3 py-2 text-sm ${
                      signupMsg.type === "ok"
                        ? "border border-[#d4af37]/30 bg-[#d4af37]/10 text-[#d4af37]"
                        : "border border-red-400/30 bg-red-500/10 text-red-200"
                    }`}
                  >
                    {signupMsg.text}
                  </p>
                )}

                <button type="submit" disabled={signupLoading} className={buttonClass}>
                  {signupLoading ? "Création…" : "Créer mon espace"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSignupOpen(false);
                    setSignupMsg(null);
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
