/**
 * CD-SI-001-B — LOT IHM QUALIFICATION — TESTS IHM-01 → IHM-16.
 * Référence exclusive : docs/CD-SI-001-B-LOT-IHM-QUALIFICATION-DESIGN-V1.1.md
 *
 * Doubles en mémoire exclusivement : aucune base réelle, aucun Gemini,
 * aucun Gmail, aucune migration, aucune écriture réelle.
 */
import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

import {
  composerGardeQ11,
  type LigneEmailLot3,
  type ParamsEcritureAiContext,
  type ResultatEcritureAiContext,
} from "./email-context-resolver.server";
import { EMAIL_CONTEXT_SCHEMA_VERSION, type EmailContext } from "./email-context-types";
import {
  appliquerIntentionHumaine,
  cleValidation,
  type CorrectionContexte,
} from "./email-context-validation";
import { validerContexteEmail, type LecteurValidation } from "./email-context-validation.server";

const OPERATEUR = "11111111-1111-4111-8111-111111111111";
const AUTRE_OPERATEUR = "22222222-2222-4222-8222-222222222222";
const VALIDE_LE = "2026-08-28T07:00:00.000Z";
const UPDATED_AT = "2026-08-28T06:59:59.123456+00:00";
const CLIENT = "33333333-3333-4333-8333-333333333333";

const contexte = (p: Partial<EmailContext> = {}): EmailContext => ({
  schema_version: EMAIL_CONTEXT_SCHEMA_VERSION,
  correspondant: {
    email: "jean.dupont@example.com",
    nom_affiche: "Jean Dupont",
    client_id: null,
    statut: "DETECTED",
    provenance: { source: "gemini" },
  },
  personnes_detectees: [{ nom: "Dupont", statut: "DETECTED", provenance: { source: "gemini" } }],
  dossiers_detectes: [],
  contrats_detectes: [],
  produits_cites: [],
  documents_associes: [],
  preuves: [],
  ambiguities: [],
  analyse: { statut: "DETECTED", validation_humaine_requise: true, provenance: { source: "gemini" } },
  ...p,
});

const valide = (): EmailContext =>
  contexte({
    analyse: {
      statut: "CONFIRMED",
      validation_humaine_requise: false,
      validated_by: OPERATEUR,
      validated_at: VALIDE_LE,
      provenance: { source: "humain" },
    },
  });

/** Base simulée : applique la garde Q.11 comme le ferait PostgREST. */
function baseSimulee(options: {
  etat: LigneEmailLot3 | null;
  erreur?: string | null;
  /** Force un conflit : la garde échoue quelle que soit la requête. */
  conflit?: boolean;
}) {
  const journal: { updates: ParamsEcritureAiContext[]; gardes: number[] } = { updates: [], gardes: [] };
  let etat = options.etat;
  const db: LecteurValidation = {
    async lireEmail() {
      return etat;
    },
    async ecrireAiContext(params): Promise<ResultatEcritureAiContext> {
      journal.updates.push(params);
      journal.gardes.push(composerGardeQ11(params.observe).length);
      if (options.erreur) return { lignesAffectees: 0, erreur: options.erreur };
      if (options.conflit) return { lignesAffectees: 0, erreur: null };
      etat = etat
        ? { ...etat, ai_context: params.contexte, updated_at: "2026-08-28T07:00:01.000000+00:00" }
        : etat;
      return { lignesAffectees: 1, erreur: null };
    },
  };
  return { db, journal, lire: () => etat };
}

const ligne = (ai: unknown, updated: string = UPDATED_AT): LigneEmailLot3 => ({
  id: "44444444-4444-4444-8444-444444444444",
  ai_context: ai,
  client_id: null,
  dossier_id: null,
  contrat_id: null,
  compagnie_id: null,
  updated_at: updated,
});

