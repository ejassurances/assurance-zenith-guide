/**
 * CD-SI-001-B — LOT IHM QUALIFICATION — TESTS ACCESSIBILITÉ DES CORRECTIONS.
 * Référence : docs/CD-SI-001-B-LOT-IHM-QUALIFICATION-DESIGN-V1.1.md §2.1.5
 *
 * Couvre l'ACTION 34 : accessibilité IHM des corrections d'identité, bornage
 * des valeurs, transmission au moteur, étanchéité (aucune FK, sentinelles).
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  CHAMPS_IDENTITE_IHM,
  VALEUR_AUCUNE,
  construireCorrectionIdentite,
  libelleCorrectionIhm,
  optionsIdentite,
  type Referentiels,
} from "./email-context-qualification-ui";
import { appliquerIntentionHumaine, type CorrectionContexte } from "./email-context-validation";
import { validerContexteEmail } from "./email-context-validation.server";
import type { EmailContext } from "./email-context-types";

const REF: Referentiels = {
  clients: [{ id: "11111111-1111-4111-8111-111111111111", libelle: "Jean DUPONT" }],
  compagnies: [{ id: "22222222-2222-4222-8222-222222222222", libelle: "Néoliane" }],
  dossiers: [{ id: "33333333-3333-4333-8333-333333333333", libelle: "EJ-2026-EMP-0001" }],
  contrats: [{ id: "44444444-4444-4444-8444-444444444444", libelle: "C-999" }],
  produits: [{ id: "55555555-5555-4555-8555-555555555555", libelle: "Emprunteur Confort" }],
  documents: [{ id: "66666666-6666-4666-8666-666666666666", libelle: "offre.pdf" }],
};

const contexteBase = (): EmailContext => ({
  schema_version: "1.1.0",
  correspondant: {
    email: "a@b.fr",
    nom_affiche: "A B",
    client_id: null,
    statut: "DETECTED",
    provenance: { source: "gemini" },
  },
  personnes_detectees: [{ nom: "DUPONT", statut: "DETECTED", provenance: { source: "gemini" } }],
  dossiers_detectes: [{ statut: "DETECTED", provenance: { source: "gemini" } }],
  contrats_detectes: [{ statut: "DETECTED", provenance: { source: "gemini" } }],
  produits_cites: [{ statut: "DETECTED", provenance: { source: "gemini" } }],
  documents_associes: [{ statut: "DETECTED", provenance: { source: "gemini" } }],
  preuves: [],
  ambiguities: [],
  analyse: { statut: "DETECTED", validation_humaine_requise: true, provenance: { source: "gemini" } },
});

describe("ACTION 34 — accessibilité IHM des corrections d'identité", () => {
  it("UI-01 — chaque catégorie du §2.1.5 est exposée par un descripteur", () => {
    expect(CHAMPS_IDENTITE_IHM.correspondant.map((d) => d.champ)).toEqual([
      "client_id",
      "compagnie_id",
      "role_suppose",
    ]);
    expect(CHAMPS_IDENTITE_IHM.personne.map((d) => d.champ)).toEqual(["client_id_propose", "role"]);
    expect(CHAMPS_IDENTITE_IHM.dossier.map((d) => d.champ)).toEqual(["dossier_id_propose"]);
    expect(CHAMPS_IDENTITE_IHM.contrat.map((d) => d.champ)).toEqual(["contrat_id_propose"]);
    expect(CHAMPS_IDENTITE_IHM.produit.map((d) => d.champ)).toEqual(["produit_id_propose"]);
    expect(CHAMPS_IDENTITE_IHM.document.map((d) => d.champ)).toEqual(["document_id_propose"]);
  });

  it("UI-02 — aucune cible ni champ hors union fermée n'est exposé", () => {
    const objets = Object.keys(CHAMPS_IDENTITE_IHM);
    expect(objets).toEqual(["correspondant", "personne", "dossier", "contrat", "produit", "document"]);
    const tous = objets.flatMap((o) =>
      CHAMPS_IDENTITE_IHM[o as keyof typeof CHAMPS_IDENTITE_IHM].map((d) => d.champ),
    );
    for (const interdit of ["statut", "schema_version", "analyse", "validated_by", "confiance", "provenance"]) {
      expect(tous).not.toContain(interdit);
    }
  });

  it("UI-03 — les options restent bornées aux référentiels exposés", () => {
    const d = CHAMPS_IDENTITE_IHM.correspondant[0]!;
    expect(optionsIdentite(d, REF).map((o) => o.valeur)).toEqual([
      VALEUR_AUCUNE,
      "11111111-1111-4111-8111-111111111111",
    ]);
    expect(optionsIdentite(d, {}).map((o) => o.valeur)).toEqual([VALEUR_AUCUNE]);
  });

  it("UI-04 — une valeur hors référentiel ne produit aucune correction", () => {
    const c = construireCorrectionIdentite({
      objet: "correspondant",
      index: null,
      champ: "client_id",
      valeurBrute: "99999999-9999-4999-8999-999999999999",
      referentiels: REF,
    });
    expect(c).toBeNull();
  });

  it("UI-05 — un champ hors périmètre ne produit aucune correction", () => {
    expect(
      construireCorrectionIdentite({
        objet: "dossier",
        index: 0,
        champ: "client_id",
        valeurBrute: "",
        referentiels: REF,
      }),
    ).toBeNull();
    expect(
      construireCorrectionIdentite({
        objet: "personne",
        index: 0,
        champ: "provenance",
        valeurBrute: "",
        referentiels: REF,
      }),
    ).toBeNull();
  });

  it("UI-06 — index incohérent refusé (correspondant indexé, liste sans index)", () => {
    expect(
      construireCorrectionIdentite({
        objet: "correspondant",
        index: 0,
        champ: "client_id",
        valeurBrute: "",
        referentiels: REF,
      }),
    ).toBeNull();
    expect(
      construireCorrectionIdentite({
        objet: "personne",
        index: null,
        champ: "role",
        valeurBrute: "conjoint",
        referentiels: REF,
      }),
    ).toBeNull();
  });

  it("UI-07 — « aucun » produit une valeur null typée", () => {
    expect(
      construireCorrectionIdentite({
        objet: "contrat",
        index: 0,
        champ: "contrat_id_propose",
        valeurBrute: VALEUR_AUCUNE,
        referentiels: REF,
      }),
    ).toEqual({ cible: { objet: "contrat", index: 0 }, champ: "contrat_id_propose", valeur: null });
  });

  it("UI-08 — les rôles sont bornés aux énumérations fermées du schéma 1.1.0", () => {
    const roleCorrespondant = CHAMPS_IDENTITE_IHM.correspondant[2]!;
    expect(optionsIdentite(roleCorrespondant, {}).map((o) => o.valeur)).toEqual([
      VALEUR_AUCUNE,
      "client",
      "prospect",
      "compagnie",
      "partenaire",
      "interne",
      "inconnu",
    ]);
    expect(
      construireCorrectionIdentite({
        objet: "personne",
        index: 0,
        champ: "role",
        valeurBrute: "gerant",
        referentiels: REF,
      }),
    ).toBeNull();
  });

  it("UI-09 — chaque catégorie est acceptée par le moteur pur", () => {
    const corrections: CorrectionContexte[] = [
      construireCorrectionIdentite({ objet: "correspondant", index: null, champ: "client_id", valeurBrute: REF.clients![0]!.id, referentiels: REF })!,
      construireCorrectionIdentite({ objet: "correspondant", index: null, champ: "compagnie_id", valeurBrute: REF.compagnies![0]!.id, referentiels: REF })!,
      construireCorrectionIdentite({ objet: "correspondant", index: null, champ: "role_suppose", valeurBrute: "client", referentiels: REF })!,
      construireCorrectionIdentite({ objet: "personne", index: 0, champ: "client_id_propose", valeurBrute: REF.clients![0]!.id, referentiels: REF })!,
      construireCorrectionIdentite({ objet: "personne", index: 0, champ: "role", valeurBrute: "souscripteur", referentiels: REF })!,
      construireCorrectionIdentite({ objet: "dossier", index: 0, champ: "dossier_id_propose", valeurBrute: REF.dossiers![0]!.id, referentiels: REF })!,
      construireCorrectionIdentite({ objet: "contrat", index: 0, champ: "contrat_id_propose", valeurBrute: REF.contrats![0]!.id, referentiels: REF })!,
      construireCorrectionIdentite({ objet: "produit", index: 0, champ: "produit_id_propose", valeurBrute: REF.produits![0]!.id, referentiels: REF })!,
      construireCorrectionIdentite({ objet: "document", index: 0, champ: "document_id_propose", valeurBrute: REF.documents![0]!.id, referentiels: REF })!,
    ];
    expect(corrections.every(Boolean)).toBe(true);

    const r = appliquerIntentionHumaine({
      observe: contexteBase(),
      intention: { type: "corriger_et_valider", corrections },
      operateurId: "11111111-1111-4111-8111-111111111111",
      valideLe: "2026-08-28T08:00:00.000Z",
    });
    expect(r.autorise).toBe(true);
    if (!r.autorise) return;
    expect(r.contexte.correspondant?.client_id).toBe(REF.clients![0]!.id);
    expect(r.contexte.correspondant?.role_suppose).toBe("client");
    expect(r.contexte.personnes_detectees?.[0]?.role).toBe("souscripteur");
    expect(r.contexte.documents_associes?.[0]?.document_id_propose).toBe(REF.documents![0]!.id);
    expect(r.contexte.analyse?.statut).toBe("CONFIRMED");
    expect(r.contexte.analyse?.provenance?.source).toBe("humain");
    expect(r.contexte.schema_version).toBe("1.1.0");
  });

  it("UI-10 — une correction d'identité est transmise à validerContexteEmail et n'écrit aucune FK", async () => {
    const observe = { id: "e1", ai_context: contexteBase(), updated_at: "2026-08-28T07:00:00.000Z" };
    const ecritures: unknown[] = [];
    const r = await validerContexteEmail({
      emailId: "e1",
      intention: {
        type: "corriger_et_valider",
        corrections: [
          construireCorrectionIdentite({
            objet: "personne",
            index: 0,
            champ: "client_id_propose",
            valeurBrute: REF.clients![0]!.id,
            referentiels: REF,
          })!,
        ],
      },
      operateurId: "11111111-1111-4111-8111-111111111111",
      valideLe: "2026-08-28T08:00:00.000Z",
      db: {
        lireEmail: async () => observe as never,
        ecrireAiContext: async (params) => {
          ecritures.push(params);
          return { lignesAffectees: 1, erreur: null };
        },
      },
    });
    expect(r.ecrit).toBe(true);
    expect(ecritures).toHaveLength(1);
    const params = ecritures[0] as { contexte: EmailContext };
    expect(params.contexte.personnes_detectees?.[0]?.client_id_propose).toBe(REF.clients![0]!.id);
    expect(Object.keys(params as object)).toEqual(["emailId", "observe", "contexte"]);
    for (const fk of ["client_id", "dossier_id", "contrat_id", "compagnie_id"]) {
      expect(Object.prototype.hasOwnProperty.call(params, fk)).toBe(false);
    }
  });

  it("UI-11 — validation sans correction inchangée", async () => {
    const observe = { id: "e2", ai_context: contexteBase(), updated_at: "2026-08-28T07:00:00.000Z" };
    const r = await validerContexteEmail({
      emailId: "e2",
      intention: { type: "valider" },
      operateurId: "11111111-1111-4111-8111-111111111111",
      db: {
        lireEmail: async () => observe as never,
        ecrireAiContext: async () => ({ lignesAffectees: 1, erreur: null }),
      },
    });
    expect(r.ecrit).toBe(true);
    expect(r.motif).toBeNull();
  });

  it("UI-12 — sentinelle humaine non dégradable par une correction d'identité", async () => {
    const valide = contexteBase();
    valide.analyse = {
      statut: "CONFIRMED",
      validation_humaine_requise: false,
      validated_by: "22222222-2222-4222-8222-222222222222",
      validated_at: "2026-08-01T00:00:00.000Z",
      provenance: { source: "humain" },
    };
    let ecrit = false;
    const r = await validerContexteEmail({
      emailId: "e3",
      intention: {
        type: "corriger_et_valider",
        corrections: [
          construireCorrectionIdentite({
            objet: "correspondant",
            index: null,
            champ: "client_id",
            valeurBrute: REF.clients![0]!.id,
            referentiels: REF,
          })!,
        ],
      },
      operateurId: "11111111-1111-4111-8111-111111111111",
      db: {
        lireEmail: async () => ({ id: "e3", ai_context: valide, updated_at: "x" }) as never,
        ecrireAiContext: async () => {
          ecrit = true;
          return { lignesAffectees: 1, erreur: null };
        },
      },
    });
    expect(r.ecrit).toBe(false);
    expect(r.motif).toBe("deja_valide");
    expect(ecrit).toBe(false);
  });

  it("UI-13 — NO-OP conservé lorsque la correction est déjà appliquée", async () => {
    const valide = contexteBase();
    valide.correspondant = {
      email: "a@b.fr",
      nom_affiche: "A B",
      statut: "CONFIRMED",
      client_id: REF.clients![0]!.id,
      provenance: { source: "humain" },
    };
    valide.analyse = {
      statut: "CONFIRMED",
      validation_humaine_requise: false,
      validated_by: "11111111-1111-4111-8111-111111111111",
      validated_at: "2026-08-01T00:00:00.000Z",
      provenance: { source: "humain" },
    };
    let ecrit = false;
    const r = await validerContexteEmail({
      emailId: "e4",
      intention: {
        type: "corriger_et_valider",
        corrections: [
          construireCorrectionIdentite({
            objet: "correspondant",
            index: null,
            champ: "client_id",
            valeurBrute: REF.clients![0]!.id,
            referentiels: REF,
          })!,
        ],
      },
      operateurId: "11111111-1111-4111-8111-111111111111",
      db: {
        lireEmail: async () => ({ id: "e4", ai_context: valide, updated_at: "x" }) as never,
        ecrireAiContext: async () => {
          ecrit = true;
          return { lignesAffectees: 1, erreur: null };
        },
      },
    });
    expect(r.noop).toBe(true);
    expect(r.ecrit).toBe(false);
    expect(ecrit).toBe(false);
  });

  it("UI-14 — libellé lisible d'une correction, sans exposer d'identifiant brut", () => {
    const c = construireCorrectionIdentite({
      objet: "dossier",
      index: 0,
      champ: "dossier_id_propose",
      valeurBrute: REF.dossiers![0]!.id,
      referentiels: REF,
    })!;
    expect(libelleCorrectionIhm(c, REF)).toContain("EJ-2026-EMP-0001");
  });

  it("UI-15 — étanchéité : IHM et descripteurs sans I/O, FK, Gemini, Gmail ni Lot 4/5", () => {
    const sources = [
      "src/lib/email-context-qualification-ui.ts",
      "src/components/email-context-qualification-panel.tsx",
    ].map((f) => readFileSync(f, "utf8"));
    for (const src of sources) {
      for (const interdit of [
        ".insert(",
        ".upsert(",
        ".delete(",
        ".rpc(",
        "supabaseAdmin",
        "gemini",
        "email-fk-authorization",
        "composerGardeQ11",
        "client.server",
        "schema_version:",
      ]) {
        expect(src.includes(interdit)).toBe(false);
      }
    }
  });

  it("UI-16 — les sélecteurs d'identité sont réellement montés dans l'IHM", () => {
    const ihm = readFileSync("src/components/email-context-qualification-panel.tsx", "utf8");
    expect(ihm).toContain("IdentiteSelect");
    expect(ihm).toContain("CHAMPS_IDENTITE_IHM.correspondant.map");
    expect(ihm).toContain("CHAMPS_IDENTITE_IHM[objet].map");
    expect(ihm).toContain("construireCorrectionIdentite");
    expect(ihm).toContain("appliquerValidationContexte");
    // Aucune saisie libre d'identifiant : les champs d'identité passent par <select>.
    expect(ihm).not.toContain("champ: \"client_id\", valeur: ");
  });
});
