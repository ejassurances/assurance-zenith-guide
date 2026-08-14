-- Réduction RGPD des réponses Néoliane conservées : liste blanche d'identifiants techniques.
CREATE OR REPLACE FUNCTION public.neoliane_reduire_json(_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  _autorisees text[] := ARRAY[
    'id','profileId','profile_id','cartId','cart_id','offerId','offer_id',
    'contractId','contract_id','contractIds','contracts','demarcheId','demarche_id',
    'pricingId','pricing_id','gammeId','formulaId','productId','subscriptionId',
    'status','statut','state','etape','step','code','codes','errorCode',
    'isValid','valid','validated','warnings','errors','eventName','event',
    'signType','type','types','createdAt','updatedAt','dateEffect','amount',
    'label','gammeLabel','formulaLabel','received','refreshed'
  ];
  _res jsonb := '{}'::jsonb;
  _cle text;
  _val jsonb;
BEGIN
  IF _data IS NULL OR jsonb_typeof(_data) = 'null' THEN
    RETURN NULL;
  END IF;

  IF jsonb_typeof(_data) = 'array' THEN
    RETURN COALESCE(
      (SELECT jsonb_agg(public.neoliane_reduire_json(e)) FROM jsonb_array_elements(_data) e),
      '[]'::jsonb
    );
  END IF;

  IF jsonb_typeof(_data) <> 'object' THEN
    RETURN _data;
  END IF;

  FOR _cle, _val IN SELECT key, value FROM jsonb_each(_data) LOOP
    IF _cle = ANY (_autorisees) THEN
      IF jsonb_typeof(_val) IN ('object', 'array') THEN
        _res := _res || jsonb_build_object(_cle, public.neoliane_reduire_json(_val));
      ELSIF jsonb_typeof(_val) = 'string' AND length(_val #>> '{}') > 200 THEN
        -- Valeur anormalement longue (document Base64, texte libre) : écartée.
        _res := _res || jsonb_build_object(_cle, '[retiré]');
      ELSE
        _res := _res || jsonb_build_object(_cle, _val);
      END IF;
    ELSIF jsonb_typeof(_val) IN ('object', 'array') THEN
      -- On descend pour récupérer d'éventuels identifiants imbriqués.
      DECLARE
        _enfant jsonb := public.neoliane_reduire_json(_val);
      BEGIN
        IF _enfant IS NOT NULL AND _enfant <> '{}'::jsonb AND _enfant <> '[]'::jsonb THEN
          _res := _res || jsonb_build_object(_cle, _enfant);
        END IF;
      END;
    END IF;
  END LOOP;

  RETURN _res;
END;
$$;

COMMENT ON FUNCTION public.neoliane_reduire_json(jsonb) IS
  'Ne conserve que les identifiants techniques d''une réponse Néoliane (RGPD : minimisation).';

-- Application rétroactive aux lignes existantes.
UPDATE public.neoliane_parcours
SET derniere_reponse = public.neoliane_reduire_json(derniere_reponse),
    avertissements = public.neoliane_reduire_json(avertissements),
    derniere_erreur = left(derniere_erreur, 200)
WHERE derniere_reponse IS NOT NULL
   OR avertissements IS NOT NULL
   OR derniere_erreur IS NOT NULL;

UPDATE public.neoliane_evenements
SET payload = public.neoliane_reduire_json(payload),
    etat_rafraichi = public.neoliane_reduire_json(etat_rafraichi),
    erreur = left(erreur, 200)
WHERE payload IS NOT NULL
   OR etat_rafraichi IS NOT NULL
   OR erreur IS NOT NULL;

-- Durée de conservation : 90 jours pour le journal technique des notifications.
CREATE OR REPLACE FUNCTION public.purger_neoliane_evenements()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.neoliane_evenements
  WHERE created_at < now() - interval '90 days';
$$;

REVOKE ALL ON FUNCTION public.purger_neoliane_evenements() FROM anon, authenticated;

SELECT cron.schedule(
  'purge-neoliane-evenements',
  '20 3 * * *',
  $$SELECT public.purger_neoliane_evenements();$$
);