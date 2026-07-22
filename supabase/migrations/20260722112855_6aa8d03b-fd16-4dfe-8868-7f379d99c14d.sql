
-- =========================================
-- LOT 1 COMPTABILITE : FONDATIONS
-- =========================================

-- Plan comptable general
CREATE TABLE public.plan_comptable (
  numero TEXT PRIMARY KEY,
  libelle TEXT NOT NULL,
  classe SMALLINT NOT NULL CHECK (classe BETWEEN 1 AND 7),
  type TEXT NOT NULL CHECK (type IN ('actif','passif','charge','produit','neutre')),
  parent_numero TEXT REFERENCES public.plan_comptable(numero) ON DELETE SET NULL,
  actif BOOLEAN NOT NULL DEFAULT true,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.plan_comptable TO authenticated;
GRANT ALL ON public.plan_comptable TO service_role;
ALTER TABLE public.plan_comptable ENABLE ROW LEVEL SECURITY;
CREATE POLICY "PCG lisible par tous les utilisateurs" ON public.plan_comptable
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "PCG modifiable par admin" ON public.plan_comptable
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Journaux
CREATE TABLE public.journaux (
  code TEXT PRIMARY KEY,
  libelle TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('achats','ventes','banque','caisse','od','ndf')),
  compte_contrepartie TEXT REFERENCES public.plan_comptable(numero),
  actif BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.journaux TO authenticated;
GRANT ALL ON public.journaux TO service_role;
ALTER TABLE public.journaux ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Journaux lisibles par tous" ON public.journaux
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Journaux modifiables par admin" ON public.journaux
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Exercices
CREATE TABLE public.exercices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  libelle TEXT NOT NULL,
  date_debut DATE NOT NULL,
  date_fin DATE NOT NULL,
  cloture BOOLEAN NOT NULL DEFAULT false,
  cloture_le TIMESTAMPTZ,
  cloture_par UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (date_fin > date_debut)
);
GRANT SELECT ON public.exercices TO authenticated;
GRANT ALL ON public.exercices TO service_role;
ALTER TABLE public.exercices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Exercices lisibles par tous" ON public.exercices
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Exercices modifiables par admin" ON public.exercices
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Tiers
CREATE TABLE public.tiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nom TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('fournisseur','client','autre')),
  siret TEXT,
  numero_tva TEXT,
  adresse TEXT,
  code_postal TEXT,
  ville TEXT,
  email TEXT,
  telephone TEXT,
  compte_auxiliaire TEXT,
  iban TEXT,
  actif BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tiers TO authenticated;
GRANT ALL ON public.tiers TO service_role;
ALTER TABLE public.tiers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tiers admin acces total" ON public.tiers
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Tiers lecture mandataire" ON public.tiers
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'mandataire'));

-- Ecritures
CREATE TABLE public.ecritures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exercice_id UUID NOT NULL REFERENCES public.exercices(id) ON DELETE RESTRICT,
  journal_code TEXT NOT NULL REFERENCES public.journaux(code) ON DELETE RESTRICT,
  date_ecriture DATE NOT NULL,
  numero_piece TEXT,
  libelle TEXT NOT NULL,
  reference_externe TEXT,
  mandataire_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  statut TEXT NOT NULL DEFAULT 'brouillon' CHECK (statut IN ('brouillon','valide','cloture')),
  source TEXT DEFAULT 'manuel',
  source_id UUID,
  created_by UUID DEFAULT auth.uid() REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_ecritures_exercice ON public.ecritures(exercice_id);
