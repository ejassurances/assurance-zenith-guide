-- Chantier mandataire — brique 1 : structure d'équipe.
--
-- Désactivée par défaut pour chaque mandataire : le cabinet doit l'activer
-- explicitement (equipe_activee). Un mandataire peut être rattaché à un
-- autre mandataire comme responsable d'équipe (manager_id). Quand
-- l'équipe est activée, le manager voit aussi les dossiers/clients/
-- contrats de son équipe — jamais l'inverse, et jamais sans cette
-- activation explicite.
--
-- L'avenant de signature de cette activation (document à faire signer au
-- mandataire) n'est pas construit ici : son texte doit être validé avec
-- Erwan avant codage, même règle que pour tout contenu contractuel.

CREATE TABLE IF NOT EXISTS public.mandataires_profils (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  taux_commission numeric(6,4),
  manager_id uuid REFERENCES auth.users(id),
  equipe_activee boolean NOT NULL DEFAULT false,
  equipe_activee_le timestamptz,
  equipe_activee_par uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mandataires_profils_pas_son_propre_manager CHECK (manager_id IS DISTINCT FROM user_id)
);

COMMENT ON TABLE public.mandataires_profils IS
  'Profil et rattachement d''équipe d''un mandataire. equipe_activee = true signifie que CE mandataire (en tant que responsable) voit les dossiers/clients/contrats des mandataires dont il est le manager_id.';

ALTER TABLE public.mandataires_profils ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin gere les profils mandataires"
  ON public.mandataires_profils FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Mandataire voit son propre profil"
  ON public.mandataires_profils FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE TRIGGER trg_mandataires_profils_updated
  BEFORE UPDATE ON public.mandataires_profils
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Vrai si auth.uid() est le responsable d'équipe ACTIVÉ de _membre_id.
-- Un manager sans equipe_activee=true ne voit rien de son équipe.
CREATE OR REPLACE FUNCTION public.est_manager_actif_de(_membre_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.mandataires_profils membre
    JOIN public.mandataires_profils manager ON manager.user_id = membre.manager_id
    WHERE membre.user_id = _membre_id
      AND membre.manager_id = auth.uid()
      AND manager.equipe_activee = true
  );
$$;
REVOKE ALL ON FUNCTION public.est_manager_actif_de(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.est_manager_actif_de(uuid) TO authenticated;

-- Élargit can_access_client / can_access_dossier / can_access_contrat pour
-- inclure le cas "manager d'équipe activée" sur chacune des colonnes de
-- propriété déjà vérifiées (jamais un accès plus large que ça).

CREATE OR REPLACE FUNCTION public.can_access_client(_client_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.clients c
    WHERE c.id = _client_id AND (
      public.has_role(auth.uid(), 'admin')
      OR c.commercial_id = auth.uid()
      OR c.apporteur_id = auth.uid()
      OR c.created_by = auth.uid()
      OR c.user_id = auth.uid()
      OR public.est_manager_actif_de(c.commercial_id)
      OR public.est_manager_actif_de(c.apporteur_id)
      OR public.est_manager_actif_de(c.created_by)
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.can_access_dossier(_dossier_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.dossiers d
    WHERE d.id = _dossier_id AND (
      public.has_role(auth.uid(), 'admin')
      OR d.apporteur_id = auth.uid()
      OR d.created_by = auth.uid()
      OR public.est_manager_actif_de(d.apporteur_id)
      OR public.est_manager_actif_de(d.created_by)
      OR EXISTS (
        SELECT 1 FROM public.clients c
        WHERE c.id = d.client_id AND c.user_id = auth.uid()
      )
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.can_access_contrat(_contrat_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.contrats c
    WHERE c.id = _contrat_id
      AND (
        public.has_role(auth.uid(), 'admin') OR
        c.mandataire_id = auth.uid() OR
        c.prescripteur_id = auth.uid() OR
        c.created_by = auth.uid() OR
        public.est_manager_actif_de(c.mandataire_id) OR
        public.est_manager_actif_de(c.prescripteur_id) OR
        public.est_manager_actif_de(c.created_by) OR
        (c.client_id IS NOT NULL AND public.can_access_client(c.client_id))
      )
  )
$$;

-- Les politiques directes sur clients et dossiers n'appellent pas les
-- fonctions ci-dessus (vérifié avant de conclure que le correctif était
-- complet) : il faut les élargir séparément, sinon la mise à jour des
-- fonctions n'a aucun effet sur ces deux tables elles-mêmes.

DROP POLICY IF EXISTS "clients_select" ON public.clients;
CREATE POLICY "clients_select" ON public.clients FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR commercial_id = auth.uid()
  OR apporteur_id = auth.uid()
  OR created_by = auth.uid()
  OR public.est_manager_actif_de(commercial_id)
  OR public.est_manager_actif_de(apporteur_id)
  OR public.est_manager_actif_de(created_by)
);

DROP POLICY IF EXISTS "Voir ses dossiers" ON public.dossiers;
CREATE POLICY "Voir ses dossiers" ON public.dossiers
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR apporteur_id = auth.uid()
  OR created_by = auth.uid()
  OR public.est_manager_actif_de(apporteur_id)
  OR public.est_manager_actif_de(created_by)
  OR client_id IN (SELECT c.id FROM public.clients c WHERE c.user_id = auth.uid())
);

-- devoirs_conseil : trouvé au passage avec le même défaut que
-- can_access_contrat avant son correctif — has_role(mandataire) seul,
-- sans vérifier que le devoir de conseil concerne bien un dossier dont ce
-- mandataire est responsable. Corrigé sur le même principe.

DROP POLICY IF EXISTS "Voir devoir de conseil" ON public.devoirs_conseil;
CREATE POLICY "Voir devoir de conseil" ON public.devoirs_conseil
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR created_by = auth.uid()
  OR public.est_manager_actif_de(created_by)
  OR public.can_access_dossier(dossier_id)
  OR client_id IN (SELECT c.id FROM public.clients c WHERE c.user_id = auth.uid())
);

DROP POLICY IF EXISTS "Staff modifie devoir de conseil" ON public.devoirs_conseil;
CREATE POLICY "Staff modifie devoir de conseil" ON public.devoirs_conseil
FOR UPDATE TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR created_by = auth.uid()
  OR public.est_manager_actif_de(created_by)
  OR public.can_access_dossier(dossier_id)
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR created_by = auth.uid()
  OR public.est_manager_actif_de(created_by)
  OR public.can_access_dossier(dossier_id)
);
