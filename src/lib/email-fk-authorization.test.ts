/**
 * CD-SI-001-B — LOT 4 : recette du moteur d'autorisation des FK.
 * Référence exclusive : docs/CD-SI-001-B-LOT4-DESIGN-V1.2.md (§O — T-01 à T-35).
 * Aucun accès réseau, aucun accès base : lecteur et écrivain simulés strictement typés.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { lireContexteEmail } from "./email-context-schema";
import type { EmailContext } from "./email-context-types";
import type {
  ClientRef,
  CompagnieRef,
  ContratRef,
  DocumentRef,
  DossierRef,
} from "./email-context-resolution";
import {
  cleEcriture,
  contexteApresEcriture,
  evaluerAutorisationFk,
  niveauIndicatifPreuve,
  referentielLot4Vide,
  type ChampFk,
  type EtatEmailObserve,
  type ReferentielLot4,
} from "./email-fk-authorization";
import {
  autoriserEtEcrireFkEmail,
  type EcrivainLot4,
  type LigneEmailLot4,
} from "./email-fk-authorization.server";
import type { LecteurLot3, LectureBornee } from "./email-context-resolver.server";

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

const EMAIL_ID = "00000000-0000-4000-8000-000000000001";
const CLIENT_A = "11111111-1111-4111-8111-111111111111";
const CLIENT_B = "22222222-2222-4222-8222-222222222222";
const DOSSIER_A = "33333333-3333-4333-8333-333333333333";
const DOSSIER_B = "44444444-4444-4444-8444-444444444444";
const CONTRAT_A = "55555555-5555-4555-8555-555555555555";
const CONTRAT_B = "66666666-6666-4666-8666-666666666666";
const COMPAGNIE_A = "77777777-7777-4777-8777-777777777777";
const COMPAGNIE_B = "88888888-8888-4888-8888-888888888888";
const DOC_A = "99999999-9999-4999-8999-999999999999";
const UTILISATEUR = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const clients: ClientRef[] = [
  { id: CLIENT_A, nom: "Durand", prenom: "Claire", email: "claire@exemple.fr", telephone: "0601020304" },
  { id: CLIENT_B, nom: "Durand", prenom: "Paul", email: "paul@exemple.fr", telephone: "0605060708" },
];
const dossiers: DossierRef[] = [
  { id: DOSSIER_A, reference: "EJ-2026-EMP-0001", client_id: CLIENT_A, statut: "en_cours" },
  { id: DOSSIER_B, reference: "EJ-2026-EMP-0002", client_id: CLIENT_B, statut: "en_cours" },
];
const contrats: ContratRef[] = [
  {
    id: CONTRAT_A,
    numero: "POL-123",
    client_id: CLIENT_A,
    dossier_id: DOSSIER_A,
    compagnie_id: COMPAGNIE_A,
    produit_id: null,
  },
  {
    id: CONTRAT_B,
    numero: "POL-999",
    client_id: CLIENT_B,
    dossier_id: DOSSIER_B,
    compagnie_id: COMPAGNIE_B,
    produit_id: null,
  },
];
const compagnies: CompagnieRef[] = [
  { id: COMPAGNIE_A, nom: "Compagnie A", contact_email: "contact@compagnie-a.fr", site_web: "https://www.compagnie-a.fr" },
  { id: COMPAGNIE_B, nom: "Compagnie B", contact_email: "contact@compagnie-b.fr", site_web: null },
];
const documents: DocumentRef[] = [
  { id: DOC_A, nom: "offre.pdf", client_id: CLIENT_A, dossier_id: DOSSIER_A, contrat_id: CONTRAT_A },
];

function referentiel(sur: Partial<ReferentielLot4> = {}): ReferentielLot4 {
  return { ...referentielLot4Vide(), clients, dossiers, contrats, compagnies, documents, ...sur };
}

function etat(contexte: EmailContext, fk: Partial<Record<ChampFk, string>> = {}): EtatEmailObserve {
  return {
    id: EMAIL_ID,
    client_id: fk.client_id ?? null,
    dossier_id: fk.dossier_id ?? null,
    contrat_id: fk.contrat_id ?? null,
    compagnie_id: fk.compagnie_id ?? null,
    ai_context: contexte,
  };
}

/** Contexte `PROPOSED` conforme au schéma 1.1.0, avec preuves Lot 3 nommées `L3-<niveau>-<n>`. */
function contexte(morceaux: Partial<EmailContext> = {}): EmailContext {
  const base: EmailContext = {
    schema_version: "1.1.0",
    analyse: {
      statut: "PROPOSED",
      analyse_le: "2026-08-26T10:00:00.000Z",
      validation_humaine_requise: true,
      validated_by: null,
      validated_at: null,
      modifications_apportees: ["lot3_croisement:PROPOSED"],
      provenance: { source: "regle_deterministe", champ: "lot3_croisement", detecte_le: "2026-08-26T10:00:00.000Z" },
    },
    ...morceaux,
  };
  const valide = lireContexteEmail(base);
  if (!valide) throw new Error("fixture non conforme au schéma Lot 1");
  return valide;
}

