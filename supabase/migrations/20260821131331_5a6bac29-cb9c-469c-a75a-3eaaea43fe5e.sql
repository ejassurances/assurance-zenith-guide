-- 1. Commissions : provision pour reprise + état d'encaissement
ALTER TABLE public.commissions
  ADD COLUMN IF NOT EXISTS precomptee boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS provision_reprise numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS etat_encaissement text NOT NULL DEFAULT 'en_attente_bordereau';

ALTER TABLE public.commissions DROP CONSTRAINT IF EXISTS commissions_etat_encaissement_check;
ALTER TABLE public.commissions ADD CONSTRAINT commissions_etat_encaissement_check
  CHECK (etat_encaissement IN ('en_attente_bordereau','valide_bordereau','encaisse_banque'));
ALTER TABLE public.commissions DROP CONSTRAINT IF EXISTS commissions_provision_reprise_check;
ALTER TABLE public.commissions ADD CONSTRAINT commissions_provision_reprise_check
  CHECK (provision_reprise >= 0);

-- Reprise de l'existant : les commissions versées et comptabilisées sont encaissées
UPDATE public.commissions SET etat_encaissement = 'encaisse_banque'
  WHERE statut = 'versee' AND ecriture_id IS NOT NULL AND etat_encaissement = 'en_attente_bordereau';
UPDATE public.commissions SET etat_encaissement = 'valide_bordereau'
  WHERE bordereau_id IS NOT NULL AND statut = 'versee' AND ecriture_id IS NULL AND etat_encaissement = 'en_attente_bordereau';

-- 2. Contrôle « Gel des avoirs » horodaté par fiche client (preuve archivée sur Drive)
CREATE TABLE IF NOT EXISTS public.client_gel_avoirs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  effectue boolean NOT NULL DEFAULT true,
  effectue_le timestamptz NOT NULL DEFAULT now(),
  effectue_par uuid REFERENCES auth.users(id),
  resultat text NOT NULL DEFAULT 'aucune_correspondance',
  observations text,
  drive_file_id text,
  drive_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.client_gel_avoirs DROP CONSTRAINT IF EXISTS client_gel_avoirs_resultat_check;
ALTER TABLE public.client_gel_avoirs ADD CONSTRAINT client_gel_avoirs_resultat_check
  CHECK (resultat IN ('aucune_correspondance','correspondance_a_analyser','correspondance_confirmee'));
CREATE INDEX IF NOT EXISTS idx_gel_avoirs_client ON public.client_gel_avoirs(client_id, effectue_le DESC);

GRANT SELECT, INSERT ON public.client_gel_avoirs TO authenticated;
GRANT ALL ON public.client_gel_avoirs TO service_role;
ALTER TABLE public.client_gel_avoirs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "gel avoirs lecture cabinet" ON public.client_gel_avoirs;
CREATE POLICY "gel avoirs lecture cabinet" ON public.client_gel_avoirs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR (public.has_role(auth.uid(), 'mandataire') AND public.can_access_client(client_id)));
DROP POLICY IF EXISTS "gel avoirs ajout cabinet" ON public.client_gel_avoirs;
CREATE POLICY "gel avoirs ajout cabinet" ON public.client_gel_avoirs FOR INSERT TO authenticated
  WITH CHECK ((public.has_role(auth.uid(), 'admin') OR (public.has_role(auth.uid(), 'mandataire') AND public.can_access_client(client_id))) AND effectue_par = auth.uid());

-- 3. Registre DORA : systèmes tiers et incidents informatiques
CREATE TABLE IF NOT EXISTS public.dora_systemes_tiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nom text NOT NULL,
  fournisseur text,
  categorie text NOT NULL DEFAULT 'autre',
  criticite text NOT NULL DEFAULT 'moyenne',
  donnees_traitees text,
  localisation_donnees text,
  contrat_reference text,
  plan_continuite text,
  derniere_revue_le date,
  actif boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.dora_systemes_tiers DROP CONSTRAINT IF EXISTS dora_systemes_tiers_criticite_check;
