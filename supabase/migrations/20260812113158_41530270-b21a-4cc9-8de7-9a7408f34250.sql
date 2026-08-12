SELECT cron.unschedule('rappels-expiration-documents')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'rappels-expiration-documents');

SELECT cron.schedule(
  'rappels-expiration-documents',
  '0 8 * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--858511e9-52da-414d-be08-3727111ac35d.lovable.app/api/public/rappels-expiration',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'sb_publishable_fX6ES4Ygmp7ciNow6D__aA_HDcn0vXB'
    ),
    body := '{}'::jsonb
  );
  $$
);