-- Fréquence de cotisation : mensuelle (défaut) ou annuelle
ALTER TABLE public.commission_bareme
  ADD COLUMN IF NOT EXISTS periodicite text NOT NULL DEFAULT 'mensuelle';
ALTER TABLE public.commission_regles
  ADD COLUMN IF NOT EXISTS periodicite text NOT NULL DEFAULT 'mensuelle';
ALTER TABLE public.commission_previsions
  ADD COLUMN IF NOT EXISTS periodicite text NOT NULL DEFAULT 'mensuelle';
ALTER TABLE public.produits
  ADD COLUMN IF NOT EXISTS periodicite_cotisation text NOT NULL DEFAULT 'mensuelle';

ALTER TABLE public.commission_bareme DROP CONSTRAINT IF EXISTS commission_bareme_periodicite_chk;
ALTER TABLE public.commission_bareme
  ADD CONSTRAINT commission_bareme_periodicite_chk CHECK (periodicite IN ('mensuelle','annuelle'));
ALTER TABLE public.commission_regles DROP CONSTRAINT IF EXISTS commission_regles_periodicite_chk;
ALTER TABLE public.commission_regles
  ADD CONSTRAINT commission_regles_periodicite_chk CHECK (periodicite IN ('mensuelle','annuelle'));
ALTER TABLE public.commission_previsions DROP CONSTRAINT IF EXISTS commission_previsions_periodicite_chk;
ALTER TABLE public.commission_previsions
  ADD CONSTRAINT commission_previsions_periodicite_chk CHECK (periodicite IN ('mensuelle','annuelle'));
ALTER TABLE public.produits DROP CONSTRAINT IF EXISTS produits_periodicite_cotisation_chk;
ALTER TABLE public.produits
  ADD CONSTRAINT produits_periodicite_cotisation_chk CHECK (periodicite_cotisation IN ('mensuelle','annuelle'));

COMMENT ON COLUMN public.commission_previsions.periodicite IS 'Cycle de la commission : mensuelle (montant_mensuel_* par mois) ou annuelle (montant par échéance annuelle).';