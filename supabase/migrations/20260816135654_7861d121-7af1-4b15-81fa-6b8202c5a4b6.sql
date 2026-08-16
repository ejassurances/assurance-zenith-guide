-- 1) Registre des traitements RGPD (Art. 30)
CREATE TABLE public.registre_traitements_rgpd (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nom_traitement text NOT NULL,
  finalite text,
  base_legale text,
  categories_donnees text,
  personnes_concernees text,
  destinataires text,
  sous_traitants text,
  duree_conservation text,
  mesures_securite text,
  transfert_hors_ue boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  revise_le date,
  created_by uuid REFERENCES auth.users,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.registre_traitements_rgpd TO authenticated;
GRANT ALL ON public.registre_traitements_rgpd TO service_role;
ALTER TABLE public.registre_traitements_rgpd ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Cabinet lit le registre RGPD" ON public.registre_traitements_rgpd
FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'mandataire'));

CREATE POLICY "Admin gere le registre RGPD" ON public.registre_traitements_rgpd
FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'))
WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE TRIGGER registre_traitements_rgpd_updated_at
BEFORE UPDATE ON public.registre_traitements_rgpd
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.registre_traitements_rgpd
  (nom_traitement, finalite, base_legale, categories_donnees, personnes_concernees, destinataires, sous_traitants, duree_conservation, mesures_securite, transfert_hors_ue)
VALUES
('Gestion clients et prospects (KYC, recueil des besoins)',
 'Gestion de la relation commerciale et respect des obligations DDA/LCB-FT',
 'Exécution du contrat + obligation légale',
 'Identité, coordonnées, situation familiale et professionnelle, pièces d''identité',
 'Clients et prospects',
 'Personnel habilité du cabinet, compagnies d''assurance partenaires',
 'Supabase (hébergement), Lovable (plateforme), Brevo (emailing)',
 'Durée de la relation + délais de prescription légale',
 'Accès par rôle, chiffrement au repos (Supabase), authentification', false),
('Contrôle LCB-FT (filtrage sanctions/PPE)',
 'Obligation légale de vigilance LCB-FT',
 'Obligation légale',
 'Identité, date de naissance',
 'Clients et prospects',
 'OpenSanctions (sous-traitant technique)',
 'OpenSanctions',
 'Durée de la relation + 5 ans',
 'Accès restreint personnel habilité', false),
('Tarification et souscription via API partenaires (Néoliane, SimulAssur, UGIP)',
 'Étude et souscription de contrats d''assurance',
 'Exécution de mesures précontractuelles / du contrat',
 'Code postal, année de naissance, régime social — pseudonymisées à l''étape de tarification ; identité complète à l''étape de souscription',
 'Clients',
 'Compagnies/grossistes partenaires',
 'Néoliane, SimulAssur, UGIP',
 'Durée de la relation contractuelle',
 NULL, false),
('Communication et prospection commerciale (Brevo)',
 'Information et prospection commerciale',
 'Intérêt légitime / consentement selon le cas',
 'Identité, coordonnées, branche d''intérêt',
 'Clients et prospects',
 'Brevo (sous-traitant)',
 'Brevo',
 'Durée de la relation, retrait sur simple demande',
 'Droit d''opposition disponible à chaque envoi', false),
('Espace client et signature électronique',
 'Exécution du contrat de courtage, preuve de consentement',
 'Exécution du contrat',
 'Identité, documents signés, horodatage, adresse IP',
 'Clients',
 'Personnel habilité du cabinet',
 'Supabase (hébergement)',
 'Durée de la relation + délais de prescription',
 'Authentification, piste d''audit horodatée', false),
('Gestion des sinistres',
 'Suivi et transmission des sinistres déclarés',
 'Exécution du contrat',
 'Identité, description du sinistre, pièces justificatives',
 'Clients',
 'Compagnies d''assurance',
 NULL,
 'Durée de la relation + délais de prescription applicables aux sinistres',
 NULL, false);

-- 2) Formation du personnel
CREATE TABLE public.formations_personnel (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  collaborateur_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  theme text NOT NULL,
  date_formation date NOT NULL,
  date_expiration date,
  attestation_url text,
  statut text NOT NULL DEFAULT 'valide' CHECK (statut IN ('valide','a_renouveler','expiree')),
  created_by uuid REFERENCES auth.users,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.formations_personnel TO authenticated;
GRANT ALL ON public.formations_personnel TO service_role;
ALTER TABLE public.formations_personnel ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Cabinet lit les formations" ON public.formations_personnel
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin')
  OR has_role(auth.uid(), 'mandataire')
  OR collaborateur_id = auth.uid()
);

CREATE POLICY "Admin gere les formations" ON public.formations_personnel
FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'))
WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE TRIGGER formations_personnel_updated_at
BEFORE UPDATE ON public.formations_personnel
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();