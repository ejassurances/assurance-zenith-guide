-- Onglets Modifier et Configuration (parcours emprunteur) : champs de pilotage
-- commercial et de gestion du prêt, absents jusqu'ici du dossier.

ALTER TABLE public.dossiers
  ADD COLUMN IF NOT EXISTS projet_type text,
  ADD COLUMN IF NOT EXISTS projet_etat text,
  ADD COLUMN IF NOT EXISTS projet_contexte text,
  ADD COLUMN IF NOT EXISTS projet_prioritaire boolean,
  ADD COLUMN IF NOT EXISTS priorite text,
  ADD COLUMN IF NOT EXISTS chance_reussite text,
  ADD COLUMN IF NOT EXISTS charge_de_projet text,
  ADD COLUMN IF NOT EXISTS date_butoir date,
  ADD COLUMN IF NOT EXISTS prime_mensuelle numeric,
  ADD COLUMN IF NOT EXISTS prime_trimestrielle numeric,
  ADD COLUMN IF NOT EXISTS prime_semestrielle numeric,
  ADD COLUMN IF NOT EXISTS prime_annuelle numeric,
  ADD COLUMN IF NOT EXISTS date_signature_pret date,
  ADD COLUMN IF NOT EXISTS frais_dossier numeric,
  ADD COLUMN IF NOT EXISTS cadre_financement text;

COMMENT ON COLUMN public.dossiers.priorite IS 'Onglet Modifier : Faible / Moyenne / Élevée';
COMMENT ON COLUMN public.dossiers.chance_reussite IS 'Onglet Modifier : Faible / Moyenne / Élevée';
COMMENT ON COLUMN public.dossiers.charge_de_projet IS 'Onglet Modifier : nom libre du collaborateur en charge';
COMMENT ON COLUMN public.dossiers.cadre_financement IS 'Onglet Configuration : Nouveau prêt / Rachat / Renégociation...';
