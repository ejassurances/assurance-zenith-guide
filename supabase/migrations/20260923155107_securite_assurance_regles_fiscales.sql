-- CORRECTIF DE SÉCURITÉ CRITIQUE — trouvé par le scanner Lovable (23/09/2026) :
-- assurance_regles_fiscales n'avait aucune règle d'accès. N'importe qui
-- utilisant l'application pouvait lire, modifier, supprimer ou ajouter des
-- lignes dans ce référentiel fiscal, sans être authentifié ni faire partie
-- du cabinet.
--
-- C'est une table de référence (taux de taxes par régime fiscal), pas de
-- données propres à un client — même principe d'accès que
-- commission_bareme déjà en place : lecture pour le personnel, écriture
-- réservée à l'administrateur (référentiel réglementaire, pas à modifier
-- au fil de l'eau par n'importe quel mandataire).

ALTER TABLE public.assurance_regles_fiscales ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff peut consulter le referentiel fiscal"
  ON public.assurance_regles_fiscales FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'mandataire')
    OR public.has_role(auth.uid(), 'prescripteur')
  );

CREATE POLICY "Admin peut creer une regle fiscale"
  ON public.assurance_regles_fiscales FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admin peut modifier une regle fiscale"
  ON public.assurance_regles_fiscales FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admin peut supprimer une regle fiscale"
  ON public.assurance_regles_fiscales FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
