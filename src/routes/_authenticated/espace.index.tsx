import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/_authenticated/espace/")({
  component: Dashboard,
});

function Dashboard() {
  const { role, user } = useAuth();
  const [stats, setStats] = useState({ dossiers: 0, enCours: 0, signes: 0, commissions: 0 });

  useEffect(() => {
    (async () => {
      const { count: total } = await supabase.from("dossiers").select("*", { count: "exact", head: true });
      const { count: enCours } = await supabase
        .from("dossiers")
        .select("*", { count: "exact", head: true })
        .eq("statut", "en_cours");
      const { count: signes } = await supabase
        .from("dossiers")
        .select("*", { count: "exact", head: true })
        .eq("statut", "signe");
      const { data: commData } = await supabase.from("commissions").select("montant");
      const commissions = (commData ?? []).reduce((s, c) => s + Number(c.montant), 0);
      setStats({ dossiers: total ?? 0, enCours: enCours ?? 0, signes: signes ?? 0, commissions });
    })();
  }, []);

  return (
    <div>
      <h1 className="font-serif text-3xl font-medium text-ink">Bonjour</h1>
      <p className="mt-1 text-sm text-ink-muted">
        Connecté en tant que <span className="font-medium text-ink">{user?.email}</span> — rôle {role ?? "…"}
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card label="Dossiers" value={stats.dossiers} />
        <Card label="En cours" value={stats.enCours} />
        <Card label="Signés" value={stats.signes} />
        {role !== "client" && <Card label="Commissions (€)" value={stats.commissions.toLocaleString("fr-FR")} />}
      </div>

      <div className="mt-10 rounded-2xl border border-line bg-surface-elevated p-6">
        <h2 className="font-serif text-lg font-medium">Aide-mémoire</h2>
        <ul className="mt-3 space-y-2 text-sm text-ink-muted">
          <li>• Les <strong>Dossiers</strong> regroupent les emprunteurs suivis : capital, durée, économie estimée, statut, messages et documents.</li>
          {role !== "client" && <li>• Les <strong>Commissions</strong> tracent les apports et versements par dossier.</li>}
          {role === "admin" && <li>• L'onglet <strong>Utilisateurs</strong> permet d'attribuer les rôles (mandataire, prescripteur, client).</li>}
        </ul>
      </div>
    </div>
  );
}

function Card({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-2xl border border-line bg-surface-elevated p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">{label}</p>
      <p className="mt-2 font-serif text-3xl font-medium text-ink">{value}</p>
    </div>
  );
}
