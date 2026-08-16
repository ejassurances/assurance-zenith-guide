ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS type_document text;

CREATE TABLE IF NOT EXISTS public.client_reponses_ia (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  contrat_id uuid REFERENCES public.contrats(id) ON DELETE SET NULL,
  gmail_message_id text,
  gmail_thread_id text,
  email_sujet text,
  categorie text NOT NULL,
  intention text,
  confiance numeric,
  resume text,
  destinataire text,
  objet text,
  corps text,
  statut text NOT NULL DEFAULT 'brouillon',
  motif text,
  created_by uuid,
  envoye_le timestamptz,
  envoye_par uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS client_reponses_ia_client_idx ON public.client_reponses_ia (client_id);
CREATE UNIQUE INDEX IF NOT EXISTS client_reponses_ia_message_idx ON public.client_reponses_ia (gmail_message_id) WHERE gmail_message_id IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_reponses_ia TO authenticated;
GRANT ALL ON public.client_reponses_ia TO service_role;

ALTER TABLE public.client_reponses_ia ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Cabinet gere les reponses IA"
ON public.client_reponses_ia FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'mandataire'))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'mandataire'));

CREATE TRIGGER client_reponses_ia_updated_at BEFORE UPDATE ON public.client_reponses_ia
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();