/**
 * Modèles de devoir de conseil par typologie d'assurance.
 *
 * Source de vérité unique : ces modèles (mentions légales fixes + zones
 * dynamiques) sont définis dans le code du projet. Aucun modèle n'est lu
 * depuis un document externe (Google Doc, Drive…) à la génération : le Drive
 * est réservé à l'archivage des PDF signés.
 */

import {
  ageDepuisDateNaissance,
  labelNiveauSoins,
  personnesAssurees,
  LIENS_ASSURE,
  POSTES_SOINS,
  REGIMES_OBLIGATOIRES,
} from "@/lib/recueil-besoins-schemas";
import type { LigneGarantie } from "@/lib/garanties-grille";



export type DevoirConseilContexte = {
  branche: string;
  clientNom?: string | null;
  compagnie?: string | null;
  produit?: string | null;
  garanties?: string | null;
  /** Grille validée du produit retenu (poste par poste) : sert aux mises en garde chiffrées. */
  garanties_detail?: LigneGarantie[] | null;
  exigences?: string | null;
  cotisation_mensuelle?: number | null;
  economie_estimee?: number | null;
};


/** Statut qualitatif d'une offre comparée (aucun score chiffré : appréciation motivée). */
export type StatutOffre = "retenue" | "equivalente" | "ecartee";

export const STATUT_OFFRE_LABEL: Record<StatutOffre, string> = {
  retenue: "Offre retenue",
  equivalente: "Équivalente — non retenue",
  ecartee: "Écartée",
};

export type OffreComparee = {
  compagnie: string;
  produit: string;
  formule?: string | null;
  cotisation_mensuelle?: number | null;
  cout_total?: number | null;
  statut: StatutOffre;
  commentaire?: string | null;
};

/** Options de décision du client (l'option C impose un motif de refus). */
export const OPTIONS_DECISION = [
  {
    code: "A",
    titre: "Option A — J'accepte la recommandation",
    texte:
      "Je reconnais avoir reçu et compris le présent devoir de conseil et j'accepte la solution recommandée par le cabinet.",
  },
  {
    code: "B",
    titre: "Option B — Je retiens une autre offre présentée",
    texte:
      "Je choisis une autre offre parmi celles présentées, en connaissance des différences de garanties et de tarif exposées ci-dessus.",
  },
  {
    code: "C",
    titre: "Option C — Je refuse la recommandation",
    texte:
      "Je refuse la solution recommandée. Conformément à l'article L. 521-4 du Code des assurances, j'indique ci-dessous le motif de mon refus (mention obligatoire).",
  },
] as const;

export type ModeleDevoirConseil = {
  branche: string;
  libelle: string;
  /** Mentions légales fixes, reprises telles quelles dans le document. */
  mentionsLegales: string[];
  /** Zones dynamiques pré-rédigées, modifiables par le staff avant envoi. */
  recommandation: (c: DevoirConseilContexte) => string;
  motifs: (c: DevoirConseilContexte) => string;
  misesEnGarde: (c: DevoirConseilContexte) => string;
  /** Exigences et besoins par défaut si le recueil ne les précise pas. */
  exigences: (c: DevoirConseilContexte) => string;
};

const MENTIONS_COMMUNES = [
  "Document remis en application des articles L. 521-1 à L. 521-6 du Code des assurances (directive distribution d'assurances — DDA).",
  "Le cabinet agit en qualité de courtier d'assurance immatriculé à l'ORIAS et soumis au contrôle de l'ACPR (4 place de Budapest, CS 92459, 75436 Paris Cedex 09).",
  "Le conseil délivré repose exclusivement sur les informations communiquées par le client lors du recueil de ses exigences et besoins. Toute information inexacte ou incomplète peut affecter la pertinence de la recommandation et les garanties du contrat.",
  "Le client reconnaît avoir reçu les documents d'information précontractuelle : document d'information sur le produit d'assurance (IPID), conditions générales, tableau de garanties et grille tarifaire.",
  "Les garanties, exclusions, franchises, plafonds et délais de carence figurant aux conditions générales et particulières du contrat prévalent sur toute présentation commerciale.",
  "Le client dispose des délais de renonciation et de rétractation prévus par la loi selon le mode de souscription et la nature du contrat.",
];

