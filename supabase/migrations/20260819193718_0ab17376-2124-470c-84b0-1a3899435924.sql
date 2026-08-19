ALTER TABLE public.dossier_devis
  ADD COLUMN IF NOT EXISTS type_cotisation text,
  ADD COLUMN IF NOT EXISTS cotisation_min numeric,
  ADD COLUMN IF NOT EXISTS cotisation_max numeric,
  ADD COLUMN IF NOT EXISTS montant_total_saisi numeric;

ALTER TABLE public.dossier_devis
  DROP CONSTRAINT IF EXISTS dossier_devis_type_cotisation_check;
ALTER TABLE public.dossier_devis
  ADD CONSTRAINT dossier_devis_type_cotisation_check
  CHECK (type_cotisation IS NULL OR type_cotisation IN ('CI', 'CRD'));

UPDATE public.dossier_devis
SET montant_total_saisi = 8504.32,
    cotisation_mensuelle = NULL
WHERE id = '7190de46-ae85-42d1-adc1-051b119cae52';