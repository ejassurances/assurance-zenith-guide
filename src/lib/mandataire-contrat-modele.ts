/**
 * CONTRAT INTERNE MANDATAIRE — texte validé avec Erwan le 24/09/2026.
 * Ne pas reformuler sans nouvelle validation — même règle que pour la
 * lettre de mission et le devoir de conseil.
 *
 * Décisions actées :
 *  - RC Pro : propre à chaque mandataire (pas celle du cabinet).
 *  - Pas d'indemnité compensatoire sur la clause de non-concurrence.
 *  - Zone de non-concurrence : 30 km autour d'un point personnalisable
 *    par mandataire (mandataires_profils.zone_non_concurrence), pour 1 an
 *    après la rupture.
 *  - Préavis de résiliation : 3 mois, sauf faute du mandataire (non-
 *    respect des procédures réglementaires) qui permet une résiliation
 *    immédiate.
 */

export interface ContratMandataireVariables {
  cabinetNom: string;
  cabinetOrias: string;
  mandataireNom: string;
  tauxCommission: number | null;
  zoneNonConcurrence: string | null;
}

export function sectionsContratMandataire(v: ContratMandataireVariables): { titre: string; texte: string }[] {
  const taux = v.tauxCommission != null ? `${(v.tauxCommission * 100).toFixed(2)} %` : "[taux à préciser]";
  const zone = v.zoneNonConcurrence?.trim() || "[zone de référence à préciser dans le profil du mandataire]";

  return [
    {
      titre: "1. Objet",
      texte:
        `Le présent contrat définit les conditions dans lesquelles ${v.cabinetNom}, courtier en assurance ` +
        `immatriculé à l'ORIAS sous le numéro ${v.cabinetOrias}, confie à ${v.mandataireNom} un mandat non ` +
        `exclusif de présentation et de distribution des produits d'assurance du cabinet, en qualité de ` +
        `mandataire d'intermédiaire.`,
    },
    {
      titre: "2. Rémunération",
      texte:
        `En contrepartie, le mandataire perçoit une rétrocession de commission égale à ${taux} des ` +
        `commissions perçues par le cabinet sur les contrats qu'il apporte et gère. Cette rétrocession fait ` +
        `l'objet d'un précompte transmis périodiquement par le cabinet, que le mandataire valide avant ` +
        `facturation, selon les modalités décrites dans son espace personnel.`,
    },
    {
      titre: "3. Obligations du mandataire",
      texte:
        `Le mandataire s'engage à respecter les obligations réglementaires qui lui incombent en tant ` +
        `qu'intermédiaire en assurance : le suivi d'au moins 15 heures de formation continue par année ` +
        `civile (article L.511-2 du Code des assurances), la tenue à jour de ses pièces d'identification et ` +
        `de conformité, le respect du devoir de conseil et des procédures internes du cabinet, l'usage des ` +
        `outils mis à sa disposition conformément à ces procédures, la confidentialité des informations ` +
        `clients, et le signalement immédiat de tout changement affectant son immatriculation ORIAS ou son ` +
        `honorabilité.`,
    },
    {
      titre: "4. Assurance responsabilité civile professionnelle",
      texte:
        `Le mandataire déclare disposer, pour l'exercice de son activité, de sa propre assurance de ` +
        `responsabilité civile professionnelle, conforme aux montants réglementaires en vigueur, et ` +
        `s'engage à en justifier auprès du cabinet à chaque demande ainsi que lors du renouvellement ` +
        `annuel de son immatriculation ORIAS.`,
    },
    {
      titre: "5. Propriété du portefeuille et confidentialité",
      texte:
        `Les fichiers clients, prospects et données associées constitués dans le cadre du présent mandat ` +
        `sont la propriété du cabinet. Le mandataire s'engage à une confidentialité stricte de ces données, ` +
        `y compris après la fin du contrat, pour une durée de cinq ans.`,
    },
    {
      titre: "6. Droit de contrôle du cabinet",
      texte:
        `Le cabinet, responsable des actes de son mandataire dans le cadre du présent mandat, peut ` +
        `procéder à un audit de son activité (dossiers, respect des procédures, conformité réglementaire) ` +
        `moyennant un préavis de trente jours.`,
    },
    {
      titre: "7. Loyauté et non-concurrence",
      texte:
        `Pendant la durée du contrat, le mandataire s'interdit de représenter une compagnie ou un cabinet ` +
        `concurrent sans l'accord préalable du cabinet. Après la rupture du contrat, cette interdiction ` +
        `s'applique dans un rayon de 30 kilomètres autour de ${zone}, pour une durée d'un an. Aucune ` +
        `indemnité compensatoire n'est due au titre de cette clause.`,
    },
    {
      titre: "8. Durée et résiliation",
      texte:
        `Le présent contrat est conclu pour une durée indéterminée. Il peut être résilié par l'une ou ` +
        `l'autre des parties moyennant un préavis de trois mois, notifié par écrit. Le cabinet peut ` +
        `procéder à une résiliation immédiate, sans préavis, en cas de faute du mandataire — notamment en ` +
        `cas de non-respect des procédures réglementaires applicables à son activité.`,
    },
    {
      titre: "9. Sort des dossiers en cours",
      texte:
        `En cas de résiliation, les dossiers en cours restent gérés par le cabinet ; le mandataire perçoit ` +
        `la rétrocession des commissions déjà acquises à la date de rupture.`,
    },
  ];
}
