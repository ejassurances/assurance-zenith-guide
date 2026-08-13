ALTER TABLE public.bordereaux_commissions
  ADD COLUMN IF NOT EXISTS fichier_path text,
  ADD COLUMN IF NOT EXISTS fichier_nom text,
  ADD COLUMN IF NOT EXISTS analyse_le timestamptz,
  ADD COLUMN IF NOT EXISTS analyse_avertissement text;

CREATE TABLE IF NOT EXISTS public.bordereau_lignes (
  id uuid primary key default gen_random_uuid(),
  bordereau_id uuid not null references public.bordereaux_commissions(id) on delete cascade,
  client_nom_detecte text,
  numero_contrat_detecte text,
  produit_detecte text,
  periode_detectee text,
  montant numeric not null default 0,
  assiette numeric,
  taux numeric,
  client_id uuid references public.clients(id) on delete set null,
  contrat_id uuid references public.contrats(id) on delete set null,
  dossier_id uuid references public.dossiers(id) on delete set null,
  commission_id uuid references public.commissions(id) on delete set null,
  statut text not null default 'a_rapprocher',
  confiance numeric,
  brut jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bordereau_lignes_statut_check check (statut in ('a_rapprocher','rapprochee','ignoree'))
);

CREATE INDEX IF NOT EXISTS bordereau_lignes_bordereau_idx ON public.bordereau_lignes(bordereau_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bordereau_lignes TO authenticated;
GRANT ALL ON public.bordereau_lignes TO service_role;

ALTER TABLE public.bordereau_lignes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff gere les lignes de bordereau" ON public.bordereau_lignes;
CREATE POLICY "Staff gere les lignes de bordereau"
ON public.bordereau_lignes FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'mandataire'))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'mandataire'));

DROP TRIGGER IF EXISTS update_bordereau_lignes_updated_at ON public.bordereau_lignes;
CREATE TRIGGER update_bordereau_lignes_updated_at
BEFORE UPDATE ON public.bordereau_lignes
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();