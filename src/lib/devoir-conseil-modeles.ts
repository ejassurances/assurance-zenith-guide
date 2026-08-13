/**
 * Modèles de devoir de conseil par typologie d'assurance.
 *
 * Source de vérité unique : ces modèles (mentions légales fixes + zones
 * dynamiques) sont définis dans le code du projet. Aucun modèle n'est lu
 * depuis un document externe (Google Doc, Drive…) à la génération : le Drive
 * est réservé à l'archivage des PDF signés.
 */

export type DevoirConseilContexte = {
  branche: string;
  clientNom?: string | null;
  compagnie?: string | null;
  produit?: string | null;
  garanties?: string | null;
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
      `Cette recommandation est motivée par l'équivalence de niveau de garanties avec le contrat groupe de l'établissement prêteur (décès, PTIA, IPT/IPP et incapacité de travail avec la même quotité assurée), par un tarif individualisé plus favorable que le tarif mutualisé de la banque, et par l'adéquation du contrat à votre situation personnelle et professionnelle telle que recueillie${c.clientNom ? ` auprès de vous (${c.clientNom})` : ""}.`,
    misesEnGarde: () =>
      "La mise en place de la délégation d'assurance est subordonnée à l'acceptation de l'équivalence de garanties par la banque et à l'acceptation du risque par l'assureur (éventuelles exclusions, surprimes ou ajournements après examen médical). Ne résiliez pas votre contrat actuel avant réception de l'accord écrit de la banque et de la prise d'effet du nouveau contrat. Les déclarations inexactes en matière de santé ou de profession peuvent entraîner la nullité du contrat (articles L. 113-8 et L. 113-9 du Code des assurances).",
    exigences: () =>
      "Réduire le coût de l'assurance de prêt à garanties au moins équivalentes, en conservant la même quotité assurée et la même couverture des risques exigés par l'établissement prêteur.",
  },
  {
    branche: "prevoyance_sante",
    libelle: "Prévoyance & Santé",
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
export function prefillDevoirConseil(c: DevoirConseilContexte) {
  const m = modeleDevoirConseil(c.branche);
  return {
    modele: m.branche,
    mentions_legales: m.mentionsLegales,
    recommandation: m.recommandation(c),
    motifs: m.motifs(c),
    mises_en_garde: m.misesEnGarde(c),
    exigences_client: c.exigences?.trim() || m.exigences(c),
  };
}
