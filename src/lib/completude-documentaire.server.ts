/**
 * LOT 2D — CD-SI-002-D : moteur de complétude documentaire.
 *
 * Lecture seule des structures existantes (`dossiers`, `dossier_pieces_requises`,
 * `documents`) : le moteur ne crée, ne modifie ni ne supprime aucun document,
 * aucune extraction (Lot 2C) et aucune classification (Lot 2A).
 *
 * Règle d'éligibilité V1 : seule une pièce dont le statut de validation est
 * `validee` (équivalent VALIDATED) et dont le document est réellement rattaché
 * au dossier et lisible satisfait une pièce requise. `recue` (PENDING) et
 * `refusee` (REJECTED) ne satisfont jamais. La confiance IA n'est jamais
 * utilisée pour valider automatiquement une pièce.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type Admin = SupabaseClient<Database>;

export type EtatCompletude = "COMPLET" | "INCOMPLET" | "A_QUALIFIER";

export interface PieceCompletude {
  id: string;
  code: string;
  libelle: string;
  categorie: string;
  obligatoire: boolean;
  statut: string;
  document_id: string | null;
  kyc_document_id: string | null;
  /** Nombre de documents du dossier de ce type (doublons inclus). */
  documents_lies: number;
  motif: string | null;
}

export interface ResultatCompletude {
  dossier_id: string;
  dossier_reference: string | null;
  etat: EtatCompletude;
  calcule_le: string;
  requises_obligatoires: PieceCompletude[];
  satisfaites: PieceCompletude[];
  manquantes: PieceCompletude[];
  a_qualifier: PieceCompletude[];
  optionnelles_non_recues: PieceCompletude[];
  doublons: { code: string; nombre: number }[];
  prochaine_action: string;
}

/** Statuts de la checklist existante, alignés sur la nomenclature de la spec. */
const VALIDATED = "validee";
const PENDING = "recue";
const REJECTED = "refusee";

const TYPES_NON_SATISFAISANTS = new Set(["a_qualifier", "autre"]);

interface DocRow {
  id: string;
  dossier_id: string | null;
  type_document: string | null;
  archive_le: string | null;
  classification_ia: unknown;
}

function lisible(doc: DocRow | undefined): boolean {
  if (!doc) return true; // aucune classification IA : pas de motif d'exclusion
  const c = doc.classification_ia as { document_lisible?: boolean } | null;
  return c?.document_lisible !== false;
}

/**
 * Calcule l'état de complétude d'un dossier. Aucune écriture.
 */
