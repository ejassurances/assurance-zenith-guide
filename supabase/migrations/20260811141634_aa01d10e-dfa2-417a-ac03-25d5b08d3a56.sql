ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS marque text NOT NULL DEFAULT 'ej_assurances',
  ADD COLUMN IF NOT EXISTS besoins text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS dda_statut text NOT NULL DEFAULT 'a_faire';

ALTER TABLE public.client_kyc_documents
  ADD COLUMN IF NOT EXISTS drive_url text;

CREATE INDEX IF NOT EXISTS clients_marque_idx ON public.clients (marque);

UPDATE public.clients
SET marque = 'ej_coparentalite'
WHERE etiquettes IS NOT NULL AND 'coparentalite' = ANY (etiquettes);