describe("IHM — moteur pur", () => {
  test("IHM-01 : validation simple pose CONFIRMED et les sentinelles", () => {
    const r = appliquerIntentionHumaine({
      observe: contexte(),
      intention: { type: "valider" },
      operateurId: OPERATEUR,
      valideLe: VALIDE_LE,
    });
    expect(r.autorise).toBe(true);
    if (!r.autorise) return;
    expect(r.contexte.analyse?.statut).toBe("CONFIRMED");
    expect(r.contexte.analyse?.validated_by).toBe(OPERATEUR);
    expect(r.contexte.analyse?.validated_at).toBe(VALIDE_LE);
    expect(r.contexte.analyse?.provenance?.source).toBe("humain");
    expect(r.contexte.analyse?.validation_humaine_requise).toBe(false);
    expect(r.contexte.schema_version).toBe("1.1.0");
  });

  test("IHM-02 : correction puis validation renseigne modifications_apportees", () => {
    const corrections: CorrectionContexte[] = [
      { cible: { objet: "correspondant" }, champ: "client_id", valeur: CLIENT },
      { cible: { objet: "personne", index: 0 }, champ: "statut", valeur: "CONFIRMED" },
    ];
    const r = appliquerIntentionHumaine({
      observe: contexte(),
      intention: { type: "corriger_et_valider", corrections },
      operateurId: OPERATEUR,
      valideLe: VALIDE_LE,
    });
    expect(r.autorise).toBe(true);
    if (!r.autorise) return;
    expect(r.contexte.correspondant?.client_id).toBe(CLIENT);
    expect(r.contexte.correspondant?.provenance?.source).toBe("humain");
    expect(r.contexte.personnes_detectees?.[0]?.statut).toBe("CONFIRMED");
    expect(r.contexte.analyse?.modifications_apportees).toHaveLength(2);
  });

  test("IHM-03 : renvoi en qualification ne pose aucune sentinelle", () => {
    const r = appliquerIntentionHumaine({
      observe: contexte(),
      intention: { type: "renvoyer_qualification", motif: "Expéditeur non identifiable" },
      operateurId: OPERATEUR,
      valideLe: VALIDE_LE,
    });
    expect(r.autorise).toBe(true);
    if (!r.autorise) return;
    expect(r.contexte.analyse?.statut).toBe("A_QUALIFIER");
    expect(r.contexte.analyse?.validated_by).toBeUndefined();
    expect(r.contexte.analyse?.validated_at).toBeUndefined();
    expect(r.contexte.analyse?.provenance?.source).toBe("gemini");
    expect(r.contexte.analyse?.validation_humaine_requise).toBe(true);
    expect(r.contexte.ambiguities?.at(-1)).toMatchObject({
      type: "autre",
      description: "Expéditeur non identifiable",
    });
  });

  test("IHM-04 : email déjà validé par un autre opérateur → deja_valide", () => {
    const r = appliquerIntentionHumaine({
      observe: valide(),
      intention: { type: "valider" },
      operateurId: AUTRE_OPERATEUR,
      valideLe: VALIDE_LE,
    });
    expect(r).toEqual({ autorise: false, motif: "deja_valide" });
  });

  test("IHM-05 : dégradation CONFIRMED → A_QUALIFIER interdite", () => {
    const r = appliquerIntentionHumaine({
      observe: valide(),
      intention: { type: "renvoyer_qualification", motif: "changement d'avis" },
      operateurId: OPERATEUR,
      valideLe: VALIDE_LE,
    });
    expect(r).toEqual({ autorise: false, motif: "degradation_interdite" });
  });

  test("IHM-06 : validated_by / validated_at présents sans CONFIRMED restent protégés", () => {
    const observe = contexte({
      analyse: {
        statut: "PROPOSED",
        validated_by: OPERATEUR,
        validated_at: VALIDE_LE,
        provenance: { source: "gemini" },
      },
    });
    expect(
      appliquerIntentionHumaine({
        observe,
        intention: { type: "renvoyer_qualification", motif: "reprise" },
        operateurId: OPERATEUR,
        valideLe: VALIDE_LE,
      }),
    ).toEqual({ autorise: false, motif: "degradation_interdite" });
    expect(
      appliquerIntentionHumaine({
        observe,
        intention: { type: "valider" },
        operateurId: AUTRE_OPERATEUR,
        valideLe: VALIDE_LE,
      }),
    ).toEqual({ autorise: false, motif: "deja_valide" });
  });

  test("IHM-07 : provenance humaine seule suffit à protéger le contexte", () => {
    const observe = contexte({
      analyse: { statut: "PROPOSED", provenance: { source: "humain" } },
    });
    expect(
      appliquerIntentionHumaine({
        observe,
        intention: { type: "renvoyer_qualification", motif: "reprise" },
        operateurId: OPERATEUR,
        valideLe: VALIDE_LE,
      }),
    ).toEqual({ autorise: false, motif: "degradation_interdite" });
  });

  test("IHM-13 : index inexistant, champ hors union ou statut interdit → correction_hors_perimetre", () => {
    const horsIndex: CorrectionContexte = {
      cible: { objet: "personne", index: 7 },
      champ: "client_id_propose",
      valeur: CLIENT,
    };
    expect(
      appliquerIntentionHumaine({
        observe: contexte(),
        intention: { type: "corriger_et_valider", corrections: [horsIndex] },
        operateurId: OPERATEUR,
        valideLe: VALIDE_LE,
      }),
    ).toEqual({ autorise: false, motif: "correction_hors_perimetre" });

    const statutInterdit = {
      cible: { objet: "correspondant" },
      champ: "statut",
      valeur: "DETECTED",
    } as unknown as CorrectionContexte;
    expect(
      appliquerIntentionHumaine({
        observe: contexte(),
        intention: { type: "corriger_et_valider", corrections: [statutInterdit] },
        operateurId: OPERATEUR,
        valideLe: VALIDE_LE,
      }),
    ).toEqual({ autorise: false, motif: "correction_hors_perimetre" });
  });

  test("IHM-14 : contexte entrant non conforme → contexte_invalide", () => {
    const faux = { schema_version: "9.9.9" } as unknown as EmailContext;
    expect(
      appliquerIntentionHumaine({
        observe: faux,
        intention: { type: "valider" },
        operateurId: OPERATEUR,
        valideLe: VALIDE_LE,
      }),
    ).toEqual({ autorise: false, motif: "contexte_invalide" });
  });

  test("cleValidation est stable pour des entrées identiques", () => {
    const args = {
      emailId: "e1",
      statutCible: "CONFIRMED" as const,
      validatedBy: OPERATEUR,
      validatedAt: VALIDE_LE,
      corrections: [] as CorrectionContexte[],
    };
    expect(cleValidation(args)).toBe(cleValidation(args));
  });
});

