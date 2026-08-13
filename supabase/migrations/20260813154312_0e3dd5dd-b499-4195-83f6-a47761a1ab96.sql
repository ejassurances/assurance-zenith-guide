-- 1. Suivi de souscription sur les dossiers
ALTER TABLE public.dossiers
  ADD COLUMN IF NOT EXISTS souscription_email_compagnie text,
  ADD COLUMN IF NOT EXISTS souscription_envoyee_le timestamptz,
  ADD COLUMN IF NOT EXISTS souscription_relance_le timestamptz,
  ADD COLUMN IF NOT EXISTS souscription_relances_nb integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS souscription_retour_le timestamptz;

-- 2. Workflow sinistres
ALTER TABLE public.sinistres
  ADD COLUMN IF NOT EXISTS etape text NOT NULL DEFAULT 'declare',
  ADD COLUMN IF NOT EXISTS branche text,
  ADD COLUMN IF NOT EXISTS numero_compagnie text,
  ADD COLUMN IF NOT EXISTS declare_le timestamptz,
  ADD COLUMN IF NOT EXISTS declare_compagnie_le timestamptz,
  ADD COLUMN IF NOT EXISTS clos_le timestamptz,
  ADD COLUMN IF NOT EXISTS montant_indemnise numeric(14,2),
  ADD COLUMN IF NOT EXISTS declare_par_client boolean NOT NULL DEFAULT false;

ALTER TABLE public.sinistres
  DROP CONSTRAINT IF EXISTS sinistres_etape_check;
ALTER TABLE public.sinistres
  ADD CONSTRAINT sinistres_etape_check
  CHECK (etape IN ('declare','pieces','expertise','indemnisation','clos','refuse'));

-- 3. Pièces requises d'un sinistre
CREATE TABLE public.sinistre_pieces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sinistre_id uuid NOT NULL REFERENCES public.sinistres(id) ON DELETE CASCADE,
  code text NOT NULL,
  libelle text NOT NULL,
  obligatoire boolean NOT NULL DEFAULT true,
  statut text NOT NULL DEFAULT 'manquante' CHECK (statut IN ('manquante','recue','refusee')),
  storage_path text,
  nom_fichier text,
  mime_type text,
  taille integer,
  commentaire text,
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sinistre_id, code)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sinistre_pieces TO authenticated;
GRANT ALL ON public.sinistre_pieces TO service_role;
ALTER TABLE public.sinistre_pieces ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sinistre_pieces select" ON public.sinistre_pieces FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.sinistres s WHERE s.id = sinistre_id AND public.can_access_client(s.client_id)));

CREATE POLICY "sinistre_pieces insert" ON public.sinistre_pieces FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.sinistres s WHERE s.id = sinistre_id AND public.can_access_client(s.client_id)));

CREATE POLICY "sinistre_pieces update" ON public.sinistre_pieces FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.sinistres s WHERE s.id = sinistre_id AND public.can_access_client(s.client_id)))
WITH CHECK (EXISTS (SELECT 1 FROM public.sinistres s WHERE s.id = sinistre_id AND public.can_access_client(s.client_id)));

CREATE POLICY "sinistre_pieces delete staff" ON public.sinistre_pieces FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'mandataire'));

CREATE TRIGGER trg_sinistre_pieces_updated BEFORE UPDATE ON public.sinistre_pieces
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. Journal du sinistre
CREATE TABLE public.sinistre_evenements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sinistre_id uuid NOT NULL REFERENCES public.sinistres(id) ON DELETE CASCADE,
  type text NOT NULL DEFAULT 'note' CHECK (type IN ('etape','echange_compagnie','note','piece')),
  ancienne_etape text,
  nouvelle_etape text,
  contenu text,
  par uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_sinistre_evenements_sinistre ON public.sinistre_evenements(sinistre_id, created_at DESC);

GRANT SELECT, INSERT ON public.sinistre_evenements TO authenticated;
GRANT ALL ON public.sinistre_evenements TO service_role;
ALTER TABLE public.sinistre_evenements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sinistre_evenements select" ON public.sinistre_evenements FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.sinistres s WHERE s.id = sinistre_id AND public.can_access_client(s.client_id)));

CREATE POLICY "sinistre_evenements insert staff" ON public.sinistre_evenements FOR INSERT TO authenticated
WITH CHECK (
  (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'mandataire'))
  AND EXISTS (SELECT 1 FROM public.sinistres s WHERE s.id = sinistre_id AND public.can_access_client(s.client_id))
);