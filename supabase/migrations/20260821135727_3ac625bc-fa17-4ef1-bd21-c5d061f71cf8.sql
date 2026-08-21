CREATE TABLE public.bibliotheque_cg_clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  compagnie_nom text NOT NULL,
  branche text NOT NULL,
  edition_annee text,
  storage_path text NOT NULL,
  nom_fichier text,
  mime_type text,
  uploaded_from uuid REFERENCES public.dossiers(id) ON DELETE SET NULL,
  famille_code text,
  grille_version integer,
  valeurs jsonb NOT NULL DEFAULT '{}'::jsonb,
  valeurs_proposees jsonb,
  modele_ia text,
  avertissements text,
  statut text NOT NULL DEFAULT 'brouillon',
  valide boolean NOT NULL DEFAULT false,
  valide_par uuid,
  valide_le timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_biblio_cg_compagnie_branche ON public.bibliotheque_cg_clients (lower(compagnie_nom), branche);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bibliotheque_cg_clients TO authenticated;
GRANT ALL ON public.bibliotheque_cg_clients TO service_role;

ALTER TABLE public.bibliotheque_cg_clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Cabinet gere la bibliotheque CG"
ON public.bibliotheque_cg_clients FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'mandataire'))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'mandataire'));

CREATE POLICY "Deposant lit ses propres CG"
ON public.bibliotheque_cg_clients FOR SELECT TO authenticated
USING (created_by = auth.uid());

CREATE POLICY "Deposant depose un CG"
ON public.bibliotheque_cg_clients FOR INSERT TO authenticated
WITH CHECK (created_by = auth.uid() AND valide = false);

CREATE TRIGGER trg_biblio_cg_updated_at
BEFORE UPDATE ON public.bibliotheque_cg_clients
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "Lire CG clients cabinet"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'cg-clients'
  AND (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'mandataire')
    OR (storage.foldername(name))[1] = auth.uid()::text
  )
);

CREATE POLICY "Deposer CG client"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'cg-clients'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Supprimer CG client admin"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'cg-clients' AND public.has_role(auth.uid(), 'admin'));