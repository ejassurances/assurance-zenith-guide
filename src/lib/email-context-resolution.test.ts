/**
 * CD-SI-001-B — LOT 3. Tests des invariants du DESIGN V1.2.
 * Aucun accès base, aucun appel Gemini, aucun Gmail : le moteur pur est testé
 * avec des référentiels injectés et la couche serveur avec un client simulé.
 */
import { describe, expect, test } from "vitest";

import {
  collecterPreuves,
  croiserContexteEmail,
  referentielVide,
  type ClientRef,
  type ReferentielCroisement,
} from "./email-context-resolution";
import {
  croiserEtEnregistrerContexteEmail,
  peutCroiserContexte,
  type LecteurLot3,
  type LectureBornee,
} from "./email-context-resolver.server";
import { estContexteEmailValide } from "./email-context-schema";
import { EMAIL_CONTEXT_SCHEMA_VERSION, type EmailContext } from "./email-context-types";

const CLI_A = "11111111-1111-4111-8111-111111111111";
const CLI_B = "22222222-2222-4222-8222-222222222222";
const DOS_A = "33333333-3333-4333-8333-333333333333";
const DOS_B = "44444444-4444-4444-8444-444444444444";
const CTR_A = "55555555-5555-4555-8555-555555555555";
const CTR_B = "66666666-6666-4666-8666-666666666666";
const CMP_A = "77777777-7777-4777-8777-777777777777";

const detecte = (p: Partial<EmailContext> = {}): EmailContext => ({
  schema_version: EMAIL_CONTEXT_SCHEMA_VERSION,
  correspondant: {
    email: "jean.dupont@example.com",
    nom_affiche: "Jean Dupont",
    client_id: null,
    compagnie_id: null,
    statut: "DETECTED",
    provenance: { source: "gemini", detecte_le: "2026-01-01T00:00:00.000Z" },
  },
  personnes_detectees: [],
  dossiers_detectes: [],
  contrats_detectes: [],
  produits_cites: [],
  documents_associes: [],
  preuves: [],
  ambiguities: [],
  analyse: { statut: "DETECTED", validation_humaine_requise: true, provenance: { source: "gemini" } },
  ...p,
});

const referentiel = (p: Partial<ReferentielCroisement> = {}): ReferentielCroisement => ({
  ...referentielVide(),
  ...p,
});

/* ---------------------- Hiérarchie doctrinale ---------------------- */