ALTER TABLE public.dora_systemes_tiers ADD CONSTRAINT dora_systemes_tiers_criticite_check
  CHECK (criticite IN ('faible','moyenne','elevee','critique'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dora_systemes_tiers TO authenticated;
GRANT ALL ON public.dora_systemes_tiers TO service_role;
ALTER TABLE public.dora_systemes_tiers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "dora systemes lecture cabinet" ON public.dora_systemes_tiers;
CREATE POLICY "dora systemes lecture cabinet" ON public.dora_systemes_tiers FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'mandataire'));
DROP POLICY IF EXISTS "dora systemes gestion admin" ON public.dora_systemes_tiers;
CREATE POLICY "dora systemes gestion admin" ON public.dora_systemes_tiers FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.dora_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  systeme_id uuid REFERENCES public.dora_systemes_tiers(id) ON DELETE SET NULL,
  titre text NOT NULL,
  description text,
  survenu_le timestamptz NOT NULL DEFAULT now(),
  detecte_le timestamptz,
  resolu_le timestamptz,
  gravite text NOT NULL DEFAULT 'mineur',
  impact_donnees boolean NOT NULL DEFAULT false,
  notification_acpr boolean NOT NULL DEFAULT false,
  notification_cnil boolean NOT NULL DEFAULT false,
  mesures_correctives text,
  statut text NOT NULL DEFAULT 'ouvert',
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.dora_incidents DROP CONSTRAINT IF EXISTS dora_incidents_gravite_check;
ALTER TABLE public.dora_incidents ADD CONSTRAINT dora_incidents_gravite_check
  CHECK (gravite IN ('mineur','majeur','critique'));
ALTER TABLE public.dora_incidents DROP CONSTRAINT IF EXISTS dora_incidents_statut_check;
ALTER TABLE public.dora_incidents ADD CONSTRAINT dora_incidents_statut_check
  CHECK (statut IN ('ouvert','en_cours','resolu'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dora_incidents TO authenticated;
GRANT ALL ON public.dora_incidents TO service_role;
ALTER TABLE public.dora_incidents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "dora incidents lecture cabinet" ON public.dora_incidents;
CREATE POLICY "dora incidents lecture cabinet" ON public.dora_incidents FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'mandataire'));
DROP POLICY IF EXISTS "dora incidents declaration cabinet" ON public.dora_incidents;
CREATE POLICY "dora incidents declaration cabinet" ON public.dora_incidents FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'mandataire'));
DROP POLICY IF EXISTS "dora incidents gestion admin" ON public.dora_incidents;
CREATE POLICY "dora incidents gestion admin" ON public.dora_incidents FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS trg_dora_systemes_updated ON public.dora_systemes_tiers;
CREATE TRIGGER trg_dora_systemes_updated BEFORE UPDATE ON public.dora_systemes_tiers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS trg_dora_incidents_updated ON public.dora_incidents;
CREATE TRIGGER trg_dora_incidents_updated BEFORE UPDATE ON public.dora_incidents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Socle initial du registre DORA (systèmes tiers réellement utilisés)
INSERT INTO public.dora_systemes_tiers (nom, fournisseur, categorie, criticite, donnees_traitees, localisation_donnees, plan_continuite)
SELECT * FROM (VALUES
  ('Base de données & authentification CRM','Lovable Cloud (Supabase)','hebergement','critique','Données clients, contrats, KYC, comptabilité','Union européenne','Sauvegardes quotidiennes automatiques ; restauration point-in-time'),
  ('Messagerie et agenda','Google Workspace (Gmail)','messagerie','elevee','Échanges clients, pièces jointes','Union européenne / États-Unis (clauses contractuelles types)','Accès via comptes nominatifs, MFA obligatoire'),
  ('Stockage documentaire','Google Drive','stockage','critique','PDF signés, registres réglementaires, pièces KYC','Union européenne / États-Unis (clauses contractuelles types)','Versionnage Drive, corbeille 30 jours'),
  ('Analyse documentaire et triage IA','Google Gemini (Lovable AI)','ia','moyenne','Extraits de documents transmis pour analyse','Union européenne','Dégradation gracieuse : traitement manuel si indisponible'),
  ('Criblage sanctions et PPE','OpenSanctions','lcb_ft','elevee','Nom, prénom, date de naissance des clients','Union européenne','Contrôle manuel de repli si API indisponible'),
  ('API compagnies partenaires','Néoliane / SimulAssur / UGIP','api_partenaire','moyenne','Données de souscription','Union européenne','Saisie via extranet compagnie en cas de panne')
) AS v(nom, fournisseur, categorie, criticite, donnees_traitees, localisation_donnees, plan_continuite)
WHERE NOT EXISTS (SELECT 1 FROM public.dora_systemes_tiers);