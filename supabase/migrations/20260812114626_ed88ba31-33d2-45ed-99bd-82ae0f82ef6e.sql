ALTER TABLE public.produit_familles ADD COLUMN IF NOT EXISTS branches text[] NOT NULL DEFAULT '{}';

INSERT INTO public.produit_familles (code, nom, description, ordre, champs_standards)
VALUES ('epargne', 'Épargne / Retraite', 'Assurance vie, PER et contrats de capitalisation', 8, '[]'::jsonb)
ON CONFLICT (code) DO NOTHING;

UPDATE public.produit_familles SET branches = '{emprunteur}' WHERE code = 'emprunteur';
UPDATE public.produit_familles SET branches = '{prevoyance_sante}' WHERE code IN ('prevoyance','sante');
UPDATE public.produit_familles SET branches = '{iard}' WHERE code IN ('auto','mrh','pro');
UPDATE public.produit_familles SET branches = '{iard,trottinette}' WHERE code = 'moto';
UPDATE public.produit_familles SET branches = '{epargne_retraite}' WHERE code = 'epargne';

ALTER TABLE public.dossiers ADD COLUMN IF NOT EXISTS compagnie_id uuid REFERENCES public.compagnies(id) ON DELETE SET NULL;
ALTER TABLE public.dossiers ADD COLUMN IF NOT EXISTS produit_id uuid REFERENCES public.produits(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS dossiers_compagnie_id_idx ON public.dossiers(compagnie_id);
CREATE INDEX IF NOT EXISTS dossiers_produit_id_idx ON public.dossiers(produit_id);