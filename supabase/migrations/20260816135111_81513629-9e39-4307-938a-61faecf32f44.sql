CREATE OR REPLACE FUNCTION public.calculer_risque_residuel(_probabilite integer, _impact integer, _niveau_maitrise integer)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN (_probabilite * _impact) * (CASE _niveau_maitrise WHEN 3 THEN 0.33 WHEN 2 THEN 0.66 ELSE 1 END) >= 8 THEN 'eleve'
    WHEN (_probabilite * _impact) * (CASE _niveau_maitrise WHEN 3 THEN 0.33 WHEN 2 THEN 0.66 ELSE 1 END) >= 3 THEN 'moyen'
    ELSE 'faible'
  END
$$;

CREATE TABLE public.cartographie_risques (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  categorie text NOT NULL,
  facteur text NOT NULL,
  probabilite integer NOT NULL DEFAULT 1 CHECK (probabilite BETWEEN 1 AND 4),
  impact integer NOT NULL DEFAULT 1 CHECK (impact BETWEEN 1 AND 4),
  niveau_maitrise integer NOT NULL DEFAULT 1 CHECK (niveau_maitrise BETWEEN 1 AND 3),
  mesures_maitrise text,
  risque_residuel text NOT NULL DEFAULT 'faible' CHECK (risque_residuel IN ('eleve','moyen','faible')),
  version integer NOT NULL DEFAULT 1,
  revise_le date,
  created_by uuid REFERENCES auth.users,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cartographie_risques TO authenticated;
GRANT ALL ON public.cartographie_risques TO service_role;

ALTER TABLE public.cartographie_risques ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Cabinet lit la cartographie" ON public.cartographie_risques
FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'mandataire'));

CREATE POLICY "Admin gere la cartographie" ON public.cartographie_risques
FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'))
WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.trg_cartographie_risque_residuel()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.risque_residuel := public.calculer_risque_residuel(NEW.probabilite, NEW.impact, NEW.niveau_maitrise);
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER cartographie_risques_residuel
BEFORE INSERT OR UPDATE ON public.cartographie_risques
FOR EACH ROW EXECUTE FUNCTION public.trg_cartographie_risque_residuel();

INSERT INTO public.cartographie_risques (categorie, facteur, probabilite, impact, niveau_maitrise, mesures_maitrise) VALUES
('Type de clientèle','Clientèle particuliers résidents France',2,2,2,'KYC systématique, contrôle sanctions/PPE automatique à la création de chaque fiche'),
('Type de clientèle','Clientèle non-résidente ou zone géographique atypique',2,3,1,'Facteur déjà intégré au score de risque LCB-FT (pays hors France = +20 points)'),
('Produit distribué','Assurance emprunteur (montants élevés)',2,3,2,'Facteur montant déjà intégré au score de risque LCB-FT'),
('Produit distribué','Autres produits particuliers (santé, prévoyance, GAV, PJ, animaux)',1,1,2,'Montants unitaires faibles, risque de blanchiment limité'),
('Canal d''entrée en relation','Entrée en relation à distance (internet, téléphone)',3,2,2,'Vérification d''identité par pièce, facteur déjà intégré au score de risque'),
('Canal d''entrée en relation','Entrée en relation par recommandation/parrainage/apporteur connu',1,1,3,'Relation déjà établie via un tiers connu du cabinet'),
('Personne politiquement exposée','Client PPE identifié',2,4,3,'Vigilance renforcée de plein droit, validation hiérarchique obligatoire (déjà automatisé)');