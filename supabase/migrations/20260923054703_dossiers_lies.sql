-- Mécanisme générique de liaison entre dossiers — pensé pour être réutilisable
-- au-delà du cas vie + emprunteur (n'importe quelle combinaison de branches à
-- l'avenir). Un dossier reste sur une seule branche (aucun changement à cette
-- règle, déjà appliquée partout ailleurs dans le CRM) ; le lien est une
-- relation à part, symétrique.

CREATE TABLE IF NOT EXISTS public.dossiers_lies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dossier_id_1 uuid NOT NULL REFERENCES public.dossiers(id) ON DELETE CASCADE,
  dossier_id_2 uuid NOT NULL REFERENCES public.dossiers(id) ON DELETE CASCADE,
  motif text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  CONSTRAINT dossiers_lies_distincts CHECK (dossier_id_1 <> dossier_id_2),
  CONSTRAINT dossiers_lies_ordre CHECK (dossier_id_1 < dossier_id_2)
);

COMMENT ON TABLE public.dossiers_lies IS
  'Liaison symétrique entre deux dossiers (ex. assurance vie + assurance emprunteur d''un même client) — une seule lettre de mission, un seul mail de pièces justificatives possibles côté application. Un dossier garde une seule branche ; le lien est une relation à part.';
COMMENT ON COLUMN public.dossiers_lies.motif IS
  'Raison du lien en langage libre (ex. "Économies assurance emprunteur réinvesties en assurance vie").';
COMMENT ON CONSTRAINT dossiers_lies_ordre ON public.dossiers_lies IS
  'dossier_id_1 < dossier_id_2 impose un ordre canonique : empêche la paire inverse d''être insérée en double.';

CREATE INDEX IF NOT EXISTS idx_dossiers_lies_1 ON public.dossiers_lies(dossier_id_1);
CREATE INDEX IF NOT EXISTS idx_dossiers_lies_2 ON public.dossiers_lies(dossier_id_2);

ALTER TABLE public.dossiers_lies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff peut lire les dossiers liés"
  ON public.dossiers_lies FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role IN ('admin', 'mandataire', 'prescripteur')
    )
  );

CREATE POLICY "Staff peut créer des dossiers liés"
  ON public.dossiers_lies FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role IN ('admin', 'mandataire')
    )
  );

CREATE POLICY "Staff peut supprimer un lien"
  ON public.dossiers_lies FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role IN ('admin', 'mandataire')
    )
  );
