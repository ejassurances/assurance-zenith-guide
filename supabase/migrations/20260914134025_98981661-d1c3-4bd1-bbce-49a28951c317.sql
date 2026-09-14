UPDATE public.doc_extractions de
SET extracted_data = jsonb_set(COALESCE(de.extracted_data, '{}'::jsonb), '{cout_assurance_total}', '21553.78'::jsonb, true)
FROM public.documents doc
WHERE de.document_id = doc.id
  AND doc.dossier_id = '5bcbd62a-ef40-4649-bb44-3386bae87325'
  AND doc.id IN ('3c003a94-f7ea-4c6c-adf3-a118a6a4ed3d', '8a35b996-590d-444a-a997-08ed1a0c0a3b');

UPDATE public.dossiers
SET recueil_besoins = jsonb_set(COALESCE(recueil_besoins, '{}'::jsonb), '{assurance_banque_cout_total}', '21553.78'::jsonb, true)
WHERE id = '5bcbd62a-ef40-4649-bb44-3386bae87325';