const preuve = (id: string, cible: string) =>
  ({ id, type: "reference_explicite" as const, extrait: `${id} — extrait`, cible });

const ctxN1 = (reference = "EJ-2026-EMP-0001") =>
  contexte({
    dossiers_detectes: [
      { reference_citee: reference, statut: "PROPOSED", provenance: { preuve_ids: ["L3-N1-1"] } },
    ],
    preuves: [preuve("L3-N1-1", "dossiers.reference")],
  });

const ctxN2 = (email = "claire@exemple.fr") =>
  contexte({
    correspondant: { email, statut: "PROPOSED", provenance: { preuve_ids: ["L3-N2-1"] } },
    preuves: [preuve("L3-N2-1", "clients.email")],
  });

const ctxN3 = (numero = "POL-123") =>
  contexte({
    contrats_detectes: [
      { numero_police: numero, statut: "PROPOSED", provenance: { preuve_ids: ["L3-N3-1"] } },
    ],
    preuves: [preuve("L3-N3-1", "contrats.numero")],
  });

const ctxN4 = (email = "gestion@compagnie-a.fr") =>
  contexte({
    correspondant: { email, statut: "PROPOSED", provenance: { preuve_ids: ["L3-N4-1"] } },
    preuves: [preuve("L3-N4-1", "compagnies.contact_email")],
  });

const champs = (d: ReturnType<typeof evaluerAutorisationFk>): ChampFk[] =>
  d.ecritures.map((e) => e.champ).sort();

/* ------------------------------------------------------------------ */
/* T-01 à T-09 — niveaux porteurs et rebonds                           */
/* ------------------------------------------------------------------ */

