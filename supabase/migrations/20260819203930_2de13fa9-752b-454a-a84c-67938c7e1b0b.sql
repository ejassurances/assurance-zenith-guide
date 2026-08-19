-- 1) Correction des taux saisis en pourcentage (ex : 0.358 pour 0,358 %)
UPDATE public.contrats SET taux_assurance_annuel = taux_assurance_annuel / 100
WHERE taux_assurance_annuel IS NOT NULL AND taux_assurance_annuel > 0.05;
UPDATE public.contrats SET taux_pret = taux_pret / 100
WHERE taux_pret IS NOT NULL AND taux_pret > 0.2;

-- 2) Garde-fou dans le calcul des échéances : un taux saisi en % est ramené en décimal
CREATE OR REPLACE FUNCTION public.recalculer_echeances_contrat(_contrat_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  c            public.contrats%ROWTYPE;
  produit_row  public.produits%ROWTYPE;
  annees       integer;
  y            integer;
  d_start      date;
  d_end        date;
  capital      numeric(14,2);
  crd_debut    numeric(14,2);
  crd_fin      numeric(14,2);
  base         numeric(14,2);
  prime        numeric(14,2);
  comm_cab     numeric(14,2);
  taux_m       numeric;
  assiette_m   text;
  taux_p       numeric;
  assiette_p   text;
  comm_m       numeric(14,2);
  comm_p       numeric(14,2);
  base_partenaire numeric(14,2);
  mensualite   numeric(14,2);
  i_mens       numeric;
  n_mens       integer;
  tx_ass       numeric;
  tx_pret      numeric;
BEGIN
  INSERT INTO public.audit_logs (actor_id, action, target_type, target_id, metadata)
  VALUES (auth.uid(), 'EXECUTE', 'function:recalculer_echeances_contrat', _contrat_id::text, NULL);

  SELECT * INTO c FROM public.contrats WHERE id = _contrat_id;
  IF NOT FOUND THEN RETURN; END IF;

  DELETE FROM public.contrat_echeances WHERE contrat_id = _contrat_id;

  IF c.date_effet IS NULL THEN RETURN; END IF;

  -- Normalisation : un taux d'assurance > 5 % ou un taux de prêt > 20 % a été
  -- saisi en points de pourcentage, on le ramène en décimal.
  tx_ass := COALESCE(c.taux_assurance_annuel, 0);
  IF tx_ass > 0.05 THEN tx_ass := tx_ass / 100; END IF;
  tx_pret := COALESCE(c.taux_pret, 0);
  IF tx_pret > 0.2 THEN tx_pret := tx_pret / 100; END IF;

  IF c.duree_mois IS NOT NULL THEN
    annees := GREATEST(1, CEIL(c.duree_mois::numeric / 12));
  ELSE
    annees := 1;
  END IF;

  IF c.produit_id IS NOT NULL THEN
    SELECT * INTO produit_row FROM public.produits WHERE id = c.produit_id;
  END IF;

  capital := COALESCE(c.capital_initial, 0);
  n_mens := COALESCE(c.duree_mois, annees * 12);
  IF c.is_emprunteur AND capital > 0 AND n_mens > 0 THEN
    IF tx_pret > 0 THEN
      i_mens := tx_pret / 12;
      mensualite := capital * i_mens / (1 - power(1 + i_mens, -n_mens));
    ELSE
      mensualite := capital / n_mens;
    END IF;
  ELSE
    mensualite := 0;
  END IF;

  crd_debut := capital;

  FOR y IN 1..annees LOOP
    d_start := (c.date_effet + ((y - 1) || ' years')::interval)::date;
    d_end   := (c.date_effet + (y || ' years')::interval - INTERVAL '1 day')::date;

    IF c.is_emprunteur AND capital > 0 AND n_mens > 0 THEN
      IF tx_pret > 0 THEN
        crd_fin := crd_debut * power(1 + i_mens, 12)
                 - mensualite * ((power(1 + i_mens, 12) - 1) / i_mens);
        IF crd_fin < 0 THEN crd_fin := 0; END IF;
      ELSE
        crd_fin := GREATEST(0, crd_debut - mensualite * 12);
      END IF;
    ELSE
      crd_fin := crd_debut;
    END IF;

    IF c.is_emprunteur AND capital > 0 THEN
      IF c.assiette = 'capital_restant_du' THEN
        base := crd_debut;
      ELSE
        base := capital;
      END IF;
      prime := base * tx_ass * (COALESCE(c.quotite, 100) / 100.0);
      -- Si aucun taux exploitable, on retombe sur la prime annuelle connue.
      IF prime = 0 THEN prime := COALESCE(c.prime_annuelle, 0); END IF;
    ELSE
      IF c.mode_commissionnement = 'precompte' AND y > 1 THEN
        prime := 0;
      ELSE
        prime := COALESCE(c.prime_annuelle, 0);
      END IF;
    END IF;

    comm_cab := prime * COALESCE(c.commission_cabinet_taux, 0);
    comm_m := 0;
    comm_p := 0;

    IF c.mandataire_id IS NOT NULL THEN
      SELECT tr.taux, tr.assiette INTO taux_m, assiette_m
      FROM public.trouver_taux_regle(
        c.mandataire_id, 'mandataire', c.compagnie_id, c.produit_id,
        produit_row.famille_id, d_start
      ) tr;
      IF taux_m IS NOT NULL THEN
        base_partenaire := CASE WHEN assiette_m = 'prime_ht' THEN prime ELSE comm_cab END;
        comm_m := base_partenaire * taux_m;
      END IF;
    END IF;

    IF c.prescripteur_id IS NOT NULL THEN
      SELECT tr.taux, tr.assiette INTO taux_p, assiette_p
      FROM public.trouver_taux_regle(
        c.prescripteur_id, 'prescripteur', c.compagnie_id, c.produit_id,
        produit_row.famille_id, d_start
      ) tr;
      IF taux_p IS NOT NULL THEN
        base_partenaire := CASE WHEN assiette_p = 'prime_ht' THEN prime ELSE comm_cab END;
        comm_p := base_partenaire * taux_p;
      END IF;
    END IF;

    INSERT INTO public.contrat_echeances (
      contrat_id, annee, date_debut_periode, date_fin_periode,
      capital_restant_du_debut, prime_periode,
      commission_cabinet_periode, commission_mandataire_periode, commission_prescripteur_periode,
      mandataire_id, prescripteur_id, statut
    ) VALUES (
      _contrat_id, y, d_start, d_end,
      crd_debut, ROUND(prime, 2),
      ROUND(comm_cab, 2), ROUND(comm_m, 2), ROUND(comm_p, 2),
      c.mandataire_id, c.prescripteur_id, 'previsionnel'
    );

    crd_debut := crd_fin;
  END LOOP;
END;
$function$;

-- 3) Recalcul de toutes les échéances prévisionnelles
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.contrats LOOP
    PERFORM public.recalculer_echeances_contrat(r.id);
  END LOOP;
END $$;