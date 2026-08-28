/**
 * CD-SI-001-B — ACTION 43 : tests du branchement Lot 2 → Lot 3 (dry-run strict).
 * Garde-fous : aucune persistance, SKIP CRM, idempotence, refus sécurisés,
 * isolation d'erreur, plafond, métriques additives, couverture, étanchéité.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  BRANCHEMENT_CONTEXTE_DRY_RUN,
  PLAFOND_LOT_CONTEXTE,
  brancherContexteEmail,
  creerMetriquesContexte,
  finaliserMetriquesContexte,
  type DependancesBranchement,
  type MetriquesContexte,
} from "./email-context-branchement.server";
import { contexteEchecExtraction } from "./email-context-extraction";
import type { EmailContext } from "./email-context-types";

const SOURCE_GREFFON = readFileSync("src/lib/email-context-branchement.server.ts", "utf8");
/** Code exécutable seul (commentaires retirés) pour les contrôles d'étanchéité. */
const CODE_GREFFON = SOURCE_GREFFON.split("\n")
  .filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l))
  .join("\n");
const SOURCE_AGENTS = readFileSync("src/lib/emails-agents.server.ts", "utf8");

const contexteDetecte = (): EmailContext => {
  const base = contexteEchecExtraction("erreur_api", { modele: "google/gemini-3.6-flash" });
  return {
    ...base,
    ambiguities: [],
    analyse: { ...base.analyse, statut: "DETECTED", validation_humaine_requise: false },
  } as EmailContext;
};

const deps = (over: Partial<DependancesBranchement> = {}): DependancesBranchement => ({
  resoudreEmail: async () => ({ id: "e1", ai_context: {}, updated_at: new Date().toISOString() }),
  analyser: async () => ({ ok: true, contexte: contexteDetecte(), modele: "google/gemini-3.6-flash" }),
  ...over,
});

const email = { sujet: "Devis", expediteur_nom: "A", expediteur_email: "a@b.fr", texte: "Bonjour" };

const lancer = (over: Partial<DependancesBranchement> = {}, m?: MetriquesContexte, estSortant = false) =>
  brancherContexteEmail({
    gmailMessageId: "g1",
    email,
    estSortant,
    metriques: m ?? creerMetriquesContexte(),
    deps: deps(over),
  });

describe("ACTION 43 — mode du greffon", () => {
  it("est en dry-run au premier déploiement", () => {
    expect(BRANCHEMENT_CONTEXTE_DRY_RUN).toBe(true);
    expect(PLAFOND_LOT_CONTEXTE).toBe(5);
  });

  it("refuse toute écriture réelle tant que la décision DG n'est pas prise", async () => {
    const m = creerMetriquesContexte(false);
    const r = await brancherContexteEmail({
      gmailMessageId: "g1",
      email,
      estSortant: false,
      metriques: m,
      deps: deps(),
      dryRun: false,
    });
    expect(r.statut).toBe("refus_securise");
    expect(r.motif).toBe("ecriture_reelle_non_autorisee");
    expect(m.contexte_traites).toBe(0);
  });
});

describe("ACTION 43 — sélection", () => {
  it("exclut les messages sortants", async () => {
    const m = creerMetriquesContexte();
    const r = await lancer({}, m, true);
    expect(r.statut).toBe("hors_perimetre");
    expect(m.contexte_selectionnes).toBe(0);
  });

  it("exclut un texte utile vide", async () => {
    const m = creerMetriquesContexte();
    const r = await brancherContexteEmail({
      gmailMessageId: "g1",
      email: { ...email, texte: "   " },
      estSortant: false,
      metriques: m,
      deps: deps(),
    });
    expect(r.statut).toBe("hors_perimetre");
    expect(m.contexte_selectionnes).toBe(0);
  });

  it("applique le plafond du passage", async () => {
    const m = creerMetriquesContexte();
    for (let i = 0; i < PLAFOND_LOT_CONTEXTE + 3; i++) await lancer({}, m);
    expect(m.contexte_selectionnes).toBe(PLAFOND_LOT_CONTEXTE);
    expect(m.contexte_motifs["plafond_atteint"]).toBe(3);
  });
});

