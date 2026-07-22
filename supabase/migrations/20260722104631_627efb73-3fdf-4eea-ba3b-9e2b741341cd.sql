
CREATE TYPE public.compagnie_statut AS ENUM ('actif','prospect','inactif');
CREATE TYPE public.produit_statut AS ENUM ('actif','en_test','retire');
CREATE TYPE public.produit_document_type AS ENUM ('conditions_generales','ipid','fiche_produit','tarifs','autre');
CREATE TYPE public.api_auth_type AS ENUM ('none','api_key','bearer','oauth2','basic');

CREATE TABLE public.compagnies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nom text NOT NULL,
  slug text NOT NULL UNIQUE,
  logo_url text,
  description text,
  site_web text,
  contact_nom text,
  contact_email text,
  contact_telephone text,
  statut public.compagnie_statut NOT NULL DEFAULT 'actif',
  notes text,
  api_active boolean NOT NULL DEFAULT false,
  api_base_url text,
  api_auth_type public.api_auth_type NOT NULL DEFAULT 'none',
  api_secret_name text,
  api_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.compagnies TO authenticated;
GRANT ALL ON public.compagnies TO service_role;
ALTER TABLE public.compagnies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "compagnies_read_staff" ON public.compagnies FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'mandataire'));
CREATE POLICY "compagnies_insert_admin" ON public.compagnies FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "compagnies_update_admin" ON public.compagnies FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "compagnies_delete_admin" ON public.compagnies FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER update_compagnies_updated_at BEFORE UPDATE ON public.compagnies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.produit_familles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  nom text NOT NULL,
  description text,
  champs_standards jsonb NOT NULL DEFAULT '[]'::jsonb,
  ordre integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.produit_familles TO authenticated;
GRANT ALL ON public.produit_familles TO service_role;
ALTER TABLE public.produit_familles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "familles_read_staff" ON public.produit_familles FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'mandataire'));
CREATE POLICY "familles_write_admin" ON public.produit_familles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER update_familles_updated_at BEFORE UPDATE ON public.produit_familles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.produit_familles (code, nom, description, champs_standards, ordre) VALUES
  ('emprunteur','Assurance emprunteur','Assurance de prêt immobilier (loi Lemoine)',
    '[
      {"code":"garanties","label":"Garanties incluses","type":"multiselect","options":["DC","PTIA","ITT","IPT","IPP","MNO"]},
      {"code":"quotite_max","label":"Quotité maximale","type":"number","unit":"%"},
      {"code":"age_max_souscription","label":"Âge max à la souscription","type":"number","unit":"ans"},
      {"code":"age_max_couverture","label":"Âge max en couverture","type":"number","unit":"ans"},
      {"code":"franchise_itt","label":"Franchise ITT","type":"number","unit":"jours"},
      {"code":"delai_carence","label":"Délai de carence","type":"number","unit":"jours"},
      {"code":"sports_exclus","label":"Sports/professions exclus","type":"textarea"},
      {"code":"formalites_medicales","label":"Formalités médicales","type":"text"},
      {"code":"indemnisation","label":"Type d''indemnisation","type":"select","options":["forfaitaire","indemnitaire"]}
    ]'::jsonb, 1),
  ('auto','Assurance auto','Véhicules particuliers',
    '[
      {"code":"formule","label":"Formule","type":"select","options":["tiers","tiers_plus","tous_risques"]},
      {"code":"franchise","label":"Franchise","type":"number","unit":"€"},
      {"code":"pret_volant","label":"Prêt de volant","type":"boolean"},
      {"code":"jeune_conducteur","label":"Jeune conducteur accepté","type":"boolean"},
      {"code":"assistance","label":"Assistance","type":"text"},
      {"code":"vehicule_remplacement","label":"Véhicule de remplacement","type":"boolean"}
    ]'::jsonb, 2),
  ('moto','Assurance moto','Deux-roues motorisés',
    '[
      {"code":"formule","label":"Formule","type":"select","options":["tiers","tiers_plus","tous_risques"]},
      {"code":"cylindree_max","label":"Cylindrée max acceptée","type":"number","unit":"cm3"},
      {"code":"equipement_couvert","label":"Équipement couvert","type":"boolean"}
    ]'::jsonb, 3),
  ('mrh','Multirisque habitation','Habitation principale ou secondaire',
    '[
      {"code":"type_bien","label":"Type de bien","type":"multiselect","options":["appartement","maison","location","proprietaire"]},
      {"code":"capital_mobilier","label":"Capital mobilier","type":"number","unit":"€"},
      {"code":"franchise","label":"Franchise","type":"number","unit":"€"},
      {"code":"objets_valeur","label":"Objets de valeur","type":"boolean"},
      {"code":"piscine","label":"Piscine couverte","type":"boolean"}
    ]'::jsonb, 4),
  ('sante','Complémentaire santé','Mutuelle individuelle ou TNS',
    '[
      {"code":"cible","label":"Cible","type":"select","options":["individuel","famille","tns","senior"]},
      {"code":"niveau_hospit","label":"Niveau hospitalisation","type":"select","options":["100","150","200","300","400"]},
      {"code":"niveau_optique","label":"Niveau optique","type":"select","options":["100","150","200","300","400"]},
      {"code":"niveau_dentaire","label":"Niveau dentaire","type":"select","options":["100","150","200","300","400"]},
      {"code":"delai_carence","label":"Délai de carence","type":"number","unit":"mois"},
      {"code":"reseau_soins","label":"Réseau de soins","type":"text"}
    ]'::jsonb, 5),
  ('prevoyance','Prévoyance','Décès, invalidité, arrêt de travail',
    '[
      {"code":"garanties","label":"Garanties","type":"multiselect","options":["DC","IAD","ITT","IPT","IPP","rente_conjoint","rente_education"]},
      {"code":"capital_dc","label":"Capital décès","type":"number","unit":"€"},
      {"code":"franchise_itt","label":"Franchise ITT","type":"number","unit":"jours"},
      {"code":"formalites_medicales","label":"Formalités médicales","type":"text"}
    ]'::jsonb, 6),
  ('pro','Multirisque professionnelle','RC Pro, MRP, cyber',
    '[
      {"code":"activites","label":"Activités couvertes","type":"textarea"},
      {"code":"ca_max","label":"CA maximum","type":"number","unit":"€"},
      {"code":"rcpro","label":"RC Pro incluse","type":"boolean"},
      {"code":"cyber","label":"Cyber incluse","type":"boolean"},
      {"code":"protection_juridique","label":"Protection juridique","type":"boolean"}
    ]'::jsonb, 7);