const fmtEuro = (v?: number | null) =>
  typeof v === "number" && Number.isFinite(v)
    ? new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(v)
    : null;

const offre = (c: DevoirConseilContexte) =>
  [c.compagnie, c.produit].filter(Boolean).join(" — ") || "l'offre retenue à l'issue de l'étude comparative";

const MODELES: ModeleDevoirConseil[] = [
  {
    branche: "emprunteur",
    libelle: "Assurance emprunteur",
    mentionsLegales: [
      ...MENTIONS_COMMUNES,
      "La substitution du contrat groupe bancaire par un contrat individuel s'effectue en application des articles L. 313-30 et L. 313-31 du Code de la consommation (libre choix de l'assurance emprunteur) et de la loi n° 2022-270 du 28 février 2022 (loi Lemoine).",
      "Les garanties du contrat proposé sont au moins équivalentes à celles exigées par l'établissement prêteur : la banque ne peut refuser la délégation d'assurance dès lors que l'équivalence de niveau de garanties est respectée.",
      "Le questionnaire de santé est supprimé pour les prêts dont la part assurée est inférieure ou égale à 200 000 € par assuré et dont l'échéance de remboursement intervient avant le 60e anniversaire de l'emprunteur.",
      "Trois offres au moins ont été comparées à garanties au moins équivalentes. Le classement des offres est exprimé par une appréciation qualitative motivée (offre retenue / équivalente non retenue / écartée) et non par une note chiffrée.",
      "Les coûts d'assurance indiqués sont calculés soit sur le capital initial emprunté (tarification fixe, généralement celle du contrat groupe bancaire), soit sur le capital restant dû (tarification dégressive) : la base de calcul retenue est précisée pour chaque offre présentée.",
    ],
    recommandation: (c) =>
      `Au regard de vos exigences et besoins, nous vous recommandons de souscrire ${offre(c)} en substitution de votre contrat d'assurance emprunteur actuel.` +
      (fmtEuro(c.cotisation_mensuelle) ? ` Cotisation mensuelle indicative : ${fmtEuro(c.cotisation_mensuelle)}.` : "") +
      (fmtEuro(c.economie_estimee)
        ? ` Économie estimée sur la durée résiduelle du prêt : ${fmtEuro(c.economie_estimee)}.`
        : ""),
    motifs: (c) =>
      `Cette recommandation répond point par point aux exigences et besoins que vous avez exprimés au point 1 du présent document : (i) exigence d'équivalence de niveau de garanties avec le contrat groupe de l'établissement prêteur — les garanties décès, PTIA, IPT/IPP et incapacité de travail sont couvertes avec la même quotité assurée ; (ii) exigence de réduction du coût de l'assurance — le tarif individualisé retenu est plus favorable que le tarif mutualisé de la banque sur la durée résiduelle du prêt ; (iii) exigence d'adéquation à votre situation personnelle et professionnelle telle que recueillie${c.clientNom ? ` auprès de vous (${c.clientNom})` : ""} — âge, statut tabagique, profession et modalités de remboursement ont été pris en compte. Les autres offres comparées ont été écartées ou jugées équivalentes sans avantage déterminant, pour les motifs indiqués au point 2.`,
    misesEnGarde: () =>
      "La mise en place de la délégation d'assurance est subordonnée à l'acceptation de l'équivalence de garanties par la banque et à l'acceptation du risque par l'assureur (éventuelles exclusions, surprimes ou ajournements après examen médical). Ne résiliez pas votre contrat actuel avant réception de l'accord écrit de la banque et de la prise d'effet du nouveau contrat. Les déclarations inexactes en matière de santé ou de profession peuvent entraîner la nullité du contrat (articles L. 113-8 et L. 113-9 du Code des assurances).",
    exigences: () =>
      "Réduire le coût de l'assurance de prêt à garanties au moins équivalentes, en conservant la même quotité assurée et la même couverture des risques exigés par l'établissement prêteur.",
  },
  {
    branche: "sante",
    libelle: "Complémentaire santé",
    mentionsLegales: [
      ...MENTIONS_COMMUNES,
      "Les contrats de complémentaire santé peuvent comporter des délais d'attente et des exclusions précisés aux conditions générales.",
      "Les prestations santé s'articulent avec les remboursements du régime obligatoire ; le contrat responsable respecte les plafonds et planchers réglementaires (100 % Santé).",
      "Les niveaux de remboursement sont exprimés selon le tableau de garanties du contrat (pourcentage de la base de remboursement, forfaits ou frais réels) ; les postes optique, dentaire et aides auditives sont encadrés par la réforme 100 % Santé.",
    ],
    recommandation: (c) =>
      `Au regard des personnes à couvrir, des niveaux de remboursement souhaités poste par poste et du budget mensuel que vous avez indiqué, nous vous recommandons ${offre(c)}.` +
      (c.garanties ? ` Garanties retenues : ${c.garanties}.` : "") +
      (fmtEuro(c.cotisation_mensuelle) ? ` Cotisation mensuelle : ${fmtEuro(c.cotisation_mensuelle)}.` : ""),
    motifs: () =>
      "Cette recommandation est motivée poste par poste : les niveaux de remboursement du contrat proposé (hospitalisation, soins courants, optique, dentaire, aides auditives, médecines douces) correspondent aux niveaux souhaités exprimés au point 1, pour l'ensemble des personnes à couvrir et leurs régimes obligatoires respectifs, tout en respectant le budget mensuel que vous avez choisi.",
    misesEnGarde: () =>
      "Vérifiez les délais d'attente applicables à certains postes (optique, dentaire, maternité), les plafonds annuels et les réseaux de soins partenaires. Les remboursements s'entendent dans la limite des frais réellement engagés et après intervention du régime obligatoire. Une déclaration inexacte de la situation des ayants droit peut entraîner la remise en cause des prestations.",
    exigences: () =>
      "Disposer d'une complémentaire santé couvrant l'ensemble des personnes du foyer aux niveaux de remboursement souhaités poste par poste, dans le budget mensuel choisi.",
  },
  {
    branche: "prevoyance",
    libelle: "Prévoyance",
    mentionsLegales: [
      ...MENTIONS_COMMUNES,
      "Les contrats de prévoyance comportent des délais d'attente, des franchises en arrêt de travail, des exclusions et, le cas échéant, une sélection médicale précisée aux conditions générales.",
      "Les définitions contractuelles d'incapacité, d'invalidité et de dépendance, ainsi que les modalités d'indemnisation (indemnitaire ou forfaitaire), figurent aux conditions générales.",
    ],
    recommandation: (c) =>
      `Au regard de votre situation familiale et professionnelle et de vos objectifs de protection, nous vous recommandons ${offre(c)}.` +
      (c.garanties ? ` Garanties retenues : ${c.garanties}.` : "") +
      (fmtEuro(c.cotisation_mensuelle) ? ` Cotisation mensuelle : ${fmtEuro(c.cotisation_mensuelle)}.` : ""),
    motifs: () =>
      "Cette recommandation répond au niveau de couverture recherché sur les risques prioritaires exprimés (décès, incapacité de travail, invalidité, dépendance), à la composition de votre foyer, à vos revenus, à votre régime social et au budget mensuel que vous avez indiqué.",
    misesEnGarde: () =>
      "Vérifiez les délais de carence et d'attente, les franchises en arrêt de travail, les définitions contractuelles d'incapacité et d'invalidité, ainsi que les exclusions liées aux antécédents médicaux déclarés. Une déclaration inexacte de l'état de santé peut entraîner la réduction des prestations ou la nullité du contrat.",
    exigences: () =>
      "Disposer d'une protection adaptée en cas de décès, d'arrêt de travail, d'invalidité ou de dépendance, en cohérence avec les revenus du foyer et dans le budget mensuel indiqué.",
  },
  {
    branche: "prevoyance_sante",
    libelle: "Prévoyance & Santé (ancienne branche combinée)",
    mentionsLegales: [
      ...MENTIONS_COMMUNES,
      "Les contrats de prévoyance et de complémentaire santé comportent des délais d'attente, des exclusions et, le cas échéant, une sélection médicale précisée aux conditions générales.",
      "Les prestations santé s'articulent avec les remboursements du régime obligatoire ; le contrat responsable respecte les plafonds et planchers réglementaires (100 % Santé).",
    ],
    recommandation: (c) =>
      `Au regard de votre situation et de vos objectifs de protection, nous vous recommandons ${offre(c)}.` +
      (c.garanties ? ` Garanties retenues : ${c.garanties}.` : "") +
      (fmtEuro(c.cotisation_mensuelle) ? ` Cotisation mensuelle : ${fmtEuro(c.cotisation_mensuelle)}.` : ""),
    motifs: () =>
      "Cette recommandation répond au niveau de couverture recherché sur les risques prioritaires exprimés (décès, incapacité de travail, invalidité et/ou frais de santé), à la composition de votre foyer, à votre régime social et au budget mensuel que vous avez indiqué.",
    misesEnGarde: () =>
      "Vérifiez les délais de carence et d'attente, les franchises en arrêt de travail, les définitions contractuelles d'incapacité et d'invalidité, ainsi que les exclusions liées aux antécédents médicaux déclarés. Une déclaration inexacte de l'état de santé peut entraîner la réduction des prestations ou la nullité du contrat.",
    exigences: () =>
      "Disposer d'une protection adaptée en cas de décès, d'arrêt de travail ou d'invalidité, et/ou d'une complémentaire santé couvrant les postes de dépenses prioritaires du foyer, dans le budget indiqué.",
  },

  {
    branche: "epargne_retraite",
    libelle: "Épargne & Retraite",
    mentionsLegales: [
      ...MENTIONS_COMMUNES,
      "Les supports en unités de compte présentent un risque de perte en capital : l'assureur ne garantit que le nombre d'unités de compte, et non leur valeur, qui est sujette à des fluctuations à la hausse comme à la baisse.",
      "Les performances passées ne préjugent pas des performances futures. Les frais (sur versement, de gestion, d'arbitrage) sont détaillés aux conditions générales et dans le document d'information clé.",
      "Le régime fiscal et successoral applicable est celui en vigueur à la date de la recommandation et peut évoluer.",
    ],
    recommandation: (c) =>
      `Compte tenu de votre objectif d'épargne, de votre horizon de placement et de votre profil de risque, nous vous recommandons ${offre(c)} avec l'allocation présentée en annexe.`,
    motifs: () =>
      "Cette recommandation est motivée par la cohérence entre votre horizon de placement, votre tolérance au risque, votre capacité d'épargne et l'objectif poursuivi (constitution d'un capital, préparation de la retraite ou transmission).",
    misesEnGarde: () =>
      "L'investissement sur des supports en unités de compte comporte un risque de perte en capital. Les rachats avant terme peuvent avoir des conséquences fiscales défavorables ; l'épargne d'un PER est en principe bloquée jusqu'à la retraite, hors cas de déblocage anticipé prévus par la loi.",
    exigences: () =>
      "Constituer ou faire fructifier une épargne selon l'objectif, l'horizon et le profil de risque exprimés, avec un cadre fiscal et successoral adapté à votre situation.",
  },
  {
    branche: "iard",
    libelle: "IARD (Auto / Habitation / MRP)",
    mentionsLegales: [
      ...MENTIONS_COMMUNES,
      "L'assurance de responsabilité civile est obligatoire pour tout véhicule terrestre à moteur (article L. 211-1 du Code des assurances) et pour le locataire d'un logement (article 7 de la loi n° 89-462 du 6 juillet 1989).",
      "Les indemnisations s'effectuent selon les règles contractuelles (valeur à neuf, valeur d'usage, vétusté), dans la limite des plafonds et sous déduction des franchises.",
      "La règle proportionnelle de prime peut s'appliquer en cas de déclaration inexacte du risque (article L. 113-9 du Code des assurances).",
    ],
    recommandation: (c) =>
      `Après analyse du risque à assurer et des offres du marché, nous vous recommandons ${offre(c)}.` +
      (c.garanties ? ` Garanties retenues : ${c.garanties}.` : ""),
    motifs: () =>
      "Cette recommandation est motivée par l'adéquation des garanties au risque décrit (nature et valeur du bien, usage, lieu, antécédents de sinistralité), par le niveau de franchise accepté et par le budget annuel indiqué.",
    misesEnGarde: () =>
      "Les exclusions, franchises et plafonds figurant aux conditions générales limitent l'indemnisation. Déclarez fidèlement l'usage du bien, les antécédents de sinistres et toute résiliation antérieure par un assureur : une omission peut entraîner la nullité du contrat ou une réduction d'indemnité.",
    exigences: () =>
      "Couvrir le bien décrit conformément aux obligations légales et au niveau de garanties souhaité, dans le budget annuel indiqué.",
  },
  {
    branche: "trottinette",
    libelle: "Assurance trottinette (EDPM)",
    mentionsLegales: [
      ...MENTIONS_COMMUNES,
      "Les engins de déplacement personnel motorisés (EDPM) sont assimilés à des véhicules terrestres à moteur : l'assurance de responsabilité civile est obligatoire (article L. 211-1 du Code des assurances). Le défaut d'assurance est sanctionné pénalement.",
      "La circulation d'un EDPM est encadrée par le Code de la route (vitesse limitée à 25 km/h par construction, interdiction de transporter un passager, âge minimal de 14 ans, circulation interdite sur les trottoirs).",
      "Un engin débridé ou dont la vitesse par construction dépasse 25 km/h ne relève plus du régime EDPM : il doit être homologué et assuré comme un cyclomoteur, à défaut de quoi les garanties peuvent être refusées.",
      "La garantie vol est généralement subordonnée à l'usage d'un antivol conforme aux exigences contractuelles et à la production d'un dépôt de plainte et de la facture d'achat.",
    ],
    recommandation: (c) =>
      `Pour l'engin décrit et l'usage que vous en faites, nous vous recommandons ${offre(c)}, comprenant a minima la responsabilité civile obligatoire${c.garanties ? `, ainsi que : ${c.garanties}` : ", et les garanties complémentaires adaptées à la valeur de l'engin (vol, dommages, protection du conducteur, assistance)"}.` +
      (fmtEuro(c.cotisation_mensuelle) ? ` Cotisation mensuelle : ${fmtEuro(c.cotisation_mensuelle)}.` : ""),
    motifs: () =>
      "Cette recommandation est motivée par l'obligation légale d'assurance en responsabilité civile de l'EDPM, par la valeur et l'ancienneté de l'engin déclarées, par l'usage (trajets domicile-travail, loisirs) et le lieu de stationnement indiqués, ainsi que par le niveau de franchise et le budget acceptés.",
    misesEnGarde: () =>
      "La garantie vol suppose le respect strict des conditions d'antivol et de stationnement prévues au contrat ; l'indemnisation dommages tient compte de la vétusté et de la franchise. Tout débridage de l'engin, le transport d'un passager, la circulation sur trottoir ou la conduite par une personne de moins de 14 ans constituent des manquements susceptibles d'entraîner la déchéance des garanties. Conservez la facture d'achat et le numéro de série, indispensables en cas de sinistre.",
    exigences: () =>
      "Être couvert pour la responsabilité civile obligatoire liée à l'usage de l'engin, et protéger sa valeur contre le vol et les dommages selon le budget indiqué.",
  },
];

