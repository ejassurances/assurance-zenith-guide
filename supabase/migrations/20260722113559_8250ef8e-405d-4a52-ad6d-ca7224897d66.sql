
-- ============ AUDIT LOGS ============
CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid,
  actor_email text,
  actor_role text,
  action text NOT NULL,
  target_type text NOT NULL,
  target_id text,
  old_data jsonb,
  new_data jsonb,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit_logs_admin_read" ON public.audit_logs
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX audit_logs_created_at_idx ON public.audit_logs (created_at DESC);
CREATE INDEX audit_logs_target_idx ON public.audit_logs (target_type, target_id);
CREATE INDEX audit_logs_actor_idx ON public.audit_logs (actor_id);

-- Helper: log_audit (callable by authenticated users to log SELECT/EXECUTE events)
CREATE OR REPLACE FUNCTION public.log_audit(
  _action text,
  _target_type text,
  _target_id text DEFAULT NULL,
  _metadata jsonb DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _email text;
  _role text;
BEGIN
  IF auth.uid() IS NULL THEN RETURN; END IF;
  SELECT email INTO _email FROM auth.users WHERE id = auth.uid();
  SELECT role::text INTO _role FROM public.user_roles WHERE user_id = auth.uid()
    ORDER BY CASE role WHEN 'admin' THEN 1 WHEN 'mandataire' THEN 2 WHEN 'prescripteur' THEN 3 WHEN 'client' THEN 4 END
    LIMIT 1;
  INSERT INTO public.audit_logs (actor_id, actor_email, actor_role, action, target_type, target_id, metadata)
  VALUES (auth.uid(), _email, _role, _action, _target_type, _target_id, _metadata);
END;
$$;
REVOKE ALL ON FUNCTION public.log_audit(text,text,text,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_audit(text,text,text,jsonb) TO authenticated;

-- Trigger fn for compagnies_api_config
CREATE OR REPLACE FUNCTION public.audit_compagnies_api_config() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _email text;
  _role text;
BEGIN
  SELECT email INTO _email FROM auth.users WHERE id = auth.uid();
  SELECT role::text INTO _role FROM public.user_roles WHERE user_id = auth.uid()
    ORDER BY CASE role WHEN 'admin' THEN 1 WHEN 'mandataire' THEN 2 WHEN 'prescripteur' THEN 3 WHEN 'client' THEN 4 END
    LIMIT 1;
  IF TG_OP = 'DELETE' THEN
    INSERT INTO public.audit_logs (actor_id, actor_email, actor_role, action, target_type, target_id, old_data)
    VALUES (auth.uid(), _email, _role, 'DELETE', 'table:compagnies_api_config', OLD.compagnie_id::text, to_jsonb(OLD));
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.audit_logs (actor_id, actor_email, actor_role, action, target_type, target_id, old_data, new_data)
    VALUES (auth.uid(), _email, _role, 'UPDATE', 'table:compagnies_api_config', NEW.compagnie_id::text, to_jsonb(OLD), to_jsonb(NEW));
    RETURN NEW;
  ELSE
    INSERT INTO public.audit_logs (actor_id, actor_email, actor_role, action, target_type, target_id, new_data)
    VALUES (auth.uid(), _email, _role, 'INSERT', 'table:compagnies_api_config', NEW.compagnie_id::text, to_jsonb(NEW));
    RETURN NEW;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.audit_compagnies_api_config() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS audit_compagnies_api_config_trg ON public.compagnies_api_config;
CREATE TRIGGER audit_compagnies_api_config_trg
AFTER INSERT OR UPDATE OR DELETE ON public.compagnies_api_config
FOR EACH ROW EXECUTE FUNCTION public.audit_compagnies_api_config();

-- Instrument handle_new_user to audit account creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'client')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.audit_logs (actor_id, actor_email, actor_role, action, target_type, target_id, metadata)
  VALUES (NEW.id, NEW.email, 'system', 'EXECUTE', 'function:handle_new_user', NEW.id::text,
          jsonb_build_object('created_user', NEW.email));
  RETURN NEW;
END;
$$;

-- Instrument recalculer_echeances_contrat with execution audit (prologue)
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
BEGIN
  -- Audit: execution log
  INSERT INTO public.audit_logs (actor_id, action, target_type, target_id, metadata)
  VALUES (auth.uid(), 'EXECUTE', 'function:recalculer_echeances_contrat', _contrat_id::text, NULL);

  SELECT * INTO c FROM public.contrats WHERE id = _contrat_id;
  IF NOT FOUND THEN RETURN; END IF;

  DELETE FROM public.contrat_echeances WHERE contrat_id = _contrat_id;

  IF c.date_effet IS NULL THEN RETURN; END IF;

  IF c.is_emprunteur AND c.duree_mois IS NOT NULL THEN
    annees := GREATEST(1, CEIL(c.duree_mois::numeric / 12));
  ELSIF c.duree_mois IS NOT NULL THEN
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
    IF COALESCE(c.taux_pret, 0) > 0 THEN
      i_mens := c.taux_pret / 12;
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
      IF COALESCE(c.taux_pret, 0) > 0 THEN
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
      prime := base
             * COALESCE(c.taux_assurance_annuel, 0)
             * (COALESCE(c.quotite, 100) / 100.0);
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

-- ============ DER MODELE + ENVOIS ============
CREATE TABLE public.der_modele (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version text NOT NULL,
  nom text NOT NULL,
  storage_path text NOT NULL,
  actif boolean NOT NULL DEFAULT false,
  notes text,
  updated_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.der_modele TO authenticated;
GRANT ALL ON public.der_modele TO service_role;
ALTER TABLE public.der_modele ENABLE ROW LEVEL SECURITY;

CREATE POLICY "der_modele_read_all_auth" ON public.der_modele
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "der_modele_admin_insert" ON public.der_modele
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "der_modele_admin_update" ON public.der_modele
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "der_modele_admin_delete" ON public.der_modele
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE UNIQUE INDEX der_modele_unique_actif ON public.der_modele (actif) WHERE actif = true;

CREATE TRIGGER der_modele_updated_at BEFORE UPDATE ON public.der_modele
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Client DER envois
CREATE TABLE public.client_der_envois (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  der_modele_id uuid REFERENCES public.der_modele(id),
  envoye_par uuid REFERENCES auth.users(id),
  envoye_le timestamptz,
  email_destinataire text,
  statut text NOT NULL DEFAULT 'a_envoyer',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.client_der_envois TO authenticated;
GRANT ALL ON public.client_der_envois TO service_role;
ALTER TABLE public.client_der_envois ENABLE ROW LEVEL SECURITY;

CREATE POLICY "der_envois_select" ON public.client_der_envois
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.can_access_client(client_id));
CREATE POLICY "der_envois_insert" ON public.client_der_envois
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.can_access_client(client_id));
CREATE POLICY "der_envois_update" ON public.client_der_envois
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.can_access_client(client_id))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.can_access_client(client_id));

