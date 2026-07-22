
-- Enum de rôles
CREATE TYPE public.app_role AS ENUM ('admin', 'mandataire', 'client', 'prescripteur');
CREATE TYPE public.dossier_statut AS ENUM ('nouveau', 'en_cours', 'signe', 'perdu');
CREATE TYPE public.commission_statut AS ENUM ('prevue', 'versee', 'annulee');

-- Fonction updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

-- Profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
  company TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- User roles
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- has_role
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS public.app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.user_roles WHERE user_id = auth.uid() ORDER BY
    CASE role WHEN 'admin' THEN 1 WHEN 'mandataire' THEN 2 WHEN 'prescripteur' THEN 3 WHEN 'client' THEN 4 END
    LIMIT 1;
$$;

-- Trigger auto-création du profil
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));
  -- Par défaut, tout nouveau compte est "client" (l'admin peut changer)
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'client')
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Dossiers
CREATE TABLE public.dossiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference TEXT NOT NULL UNIQUE DEFAULT ('D-' || to_char(now(), 'YYYYMMDD') || '-' || substr(gen_random_uuid()::text, 1, 6)),
  client_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  apporteur_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  client_nom TEXT NOT NULL,
  client_email TEXT,
  client_phone TEXT,
  statut public.dossier_statut NOT NULL DEFAULT 'nouveau',
  capital NUMERIC(12,2),
  duree_mois INTEGER,
  age INTEGER,
  fumeur BOOLEAN DEFAULT FALSE,
  economie_estimee NUMERIC(12,2),
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dossiers TO authenticated;
GRANT ALL ON public.dossiers TO service_role;
ALTER TABLE public.dossiers ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_dossiers_updated BEFORE UPDATE ON public.dossiers
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Commissions
CREATE TABLE public.commissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dossier_id UUID NOT NULL REFERENCES public.dossiers(id) ON DELETE CASCADE,
  beneficiaire_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  montant NUMERIC(10,2) NOT NULL,
  statut public.commission_statut NOT NULL DEFAULT 'prevue',
  date_versement DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.commissions TO authenticated;
GRANT ALL ON public.commissions TO service_role;
ALTER TABLE public.commissions ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_commissions_updated BEFORE UPDATE ON public.commissions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Messages
CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dossier_id UUID NOT NULL REFERENCES public.dossiers(id) ON DELETE CASCADE,
  auteur_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contenu TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Documents
CREATE TABLE public.documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dossier_id UUID NOT NULL REFERENCES public.dossiers(id) ON DELETE CASCADE,
  uploader_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size INTEGER,
  mime_type TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.documents TO authenticated;
GRANT ALL ON public.documents TO service_role;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

-- Fonction : l'utilisateur peut-il accéder au dossier
CREATE OR REPLACE FUNCTION public.can_access_dossier(_dossier_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.dossiers d
    WHERE d.id = _dossier_id AND (
      public.has_role(auth.uid(), 'admin')
      OR d.client_id = auth.uid()
      OR d.apporteur_id = auth.uid()
      OR d.created_by = auth.uid()
    )
  );
$$;

-- === POLICIES ===

-- profiles
CREATE POLICY "Voir son profil ou admin" ON public.profiles FOR SELECT TO authenticated
USING (id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Modifier son profil" ON public.profiles FOR UPDATE TO authenticated
USING (id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Insert profil" ON public.profiles FOR INSERT TO authenticated
WITH CHECK (id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- user_roles
CREATE POLICY "Voir ses rôles" ON public.user_roles FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- dossiers
CREATE POLICY "Voir ses dossiers" ON public.dossiers FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR client_id = auth.uid()
  OR apporteur_id = auth.uid()
  OR created_by = auth.uid()
);
CREATE POLICY "Admin/mandataire créent dossier" ON public.dossiers FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'mandataire')
  OR public.has_role(auth.uid(), 'prescripteur')
);
CREATE POLICY "Admin/apporteur modifient" ON public.dossiers FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR apporteur_id = auth.uid()
  OR created_by = auth.uid()
);
CREATE POLICY "Admin supprime dossier" ON public.dossiers FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- commissions
CREATE POLICY "Voir ses commissions" ON public.commissions FOR SELECT TO authenticated
USING (beneficiaire_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin gère commissions" ON public.commissions FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- messages
CREATE POLICY "Voir messages du dossier" ON public.messages FOR SELECT TO authenticated
USING (public.can_access_dossier(dossier_id));
CREATE POLICY "Écrire message si accès" ON public.messages FOR INSERT TO authenticated
WITH CHECK (auteur_id = auth.uid() AND public.can_access_dossier(dossier_id));

-- documents
CREATE POLICY "Voir documents du dossier" ON public.documents FOR SELECT TO authenticated
USING (public.can_access_dossier(dossier_id));
CREATE POLICY "Uploader document si accès" ON public.documents FOR INSERT TO authenticated
WITH CHECK (uploader_id = auth.uid() AND public.can_access_dossier(dossier_id));
CREATE POLICY "Supprimer son document ou admin" ON public.documents FOR DELETE TO authenticated
USING (uploader_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