const MODELE_GENERIQUE: ModeleDevoirConseil = {
  branche: "generique",
  libelle: "Modèle générique",
  mentionsLegales: MENTIONS_COMMUNES,
  recommandation: (c) => `Au regard de vos exigences et besoins, nous vous recommandons ${offre(c)}.`,
  motifs: () =>
    "Cette recommandation est motivée par l'adéquation des garanties du contrat proposé aux exigences et besoins que vous avez exprimés lors du recueil, ainsi qu'au budget indiqué.",
  misesEnGarde: () =>
    "Les garanties, exclusions, franchises et plafonds figurant aux conditions générales du contrat prévalent sur toute présentation commerciale. Toute déclaration inexacte peut entraîner la réduction des indemnités ou la nullité du contrat.",
  exigences: () => "Bénéficier d'une couverture adaptée à la situation décrite lors du recueil des besoins.",
};

export function modeleDevoirConseil(branche: string): ModeleDevoirConseil {
  return MODELES.find((m) => m.branche === branche) ?? MODELE_GENERIQUE;
}

/** Zones dynamiques pré-rédigées à partir du modèle de la typologie. */
/**
 * Mises en garde CHIFFRÉES issues de la grille validée du produit retenu :
 * délais de carence réels poste par poste et plafonds de prise en charge.
 * Ce bloc complète — sans remplacer — le texte réglementaire de la branche.
 */
