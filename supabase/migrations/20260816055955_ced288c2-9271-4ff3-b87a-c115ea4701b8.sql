ALTER TABLE public.sinistres
  ADD COLUMN IF NOT EXISTS gmail_message_id text,
  ADD COLUMN IF NOT EXISTS resume text,
  ADD COLUMN IF NOT EXISTS analyse_couverture text,
  ADD COLUMN IF NOT EXISTS action_recommandee text,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS date_ouverture timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.sinistres ALTER COLUMN contrat_id DROP NOT NULL;

ALTER TABLE public.sinistres DROP CONSTRAINT IF EXISTS sinistres_action_recommandee_check;
ALTER TABLE public.sinistres ADD CONSTRAINT sinistres_action_recommandee_check
  CHECK (action_recommandee IS NULL OR action_recommandee IN ('reponse_non_couvert','transmission_compagnie','escalade_humaine'));

ALTER TABLE public.sinistres DROP CONSTRAINT IF EXISTS sinistres_statut_check;
ALTER TABLE public.sinistres ADD CONSTRAINT sinistres_statut_check
  CHECK (statut IN ('ouvert','en_analyse','transmis_compagnie','reponse_envoyee','clos'));

CREATE UNIQUE INDEX IF NOT EXISTS sinistres_gmail_message_id_key
  ON public.sinistres (gmail_message_id) WHERE gmail_message_id IS NOT NULL;

DROP POLICY IF EXISTS "sinistres access" ON public.sinistres;
CREATE POLICY "sinistres cabinet only" ON public.sinistres
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'mandataire'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'mandataire'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sinistres TO authenticated;
GRANT ALL ON public.sinistres TO service_role;