describe("IHM — orchestration gardée", () => {
  test("IHM-01/12 : écriture unique, aucune FK dans le payload", async () => {
    const { db, journal } = baseSimulee({ etat: ligne(contexte()) });
    const r = await validerContexteEmail({
      emailId: "44444444-4444-4444-8444-444444444444",
      intention: { type: "valider" },
      operateurId: OPERATEUR,
      valideLe: VALIDE_LE,
      db,
    });
    expect(r).toEqual({ ecrit: true, motif: null, cle: expect.any(String) });
    expect(journal.updates).toHaveLength(1);
    const payload = journal.updates[0]!;
    expect(Object.keys(payload)).toEqual(["emailId", "observe", "contexte"]);
    for (const fk of ["client_id", "dossier_id", "contrat_id", "compagnie_id"]) {
      expect(Object.keys(payload.contexte)).not.toContain(fk);
    }
  });

  test("IHM-08 : conflit concurrent → conflit_concurrent, aucun second UPDATE", async () => {
    const { db, journal } = baseSimulee({ etat: ligne(contexte()), conflit: true });
    const r = await validerContexteEmail({
      emailId: "44444444-4444-4444-8444-444444444444",
      intention: { type: "valider" },
      operateurId: OPERATEUR,
      valideLe: VALIDE_LE,
      db,
    });
    expect(r.ecrit).toBe(false);
    expect(r.motif).toBe("conflit_concurrent");
    expect(journal.updates).toHaveLength(1);
  });

  test("MINEUR-1 : 0 ligne + email non relisible → email_introuvable", async () => {
    let lectures = 0;
    const db: LecteurValidation = {
      async lireEmail() {
        lectures += 1;
        return lectures === 1 ? ligne(contexte()) : null;
      },
      async ecrireAiContext() {
        return { lignesAffectees: 0, erreur: null };
      },
    };
    const r = await validerContexteEmail({
      emailId: "44444444-4444-4444-8444-444444444444",
      intention: { type: "valider" },
      operateurId: OPERATEUR,
      valideLe: VALIDE_LE,
      db,
    });
    expect(r.motif).toBe("email_introuvable");
  });

  test("IHM-09 : erreur BDD → erreur_base, aucun retry", async () => {
    const { db, journal } = baseSimulee({ etat: ligne(contexte()), erreur: "permission denied" });
    const r = await validerContexteEmail({
      emailId: "44444444-4444-4444-8444-444444444444",
      intention: { type: "valider" },
      operateurId: OPERATEUR,
      valideLe: VALIDE_LE,
      db,
    });
    expect(r.ecrit).toBe(false);
    expect(r.motif).toBe("erreur_base");
    expect(journal.updates).toHaveLength(1);
  });

  test("IHM-10 : updated_at vide → refus sûr sans écriture", async () => {
    const { db, journal } = baseSimulee({ etat: ligne(contexte(), "  ") });
    const r = await validerContexteEmail({
      emailId: "44444444-4444-4444-8444-444444444444",
      intention: { type: "valider" },
      operateurId: OPERATEUR,
      valideLe: VALIDE_LE,
      db,
    });
    expect(r.motif).toBe("updated_at_inexploitable");
    expect(journal.updates).toHaveLength(0);
  });

  test("IHM-11 : garde composée = 6 prédicats Q.11, is.null si statut absent", () => {
    const sansStatut = contexte({ analyse: { provenance: { source: "gemini" } } });
    const garde = composerGardeQ11(ligne(sansStatut));
    expect(garde).toHaveLength(6);
    const statut = garde.find((p) => p.colonne === "ai_context->analyse->>statut");
    expect(statut).toEqual({
      colonne: "ai_context->analyse->>statut",
      operateur: "is",
      valeur: null,
    });
    expect(garde.map((p) => p.valeur)).not.toContain("");
  });

  test("IHM-15 : double soumission identique → une seule écriture puis NO-OP", async () => {
    const { db, journal } = baseSimulee({ etat: ligne(contexte()) });
    const premier = await validerContexteEmail({
      emailId: "44444444-4444-4444-8444-444444444444",
      intention: { type: "valider" },
      operateurId: OPERATEUR,
      valideLe: VALIDE_LE,
      db,
    });
    const second = await validerContexteEmail({
      emailId: "44444444-4444-4444-8444-444444444444",
      intention: { type: "valider" },
      operateurId: OPERATEUR,
      valideLe: VALIDE_LE,
      db,
    });
    expect(premier.ecrit).toBe(true);
    expect(second).toMatchObject({ ecrit: false, motif: null, noop: true });
    expect(journal.updates).toHaveLength(1);
  });

  test("email absent → email_introuvable, aucune écriture", async () => {
    const { db, journal } = baseSimulee({ etat: null });
    const r = await validerContexteEmail({
      emailId: "44444444-4444-4444-8444-444444444444",
      intention: { type: "valider" },
      operateurId: OPERATEUR,
      valideLe: VALIDE_LE,
      db,
    });
    expect(r.motif).toBe("email_introuvable");
    expect(journal.updates).toHaveLength(0);
  });
});

