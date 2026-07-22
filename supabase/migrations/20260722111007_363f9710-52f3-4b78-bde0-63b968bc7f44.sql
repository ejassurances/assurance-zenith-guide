CREATE TABLE public.paiements_partenaires (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  beneficiaire_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  portee text NOT NULL CHECK (portee IN ('mandataire','prescripteur')),
  periode text NOT NULL,
  montant numeric(14,2) NOT NULL DEFAULT 0,
  moyen_paiement text,
  reference text,
  date_paiement date,
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.paiements_partenaires TO authenticated;
GRANT ALL ON public.paiements_partenaires TO service_role;

ALTER TABLE public.paiements_partenaires ENABLE ROW LEVEL SECURITY;

CREATE POLICY "paiements admin all" ON public.paiements_partenaires
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "paiements beneficiaire read" ON public.paiements_partenaires
  FOR SELECT TO authenticated
  USING (beneficiaire_id = auth.uid());

CREATE INDEX idx_paiements_beneficiaire ON public.paiements_partenaires(beneficiaire_id);
CREATE INDEX idx_paiements_periode ON public.paiements_partenaires(periode);

CREATE TRIGGER trg_paiements_updated
BEFORE UPDATE ON public.paiements_partenaires
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Ajouter policy lecture des échéances pour mandataire/prescripteur
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'contrat_echeances' AND policyname = 'Mandataire voit ses echeances'
  ) THEN
    CREATE POLICY "Mandataire voit ses echeances" ON public.contrat_echeances
      FOR SELECT TO authenticated
      USING (mandataire_id = auth.uid());
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'contrat_echeances' AND policyname = 'Prescripteur voit ses echeances'
  ) THEN
    CREATE POLICY "Prescripteur voit ses echeances" ON public.contrat_echeances
      FOR SELECT TO authenticated
      USING (prescripteur_id = auth.uid());
  END IF;
END$$;

-- Policy lecture commission_regles pour bénéficiaire concerné
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'commission_regles' AND policyname = 'Beneficiaire voit ses regles'
  ) THEN
    CREATE POLICY "Beneficiaire voit ses regles" ON public.commission_regles
      FOR SELECT TO authenticated
      USING (beneficiaire_id = auth.uid());
  END IF;
END$$;