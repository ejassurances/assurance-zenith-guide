ALTER TABLE public.commission_previsions
  DROP CONSTRAINT IF EXISTS commission_previsions_dossier_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS commission_previsions_dossier_sans_contrat_uniq
  ON public.commission_previsions (dossier_id)
  WHERE contrat_id IS NULL AND dossier_id IS NOT NULL;