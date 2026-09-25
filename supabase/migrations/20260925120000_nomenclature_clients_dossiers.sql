-- Nomenclature officielle des nouvelles fiches clients et dossiers.
-- Les références historiques ne sont pas modifiées.
-- Client : CL-YYYY-NNNN
-- Dossier : DOX-YYYY-CODE-NNNN

CREATE OR REPLACE FUNCTION public.code_risque(_type text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE lower(coalesce(_type,''))
    WHEN 'emprunteur' THEN 'EMP'
    WHEN 'sante' THEN 'MUT'
    WHEN 'santé' THEN 'MUT'
    WHEN 'mutuelle' THEN 'MUT'
    WHEN 'prevoyance' THEN 'PRE'
    WHEN 'prévoyance' THEN 'PRE'
    WHEN 'trottinette' THEN 'TRO'
    WHEN 'retraite' THEN 'PER'
    WHEN 'epargne' THEN 'PER'
    WHEN 'épargne' THEN 'PER'
    WHEN 'epargne retraite' THEN 'PER'
    WHEN 'épargne retraite' THEN 'PER'
    WHEN 'assurance vie' THEN 'AVI'
    WHEN 'assurance-vie' THEN 'AVI'
    WHEN 'vie' THEN 'AVI'
    WHEN 'rcp' THEN 'RCP'
    WHEN 'responsabilite pro' THEN 'RCP'
    WHEN 'responsabilité pro' THEN 'RCP'
    WHEN 'responsabilite professionnelle' THEN 'RCP'
    WHEN 'responsabilité professionnelle' THEN 'RCP'
    WHEN 'pro' THEN 'RCP'
    WHEN 'professionnelle' THEN 'RCP'
    WHEN 'auto' THEN 'AUT'
    WHEN 'moto' THEN 'MOT'
    WHEN 'habitation' THEN 'HAB'
    WHEN 'animaux' THEN 'ANI'
    WHEN 'obseques' THEN 'OBS'
    WHEN 'sante' THEN 'MUT'
    WHEN '' THEN 'DIV'
    ELSE upper(substr(regexp_replace(
      translate(coalesce(_type,''), 'àâäéèêëîïôöùûüçÀÂÄÉÈÊËÎÏÔÖÙÛÜÇ', 'aaaeeeeiioouuucAAAEEEEIIOOUUUC'),
      '[^A-Za-z]', '', 'g'), 1, 3))
  END
$$;

CREATE OR REPLACE FUNCTION public.generer_reference(_prefixe text, _annee integer)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _cle text := _prefixe || '-' || _annee::text;
  _num integer;
  _legacy integer;
BEGIN
  -- Les nouveaux numéros CL poursuivent la séquence historique CLI.
  IF _prefixe = 'CLI' THEN
    _cle := 'CL-' || _annee::text;
    SELECT COALESCE(MAX(dernier), 0) INTO _legacy
    FROM public.reference_compteurs
    WHERE cle IN ('CLI-' || _annee::text, 'CL-' || _annee::text);

    INSERT INTO public.reference_compteurs (cle, dernier)
    VALUES (_cle, _legacy)
    ON CONFLICT (cle) DO NOTHING;

    UPDATE public.reference_compteurs
    SET dernier = GREATEST(dernier, _legacy) + 1
    WHERE cle = _cle
    RETURNING dernier INTO _num;

    RETURN 'CL-' || _annee::text || '-' || lpad(_num::text, 4, '0');
  END IF;

  -- Les nouveaux DOX poursuivent les compteurs historiques du code métier
  -- (ex. EMP-2026 = 17 -> prochain DOX-2026-EMP-0018).
  SELECT COALESCE(MAX(dernier), 0) INTO _legacy
  FROM public.reference_compteurs
  WHERE cle IN (_prefixe || '-' || _annee::text, 'DOX-' || _annee::text || '-' || _prefixe);

  INSERT INTO public.reference_compteurs (cle, dernier)
  VALUES ('DOX-' || _annee::text || '-' || _prefixe, _legacy)
  ON CONFLICT (cle) DO NOTHING;

  UPDATE public.reference_compteurs
  SET dernier = GREATEST(dernier, _legacy) + 1
  WHERE cle = 'DOX-' || _annee::text || '-' || _prefixe
  RETURNING dernier INTO _num;

  RETURN 'DOX-' || _annee::text || '-' || _prefixe || '-' || lpad(_num::text, 4, '0');
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_reference_client()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.reference := public.generer_reference('CLI', extract(year from coalesce(NEW.created_at, now()))::int);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_reference_dossier()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.reference := public.generer_reference(
    public.code_risque(NEW.type_assurance::text),
    extract(year from coalesce(NEW.created_at, now()))::int
  );
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.code_risque(text) IS 'Codes officiels de nomenclature dossier : EMP, TRO, PRE, PER, AVI, MUT, RCP. Les nouveaux dossiers utilisent DOX-YYYY-CODE-NNNN.';
COMMENT ON FUNCTION public.generer_reference(text, integer) IS 'Génère les nouvelles références officielles sans réécrire les références historiques : CL-YYYY-NNNN et DOX-YYYY-CODE-NNNN.';
