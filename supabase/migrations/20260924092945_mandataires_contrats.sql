-- Contrat interne mandataire (texte validé avec Erwan le 24/09/2026) —
-- même mécanisme de signature électronique que la lettre de mission et le
-- devoir de conseil déjà en place.

CREATE TABLE IF NOT EXISTS public.mandataires_contrats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reference text NOT NULL,
  statut text NOT NULL DEFAULT 'envoye' CHECK (statut IN ('envoye','signe')),
  contenu jsonb NOT NULL DEFAULT '{}'::jsonb,
  hash text,
  pdf_path text,
  signature_png text,
  signed_at timestamptz,
  signed_ip text,
  signed_ua text,
  envoye_le timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mandataires_contrats_user ON public.mandataires_contrats(user_id);

ALTER TABLE public.mandataires_contrats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Voir son propre contrat mandataire"
  ON public.mandataires_contrats FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admin cree le contrat mandataire"
  ON public.mandataires_contrats FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Mandataire signe son propre contrat"
  ON public.mandataires_contrats FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND statut = 'envoye')
  WITH CHECK (user_id = auth.uid());
