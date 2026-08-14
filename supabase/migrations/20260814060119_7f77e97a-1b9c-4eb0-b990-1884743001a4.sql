CREATE TABLE public.commission_previsions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dossier_id uuid NOT NULL UNIQUE REFERENCES public.dossiers(id) ON DELETE CASCADE,
  contrat_id uuid REFERENCES public.contrats(id) ON DELETE SET NULL,
  branche text,
  compagnie_id uuid REFERENCES public.compagnies(id) ON DELETE SET NULL,
  montant_mensuel_estime numeric(14,2),
  mois_restants_initial integer,
  date_estimation date,
  montant_mensuel_reel numeric(14,2),
  mois_restants_actuels integer,
  montant_previsionnel_total numeric(14,2),
  statut text NOT NULL DEFAULT 'estime' CHECK (statut IN ('estime','actualise')),
  confirme_par uuid,
  confirme_le timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.commission_previsions TO authenticated;
GRANT ALL ON public.commission_previsions TO service_role;

ALTER TABLE public.commission_previsions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Cabinet gere les previsions de commission"
ON public.commission_previsions FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'mandataire'))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'mandataire'));

CREATE TRIGGER trg_commission_previsions_updated
BEFORE UPDATE ON public.commission_previsions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.trg_actualiser_prevision_commission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _dossier_id uuid;
  _prev public.commission_previsions%ROWTYPE;
  _ecoules integer;
  _restants integer;
BEGIN
  _dossier_id := NEW.dossier_id;
  IF _dossier_id IS NULL AND NEW.contrat_id IS NOT NULL THEN
    SELECT dossier_id INTO _dossier_id FROM public.contrats WHERE id = NEW.contrat_id;
  END IF;
  IF _dossier_id IS NULL THEN RETURN NEW; END IF;

  SELECT * INTO _prev FROM public.commission_previsions WHERE dossier_id = _dossier_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  IF _prev.date_estimation IS NOT NULL THEN
    _ecoules := GREATEST(0, (EXTRACT(YEAR FROM age(CURRENT_DATE, _prev.date_estimation)) * 12
                + EXTRACT(MONTH FROM age(CURRENT_DATE, _prev.date_estimation)))::integer);
  ELSE
    _ecoules := 0;
  END IF;

  IF _prev.mois_restants_initial IS NOT NULL THEN
    _restants := GREATEST(0, _prev.mois_restants_initial - _ecoules);
  ELSE
    _restants := NULL;
  END IF;

  UPDATE public.commission_previsions
     SET contrat_id = COALESCE(contrat_id, NEW.contrat_id),
         montant_mensuel_reel = NEW.montant,
         mois_restants_actuels = _restants,
         montant_previsionnel_total = CASE WHEN _restants IS NULL THEN montant_previsionnel_total
                                           ELSE ROUND(NEW.montant * _restants, 2) END,
         statut = 'actualise',
         updated_at = now()
   WHERE id = _prev.id;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_commissions_actualiser_prevision
AFTER INSERT ON public.commissions
FOR EACH ROW EXECUTE FUNCTION public.trg_actualiser_prevision_commission();