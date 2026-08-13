CREATE OR REPLACE FUNCTION public.trg_dossier_lier_client()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.client_id IS NULL AND NEW.client_email IS NOT NULL THEN
    SELECT c.id INTO NEW.client_id
    FROM public.clients c
    WHERE lower(c.email) = lower(NEW.client_email)
    ORDER BY c.created_at ASC
    LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS dossiers_lier_client ON public.dossiers;
CREATE TRIGGER dossiers_lier_client
BEFORE INSERT OR UPDATE OF client_email, client_id ON public.dossiers
FOR EACH ROW EXECUTE FUNCTION public.trg_dossier_lier_client();

CREATE OR REPLACE FUNCTION public.trg_devoir_conseil_lier_client()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.client_id IS NULL THEN
    SELECT d.client_id INTO NEW.client_id
    FROM public.dossiers d
    WHERE d.id = NEW.dossier_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS devoirs_conseil_lier_client ON public.devoirs_conseil;
CREATE TRIGGER devoirs_conseil_lier_client
BEFORE INSERT OR UPDATE OF dossier_id, client_id ON public.devoirs_conseil
FOR EACH ROW EXECUTE FUNCTION public.trg_devoir_conseil_lier_client();

REVOKE EXECUTE ON FUNCTION public.trg_dossier_lier_client() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_devoir_conseil_lier_client() FROM PUBLIC, anon, authenticated;

UPDATE public.dossiers d
SET client_id = c.id
FROM public.clients c
WHERE d.client_id IS NULL
  AND d.client_email IS NOT NULL
  AND lower(c.email) = lower(d.client_email);

UPDATE public.devoirs_conseil dc
SET client_id = d.client_id
FROM public.dossiers d
WHERE dc.dossier_id = d.id AND dc.client_id IS NULL AND d.client_id IS NOT NULL;