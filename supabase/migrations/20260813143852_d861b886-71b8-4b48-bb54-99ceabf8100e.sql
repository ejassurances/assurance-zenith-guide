ALTER TYPE public.produit_document_type ADD VALUE IF NOT EXISTS 'tableau_garanties';

CREATE TABLE public.formule_garanties_propositions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  produit_id uuid NOT NULL REFERENCES public.produits(id) ON DELETE CASCADE,
  document_id uuid REFERENCES public.produit_documents(id) ON DELETE SET NULL,
  formule_nom text NOT NULL,
  formule_id uuid REFERENCES public.produit_formules(id) ON DELETE SET NULL,
  grille_version integer NOT NULL DEFAULT 1,
  modele_ia text,
  valeurs jsonb NOT NULL DEFAULT '{}'::jsonb,
  avertissements text,
  statut text NOT NULL DEFAULT 'proposee',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  traite_par uuid,
  traite_le timestamptz,
  CONSTRAINT formule_garanties_propositions_statut_chk CHECK (statut IN ('proposee','acceptee','rejetee'))
);

CREATE INDEX idx_fgp_produit ON public.formule_garanties_propositions(produit_id, statut);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.formule_garanties_propositions TO authenticated;
GRANT ALL ON public.formule_garanties_propositions TO service_role;

ALTER TABLE public.formule_garanties_propositions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff consulte les propositions de formules"
ON public.formule_garanties_propositions FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'mandataire'));

CREATE POLICY "Staff cree une proposition de formule"
ON public.formule_garanties_propositions FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'mandataire'));

CREATE POLICY "Staff met a jour une proposition de formule"
ON public.formule_garanties_propositions FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'mandataire'))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'mandataire'));

CREATE POLICY "Admin supprime une proposition de formule"
ON public.formule_garanties_propositions FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));