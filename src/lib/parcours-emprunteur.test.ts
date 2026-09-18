import { describe, expect, it } from "vitest";
import { etatEtape, type PreuvesParcours } from "./parcours-emprunteur";

const aucune: PreuvesParcours = {
  lettreMissionSignee: false,
  devisEnregistres: false,
  devoirConseilSigne: false,
  contrats: false,
};

const toutes: PreuvesParcours = {
  lettreMissionSignee: true,
  devisEnregistres: true,
  devoirConseilSigne: true,
  contrats: true,
};

describe("etatEtape", () => {
  it("marque « reprise » les étapes réglementaires sans acte archivé", () => {
    expect(etatEtape("lettre_mission", "contrat_actif", aucune)).toBe("reprise");
    expect(etatEtape("devoir_conseil", "contrat_actif", aucune)).toBe("reprise");
    expect(etatEtape("simulations", "contrat_actif", aucune)).toBe("reprise");
  });

  it("coche les étapes de saisie même sans acte", () => {
    expect(etatEtape("coordonnees", "contrat_actif", aucune)).toBe("terminee");
    expect(etatEtape("prets", "en_cours", aucune)).toBe("terminee");
  });

  it("coche les étapes réglementaires quand la preuve existe", () => {
    expect(etatEtape("lettre_mission", "contrat_actif", toutes)).toBe("terminee");
    expect(etatEtape("devoir_conseil", "contrat_actif", toutes)).toBe("terminee");
    expect(etatEtape("souscription", "contrat_actif", toutes)).toBe("terminee");
  });

  it("laisse « à faire » une étape non atteinte", () => {
    expect(etatEtape("souscription", "en_cours", toutes)).toBe("a_faire");
  });

  it("reste compatible sans preuves fournies", () => {
    expect(etatEtape("devoir_conseil", "contrat_actif", null)).toBe("terminee");
  });
});
