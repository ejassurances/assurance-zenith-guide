ALTER TABLE public.crm_emails
  ADD COLUMN IF NOT EXISTS triage_ia jsonb,
  ADD COLUMN IF NOT EXISTS triage_le timestamptz;

ALTER TABLE public.dossier_devis_classements
  ADD COLUMN IF NOT EXISTS devis_retenu_id uuid REFERENCES public.dossier_devis(id) ON DELETE SET NULL;

ALTER TABLE public.dossiers
  ADD COLUMN IF NOT EXISTS accuse_reception_envoye_le timestamptz;

SELECT cron.schedule(
  'relance-pieces-j2',
  '15 8 * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--858511e9-52da-414d-be08-3727111ac35d.lovable.app/api/public/relance-pieces',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'sb_publishable_fX6ES4Ygmp7ciNow6D__aA_HDcn0vXB'
    ),
    body := '{}'::jsonb
  );
  $$
);