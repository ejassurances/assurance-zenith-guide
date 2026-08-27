/**
 * CD-SI-001-B — LOT 3 — CORRECTIF Q.11.
 * Référence exclusive : docs/CD-SI-001-B-LOT3-Q11-DESIGN-V1.1.md
 *
 * Tests de la garde optimiste portée par l'unique UPDATE du Lot 3 :
 * aucun accès base réel, aucun Gemini, aucun Gmail, aucune migration.
 * La base est simulée par un état mutable et la garde est évaluée exactement
 * comme le ferait PostgREST (comparaison typée de `updated_at` après cast).
 */
import { describe, expect, test } from "vitest";

import {
  composerGardeQ11,
  croiserEtEnregistrerContexteEmail,
  preserverSentinellesHumaines,
  sentinellesHumaines,
  updatedAtExploitable,
  type LecteurLot3,
  type LectureBornee,
  type PredicatGarde,
} from "./email-context-resolver.server";
import { EMAIL_CONTEXT_SCHEMA_VERSION, type EmailContext } from "./email-context-types";

const UPDATED_AT = "2026-02-01T10:00:00.123456+00:00";
const VALIDATEUR = "88888888-8888-4888-8888-888888888888";

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

/* ------------------------------------------------------------------ */
/* Base simulée : évalue les prédicats de garde comme PostgREST         */
/* ------------------------------------------------------------------ */

interface EtatBase {
  ai_context: EmailContext;
  updated_at: string;
}

interface Journal {
  updates: number;
  lignesParUpdate: number[];
}

const lireChemin = (base: EtatBase, colonne: string): string | null => {
  const a = base.ai_context.analyse;
  switch (colonne) {
    case "ai_context->analyse->>statut":
      return a?.statut ?? null;
    case "ai_context->analyse->>validated_by":
      return a?.validated_by ?? null;
    case "ai_context->analyse->>validated_at":
      return a?.validated_at ?? null;
    case "ai_context->analyse->provenance->>source":
      return a?.provenance?.source ?? null;
    default:
      return null;
  }
};

/** Comparaison typée `timestamptz` (insensible à la représentation, sensible à l'instant). */
const memeInstant = (a: string, b: string): boolean => {
  const ta = Date.parse(a);
  const tb = Date.parse(b);
  if (Number.isNaN(ta) || Number.isNaN(tb)) return false;
  // Les millisecondes ne suffisent pas : la fraction complète doit être identique.
  const frac = (v: string) => (/\.(\d+)/.exec(v)?.[1] ?? "").padEnd(6, "0");
  return ta === tb && frac(a) === frac(b);
};

const evaluerGarde = (base: EtatBase, predicats: PredicatGarde[]): number => {
  for (const p of predicats) {
    if (p.colonne === "ai_context") {
      if (JSON.stringify(base.ai_context) !== p.valeur) return 0;
      continue;
    }
    if (p.colonne === "updated_at") {
      if (typeof p.valeur !== "string" || !memeInstant(base.updated_at, p.valeur)) return 0;
      continue;
    }
    const reel = lireChemin(base, p.colonne);
    if (p.operateur === "is") {
      if (reel !== null) return 0;
    } else if (reel !== p.valeur) {
      return 0;
    }
  }
  return 1;
};

interface OptionsDouble {
  /** Mutation concurrente appliquée entre la lecture (T0) et l'écriture (T2). */
  concurrence?: (base: EtatBase) => void;
  erreurBase?: string;
  /** Force `lignesAffectees` (simulation directe d'un conflit). */
  lignesAffectees?: number;
  updatedAtLu?: string | null;
}