describe("IHM-16 — contrôles statiques d'étanchéité", () => {
  const fichiers = [
    "src/lib/email-context-validation.ts",
    "src/lib/email-context-validation.server.ts",
    "src/lib/email-context-validation.functions.ts",
    "src/components/email-context-qualification-panel.tsx",
  ];
  const sources = fichiers.map((f) => ({ f, code: readFileSync(f, "utf8") }));

  test("aucune mutation hors UPDATE ai_context, aucun Gemini/Gmail, aucun Lot 4", () => {
    for (const { f, code } of sources) {
      for (const interdit of [
        ".insert(",
        ".upsert(",
        ".delete(",
        ".rpc(",
        "gemini",
        "gmail.",
        "supabaseAdmin",
        "evaluerAutorisationFk",
        "autoriserEtEcrireFkEmail",
        'eq.""',
        ": any",
        "as unknown as",
      ]) {
        expect(code.includes(interdit), `${f} contient « ${interdit} »`).toBe(false);
      }
    }
  });

  test("schema_version jamais modifiée et FK jamais écrites", () => {
    for (const { f, code } of sources) {
      expect(code.includes('schema_version: "'), f).toBe(false);
      expect(/update\(\s*\{[^}]*client_id/.test(code), f).toBe(false);
    }
  });
});
