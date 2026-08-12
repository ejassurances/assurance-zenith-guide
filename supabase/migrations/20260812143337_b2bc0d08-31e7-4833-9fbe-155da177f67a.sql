ALTER TABLE public.dossiers DROP CONSTRAINT IF EXISTS dossiers_client_id_fkey;
ALTER TABLE public.dossiers
  ADD CONSTRAINT dossiers_client_id_fkey
  FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS dossiers_client_id_idx ON public.dossiers(client_id);