CREATE INDEX idx_ecritures_date ON public.ecritures(date_ecriture);
CREATE INDEX idx_ecritures_journal ON public.ecritures(journal_code);
CREATE INDEX idx_ecritures_mandataire ON public.ecritures(mandataire_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ecritures TO authenticated;
GRANT ALL ON public.ecritures TO service_role;
ALTER TABLE public.ecritures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Ecritures admin acces total" ON public.ecritures
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Ecritures mandataire lecture" ON public.ecritures
  FOR SELECT TO authenticated
  USING (mandataire_id = auth.uid());
CREATE POLICY "Ecritures mandataire NDF insert" ON public.ecritures
  FOR INSERT TO authenticated
  WITH CHECK (mandataire_id = auth.uid() AND journal_code = 'NDF' AND statut = 'brouillon');
CREATE POLICY "Ecritures mandataire NDF update" ON public.ecritures
  FOR UPDATE TO authenticated
  USING (mandataire_id = auth.uid() AND journal_code = 'NDF' AND statut = 'brouillon')
  WITH CHECK (mandataire_id = auth.uid() AND journal_code = 'NDF' AND statut = 'brouillon');
CREATE POLICY "Ecritures mandataire NDF delete" ON public.ecritures
  FOR DELETE TO authenticated
  USING (mandataire_id = auth.uid() AND journal_code = 'NDF' AND statut = 'brouillon');

-- Ecritures lignes
CREATE TABLE public.ecritures_lignes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ecriture_id UUID NOT NULL REFERENCES public.ecritures(id) ON DELETE CASCADE,
  numero_ligne SMALLINT NOT NULL,
  compte_numero TEXT NOT NULL REFERENCES public.plan_comptable(numero),
  libelle TEXT,
  debit NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (debit >= 0),
  credit NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (credit >= 0),
  tiers_id UUID REFERENCES public.tiers(id) ON DELETE SET NULL,
  mandataire_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  CHECK ((debit > 0 AND credit = 0) OR (credit > 0 AND debit = 0) OR (debit = 0 AND credit = 0)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_lignes_ecriture ON public.ecritures_lignes(ecriture_id);
CREATE INDEX idx_lignes_compte ON public.ecritures_lignes(compte_numero);
CREATE INDEX idx_lignes_mandataire ON public.ecritures_lignes(mandataire_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ecritures_lignes TO authenticated;
GRANT ALL ON public.ecritures_lignes TO service_role;
ALTER TABLE public.ecritures_lignes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Lignes admin acces total" ON public.ecritures_lignes
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Lignes mandataire lecture" ON public.ecritures_lignes
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.ecritures e WHERE e.id = ecriture_id AND e.mandataire_id = auth.uid()));
CREATE POLICY "Lignes mandataire NDF CRUD" ON public.ecritures_lignes
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.ecritures e WHERE e.id = ecriture_id AND e.mandataire_id = auth.uid() AND e.journal_code = 'NDF' AND e.statut = 'brouillon'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.ecritures e WHERE e.id = ecriture_id AND e.mandataire_id = auth.uid() AND e.journal_code = 'NDF' AND e.statut = 'brouillon'));