describe("Lot 4 — niveaux porteurs (T-01 à T-09)", () => {
  it("T-01 : N1 porte dossier_id et le rebond client du dossier", () => {
    const d = evaluerAutorisationFk(etat(ctxN1()), referentiel());
    expect(d.autorise).toBe(true);
    expect(champs(d)).toEqual(["client_id", "dossier_id"]);
    expect(d.ecritures.find((e) => e.champ === "dossier_id")).toMatchObject({
      valeur: DOSSIER_A,
      niveau: "N1",
      mode: "preuve_directe",
    });
    expect(d.ecritures.some((e) => e.champ === "contrat_id" || e.champ === "compagnie_id")).toBe(false);
  });

  it("T-02 : N2 porte client_id uniquement", () => {
    const d = evaluerAutorisationFk(etat(ctxN2()), referentiel());
    expect(d.autorise).toBe(true);
    expect(champs(d)).toEqual(["client_id"]);
    expect(d.ecritures[0]).toMatchObject({ valeur: CLIENT_A, niveau: "N2", mode: "preuve_directe" });
  });

  it("T-03 : N3 porte contrat_id et ses rebonds descendants non NULL", () => {
    const d = evaluerAutorisationFk(etat(ctxN3()), referentiel());
    expect(d.autorise).toBe(true);
    expect(champs(d)).toEqual(["client_id", "compagnie_id", "contrat_id", "dossier_id"]);
    expect(d.ecritures.filter((e) => e.champ !== "contrat_id").every((e) => e.mode === "rebond")).toBe(true);
    expect(d.ecritures.every((e) => e.niveau === "N3")).toBe(true);
  });

  it("T-04 : N4 porte compagnie_id uniquement", () => {
    const d = evaluerAutorisationFk(etat(ctxN4()), referentiel());
    expect(champs(d)).toEqual(["compagnie_id"]);
    expect(d.ecritures[0]).toMatchObject({ valeur: COMPAGNIE_A, niveau: "N4" });
  });

  it("T-05 : N5 seul (personne citée avec email) n'autorise rien", () => {
    const ctx = contexte({
      personnes_detectees: [
        { email: "claire@exemple.fr", statut: "PROPOSED", provenance: { preuve_ids: ["L3-N5-1"] } },
      ],
      preuves: [{ id: "L3-N5-1", type: "email_corps", extrait: "N5", cible: "clients.email" }],
    });
    const d = evaluerAutorisationFk(etat(ctx), referentiel());
    expect(d.autorise).toBe(false);
    expect(d.ecritures).toHaveLength(0);
    expect(d.refus.some((r) => r.motif === "aucune_preuve_porteuse")).toBe(true);
  });

  it("T-06 : N7 (nom/prénom seul) n'autorise rien", () => {
    const ctx = contexte({
      personnes_detectees: [
        { nom: "Durand", prenom: "Claire", statut: "DETECTED", provenance: { preuve_ids: ["L3-N7-1"] } },
      ],
      preuves: [{ id: "L3-N7-1", type: "email_corps", extrait: "N7", cible: "clients.nom" }],
    });
    expect(evaluerAutorisationFk(etat(ctx), referentiel()).autorise).toBe(false);
  });

  it("T-07 : N8 (rattachement historique) n'autorise rien", () => {
    const ctx = contexte({
      preuves: [{ id: "L3-N8-1", type: "thread", extrait: "N8", cible: "crm_emails.client_id" }],
    });
    const d = evaluerAutorisationFk(etat(ctx, { client_id: CLIENT_A }), referentiel());
    expect(d.autorise).toBe(false);
    expect(d.ecritures).toHaveLength(0);
  });

  it("T-08 : N2 + N9 (dossier unique actif) — dossier_id jamais écrit", () => {
    const d = evaluerAutorisationFk(etat(ctxN2()), referentiel());
    expect(champs(d)).toEqual(["client_id"]);
    expect(d.ecritures.some((e) => e.champ === "dossier_id")).toBe(false);
  });

  it("T-09 : rebonds N3 cohérents avec le client et le dossier réels", () => {
    const d = evaluerAutorisationFk(etat(ctxN3()), referentiel());
    expect(d.ecritures.find((e) => e.champ === "client_id")?.valeur).toBe(CLIENT_A);
    expect(d.ecritures.find((e) => e.champ === "dossier_id")?.valeur).toBe(DOSSIER_A);
    expect(d.ecritures.find((e) => e.champ === "compagnie_id")?.valeur).toBe(COMPAGNIE_A);
  });
});

/* ------------------------------------------------------------------ */
/* T-10 à T-17 — contradictions et multi-candidats                     */
/* ------------------------------------------------------------------ */

