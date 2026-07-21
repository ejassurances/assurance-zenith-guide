export const SITE = {
  name: "EJ Partners Assurances",
  shortName: "EJ Partners",
  tagline: "La clarté pour votre patrimoine, la rigueur pour vos crédits.",
  description:
    "EJ Partners Assurances — Cabinet de courtage en assurances indépendant. Expertise en assurance emprunteur (loi Lemoine) et accompagnement des familles en coparentalité (parents biologiques et parents sociaux) dans la transmission de leur patrimoine.",
  orias: "ORIAS n° 25005811",
  siret: "500 256 904",
  email: "contact@ej-assurances.fr",
  phone: "01 89 31 40 29",
  address: "71 Rue du Docteur Roux, 95600 Eaubonne",
} as const;

export const NAV_LINKS = [
  { to: "/assurance-emprunteur", label: "Assurance emprunteur" },
  { to: "/coparentalite", label: "Coparentalité" },
  { to: "/blog", label: "Blog" },
  { to: "/a-propos", label: "À propos" },
  { to: "/contact", label: "Contact" },
] as const;