function doubleLot3(base: EtatBase, journal: Journal, options: OptionsDouble = {}): LecteurLot3 {
  const vide = <L>(): Promise<LectureBornee<L>> => Promise.resolve({ lignes: [], tronquee: false });
  return {
    lireEmail: () =>
      Promise.resolve({
        id: "email-1",
        ai_context: base.ai_context,
        client_id: null,
        dossier_id: null,
        contrat_id: null,
        compagnie_id: null,
        updated_at: (options.updatedAtLu === undefined ? base.updated_at : options.updatedAtLu) as string,
      }),
    clientsParIdentite: () => vide(),
    dossiersParFiltre: () => vide(),
    dossiersParClients: () => vide(),
    contratsParFiltre: () => vide(),
    contratsParClients: () => vide(),
    compagniesToutes: () => vide(),
    produitsParFiltre: () => vide(),
    produitsParIds: () => vide(),
    documentsParFiltre: () => vide(),
    ecrireAiContext: ({ observe, contexte }) => {
      journal.updates += 1;
      if (options.erreurBase) {
        journal.lignesParUpdate.push(0);
        return Promise.resolve({ lignesAffectees: 0, erreur: options.erreurBase });
      }
      options.concurrence?.(base);
      const lignes =
        options.lignesAffectees ?? evaluerGarde(base, composerGardeQ11(observe));
      journal.lignesParUpdate.push(lignes);
      if (lignes === 1) {
        base.ai_context = contexte;
        base.updated_at = "2026-02-01T10:05:00.000001+00:00";
      }
      return Promise.resolve({ lignesAffectees: lignes, erreur: null });
    },
  };
}

const etat = (contexte: EmailContext = detecte(), updated_at = UPDATED_AT): EtatBase => ({
  ai_context: contexte,
  updated_at,
});

const journalVide = (): Journal => ({ updates: 0, lignesParUpdate: [] });

/* ------------------------------------------------------------------ */
/* 1 à 9 — garde optimiste                                             */
/* ------------------------------------------------------------------ */

describe("Q.11 — garde optimiste sur l'unique UPDATE", () => {
  test("1. état inchangé → succès (1 ligne affectée)", async () => {
    const base = etat();
    const j = journalVide();
    const r = await croiserEtEnregistrerContexteEmail("email-1", { db: doubleLot3(base, j) });
    expect(r.ecrit).toBe(true);
    expect(j.updates).toBe(1);
    expect(j.lignesParUpdate).toEqual([1]);
  });

  test("2. `updated_at` modifié entre T0 et T2 → refus garde_optimiste", async () => {
    const base = etat();
    const j = journalVide();
    const r = await croiserEtEnregistrerContexteEmail("email-1", {
      db: doubleLot3(base, j, {
        concurrence: (b) => {
          b.updated_at = "2026-02-01T10:00:00.999999+00:00";
        },
      }),
    });
    expect(r.ecrit).toBe(false);
    expect(r.motif).toBe("garde_optimiste");
  });

  test("3. `ai_context` modifié (hors sentinelles) → refus", async () => {
    const base = etat();
    const j = journalVide();
    const r = await croiserEtEnregistrerContexteEmail("email-1", {
      db: doubleLot3(base, j, {
        concurrence: (b) => {
          b.ai_context = { ...b.ai_context, ambiguities: [{ type: "PLUSIEURS_CLIENTS_POSSIBLES" }] };
        },
      }),
    });
    expect(r.ecrit).toBe(false);
    expect(r.motif).toBe("garde_optimiste");
  });

  test("4. `validated_by` ajouté entre T0 et T2 → refus, sentinelle intacte", async () => {
    const base = etat();
    const j = journalVide();
    const r = await croiserEtEnregistrerContexteEmail("email-1", {
      db: doubleLot3(base, j, {
        concurrence: (b) => {
          b.ai_context = {
            ...b.ai_context,
            analyse: { ...(b.ai_context.analyse ?? {}), validated_by: VALIDATEUR },
          };
        },
      }),
    });
    expect(r.ecrit).toBe(false);
    expect(r.motif).toBe("garde_optimiste");
    expect(base.ai_context.analyse?.validated_by).toBe(VALIDATEUR);
  });

  test("5. `validated_at` ajouté entre T0 et T2 → refus", async () => {
    const base = etat();
    const j = journalVide();
    const r = await croiserEtEnregistrerContexteEmail("email-1", {
      db: doubleLot3(base, j, {
        concurrence: (b) => {
          b.ai_context = {
            ...b.ai_context,
            analyse: { ...(b.ai_context.analyse ?? {}), validated_at: "2026-02-01T10:00:01.000Z" },
          };
        },
      }),
    });
    expect(r.ecrit).toBe(false);
    expect(r.motif).toBe("garde_optimiste");
    expect(base.ai_context.analyse?.validated_at).toBe("2026-02-01T10:00:01.000Z");
  });

  test("6. `provenance.source` devient `humain` → refus", async () => {
    const base = etat();
    const j = journalVide();
    const r = await croiserEtEnregistrerContexteEmail("email-1", {
      db: doubleLot3(base, j, {
        concurrence: (b) => {
          b.ai_context = {
            ...b.ai_context,
            analyse: { ...(b.ai_context.analyse ?? {}), provenance: { source: "humain" } },
          };
        },
      }),
    });
    expect(r.ecrit).toBe(false);
    expect(r.motif).toBe("garde_optimiste");
    expect(base.ai_context.analyse?.provenance?.source).toBe("humain");
  });

  test("7. `analyse.statut` devient CONFIRMED entre T0 et T2 → refus", async () => {
    const base = etat();
    const j = journalVide();
    const r = await croiserEtEnregistrerContexteEmail("email-1", {
      db: doubleLot3(base, j, {
        concurrence: (b) => {
          b.ai_context = {
            ...b.ai_context,
            analyse: { ...(b.ai_context.analyse ?? {}), statut: "CONFIRMED" },
          };
        },
      }),
    });
    expect(r.ecrit).toBe(false);
    expect(r.motif).toBe("garde_optimiste");
    expect(base.ai_context.analyse?.statut).toBe("CONFIRMED");
  });

  test("8. validation humaine antérieure à T0 → refus en amont, aucun UPDATE", async () => {
    const base = etat(
      detecte({
        analyse: {
          statut: "PROPOSED",
          validated_by: VALIDATEUR,
          validated_at: "2026-01-31T09:00:00.000Z",
          provenance: { source: "humain" },
        },
      }),
    );
    const j = journalVide();
    const r = await croiserEtEnregistrerContexteEmail("email-1", { db: doubleLot3(base, j) });
    expect(r.ecrit).toBe(false);
    expect(r.motif).toBe("validation_humaine_existante");
    expect(j.updates).toBe(0);
  });

  test("9. validation humaine intercalée entre T0 et T2 → refus, non-écrasement", async () => {
    const base = etat();
    const j = journalVide();
    const r = await croiserEtEnregistrerContexteEmail("email-1", {
      db: doubleLot3(base, j, {
        concurrence: (b) => {
          b.ai_context = {
            ...b.ai_context,
            analyse: {
              statut: "CONFIRMED",
              validated_by: VALIDATEUR,
              validated_at: "2026-02-01T10:00:02.000Z",
              provenance: { source: "humain" },
            },
          };
          b.updated_at = "2026-02-01T10:00:02.111111+00:00";
        },
      }),
    });
    expect(r.ecrit).toBe(false);
    expect(r.motif).toBe("garde_optimiste");
    expect(base.ai_context.analyse?.validated_by).toBe(VALIDATEUR);
    expect(base.ai_context.analyse?.statut).toBe("CONFIRMED");
  });
});

