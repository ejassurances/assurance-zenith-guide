-- Traçabilité du traitement Gmail sur l'historique des emails (aucune donnée existante modifiée)
ALTER TABLE public.crm_emails
  ADD COLUMN IF NOT EXISTS expediteur_email text,
  ADD COLUMN IF NOT EXISTS expediteur_nom text,
  ADD COLUMN IF NOT EXISTS sujet text,
  ADD COLUMN IF NOT EXISTS lien_gmail text,
  ADD COLUMN IF NOT EXISTS lien_reponse text,
  ADD COLUMN IF NOT EXISTS brouillon_id text,
  ADD COLUMN IF NOT EXISTS lien_brouillon text,
  ADD COLUMN IF NOT EXISTS decision text,
  ADD COLUMN IF NOT EXISTS confiance numeric,
  ADD COLUMN IF NOT EXISTS motif text,
  ADD COLUMN IF NOT EXISTS statut_traitement text NOT NULL DEFAULT 'a_traiter',
  ADD COLUMN IF NOT EXISTS traite_le timestamptz,
  ADD COLUMN IF NOT EXISTS label_gmail text;

CREATE UNIQUE INDEX IF NOT EXISTS crm_emails_gmail_message_id_key
  ON public.crm_emails (gmail_message_id);

CREATE INDEX IF NOT EXISTS crm_emails_statut_traitement_idx
  ON public.crm_emails (statut_traitement, recu_le DESC);

-- Anti-doublon des pièces jointes issues d'un message Gmail
ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS gmail_message_id text,
  ADD COLUMN IF NOT EXISTS empreinte_fichier text;

CREATE UNIQUE INDEX IF NOT EXISTS documents_gmail_piece_key
  ON public.documents (gmail_message_id, file_name)
  WHERE gmail_message_id IS NOT NULL;

-- Historique des décisions de traitement (automatiques et humaines)
CREATE TABLE IF NOT EXISTS public.email_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  crm_email_id uuid NOT NULL REFERENCES public.crm_emails(id) ON DELETE CASCADE,
  gmail_message_id text NOT NULL,
  decision text NOT NULL,
  origine text NOT NULL DEFAULT 'automatique',
  motif text,
  confiance numeric,
  label_gmail text,
  par uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS email_decisions_email_idx
  ON public.email_decisions (crm_email_id, created_at DESC);

GRANT SELECT, INSERT ON public.email_decisions TO authenticated;
GRANT ALL ON public.email_decisions TO service_role;

ALTER TABLE public.email_decisions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff lit les decisions email" ON public.email_decisions;
CREATE POLICY "Staff lit les decisions email"
ON public.email_decisions FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'mandataire'));

DROP POLICY IF EXISTS "Staff ecrit les decisions email" ON public.email_decisions;
CREATE POLICY "Staff ecrit les decisions email"
ON public.email_decisions FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'mandataire'));