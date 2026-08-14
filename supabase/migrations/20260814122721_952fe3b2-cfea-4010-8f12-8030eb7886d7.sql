ALTER TABLE public.produits ADD COLUMN IF NOT EXISTS assureur_porteur text;

CREATE TABLE IF NOT EXISTS public.emails_planifies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lot text,
  template text NOT NULL,
  destinataire text NOT NULL,
  donnees jsonb NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key text UNIQUE,
  envoyer_le timestamptz NOT NULL DEFAULT now(),
  envoye_le timestamptz,
  statut text NOT NULL DEFAULT 'en_attente',
  erreur text,
  contexte jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.emails_planifies TO authenticated;
GRANT ALL ON public.emails_planifies TO service_role;

ALTER TABLE public.emails_planifies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read scheduled emails"
ON public.emails_planifies FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS emails_planifies_du_idx
ON public.emails_planifies (statut, envoyer_le);

CREATE TRIGGER update_emails_planifies_updated_at
BEFORE UPDATE ON public.emails_planifies
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.schedule(
  'envois-planifies',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--858511e9-52da-414d-be08-3727111ac35d.lovable.app/api/public/envois-planifies',
    headers := '{"Content-Type": "application/json", "apikey": "sb_publishable_fX6ES4Ygmp7ciNow6D__aA_HDcn0vXB"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);