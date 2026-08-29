CREATE TABLE public.rgpd_demandes_droits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  demandeur_nom text NOT NULL,
  demandeur_email text,
  type text NOT NULL DEFAULT 'acces' CHECK (type IN ('acces','rectification','effacement','opposition','limitation','portabilite')),
  canal_reception text,
  recue_le date NOT NULL DEFAULT CURRENT_DATE,
  echeance_le date NOT NULL DEFAULT (CURRENT_DATE + INTERVAL '1 month'),
  statut text NOT NULL DEFAULT 'recue' CHECK (statut IN ('recue','en_cours','repondue','refusee')),
  reponse_le date,
  reponse_resume text,
  traite_par uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rgpd_demandes_droits TO authenticated;
GRANT ALL ON public.rgpd_demandes_droits TO service_role;
ALTER TABLE public.rgpd_demandes_droits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Cabinet gere les demandes de droits" ON public.rgpd_demandes_droits
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'mandataire'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'mandataire'));

CREATE TRIGGER update_rgpd_demandes_droits_updated_at
  BEFORE UPDATE ON public.rgpd_demandes_droits
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.rgpd_violations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titre text NOT NULL,
  description text,
  survenue_le timestamptz NOT NULL DEFAULT now(),
  decouverte_le timestamptz NOT NULL DEFAULT now(),
  nature text,
  donnees_concernees text,
  personnes_concernees_nb integer,
  gravite text NOT NULL DEFAULT 'mineure' CHECK (gravite IN ('mineure','majeure','critique')),
  notification_cnil boolean NOT NULL DEFAULT false,
  notification_cnil_le timestamptz,
  notification_personnes boolean NOT NULL DEFAULT false,
  mesures text,
  statut text NOT NULL DEFAULT 'ouverte' CHECK (statut IN ('ouverte','en_cours','cloturee')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rgpd_violations TO authenticated;
GRANT ALL ON public.rgpd_violations TO service_role;
ALTER TABLE public.rgpd_violations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Cabinet gere les violations de donnees" ON public.rgpd_violations
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'mandataire'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'mandataire'));

CREATE TRIGGER update_rgpd_violations_updated_at
  BEFORE UPDATE ON public.rgpd_violations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();