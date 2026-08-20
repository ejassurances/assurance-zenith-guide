CREATE TABLE public.prescripteurs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nom text NOT NULL,
  prenom text,
  email text NOT NULL UNIQUE,
  telephone text,
  zone_activite text,
  type text NOT NULL DEFAULT 'agent_immo',
  statut text NOT NULL DEFAULT 'en_attente',
  convention_acceptee_le timestamptz,
  user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.prescripteurs TO authenticated;
GRANT ALL ON public.prescripteurs TO service_role;
ALTER TABLE public.prescripteurs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "prescripteurs_staff_all" ON public.prescripteurs FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'mandataire'))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'mandataire'));

CREATE POLICY "prescripteurs_self_select" ON public.prescripteurs FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE TABLE public.recommandations_prescripteur (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  prescripteur_id uuid NOT NULL REFERENCES public.prescripteurs(id) ON DELETE CASCADE,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  nom_contact text NOT NULL,
  description text,
  statut text NOT NULL DEFAULT 'nouveau',
  montant_du numeric NOT NULL DEFAULT 200,
  verse boolean NOT NULL DEFAULT false,
  verse_le timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.recommandations_prescripteur TO authenticated;
GRANT ALL ON public.recommandations_prescripteur TO service_role;
ALTER TABLE public.recommandations_prescripteur ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reco_staff_all" ON public.recommandations_prescripteur FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'mandataire'))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'mandataire'));

CREATE POLICY "reco_prescripteur_select" ON public.recommandations_prescripteur FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.prescripteurs p WHERE p.id = prescripteur_id AND p.user_id = auth.uid()));

CREATE POLICY "reco_prescripteur_insert" ON public.recommandations_prescripteur FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.prescripteurs p WHERE p.id = prescripteur_id AND p.user_id = auth.uid() AND p.statut = 'actif'));

CREATE INDEX idx_reco_prescripteur ON public.recommandations_prescripteur(prescripteur_id);