SELECT cron.schedule(
  'revue-lcbft-quotidienne',
  '0 9 * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--858511e9-52da-414d-be08-3727111ac35d.lovable.app/api/public/revue-lcbft',
    headers := '{"Content-Type": "application/json", "apikey": "sb_publishable_fX6ES4Ygmp7ciNow6D__aA_HDcn0vXB"}'::jsonb,
    body := '{}'::jsonb
  ) as request_id;
  $$
);