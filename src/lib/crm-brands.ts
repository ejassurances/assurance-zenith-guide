/* Référentiel CRM : marques d'origine, besoins, statut DDA */

export type MarqueKey = "ej_assurances" | "ej_coparentalite";

export const MARQUES: Record<
  MarqueKey,
  { label: string; short: string; badge: string; dot: string }
> = {
  ej_assurances: {
    label: "EJ Assurances",
    short: "EJ Assurances",
    badge: "border-[color:var(--crm-brand-blue)]/30 bg-[color:var(--crm-brand-blue)]/10 text-[color:var(--crm-brand-blue)]",
    dot: "bg-[color:var(--crm-brand-blue)]",
  },
  ej_coparentalite: {
    label: "EJ Partners — Coparentalité",
    short: "Coparentalité",
    badge:
      "border-[color:var(--crm-brand-sage)]/35 bg-[color:var(--crm-brand-sage)]/12 text-[color:var(--crm-brand-sage)]",
    dot: "bg-[color:var(--crm-brand-sage)]",
  },
};

export const MARQUE_KEYS = Object.keys(MARQUES) as MarqueKey[];

export function marque(value: string | null | undefined) {
  return MARQUES[(value as MarqueKey) ?? "ej_assurances"] ?? MARQUES.ej_assurances;
}

export const BESOINS: { key: string; label: string }[] = [
  { key: "sante", label: "Santé" },
  { key: "prevoyance", label: "Prévoyance" },
  { key: "emprunteur", label: "Emprunteur" },
  { key: "mrp", label: "MRP (multirisque pro)" },
  { key: "mrh", label: "Habitation" },
  { key: "auto", label: "Auto" },
  { key: "epargne_retraite", label: "Épargne / Retraite" },
  { key: "rc_pro", label: "RC Pro" },
  { key: "obseques", label: "Obsèques" },
  { key: "transmission", label: "Transmission de patrimoine" },
];

export function besoinLabel(key: string) {
  return BESOINS.find((b) => b.key === key)?.label ?? key;
}

export const DDA_STATUTS: { key: string; label: string; badge: string }[] = [
  { key: "a_faire", label: "DDA à réaliser", badge: "bg-red-100 text-red-900 border-red-200" },
  { key: "en_cours", label: "DDA en cours", badge: "bg-amber-100 text-amber-900 border-amber-200" },
  { key: "envoye", label: "DDA envoyée", badge: "bg-sky-100 text-sky-900 border-sky-200" },
  { key: "signe", label: "DDA signée", badge: "bg-emerald-100 text-emerald-900 border-emerald-200" },
];

export function ddaStatut(key: string | null | undefined) {
  return DDA_STATUTS.find((d) => d.key === (key ?? "a_faire")) ?? DDA_STATUTS[0]!;
}
