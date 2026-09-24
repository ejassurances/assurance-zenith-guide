-- Chantier mandataire — brique 3 : espace personnel (KYC + obligations
-- ACPR/DDA/formation continue).
--
-- Obligation légale vérifiée : 15 heures de formation continue DDA
-- minimum par année civile pour tout intermédiaire immatriculé ORIAS
-- (article L.511-2 du Code des assurances, arrêté du 26 septembre 2018).
-- Le seuil est affiché à titre indicatif dans le suivi ; ce n'est pas
-- l'application qui certifie la conformité, seulement un suivi.

CREATE TABLE IF NOT EXISTS public.mandataires_kyc_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL,
  nom text NOT NULL,
  storage_path text NOT NULL,
  statut text NOT NULL DEFAULT 'a_verifier',
  date_emission date,
  date_expiration date,
  notes text,
  uploaded_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON COLUMN public.mandataires_kyc_documents.type IS
  'Libre : cni, honorabilite (casier judiciaire), capacite_professionnelle (diplome IAS), rc_pro, orias, rib, autre.';
COMMENT ON COLUMN public.mandataires_kyc_documents.statut IS
  'a_verifier, valide, expire, rejete.';

CREATE INDEX IF NOT EXISTS idx_mandataires_kyc_user ON public.mandataires_kyc_documents(user_id);

ALTER TABLE public.mandataires_kyc_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Mandataire voit ses propres pieces KYC"
  ON public.mandataires_kyc_documents FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin') OR public.est_manager_actif_de(user_id));

CREATE POLICY "Mandataire depose ses propres pieces KYC"
  ON public.mandataires_kyc_documents FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admin met a jour le statut des pieces KYC"
  ON public.mandataires_kyc_documents FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR user_id = auth.uid())
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR user_id = auth.uid());

CREATE POLICY "Admin supprime une piece KYC"
  ON public.mandataires_kyc_documents FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_mandataires_kyc_updated
  BEFORE UPDATE ON public.mandataires_kyc_documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Déclarations d'heures de formation continue, une ligne par session
-- déclarée (pas une seule ligne par an) : plus fidèle à la réalité
-- (formations réparties dans l'année) et garde un historique complet.
CREATE TABLE IF NOT EXISTS public.mandataires_formations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  annee integer NOT NULL,
  heures numeric(5,2) NOT NULL CHECK (heures > 0),
  intitule text NOT NULL,
  organisme text,
  date_session date,
  justificatif_storage_path text,
  declare_par uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mandataires_formations_user_annee ON public.mandataires_formations(user_id, annee);

ALTER TABLE public.mandataires_formations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Mandataire voit ses formations"
  ON public.mandataires_formations FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin') OR public.est_manager_actif_de(user_id));

CREATE POLICY "Mandataire declare ses formations"
  ON public.mandataires_formations FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admin supprime une formation declaree a tort"
  ON public.mandataires_formations FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR (user_id = auth.uid() AND declare_par = auth.uid()));
