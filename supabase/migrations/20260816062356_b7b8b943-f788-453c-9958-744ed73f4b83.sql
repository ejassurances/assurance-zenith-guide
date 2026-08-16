ALTER TABLE public.crm_emails
  DROP COLUMN IF EXISTS snippet,
  DROP COLUMN IF EXISTS sujet,
  DROP COLUMN IF EXISTS expediteur_nom,
  DROP COLUMN IF EXISTS expediteur_email,
  DROP COLUMN IF EXISTS destinataires;