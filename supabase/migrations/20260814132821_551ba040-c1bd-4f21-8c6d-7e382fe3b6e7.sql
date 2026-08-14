CREATE TABLE public.neoliane_parcours (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  dossier_id UUID REFERENCES public.dossiers(id) ON DELETE SET NULL,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  product_type TEXT NOT NULL DEFAULT 'sante',
  date_effet DATE,
  profile_id TEXT,
  cart_id TEXT,
  offer_id TEXT,
  contract_ids TEXT[] NOT NULL DEFAULT '{}',
  pricing_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  etape TEXT NOT NULL DEFAULT 'profil',
  statut TEXT NOT NULL DEFAULT 'en_cours',
  avertissements JSONB NOT NULL DEFAULT '[]'::jsonb,
  derniere_erreur TEXT,
  derniere_reponse JSONB,
  cree_par UUID REFERENCES auth.users,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.neoliane_parcours TO authenticated;
GRANT ALL ON public.neoliane_parcours TO service_role;
ALTER TABLE public.neoliane_parcours ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Cabinet gere les parcours neoliane"
ON public.neoliane_parcours FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'mandataire'))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'mandataire'));

CREATE INDEX idx_neoliane_parcours_dossier ON public.neoliane_parcours(dossier_id);
CREATE INDEX idx_neoliane_parcours_offer ON public.neoliane_parcours(offer_id);

CREATE TRIGGER update_neoliane_parcours_updated_at
BEFORE UPDATE ON public.neoliane_parcours
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.neoliane_evenements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_name TEXT NOT NULL,
  ressource_id TEXT,
  refresh_url TEXT,
  payload JSONB,
  etat_rafraichi JSONB,
  traite BOOLEAN NOT NULL DEFAULT false,
  erreur TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.neoliane_evenements TO authenticated;
GRANT ALL ON public.neoliane_evenements TO service_role;
ALTER TABLE public.neoliane_evenements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Cabinet lit les evenements neoliane"
ON public.neoliane_evenements FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'mandataire'));

CREATE UNIQUE INDEX idx_neoliane_evenements_unicite
ON public.neoliane_evenements(event_name, ressource_id, created_at);