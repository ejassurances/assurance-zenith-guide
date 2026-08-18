CREATE TABLE public.reclamations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  contrat_id uuid REFERENCES public.contrats(id) ON DELETE SET NULL,
  gmail_message_id text UNIQUE,
  resume text,
  concerne text NOT NULL DEFAULT 'incertain' CHECK (concerne IN ('cabinet','compagnie','incertain')),
  solution_proposee text,
  statut text NOT NULL DEFAULT 'ouvert' CHECK (statut IN ('ouvert','analyse','accuse_reception_envoye','en_attente_reponse','clos')),
  date_ouverture timestamptz NOT NULL DEFAULT now(),
  date_accuse_reception timestamptz,
  date_cloture timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.reclamations TO authenticated;
GRANT ALL ON public.reclamations TO service_role;

ALTER TABLE public.reclamations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Cabinet gere les reclamations"
ON public.reclamations FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'mandataire'))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'mandataire'));

CREATE INDEX idx_reclamations_client ON public.reclamations(client_id);
CREATE INDEX idx_reclamations_statut ON public.reclamations(statut);

CREATE TRIGGER trg_reclamations_updated_at
BEFORE UPDATE ON public.reclamations
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.compagnies ADD COLUMN IF NOT EXISTS email_reclamations text;