/* ------------------------------------------------------------------ */
/* 10 à 16 — erreurs, absence de retry, force, updated_at              */
/* ------------------------------------------------------------------ */

describe("Q.11 — refus, absence de reprise et force", () => {
  test("10. erreur BDD → refus erreur_base, jamais de succès", async () => {
    const base = etat();
    const j = journalVide();
    const r = await croiserEtEnregistrerContexteEmail("email-1", {
      db: doubleLot3(base, j, { erreurBase: "connexion perdue" }),
    });
    expect(r.ecrit).toBe(false);
    expect(r.motif).toBe("erreur_base");
    expect(r.detail).toBe("connexion perdue");
  });

  test("11. 0 ligne affectée → refus garde_optimiste", async () => {
    const base = etat();
    const j = journalVide();
    const r = await croiserEtEnregistrerContexteEmail("email-1", {
      db: doubleLot3(base, j, { lignesAffectees: 0 }),
    });
    expect(r.ecrit).toBe(false);
    expect(r.motif).toBe("garde_optimiste");
  });

  test("12/13. aucun retry, aucun second UPDATE après conflit ou erreur", async () => {
    const j1 = journalVide();
    await croiserEtEnregistrerContexteEmail("email-1", {
      db: doubleLot3(etat(), j1, { lignesAffectees: 0 }),
    });
    expect(j1.updates).toBe(1);

    const j2 = journalVide();
    await croiserEtEnregistrerContexteEmail("email-1", {
      db: doubleLot3(etat(), j2, { erreurBase: "timeout" }),
    });
    expect(j2.updates).toBe(1);
  });

  test("14. force + sentinelle humaine → refus, aucun UPDATE", async () => {
    const base = etat(
      detecte({
        analyse: {
          statut: "PROPOSED",
          validated_by: VALIDATEUR,
          validated_at: "2026-01-31T09:00:00.000Z",
          provenance: { source: "humain" },
        },
      }),
    );
    const j = journalVide();
    const r = await croiserEtEnregistrerContexteEmail("email-1", {
      force: true,
      db: doubleLot3(base, j),
    });
    expect(r.ecrit).toBe(false);
    expect(r.motif).toBe("validation_humaine_existante");
    expect(j.updates).toBe(0);
  });

  test("14bis. force + CONFIRMED → refus (jamais de franchissement)", async () => {
    const base = etat(detecte({ analyse: { statut: "CONFIRMED", provenance: { source: "gemini" } } }));
    const j = journalVide();
    const r = await croiserEtEnregistrerContexteEmail("email-1", { force: true, db: doubleLot3(base, j) });
    expect(r.ecrit).toBe(false);
    expect(r.motif).toBe("statut_non_eligible");
    expect(j.updates).toBe(0);
  });

  test("14ter. la garde composée reste restrictive même sur un état porteur de sentinelles", () => {
    const predicats = composerGardeQ11({
      id: "email-1",
      ai_context: detecte({
        analyse: {
          statut: "PROPOSED",
          validated_by: VALIDATEUR,
          validated_at: "2026-01-31T09:00:00.000Z",
          provenance: { source: "humain" },
        },
      }),
      client_id: null,
      dossier_id: null,
      contrat_id: null,
      compagnie_id: null,
      updated_at: UPDATED_AT,
    });
    const parColonne = new Map(predicats.map((p) => [p.colonne, p]));
    expect(parColonne.get("ai_context->analyse->>validated_by")).toEqual({
      colonne: "ai_context->analyse->>validated_by",
      operateur: "eq",
      valeur: VALIDATEUR,
    });
    expect(parColonne.get("ai_context->analyse->provenance->>source")?.valeur).toBe("humain");
    expect(parColonne.get("updated_at")?.valeur).toBe(UPDATED_AT);
    // Q.3 : aucune FK dans la garde du Lot 3.
    for (const fk of ["client_id", "dossier_id", "contrat_id", "compagnie_id"]) {
      expect(parColonne.has(fk)).toBe(false);
    }
  });

  test("15. `updated_at` absent → refus sûr, aucun UPDATE", async () => {
    const j = journalVide();
    const r = await croiserEtEnregistrerContexteEmail("email-1", {
      db: doubleLot3(etat(), j, { updatedAtLu: null }),
    });
    expect(r.ecrit).toBe(false);
    expect(r.motif).toBe("garde_optimiste");
    expect(j.updates).toBe(0);
  });

  test("16. `updated_at` non exploitable (vide) → refus sûr", async () => {
    const j = journalVide();
    const r = await croiserEtEnregistrerContexteEmail("email-1", {
      db: doubleLot3(etat(), j, { updatedAtLu: "   " }),
    });
    expect(r.ecrit).toBe(false);
    expect(r.motif).toBe("garde_optimiste");
    expect(j.updates).toBe(0);
    expect(updatedAtExploitable("   ")).toBe(false);
    expect(updatedAtExploitable(UPDATED_AT)).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* 17 à 20 — représentation temporelle, idempotence, sentinelles        */
/* ------------------------------------------------------------------ */

describe("Q.11 — représentation temporelle, idempotence, sentinelles", () => {
  test("17. représentation timezone équivalente → même instant, écriture possible", async () => {
    const base = etat(detecte(), "2026-02-01T10:00:00.123456Z");
    const j = journalVide();
    // La valeur lue est transmise telle quelle ; la comparaison est typée.
    const r = await croiserEtEnregistrerContexteEmail("email-1", {
      db: doubleLot3(base, j, { updatedAtLu: "2026-02-01T10:00:00.123456+00:00" }),
    });
    expect(r.ecrit).toBe(true);
  });

  test("18. instant réellement différent → refus", async () => {
    const base = etat(detecte(), "2026-02-01T10:00:00.123456+00:00");
    const j = journalVide();
    const r = await croiserEtEnregistrerContexteEmail("email-1", {
      db: doubleLot3(base, j, { updatedAtLu: "2026-02-01T10:00:00.123000+00:00" }),
    });
    expect(r.ecrit).toBe(false);
    expect(r.motif).toBe("garde_optimiste");
  });

  test("19. idempotence : second passage sur état inchangé, un seul UPDATE par appel", async () => {
    const base = etat();
    const j = journalVide();
    const r1 = await croiserEtEnregistrerContexteEmail("email-1", { db: doubleLot3(base, j) });
    expect(r1.ecrit).toBe(true);
    const r2 = await croiserEtEnregistrerContexteEmail("email-1", { db: doubleLot3(base, j) });
    expect(r2.ecrit).toBe(true);
    expect(j.updates).toBe(2);
    expect(r2.contexte?.schema_version).toBe(EMAIL_CONTEXT_SCHEMA_VERSION);
  });

  test("20. non-écrasement : préservation des sentinelles humaines entrantes (Option B)", () => {
    const entrant = detecte({
      analyse: {
        statut: "PROPOSED",
        validated_by: VALIDATEUR,
        validated_at: "2026-01-31T09:00:00.000Z",
        validation_humaine_requise: true,
        provenance: { source: "humain" },
      },
    });
    const sortant = detecte({
      analyse: {
        statut: "PROPOSED",
        validated_by: null,
        validated_at: null,
        validation_humaine_requise: true,
        provenance: { source: "regle_deterministe" },
      },
    });
    const preserve = preserverSentinellesHumaines(entrant, sortant);
    expect(preserve.analyse?.validated_by).toBe(VALIDATEUR);
    expect(preserve.analyse?.validated_at).toBe("2026-01-31T09:00:00.000Z");
    expect(preserve.analyse?.provenance?.source).toBe("humain");
    expect(preserve.analyse?.validation_humaine_requise).toBe(false);
    expect(preserve.schema_version).toBe(EMAIL_CONTEXT_SCHEMA_VERSION);
    // Sans sentinelle entrante : comportement inchangé.
    expect(preserverSentinellesHumaines(detecte(), sortant)).toBe(sortant);
    expect(sentinellesHumaines(entrant).presente).toBe(true);
    expect(sentinellesHumaines(detecte()).presente).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* Contrôles statiques d'étanchéité                                    */
/* ------------------------------------------------------------------ */

describe("Q.11 — contrôles statiques d'étanchéité", () => {
  const fichiers = ["src/lib/email-context-resolver.server.ts", "src/lib/email-context-resolution.ts"];

  const lire = async (f: string): Promise<string> => {
    const fs = await import("node:fs/promises");
    return (await fs.readFile(f, "utf8"))
      .split("\n")
      .filter((l) => !l.trimStart().startsWith("*") && !l.trimStart().startsWith("//"))
      .join("\n");
  };

  test("aucun `toISOString()` appliqué au jeton de version, aucun retry", async () => {
    for (const f of fichiers) {
      const code = await lire(f);
      expect(code).not.toContain("updated_at.toISOString");
      expect(code).not.toMatch(/new Date\(\s*\w*updated_?at/i);
      expect(code).not.toMatch(/\bretry\b/i);
      expect(code).not.toMatch(/\bbackoff\b/i);
    }
  });

  test("un seul UPDATE et aucune mutation FK / INSERT / UPSERT / DELETE / RPC", async () => {
    const code = await lire("src/lib/email-context-resolver.server.ts");
    expect((code.match(/\.update\(/g) ?? []).length).toBe(1);
    expect(code).not.toContain(".insert(");
    expect(code).not.toContain(".upsert(");
    expect(code).not.toContain(".delete(");
    expect(code).not.toContain(".rpc(");
    // La seule colonne mutée est `ai_context`.
    expect(code).toContain(".update({ ai_context: enJson(contexte) })");
    for (const fk of ["client_id:", "dossier_id:", "contrat_id:", "compagnie_id:"]) {
      expect(code).not.toContain(`.update({ ${fk}`);
    }
  });

  test("l'écriture est gardée et impose un état observé unique", async () => {
    const code = await lire("src/lib/email-context-resolver.server.ts");
    expect(code).toContain("composerGardeQ11(observe)");
    expect(code).toContain('requete.select("id")');
    expect(code).not.toContain("observeAiContext");
    expect(code).toContain('schema_version');
  });
});