describe("hiérarchie doctrinale", () => {
  test("T-01 — référence dossier N1 propose le dossier sans FK", () => {
    const ctx = detecte({
      dossiers_detectes: [{ reference_citee: "DOS-000123", dossier_id_propose: null, statut: "DETECTED" }],
    });
    const r = croiserContexteEmail(
      ctx,
      referentiel({ dossiers: [{ id: DOS_A, reference: "DOS-000123", client_id: CLI_A, statut: "en_cours" }] }),
    );
    const preuves = collecterPreuves(ctx, referentiel({ dossiers: [{ id: DOS_A, reference: "DOS-000123" }] }));
    expect(preuves[0]?.niveau).toBe("N1");
    expect(r.statut).toBe("PROPOSED");
    expect(r.contexte.dossiers_detectes?.[0]?.dossier_id_propose).toBe(DOS_A);
    expect(estContexteEmailValide(r.contexte)).toBe(true);
  });

  test("T-02 — numéro de police exact = N3", () => {
    const ctx = detecte({
      contrats_detectes: [{ numero_police: "POL-42", contrat_id_propose: null, statut: "DETECTED" }],
    });
    const ref = referentiel({ contrats: [{ id: CTR_A, numero: "POL-42", client_id: CLI_A }] });
    expect(collecterPreuves(ctx, ref).find((p) => p.entite === "contrat")?.niveau).toBe("N3");
    const r = croiserContexteEmail(ctx, ref);
    expect(r.contexte.contrats_detectes?.[0]?.contrat_id_propose).toBe(CTR_A);
    expect(r.statut).toBe("PROPOSED");
  });

  test("T-03 — email expéditeur unique = N2", () => {
    const ctx = detecte();
    const ref = referentiel({ clients: [{ id: CLI_A, email: "jean.dupont@example.com" }] });
    expect(collecterPreuves(ctx, ref)[0]?.niveau).toBe("N2");
    const r = croiserContexteEmail(ctx, ref);
    expect(r.contexte.correspondant?.client_id).toBe(CLI_A);
    expect(r.statut).toBe("PROPOSED");
  });

  test("N7 — nom/prénom cité seul ne propose jamais à lui seul", () => {
    const ctx = detecte({
      correspondant: { email: null, statut: "DETECTED" },
      personnes_detectees: [{ nom: "Martin", prenom: "Claire", statut: "DETECTED" }],
    });
    const ref = referentiel({ clients: [{ id: CLI_A, nom: "Martin", prenom: "Claire" }] });
    const preuves = collecterPreuves(ctx, ref);
    expect(preuves[0]?.niveau).toBe("N7");
    const r = croiserContexteEmail(ctx, ref);
    expect(r.statut).toBe("DETECTED");
    expect(r.contexte.personnes_detectees?.[0]?.client_id_propose).toBeNull();
    expect(r.contexte.correspondant?.client_id).toBeNull();
  });

  test("N9 — dossier unique actif reste un facteur contextuel", () => {
    const ctx = detecte();
    const ref = referentiel({
      clients: [{ id: CLI_A, email: "jean.dupont@example.com" }],
      dossiers: [{ id: DOS_A, client_id: CLI_A, statut: "en_cours" }],
      dossiersActifsParClient: { [CLI_A]: [DOS_A] },
    });
    const preuves = collecterPreuves(ctx, ref);
    const n9 = preuves.find((p) => p.niveau === "N9");
    expect(n9?.entite).toBe("dossier");
    const r = croiserContexteEmail(ctx, ref);
    expect(r.resolutions.dossier.propose).toBeNull();
  });

  test("N8 — historique seul ne propose pas", () => {
    const ctx = detecte({ correspondant: { email: null, statut: "DETECTED" } });
    const r = croiserContexteEmail(ctx, referentiel({ rattachementsExistants: { client_id: CLI_A } }));
    expect(r.statut).toBe("DETECTED");
    expect(r.resolutions.client.propose).toBeNull();
  });
});

/* ---------------------- Contradictions ---------------------- */

describe("contradictions", () => {
  test("contradiction forte N1 dossier / N2 expéditeur bloque toute proposition", () => {
    const ctx = detecte({
      dossiers_detectes: [{ reference_citee: "DOS-000123", dossier_id_propose: null, statut: "DETECTED" }],
    });
    const r = croiserContexteEmail(
      ctx,
      referentiel({
        clients: [{ id: CLI_B, email: "jean.dupont@example.com" }],
        dossiers: [{ id: DOS_A, reference: "DOS-000123", client_id: CLI_A, statut: "en_cours" }],
      }),
    );
    expect(r.statut).toBe("AMBIGUOUS");
    expect(r.resolutions.client.contradiction).toBe(true);
    expect(r.contexte.ambiguities?.some((a) => a.type === "donnees_contradictoires")).toBe(true);
    expect(r.contexte.correspondant?.client_id).toBeNull();
    expect(estContexteEmailValide(r.contexte)).toBe(true);
  });

  test("contradiction contrat Client A / email Client B", () => {
    const ctx = detecte({
      contrats_detectes: [{ numero_police: "POL-42", contrat_id_propose: null, statut: "DETECTED" }],
    });
    const r = croiserContexteEmail(
      ctx,
      referentiel({
        clients: [{ id: CLI_B, email: "jean.dupont@example.com" }],
        contrats: [{ id: CTR_A, numero: "POL-42", client_id: CLI_A }],
      }),
    );
    expect(r.statut).toBe("AMBIGUOUS");
    expect(r.resolutions.client.contradiction).toBe(true);
  });
});

/* ---------------------- Multi-candidats ---------------------- */

