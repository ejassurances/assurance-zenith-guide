import { describe, expect, it } from "vitest";
import {
  agregerPortefeuille,
  classifierContrat,
  joursRestants,
  type LigneContrat,
} from "@/lib/portefeuille-contrats";

const REF = new Date("2026-06-01T00:00:00Z");

function ligne(p: Partial<LigneContrat>): LigneContrat {
  return {
    contrat_id: p.contrat_id ?? "c1",
    numero: null,
    client_id: null,
    client_nom: null,
    produit: "Emprunteur",
    assureur: "Cardif",
    compagnie_nom: p.compagnie_nom ?? null,
    statut: "actif",
    date_effet: null,
    date_echeance: null,
    prochain_suivi_le: null,
    prime_annuelle: p.prime_annuelle ?? null,
    is_emprunteur: false,
    etat: p.etat ?? "a_jour",
    jours_avant_echeance: null,
  };
}

describe("joursRestants", () => {
  it("compte les jours entiers et gère l'absence de date", () => {
    expect(joursRestants("2026-06-11", REF)).toBe(10);
    expect(joursRestants("2026-05-22", REF)).toBe(-10);
    expect(joursRestants(null, REF)).toBeNull();
    expect(joursRestants("pas-une-date", REF)).toBeNull();
  });
});

describe("classifierContrat", () => {
  it("priorise une échéance dans les 60 jours", () => {
    const r = classifierContrat({ date_echeance: "2026-07-01", prochain_suivi_le: "2027-01-01" }, REF);
    expect(r.etat).toBe("echeance_proche");
    expect(r.jours_avant_echeance).toBe(30);
  });

  it("signale un suivi échu", () => {
    expect(
      classifierContrat({ date_echeance: "2027-01-01", prochain_suivi_le: "2026-05-01" }, REF).etat,
    ).toBe("suivi_du");
  });

  it("signale un suivi non planifié", () => {
    expect(classifierContrat({ date_echeance: null, prochain_suivi_le: null }, REF).etat).toBe(
      "suivi_non_planifie",
    );
  });

  it("classe à jour un contrat suivi et sans échéance proche", () => {
    expect(
      classifierContrat({ date_echeance: "2027-01-01", prochain_suivi_le: "2026-09-01" }, REF).etat,
    ).toBe("a_jour");
  });
});

describe("agregerPortefeuille", () => {
  it("agrège compteurs, primes et compagnies", () => {
    const a = agregerPortefeuille([
      ligne({ etat: "a_jour", prime_annuelle: 500, compagnie_nom: "Cardif" }),
      ligne({ etat: "suivi_du", prime_annuelle: 250.5, compagnie_nom: "Cardif" }),
      ligne({ etat: "echeance_proche", prime_annuelle: 900, compagnie_nom: "APRIL" }),
      ligne({ etat: "suivi_non_planifie", prime_annuelle: null }),
    ]);
    expect(a.total).toBe(4);
    expect(a.prime_annuelle_totale).toBe(1650.5);
    expect(a.par_etat).toEqual({ echeance_proche: 1, suivi_du: 1, suivi_non_planifie: 1, a_jour: 1 });
    expect(a.par_compagnie[0]).toEqual({ nom: "Cardif", nb: 2, prime: 750.5 });
    expect(a.par_compagnie.find((c) => c.nom === "Cardif")).toBeTruthy();
  });

  it("retourne un agrégat vide sans contrat", () => {
    const a = agregerPortefeuille([]);
    expect(a.total).toBe(0);
    expect(a.prime_annuelle_totale).toBe(0);
    expect(a.par_compagnie).toEqual([]);
  });
});
