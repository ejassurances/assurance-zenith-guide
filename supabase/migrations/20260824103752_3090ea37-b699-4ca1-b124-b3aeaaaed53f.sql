CREATE TABLE public.doc_extractions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  type_document text,
  extracted_data jsonb,
  raw_text text,
  confidence_score numeric,
  statut text NOT NULL DEFAULT 'extrait',
  erreur text,
  model text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX doc_extractions_document_id_key ON public.doc_extractions(document_id);

GRANT SELECT ON public.doc_extractions TO authenticated;
GRANT ALL ON public.doc_extractions TO service_role;

ALTER TABLE public.doc_extractions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Lecture des extractions des documents accessibles"
ON public.doc_extractions FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.documents d
    WHERE d.id = doc_extractions.document_id
      AND (
        public.has_role(auth.uid(), 'admin')
        OR (d.client_id IS NOT NULL AND public.can_access_client(d.client_id))
        OR (d.dossier_id IS NOT NULL AND public.can_access_dossier(d.dossier_id))
        OR (d.contrat_id IS NOT NULL AND public.can_access_contrat(d.contrat_id))
      )
  )
);

CREATE POLICY "Administrateurs gerent les extractions"
ON public.doc_extractions FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER doc_extractions_updated_at
BEFORE UPDATE ON public.doc_extractions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();