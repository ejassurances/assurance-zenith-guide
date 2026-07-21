import lemoineImg from "@/assets/blog-lemoine.jpg";
import transmissionImg from "@/assets/blog-transmission.jpg";
import tauxImg from "@/assets/blog-taux.jpg";

export interface BlogPost {
  slug: string;
  title: string;
  excerpt: string;
  category: "Assurance emprunteur" | "Transmission" | "Marché";
  date: string; // ISO
  readingMinutes: number;
  image: string;
  imageAlt: string;
  content: Array<
    | { type: "p"; text: string }
    | { type: "h2"; text: string }
    | { type: "ul"; items: string[] }
    | { type: "quote"; text: string; author?: string }
  >;
  faq?: Array<{ q: string; a: string }>;
}

export const BLOG_POSTS: BlogPost[] = [
  {
    slug: "loi-lemoine-changer-assurance-emprunteur",
    title: "Loi Lemoine : ce qui change vraiment pour votre assurance emprunteur",
    excerpt:
      "Depuis 2022, la loi Lemoine vous permet de résilier votre assurance de prêt à tout moment, sans frais. Guide complet et cas pratiques.",
    category: "Assurance emprunteur",
    date: "2025-06-12",
    readingMinutes: 7,
    image: lemoineImg,
    imageAlt: "Façade haussmannienne parisienne au soleil couchant",
    content: [
      { type: "p", text: "La loi Lemoine, entrée en vigueur en juin 2022, a profondément transformé le marché de l'assurance emprunteur en France. Concrètement, tout emprunteur peut désormais changer d'assurance de prêt immobilier à tout moment, sans attendre la date anniversaire du contrat et sans frais." },
      { type: "h2", text: "Les trois apports majeurs de la loi Lemoine" },
      { type: "ul", items: [
        "Résiliation à tout moment de l'assurance emprunteur, sans motif à fournir.",
        "Suppression du questionnaire médical pour les prêts inférieurs à 200 000 € par personne, remboursés avant les 60 ans de l'emprunteur.",
        "Droit à l'oubli abaissé de 10 à 5 ans pour les anciens malades du cancer et de l'hépatite C.",
      ] },
      { type: "h2", text: "Combien pouvez-vous économiser ?" },
      { type: "p", text: "Sur un prêt immobilier de 250 000 € contracté sur 20 ans, la différence entre le contrat groupe d'une banque (souvent autour de 0,35 % du capital) et une délégation d'assurance (à partir de 0,08 % pour un profil jeune et non-fumeur) représente en moyenne 10 000 à 15 000 € d'économies sur la durée totale du crédit." },
      { type: "quote", text: "Sur nos 200 derniers dossiers, l'économie moyenne réalisée grâce à la loi Lemoine s'élève à 11 400 €.", author: "EJ Partners Assurances" },
      { type: "h2", text: "La méthode EJ Partners" },
      { type: "p", text: "Nous analysons votre contrat actuel, vérifions l'équivalence de garanties exigée par votre banque (les 18 critères CCSF), et vous proposons plusieurs alternatives comparées ligne à ligne. Nous nous chargeons ensuite de l'intégralité du dossier : envoi, suivi, avenant." },
    ],
    faq: [
      { q: "Puis-je changer d'assurance emprunteur à tout moment ?", a: "Oui, depuis le 1er septembre 2022, la loi Lemoine permet la résiliation infra-annuelle sans frais ni motif." },
      { q: "Quelles économies puis-je espérer ?", a: "En moyenne 10 000 à 15 000 € sur un prêt de 250 000 € sur 20 ans, selon votre âge, votre statut fumeur et vos garanties actuelles." },
      { q: "Ma banque peut-elle refuser ?", a: "Non, dès lors que le nouveau contrat respecte l'équivalence de garanties définie par le CCSF. La banque dispose de 10 jours ouvrés pour répondre." },
    ],
  },
  {
    slug: "coparentalite-transmission-patrimoine",
    title: "Coparentalité : protéger l'enfant et le parent social dans un projet familial pluriel",
    excerpt:
      "Parents biologiques et parents sociaux : les outils spécifiques (assurance-vie, clause bénéficiaire, prévoyance croisée, mandat de protection future) pour sécuriser l'enfant et le conjoint non-parent légal.",
    category: "Transmission",
    date: "2025-05-28",
    readingMinutes: 9,
    image: transmissionImg,
    imageAlt: "Deux couples et un enfant, moment familial serein",
    content: [
      { type: "p", text: "La coparentalité — un ou deux parents biologiques élevant un enfant avec un ou deux parents sociaux, le plus souvent leurs conjoint(e)s — est un modèle familial en pleine croissance en France. Il est particulièrement choisi par les couples homosexuels qui construisent un projet parental partagé avec un autre couple. Cette configuration, riche affectivement, appelle une ingénierie patrimoniale spécifique : le lien légal du parent social avec l'enfant n'est pas automatique, et la transmission ne se règle pas comme dans une famille «classique»." },
      { type: "h2", text: "Quatre questions à se poser avant tout" },
      { type: "ul", items: [
        "Qui est légalement parent de l'enfant — et qui ne l'est pas encore ?",
        "Comment protéger le parent social, qui reste fiscalement un tiers en l'absence d'adoption ?",
        "Que se passe-t-il pour l'enfant si l'un des parents biologiques disparaît ou devient incapable ?",
        "Comment coordonner les protections entre les deux couples pour qu'aucune faille n'existe ?",
      ] },
      { type: "h2", text: "Les outils clés" },
      { type: "p", text: "L'assurance-vie reste le pivot : sa clause bénéficiaire permet de désigner librement un parent social — sans lien de filiation — tout en profitant de l'abattement de 152 500 € par bénéficiaire en franchise de droits (versements avant 70 ans). Elle se combine avec une prévoyance croisée pour garantir un capital immédiat à chaque adulte et à l'enfant, et avec un mandat de protection future pour désigner à l'avance la personne de confiance qui prendra le relais." },
      { type: "quote", text: "Dans une coparentalité, la clause bénéficiaire n'est pas un détail : c'est ce qui, en trois lignes, corrige toute l'asymétrie que la loi impose au parent social." },
      { type: "h2", text: "Notre accompagnement" },
      { type: "p", text: "Nous cartographions les quatre patrimoines, les régimes matrimoniaux et les liens de filiation. Puis, en lien avec votre notaire et — si nécessaire — un avocat en droit de la famille (adoption simple, délégation-partage d'autorité parentale, reconnaissance conjointe anticipée), nous construisons un dispositif cohérent, révisé à chaque étape de la vie de l'enfant et de la famille." },
    ],
    faq: [
      { q: "Le parent social peut-il être bénéficiaire d'une assurance-vie ?", a: "Oui, la clause bénéficiaire d'une assurance-vie est totalement libre. Le parent social bénéficie de l'abattement de 152 500 € en franchise de droits sur les versements effectués avant les 70 ans du souscripteur — même sans lien de filiation." },
      { q: "L'adoption simple change-t-elle la fiscalité de transmission ?", a: "Oui, l'adoption simple crée un lien de filiation qui aligne la fiscalité successorale du parent social sur celle d'un parent biologique dans la plupart des cas — un levier majeur à étudier avec votre notaire." },
    ],
  },
  {
    slug: "taux-usure-assurance-emprunteur-2025",
    title: "Taux d'usure et assurance emprunteur : l'impact sur votre capacité d'emprunt",
    excerpt:
      "Le coût de l'assurance entre dans le TAEG et donc dans le calcul du taux d'usure. Comprendre ce mécanisme peut débloquer votre dossier.",
    category: "Marché",
    date: "2025-04-15",
    readingMinutes: 5,
    image: tauxImg,
    imageAlt: "Trousseau de clés sur un plan d'architecte",
    content: [
      { type: "p", text: "Le taux d'usure — plafond légal au-delà duquel une banque ne peut prêter — inclut le taux d'intérêt du crédit, les frais de dossier, la garantie, et… l'assurance emprunteur. C'est souvent cette dernière qui fait basculer un dossier au-dessus du seuil." },
      { type: "h2", text: "Le levier de la délégation d'assurance" },
      { type: "p", text: "Un contrat groupe bancaire à 0,36 % pèsera 200 à 300 points de base dans le TAEG. Une délégation externe à 0,10 % peut réduire ce poids de moitié, et faire repasser un dossier initialement refusé sous le taux d'usure." },
      { type: "h2", text: "Anticiper dès la signature" },
      { type: "p", text: "Il est possible, dès l'offre de prêt, de présenter une délégation d'assurance externe. La banque doit motiver un refus par écrit sur la seule équivalence de garanties — jamais sur le prix." },
    ],
    faq: [
      { q: "L'assurance emprunteur est-elle obligatoire ?", a: "Elle n'est pas légalement obligatoire mais est systématiquement exigée par les banques pour couvrir les risques décès, invalidité et incapacité de travail." },
      { q: "Puis-je négocier l'assurance avant la signature du prêt ?", a: "Oui, et c'est fortement recommandé. La délégation d'assurance peut être présentée dès l'offre de prêt initiale." },
    ],
  },
];

export function getPostBySlug(slug: string): BlogPost | undefined {
  return BLOG_POSTS.find((p) => p.slug === slug);
}
