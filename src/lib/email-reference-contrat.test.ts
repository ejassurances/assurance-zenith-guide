import { describe, expect, test } from "vitest";
import { lireReferentiel, type LecteurLot3, type LectureBornee } from "./email-context-resolver.server";
import type { EmailContext } from "./email-context-types";

const CTR_A = "11111111-1111-4111-8111-111111111111";
const CTR_B = "22222222-2222-4222-8222-222222222222";
const DOS = "33333333-3333-4333-8333-333333333333";
const CLI = "44444444-4444-4444-8444-444444444444";

const vide = <L>(): Promise<LectureBornee<L>> => Promise.resolve({ lignes: [], tronquee: false });

/** Le mail cite la référence assureur du contrat de l'assuré A uniquement. */
function contexte(reference: string): EmailContext {
  return {
    version: "1.1.0",
    dossiers_detectes: [{ reference_citee: reference }],
  } as unknown as EmailContext;
}

function lecteur(): LecteurLot3 {
  const contrats = {
    "ADH-2026-000A": {
      id: CTR_A,
      numero: null,
      client_id: CLI,
      dossier_id: DOS,
      compagnie_id: null,
      produit_id: null,
      statut: "actif",
    },
    "ADH-2026-000B": {
      id: CTR_B,
      numero: null,
      client_id: CLI,
      dossier_id: DOS,
      compagnie_id: null,
      produit_id: null,
      statut: "actif",
    },
  } as const;
  return {
    lireEmail: () => Promise.resolve(null),
    clientsParIdentite: () => vide(),
    dossiersParFiltre: () => vide(),
    dossiersParClients: () => vide(),
    contratsParFiltre: () => vide(),
    contratsParClients: () => vide(),
    contratsParReferencesExternes: (refs) =>
      Promise.resolve({
        lignes: [...refs].flatMap((r) => (r in contrats ? [contrats[r as keyof typeof contrats]] : [])),
        tronquee: false,
      }),
    compagniesToutes: () => vide(),
    produitsParFiltre: () => vide(),
    produitsParIds: () => vide(),
    documentsParFiltre: () => vide(),
    ecrireAiContext: () => Promise.resolve({ lignesAffectees: 1, erreur: null }),
  };
}

describe("référence assureur portée par le contrat individuel", () => {
  test("la référence de l'assuré A ne remonte que son contrat", async () => {
    const ref = await lireReferentiel(lecteur(), contexte("ADH-2026-000A"));
    expect(ref.contrats.map((c) => c.id)).toEqual([CTR_A]);
  });

  test("la référence de l'assuré B ne remonte jamais le contrat de A", async () => {
    const ref = await lireReferentiel(lecteur(), contexte("ADH-2026-000B"));
    expect(ref.contrats.map((c) => c.id)).toEqual([CTR_B]);
  });

  test("référence inconnue : aucun contrat candidat, le mail reste à qualifier", async () => {
    const ref = await lireReferentiel(lecteur(), contexte("ADH-INCONNUE-999"));
    expect(ref.contrats).toEqual([]);
  });

  test("référence trop courte : jamais utilisée comme preuve", async () => {
    const ref = await lireReferentiel(lecteur(), contexte("A26"));
    expect(ref.contrats).toEqual([]);
  });
});