export function misesEnGardeGrille(detail?: LigneGarantie[] | null): string {
  if (!detail || detail.length === 0) return "";
  const couvertes = detail.filter((l) => l.couverture === "oui" || l.couverture === "option");

  const carences = couvertes
    .filter((l) => l.delai_carence && l.delai_carence.trim())
    .map((l) => `${l.libelle} : ${l.delai_carence!.trim()}`);
  const plafonds = couvertes
    .filter((l) => l.plafond && l.plafond.trim())
    .map((l) => `${l.libelle} : ${l.plafond!.trim()}`);
  const franchises = couvertes
    .filter((l) => l.franchise && l.franchise.trim())
    .map((l) => `${l.libelle} : ${l.franchise!.trim()}`);
  const options = detail.filter((l) => l.couverture === "option").map((l) => l.libelle);
  const indeterminees = detail.filter((l) => l.couverture === "inconnu").map((l) => l.libelle);

  const blocs: string[] = [];
  if (carences.length > 0) {
    blocs.push(
      `Délais de carence applicables au contrat proposé (aucune prestation n'est due avant leur expiration) — ${carences.join(" ; ")}.`,
    );
  } else {
    blocs.push("Aucun délai de carence n'est mentionné pour les garanties retenues du contrat proposé.");
  }
  if (plafonds.length > 0) {
    blocs.push(`Maximum de prise en charge par poste — ${plafonds.join(" ; ")}.`);
  }
  if (franchises.length > 0) {
    blocs.push(`Franchises restant à votre charge — ${franchises.join(" ; ")}.`);
  }
  if (options.length > 0) {
    blocs.push(
      `Garanties disponibles uniquement EN OPTION (non acquises sans souscription expresse et cotisation supplémentaire) : ${options.join(" ; ")}.`,
    );
  }
  if (indeterminees.length > 0) {
    blocs.push(
      `Postes non déterminés à ce stade dans la documentation du produit, à vérifier aux conditions générales avant souscription : ${indeterminees.join(" ; ")}.`,
    );
  }
  return blocs.join("\n");
}

