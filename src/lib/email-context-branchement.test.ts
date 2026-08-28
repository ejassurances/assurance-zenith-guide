/**
 * Branchement Lot 2 → Lot 3 en fonctionnement réel.
 * Garde-fous : sélection, plafond, idempotence, protection humaine (Q.11),
 * isolation d'erreur, seconde tentative CRM, périmètre d'écriture.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  PLAFOND_LOT_CONTEXTE,
  brancherContexteEmail,
  cloturerContexteEmail,
  creerMetriquesContexte,
  type DependancesBranchement,
  type MetriquesContexte,
} from "./email-context-branchement.server";
import { contexteEchecExtraction } from "./email-context-extraction";
import type { EmailContext } from "./email-context-types";

const SOURCE_GREFFON = readFileSync("src/lib/email-context-branchement.server.ts", "utf8");
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
  resoudreEmail: async () => ({ id: "e1", ai_context: {} }),
  extraire: async () => ({ ok: true, ecrit: true, modele: "google/gemini-3.6-flash" }),
  croiser: async () => ({ ecrit: true, statut: "PROPOSED" }),
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

describe("sélection", () => {
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

describe("chaîne Lot 2 → Lot 3", () => {
  it("extrait, enregistre puis résout", async () => {
    const m = creerMetriquesContexte();
    const r = await lancer({}, m);
    expect(r.statut).toBe("traite");
    expect(r.statut_resolu).toBe("PROPOSED");
    expect(m.contexte_traites).toBe(1);
    expect(m.contexte_resolus_proposes).toBe(1);
  });

  it("un Lot 3 non écrit ne remet pas en cause le Lot 2", async () => {
    const m = creerMetriquesContexte();
    const r = await lancer({ croiser: async () => ({ ecrit: false, motif: "referentiel_indisponible" }) }, m);
    expect(r.statut).toBe("traite");
    expect(m.contexte_traites).toBe(1);
    expect(m.contexte_motifs["lot3_non_ecrit_referentiel_indisponible"]).toBe(1);
  });

  it("compte une extraction en échec comme erreur, sans traitement", async () => {
    const m = creerMetriquesContexte();
    const r = await lancer({ extraire: async () => ({ ok: false, ecrit: false, motif: "timeout" }) }, m);
    expect(r.statut).toBe("erreur");
    expect(m.contexte_erreurs).toBe(1);
    expect(m.contexte_traites).toBe(0);
  });
});

describe("idempotence et protection humaine", () => {
  it("ignore un contexte DETECTED déjà présent", async () => {
    const m = creerMetriquesContexte();
    let extractions = 0;
    const r = await lancer(
      {
        resoudreEmail: async () => ({ id: "e1", ai_context: contexteDetecte() }),
        extraire: async () => {
          extractions++;
          return { ok: true, ecrit: true };
        },
      },
      m,
    );
    expect(r.statut).toBe("contexte_deja_present");
    expect(m.contexte_ignores_contexte_present).toBe(1);
    expect(extractions).toBe(0);
  });

  it("refuse une sentinelle humaine (Q.11 inchangée)", async () => {
    const humain = contexteDetecte();
    (humain.analyse as unknown as { validated_by: string }).validated_by =
      "11111111-1111-4111-8111-111111111111";
    const m = creerMetriquesContexte();
    const r = await lancer({ resoudreEmail: async () => ({ id: "e1", ai_context: humain }) }, m);
    expect(r.statut).toBe("refus_securise");
    expect(m.contexte_refus_securises).toBe(1);
  });

  it("n'utilise jamais force", () => {
    expect(CODE_GREFFON).not.toMatch(/force\s*:\s*true/);
  });
});

describe("périmètre d'écriture", () => {
  it("n'écrit rien hors ai_context : aucune FK, aucun triage, aucun Gmail", () => {
    expect(CODE_GREFFON).not.toMatch(/\.insert\(|\.upsert\(|\.delete\(|\.update\(|\.rpc\(/);
    expect(CODE_GREFFON).not.toMatch(/triage_ia|triage_le/);
    expect(CODE_GREFFON).not.toMatch(/client_id|dossier_id|contrat_id|compagnie_id/);
    expect(CODE_GREFFON).not.toMatch(/gmail\.server|lireMessage|marquerEtat/);
    expect(CODE_GREFFON).not.toContain("email-fk-authorization");
    expect(SOURCE_GREFFON).toContain('.select("id, ai_context")');
  });
});

describe("isolation d'erreur", () => {
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
    expect(SOURCE_AGENTS.split("brancherContexteEmail({").length - 1).toBe(1);
  });

  it("n'altère aucun champ historique du retour d'executerAgents", () => {
    for (const champ of [
      "dossiers_crees:",
      "factures_creees:",
      "veilles_creees:",
      "reponses_auto:",
      "erreurs,",
      "mis_corbeille:",
    ]) {
      expect(SOURCE_AGENTS).toContain(champ);
    }
    expect(SOURCE_AGENTS).not.toMatch(/contexte_erreurs\+\+;\s*erreurs\+\+/);
  });
});

describe("seconde tentative CRM (prospects insérés en cours d'itération)", () => {
  it("CRM absent puis toujours absent → SKIP définitif sans erreur", async () => {
    const m = creerMetriquesContexte();
    const r = await lancer({ resoudreEmail: async () => null }, m);
    expect(r.etat).toBe("EN_ATTENTE_LIGNE_CRM");
    const c = await cloturerContexteEmail(r, m);
    expect(c?.etat).toBe("SANS_LIGNE_CRM_DEFINITIF");
    expect(m.contexte_sans_ligne_crm).toBe(1);
    expect(m.contexte_erreurs).toBe(0);
    expect(m.contexte_traites).toBe(0);
  });

  it("CRM absent puis créé → chaîne exécutée une seule fois", async () => {
    const m = creerMetriquesContexte();
    let lectures = 0;
    let extractions = 0;
    const r = await brancherContexteEmail({
      gmailMessageId: "g1",
      email,
      estSortant: false,
      metriques: m,
      deps: deps({
        resoudreEmail: async () => {
          lectures++;
          return lectures === 1 ? null : { id: "e1", ai_context: {} };
        },
        extraire: async () => {
          extractions++;
          return { ok: true, ecrit: true };
        },
      }),
    });
    expect(extractions).toBe(0);
    const c = await cloturerContexteEmail(r, m);
    expect(c?.statut).toBe("traite");
    expect(extractions).toBe(1);
    expect(m.contexte_traites).toBe(1);
    expect(m.contexte_selectionnes).toBe(1);

    // Seconde tentative interdite : aucun effet.
    expect(await cloturerContexteEmail(r, m)).toBeNull();
    expect(extractions).toBe(1);
    expect(lectures).toBe(2);
  });

  it("n'ouvre la clôture pour aucun autre état terminal", async () => {
    const m = creerMetriquesContexte();
    for (const r of [
      await lancer({}, m),
      await lancer({ resoudreEmail: async () => ({ id: "e1", ai_context: contexteDetecte() }) }, m),
      await lancer({ extraire: async () => ({ ok: false, ecrit: false, motif: "x" }) }, m),
      await lancer({}, m, true),
    ]) {
      expect(await cloturerContexteEmail(r, m)).toBeNull();
    }
  });

  it("isole les erreurs de la clôture", async () => {
    const m = creerMetriquesContexte();
    let lectures = 0;
    const r = await brancherContexteEmail({
      gmailMessageId: "g1",
      email,
      estSortant: false,
      metriques: m,
      deps: deps({
        resoudreEmail: async () => {
          lectures++;
          if (lectures === 1) return null;
          throw new Error("base indisponible");
        },
      }),
    });
    const c = await cloturerContexteEmail(r, m);
    expect(c?.statut).toBe("erreur");
    expect(m.contexte_erreurs).toBe(1);
  });

  it("la clôture est branchée dans executerAgents en finally, une seule fois", () => {
    expect(SOURCE_AGENTS).toContain("cloturerContexteEmail(resultatContexte, metriquesContexte)");
    expect(SOURCE_AGENTS.split("cloturerContexteEmail(resultatContexte").length - 1).toBe(1);
    expect(SOURCE_AGENTS).toContain("[branchement-contexte] erreur non capturée (clôture)");
    expect(SOURCE_AGENTS.split("await lireMessage(m.id)").length - 1).toBe(1);
  });
});