export async function calculerCompletudeDossier(
  admin: Admin,
  dossierId: string,
): Promise<ResultatCompletude> {
  const [{ data: dossier }, { data: piecesRows }, { data: docsRows }] = await Promise.all([
    admin.from("dossiers").select("id, reference").eq("id", dossierId).maybeSingle(),
    admin
      .from("dossier_pieces_requises")
      .select("id, code, libelle, categorie, obligatoire, statut, document_id, kyc_document_id")
      .eq("dossier_id", dossierId),
    admin
      .from("documents")
      .select("id, dossier_id, type_document, archive_le, classification_ia")
      .eq("dossier_id", dossierId),
  ]);

  const docs = ((docsRows ?? []) as DocRow[]).filter((d) => !d.archive_le);
  const parId = new Map(docs.map((d) => [d.id, d]));
  const parType = new Map<string, DocRow[]>();
  for (const d of docs) {
    const t = d.type_document ?? "";
    if (!t) continue;
    parType.set(t, [...(parType.get(t) ?? []), d]);
  }

  const satisfaites: PieceCompletude[] = [];
  const manquantes: PieceCompletude[] = [];
  const aQualifier: PieceCompletude[] = [];
  const optionnellesNonRecues: PieceCompletude[] = [];
  const requisesObligatoires: PieceCompletude[] = [];

  for (const row of (piecesRows ?? []) as {
    id: string;
    code: string;
    libelle: string;
    categorie: string;
    obligatoire: boolean;
    statut: string;
    document_id: string | null;
    kyc_document_id: string | null;
  }[]) {
    const doc = row.document_id ? parId.get(row.document_id) : undefined;
    // Un document rattaché à un autre dossier (ou non rattaché) ne peut pas
    // satisfaire la pièce : le rattachement effectif est la seule preuve.
    const rattachementInsuffisant = Boolean(row.document_id) && !doc && !row.kyc_document_id;

    let motif: string | null = null;
    let satisfaite = false;
    let ambigue = false;

    if (row.statut === VALIDATED) {
      if (rattachementInsuffisant) {
        motif = "document validé mais non rattaché à ce dossier";
        ambigue = true;
      } else if (!lisible(doc)) {
        motif = "document illisible";
        ambigue = true;
      } else {
        satisfaite = true;
      }
    } else if (row.statut === PENDING) {
      motif = "document reçu, en attente de validation";
      ambigue = true;
    } else if (row.statut === REJECTED) {
      motif = "document refusé — nouvelle pièce à obtenir";
    } else {
      motif = "pièce non reçue";
    }

    // Une ligne « à qualifier » (fichier non identifié) reste une situation non
    // résolue, jamais une pièce satisfaite.
    if (row.categorie === "a_qualifier" || TYPES_NON_SATISFAISANTS.has(row.code)) {
      satisfaite = false;
      ambigue = true;
      motif = motif ?? "pièce à qualifier";
    }

    const piece: PieceCompletude = {
      id: row.id,
      code: row.code,
      libelle: row.libelle,
      categorie: row.categorie,
      obligatoire: row.obligatoire,
      statut: row.statut,
      document_id: row.document_id,
      kyc_document_id: row.kyc_document_id,
      documents_lies: (parType.get(row.code) ?? []).length,
      motif: satisfaite ? null : motif,
    };

    if (row.obligatoire) requisesObligatoires.push(piece);

    if (satisfaite) {
      satisfaites.push(piece);
    } else if (ambigue) {
      aQualifier.push(piece);
    } else if (row.obligatoire) {
      manquantes.push(piece);
    } else {
      optionnellesNonRecues.push(piece);
    }
  }

  const doublons = [...parType.entries()]
    .filter(([, list]) => list.length > 1)
    .map(([code, list]) => ({ code, nombre: list.length }));

  const aQualifierBloquant = aQualifier.filter((p) => p.obligatoire);
  const etat: EtatCompletude =
    aQualifierBloquant.length > 0
      ? "A_QUALIFIER"
      : manquantes.length > 0
        ? "INCOMPLET"
        : "COMPLET";

  const prochaine_action =
    etat === "COMPLET"
      ? "Aucune pièce à demander : dossier documentairement complet."
      : etat === "INCOMPLET"
        ? `Demander les pièces obligatoires manquantes : ${manquantes.map((p) => p.libelle).join(", ")}`
        : `Qualification humaine requise : ${aQualifierBloquant.map((p) => `${p.libelle} (${p.motif})`).join(" ; ")}`;

  return {
    dossier_id: dossierId,
    dossier_reference: (dossier as { reference: string } | null)?.reference ?? null,
    etat,
    calcule_le: new Date().toISOString(),
    requises_obligatoires: requisesObligatoires,
    satisfaites,
    manquantes,
    a_qualifier: aQualifier,
    optionnelles_non_recues: optionnellesNonRecues,
    doublons,
    prochaine_action,
  };
}