/** Zones dynamiques pré-rédigées à partir du modèle de la typologie. */
export function prefillDevoirConseil(c: DevoirConseilContexte) {
  const m = modeleDevoirConseil(c.branche);
  const chiffrees = misesEnGardeGrille(c.garanties_detail);
  return {
    modele: m.branche,
    mentions_legales: m.mentionsLegales,
    recommandation: m.recommandation(c),
    motifs: m.motifs(c),
    mises_en_garde: chiffrees ? `${chiffrees}\n\n${m.misesEnGarde(c)}` : m.misesEnGarde(c),
    exigences_client: c.exigences?.trim() || m.exigences(c),
  };
}


/**
 * Exigences et besoins générés automatiquement à partir du recueil des besoins.
 * Santé : postes de soins + niveaux souhaités, assurés (âges) et budget mensuel.
 * Prévoyance : risques prioritaires, foyer, revenus et budget.
 * Renvoie null si le recueil ne permet pas de rédiger d'exigences.
 */
export function exigencesDepuisRecueil(branche: string, recueil: Record<string, unknown>): string | null {
  if (branche === "sante") {
    const parts: string[] = [];

    const assures = personnesAssurees(recueil.assures);
    if (assures.length > 0) {
      const details = assures.map((p) => {
        const lien = LIENS_ASSURE.find((l) => l.value === p.lien)?.label ?? "Assuré";
        const age = ageDepuisDateNaissance(p.date_naissance);
        const regime = REGIMES_OBLIGATOIRES.find((r) => r.value === p.regime)?.label;
        return [lien, age !== null ? `${age} ans` : null, regime].filter(Boolean).join(", ");
      });
      parts.push(
        `Personnes à couvrir (${assures.length}) : ${details.join(" ; ")}.`,
      );
    }

    const postes = POSTES_SOINS.map((p) => {
      const niveau = labelNiveauSoins(recueil[`niveau_${p.key}`]);
      return niveau ? `${p.label} : niveau ${niveau.toLowerCase()}` : null;
    }).filter(Boolean) as string[];
    if (postes.length > 0) {
      parts.push(`Niveaux de remboursement souhaités poste par poste — ${postes.join(" ; ")}.`);
    }

    const budget = Number(recueil.budget_mensuel);
    if (Number.isFinite(budget) && budget > 0) {
      parts.push(`Budget mensuel choisi par le client : ${fmtEuro(budget)}.`);
    }

    const compagnieActuelle = typeof recueil.compagnie_actuelle === "string" ? recueil.compagnie_actuelle.trim() : "";
    const cotisationActuelle = Number(recueil.cotisation_actuelle);
    const motif = typeof recueil.motif_changement === "string" ? recueil.motif_changement.trim() : "";
    if (compagnieActuelle || Number.isFinite(cotisationActuelle) || motif) {
      parts.push(
        `Contrat actuel : ${[
          compagnieActuelle || null,
          Number.isFinite(cotisationActuelle) && cotisationActuelle > 0
            ? `cotisation ${fmtEuro(cotisationActuelle)} / mois`
            : null,
          motif ? `motif de changement : ${motif}` : null,
        ]
          .filter(Boolean)
          .join(", ")}.`,
      );
    }

    return parts.length > 0 ? parts.join("\n") : null;
  }

  if (branche === "prevoyance") {
    const parts: string[] = [];
    const besoins = [
      recueil.besoin_deces ? "décès (capital / rente de conjoint)" : null,
      recueil.besoin_incapacite ? "incapacité temporaire de travail (indemnités journalières)" : null,
      recueil.besoin_invalidite ? "invalidité (rente)" : null,
      recueil.besoin_dependance ? "dépendance" : null,
    ].filter(Boolean) as string[];
    if (besoins.length > 0) parts.push(`Risques à couvrir en priorité : ${besoins.join(" ; ")}.`);

    const foyer = typeof recueil.composition_foyer === "string" ? recueil.composition_foyer.trim() : "";
    if (foyer) parts.push(`Composition du foyer : ${foyer}.`);

    const revenus = Number(recueil.revenus_annuels);
    if (Number.isFinite(revenus) && revenus > 0) parts.push(`Revenus nets annuels du foyer : ${fmtEuro(revenus)}.`);

    const budget = Number(recueil.budget_mensuel);
    if (Number.isFinite(budget) && budget > 0) parts.push(`Budget mensuel envisagé : ${fmtEuro(budget)}.`);

    const objectifs = typeof recueil.objectifs === "string" ? recueil.objectifs.trim() : "";
    if (objectifs) parts.push(`Objectifs exprimés : ${objectifs}.`);

    return parts.length > 0 ? parts.join("\n") : null;
  }

  const objectifs = typeof recueil.objectifs === "string" ? recueil.objectifs.trim() : "";
  return objectifs || null;
}
