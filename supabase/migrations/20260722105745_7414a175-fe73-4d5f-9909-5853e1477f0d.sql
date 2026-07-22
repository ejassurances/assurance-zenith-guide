
-- =====================================================
-- 1) Extension de la table contrats
-- =====================================================
ALTER TABLE public.contrats
  ADD COLUMN IF NOT EXISTS compagnie_id uuid REFERENCES public.compagnies(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS produit_id uuid REFERENCES public.produits(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS mandataire_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS prescripteur_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS mode_commissionnement text NOT NULL DEFAULT 'lineaire',
  ADD COLUMN IF NOT EXISTS commission_cabinet_taux numeric(6,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS duree_mois integer,
  -- Champs emprunteur
  ADD COLUMN IF NOT EXISTS is_emprunteur boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS capital_initial numeric(14,2),
  ADD COLUMN IF NOT EXISTS taux_pret numeric(6,4),
  ADD COLUMN IF NOT EXISTS taux_assurance_annuel numeric(6,4),
  ADD COLUMN IF NOT EXISTS quotite numeric(5,2) DEFAULT 100,
  ADD COLUMN IF NOT EXISTS assiette text DEFAULT 'capital_initial',
  ADD COLUMN IF NOT EXISTS co_emprunteur jsonb;

-- Contraintes de valeurs
DO $$ BEGIN
  ALTER TABLE public.contrats
    ADD CONSTRAINT contrats_mode_comm_chk
    CHECK (mode_commissionnement IN ('precompte','lineaire','degressif'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.contrats
    ADD CONSTRAINT contrats_assiette_chk
    CHECK (assiette IN ('capital_initial','capital_restant_du'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_contrats_mandataire ON public.contrats(mandataire_id);
CREATE INDEX IF NOT EXISTS idx_contrats_prescripteur ON public.contrats(prescripteur_id);
CREATE INDEX IF NOT EXISTS idx_contrats_compagnie ON public.contrats(compagnie_id);

-- =====================================================
-- 2) Table commission_regles
-- =====================================================
CREATE TABLE IF NOT EXISTS public.commission_regles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portee text NOT NULL CHECK (portee IN ('mandataire','prescripteur')),
  beneficiaire_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  compagnie_id uuid REFERENCES public.compagnies(id) ON DELETE CASCADE,
  produit_id uuid REFERENCES public.produits(id) ON DELETE CASCADE,
  famille_id uuid REFERENCES public.produit_familles(id) ON DELETE CASCADE,
  assiette text NOT NULL DEFAULT 'commission_cabinet' CHECK (assiette IN ('commission_cabinet','prime_ht')),
  taux numeric(6,4) NOT NULL,
  date_effet date NOT NULL DEFAULT CURRENT_DATE,
  date_fin date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.commission_regles TO authenticated;
GRANT ALL ON public.commission_regles TO service_role;
ALTER TABLE public.commission_regles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin gère commission_regles" ON public.commission_regles
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Beneficiaire lit ses regles" ON public.commission_regles
  FOR SELECT TO authenticated
  USING (beneficiaire_id = auth.uid());

CREATE TRIGGER trg_commission_regles_updated
  BEFORE UPDATE ON public.commission_regles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_regles_beneficiaire ON public.commission_regles(beneficiaire_id);

-- =====================================================
-- 3) Table contrat_echeances
-- =====================================================
CREATE TABLE IF NOT EXISTS public.contrat_echeances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contrat_id uuid NOT NULL REFERENCES public.contrats(id) ON DELETE CASCADE,
  annee integer NOT NULL,
  date_debut_periode date NOT NULL,
  date_fin_periode date NOT NULL,
  capital_restant_du_debut numeric(14,2),
  prime_periode numeric(14,2) NOT NULL DEFAULT 0,
  commission_cabinet_periode numeric(14,2) NOT NULL DEFAULT 0,
  commission_mandataire_periode numeric(14,2) NOT NULL DEFAULT 0,
  commission_prescripteur_periode numeric(14,2) NOT NULL DEFAULT 0,
  mandataire_id uuid,
  prescripteur_id uuid,
  statut text NOT NULL DEFAULT 'previsionnel' CHECK (statut IN ('previsionnel','emise','payee','annulee')),
  bordereau_id uuid REFERENCES public.bordereaux_commissions(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (contrat_id, annee)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.contrat_echeances TO authenticated;
GRANT ALL ON public.contrat_echeances TO service_role;
ALTER TABLE public.contrat_echeances ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_ech_contrat ON public.contrat_echeances(contrat_id);
CREATE INDEX IF NOT EXISTS idx_ech_mandataire ON public.contrat_echeances(mandataire_id);
CREATE INDEX IF NOT EXISTS idx_ech_prescripteur ON public.contrat_echeances(prescripteur_id);

CREATE POLICY "Admin gère echeances" ON public.contrat_echeances
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Mandataire voit ses echeances" ON public.contrat_echeances
  FOR SELECT TO authenticated
  USING (mandataire_id = auth.uid() OR prescripteur_id = auth.uid());

CREATE POLICY "Client voit ses echeances (sans commission)" ON public.contrat_echeances
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.contrats c
    WHERE c.id = contrat_id AND c.client_id = auth.uid()
  ));

CREATE TRIGGER trg_echeances_updated
  BEFORE UPDATE ON public.contrat_echeances
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================
-- 4) Fonction : trouver la règle la plus spécifique en vigueur
-- =====================================================
CREATE OR REPLACE FUNCTION public.trouver_taux_regle(
  _beneficiaire_id uuid,
  _portee text,
  _compagnie_id uuid,
  _produit_id uuid,
  _famille_id uuid,
  _date date
) RETURNS TABLE (taux numeric, assiette text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT r.taux, r.assiette
  FROM public.commission_regles r
  WHERE r.beneficiaire_id = _beneficiaire_id
    AND r.portee = _portee
    AND (r.date_effet <= _date)
    AND (r.date_fin IS NULL OR r.date_fin >= _date)
    AND (r.produit_id IS NULL OR r.produit_id = _produit_id)
    AND (r.famille_id IS NULL OR r.famille_id = _famille_id)
    AND (r.compagnie_id IS NULL OR r.compagnie_id = _compagnie_id)
  ORDER BY
    (r.produit_id IS NOT NULL)::int DESC,
    (r.famille_id IS NOT NULL)::int DESC,
    (r.compagnie_id IS NOT NULL)::int DESC,
    r.date_effet DESC
  LIMIT 1;
$$;

-- =====================================================
-- 5) Fonction principale : recalcul des échéances
-- =====================================================
CREATE OR REPLACE FUNCTION public.recalculer_echeances_contrat(_contrat_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  c            public.contrats%ROWTYPE;
  produit_row  public.produits%ROWTYPE;
  annees       integer;
  y            integer;
  d_start      date;
  d_end        date;
  capital      numeric(14,2);
  crd_debut    numeric(14,2);
  crd_fin      numeric(14,2);
  base         numeric(14,2);
  prime        numeric(14,2);
  comm_cab     numeric(14,2);
  taux_m       numeric;
  assiette_m   text;
  taux_p       numeric;
  assiette_p   text;
  comm_m       numeric(14,2);
  comm_p       numeric(14,2);
  base_partenaire numeric(14,2);
  mensualite   numeric(14,2);
  i_mens       numeric;
  n_mens       integer;
BEGIN
  SELECT * INTO c FROM public.contrats WHERE id = _contrat_id;
  IF NOT FOUND THEN RETURN; END IF;

  DELETE FROM public.contrat_echeances WHERE contrat_id = _contrat_id;

  IF c.date_effet IS NULL THEN RETURN; END IF;

  -- durée en années
  IF c.is_emprunteur AND c.duree_mois IS NOT NULL THEN
    annees := GREATEST(1, CEIL(c.duree_mois::numeric / 12));
  ELSIF c.duree_mois IS NOT NULL THEN
    annees := GREATEST(1, CEIL(c.duree_mois::numeric / 12));
  ELSE
    annees := 1;
  END IF;

  -- Récupérer famille produit (pour trouver règle)
  IF c.produit_id IS NOT NULL THEN
    SELECT * INTO produit_row FROM public.produits WHERE id = c.produit_id;
  END IF;

  -- Calcul mensualité pour amortissement
  capital := COALESCE(c.capital_initial, 0);
  n_mens := COALESCE(c.duree_mois, annees * 12);
  IF c.is_emprunteur AND capital > 0 AND n_mens > 0 THEN
    IF COALESCE(c.taux_pret, 0) > 0 THEN
      i_mens := c.taux_pret / 12;
      mensualite := capital * i_mens / (1 - power(1 + i_mens, -n_mens));
    ELSE
      mensualite := capital / n_mens;
    END IF;
  ELSE
    mensualite := 0;
  END IF;

  crd_debut := capital;

  FOR y IN 1..annees LOOP
    d_start := (c.date_effet + ((y - 1) || ' years')::interval)::date;
    d_end   := (c.date_effet + (y || ' years')::interval - INTERVAL '1 day')::date;

    -- Recalcul du CRD en fin d'année pour l'amortissement
    IF c.is_emprunteur AND capital > 0 AND n_mens > 0 THEN
      IF COALESCE(c.taux_pret, 0) > 0 THEN
        -- CRD après k mensualités
        crd_fin := crd_debut * power(1 + i_mens, 12)
                 - mensualite * ((power(1 + i_mens, 12) - 1) / i_mens);
        IF crd_fin < 0 THEN crd_fin := 0; END IF;
      ELSE
        crd_fin := GREATEST(0, crd_debut - mensualite * 12);
      END IF;
    ELSE
      crd_fin := crd_debut;
    END IF;

    -- Prime période
    IF c.is_emprunteur AND capital > 0 THEN
      IF c.assiette = 'capital_restant_du' THEN
        base := crd_debut;
      ELSE
        base := capital;
      END IF;
      prime := base
             * COALESCE(c.taux_assurance_annuel, 0)
             * (COALESCE(c.quotite, 100) / 100.0);
    ELSE
      -- Contrat non-emprunteur : prime_annuelle constante
      IF c.mode_commissionnement = 'precompte' AND y > 1 THEN
        prime := 0;
      ELSE
        prime := COALESCE(c.prime_annuelle, 0);
      END IF;
    END IF;

    comm_cab := prime * COALESCE(c.commission_cabinet_taux, 0);

    -- Partenaires
    comm_m := 0;
    comm_p := 0;

    IF c.mandataire_id IS NOT NULL THEN
      SELECT tr.taux, tr.assiette INTO taux_m, assiette_m
      FROM public.trouver_taux_regle(
        c.mandataire_id, 'mandataire', c.compagnie_id, c.produit_id,
        produit_row.famille_id, d_start
      ) tr;
      IF taux_m IS NOT NULL THEN
        base_partenaire := CASE WHEN assiette_m = 'prime_ht' THEN prime ELSE comm_cab END;
        comm_m := base_partenaire * taux_m;
      END IF;
    END IF;

    IF c.prescripteur_id IS NOT NULL THEN
      SELECT tr.taux, tr.assiette INTO taux_p, assiette_p
      FROM public.trouver_taux_regle(
        c.prescripteur_id, 'prescripteur', c.compagnie_id, c.produit_id,
        produit_row.famille_id, d_start
      ) tr;
      IF taux_p IS NOT NULL THEN
        base_partenaire := CASE WHEN assiette_p = 'prime_ht' THEN prime ELSE comm_cab END;
        comm_p := base_partenaire * taux_p;
      END IF;
    END IF;

    INSERT INTO public.contrat_echeances (
      contrat_id, annee, date_debut_periode, date_fin_periode,
      capital_restant_du_debut, prime_periode,
      commission_cabinet_periode, commission_mandataire_periode, commission_prescripteur_periode,
      mandataire_id, prescripteur_id, statut
    ) VALUES (
      _contrat_id, y, d_start, d_end,
      crd_debut, ROUND(prime, 2),
      ROUND(comm_cab, 2), ROUND(comm_m, 2), ROUND(comm_p, 2),
      c.mandataire_id, c.prescripteur_id, 'previsionnel'
    );

    crd_debut := crd_fin;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.recalculer_echeances_contrat(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.trouver_taux_regle(uuid, text, uuid, uuid, uuid, date) TO authenticated;

-- =====================================================
-- 6) Trigger : recalcul auto après insert/update
-- =====================================================
CREATE OR REPLACE FUNCTION public.trg_recalculer_echeances()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.recalculer_echeances_contrat(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_contrats_echeances ON public.contrats;
CREATE TRIGGER trg_contrats_echeances
  AFTER INSERT OR UPDATE OF
    date_effet, duree_mois, prime_annuelle, capital_initial, taux_pret,
    taux_assurance_annuel, quotite, assiette, mode_commissionnement,
    commission_cabinet_taux, mandataire_id, prescripteur_id,
    compagnie_id, produit_id, is_emprunteur
  ON public.contrats
  FOR EACH ROW EXECUTE FUNCTION public.trg_recalculer_echeances();
