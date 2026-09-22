-- Suivi de la demande client d'échelonner les frais de courtage (= frais de
-- distribution) sur 12 mois, exprimée lors de la signature du devoir de
-- conseil. Les frais de dossier restent toujours prélevés en une fois.

ALTER TABLE public.devoirs_conseil
  ADD COLUMN IF NOT EXISTS echelonnement_demande boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS echelonnement_montant_mensuel numeric;

COMMENT ON COLUMN public.devoirs_conseil.echelonnement_demande IS
  'Le client a coché, lors de la signature, vouloir régler les frais de courtage en 12 fois plutôt qu''en une fois.';
COMMENT ON COLUMN public.devoirs_conseil.echelonnement_montant_mensuel IS
  'Montant mensuel supplémentaire (frais de courtage / 12) si echelonnement_demande est vrai — informatif pour le courtier.';