-- Triggers updated_at
CREATE TRIGGER trg_pc_upd BEFORE UPDATE ON public.plan_comptable FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_exercices_upd BEFORE UPDATE ON public.exercices FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_tiers_upd BEFORE UPDATE ON public.tiers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_ecritures_upd BEFORE UPDATE ON public.ecritures FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Fonction verification equilibre debit/credit lors validation
CREATE OR REPLACE FUNCTION public.verifier_equilibre_ecriture(_ecriture_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(SUM(debit),0) = COALESCE(SUM(credit),0) AND COALESCE(SUM(debit),0) > 0
  FROM public.ecritures_lignes WHERE ecriture_id = _ecriture_id;
$$;
REVOKE ALL ON FUNCTION public.verifier_equilibre_ecriture(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.verifier_equilibre_ecriture(UUID) TO authenticated;

-- Trigger bloque la validation si non equilibree
CREATE OR REPLACE FUNCTION public.trg_valider_ecriture()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.statut IN ('valide','cloture') AND (OLD.statut IS NULL OR OLD.statut = 'brouillon') THEN
    IF NOT public.verifier_equilibre_ecriture(NEW.id) THEN
      RAISE EXCEPTION 'Ecriture non equilibree (debit != credit)';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.trg_valider_ecriture() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_valider_ecriture_bef BEFORE UPDATE OF statut ON public.ecritures
  FOR EACH ROW EXECUTE FUNCTION public.trg_valider_ecriture();

-- Solde d'un compte
CREATE OR REPLACE FUNCTION public.solde_compte(_compte TEXT, _date_debut DATE, _date_fin DATE)
RETURNS TABLE(total_debit NUMERIC, total_credit NUMERIC, solde NUMERIC)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    COALESCE(SUM(l.debit),0) AS total_debit,
    COALESCE(SUM(l.credit),0) AS total_credit,
    COALESCE(SUM(l.debit - l.credit),0) AS solde
  FROM public.ecritures_lignes l
  JOIN public.ecritures e ON e.id = l.ecriture_id
  WHERE l.compte_numero = _compte
    AND e.statut IN ('valide','cloture')
    AND e.date_ecriture BETWEEN _date_debut AND _date_fin;
$$;
REVOKE ALL ON FUNCTION public.solde_compte(TEXT,DATE,DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.solde_compte(TEXT,DATE,DATE) TO authenticated;

-- =========================================
-- SEED : Journaux
-- =========================================
INSERT INTO public.journaux (code, libelle, type, compte_contrepartie) VALUES
  ('AC','Journal des achats','achats',NULL),
  ('VE','Journal des ventes','ventes',NULL),
  ('BQ','Journal de banque','banque',NULL),
  ('CA','Journal de caisse','caisse',NULL),
  ('OD','Operations diverses','od',NULL),
  ('NDF','Notes de frais','ndf',NULL);

-- =========================================
-- SEED : Plan comptable (courtage assurance)
-- =========================================
INSERT INTO public.plan_comptable (numero, libelle, classe, type, description) VALUES
  -- Classe 1 : Capitaux
  ('101000','Capital','1','passif',NULL),
  ('106000','Reserves','1','passif',NULL),
  ('108000','Compte de l exploitant','1','passif',NULL),
  ('120000','Resultat de l exercice (benefice)','1','passif',NULL),
  ('129000','Resultat de l exercice (perte)','1','passif',NULL),
  -- Classe 2 : Immobilisations
  ('205000','Concessions, licences, logiciels','2','actif',NULL),
  ('218300','Materiel de bureau et informatique','2','actif',NULL),
  ('280500','Amortissement logiciels','2','actif',NULL),
  ('281830','Amortissement materiel','2','actif',NULL),
  -- Classe 4 : Tiers
  ('401000','Fournisseurs','4','passif',NULL),
  ('411000','Clients','4','actif',NULL),
  ('421000','Personnel - Remunerations dues','4','passif',NULL),
  ('431000','Securite sociale','4','passif',NULL),
  ('437000','Autres organismes sociaux','4','passif',NULL),
  ('444000','Etat - Impots sur les benefices','4','passif',NULL),
  ('445660','TVA deductible sur autres biens et services','4','actif',NULL),
  ('445710','TVA collectee','4','passif',NULL),
  ('445510','TVA a decaisser','4','passif',NULL),
  ('455000','Associes - Comptes courants','4','passif',NULL),
  ('467000','Mandataires - Retrocessions a payer','4','passif','Compte tiers rétrocessions mandataires'),
  -- Classe 5 : Financiers
  ('512000','Banque','5','actif',NULL),
  ('530000','Caisse','5','actif',NULL),
  ('580000','Virements internes','5','neutre',NULL),
  -- Classe 6 : Charges
  ('606100','Fournitures non stockables (eau, energie)','6','charge',NULL),
  ('606400','Fournitures administratives','6','charge',NULL),
  ('606800','Autres achats non stockes','6','charge',NULL),
  ('613200','Locations immobilieres','6','charge',NULL),
  ('613500','Locations mobilieres','6','charge',NULL),
  ('616000','Primes d assurances','6','charge','RCPro, assurances cabinet'),
  ('618100','Documentation generale','6','charge',NULL),
  ('621000','Personnel exterieur a l entreprise','6','charge',NULL),
  ('622600','Honoraires','6','charge','Experts, avocats, comptables'),
  ('622700','Frais d actes et de contentieux','6','charge',NULL),
  ('622800','Retrocessions de commissions aux mandataires','6','charge','Compte principal rétrocessions'),
  ('623000','Publicite, publications, relations publiques','6','charge',NULL),
  ('625100','Voyages et deplacements','6','charge',NULL),
  ('625600','Missions','6','charge',NULL),
  ('625700','Receptions','6','charge',NULL),
  ('626000','Frais postaux et telecommunications','6','charge',NULL),
  ('627000','Services bancaires','6','charge',NULL),
  ('628000','Cotisations professionnelles (ORIAS, associations)','6','charge',NULL),
  ('631000','Impots taxes et versements assimiles','6','charge',NULL),
  ('641000','Remunerations du personnel','6','charge',NULL),
  ('645000','Charges de securite sociale et prevoyance','6','charge',NULL),
  ('661000','Charges d interets','6','charge',NULL),
  ('681100','Dotations aux amortissements','6','charge',NULL),
  -- Classe 7 : Produits
  ('706000','Prestations de services','7','produit',NULL),
  ('706100','Commissions d assurance - Emprunteur','7','produit',NULL),
  ('706200','Commissions d assurance - Prevoyance/Sante','7','produit',NULL),
  ('706300','Commissions d assurance - IARD','7','produit',NULL),
  ('706400','Commissions d assurance - Vie/Epargne','7','produit',NULL),
  ('708000','Produits des activites annexes','7','produit',NULL),
  ('758000','Produits divers de gestion courante','7','produit',NULL),
  ('768000','Produits financiers','7','produit',NULL);

-- Exercice courant par defaut
INSERT INTO public.exercices (libelle, date_debut, date_fin)
VALUES ('Exercice ' || EXTRACT(YEAR FROM CURRENT_DATE)::TEXT,
        DATE_TRUNC('year', CURRENT_DATE)::DATE,
        (DATE_TRUNC('year', CURRENT_DATE) + INTERVAL '1 year - 1 day')::DATE);
