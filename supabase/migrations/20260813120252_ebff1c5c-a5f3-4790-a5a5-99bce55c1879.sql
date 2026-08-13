-- 1) Formules de produits
CREATE TABLE public.produit_formules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  produit_id uuid NOT NULL REFERENCES public.produits(id) ON DELETE CASCADE,
  nom text NOT NULL,
  code text NOT NULL,
  ordre integer NOT NULL DEFAULT 1,
  actif boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (produit_id, code)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.produit_formules TO authenticated;
GRANT ALL ON public.produit_formules TO service_role;
ALTER TABLE public.produit_formules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff lit les formules" ON public.produit_formules FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'mandataire'));
CREATE POLICY "Admin gere les formules" ON public.produit_formules FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 2) Grille de garanties par formule
CREATE TABLE public.formule_garanties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  formule_id uuid NOT NULL REFERENCES public.produit_formules(id) ON DELETE CASCADE,
  grille_version integer NOT NULL DEFAULT 1,
  valeurs jsonb NOT NULL DEFAULT '{}'::jsonb,
  statut text NOT NULL DEFAULT 'brouillon' CHECK (statut IN ('brouillon','valide')),
  valide_par uuid,
  valide_le timestamptz,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (formule_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.formule_garanties TO authenticated;
GRANT ALL ON public.formule_garanties TO service_role;
ALTER TABLE public.formule_garanties ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff lit les garanties de formule" ON public.formule_garanties FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'mandataire'));
CREATE POLICY "Staff ecrit les garanties de formule" ON public.formule_garanties FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'mandataire'));
CREATE POLICY "Staff met a jour les garanties de formule" ON public.formule_garanties FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'mandataire'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'mandataire'));
CREATE POLICY "Admin supprime les garanties de formule" ON public.formule_garanties FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_formule_garanties_updated
  BEFORE UPDATE ON public.formule_garanties
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.trg_formule_garanties_validation_admin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.statut = 'valide' AND (TG_OP = 'INSERT' OR COALESCE(OLD.statut, '') <> 'valide') THEN
    IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'admin') THEN
      RAISE EXCEPTION 'Seul un administrateur peut valider une grille de garanties de formule';
    END IF;
    NEW.valide_par := COALESCE(NEW.valide_par, auth.uid());
    NEW.valide_le := COALESCE(NEW.valide_le, now());
  END IF;
  IF NEW.statut <> 'valide' THEN
    NEW.valide_par := NULL;
    NEW.valide_le := NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_formule_garanties_validation_admin
  BEFORE INSERT OR UPDATE ON public.formule_garanties
  FOR EACH ROW EXECUTE FUNCTION public.trg_formule_garanties_validation_admin();

-- 3) Tarifs indicatifs par formule
CREATE TABLE public.formule_tarifs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  formule_id uuid NOT NULL REFERENCES public.produit_formules(id) ON DELETE CASCADE,
  age_min integer NOT NULL DEFAULT 0,
  age_max integer NOT NULL DEFAULT 120,
  regime text CHECK (regime IS NULL OR regime IN ('salarie','tns','general')),
  cotisation_mensuelle numeric(10,2),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.formule_tarifs TO authenticated;
GRANT ALL ON public.formule_tarifs TO service_role;
ALTER TABLE public.formule_tarifs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff lit les tarifs de formule" ON public.formule_tarifs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'mandataire'));
CREATE POLICY "Admin gere les tarifs de formule" ON public.formule_tarifs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_formule_tarifs_updated
  BEFORE UPDATE ON public.formule_tarifs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4) Devis comparés par dossier
CREATE TABLE public.dossier_devis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dossier_id uuid NOT NULL REFERENCES public.dossiers(id) ON DELETE CASCADE,
  compagnie_id uuid REFERENCES public.compagnies(id) ON DELETE SET NULL,
  produit_id uuid REFERENCES public.produits(id) ON DELETE SET NULL,
  formule_id uuid REFERENCES public.produit_formules(id) ON DELETE SET NULL,
  cotisation_mensuelle numeric(10,2),
  source text NOT NULL DEFAULT 'manuel' CHECK (source IN ('manuel','api','pdf')),
  garanties_resume text,
  saisi_par uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dossier_devis TO authenticated;
GRANT ALL ON public.dossier_devis TO service_role;
ALTER TABLE public.dossier_devis ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff lit les devis du dossier" ON public.dossier_devis FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'mandataire'));
CREATE POLICY "Staff ajoute un devis" ON public.dossier_devis FOR INSERT TO authenticated
  WITH CHECK ((public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'mandataire')) AND saisi_par = auth.uid());
CREATE POLICY "Staff met a jour un devis" ON public.dossier_devis FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'mandataire'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'mandataire'));
CREATE POLICY "Staff supprime un devis" ON public.dossier_devis FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'mandataire'));

CREATE TRIGGER trg_dossier_devis_updated
  BEFORE UPDATE ON public.dossier_devis
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_produit_formules_produit ON public.produit_formules(produit_id);
CREATE INDEX idx_formule_tarifs_formule ON public.formule_tarifs(formule_id);
CREATE INDEX idx_dossier_devis_dossier ON public.dossier_devis(dossier_id);