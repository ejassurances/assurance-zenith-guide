
-- 1. Type d'assurance + recueil des besoins sur dossiers
ALTER TABLE public.dossiers
  ADD COLUMN IF NOT EXISTS type_assurance text NOT NULL DEFAULT 'emprunteur'
    CHECK (type_assurance IN ('emprunteur','prevoyance_sante','epargne_retraite','iard')),
  ADD COLUMN IF NOT EXISTS recueil_besoins jsonb;

-- 2. Table lettres_mission
CREATE TABLE IF NOT EXISTS public.lettres_mission (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dossier_id uuid NOT NULL REFERENCES public.dossiers(id) ON DELETE CASCADE,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  type_assurance text NOT NULL,
  contenu jsonb NOT NULL,
  statut text NOT NULL DEFAULT 'envoyee' CHECK (statut IN ('brouillon','envoyee','signee','annulee')),
  email_destinataire text,
  envoye_le timestamptz,
  envoye_par uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  signature_png text,
  signed_at timestamptz,
  signed_ip text,
  signed_ua text,
  document_hash text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lettres_mission TO authenticated;
GRANT ALL ON public.lettres_mission TO service_role;

ALTER TABLE public.lettres_mission ENABLE ROW LEVEL SECURITY;

-- Admins & mandataires : accès complet
CREATE POLICY "lm_admin_mandataire_all" ON public.lettres_mission
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'mandataire'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'mandataire'));

-- Prescripteur : sur ses propres dossiers
CREATE POLICY "lm_prescripteur_own" ON public.lettres_mission
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(),'prescripteur')
    AND EXISTS (SELECT 1 FROM public.dossiers d WHERE d.id = dossier_id AND (d.apporteur_id = auth.uid() OR d.created_by = auth.uid()))
  )
  WITH CHECK (
    public.has_role(auth.uid(),'prescripteur')
    AND EXISTS (SELECT 1 FROM public.dossiers d WHERE d.id = dossier_id AND (d.apporteur_id = auth.uid() OR d.created_by = auth.uid()))
  );

-- Client : lecture et signature de sa propre lettre
CREATE POLICY "lm_client_read" ON public.lettres_mission
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_id AND c.user_id = auth.uid()));

CREATE POLICY "lm_client_sign" ON public.lettres_mission
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_id AND c.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_id AND c.user_id = auth.uid()));

CREATE TRIGGER update_lettres_mission_updated_at
  BEFORE UPDATE ON public.lettres_mission
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS lettres_mission_dossier_idx ON public.lettres_mission(dossier_id);
CREATE INDEX IF NOT EXISTS lettres_mission_client_idx ON public.lettres_mission(client_id);
