ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS classification_ia jsonb,
  ADD COLUMN IF NOT EXISTS classification_le timestamptz;

COMMENT ON COLUMN public.documents.classification_ia IS 'Lot 2A CD-SI-002-A : resultat de classification documentaire IA {type_document, confidence, document_lisible, justification, anomalie, model}. Classifier != extraire : aucune donnee metier ni personnelle supplementaire.';
COMMENT ON COLUMN public.documents.classification_le IS 'Lot 2A CD-SI-002-A : horodatage de la derniere classification reussie ; NULL = jamais analyse (marqueur d idempotence).';

CREATE INDEX IF NOT EXISTS documents_classification_le_idx
  ON public.documents (classification_le)
  WHERE classification_le IS NULL;