-- Types de documents conformité
DO $$ BEGIN
  CREATE TYPE conformite_doc_type AS ENUM (
    'cni','justificatif_domicile','orias','association_pro','rcpro','der','autre'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE compagnie_doc_type AS ENUM (
    'contrat_partenariat','avenant','protocole_commissions','conditions_apporteur','autre'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Documents conformité par utilisateur
CREATE TABLE public.conformite_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type conformite_doc_type NOT NULL,
  nom text NOT NULL,
  storage_path text NOT NULL,
  date_emission date,
  date_expiration date,
  statut text NOT NULL DEFAULT 'a_valider'
    CHECK (statut IN ('a_valider','valide','expire','refuse')),
  notes text,
  uploaded_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.conformite_documents TO authenticated;
GRANT ALL ON public.conformite_documents TO service_role;

ALTER TABLE public.conformite_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "conformite admin all" ON public.conformite_documents
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "conformite owner read" ON public.conformite_documents
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "conformite owner upload" ON public.conformite_documents
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "conformite owner update" ON public.conformite_documents
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE INDEX idx_conformite_user ON public.conformite_documents(user_id);
CREATE INDEX idx_conformite_type ON public.conformite_documents(type);

CREATE TRIGGER trg_conformite_updated
BEFORE UPDATE ON public.conformite_documents
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Documents rattachés aux compagnies (contrats de partenariat, etc.)
CREATE TABLE public.compagnie_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  compagnie_id uuid NOT NULL REFERENCES public.compagnies(id) ON DELETE CASCADE,
  type compagnie_doc_type NOT NULL DEFAULT 'contrat_partenariat',
  nom text NOT NULL,
  storage_path text NOT NULL,
  date_signature date,
  date_fin date,
  reference text,
  notes text,
  uploaded_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.compagnie_documents TO authenticated;
GRANT ALL ON public.compagnie_documents TO service_role;

ALTER TABLE public.compagnie_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "compagnie docs admin all" ON public.compagnie_documents
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "compagnie docs mandataire read" ON public.compagnie_documents
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'mandataire'::app_role));

CREATE INDEX idx_compagnie_docs_compagnie ON public.compagnie_documents(compagnie_id);

CREATE TRIGGER trg_compagnie_docs_updated
BEFORE UPDATE ON public.compagnie_documents
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();