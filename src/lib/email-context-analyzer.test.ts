/**
 * CD-SI-001-B — LOT 2. Tests d'extraction Gemini (15 exigences du lot).
 * Gemini est simulé par injection de `fetchImpl` : aucun appel réseau réel,
 * aucune écriture en base.
 */
import { describe, expect, test } from "vitest";

import {
  analyserContexteEmail,
  peutEcrireContexte,
} from "./email-context-analyzer.server";
import {
  SCHEMA_EXTRACTION_GEMINI,
  PROMPT_SYSTEME_EXTRACTION,
  TEMPERATURE_EXTRACTION,
  type EmailAExtraire,
} from "./email-context-extraction";
import { estContexteEmailValide } from "./email-context-schema";

const email = (p: Partial<EmailAExtraire> = {}): EmailAExtraire => ({
  sujet: "Question",
  expediteur_nom: "Jean Dupont",
  expediteur_email: "jean.dupont@example.com",
  texte: "Bonjour, ...",
  pieces_jointes: [],
  ...p,
});

const vide = {
  personnes: [],
  dossiers: [],
  contrats: [],
  produits: [],
  documents: [],
  ambiguites: [],
  confiance_extraction: 0.5,
};

function fauxGemini(charge: unknown, statut = 200): typeof fetch {
  return (async () =>
    new Response(
      statut === 200
        ? JSON.stringify({
            choices: [
              {
                message: {
                  content: typeof charge === "string" ? charge : JSON.stringify(charge),
                },
              },
            ],
          })
        : "erreur",
      { status: statut, headers: { "Content-Type": "application/json" } },
    )) as unknown as typeof fetch;
}

const run = (charge: unknown, statut = 200, extra = {}) =>
  analyserContexteEmail(email(), {
    cleApi: "test",
    modeles: ["google/gemini-2.5-flash"],
    fetchImpl: fauxGemini(charge, statut),
    ...extra,
  });

