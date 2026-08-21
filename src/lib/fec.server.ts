import type { SupabaseClient } from "@supabase/supabase-js";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Client = SupabaseClient<any, any, any>;

/**
 * Fichier des Ecritures Comptables (FEC, art. A.47 A-1 du LPF).
 * Séparateur « | », encodage UTF-8, dates au format AAAAMMJJ, montants à 2
 * décimales avec virgule décimale (norme française).
 */
const COLONNES = [
  "JournalCode",
  "JournalLib",
  "EcritureNum",
  "EcritureDate",
  "CompteNum",
  "CompteLib",
  "CompAuxNum",
  "CompAuxLib",
  "PieceRef",
  "PieceDate",
  "EcritureLib",
  "Debit",
  "Credit",
  "EcritureLet",
  "DateLet",
  "ValidDate",
  "Montantdevise",
  "Idevise",
] as const;

const jour = (d: string | null) => (d ? d.replaceAll("-", "").slice(0, 8) : "");
const montant = (n: number) => n.toFixed(2).replace(".", ",");
const champ = (v: string | null | undefined) => (v ?? "").replace(/[|\r\n]+/g, " ").trim();

export type LigneFec = Record<(typeof COLONNES)[number], string>;

export async function construireFec(
  supabase: Client,
  params: { date_debut: string; date_fin: string },
): Promise<{ csv: string; nom_fichier: string; nb_lignes: number; total_debit: number; total_credit: number }> {
  const [{ data: ecritures }, { data: comptes }, { data: journaux }] = await Promise.all([
    supabase
      .from("ecritures")
      .select(
        "id,journal_code,date_ecriture,numero_piece,libelle,reference_externe,statut,source,source_id,updated_at,ecritures_lignes(numero_ligne,compte_numero,libelle,debit,credit)",
      )
      .gte("date_ecriture", params.date_debut)
      .lte("date_ecriture", params.date_fin)
      .neq("statut", "brouillon")
      .order("date_ecriture", { ascending: true }),
    supabase.from("plan_comptable").select("numero,libelle"),
    supabase.from("journaux").select("code,libelle"),
  ]);

  const libComptes = new Map<string, string>((comptes ?? []).map((c: any) => [c.numero, c.libelle]));
  const libJournaux = new Map<string, string>((journaux ?? []).map((j: any) => [j.code, j.libelle]));

  // Référence métier EJ-AAAA-RISQUE-XXXX : rattachement via les commissions comptabilisées.
  const ids = (ecritures ?? []).map((e: any) => e.id);
  const refParEcriture = new Map<string, string>();
  if (ids.length > 0) {
    const { data: commissions } = await supabase
      .from("commissions")
      .select("ecriture_id,dossiers(reference)")
      .in("ecriture_id", ids);
    for (const c of (commissions ?? []) as any[]) {
      const ref = c.dossiers?.reference;
      if (c.ecriture_id && ref) refParEcriture.set(c.ecriture_id, ref);
    }
  }

  const lignes: string[] = [COLONNES.join("|")];
  let numero = 0;
  let totalDebit = 0;
  let totalCredit = 0;

  for (const e of (ecritures ?? []) as any[]) {
    numero += 1;
    const journalLib = libJournaux.get(e.journal_code) ?? e.journal_code;
    const pieceRef = champ(refParEcriture.get(e.id) ?? e.reference_externe ?? e.numero_piece);
    const validDate = e.statut === "brouillon" ? "" : jour((e.updated_at ?? "").slice(0, 10));
    const sousLignes = [...(e.ecritures_lignes ?? [])].sort(
      (a: any, b: any) => (a.numero_ligne ?? 0) - (b.numero_ligne ?? 0),
    );
    for (const l of sousLignes) {
      const debit = Number(l.debit ?? 0);
      const credit = Number(l.credit ?? 0);
      totalDebit += debit;
      totalCredit += credit;
      const ligne: LigneFec = {
        JournalCode: champ(e.journal_code),
        JournalLib: champ(journalLib),
        EcritureNum: String(numero).padStart(6, "0"),
        EcritureDate: jour(e.date_ecriture),
        CompteNum: champ(l.compte_numero),
        CompteLib: champ(libComptes.get(l.compte_numero) ?? l.compte_numero),
        CompAuxNum: "",
        CompAuxLib: "",
        PieceRef: pieceRef,
        PieceDate: jour(e.date_ecriture),
        EcritureLib: champ(l.libelle || e.libelle),
        Debit: montant(debit),
        Credit: montant(credit),
        EcritureLet: "",
        DateLet: "",
        ValidDate: validDate,
        Montantdevise: "",
        Idevise: "",
      };
      lignes.push(COLONNES.map((c) => ligne[c]).join("|"));
    }
  }

  const nom = `FEC_500256904_${params.date_fin.replaceAll("-", "")}.txt`;
  return {
    csv: lignes.join("\r\n"),
    nom_fichier: nom,
    nb_lignes: lignes.length - 1,
    total_debit: Number(totalDebit.toFixed(2)),
    total_credit: Number(totalCredit.toFixed(2)),
  };
}
