-- 1. Seul le cabinet peut piloter la gestion d'un sinistre
CREATE OR REPLACE FUNCTION public.trg_sinistre_gestion_staff_only()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  IF public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'mandataire') THEN
    RETURN NEW;
  END IF;
  IF NEW.etape IS DISTINCT FROM OLD.etape
     OR NEW.statut IS DISTINCT FROM OLD.statut
     OR NEW.numero_compagnie IS DISTINCT FROM OLD.numero_compagnie
     OR NEW.montant_indemnise IS DISTINCT FROM OLD.montant_indemnise
     OR NEW.declare_compagnie_le IS DISTINCT FROM OLD.declare_compagnie_le
     OR NEW.clos_le IS DISTINCT FROM OLD.clos_le THEN
    RAISE EXCEPTION 'Seul le cabinet peut modifier la gestion d''un sinistre';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sinistre_gestion_staff_only ON public.sinistres;
CREATE TRIGGER trg_sinistre_gestion_staff_only
BEFORE UPDATE ON public.sinistres
FOR EACH ROW EXECUTE FUNCTION public.trg_sinistre_gestion_staff_only();

-- 2. Relance quotidienne des compagnies sans retour de souscription
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.unschedule('relance-souscription-compagnie')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'relance-souscription-compagnie');

SELECT cron.schedule(
  'relance-souscription-compagnie',
  '30 8 * * 1-5',
  $$
  SELECT net.http_post(
    url := 'https://project--858511e9-52da-414d-be08-3727111ac35d.lovable.app/api/public/relance-souscription',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-relance-token', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'RELANCE_PIECES_TOKEN' LIMIT 1)
    ),
    body := '{}'::jsonb
  );
  $$
);