CREATE TABLE public.factures_achat (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fournisseur text NOT NULL,
  tiers_id uuid REFERENCES public.tiers(id) ON DELETE SET NULL,
  numero_facture text,
  date_facture date NOT NULL DEFAULT current_date,
  date_echeance date,
  montant_ht numeric(12,2) NOT NULL DEFAULT 0,
  montant_tva numeric(12,2) NOT NULL DEFAULT 0,
  montant_ttc numeric(12,2) NOT NULL DEFAULT 0,
  compte_charge text NOT NULL DEFAULT '606800',
  compte_tva text NOT NULL DEFAULT '445660',
  statut text NOT NULL DEFAULT 'a_payer' CHECK (statut IN ('a_payer','payee','annulee')),
  date_paiement date,
  moyen_paiement text,
  notes text,
  fichier_path text,
  fichier_nom text,
  ecriture_id uuid REFERENCES public.ecritures(id) ON DELETE SET NULL,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.factures_achat TO authenticated;
GRANT ALL ON public.factures_achat TO service_role;

ALTER TABLE public.factures_achat ENABLE ROW LEVEL SECURITY;

CREATE POLICY "factures_achat_admin_all" ON public.factures_achat
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "factures_achat_mandataire_select" ON public.factures_achat
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'mandataire') AND created_by = auth.uid());

CREATE POLICY "factures_achat_mandataire_insert" ON public.factures_achat
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'mandataire') AND created_by = auth.uid());

CREATE POLICY "factures_achat_mandataire_update" ON public.factures_achat
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'mandataire') AND created_by = auth.uid())
  WITH CHECK (public.has_role(auth.uid(), 'mandataire') AND created_by = auth.uid());

CREATE POLICY "factures_achat_mandataire_delete" ON public.factures_achat
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'mandataire') AND created_by = auth.uid());

CREATE TRIGGER update_factures_achat_updated_at
  BEFORE UPDATE ON public.factures_achat
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_factures_achat_date ON public.factures_achat (date_facture DESC);
CREATE INDEX idx_factures_achat_statut ON public.factures_achat (statut);

CREATE POLICY "factures_achat_files_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'factures-achat' AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'mandataire')));

CREATE POLICY "factures_achat_files_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'factures-achat' AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'mandataire')));

CREATE POLICY "factures_achat_files_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'factures-achat' AND public.has_role(auth.uid(), 'admin'));