describe("multi-candidats (contournement une entrée par candidat + ambiguities)", () => {
  test("deux contrats homonymes produisent AMBIGUOUS, une entrée par candidat, aucun id proposé", () => {
    const ctx = detecte({
      correspondant: { email: null, statut: "DETECTED" },
      contrats_detectes: [{ numero_police: "POL-42", contrat_id_propose: null, statut: "DETECTED" }],
    });
    const r = croiserContexteEmail(
      ctx,
      referentiel({
        contrats: [
          { id: CTR_A, numero: "POL-42", client_id: CLI_A },
          { id: CTR_B, numero: "POL-42", client_id: CLI_B },
        ],
      }),
    );
    expect(r.statut).toBe("AMBIGUOUS");
    expect(r.contexte.contrats_detectes).toHaveLength(2);
    expect(r.contexte.contrats_detectes?.every((c) => c.contrat_id_propose === null)).toBe(true);
    const amb = r.contexte.ambiguities?.find((a) => a.type === "contrat_multiple");
    expect(amb?.candidats).toEqual([CTR_A, CTR_B]);
    expect(amb?.resolution_requise).toBe(true);
    expect(estContexteEmailValide(r.contexte)).toBe(true);
  });

  test("aucun champ JSON nouveau n'est introduit", () => {
    const ctx = detecte({
      dossiers_detectes: [{ reference_citee: "DOS-1", dossier_id_propose: null, statut: "DETECTED" }],
    });
    const r = croiserContexteEmail(
      ctx,
      referentiel({
        dossiers: [
          { id: DOS_A, reference: "DOS-1", client_id: CLI_A },
          { id: DOS_B, reference: "DOS-1", client_id: CLI_B },
        ],
      }),
    );
    // Le validateur Lot 1 est `strict` : tout champ nouveau ferait échouer cette assertion.
    expect(estContexteEmailValide(r.contexte)).toBe(true);
    expect(r.contexte.schema_version).toBe("1.1.0");
  });
});

/* ---------------------- Compagnies ---------------------- */

describe("compagnies", () => {
  test("N4 domaine professionnel propose via correspondant.compagnie_id uniquement", () => {
    const ctx = detecte({ correspondant: { email: "gestion@compagnie-x.fr", statut: "DETECTED" } });
    const ref = referentiel({ compagnies: [{ id: CMP_A, nom: "Compagnie X", contact_email: "contact@compagnie-x.fr" }] });
    expect(collecterPreuves(ctx, ref)[0]?.niveau).toBe("N4");
    const r = croiserContexteEmail(ctx, ref);
    expect(r.contexte.correspondant?.compagnie_id).toBe(CMP_A);
    expect(JSON.stringify(r.contexte)).not.toContain("compagnie_id_propose");
  });

  test("compagnie dérivée d'un contrat N3 sans niveau local", () => {
    const ctx = detecte({
      correspondant: { email: null, statut: "DETECTED" },
      contrats_detectes: [{ numero_police: "POL-42", contrat_id_propose: null, statut: "DETECTED" }],
    });
    const ref = referentiel({ contrats: [{ id: CTR_A, numero: "POL-42", compagnie_id: CMP_A }] });
    const preuves = collecterPreuves(ctx, ref).filter((p) => p.entite === "compagnie");
    expect(preuves.every((p) => p.niveau === "N3")).toBe(true);
    expect(croiserContexteEmail(ctx, ref).contexte.correspondant?.compagnie_id).toBe(CMP_A);
  });
});

/* ---------------------- Invariants d'étanchéité ---------------------- */

