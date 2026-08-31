import { describe, expect, it } from "vitest";

import {
  blocConformite,
  blocFinance,
  blocPortefeuille,
  blocProduction,
  visionDirection,
} from "@/lib/pilotage-consolide";
import type { LigneFileSouscription } from "@/lib/souscription-file";
import type { AgregatsPortefeuille } from "@/lib/portefeuille-contrats";

const ligne = (etat: LigneFileSouscription["etat"], id: string): LigneFileSouscription => ({
  dossier_id: id,
  reference: "EJ-" + id,
  client_nom: "Client " + id,
  client_id: null,
  branche: "emprunteur",
  produit_nom: null,
  compagnie_nom: null,
  statut: "en_cours",
  etat,
  jalons: [],
  bloquants: [],
  etape_reprise: null,
  envoye_le: null,
  relances_nb: null,
});

const agregats: AgregatsPortefeuille = {
  total: 4,
  prime_annuelle_totale: 1000,
  par_etat: { echeance_proche: 1, suivi_du: 1, suivi_non_planifie: 1, a_jour: 1 },
  par_compagnie: [],
};

describe("blocProduction", () => {
  it("compte les états et le taux de dossiers prêts", () => {
    const r = blocProduction([ligne("pret", "1"), ligne("pret", "2"), ligne("bloque", "3"), ligne("transmis", "4")]);
    expect(r).toEqual({ enFile: 4, prets: 2, bloques: 1, transmis: 1, tauxPrets: 50 });
  });

  it("ne divise pas par zéro sur une file vide", () => {
    expect(blocProduction([]).tauxPrets).toBe(0);
  });
});

describe("blocPortefeuille", () => {
  it("reprend les agrégats et calcule la prime moyenne", () => {
    const r = blocPortefeuille(agregats);
    expect(r.contrats).toBe(4);
    expect(r.primeAnnuelle).toBe(1000);
    expect(r.primeMoyenne).toBe(250);
    expect(r.echeancesProches).toBe(1);
  });

  it("renvoie des zéros sans données", () => {
    expect(blocPortefeuille(null).primeMoyenne).toBe(0);
  });
});

describe("blocFinance", () => {
  it("calcule le taux de réalisation", () => {
    const r = blocFinance({ annee: 2026, encaisse: 2500, previsionnelRestant: 7500, totalAttendu: 10000 });
    expect(r.tauxRealisation).toBe(25);
    expect(r.annee).toBe(2026);
  });

  it("tolère l'absence de synthèse", () => {
    expect(blocFinance(null, 2026)).toEqual({
      annee: 2026,
      encaisse: 0,
      previsionnelRestant: 0,
      totalAttendu: 0,
      tauxRealisation: 0,
    });
  });
});

describe("blocConformite", () => {
  it("totalise les gravités", () => {
    expect(blocConformite({ critique: 2, alerte: 3, vigilance: 1 }).total).toBe(6);
  });
});

describe("visionDirection", () => {
  it("assemble les quatre blocs", () => {
    const v = visionDirection({
      file: [ligne("bloque", "1")],
      portefeuille: agregats,
      synthese: { annee: 2026, encaisse: 100, previsionnelRestant: 100, totalAttendu: 200 },
      delais: { critique: 1, alerte: 0, vigilance: 0 },
    });
    expect(v.production.bloques).toBe(1);
    expect(v.portefeuille.contrats).toBe(4);
    expect(v.finance.tauxRealisation).toBe(50);
    expect(v.conformite.critique).toBe(1);
  });
});