CREATE TRIGGER client_der_envois_updated_at BEFORE UPDATE ON public.client_der_envois
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX client_der_envois_client_idx ON public.client_der_envois (client_id);
CREATE INDEX client_der_envois_statut_idx ON public.client_der_envois (statut);

-- Trigger: auto-create pending DER envoi on client creation
CREATE OR REPLACE FUNCTION public.creer_der_envoi_client() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _modele_id uuid;
BEGIN
  SELECT id INTO _modele_id FROM public.der_modele WHERE actif = true LIMIT 1;
  INSERT INTO public.client_der_envois (client_id, der_modele_id, email_destinataire, statut)
  VALUES (NEW.id, _modele_id, NEW.email, 'a_envoyer');
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.creer_der_envoi_client() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS clients_creer_der_envoi ON public.clients;
CREATE TRIGGER clients_creer_der_envoi
AFTER INSERT ON public.clients
FOR EACH ROW EXECUTE FUNCTION public.creer_der_envoi_client();

-- Storage policies for der-modele folder in conformite-documents bucket
CREATE POLICY "der_modele_read_authenticated" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'conformite-documents' AND (storage.foldername(name))[1] = 'der-modele');
CREATE POLICY "der_modele_admin_write" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'conformite-documents'
    AND (storage.foldername(name))[1] = 'der-modele'
    AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "der_modele_admin_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'conformite-documents'
    AND (storage.foldername(name))[1] = 'der-modele'
    AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "der_modele_admin_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'conformite-documents'
    AND (storage.foldername(name))[1] = 'der-modele'
    AND public.has_role(auth.uid(), 'admin'));
