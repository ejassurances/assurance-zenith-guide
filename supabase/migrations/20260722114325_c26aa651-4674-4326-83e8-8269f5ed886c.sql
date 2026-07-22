
-- 1) Liaison clients ↔ auth users
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS clients_user_id_idx ON public.clients(user_id);

-- 2) Élargir clients_select pour inclure le client lui-même
DROP POLICY IF EXISTS clients_select ON public.clients;
CREATE POLICY clients_select ON public.clients
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR commercial_id = auth.uid()
    OR apporteur_id = auth.uid()
    OR created_by = auth.uid()
    OR user_id = auth.uid()
  );

-- 3) can_access_client : inclure le lien user_id
CREATE OR REPLACE FUNCTION public.can_access_client(_client_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.clients c
    WHERE c.id = _client_id AND (
      public.has_role(auth.uid(), 'admin')
      OR c.commercial_id = auth.uid()
      OR c.apporteur_id = auth.uid()
      OR c.created_by = auth.uid()
      OR c.user_id = auth.uid()
    )
  );
$function$;

-- 4) DER : colonnes de signature électronique intégrée
ALTER TABLE public.client_der_envois
  ADD COLUMN IF NOT EXISTS signature_png text,
  ADD COLUMN IF NOT EXISTS signed_at timestamptz,
  ADD COLUMN IF NOT EXISTS signed_ip text,
  ADD COLUMN IF NOT EXISTS signed_ua text,
  ADD COLUMN IF NOT EXISTS document_hash text,
  ADD COLUMN IF NOT EXISTS document_url_snapshot text;

-- 5) Autoriser le client à voir et signer son propre DER
--    (les policies existantes couvrent admin/commercial/apporteur via can_access_client
--     désormais étendu au user_id).
