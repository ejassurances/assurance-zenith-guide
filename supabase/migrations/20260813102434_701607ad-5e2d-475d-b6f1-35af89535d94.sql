CREATE TABLE public.crm_emails (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  gmail_message_id text NOT NULL UNIQUE,
  gmail_thread_id text,
  direction text NOT NULL DEFAULT 'entrant',
  expediteur_nom text,
  expediteur_email text,
  destinataires text,
  sujet text,
  snippet text,
  recu_le timestamptz,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  dossier_id uuid REFERENCES public.dossiers(id) ON DELETE SET NULL,
  contrat_id uuid REFERENCES public.contrats(id) ON DELETE SET NULL,
  compagnie_id uuid REFERENCES public.compagnies(id) ON DELETE SET NULL,
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_emails TO authenticated;
GRANT ALL ON public.crm_emails TO service_role;

ALTER TABLE public.crm_emails ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff gere les emails CRM" ON public.crm_emails FOR ALL TO authenticated
USING (public.current_user_role() IN ('admin','mandataire'))
WITH CHECK (public.current_user_role() IN ('admin','mandataire'));

CREATE INDEX idx_crm_emails_client ON public.crm_emails(client_id);
CREATE INDEX idx_crm_emails_compagnie ON public.crm_emails(compagnie_id);
CREATE INDEX idx_crm_emails_dossier ON public.crm_emails(dossier_id);
CREATE INDEX idx_crm_emails_contrat ON public.crm_emails(contrat_id);

CREATE TRIGGER update_crm_emails_updated_at BEFORE UPDATE ON public.crm_emails
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();