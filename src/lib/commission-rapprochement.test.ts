import { describe, expect, it } from "vitest";
import {
  montantAttenduMensuel,
  rapprocherMois,
  totauxRapprochement,
  type CommissionRecue,
  type ContratRapprochement,
  type PrevisionRapprochement,
} from "@/lib/commission-rapprochement";

const contrat = (over: Partial<ContratRapprochement> = {}): ContratRapprochement => ({
  id: "k1",
  numero: "C-1",
  assureur: "Cardif",
  produit: "Emprunteur",
  statut: "actif",
  date_effet: "2026-03-01",
  client_nom: "DUPONT",
  ...over,
});

const prev = (over: Partial<PrevisionRapprochement> = {}): PrevisionRapprochement => ({
  contrat_id: "k1",
  branche: "emprunteur",
  montant_mensuel_estime: 100,
  montant_mensuel_reel: null,
  periodicite: "mensuelle",
  reduction_courtage_pct: null,
  statut: "estimee",
  ...over,
});

const recue = (over: Partial<CommissionRecue> = {}): CommissionRecue => ({
  contrat_id: "k1",
  montant: 100,
  statut: "versee",
  date_versement: "2026-08-10",
  ...over,
});

describe("montantAttenduMensuel", () => {
  it("préfère le montant réel et applique la réduction de courtage", () => {
    expect(montantAttenduMensuel(prev({ montant_mensuel_reel: 200, reduction_courtage_pct: 10 }))).toBe(180);
  });
  it("renvoie 0 sans montant", () => {
    expect(montantAttenduMensuel(prev({ montant_mensuel_estime: null }))).toBe(0);
  });
});

describe("rapprocherMois", () => {
  const base = { mois: "2026-08", contrats: [contrat()] };

  it("signale une commission manquante", () => {
    const [l] = rapprocherMois({ ...base, previsions: [prev()], commissions: [] });
    expect(l.categorie).toBe("manquante");
    expect(l.attendu).toBe(100);
  });

  it("considère conforme un écart d'arrondi", () => {
    const [l] = rapprocherMois({ ...base, previsions: [prev()], commissions: [recue({ montant: 100.5 })] });
    expect(l.categorie).toBe("conforme");
  });

  it("détecte une sous-perception", () => {
    const [l] = rapprocherMois({ ...base, previsions: [prev()], commissions: [recue({ montant: 60 })] });
    expect(l.categorie).toBe("sous_percue");
    expect(l.ecart).toBe(-40);
  });

  it("ignore les commissions annulées et les autres mois", () => {
    const [l] = rapprocherMois({
      ...base,
      previsions: [prev()],
      commissions: [recue({ statut: "annulee" }), recue({ date_versement: "2026-07-10" })],
    });
    expect(l.recu).toBe(0);
  });

  it("n'attend une commission annuelle que sur le mois anniversaire", () => {
    const lignes = rapprocherMois({ ...base, previsions: [prev({ periodicite: "annuelle" })], commissions: [] });
    expect(lignes).toHaveLength(0);
    const aout = rapprocherMois({
      mois: "2026-08",
      contrats: [contrat({ date_effet: "2025-08-01" })],
      previsions: [prev({ periodicite: "annuelle" })],
      commissions: [],
    });
    expect(aout[0].categorie).toBe("manquante");
  });

  it("remonte une commission reçue sans prévisionnel", () => {
    const [l] = rapprocherMois({ ...base, previsions: [], commissions: [recue({ contrat_id: "k9", montant: 50 })] });
    expect(l.categorie).toBe("sur_percue");
    expect(l.attendu).toBe(0);
  });

  it("calcule les totaux", () => {
    const lignes = rapprocherMois({ ...base, previsions: [prev()], commissions: [recue({ montant: 40 })] });
    const t = totauxRapprochement(lignes);
    expect(t.attendu).toBe(100);
    expect(t.recu).toBe(40);
    expect(t.manquant).toBe(60);
    expect(t.nbEcarts).toBe(1);
  });
});
