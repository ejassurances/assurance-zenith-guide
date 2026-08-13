ALTER TABLE public.der_modele
  ADD COLUMN IF NOT EXISTS statut text NOT NULL DEFAULT 'brouillon',
  ADD COLUMN IF NOT EXISTS contenu jsonb,
  ADD COLUMN IF NOT EXISTS valide_par uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS valide_le timestamptz,
  ADD COLUMN IF NOT EXISTS obsolete boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS obsolete_motif text,
  ADD COLUMN IF NOT EXISTS obsolete_le timestamptz;

ALTER TABLE public.der_modele ALTER COLUMN storage_path DROP NOT NULL;

UPDATE public.der_modele SET statut = 'valide_actif' WHERE actif = true AND statut = 'brouillon';

CREATE OR REPLACE FUNCTION public.trg_der_marquer_obsolete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  motif text;
BEGIN
  IF TG_TABLE_NAME = 'compagnies' THEN
    motif := 'Changement de statut de la compagnie ' || COALESCE(NEW.nom, '') || ' (' || OLD.statut || ' -> ' || NEW.statut || ')';
  ELSE
    motif := 'Changement de statut du produit ' || COALESCE(NEW.nom, '') || ' (' || OLD.statut || ' -> ' || NEW.statut || ')';
  END IF;

  UPDATE public.der_modele
     SET obsolete = true,
         obsolete_motif = motif,
         obsolete_le = now(),
         updated_at = now()
   WHERE actif = true AND obsolete = false;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS der_obsolete_compagnies ON public.compagnies;
CREATE TRIGGER der_obsolete_compagnies
AFTER UPDATE OF statut ON public.compagnies
FOR EACH ROW
WHEN (OLD.statut IS DISTINCT FROM NEW.statut)
EXECUTE FUNCTION public.trg_der_marquer_obsolete();

DROP TRIGGER IF EXISTS der_obsolete_produits ON public.produits;
CREATE TRIGGER der_obsolete_produits
AFTER UPDATE OF statut ON public.produits
FOR EACH ROW
WHEN (OLD.statut IS DISTINCT FROM NEW.statut)
EXECUTE FUNCTION public.trg_der_marquer_obsolete();