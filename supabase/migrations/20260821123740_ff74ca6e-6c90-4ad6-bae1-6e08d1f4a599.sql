-- Règle n°2 : les CGV / IPID / notices compagnies sont stockées sur Google Drive.
-- Le CRM ne conserve que le lien Drive (04_PARTENAIRES_ET_COMPAGNIES/[Compagnie]/[Branche]).

ALTER TABLE public.produit_documents
  ADD COLUMN IF NOT EXISTS drive_file_id text,
  ADD COLUMN IF NOT EXISTS drive_url text,
  ADD COLUMN IF NOT EXISTS drive_chemin text,
  ALTER COLUMN storage_path DROP NOT NULL;

ALTER TABLE public.compagnie_documents
  ADD COLUMN IF NOT EXISTS drive_file_id text,
  ADD COLUMN IF NOT EXISTS drive_url text,
  ADD COLUMN IF NOT EXISTS drive_chemin text,
  ALTER COLUMN storage_path DROP NOT NULL;

COMMENT ON COLUMN public.produit_documents.drive_url IS
  'Lien de consultation Google Drive (source unique du fichier). Le CRM ne stocke plus le PDF.';
COMMENT ON COLUMN public.produit_documents.drive_chemin IS
  'Chemin Drive : 04_PARTENAIRES_ET_COMPAGNIES/[Compagnie]/[Branche].';
COMMENT ON COLUMN public.compagnie_documents.drive_url IS
  'Lien de consultation Google Drive (source unique du fichier).';

-- Au moins une source de fichier doit être renseignée (Drive pour les nouveaux dépôts).
ALTER TABLE public.produit_documents
  DROP CONSTRAINT IF EXISTS produit_documents_source_fichier;
ALTER TABLE public.produit_documents
  ADD CONSTRAINT produit_documents_source_fichier
  CHECK (storage_path IS NOT NULL OR drive_file_id IS NOT NULL);

ALTER TABLE public.compagnie_documents
  DROP CONSTRAINT IF EXISTS compagnie_documents_source_fichier;
ALTER TABLE public.compagnie_documents
  ADD CONSTRAINT compagnie_documents_source_fichier
  CHECK (storage_path IS NOT NULL OR drive_file_id IS NOT NULL);