describe("invariants d'étanchéité", () => {
  test("CONFIRMED est impossible sur tous les chemins", () => {
    const scenarios: [EmailContext, ReferentielCroisement][] = [
      [detecte(), referentiel({ clients: [{ id: CLI_A, email: "jean.dupont@example.com" }] })],
      [detecte(), referentiel()],
      [
        detecte({ dossiers_detectes: [{ reference_citee: "DOS-1", statut: "DETECTED" }] }),
        referentiel({
          dossiers: [
            { id: DOS_A, reference: "DOS-1", client_id: CLI_A },
            { id: DOS_B, reference: "DOS-1", client_id: CLI_B },
          ],
        }),
      ],
    ];
    for (const [ctx, ref] of scenarios) {
      const r = croiserContexteEmail(ctx, ref);
      expect(r.statut).not.toBe("CONFIRMED");
      expect(JSON.stringify(r.contexte)).not.toContain("CONFIRMED");
    }
  });

  test("aucun scoring : preuves[].poids jamais écrit par le Lot 3", () => {
    const ctx = detecte({
      preuves: [{ id: "g1", type: "email_corps", extrait: "x", cible: "personne", poids: 0.9 }],
    });
    const r = croiserContexteEmail(ctx, referentiel({ clients: [{ id: CLI_A, email: "jean.dupont@example.com" }] }));
    const nouvelles = (r.contexte.preuves ?? []).filter((p) => p.id.startsWith("L3-"));
    expect(nouvelles.length).toBeGreaterThan(0);
    expect(nouvelles.every((p) => p.poids === undefined)).toBe(true);
    // La preuve Lot 2 est conservée telle quelle, sans réécriture.
    expect(r.contexte.preuves?.[0]?.poids).toBe(0.9);
  });

  test("le poids n'influence pas la décision", () => {
    const base = detecte({ personnes_detectees: [{ nom: "Martin", prenom: "Claire", statut: "DETECTED" }] });
    const ref = referentiel({ clients: [{ id: CLI_A, nom: "Martin", prenom: "Claire" }] });
    const sans = croiserContexteEmail({ ...base, correspondant: { email: null } }, ref);
    const avec = croiserContexteEmail(
      {
        ...base,
        correspondant: { email: null },
        preuves: [{ id: "g1", type: "email_corps", extrait: "x", cible: "personne", poids: 1 }],
      },
      ref,
    );
    expect(avec.statut).toBe(sans.statut);
  });

  test("le moteur n'écrit aucune FK : sortie limitée à ai_context", async () => {
    const mutations: { table: string; op: string }[] = [];
    const db = clientSimule(mutations, detecte());
    const r = await croiserEtEnregistrerContexteEmail("email-1", { db });
    expect(r.ecrit).toBe(true);
    expect(mutations).toEqual([{ table: "crm_emails", op: "update:ai_context" }]);
  });

  test("aucune création d'entité ni de tâche", async () => {
    const mutations: { table: string; op: string }[] = [];
    const db = clientSimule(mutations, detecte());
    await croiserEtEnregistrerContexteEmail("email-1", { db });
    expect(mutations.some((m) => m.op.startsWith("insert"))).toBe(false);
    expect(mutations.some((m) => ["taches", "clients", "contrats", "produits", "documents"].includes(m.table))).toBe(
      false,
    );
  });

  test("ni Gemini ni Gmail ni mutation hors ai_context dans le code du Lot 3", async () => {
    const fs = await import("node:fs/promises");
    for (const f of ["src/lib/email-context-resolution.ts", "src/lib/email-context-resolver.server.ts"]) {
      const src = await fs.readFile(f, "utf8");
      // Aucun appel à la passerelle IA, aucun module Gmail, aucune API Google.
      expect(src).not.toContain("ai.gateway.lovable.dev");
      expect(src).not.toContain("gmail.server");
      expect(src).not.toContain("googleapis");
      expect(src).not.toContain("MODELES_EXTRACTION");
      // Aucune écriture des colonnes de triage ni des FK CRM.
      const code = src
        .split("\n")
        .filter((l) => !l.trimStart().startsWith("*") && !l.trimStart().startsWith("//"))
        .join("\n");
      expect(code).not.toContain("triage_ia");
      expect(code).not.toContain("triage_le");
      expect(code.includes(".insert(")).toBe(false);
      expect(code.includes(".upsert(")).toBe(false);
      expect(code.includes(".delete(")).toBe(false);
      expect(code.includes(".rpc(")).toBe(false);
      // La seule mutation présente est l'update de `ai_context`.
      const updates = code.match(/\.update\(\{[^}]*\}/g) ?? [];
      expect(updates).toHaveLength(f.endsWith(".server.ts") ? 1 : 0);
      if (updates[0]) expect(updates[0]).toContain("ai_context");
    }
  });
});

/* ---------------------- Idempotence ---------------------- */

