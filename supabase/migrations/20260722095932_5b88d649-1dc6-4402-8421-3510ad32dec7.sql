
-- ============ LOT A : Fiche client 360° ============

-- Étendre clients
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS date_naissance date,
  ADD COLUMN IF NOT EXISTS lieu_naissance text,
  ADD COLUMN IF NOT EXISTS nationalite text,
  ADD COLUMN IF NOT EXISTS situation_familiale text,
  ADD COLUMN IF NOT EXISTS nb_enfants integer,
  ADD COLUMN IF NOT EXISTS revenus_annuels numeric,
  ADD COLUMN IF NOT EXISTS ppe boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ppe_fonction text,
  ADD COLUMN IF NOT EXISTS ppe_pays text;

-- Conjoint (1 par client)
CREATE TABLE public.client_conjoint (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL UNIQUE REFERENCES public.clients(id) ON DELETE CASCADE,
  nom text,
  prenom text,
  date_naissance date,
  profession text,
  fumeur boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_conjoint TO authenticated;
GRANT ALL ON public.client_conjoint TO service_role;
ALTER TABLE public.client_conjoint ENABLE ROW LEVEL SECURITY;
CREATE POLICY "conjoint access" ON public.client_conjoint FOR ALL TO authenticated
  USING (public.can_access_client(client_id)) WITH CHECK (public.can_access_client(client_id));
CREATE TRIGGER trg_conjoint_updated BEFORE UPDATE ON public.client_conjoint
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Enfants
CREATE TABLE public.client_enfants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  prenom text NOT NULL,
  date_naissance date,
  a_charge boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_enfants TO authenticated;
GRANT ALL ON public.client_enfants TO service_role;
ALTER TABLE public.client_enfants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "enfants access" ON public.client_enfants FOR ALL TO authenticated
  USING (public.can_access_client(client_id)) WITH CHECK (public.can_access_client(client_id));
CREATE TRIGGER trg_enfants_updated BEFORE UPDATE ON public.client_enfants
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_enfants_client ON public.client_enfants(client_id);

-- Entreprise (1 par client)
CREATE TABLE public.client_entreprise (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL UNIQUE REFERENCES public.clients(id) ON DELETE CASCADE,
  raison_sociale text,
  siret text,
  code_ape text,
  forme_juridique text,
  effectif integer,
  chiffre_affaires numeric,
  date_creation date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_entreprise TO authenticated;
GRANT ALL ON public.client_entreprise TO service_role;
ALTER TABLE public.client_entreprise ENABLE ROW LEVEL SECURITY;
CREATE POLICY "entreprise access" ON public.client_entreprise FOR ALL TO authenticated
  USING (public.can_access_client(client_id)) WITH CHECK (public.can_access_client(client_id));
CREATE TRIGGER trg_entreprise_updated BEFORE UPDATE ON public.client_entreprise
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Équipements (N par client)
CREATE TABLE public.client_equipements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  type text NOT NULL, -- auto, moto, immobilier, animal, do, autre
  libelle text NOT NULL,
  valeur numeric,
  date_acquisition date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_equipements TO authenticated;
GRANT ALL ON public.client_equipements TO service_role;
ALTER TABLE public.client_equipements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "equipements access" ON public.client_equipements FOR ALL TO authenticated
  USING (public.can_access_client(client_id)) WITH CHECK (public.can_access_client(client_id));
CREATE TRIGGER trg_equipements_updated BEFORE UPDATE ON public.client_equipements
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_equipements_client ON public.client_equipements(client_id);

-- ============ LOT B : Pipeline & Contrats ============

-- Projets (pipeline Kanban)
CREATE TABLE public.projets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  titre text NOT NULL,
  produit text, -- emprunteur, sante, prevoyance, auto, iard, autre
  etape text NOT NULL DEFAULT 'nouveau', -- nouveau, etude, proposition, negociation, signe, perdu
  probabilite integer NOT NULL DEFAULT 50,
  montant_estime numeric,
  date_cloture_prevue date,
  assigne_a uuid REFERENCES auth.users(id),
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.projets TO authenticated;
GRANT ALL ON public.projets TO service_role;
ALTER TABLE public.projets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "projets access" ON public.projets FOR ALL TO authenticated
  USING (public.can_access_client(client_id)) WITH CHECK (public.can_access_client(client_id));
CREATE TRIGGER trg_projets_updated BEFORE UPDATE ON public.projets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_projets_client ON public.projets(client_id);
CREATE INDEX idx_projets_etape ON public.projets(etape);

-- Contrats
CREATE TABLE public.contrats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  projet_id uuid REFERENCES public.projets(id) ON DELETE SET NULL,
  dossier_id uuid REFERENCES public.dossiers(id) ON DELETE SET NULL,
  numero text,
  assureur text NOT NULL,
  produit text NOT NULL, -- emprunteur, sante, prevoyance, auto, iard, autre
  date_effet date,
  date_echeance date,
  prime_annuelle numeric,
  fractionnement text NOT NULL DEFAULT 'annuel', -- mensuel, trimestriel, semestriel, annuel
  statut text NOT NULL DEFAULT 'en_cours', -- en_cours, resilie, suspendu, en_attente
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contrats TO authenticated;
GRANT ALL ON public.contrats TO service_role;
ALTER TABLE public.contrats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "contrats access" ON public.contrats FOR ALL TO authenticated
  USING (public.can_access_client(client_id)) WITH CHECK (public.can_access_client(client_id));
CREATE TRIGGER trg_contrats_updated BEFORE UPDATE ON public.contrats
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_contrats_client ON public.contrats(client_id);
CREATE INDEX idx_contrats_statut ON public.contrats(statut);

-- Garanties (N par contrat)
CREATE TABLE public.contrat_garanties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contrat_id uuid NOT NULL REFERENCES public.contrats(id) ON DELETE CASCADE,
  type text NOT NULL, -- deces, ptia, ipt, itt, mno, chomage, autre
  quotite integer, -- pourcentage
  montant numeric,
  franchise text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contrat_garanties TO authenticated;
GRANT ALL ON public.contrat_garanties TO service_role;
ALTER TABLE public.contrat_garanties ENABLE ROW LEVEL SECURITY;
CREATE POLICY "garanties access" ON public.contrat_garanties FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.contrats c WHERE c.id = contrat_id AND public.can_access_client(c.client_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.contrats c WHERE c.id = contrat_id AND public.can_access_client(c.client_id)));
CREATE TRIGGER trg_garanties_updated BEFORE UPDATE ON public.contrat_garanties
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_garanties_contrat ON public.contrat_garanties(contrat_id);

-- ============ LOT C : Sinistres & Bordereaux ============

CREATE TABLE public.sinistres (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contrat_id uuid NOT NULL REFERENCES public.contrats(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  reference text,
  date_survenance date,
  type text, -- deces, arret_travail, invalidite, autre
  description text,
  montant numeric,
  statut text NOT NULL DEFAULT 'ouvert', -- ouvert, en_cours, indemnise, clos, refuse
  gestionnaire uuid REFERENCES auth.users(id),
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sinistres TO authenticated;
GRANT ALL ON public.sinistres TO service_role;
ALTER TABLE public.sinistres ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sinistres access" ON public.sinistres FOR ALL TO authenticated
  USING (public.can_access_client(client_id)) WITH CHECK (public.can_access_client(client_id));
CREATE TRIGGER trg_sinistres_updated BEFORE UPDATE ON public.sinistres
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_sinistres_client ON public.sinistres(client_id);
CREATE INDEX idx_sinistres_contrat ON public.sinistres(contrat_id);

CREATE TABLE public.bordereaux_commissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  periode text NOT NULL, -- ex: 2026-01
  assureur text NOT NULL,
  montant_total numeric NOT NULL DEFAULT 0,
  nb_lignes integer NOT NULL DEFAULT 0,
  statut text NOT NULL DEFAULT 'importe', -- importe, rapproche, valide, litige
  fichier_source text,
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bordereaux_commissions TO authenticated;
GRANT ALL ON public.bordereaux_commissions TO service_role;
ALTER TABLE public.bordereaux_commissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bordereaux admin" ON public.bordereaux_commissions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER trg_bordereaux_updated BEFORE UPDATE ON public.bordereaux_commissions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Lier commissions à bordereau et à contrat (optionnel, pour import de masse)
ALTER TABLE public.commissions
  ADD COLUMN IF NOT EXISTS bordereau_id uuid REFERENCES public.bordereaux_commissions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS contrat_id uuid REFERENCES public.contrats(id) ON DELETE SET NULL;
