CREATE TABLE public.consentements_plateforme (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('rgpd','cgu')),
  accepte_le timestamptz NOT NULL DEFAULT now(),
  adresse_ip text,
  version_texte text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.consentements_plateforme TO authenticated;
GRANT ALL ON public.consentements_plateforme TO service_role;

ALTER TABLE public.consentements_plateforme ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Client lit ses consentements"
ON public.consentements_plateforme FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_id AND c.user_id = auth.uid())
);

CREATE POLICY "Staff lit tous les consentements"
ON public.consentements_plateforme FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'mandataire')
  OR public.has_role(auth.uid(), 'prescripteur')
);

CREATE POLICY "Client insere ses consentements"
ON public.consentements_plateforme FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_id AND c.user_id = auth.uid())
);

CREATE TRIGGER trg_consentements_plateforme_updated
BEFORE UPDATE ON public.consentements_plateforme
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_consentements_plateforme_client ON public.consentements_plateforme(client_id, type);