describe("LOT 2 — extraction Gemini", () => {
  test("1 — email simple avec personne citée", async () => {
    const r = await run({
      ...vide,
      personnes: [
        { nom: "Martin", prenom: "Claire", email: null, telephone: null, role: "conjoint", extrait: "ma conjointe Claire Martin" },
      ],
      confiance_extraction: 0.8,
    });
    expect(r.ok).toBe(true);
    expect(r.contexte.personnes_detectees?.[0]?.nom).toBe("Martin");
    expect(r.contexte.personnes_detectees?.[0]?.statut).toBe("DETECTED");
    expect(r.contexte.preuves?.length).toBe(1);
  });

  test("2 — email avec référence dossier", async () => {
    const r = await run({
      ...vide,
      dossiers: [{ reference_citee: "EJ-2026-EMPRUNTEUR-0012", branche: "emprunteur", extrait: "dossier EJ-2026-EMPRUNTEUR-0012" }],
    });
    expect(r.contexte.dossiers_detectes?.[0]?.reference_citee).toBe("EJ-2026-EMPRUNTEUR-0012");
    expect(r.contexte.dossiers_detectes?.[0]?.dossier_id_propose).toBeNull();
  });

  test("3 — email avec numéro de police", async () => {
    const r = await run({
      ...vide,
      contrats: [{ numero_police: "POL-778899", compagnie_citee: "Néoliane", extrait: "police POL-778899" }],
    });
    expect(r.contexte.contrats_detectes?.[0]?.numero_police).toBe("POL-778899");
    expect(r.contexte.contrats_detectes?.[0]?.contrat_id_propose).toBeNull();
  });

  test("4 — email avec plusieurs personnes", async () => {
    const r = await run({
      ...vide,
      personnes: [
        { nom: "A", prenom: "Un", email: null, telephone: null, role: "souscripteur", extrait: "Un A" },
        { nom: "B", prenom: "Deux", email: null, telephone: null, role: "co_emprunteur", extrait: "Deux B" },
      ],
    });
    expect(r.contexte.personnes_detectees).toHaveLength(2);
    expect(r.contexte.personnes_detectees?.every((p) => p.statut === "DETECTED")).toBe(true);
  });

  test("5 — email avec plusieurs contrats", async () => {
    const r = await run({
      ...vide,
      contrats: [
        { numero_police: "P1", compagnie_citee: null, extrait: "P1" },
        { numero_police: "P2", compagnie_citee: null, extrait: "P2" },
      ],
    });
    expect(r.contexte.contrats_detectes).toHaveLength(2);
  });

  test("6 — email sans entité identifiable", async () => {
    const r = await run(vide);
    expect(r.ok).toBe(true);
    expect(r.contexte.personnes_detectees).toHaveLength(0);
    expect(r.contexte.analyse?.statut).toBe("DETECTED");
  });

  test("7 — email ambigu", async () => {
    const r = await run({
      ...vide,
      ambiguites: [{ type: "client_multiple", description: "deux homonymes" }, { type: "n_importe_quoi", description: null }],
      confiance_extraction: 0.3,
    });
    expect(r.contexte.ambiguities?.[0]?.type).toBe("client_multiple");
    expect(r.contexte.ambiguities?.[1]?.type).toBe("autre");
    expect(r.contexte.ambiguities?.every((a) => a.resolution_requise)).toBe(true);
  });

  test("8 — réponse Gemini JSON valide", async () => {
    const r = await run("```json\n" + JSON.stringify(vide) + "\n```");
    expect(r.ok).toBe(true);
    expect(estContexteEmailValide(r.contexte)).toBe(true);
  });

  test("9 — réponse Gemini JSON invalide", async () => {
    const r = await run("ceci n'est pas du JSON");
    expect(r.ok).toBe(false);
    expect(r.motif).toBe("json_invalide");
    expect(estContexteEmailValide(r.contexte)).toBe(true);
    expect(r.contexte.analyse?.statut).toBe("A_QUALIFIER");
  });

  test("9bis — réponse vide", async () => {
    const r = await run("");
    expect(r.ok).toBe(false);
    expect(r.motif).toBe("reponse_vide");
  });

  test("10 — erreur API et timeout Gemini", async () => {
    const erreur = await run(null, 500);
    expect(erreur.ok).toBe(false);
    expect(erreur.motif).toBe("erreur_api");

    const timeout = await analyserContexteEmail(email(), {
      cleApi: "test",
      modeles: ["google/gemini-2.5-flash"],
      timeoutMs: 5,
      fetchImpl: ((_u: string, init?: RequestInit) =>
        new Promise((_res, rej) => {
          init?.signal?.addEventListener("abort", () => {
            const e = new Error("aborted");
            e.name = "AbortError";
            rej(e);
          });
        })) as unknown as typeof fetch,
    });
    expect(timeout.ok).toBe(false);
    expect(timeout.motif).toBe("timeout");
    expect(estContexteEmailValide(timeout.contexte)).toBe(true);
  });

  test("11 — le statut initial est toujours DETECTED en cas de succès", async () => {
    for (const charge of [vide, { ...vide, personnes: [{ nom: "X", prenom: null, email: null, telephone: null, role: null, extrait: null }] }]) {
      const r = await run(charge);
      expect(r.contexte.analyse?.statut).toBe("DETECTED");
      expect(r.contexte.correspondant?.statut).toBe("DETECTED");
      expect(r.contexte.analyse?.validated_at).toBeNull();
    }
  });

  test("12 — aucune FK ni UUID proposé n'est produit par le LOT 2", async () => {
    const r = await run({
      ...vide,
      personnes: [{ nom: "X", prenom: null, email: null, telephone: null, role: null, extrait: null }],
      dossiers: [{ reference_citee: "REF", branche: null, extrait: null }],
      contrats: [{ numero_police: "P", compagnie_citee: null, extrait: null }],
      produits: [{ libelle: "L", famille: null, extrait: null }],
      documents: [{ nom_fichier: "f.pdf", type_detecte: null, extrait: null }],
    });
    const c = r.contexte;
    expect(c.correspondant?.client_id).toBeNull();
    expect(c.correspondant?.compagnie_id).toBeNull();
    expect(c.personnes_detectees?.[0]?.client_id_propose).toBeNull();
    expect(c.dossiers_detectes?.[0]?.dossier_id_propose).toBeNull();
    expect(c.contrats_detectes?.[0]?.contrat_id_propose).toBeNull();
    expect(c.produits_cites?.[0]?.produit_id_propose).toBeNull();
    expect(c.documents_associes?.[0]?.document_id_propose).toBeNull();
    // Aucune clé de FK métier n'apparaît dans la sortie du lot.
    const brut = JSON.stringify(c);
    for (const cle of ['"client_id":"', '"dossier_id"', '"contrat_id"', '"prospect_id"']) {
      expect(brut).not.toContain(cle);
    }
  });

  test("13/14 — aucune écriture métier : la couche n'expose que ai_context", async () => {
    // Le module d'extraction est pur (aucun accès base) ; la seule écriture du
    // lot est `crm_emails.ai_context` (cf. persisterContexteEmail).
    const source = await import("node:fs/promises").then((fs) =>
      fs.readFile("src/lib/email-context-analyzer.server.ts", "utf8"),
    );
    expect(source).not.toMatch(/from\("(clients|prospects|contrats|produits|dossiers|taches)"/);
    expect(source.match(/\.update\(/g)?.length).toBe(1);
    expect(source).toContain("ai_context: contexte");
  });

  test("15 — idempotence et protection de la validation humaine", async () => {
    const base = { schema_version: "1.1.0" as const };
    expect(peutEcrireContexte({}).autorise).toBe(true);
    expect(peutEcrireContexte({ ...base }).autorise).toBe(true);
    expect(peutEcrireContexte({ ...base, analyse: { statut: "DETECTED" } }).autorise).toBe(false);
    expect(
      peutEcrireContexte({ ...base, analyse: { statut: "DETECTED" } }, { force: true }).autorise,
    ).toBe(true);
    expect(peutEcrireContexte({ ...base, analyse: { statut: "CONFIRMED" } }, { force: true }).autorise).toBe(false);
    expect(
      peutEcrireContexte(
        { ...base, analyse: { validated_at: "2026-08-25T10:00:00.000Z" } },
        { force: true },
      ).autorise,
    ).toBe(false);
    expect(
      peutEcrireContexte({ ...base, analyse: { provenance: { source: "humain" } } }, { force: true })
        .autorise,
    ).toBe(false);
  });

  test("prompt et paramètres d'appel conformes au DESIGN", () => {
    expect(TEMPERATURE_EXTRACTION).toBe(0);
    for (const regle of ["N'INVENTE RIEN", "AUCUNE décision métier", "PROPOSITION", "JSON conforme au schéma"]) {
      expect(PROMPT_SYSTEME_EXTRACTION).toContain(regle);
    }
    expect(SCHEMA_EXTRACTION_GEMINI.additionalProperties).toBe(false);
    expect(Object.keys(SCHEMA_EXTRACTION_GEMINI.properties)).not.toContain("client_id");
  });
});
