CREATE TABLE IF NOT EXISTS public.reference_compteurs (
  cle text PRIMARY KEY,
  dernier integer NOT NULL DEFAULT 0
);
GRANT ALL ON public.reference_compteurs TO service_role;
ALTER TABLE public.reference_compteurs ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.code_risque(_type text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE lower(coalesce(_type,''))
    WHEN 'emprunteur' THEN 'EMP'
    WHEN 'sante' THEN 'SAN'
    WHEN 'santé' THEN 'SAN'
    WHEN 'prevoyance' THEN 'PRV'
    WHEN 'prévoyance' THEN 'PRV'
    WHEN 'auto' THEN 'AUT'
    WHEN 'moto' THEN 'MOT'
    WHEN 'habitation' THEN 'HAB'
    WHEN 'trottinette' THEN 'TRO'
    WHEN 'animaux' THEN 'ANI'
    WHEN 'pro' THEN 'PRO'
    WHEN 'professionnelle' THEN 'PRO'
    WHEN 'obseques' THEN 'OBS'
    WHEN 'retraite' THEN 'RET'
    WHEN 'epargne' THEN 'EPA'
    WHEN '' THEN 'DIV'
    ELSE upper(substr(regexp_replace(
      translate(coalesce(_type,''), 'àâäéèêëîïôöùûüçÀÂÄÉÈÊËÎÏÔÖÙÛÜÇ', 'aaaeeeeiioouuucAAAEEEEIIOOUUUC'),
      '[^A-Za-z]', '', 'g'), 1, 3))
  END
$$;

CREATE OR REPLACE FUNCTION public.generer_reference(_prefixe text, _annee integer)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _cle text := _prefixe || '-' || _annee::text;
  _num integer;
BEGIN
  INSERT INTO public.reference_compteurs (cle, dernier)
  VALUES (_cle, 1)
  ON CONFLICT (cle) DO UPDATE SET dernier = public.reference_compteurs.dernier + 1
  RETURNING dernier INTO _num;

  IF _prefixe = 'CLI' THEN
    RETURN 'CLI-' || _annee::text || '-' || lpad(_num::text, 4, '0');
  END IF;
  RETURN 'EJ-' || _annee::text || '-' || _prefixe || '-' || lpad(_num::text, 4, '0');
END;
$$;

ALTER TABLE public.reclamations ADD COLUMN IF NOT EXISTS reference text;

CREATE OR REPLACE FUNCTION public.trg_reference_client()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.reference := public.generer_reference('CLI', extract(year from coalesce(NEW.created_at, now()))::int);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_reference_dossier()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.reference := public.generer_reference(
    public.code_risque(NEW.type_assurance::text),
    extract(year from coalesce(NEW.created_at, now()))::int
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_reference_sinistre()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.reference := public.generer_reference('SIN', extract(year from coalesce(NEW.created_at, now()))::int);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_reference_reclamation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.reference := public.generer_reference('REC', extract(year from coalesce(NEW.created_at, now()))::int);
  RETURN NEW;
END;
$$;

ALTER TABLE public.clients ALTER COLUMN reference DROP DEFAULT;
ALTER TABLE public.dossiers ALTER COLUMN reference DROP DEFAULT;

DROP TRIGGER IF EXISTS trg_reference_clients ON public.clients;
CREATE TRIGGER trg_reference_clients BEFORE INSERT ON public.clients
FOR EACH ROW EXECUTE FUNCTION public.trg_reference_client();

DROP TRIGGER IF EXISTS trg_reference_dossiers ON public.dossiers;
CREATE TRIGGER trg_reference_dossiers BEFORE INSERT ON public.dossiers
FOR EACH ROW EXECUTE FUNCTION public.trg_reference_dossier();

DROP TRIGGER IF EXISTS trg_reference_sinistres ON public.sinistres;
CREATE TRIGGER trg_reference_sinistres BEFORE INSERT ON public.sinistres
FOR EACH ROW EXECUTE FUNCTION public.trg_reference_sinistre();

DROP TRIGGER IF EXISTS trg_reference_reclamations ON public.reclamations;
CREATE TRIGGER trg_reference_reclamations BEFORE INSERT ON public.reclamations
FOR EACH ROW EXECUTE FUNCTION public.trg_reference_reclamation();

WITH num AS (
  SELECT id,
         extract(year from created_at)::int AS annee,
         row_number() OVER (PARTITION BY extract(year from created_at)::int ORDER BY created_at, id) AS rang
  FROM public.clients
)
UPDATE public.clients c
SET reference = 'CLI-' || num.annee::text || '-' || lpad(num.rang::text, 4, '0')
FROM num WHERE num.id = c.id;

WITH num AS (
  SELECT id,
         public.code_risque(type_assurance::text) AS risque,
         extract(year from created_at)::int AS annee,
         row_number() OVER (
           PARTITION BY extract(year from created_at)::int, public.code_risque(type_assurance::text)
           ORDER BY created_at, id
         ) AS rang
  FROM public.dossiers
)
UPDATE public.dossiers d
SET reference = 'EJ-' || num.annee::text || '-' || num.risque || '-' || lpad(num.rang::text, 4, '0')
FROM num WHERE num.id = d.id;

WITH num AS (
  SELECT id, extract(year from created_at)::int AS annee,
         row_number() OVER (PARTITION BY extract(year from created_at)::int ORDER BY created_at, id) AS rang
  FROM public.sinistres
)
UPDATE public.sinistres s
SET reference = 'EJ-' || num.annee::text || '-SIN-' || lpad(num.rang::text, 4, '0')
FROM num WHERE num.id = s.id;

WITH num AS (
  SELECT id, extract(year from created_at)::int AS annee,
         row_number() OVER (PARTITION BY extract(year from created_at)::int ORDER BY created_at, id) AS rang
  FROM public.reclamations
)
UPDATE public.reclamations r
SET reference = 'EJ-' || num.annee::text || '-REC-' || lpad(num.rang::text, 4, '0')
FROM num WHERE num.id = r.id;

INSERT INTO public.reference_compteurs (cle, dernier)
SELECT 'CLI-' || extract(year from created_at)::int, count(*) FROM public.clients GROUP BY 1
ON CONFLICT (cle) DO UPDATE SET dernier = GREATEST(public.reference_compteurs.dernier, EXCLUDED.dernier);

INSERT INTO public.reference_compteurs (cle, dernier)
SELECT public.code_risque(type_assurance::text) || '-' || extract(year from created_at)::int, count(*)
FROM public.dossiers GROUP BY 1
ON CONFLICT (cle) DO UPDATE SET dernier = GREATEST(public.reference_compteurs.dernier, EXCLUDED.dernier);

INSERT INTO public.reference_compteurs (cle, dernier)
SELECT 'SIN-' || extract(year from created_at)::int, count(*) FROM public.sinistres GROUP BY 1
ON CONFLICT (cle) DO UPDATE SET dernier = GREATEST(public.reference_compteurs.dernier, EXCLUDED.dernier);

INSERT INTO public.reference_compteurs (cle, dernier)
SELECT 'REC-' || extract(year from created_at)::int, count(*) FROM public.reclamations GROUP BY 1
ON CONFLICT (cle) DO UPDATE SET dernier = GREATEST(public.reference_compteurs.dernier, EXCLUDED.dernier);

CREATE UNIQUE INDEX IF NOT EXISTS clients_reference_key ON public.clients (reference);
CREATE UNIQUE INDEX IF NOT EXISTS dossiers_reference_key ON public.dossiers (reference);
CREATE UNIQUE INDEX IF NOT EXISTS sinistres_reference_key ON public.sinistres (reference);
CREATE UNIQUE INDEX IF NOT EXISTS reclamations_reference_key ON public.reclamations (reference);