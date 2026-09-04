ALTER TABLE public.dossier_devis
  ADD COLUMN IF NOT EXISTS document_id uuid REFERENCES public.documents(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS dossier_devis_document_id_idx ON public.dossier_devis(document_id);