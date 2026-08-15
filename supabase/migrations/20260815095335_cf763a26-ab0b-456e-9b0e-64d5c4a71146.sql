CREATE TABLE public.simulassur_dossiers (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  dossier_id uuid NOT NULL REFERENCES public.dossiers(id) ON DELETE CASCADE,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  quote_id text,
  simulation_id text,
  produit_code text,
  assureur text,
  devis_id uuid REFERENCES public.dossier_devis(id) ON DELETE SET NULL,
  transfert_statut text NOT NULL DEFAULT 'non_transfere',
  transfert_le timestamptz,
  transfert_reponse jsonb,
  suivi_statuts jsonb NOT NULL DEFAULT '[]'::jsonb,
  suivi_le timestamptz,
  suivi_partiel boolean NOT NULL DEFAULT false,
  contrat_ref text,
  espaces_clients jsonb NOT NULL DEFAULT '[]'::jsonb,
  derniere_erreur text,
  request_hash text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (dossier_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.simulassur_dossiers TO authenticated;
GRANT ALL ON public.simulassur_dossiers TO service_role;

ALTER TABLE public.simulassur_dossiers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Cabinet gere les dossiers Simulassur"
ON public.simulassur_dossiers FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'mandataire'))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'mandataire'));

CREATE TRIGGER trg_simulassur_dossiers_updated
BEFORE UPDATE ON public.simulassur_dossiers
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.simulassur_evenements (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  correlation_id text NOT NULL,
  endpoint text NOT NULL,
  methode text NOT NULL,
  http_status integer,
  duree_ms integer,
  ok boolean NOT NULL DEFAULT false,
  erreur text,
  dossier_id uuid REFERENCES public.dossiers(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.simulassur_evenements TO authenticated;
GRANT ALL ON public.simulassur_evenements TO service_role;

ALTER TABLE public.simulassur_evenements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin lit le journal Simulassur"
ON public.simulassur_evenements FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX simulassur_evenements_created_idx ON public.simulassur_evenements (created_at DESC);

CREATE OR REPLACE FUNCTION public.purger_simulassur_evenements()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.simulassur_evenements
  WHERE created_at < now() - interval '90 days';
$$;

REVOKE ALL ON FUNCTION public.purger_simulassur_evenements() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purger_simulassur_evenements() TO service_role;