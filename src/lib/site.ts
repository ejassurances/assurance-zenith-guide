export const SITE = {
  name: "Valorem & Co.",
  tagline: "La clarté pour votre patrimoine, la rigueur pour vos crédits.",
  description:
    "Cabinet de courtage en assurances indépendant. Expertise en assurance emprunteur (loi Lemoine) et accompagnement des parents solos dans la transmission de leur patrimoine.",
  orias: "ORIAS n° 23000452",
  email: "contact@valorem-courtage.fr",
  phone: "+33 1 84 80 00 00",
  address: "Paris, France",
} as const;

export const NAV_LINKS = [
  { to: "/assurance-emprunteur", label: "Assurance emprunteur" },
  { to: "/parents-solos", label: "Parents solos" },
  { to: "/blog", label: "Blog" },
  { to: "/a-propos", label: "À propos" },
  { to: "/contact", label: "Contact" },
] as const;