describe("Lot 4 — contradictions et multi-candidats (T-10 à T-17)", () => {
  it("T-10 : deux numéros de police désignant deux contrats — refus total", () => {
    const ctx = contexte({
      contrats_detectes: [
        { numero_police: "POL-123", statut: "PROPOSED", provenance: { preuve_ids: ["L3-N3-1"] } },
        { numero_police: "POL-999", statut: "PROPOSED", provenance: { preuve_ids: ["L3-N3-2"] } },
      ],
      preuves: [preuve("L3-N3-1", "contrats.numero"), preuve("L3-N3-2", "contrats.numero")],
    });
    const d = evaluerAutorisationFk(etat(ctx), referentiel());
    expect(d.autorise).toBe(false);
    expect(d.refus[0]?.motif).toBe("candidat_multiple");
  });

  it("T-11 : N2 sur un client unique — autorisé", () => {
    expect(evaluerAutorisationFk(etat(ctxN2("paul@exemple.fr")), referentiel()).ecritures[0]?.valeur).toBe(
      CLIENT_B,
    );
  });

  it("T-12 : homonymes sur nom seul — aucune écriture", () => {
    const ctx = contexte({
      personnes_detectees: [
        { nom: "Durand", statut: "DETECTED", provenance: { preuve_ids: ["L3-N7-1"] } },
      ],
      preuves: [{ id: "L3-N7-1", type: "email_corps", extrait: "N7", cible: "clients.nom" }],
    });
    expect(evaluerAutorisationFk(etat(ctx), referentiel()).autorise).toBe(false);
  });

  it("T-13 : N2 → client A, document N6 → client B — refus (contradiction)", () => {
    const ctx = contexte({
      correspondant: { email: "paul@exemple.fr", statut: "PROPOSED", provenance: { preuve_ids: ["L3-N2-1"] } },
      documents_associes: [
        { nom_fichier: "offre.pdf", statut: "PROPOSED", provenance: { preuve_ids: ["L3-N6-1"] } },
      ],
      preuves: [preuve("L3-N2-1", "clients.email"), preuve("L3-N6-1", "documents.file_name")],
    });
    const d = evaluerAutorisationFk(etat(ctx), referentiel());
    expect(d.autorise).toBe(false);
    expect(d.refus[0]?.motif).toBe("contradiction");
  });

  it("T-14 : N2 + N6 convergents — seule l'écriture portée par N2 est autorisée", () => {
    const ctx = contexte({
      correspondant: { email: "claire@exemple.fr", statut: "PROPOSED", provenance: { preuve_ids: ["L3-N2-1"] } },
      documents_associes: [
        { nom_fichier: "offre.pdf", statut: "PROPOSED", provenance: { preuve_ids: ["L3-N6-1"] } },
      ],
      preuves: [preuve("L3-N2-1", "clients.email"), preuve("L3-N6-1", "documents.file_name")],
    });
    const d = evaluerAutorisationFk(etat(ctx), referentiel());
    expect(champs(d)).toEqual(["client_id"]);
    expect(d.ecritures[0]?.niveau).toBe("N2");
  });

  it("T-15 : document N6 contredisant le contrat N3 — refus total", () => {
    const ctx = contexte({
      contrats_detectes: [
        { numero_police: "POL-999", statut: "PROPOSED", provenance: { preuve_ids: ["L3-N3-1"] } },
      ],
      documents_associes: [
        { nom_fichier: "offre.pdf", statut: "PROPOSED", provenance: { preuve_ids: ["L3-N6-1"] } },
      ],
      preuves: [preuve("L3-N3-1", "contrats.numero"), preuve("L3-N6-1", "documents.file_name")],
    });
    const d = evaluerAutorisationFk(etat(ctx), referentiel());
    expect(d.autorise).toBe(false);
    expect(d.refus[0]?.motif).toBe("contradiction");
  });

  it("T-16 : rebond compagnie depuis contrat N3 lorsque contrats.compagnie_id est non NULL", () => {
    const d = evaluerAutorisationFk(etat(ctxN3()), referentiel());
    expect(d.ecritures.find((e) => e.champ === "compagnie_id")).toMatchObject({
      valeur: COMPAGNIE_A,
      mode: "rebond",
    });
  });

  it("T-17 : N4 → compagnie A, rebond contrat → compagnie B — refus total", () => {
    const ctx = contexte({
      correspondant: { email: "gestion@compagnie-a.fr", statut: "PROPOSED", provenance: { preuve_ids: ["L3-N4-1"] } },
      contrats_detectes: [
        { numero_police: "POL-999", statut: "PROPOSED", provenance: { preuve_ids: ["L3-N3-1"] } },
      ],
      preuves: [preuve("L3-N4-1", "compagnies.contact_email"), preuve("L3-N3-1", "contrats.numero")],
    });
    const d = evaluerAutorisationFk(etat(ctx), referentiel());
    expect(d.autorise).toBe(false);
    expect(d.refus[0]?.motif).toBe("contradiction");
  });
});

/* ------------------------------------------------------------------ */
/* T-18 à T-25 — protection humaine, idempotence, exhaustivité         */
/* ------------------------------------------------------------------ */

