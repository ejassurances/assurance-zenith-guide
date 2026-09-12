ALTER TYPE public.tache_statut ADD VALUE IF NOT EXISTS 'a_qualifier';

ALTER TABLE public.taches
  ADD COLUMN IF NOT EXISTS dossier_id uuid REFERENCES public.dossiers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'interne';

CREATE INDEX IF NOT EXISTS idx_taches_dossier_id ON public.taches(dossier_id);