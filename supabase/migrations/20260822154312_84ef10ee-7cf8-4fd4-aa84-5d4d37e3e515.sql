-- 1. Remove duplicate SELECT policy on commission_regles
DROP POLICY IF EXISTS "Beneficiaire lit ses regles" ON public.commission_regles;

-- 2. Restrict DER model documents in storage to staff roles only
DROP POLICY IF EXISTS "der_modele_read_authenticated" ON storage.objects;
CREATE POLICY "der_modele_read_staff" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'conformite-documents'
  AND (storage.foldername(name))[1] = 'der-modele'
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'mandataire'::app_role)
    OR public.has_role(auth.uid(), 'prescripteur'::app_role)
  )
);

-- 3. Prevent non-admins from altering accounting-sensitive fields on factures_achat
CREATE OR REPLACE FUNCTION public.factures_achat_protect_champs_sensibles()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN NEW;
  END IF;

  IF NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.compte_charge IS DISTINCT FROM OLD.compte_charge
     OR NEW.compte_tva IS DISTINCT FROM OLD.compte_tva
     OR NEW.ecriture_id IS DISTINCT FROM OLD.ecriture_id
     OR NEW.tiers_id IS DISTINCT FROM OLD.tiers_id
     OR NEW.fournisseur_id IS DISTINCT FROM OLD.fournisseur_id
     OR NEW.date_paiement IS DISTINCT FROM OLD.date_paiement THEN
    RAISE EXCEPTION 'Champs comptables reserves a l administration';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS factures_achat_protect_champs_sensibles ON public.factures_achat;
CREATE TRIGGER factures_achat_protect_champs_sensibles
BEFORE UPDATE ON public.factures_achat
FOR EACH ROW EXECUTE FUNCTION public.factures_achat_protect_champs_sensibles();