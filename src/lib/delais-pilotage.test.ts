import { describe, expect, it } from "vitest";
import {
  alertesPieces,
  alertesReclamations,
  alertesSinistres,
  joursOuvresEcoules,
  pilotageDelais,
  type SinistreDelai,
} from "@/lib/delais-pilotage";

const MAINTENANT = new Date("2026-08-31T12:00:00.000Z"); // lundi
const ilYa = (jours: number) =>
  new Date(MAINTENANT.getTime() - jours * 86_400_000).toISOString();

describe("joursOuvresEcoules", () => {
  it("exclut les week-ends", () => {
    // du lundi 24/08 au lundi 31/08 : 5 jours ouvrés
    expect(joursOuvresEcoules("2026-08-24T09:00:00.000Z", MAINTENANT)).toBe(5);
  });

  it("renvoie 0 pour une date invalide", () => {
    expect(joursOuvresEcoules("pas-une-date", MAINTENANT)).toBe(0);
  });
});

describe("alertesReclamations", () => {
  it("signale un accusé de réception hors délai", () => {
    const a = alertesReclamations(
      [{ id: "r1", statut: "ouverte", date_ouverture: ilYa(30) }],
      MAINTENANT,
    );
    expect(a.some((x) => x.cle === "rec-accuse-r1" && x.gravite === "critique")).toBe(true);
  });

  it("signale une réponse hors délai de deux mois", () => {
    const a = alertesReclamations(
      [
        {
          id: "r2",
          statut: "en_cours",
          date_ouverture: ilYa(70),
          date_accuse_reception: ilYa(69),
        },
      ],
      MAINTENANT,
    );
    expect(a.map((x) => x.cle)).toContain("rec-reponse-r2");
  });

  it("ignore une réclamation close", () => {
    expect(
      alertesReclamations(
        [{ id: "r3", statut: "clos", date_ouverture: ilYa(200), date_cloture: ilYa(1) }],
        MAINTENANT,
      ),
    ).toHaveLength(0);
  });

  it("n'alerte pas une réclamation récente déjà accusée", () => {
    expect(
      alertesReclamations(
        [
          {
            id: "r4",
            statut: "ouverte",
            date_ouverture: ilYa(2),
            date_accuse_reception: ilYa(2),
          },
        ],
        MAINTENANT,
      ),
    ).toHaveLength(0);
  });
});

describe("alertesSinistres", () => {
  const base: SinistreDelai = {
    id: "s1",
    statut: "ouvert",
    declare_le: ilYa(10),
    updated_at: ilYa(1),
  };

  it("signale un sinistre non transmis à la compagnie", () => {
    const a = alertesSinistres([base], MAINTENANT);
    expect(a.map((x) => x.cle)).toContain("sin-transmission-s1");
  });

  it("signale un sinistre sans mouvement", () => {
    const a = alertesSinistres(
      [{ ...base, declare_compagnie_le: ilYa(9), updated_at: ilYa(20) }],
      MAINTENANT,
    );
    expect(a.map((x) => x.cle)).toContain("sin-sans-mouvement-s1");
  });

  it("ignore un sinistre clos", () => {
    expect(
      alertesSinistres([{ ...base, statut: "clos", clos_le: ilYa(1) }], MAINTENANT),
    ).toHaveLength(0);
  });
});

describe("alertesPieces", () => {
  const sinistres: SinistreDelai[] = [
    { id: "s1", statut: "ouvert", updated_at: ilYa(1) },
    { id: "s2", statut: "clos", clos_le: ilYa(1), updated_at: ilYa(1) },
  ];

  it("regroupe les pièces obligatoires manquantes par sinistre ouvert", () => {
    const a = alertesPieces(
      [
        { sinistre_id: "s1", libelle: "CNI", obligatoire: true, statut: "manquante" },
        { sinistre_id: "s1", libelle: "RIB", obligatoire: true, statut: "manquante" },
        { sinistre_id: "s1", libelle: "Photo", obligatoire: false, statut: "manquante" },
        { sinistre_id: "s1", libelle: "Devis", obligatoire: true, statut: "recue" },
        { sinistre_id: "s2", libelle: "CNI", obligatoire: true, statut: "manquante" },
      ],
      sinistres,
    );
    expect(a).toHaveLength(1);
    expect(a[0]!.detail).toBe("CNI, RIB");
  });
});

describe("pilotageDelais", () => {
  it("hiérarchise les alertes et compte par gravité", () => {
    const r = pilotageDelais({
      reclamations: [{ id: "r1", statut: "ouverte", date_ouverture: ilYa(90) }],
      sinistres: [{ id: "s1", statut: "ouvert", updated_at: ilYa(40) }],
      pieces: [{ sinistre_id: "s1", libelle: "CNI", obligatoire: true, statut: "manquante" }],
      maintenant: MAINTENANT,
    });
    expect(r.alertes[0]!.gravite).toBe("critique");
    expect(r.compteurs.critique).toBeGreaterThan(0);
    expect(r.compteurs.vigilance).toBe(1);
  });
});
