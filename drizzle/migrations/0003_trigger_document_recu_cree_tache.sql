CREATE OR REPLACE FUNCTION public.trg_document_recu_cree_tache()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.dossier_id IS NOT NULL THEN
    INSERT INTO public.taches (dossier_id, client_id, type, statut, priorite, titre)
    VALUES (
      NEW.dossier_id,
      NEW.client_id,
      'document_recu',
      'a_faire',
      'normale',
      'Document reçu : ' || NEW.file_name || ' — à qualifier'
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS document_recu_cree_tache ON public.documents;

CREATE TRIGGER document_recu_cree_tache
AFTER INSERT ON public.documents
FOR EACH ROW EXECUTE FUNCTION public.trg_document_recu_cree_tache();