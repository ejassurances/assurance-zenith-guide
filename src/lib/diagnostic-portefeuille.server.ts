/**
 * Diagnostic du portefeuille : complétude des contrats, état des devis et
 * raccordement au module finance (commissions → comptabilité). LECTURE SEULE.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = SupabaseClient<any, any, any>;

export type VerdictContrat = "ok" | "finance_absente" | "incomplet";

export type ContratDiag = {
  id: string;
  numero: string | null;
  assureur: string | null;
  statut: string | null;
  prime_ttc_annuelle: number | null;
  assiette_commission_annuelle: number | null;
  nb_echeances: number;
  nb_commissions: number;
  nb_comm_compta: number;
  nb_previsions: number;
  a_devis_source: boolean;
  devis_ok: boolean;
  donnees_completes: boolean;
  finance_raccorde: boolean;
  verdict: VerdictContrat;
};

export type DiagnosticKpis = {
  total: number;
  ok: number;
  finance_absente: number;
  incomplet: number;
  commissions_total: number;
  commissions_comptabilisees: number;
  devis_total: number;
  devis_retenus: number;
  dossiers_sans_devis: number;
  bordereaux: number;
  bordereaux_sans_lignes: number;
  ecritures_desequilibrees: number;
};

export type DiagnosticPortefeuille = { contrats: ContratDiag[]; kpis: DiagnosticKpis };

function num(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function diagnosticPortefeuille(admin: Admin): Promise<DiagnosticPortefeuille> {
  const [contrats, echeances, commissions, previsions, devis, dossiers, bordereaux, bordLignes, ecrLignes] =
    await Promise.all([
      admin
        .from("contrats")
        .select(
          "id,numero,assureur,compagnie_id,statut,prime_ttc_annuelle,assiette_commission_annuelle,dossier_id,devis_source_id, compagnies:compagnie_id(nom)",
        ),
      admin.from("contrat_echeances").select("contrat_id"),
      admin.from("commissions").select("contrat_id,ecriture_id"),
      admin.from("commission_previsions").select("contrat_id"),
      admin.from("dossier_devis").select("dossier_id,est_retenu,document_id,archive_le"),
      admin.from("dossiers").select("id"),
      admin.from("bordereaux_commissions").select("id"),
      admin.from("bordereau_lignes").select("bordereau_id"),
      admin.from("ecritures_lignes").select("ecriture_id,debit,credit"),
    ]);

  for (const r of [contrats, echeances, commissions, previsions, devis, dossiers, bordereaux, bordLignes, ecrLignes]) {
    if (r.error) throw new Error(r.error.message);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (contrats.data as any[]) ?? [];

  const countBy = (arr: { contrat_id: string | null }[] | null, pred?: (r: never) => boolean) => {
    const m = new Map<string, number>();
    for (const r of arr ?? []) {
      if (!r.contrat_id) continue;
      if (pred && !pred(r as never)) continue;
      m.set(r.contrat_id, (m.get(r.contrat_id) ?? 0) + 1);
    }
    return m;
  };

  const echByContrat = countBy(echeances.data as never);
  const commByContrat = countBy(commissions.data as never);
  const commComptaByContrat = countBy(
    commissions.data as never,
    (r: { ecriture_id: string | null }) => r.ecriture_id != null,
  );
  const prevByContrat = countBy(previsions.data as never);

  // Devis retenu + documenté, par dossier (devis actifs uniquement).
  const devisRetenuOkParDossier = new Set<string>();
  const dossiersAvecDevis = new Set<string>();
  for (const d of (devis.data as never[] as { dossier_id: string; est_retenu: boolean; document_id: string | null; archive_le: string | null }[]) ?? []) {
    if (d.archive_le) continue;
    dossiersAvecDevis.add(d.dossier_id);
    if (d.est_retenu && d.document_id) devisRetenuOkParDossier.add(d.dossier_id);
  }

  const contratsDiag: ContratDiag[] = rows.map((c) => {
    const primeTtc = num(c.prime_ttc_annuelle);
    const assiette = num(c.assiette_commission_annuelle);
    const nbCommCompta = commComptaByContrat.get(c.id) ?? 0;
    const donnees_completes = Boolean(c.numero) && primeTtc != null && assiette != null;
    const finance_raccorde = nbCommCompta > 0;
    const devis_ok = c.dossier_id ? devisRetenuOkParDossier.has(c.dossier_id) : false;
    const verdict: VerdictContrat = !donnees_completes
      ? "incomplet"
      : !finance_raccorde
        ? "finance_absente"
        : "ok";
    return {
      id: c.id,
      numero: c.numero ?? null,
      assureur: c.assureur ?? c.compagnies?.nom ?? null,
      statut: c.statut ?? null,
      prime_ttc_annuelle: primeTtc,
      assiette_commission_annuelle: assiette,
      nb_echeances: echByContrat.get(c.id) ?? 0,
      nb_commissions: commByContrat.get(c.id) ?? 0,
      nb_comm_compta: nbCommCompta,
      nb_previsions: prevByContrat.get(c.id) ?? 0,
      a_devis_source: Boolean(c.devis_source_id),
      devis_ok,
      donnees_completes,
      finance_raccorde,
      verdict,
    };
  });

  // Écritures déséquilibrées (débit ≠ crédit).
  const soldes = new Map<string, number>();
  for (const l of (ecrLignes.data as never[] as { ecriture_id: string; debit: unknown; credit: unknown }[]) ?? []) {
    const delta = (num(l.debit) ?? 0) - (num(l.credit) ?? 0);
    soldes.set(l.ecriture_id, (soldes.get(l.ecriture_id) ?? 0) + delta);
  }
  let ecrituresDesequilibrees = 0;
  for (const s of soldes.values()) if (Math.abs(s) > 0.01) ecrituresDesequilibrees += 1;

  const bordIds = ((bordereaux.data as { id: string }[]) ?? []).map((b) => b.id);
  const bordAvecLignes = new Set(((bordLignes.data as { bordereau_id: string }[]) ?? []).map((l) => l.bordereau_id));

  const kpis: DiagnosticKpis = {
    total: contratsDiag.length,
    ok: contratsDiag.filter((c) => c.verdict === "ok").length,
    finance_absente: contratsDiag.filter((c) => c.verdict === "finance_absente").length,
    incomplet: contratsDiag.filter((c) => c.verdict === "incomplet").length,
    commissions_total: (commissions.data as unknown[])?.length ?? 0,
    commissions_comptabilisees: [...commComptaByContrat.values()].reduce((a, b) => a + b, 0),
    devis_total: ((devis.data as { archive_le: string | null }[]) ?? []).filter((d) => !d.archive_le).length,
    devis_retenus: devisRetenuOkParDossier.size,
    dossiers_sans_devis: ((dossiers.data as { id: string }[]) ?? []).filter((d) => !dossiersAvecDevis.has(d.id)).length,
    bordereaux: bordIds.length,
    bordereaux_sans_lignes: bordIds.filter((id) => !bordAvecLignes.has(id)).length,
    ecritures_desequilibrees: ecrituresDesequilibrees,
  };

  // Tri : problèmes d'abord (incomplet, puis finance absente, puis ok).
  const ordre: Record<VerdictContrat, number> = { incomplet: 0, finance_absente: 1, ok: 2 };
  contratsDiag.sort((a, b) => ordre[a.verdict] - ordre[b.verdict]);

  return { contrats: contratsDiag, kpis };
}