CREATE TABLE public.produits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  compagnie_id uuid NOT NULL REFERENCES public.compagnies(id) ON DELETE CASCADE,
  famille_id uuid NOT NULL REFERENCES public.produit_familles(id) ON DELETE RESTRICT,
  nom text NOT NULL,
  code_produit text,
  description text,
  statut public.produit_statut NOT NULL DEFAULT 'actif',
  caracteristiques jsonb NOT NULL DEFAULT '{}'::jsonb,
  points_forts text,
  points_vigilance text,
  cible text,
  commission_taux numeric(5,2),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (compagnie_id, nom)
);
CREATE INDEX produits_compagnie_idx ON public.produits(compagnie_id);
CREATE INDEX produits_famille_idx ON public.produits(famille_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.produits TO authenticated;
GRANT ALL ON public.produits TO service_role;
ALTER TABLE public.produits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "produits_read_staff" ON public.produits FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'mandataire'));
CREATE POLICY "produits_write_admin" ON public.produits FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER update_produits_updated_at BEFORE UPDATE ON public.produits
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.produit_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  produit_id uuid NOT NULL REFERENCES public.produits(id) ON DELETE CASCADE,
  type public.produit_document_type NOT NULL,
  nom text NOT NULL,
  version text,
  date_effet date,
  storage_path text NOT NULL,
  taille_bytes bigint,
  mime_type text,
  interne boolean NOT NULL DEFAULT false,
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX produit_documents_produit_idx ON public.produit_documents(produit_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.produit_documents TO authenticated;
GRANT ALL ON public.produit_documents TO service_role;
ALTER TABLE public.produit_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "produit_documents_read_staff" ON public.produit_documents FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'mandataire'));
CREATE POLICY "produit_documents_write_admin" ON public.produit_documents FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER update_produit_documents_updated_at BEFORE UPDATE ON public.produit_documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Storage policies (bucket créé via storage_create_bucket)
CREATE POLICY "produits_docs_read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'produits-documents'
    AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'mandataire')));
CREATE POLICY "produits_docs_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'produits-documents' AND public.has_role(auth.uid(),'admin'));
CREATE POLICY "produits_docs_update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'produits-documents' AND public.has_role(auth.uid(),'admin'));
CREATE POLICY "produits_docs_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'produits-documents' AND public.has_role(auth.uid(),'admin'));