describe("Lot 4 — protections et idempotence (T-18 à T-25)", () => {
  it("T-18 : une validation humaine (CONFIRMED + validated_by) bloque le moteur", () => {
    const ctx = contexte({
      ...ctxN2(),
      analyse: {
        statut: "CONFIRMED",
        validated_by: UTILISATEUR,
        validated_at: "2026-08-26T11:00:00.000Z",
        provenance: { source: "humain" },
      },
    });
    const d = evaluerAutorisationFk(etat(ctx), referentiel());
    expect(d.autorise).toBe(false);
    expect(d.refus[0]?.motif).toBe("validation_humaine_existante");
  });

  it("T-19 : second passage, FK déjà écrites — deja_rattache, aucune trace dupliquée", () => {
    const ctx = ctxN3();
    const premier = evaluerAutorisationFk(etat(ctx), referentiel());
    const apres = contexteApresEcriture(etat(ctx), premier);
    const etatApres: EtatEmailObserve = {
      ...etat(apres, {
        client_id: CLIENT_A,
        dossier_id: DOSSIER_A,
        contrat_id: CONTRAT_A,
        compagnie_id: COMPAGNIE_A,
      }),
      ai_context: apres,
    };
    const second = evaluerAutorisationFk(etatApres, referentiel());
    expect(second.autorise).toBe(false);
    expect(second.refus.every((r) => r.motif === "deja_rattache")).toBe(true);
    const rejoue = contexteApresEcriture(etatApres, second);
    expect(rejoue.analyse?.modifications_apportees).toEqual(apres.analyse?.modifications_apportees);
  });

  it("T-21 : force ne contourne jamais CONFIRMED ni validated_at", () => {
    const ctx = contexte({
      ...ctxN2(),
      analyse: { statut: "PROPOSED", validated_at: "2026-08-26T11:00:00.000Z" },
    });
    const d = evaluerAutorisationFk(etat(ctx), referentiel(), { force: true });
    expect(d.autorise).toBe(false);
    expect(d.refus[0]?.motif).toBe("validation_humaine_existante");
  });

  it("T-22 : référentiel clients potentiellement tronqué — blocage total", () => {
    const d = evaluerAutorisationFk(etat(ctxN2()), referentiel({ referentielsTronques: ["clients"] }));
    expect(d.autorise).toBe(false);
    expect(d.refus[0]?.motif).toBe("referentiel_non_exhaustif");
  });

  it("T-23 : troncature sur compagnies avec N3 valide — aucune logique mixte", () => {
    const d = evaluerAutorisationFk(etat(ctxN3()), referentiel({ referentielsTronques: ["compagnies"] }));
    expect(d.autorise).toBe(false);
    expect(d.ecritures).toHaveLength(0);
  });

  it("T-24 : numéro de police fourni sous forme d'UUID inexistant — aucune FK", () => {
    const d = evaluerAutorisationFk(etat(ctxN3("00000000-0000-4000-8000-0000000000ff")), referentiel());
    expect(d.autorise).toBe(false);
    expect(d.refus.some((r) => r.motif === "aucune_preuve_porteuse")).toBe(true);
    expect(d.refus.some((r) => r.motif === "erreur_base")).toBe(false);
  });

  it("T-25 : contrat cité appartenant à un client différent du N2 — refus total", () => {
    const ctx = contexte({
      correspondant: { email: "claire@exemple.fr", statut: "PROPOSED", provenance: { preuve_ids: ["L3-N2-1"] } },
      contrats_detectes: [
        { numero_police: "POL-999", statut: "PROPOSED", provenance: { preuve_ids: ["L3-N3-1"] } },
      ],
      preuves: [preuve("L3-N2-1", "clients.email"), preuve("L3-N3-1", "contrats.numero")],
    });
    const d = evaluerAutorisationFk(etat(ctx), referentiel());
    expect(d.autorise).toBe(false);
    expect(d.refus[0]?.motif).toBe("contradiction");
  });
});

/* ------------------------------------------------------------------ */
/* T-26 à T-30 — N5/N6 seuls, corroboration, AMBIGUOUS global          */
/* ------------------------------------------------------------------ */

