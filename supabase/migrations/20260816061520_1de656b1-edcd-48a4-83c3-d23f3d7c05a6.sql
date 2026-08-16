CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.unschedule('relance-sinistres-3j') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'relance-sinistres-3j'
);

SELECT cron.schedule(
  'relance-sinistres-3j',
  '30 8 * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--858511e9-52da-414d-be08-3727111ac35d.lovable.app/api/public/relance-sinistres',
    headers := '{"Content-Type": "application/json", "apikey": "sb_publishable_fX6ES4Ygmp7ciNow6D__aA_HDcn0vXB"}'::jsonb,
    body := '{}'::jsonb
  ) as request_id;
  $$
);