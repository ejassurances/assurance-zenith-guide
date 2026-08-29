import { describe, expect, it } from "vitest";
import {
  DELAI_REPONSE_MINUTES,
  dansHeuresOuverture,
  prochaineOuverture,
  prochaineSortieAutorisee,
} from "@/lib/heures-ouverture";

describe("heures d'ouverture et délai métier", () => {
  it("reconnaît les heures d'ouverture (Paris)", () => {
    // Mardi 14 janvier 2025, 10h00 Paris = 09h00 UTC
    expect(dansHeuresOuverture(new Date("2025-01-14T09:00:00Z"))).toBe(true);
    // Mardi 14 janvier 2025, 07h00 Paris
    expect(dansHeuresOuverture(new Date("2025-01-14T06:00:00Z"))).toBe(false);
    // Samedi 18 janvier 2025, 10h00 Paris
    expect(dansHeuresOuverture(new Date("2025-01-18T09:00:00Z"))).toBe(false);
  });

  it("reporte à la prochaine ouverture", () => {
    const samedi = new Date("2025-01-18T09:00:00Z");
    const suite = prochaineOuverture(samedi);
    expect(dansHeuresOuverture(suite)).toBe(true);
    expect(suite.getTime()).toBeGreaterThan(samedi.getTime());
  });

  it("respecte le délai métier de 45 minutes", () => {
    const maintenant = new Date("2025-01-14T09:00:00Z"); // mardi 10h Paris
    const sortie = prochaineSortieAutorisee(maintenant, maintenant);
    expect(sortie.getTime() - maintenant.getTime()).toBeGreaterThanOrEqual(DELAI_REPONSE_MINUTES * 60000);
    expect(dansHeuresOuverture(sortie)).toBe(true);
  });

  it("reporte une réception du soir au lendemain matin", () => {
    const soir = new Date("2025-01-14T18:30:00Z"); // 19h30 Paris
    const sortie = prochaineSortieAutorisee(soir, soir);
    expect(dansHeuresOuverture(sortie)).toBe(true);
    expect(sortie.getTime()).toBeGreaterThan(soir.getTime());
  });
});
