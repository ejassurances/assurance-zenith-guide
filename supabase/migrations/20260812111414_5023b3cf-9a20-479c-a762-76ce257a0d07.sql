-- 1) Colonnes complémentaires
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;
ALTER TABLE public.dossiers ADD COLUMN IF NOT EXISTS cree_automatiquement boolean NOT NULL DEFAULT false;
ALTER TABLE public.dossiers ADD COLUMN IF NOT EXISTS relance_pieces_envoyee_le timestamptz;
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS categorie text NOT NULL DEFAULT 'dossier';

-- 2) Table de suivi des pièces
CREATE TABLE IF NOT EXISTS public.dossier_pieces_requises (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dossier_id uuid NOT NULL REFERENCES public.dossiers(id) ON DELETE CASCADE,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  code text NOT NULL,
  libelle text NOT NULL,
  categorie text NOT NULL DEFAULT 'dossier',
  obligatoire boolean NOT NULL DEFAULT true,
  statut text NOT NULL DEFAULT 'manquante',
  document_id uuid REFERENCES public.documents(id) ON DELETE SET NULL,
  kyc_document_id uuid REFERENCES public.client_kyc_documents(id) ON DELETE SET NULL,
  recue_le timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (dossier_id, code)
);

CREATE INDEX IF NOT EXISTS idx_dpr_dossier ON public.dossier_pieces_requises(dossier_id);
CREATE INDEX IF NOT EXISTS idx_dpr_client ON public.dossier_pieces_requises(client_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dossier_pieces_requises TO authenticated;
GRANT ALL ON public.dossier_pieces_requises TO service_role;

ALTER TABLE public.dossier_pieces_requises ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff gere les pieces requises"
ON public.dossier_pieces_requises FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'mandataire') OR public.can_access_dossier(dossier_id))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'mandataire') OR public.can_access_dossier(dossier_id));

CREATE POLICY "Client voit les pieces de ses dossiers"
ON public.dossier_pieces_requises FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.clients c
    WHERE c.id = dossier_pieces_requises.client_id AND c.user_id = auth.uid()
  )
);

CREATE POLICY "Client met a jour les pieces de ses dossiers"
ON public.dossier_pieces_requises FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.clients c
    WHERE c.id = dossier_pieces_requises.client_id AND c.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.clients c
    WHERE c.id = dossier_pieces_requises.client_id AND c.user_id = auth.uid()
  )
);

CREATE TRIGGER trg_dpr_updated BEFORE UPDATE ON public.dossier_pieces_requises
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();