describe("idempotence", () => {
  test("résultat stable à référentiel inchangé", () => {
    const ctx = detecte();
    const ref = referentiel({ clients: [{ id: CLI_A, email: "jean.dupont@example.com" }] });
    const a = croiserContexteEmail(ctx, ref, { analyseLe: "2026-01-01T00:00:00.000Z" });
    const b = croiserContexteEmail(a.contexte, ref, { analyseLe: "2026-01-01T00:00:00.000Z" });
    expect(b.statut).toBe(a.statut);
    expect(b.contexte.correspondant?.client_id).toBe(a.contexte.correspondant?.client_id);
  });

  test("une validation humaine n'est jamais écrasée", () => {
    expect(
      peutCroiserContexte({
        schema_version: "1.1.0",
        analyse: { statut: "PROPOSED", validated_by: CLI_A, validated_at: "2026-01-01T00:00:00.000Z" },
      }).autorise,
    ).toBe(false);
    expect(
      peutCroiserContexte({ schema_version: "1.1.0", analyse: { statut: "CONFIRMED" } }).autorise,
    ).toBe(false);
    expect(
      peutCroiserContexte({ schema_version: "1.1.0", analyse: { provenance: { source: "humain" } } }).autorise,
    ).toBe(false);
    expect(peutCroiserContexte({ schema_version: "1.1.0", analyse: { statut: "DETECTED" } }).autorise).toBe(true);
    expect(peutCroiserContexte({ statut: "n'importe quoi" }).autorise).toBe(false);
  });

  test("un contexte déjà PROPOSED n'est retraité que sur relance explicite", () => {
    const deja = { schema_version: "1.1.0", analyse: { statut: "PROPOSED" } };
    expect(peutCroiserContexte(deja).autorise).toBe(false);
    expect(peutCroiserContexte(deja, { force: true }).autorise).toBe(true);
  });

  test("email introuvable : aucune écriture", async () => {
    const mutations: { table: string; op: string }[] = [];
    const db = clientSimule(mutations, null);
    const r = await croiserEtEnregistrerContexteEmail("inconnu", { db });
    expect(r).toEqual({ ecrit: false, motif: "email_introuvable" });
    expect(mutations).toHaveLength(0);
  });
});

/* ---------------------- Non-régression Lot 1 / Lot 2 ---------------------- */

describe("non-régression", () => {
  test("le schéma, la version et les données Lot 2 sont préservés", () => {
    const ctx = detecte({
      personnes_detectees: [
        { nom: "Dupont", prenom: "Jean", email: "jean.dupont@example.com", statut: "DETECTED", confiance: 0.7 },
      ],
      analyse: { statut: "DETECTED", modele: "google/gemini-3.6-flash", confiance_globale: 0.7 },
    });
    const r = croiserContexteEmail(ctx, referentiel({ clients: [{ id: CLI_A, email: "jean.dupont@example.com" }] }));
    expect(r.contexte.schema_version).toBe("1.1.0");
    expect(r.contexte.analyse?.modele).toBe("google/gemini-3.6-flash");
    expect(r.contexte.analyse?.confiance_globale).toBe(0.7);
    expect(r.contexte.personnes_detectees?.[0]?.confiance).toBe(0.7);
    expect(r.contexte.analyse?.validation_humaine_requise).toBe(true);
    expect(estContexteEmailValide(r.contexte)).toBe(true);
  });

  test("contexte sans preuve exploitable : statut DETECTED conservé", () => {
    const r = croiserContexteEmail(detecte({ correspondant: { email: null } }), referentiel());
    expect(r.statut).toBe("DETECTED");
    expect(estContexteEmailValide(r.contexte)).toBe(true);
  });
});

/* ---------------------- Lecteur Lot 3 simulé (strictement typé) ---------------------- */

interface OptionsSimule {
  clients?: ClientRef[];
  clientsTronque?: boolean;
}

