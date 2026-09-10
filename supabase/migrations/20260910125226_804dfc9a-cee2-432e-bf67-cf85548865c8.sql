CREATE TABLE IF NOT EXISTS public.dossier_references_externes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  dossier_id uuid NOT NULL REFERENCES public.dossiers(id) ON DELETE CASCADE,
  compagnie_id uuid REFERENCES public.compagnies(id) ON DELETE SET NULL,
  reference text NOT NULL,
  libelle text,
  assure_rang integer,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS dossier_references_externes_unique
  ON public.dossier_references_externes (dossier_id, upper(reference));
CREATE INDEX IF NOT EXISTS dossier_references_externes_reference_idx
  ON public.dossier_references_externes (upper(reference));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dossier_references_externes TO authenticated;
GRANT ALL ON public.dossier_references_externes TO service_role;

ALTER TABLE public.dossier_references_externes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "references_externes_acces_dossier"
  ON public.dossier_references_externes
  FOR ALL
  TO authenticated
  USING (public.can_access_dossier(dossier_id))
  WITH CHECK (public.can_access_dossier(dossier_id));