-- 1) Grille de garanties validée par produit
CREATE TABLE public.produit_garanties (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  produit_id uuid NOT NULL UNIQUE REFERENCES public.produits(id) ON DELETE CASCADE,
  famille_code text NOT NULL,
  grille_version integer NOT NULL DEFAULT 1,
  valeurs jsonb NOT NULL DEFAULT '{}'::jsonb,
  statut text NOT NULL DEFAULT 'brouillon' CHECK (statut IN ('brouillon','valide','a_revoir')),
  document_source_id uuid REFERENCES public.produit_documents(id) ON DELETE SET NULL,
  valide_par uuid REFERENCES auth.users(id),
  valide_le timestamp with time zone,
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.produit_garanties TO authenticated;
GRANT ALL ON public.produit_garanties TO service_role;
ALTER TABLE public.produit_garanties ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff consulte les grilles de garanties"
ON public.produit_garanties FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'mandataire'));

CREATE POLICY "Staff cree une grille de garanties"
ON public.produit_garanties FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'mandataire'));

CREATE POLICY "Staff met a jour une grille de garanties"
ON public.produit_garanties FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'mandataire'))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'mandataire'));

CREATE POLICY "Admin supprime une grille de garanties"
ON public.produit_garanties FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_produit_garanties_updated_at
BEFORE UPDATE ON public.produit_garanties
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seul un admin peut valider une grille : traçabilité de la validation humaine
CREATE OR REPLACE FUNCTION public.trg_garanties_validation_admin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.statut = 'valide' AND (TG_OP = 'INSERT' OR COALESCE(OLD.statut, '') <> 'valide') THEN
    IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'admin') THEN
      RAISE EXCEPTION 'Seul un administrateur peut valider une grille de garanties';
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

CREATE TRIGGER trg_garanties_validation_admin
BEFORE INSERT OR UPDATE ON public.produit_garanties
FOR EACH ROW EXECUTE FUNCTION public.trg_garanties_validation_admin();

-- 2) Propositions issues de l'extraction automatique (jamais utilisables en production)
CREATE TABLE public.produit_garanties_propositions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  produit_id uuid NOT NULL REFERENCES public.produits(id) ON DELETE CASCADE,
  document_id uuid REFERENCES public.produit_documents(id) ON DELETE SET NULL,
  famille_code text NOT NULL,
  grille_version integer NOT NULL DEFAULT 1,
  modele_ia text,
  valeurs jsonb NOT NULL DEFAULT '{}'::jsonb,
  avertissements text,
  statut text NOT NULL DEFAULT 'proposee' CHECK (statut IN ('proposee','acceptee','rejetee')),
  traite_par uuid REFERENCES auth.users(id),
  traite_le timestamp with time zone,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_garanties_propositions_produit ON public.produit_garanties_propositions(produit_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.produit_garanties_propositions TO authenticated;
GRANT ALL ON public.produit_garanties_propositions TO service_role;
ALTER TABLE public.produit_garanties_propositions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff consulte les propositions de garanties"
ON public.produit_garanties_propositions FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'mandataire'));

CREATE POLICY "Staff cree une proposition de garanties"
ON public.produit_garanties_propositions FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'mandataire'));

CREATE POLICY "Staff met a jour une proposition de garanties"
ON public.produit_garanties_propositions FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'mandataire'))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'mandataire'));

CREATE POLICY "Admin supprime une proposition de garanties"
ON public.produit_garanties_propositions FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_garanties_propositions_updated_at
BEFORE UPDATE ON public.produit_garanties_propositions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) Vente couplée : produit ou famille requis sur la fiche produit
ALTER TABLE public.produits
  ADD COLUMN produit_requis_id uuid REFERENCES public.produits(id) ON DELETE SET NULL,
  ADD COLUMN famille_requise_id uuid REFERENCES public.produit_familles(id) ON DELETE SET NULL,
  ADD COLUMN couplage_message text;

-- 4) Blocage strict : pas de devoir de conseil sans grille de garanties validée
CREATE OR REPLACE FUNCTION public.trg_bloquer_devoir_sans_grille()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _produit_id uuid;
  _produit_nom text;
  _statut text;
BEGIN
  SELECT d.produit_id INTO _produit_id FROM public.dossiers d WHERE d.id = NEW.dossier_id;
  IF _produit_id IS NULL THEN
    RAISE EXCEPTION 'Aucun produit retenu sur le dossier : sélectionnez la compagnie et le produit avant de générer le devoir de conseil.';
  END IF;

  SELECT p.nom INTO _produit_nom FROM public.produits p WHERE p.id = _produit_id;
  SELECT g.statut INTO _statut FROM public.produit_garanties g WHERE g.produit_id = _produit_id;

  IF _statut IS DISTINCT FROM 'valide' THEN
    RAISE EXCEPTION 'Grille de garanties non validée pour le produit « % » : la génération du devoir de conseil est bloquée jusqu''à validation humaine de la grille.', COALESCE(_produit_nom, _produit_id::text);
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_bloquer_devoir_sans_grille
BEFORE INSERT OR UPDATE OF contenu, statut ON public.devoirs_conseil
FOR EACH ROW EXECUTE FUNCTION public.trg_bloquer_devoir_sans_grille();

-- 5) Blocage strict : vente couplée obligatoire sur les contrats
CREATE OR REPLACE FUNCTION public.trg_bloquer_contrat_couplage()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _requis_id uuid;
  _famille_requise uuid;
  _msg text;
  _nom text;
  _requis_nom text;
  _famille_nom text;
  _ok boolean;
BEGIN
  IF NEW.produit_id IS NULL THEN RETURN NEW; END IF;

  SELECT p.produit_requis_id, p.famille_requise_id, p.couplage_message, p.nom
    INTO _requis_id, _famille_requise, _msg, _nom
  FROM public.produits p WHERE p.id = NEW.produit_id;

  IF _requis_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.contrats c
      WHERE c.client_id = NEW.client_id
        AND c.produit_id = _requis_id
        AND c.id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
        AND c.statut NOT IN ('resilie', 'annule')
    ) INTO _ok;
    IF NOT _ok THEN
      SELECT nom INTO _requis_nom FROM public.produits WHERE id = _requis_id;
      RAISE EXCEPTION 'Vente couplée : le produit « % » ne peut pas être souscrit seul, le produit « % » doit déjà être en place chez ce client. %',
        _nom, COALESCE(_requis_nom, 'requis'), COALESCE(_msg, '');
    END IF;
  END IF;

  IF _famille_requise IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.contrats c
      JOIN public.produits p2 ON p2.id = c.produit_id
      WHERE c.client_id = NEW.client_id
        AND p2.famille_id = _famille_requise
        AND c.id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
        AND c.statut NOT IN ('resilie', 'annule')
    ) INTO _ok;
    IF NOT _ok THEN
      SELECT nom INTO _famille_nom FROM public.produit_familles WHERE id = _famille_requise;
      RAISE EXCEPTION 'Vente couplée : le produit « % » exige un contrat actif de la famille « % » chez ce client. %',
        _nom, COALESCE(_famille_nom, 'requise'), COALESCE(_msg, '');
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_bloquer_contrat_couplage
BEFORE INSERT OR UPDATE OF produit_id, client_id ON public.contrats
FOR EACH ROW EXECUTE FUNCTION public.trg_bloquer_contrat_couplage();

REVOKE EXECUTE ON FUNCTION public.trg_garanties_validation_admin() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.trg_bloquer_devoir_sans_grille() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.trg_bloquer_contrat_couplage() FROM PUBLIC, anon;
