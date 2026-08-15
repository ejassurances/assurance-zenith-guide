ALTER TABLE public.neoliane_parcours
  ADD COLUMN IF NOT EXISTS signature_client_statut text NOT NULL DEFAULT 'non_demandee',
  ADD COLUMN IF NOT EXISTS signature_demandee_le timestamptz,
  ADD COLUMN IF NOT EXISTS signature_client_le timestamptz,
  ADD COLUMN IF NOT EXISTS signature_client_ip text,
  ADD COLUMN IF NOT EXISTS signature_client_ua text,
  ADD COLUMN IF NOT EXISTS signature_signataire text,
  ADD COLUMN IF NOT EXISTS signature_jeton text,
  ADD COLUMN IF NOT EXISTS signature_erreur text;

ALTER TABLE public.neoliane_parcours
  ADD CONSTRAINT neoliane_parcours_signature_statut_chk
  CHECK (signature_client_statut IN ('non_demandee','demandee','signee','echec_depot'));

CREATE POLICY "Client voit ses parcours a signer"
ON public.neoliane_parcours FOR SELECT TO authenticated
USING (
  signature_client_statut IN ('demandee','signee','echec_depot')
  AND client_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.clients c
    WHERE c.id = neoliane_parcours.client_id
      AND c.user_id = auth.uid()
  )
);