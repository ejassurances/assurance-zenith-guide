ALTER TYPE dossier_statut ADD VALUE IF NOT EXISTS 'devis_en_cours';
ALTER TYPE dossier_statut ADD VALUE IF NOT EXISTS 'devoir_conseil_envoye';
ALTER TYPE dossier_statut ADD VALUE IF NOT EXISTS 'devoir_conseil_signe';
ALTER TYPE dossier_statut ADD VALUE IF NOT EXISTS 'devoir_conseil_refuse';
ALTER TYPE dossier_statut ADD VALUE IF NOT EXISTS 'souscription_envoyee';
ALTER TYPE dossier_statut ADD VALUE IF NOT EXISTS 'contrat_valide';
ALTER TYPE dossier_statut ADD VALUE IF NOT EXISTS 'contrat_actif';
ALTER TYPE dossier_statut ADD VALUE IF NOT EXISTS 'cloture';

-- Correction RLS : le client accède à ses dossiers via sa fiche client
DROP POLICY IF EXISTS "Voir ses dossiers" ON public.dossiers;
CREATE POLICY "Voir ses dossiers" ON public.dossiers
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR apporteur_id = auth.uid()
  OR created_by = auth.uid()
  OR client_id IN (SELECT c.id FROM public.clients c WHERE c.user_id = auth.uid())
);

-- Historique des étapes du pipeline
CREATE TABLE IF NOT EXISTS public.dossier_etapes_historique (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dossier_id uuid NOT NULL REFERENCES public.dossiers(id) ON DELETE CASCADE,
  ancienne_etape text,
  nouvelle_etape text NOT NULL,
  commentaire text,
  par uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_dossier_etapes_dossier ON public.dossier_etapes_historique(dossier_id);
GRANT SELECT, INSERT ON public.dossier_etapes_historique TO authenticated;
GRANT ALL ON public.dossier_etapes_historique TO service_role;
ALTER TABLE public.dossier_etapes_historique ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Voir historique de ses dossiers" ON public.dossier_etapes_historique
FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.dossiers d WHERE d.id = dossier_id));

CREATE POLICY "Staff journalise les étapes" ON public.dossier_etapes_historique
FOR INSERT TO authenticated
WITH CHECK (
  par = auth.uid()
  AND EXISTS (SELECT 1 FROM public.dossiers d WHERE d.id = dossier_id)
);

-- Devoir de conseil
CREATE TABLE IF NOT EXISTS public.devoirs_conseil (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dossier_id uuid NOT NULL REFERENCES public.dossiers(id) ON DELETE CASCADE,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  type_assurance text NOT NULL DEFAULT 'emprunteur',
  statut text NOT NULL DEFAULT 'envoye',
  contenu jsonb NOT NULL DEFAULT '{}'::jsonb,
  recommandation text,
  motifs text,
  mises_en_garde text,
  hash text,
  email_destinataire text,
  envoye_le timestamptz,
  signed_at timestamptz,
  signature_png text,
  signed_ip text,
  signed_ua text,
  refus_motif text,
  refuse_le timestamptz,
  pdf_path text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_devoirs_conseil_dossier ON public.devoirs_conseil(dossier_id);
CREATE INDEX IF NOT EXISTS idx_devoirs_conseil_client ON public.devoirs_conseil(client_id);
GRANT SELECT, INSERT, UPDATE ON public.devoirs_conseil TO authenticated;
GRANT ALL ON public.devoirs_conseil TO service_role;
ALTER TABLE public.devoirs_conseil ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Voir devoir de conseil" ON public.devoirs_conseil
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'mandataire'::app_role)
  OR created_by = auth.uid()
  OR client_id IN (SELECT c.id FROM public.clients c WHERE c.user_id = auth.uid())
);

CREATE POLICY "Staff crée devoir de conseil" ON public.devoirs_conseil
FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'mandataire'::app_role)
);

CREATE POLICY "Staff modifie devoir de conseil" ON public.devoirs_conseil
FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'mandataire'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'mandataire'::app_role));

CREATE POLICY "Client signe son devoir de conseil" ON public.devoirs_conseil
FOR UPDATE TO authenticated
USING (client_id IN (SELECT c.id FROM public.clients c WHERE c.user_id = auth.uid()))
WITH CHECK (client_id IN (SELECT c.id FROM public.clients c WHERE c.user_id = auth.uid()));

CREATE TRIGGER update_devoirs_conseil_updated_at
BEFORE UPDATE ON public.devoirs_conseil
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();