function resume(r: ResultatCompletude): string {
  return [
    `Dossier : ${r.dossier_reference ?? r.dossier_id}`,
    `État de complétude : ${r.etat}`,
    `Pièces obligatoires : ${r.requises_obligatoires.length} — satisfaites ${
      r.satisfaites.filter((p) => p.obligatoire).length
    }`,
    r.manquantes.length > 0 ? `Manquantes : ${r.manquantes.map((p) => p.libelle).join(", ")}` : null,
    r.a_qualifier.length > 0
      ? `À qualifier : ${r.a_qualifier.map((p) => `${p.libelle} (${p.motif})`).join(" ; ")}`
      : null,
    r.optionnelles_non_recues.length > 0
      ? `Optionnelles non reçues : ${r.optionnelles_non_recues.map((p) => p.libelle).join(", ")}`
      : null,
    r.doublons.length > 0
      ? `Doublons conservés : ${r.doublons.map((d) => `${d.code} ×${d.nombre}`).join(", ")}`
      : null,
    `Prochaine action : ${r.prochaine_action}`,
    `Calculé le : ${r.calcule_le}`,
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Recalcule la complétude et journalise le résultat dans les structures
 * existantes (`activites`, `taches`). Idempotent : aucune trace ni tâche n'est
 * créée si l'état et le détail sont identiques au dernier calcul journalisé.
 * Aucun e-mail, aucune communication externe.
 */
export async function recalculerCompletude(
  admin: Admin,
  dossierId: string,
  options: { userId?: string | null } = {},
): Promise<{ resultat: ResultatCompletude; journalise: boolean }> {
  const resultat = await calculerCompletudeDossier(admin, dossierId);
  const texte = resume(resultat);
  const TITRE = "Complétude documentaire";

  const { data: clientRow } = await admin
    .from("dossiers")
    .select("client_id")
    .eq("id", dossierId)
    .maybeSingle();
  const clientId = (clientRow as { client_id: string | null } | null)?.client_id ?? null;

  // Idempotence : comparaison au dernier état journalisé pour ce dossier.
  let requeteTraces = admin
    .from("activites")
    .select("id, contenu")
    .eq("type", "systeme")
    .eq("titre", TITRE)
    .order("created_at", { ascending: false })
    .limit(200);
  if (clientId) requeteTraces = requeteTraces.eq("client_id", clientId);
  const { data: dernieres } = await requeteTraces;
  const ligneDossier = `Dossier : ${resultat.dossier_reference ?? resultat.dossier_id}`;
  const precedente = ((dernieres ?? []) as { contenu: string | null }[]).find((a) =>
    (a.contenu ?? "").startsWith(ligneDossier),
  );
  const comparable = (t: string | null) =>
    (t ?? "")
      .split("\n")
      .filter((l) => !l.startsWith("Calculé le :"))
      .join("\n");
  if (precedente && comparable(precedente.contenu) === comparable(texte)) {
    return { resultat, journalise: false };
  }

  try {
    await admin.from("activites").insert({
      client_id: clientId,
      type: "systeme",
      titre: TITRE,
      contenu: texte.slice(0, 6000),
    } as never);
  } catch (e) {
    console.error("[Lot2D] trace de complétude non enregistrée", e);
  }

  // Qualification humaine : une seule tâche ouverte par dossier.
  if (resultat.etat === "A_QUALIFIER") {
    const titreTache = `Complétude à qualifier — dossier ${resultat.dossier_reference ?? dossierId}`.slice(0, 200);
    const { data: existante } = await admin
      .from("taches")
      .select("id")
      .eq("titre", titreTache)
      .in("statut", ["a_faire", "en_cours"])
      .limit(1);
    if (((existante ?? []) as unknown[]).length === 0) {
      const { creerTacheAdmin } = await import("@/lib/agent-taches.server");
      await creerTacheAdmin(admin as never, {
        titre: titreTache,
        description: [
          "La complétude documentaire du dossier n'a pas pu être déterminée automatiquement.",
          "",
          texte,
          "",
          "Action : ouvrir le dossier, vérifier les pièces concernées et statuer manuellement.",
        ].join("\n"),
        client_id: clientId,
        created_by: options.userId ?? null,
      } as never);
    }
  }

  return { resultat, journalise: true };
}