function clientSimule(
  mutations: { table: string; op: string }[],
  contexte: EmailContext | null,
  options: OptionsSimule = {},
): LecteurLot3 {
  const vide = <L>(): Promise<LectureBornee<L>> => Promise.resolve({ lignes: [], tronquee: false });
  return {
    lireEmail: () =>
      Promise.resolve(
        contexte
          ? {
              id: "email-1",
              ai_context: contexte,
              client_id: null,
              dossier_id: null,
              contrat_id: null,
              compagnie_id: null,
            }
          : null,
      ),
    clientsParIdentite: () =>
      Promise.resolve({ lignes: options.clients ?? [], tronquee: options.clientsTronque ?? false }),
    dossiersParFiltre: () => vide(),
    dossiersParClients: () => vide(),
    contratsParFiltre: () => vide(),
    contratsParClients: () => vide(),
    compagniesToutes: () => vide(),
    produitsParFiltre: () => vide(),
    produitsParIds: () => vide(),
    documentsParFiltre: () => vide(),
    ecrireAiContext: () => {
      mutations.push({ table: "crm_emails", op: "update:ai_context" });
      return Promise.resolve(null);
    },
  };
}

/* ---------------------- Corrections post-audit : type safety & plafonds ---------------------- */

describe("corrections post-audit", () => {
  test("aucun `any` ni `as unknown as` dans le périmètre du Lot 3", async () => {
    const fs = await import("node:fs/promises");
    for (const f of [
      "src/lib/email-context-resolution.ts",
      "src/lib/email-context-resolver.server.ts",
      "src/lib/email-context-resolution.test.ts",
    ]) {
      const code = (await fs.readFile(f, "utf8"))
        .split("\n")
        .filter((l) => !l.trimStart().startsWith("*") && !l.trimStart().startsWith("//"))
        .join("\n");
      expect(code).not.toContain("as unknown as");
      expect(code).not.toMatch(/:\s*any\b/);
      expect(code).not.toMatch(/<any>/);
      expect(code).not.toMatch(/\bas any\b/);
    }
  });

  test("référentiel sous la limite : comportement inchangé (proposition possible)", async () => {
    const mutations: { table: string; op: string }[] = [];
    const db = clientSimule(mutations, detecte(), {
      clients: [{ id: CLI_A, email: "jean.dupont@example.com" }],
    });
    const r = await croiserEtEnregistrerContexteEmail("email-1", { db });
    expect(r.ecrit).toBe(true);
    expect(r.statut).toBe("PROPOSED");
    expect(r.resolutions?.client.propose).toBe(CLI_A);
    expect(mutations).toEqual([{ table: "crm_emails", op: "update:ai_context" }]);
  });

  test("référentiel potentiellement tronqué : aucune proposition, bascule AMBIGUOUS", async () => {
    const mutations: { table: string; op: string }[] = [];
    const db = clientSimule(mutations, detecte(), {
      clients: [{ id: CLI_A, email: "jean.dupont@example.com" }],
      clientsTronque: true,
    });
    const r = await croiserEtEnregistrerContexteEmail("email-1", { db });
    expect(r.ecrit).toBe(true);
    expect(r.statut).toBe("AMBIGUOUS");
    expect(r.resolutions?.client.propose).toBeNull();
    expect(r.contexte?.correspondant?.client_id).toBeNull();
    expect(mutations).toEqual([{ table: "crm_emails", op: "update:ai_context" }]);
  });

  test("liste non exhaustive sans candidat : aucune proposition et statut sans FK", () => {
    const ref = referentiel({ clients: [{ id: CLI_A, email: "jean.dupont@example.com" }] });
    const r = croiserContexteEmail(detecte(), { ...ref, referentielsTronques: ["clients"] });
    expect(r.statut).toBe("AMBIGUOUS");
    expect(r.contexte.correspondant?.client_id).toBeNull();
    expect(r.contexte.analyse?.statut).not.toBe("CONFIRMED");
    expect(estContexteEmailValide(r.contexte)).toBe(true);
  });

  test("un référentiel tronqué non concerné ne dégrade pas les autres entités", () => {
    const ref = referentiel({ clients: [{ id: CLI_A, email: "jean.dupont@example.com" }] });
    const r = croiserContexteEmail(detecte(), { ...ref, referentielsTronques: ["produits"] });
    expect(r.statut).toBe("PROPOSED");
    expect(r.contexte.correspondant?.client_id).toBe(CLI_A);
  });
});
