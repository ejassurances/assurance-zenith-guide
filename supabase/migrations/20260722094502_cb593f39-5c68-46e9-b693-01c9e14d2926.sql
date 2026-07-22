
-- ENUMS
CREATE TYPE public.client_statut AS ENUM ('prospect','actif','inactif','perdu','ancien');
CREATE TYPE public.client_origine AS ENUM ('internet','assurlead','telephone','apporteur','reseau','autre');
CREATE TYPE public.tache_priorite AS ENUM ('basse','normale','haute','urgente');
CREATE TYPE public.tache_statut AS ENUM ('a_faire','en_cours','terminee','annulee');
CREATE TYPE public.activite_type AS ENUM ('note','appel','email','sms','systeme','rdv');

-- CLIENTS
CREATE TABLE public.clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference text NOT NULL UNIQUE DEFAULT ('C-' || to_char(now(), 'YYYYMMDD') || '-' || substr(gen_random_uuid()::text, 1, 6)),
  civilite text,
  prenom text,
  nom text NOT NULL,
  nom_naissance text,
  date_naissance date,
  situation_familiale text,
  nationalite text,
  ville_naissance text,
  pays_naissance text,
  email text,
  email2 text,
  mobile text,
  mobile2 text,
  telephone text,
  telephone2 text,
  adresse text,
  complement_adresse text,
  code_postal text,
  ville text,
  pays text DEFAULT 'France',
  statut public.client_statut NOT NULL DEFAULT 'prospect',
  origine public.client_origine,
  commercial_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  apporteur_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  preference_contact text,
  fumeur boolean DEFAULT false,
  csp text,
  metier text,
  numero_secu text,
  remarque text,
  etiquettes text[] DEFAULT '{}',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX clients_commercial_idx ON public.clients(commercial_id);
CREATE INDEX clients_apporteur_idx ON public.clients(apporteur_id);
CREATE INDEX clients_statut_idx ON public.clients(statut);
CREATE INDEX clients_nom_idx ON public.clients(nom);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.clients TO authenticated;
GRANT ALL ON public.clients TO service_role;

ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "clients_select" ON public.clients FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR commercial_id = auth.uid()
  OR apporteur_id = auth.uid()
  OR created_by = auth.uid()
);
CREATE POLICY "clients_insert" ON public.clients FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'mandataire')
  OR public.has_role(auth.uid(), 'prescripteur')
);
CREATE POLICY "clients_update" ON public.clients FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR commercial_id = auth.uid()
  OR created_by = auth.uid()
);
CREATE POLICY "clients_delete" ON public.clients FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_clients_updated BEFORE UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Helper: peut voir un client
CREATE OR REPLACE FUNCTION public.can_access_client(_client_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.clients c
    WHERE c.id = _client_id AND (
      public.has_role(auth.uid(), 'admin')
      OR c.commercial_id = auth.uid()
      OR c.apporteur_id = auth.uid()
      OR c.created_by = auth.uid()
    )
  );
$$;

-- TACHES
CREATE TABLE public.taches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES public.clients(id) ON DELETE CASCADE,
  titre text NOT NULL,
  description text,
  echeance date,
  priorite public.tache_priorite NOT NULL DEFAULT 'normale',
  statut public.tache_statut NOT NULL DEFAULT 'a_faire',
  assignee_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX taches_client_idx ON public.taches(client_id);
CREATE INDEX taches_assignee_idx ON public.taches(assignee_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.taches TO authenticated;
GRANT ALL ON public.taches TO service_role;
ALTER TABLE public.taches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "taches_select" ON public.taches FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR assignee_id = auth.uid()
  OR created_by = auth.uid()
  OR (client_id IS NOT NULL AND public.can_access_client(client_id))
);
CREATE POLICY "taches_insert" ON public.taches FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'mandataire')
);
CREATE POLICY "taches_update" ON public.taches FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR assignee_id = auth.uid()
  OR created_by = auth.uid()
);
CREATE POLICY "taches_delete" ON public.taches FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR created_by = auth.uid());

CREATE TRIGGER trg_taches_updated BEFORE UPDATE ON public.taches
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ACTIVITES
CREATE TABLE public.activites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  type public.activite_type NOT NULL DEFAULT 'note',
  titre text,
  contenu text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX activites_client_idx ON public.activites(client_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.activites TO authenticated;
GRANT ALL ON public.activites TO service_role;
ALTER TABLE public.activites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "activites_select" ON public.activites FOR SELECT TO authenticated
USING (public.can_access_client(client_id));
CREATE POLICY "activites_insert" ON public.activites FOR INSERT TO authenticated
WITH CHECK (public.can_access_client(client_id));
CREATE POLICY "activites_update" ON public.activites FOR UPDATE TO authenticated
USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "activites_delete" ON public.activites FOR DELETE TO authenticated
USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- Rattachement optionnel documents -> client
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES public.clients(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS documents_client_idx ON public.documents(client_id);