describe("ACTION 43 — résolution CRM (§3.4)", () => {
  it("SKIP explicite si aucune ligne crm_emails, sans création", async () => {
    const m = creerMetriquesContexte();
    let analyses = 0;
    const r = await lancer(
      {
        resoudreEmail: async () => null,
        analyser: async () => {
          analyses++;
          return { ok: true, contexte: contexteDetecte() };
        },
      },
      m,
    );
    expect(r.statut).toBe("sans_ligne_crm");
    expect(m.contexte_sans_ligne_crm).toBe(1);
    expect(analyses).toBe(0);
  });

  it("n'utilise que des lectures : aucun insert/upsert/delete dans le greffon", () => {
    expect(CODE_GREFFON).not.toMatch(/\.insert\(|\.upsert\(|\.delete\(|\.update\(/);
    expect(SOURCE_GREFFON).toContain('.select("id, ai_context, updated_at")');
  });
});

describe("ACTION 43 — idempotence et refus sécurisés", () => {
  it("ignore un contexte DETECTED déjà présent", async () => {
    const m = creerMetriquesContexte();
    const r = await lancer({ resoudreEmail: async () => ({ id: "e1", ai_context: contexteDetecte() }) }, m);
    expect(r.statut).toBe("contexte_deja_present");
    expect(m.contexte_ignores_contexte_present).toBe(1);
    expect(m.contexte_traites).toBe(0);
  });

  it("refuse une sentinelle humaine (Q.11 inchangée)", async () => {
    const humain = contexteDetecte();
    (humain.analyse as unknown as { validated_by: string }).validated_by = "11111111-1111-4111-8111-111111111111";
    const m = creerMetriquesContexte();
    const r = await lancer({ resoudreEmail: async () => ({ id: "e1", ai_context: humain }) }, m);
    expect(r.statut).toBe("refus_securise");
    expect(m.contexte_refus_securises).toBe(1);
  });

  it("n'utilise jamais force", () => {
    expect(CODE_GREFFON).not.toMatch(/force\s*:\s*true/);
  });
});

describe("ACTION 43 — Lot 2 et simulation Lot 3", () => {
  it("traite un candidat sans persistance et simule le croisement", async () => {
    const m = creerMetriquesContexte();
    const r = await lancer({}, m);
    expect(r.statut).toBe("traite");
    expect(r.statut_simule).toBeTruthy();
    expect(m.contexte_traites).toBe(1);
    expect(m.contexte_simules_proposes + m.contexte_simules_ambigus).toBe(1);
  });

  it("n'importe aucun orchestrateur persistant ni le Lot 4", () => {
    expect(CODE_GREFFON).not.toContain("extraireEtEnregistrerContexteEmail");
    expect(CODE_GREFFON).not.toContain("croiserEtEnregistrerContexteEmail");
    expect(CODE_GREFFON).not.toContain("persisterContexteEmail");
    expect(CODE_GREFFON).not.toContain("ecrireAiContext");
    expect(CODE_GREFFON).not.toContain("email-fk-authorization");
    expect(CODE_GREFFON).not.toMatch(/triage_ia|triage_le/);
    expect(CODE_GREFFON).not.toMatch(/client_id|dossier_id|contrat_id|compagnie_id/);
    expect(CODE_GREFFON).not.toMatch(/gmail\.server|lireMessage|marquerEtat/);
    expect(CODE_GREFFON).not.toContain("schema_version =");
  });

  it("comptabilise une extraction en échec comme erreur, sans traitement", async () => {
    const m = creerMetriquesContexte();
    const r = await lancer({ analyser: async () => ({ ok: false, contexte: contexteDetecte(), motif: "timeout" }) }, m);
    expect(r.statut).toBe("erreur");
    expect(m.contexte_erreurs).toBe(1);
    expect(m.contexte_traites).toBe(0);
  });
});

describe("ACTION 43 — isolation d'erreur", () => {
  it("ne relance jamais une exception et n'interrompt pas le lot", async () => {
    const m = creerMetriquesContexte();
    const r = await lancer(
      {
        resoudreEmail: async () => {
          throw new Error("base indisponible");
        },
      },
      m,
    );
    expect(r.statut).toBe("erreur");
    expect(m.contexte_erreurs).toBe(1);
    const suivant = await lancer({}, m);
    expect(suivant.statut).toBe("traite");
  });

  it("le greffon est isolé dans executerAgents, hors du catch historique", () => {
    expect(SOURCE_AGENTS).toContain("brancherContexteEmail({");
    expect(SOURCE_AGENTS).toContain("[branchement-contexte] erreur non capturée");
    // Un seul point d'insertion : jamais dans la boucle Relation client.
    expect(SOURCE_AGENTS.split("brancherContexteEmail({").length - 1).toBe(1);
  });
});

describe("ACTION 43 — métriques et couverture", () => {
  it("calcule la couverture éligibles traités / éligibles identifiés", async () => {
    const m = creerMetriquesContexte();
    await lancer({}, m);
    await lancer({ resoudreEmail: async () => null }, m);
    finaliserMetriquesContexte(m);
    expect(m.contexte_selectionnes).toBe(2);
    expect(m.contexte_traites).toBe(1);
    expect(m.contexte_couverture).toBe(0.5);
  });

  it("expose tous les compteurs exigés et une couverture nulle sans candidat", () => {
    const m = finaliserMetriquesContexte(creerMetriquesContexte());
    expect(Object.keys(m).sort()).toEqual(
      [
        "contexte_couverture",
        "contexte_dry_run",
        "contexte_erreurs",
        "contexte_ignores_contexte_present",
        "contexte_motifs",
        "contexte_refus_securises",
        "contexte_selectionnes",
        "contexte_simules_ambigus",
        "contexte_simules_proposes",
        "contexte_sans_ligne_crm",
        "contexte_traites",
      ].sort(),
    );
    expect(m.contexte_couverture).toBe(0);
  });

  it("n'altère aucun champ historique du retour d'executerAgents", () => {
    for (const champ of [
      "dossiers_crees:",
      "factures_creees:",
      "bordereaux_crees:",
      "veilles_creees:",
      "reponses_auto:",
      "brouillons_reponses:",
      "erreurs,",
      "rattrapages_traites:",
      "mis_corbeille:",
      "partenaires_routes:",
      "offres_partenaires:",
      "compagnies_creees:",
      "produits_crees:",
    ]) {
      expect(SOURCE_AGENTS).toContain(champ);
    }
    // Le greffon n'incrémente jamais le compteur historique `erreurs`.
    expect(SOURCE_AGENTS).not.toMatch(/contexte_erreurs\+\+;\s*erreurs\+\+/);
  });
});