describe("Lot 4 — N5/N6 et AMBIGUOUS global (T-26 à T-30)", () => {
  it("T-26 : N5 seul en contexte PROPOSED — refus, N5 reste N5", () => {
    const ctx = contexte({
      personnes_detectees: [
        { email: "paul@exemple.fr", statut: "PROPOSED", provenance: { preuve_ids: ["L3-N5-1"] } },
      ],
      preuves: [{ id: "L3-N5-1", type: "email_corps", extrait: "N5", cible: "clients.email" }],
    });
    const d = evaluerAutorisationFk(etat(ctx), referentiel());
    expect(d.autorise).toBe(false);
    expect(d.ecritures).toHaveLength(0);
  });

  it("T-27 : N6 seul en contexte PROPOSED — refus", () => {
    const ctx = contexte({
      documents_associes: [
        { nom_fichier: "offre.pdf", statut: "PROPOSED", provenance: { preuve_ids: ["L3-N6-1"] } },
      ],
      preuves: [preuve("L3-N6-1", "documents.file_name")],
    });
    expect(evaluerAutorisationFk(etat(ctx), referentiel()).autorise).toBe(false);
  });

  it("T-28 : N5 + N2 convergents — écriture portée par N2 uniquement", () => {
    const ctx = contexte({
      correspondant: { email: "claire@exemple.fr", statut: "PROPOSED", provenance: { preuve_ids: ["L3-N2-1"] } },
      personnes_detectees: [
        { email: "claire@exemple.fr", statut: "PROPOSED", provenance: { preuve_ids: ["L3-N5-1"] } },
      ],
      preuves: [
        preuve("L3-N2-1", "clients.email"),
        { id: "L3-N5-1", type: "email_corps", extrait: "N5", cible: "clients.email" },
      ],
    });
    const d = evaluerAutorisationFk(etat(ctx), referentiel());
    expect(champs(d)).toEqual(["client_id"]);
    expect(d.ecritures[0]).toMatchObject({ niveau: "N2", valeur: CLIENT_A });
  });

  it("T-29 : N5 corroboré par N3 — seules les écritures N3 / rebonds H.2 sont posées", () => {
    const ctx = contexte({
      contrats_detectes: [
        { numero_police: "POL-123", statut: "PROPOSED", provenance: { preuve_ids: ["L3-N3-1"] } },
      ],
      personnes_detectees: [
        { email: "claire@exemple.fr", statut: "PROPOSED", provenance: { preuve_ids: ["L3-N5-1"] } },
      ],
      preuves: [
        preuve("L3-N3-1", "contrats.numero"),
        { id: "L3-N5-1", type: "email_corps", extrait: "N5", cible: "clients.email" },
      ],
    });
    const d = evaluerAutorisationFk(etat(ctx), referentiel());
    expect(d.autorise).toBe(true);
    expect(d.ecritures.every((e) => e.niveau === "N3")).toBe(true);
  });

  it("T-30 : contexte global AMBIGUOUS — blocage total malgré une FK déterministe", () => {
    const ctx = contexte({ ...ctxN3(), analyse: { statut: "AMBIGUOUS" } });
    const d = evaluerAutorisationFk(etat(ctx), referentiel());
    expect(d.autorise).toBe(false);
    expect(d.refus[0]?.motif).toBe("contexte_ambigu");
  });
});

/* ------------------------------------------------------------------ */
/* Couche serveur : concurrence, atomicité, étanchéité (T-20, T-31..35) */
/* ------------------------------------------------------------------ */

interface Journal {
  lectures: string[];
  ecritures: number;
}

function lecteurSimule(journal: Journal, sur: Partial<ReferentielLot4> = {}): LecteurLot3 {
  const r = referentiel(sur);
  const b = <L>(lignes: L[]): LectureBornee<L> => ({ lignes, tronquee: false });
  const trace = <T>(nom: string, valeur: T): T => {
    journal.lectures.push(nom);
    return valeur;
  };
  return {
    lireEmail: async () => trace("lireEmail", null),
    clientsParIdentite: async () => trace("clients", b(r.clients)),
    dossiersParFiltre: async () => trace("dossiers", b(r.dossiers)),
    dossiersParClients: async () => trace("dossiers", b(r.dossiers)),
    contratsParFiltre: async () => trace("contrats", b(r.contrats)),
    contratsParClients: async () => trace("contrats", b(r.contrats)),
    compagniesToutes: async () =>
      trace("compagnies", {
        lignes: r.compagnies,
        tronquee: (r.referentielsTronques ?? []).includes("compagnies"),
      }),
    produitsParFiltre: async () => trace("produits", b([])),
    produitsParIds: async () => trace("produits", b([])),
    documentsParFiltre: async () => trace("documents", b(r.documents)),
    ecrireAiContext: async () => {
      journal.lectures.push("INTERDIT_ecrireAiContext");
      return null;
    },
  };
}

