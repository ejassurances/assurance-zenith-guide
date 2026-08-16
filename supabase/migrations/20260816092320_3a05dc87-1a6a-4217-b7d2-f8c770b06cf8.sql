CREATE TABLE public.controles_internes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  periode text NOT NULL,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  mode_selection text NOT NULL DEFAULT 'aleatoire' CHECK (mode_selection IN ('aleatoire','ciblee')),
  motif_ciblage text,
  controleur_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  date_controle timestamptz,
  resultat text NOT NULL DEFAULT 'a_faire' CHECK (resultat IN ('a_faire','conforme','anomalie')),
  anomalies_constatees text,
  actions_correctives text,
  statut text NOT NULL DEFAULT 'a_faire' CHECK (statut IN ('a_faire','clos')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT controles_internes_periode_client_unique UNIQUE (periode, client_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.controles_internes TO authenticated;
GRANT ALL ON public.controles_internes TO service_role;

ALTER TABLE public.controles_internes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Cabinet peut consulter les controles internes"
ON public.controles_internes FOR SELECT TO authenticated
USING (public.current_user_role() IN ('admin','mandataire'));

CREATE POLICY "Cabinet peut creer les controles internes"
ON public.controles_internes FOR INSERT TO authenticated
WITH CHECK (public.current_user_role() IN ('admin','mandataire'));

CREATE POLICY "Cabinet peut modifier les controles internes"
ON public.controles_internes FOR UPDATE TO authenticated
USING (public.current_user_role() IN ('admin','mandataire'))
WITH CHECK (public.current_user_role() IN ('admin','mandataire'));

CREATE POLICY "Admin peut supprimer les controles internes"
ON public.controles_internes FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_controles_internes_periode ON public.controles_internes(periode);
CREATE INDEX idx_controles_internes_client ON public.controles_internes(client_id);

CREATE TRIGGER update_controles_internes_updated_at
BEFORE UPDATE ON public.controles_internes
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();