function ecrivainSimule(
  journal: Journal,
  ligne: LigneEmailLot4,
  resultat: { lignesAffectees: number; erreur: string | null } = { lignesAffectees: 1, erreur: null },
): EcrivainLot4 & { dernier: { valeurs: Partial<Record<ChampFk, string>>; aiContext: EmailContext } | null } {
  const ecrivain = {
    dernier: null as { valeurs: Partial<Record<ChampFk, string>>; aiContext: EmailContext } | null,
    async lireEmail() {
      return ligne;
    },
    async appliquerEcritures(args: {
      valeurs: Partial<Record<ChampFk, string>>;
      aiContext: EmailContext;
    }) {
      journal.ecritures += 1;
      ecrivain.dernier = { valeurs: args.valeurs, aiContext: args.aiContext };
      return resultat;
    },
  };
  return ecrivain;
}

const ligneAvec = (contexteEmail: EmailContext): LigneEmailLot4 => ({
  id: EMAIL_ID,
  ai_context: contexteEmail,
  client_id: null,
  dossier_id: null,
  contrat_id: null,
  compagnie_id: null,
});

describe("Lot 4 — couche serveur (T-20, T-31 à T-35)", () => {
  it("écrit les FK autorisées et la trace dans une unique instruction", async () => {
    const journal: Journal = { lectures: [], ecritures: 0 };
    const ligne = ligneAvec(ctxN3());
    const ecrivain = ecrivainSimule(journal, ligne);
    const r = await autoriserEtEcrireFkEmail(EMAIL_ID, {
      lecteur: lecteurSimule(journal),
      ecrivain,
      decideLe: "2026-08-26T12:00:00.000Z",
    });
    expect(r.ecrit).toBe(true);
    expect(journal.ecritures).toBe(1);
    expect(ecrivain.dernier?.valeurs).toEqual({
      contrat_id: CONTRAT_A,
      dossier_id: DOSSIER_A,
      client_id: CLIENT_A,
      compagnie_id: COMPAGNIE_A,
    });
    expect(ecrivain.dernier?.aiContext.analyse?.statut).toBe("PROPOSED");
    expect(journal.lectures).not.toContain("INTERDIT_ecrireAiContext");
  });

  it("T-20 : échec base — rejet global, aucune FK considérée comme écrite", async () => {
    const journal: Journal = { lectures: [], ecritures: 0 };
    const ligne = ligneAvec(ctxN3());
    const r = await autoriserEtEcrireFkEmail(EMAIL_ID, {
      lecteur: lecteurSimule(journal),
      ecrivain: ecrivainSimule(journal, ligne, { lignesAffectees: 0, erreur: "violation FK" }),
    });
    expect(r.ecrit).toBe(false);
    expect(r.motif).toBe("erreur_base");
  });

  it("T-31/T-32/T-33/T-34 : garde optimiste — 0 ligne affectée vaut refus", async () => {
    const journal: Journal = { lectures: [], ecritures: 0 };
    const ligne = ligneAvec(ctxN3());
    const r = await autoriserEtEcrireFkEmail(EMAIL_ID, {
      lecteur: lecteurSimule(journal),
      ecrivain: ecrivainSimule(journal, ligne, { lignesAffectees: 0, erreur: null }),
    });
    expect(r.ecrit).toBe(false);
    expect(r.motif).toBe("garde_optimiste");
  });

  it("T-35 : retrait humain puis nouvelle tentative automatique — blocage", async () => {
    const journal: Journal = { lectures: [], ecritures: 0 };
    const ctx = contexte({
      ...ctxN3(),
      analyse: {
        statut: "PROPOSED",
        validated_by: UTILISATEUR,
        validated_at: "2026-08-26T11:30:00.000Z",
        modifications_apportees: [`humain|client_id|${CLIENT_A}|null|humain|-`],
        provenance: { source: "humain", champ: "client_id" },
      },
    });
    const r = await autoriserEtEcrireFkEmail(EMAIL_ID, {
      lecteur: lecteurSimule(journal),
      ecrivain: ecrivainSimule(journal, ligneAvec(ctx)),
      force: true,
    });
    expect(r.ecrit).toBe(false);
    expect(r.decision?.refus[0]?.motif).toBe("validation_humaine_existante");
    expect(journal.ecritures).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/* Provenance, clé K.5, absence de scoring, étanchéité                 */
/* ------------------------------------------------------------------ */

describe("Lot 4 — traçabilité et étanchéité", () => {
  it("provenance : reconstitution complète depuis ai_context", () => {
    const ctx = ctxN3();
    const d = evaluerAutorisationFk(etat(ctx), referentiel());
    const apres = contexteApresEcriture(etat(ctx), d, { decideLe: "2026-08-26T12:00:00.000Z" });
    expect(apres.analyse?.provenance).toMatchObject({
      source: "regle_deterministe",
      champ: "lot4_autorisation_fk",
      detecte_le: "2026-08-26T12:00:00.000Z",
      preuve_ids: ["L3-N3-1"],
    });
    expect(lireContexteEmail(apres)).not.toBeNull();
  });

  it("modifications_apportees : clé déterministe à 6 composantes (K.5)", () => {
    const ctx = ctxN2();
    const d = evaluerAutorisationFk(etat(ctx), referentiel());
    const cle = cleEcriture(etat(ctx), d.ecritures[0]!);
    expect(cle).toBe(`regle_deterministe|client_id|null|${CLIENT_A}|N2|L3-N2-1`);
    expect(cle.split("|")).toHaveLength(6);
    const a = contexteApresEcriture(etat(ctx), d);
    const b = contexteApresEcriture(etat(ctx), d);
    expect(a.analyse?.modifications_apportees).toEqual(b.analyse?.modifications_apportees);
    expect(a.analyse?.modifications_apportees).toContain(cle);
  });

  it("aucun CONFIRMED automatique, aucun champ JSON hors schéma 1.1.0", () => {
    const ctx = ctxN3();
    const d = evaluerAutorisationFk(etat(ctx), referentiel());
    const apres = contexteApresEcriture(etat(ctx), d);
    expect(apres.analyse?.statut).toBe("PROPOSED");
    expect(apres.schema_version).toBe("1.1.0");
    expect(lireContexteEmail(apres)).not.toBeNull();
  });

  it("preuves[].poids n'est ni lu ni écrit ; aucun score n'influence la décision", () => {
    const avecPoids = contexte({
      contrats_detectes: [
        { numero_police: "POL-123", statut: "PROPOSED", confiance: 0.1, provenance: { preuve_ids: ["L3-N3-1"] } },
      ],
      preuves: [{ ...preuve("L3-N3-1", "contrats.numero"), poids: 0.01 }],
      analyse: { statut: "PROPOSED", confiance_globale: 0.05 },
    });
    const d = evaluerAutorisationFk(etat(avecPoids), referentiel());
    expect(d.autorise).toBe(true);
    const apres = contexteApresEcriture(etat(avecPoids), d);
    expect(apres.preuves?.[0]?.poids).toBe(0.01);
  });

  it("les preuves héritées du Lot 2 ne portent jamais un niveau (C.3.2)", () => {
    const ctx = contexte({
      correspondant: { email: "claire@exemple.fr", statut: "PROPOSED", provenance: { preuve_ids: ["gemini-1"] } },
      preuves: [{ id: "gemini-1", type: "email_expediteur", extrait: "lot 2", cible: null }],
    });
    const d = evaluerAutorisationFk(etat(ctx), referentiel());
    expect(d.autorise).toBe(false);
    expect(d.refus[0]?.motif).toBe("niveau_porteur_indetermine");
    expect(niveauIndicatifPreuve("gemini-1")).toBeNull();
    expect(niveauIndicatifPreuve("L3-N3-2")).toBe("N3");
  });

  it("étanchéité : aucun INSERT/UPSERT/DELETE/RPC, aucun Gemini, aucun Gmail, aucune tâche", () => {
    const sources = [
      readFileSync("src/lib/email-fk-authorization.ts", "utf8"),
      readFileSync("src/lib/email-fk-authorization.server.ts", "utf8"),
    ].join("\n");
    for (const interdit of [
      ".insert(",
      ".upsert(",
      ".delete(",
      ".rpc(",
      "gemini",
      "gmail",
      'from("taches")',
      'from("clients")',
      'from("contrats")',
      "as any",
      "as unknown as",
      "@ts-ignore",
      "@ts-expect-error",
    ]) {
      expect(sources.toLowerCase()).not.toContain(interdit.toLowerCase());
    }
    // Unique table mutée : `crm_emails`, via un seul `.update(`.
    expect(sources.split(".update(").length - 1).toBe(1);
  });
});
