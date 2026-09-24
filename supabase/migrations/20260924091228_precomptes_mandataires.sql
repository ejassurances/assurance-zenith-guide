-- Chantier mandataire — brique 4 : rétrocession, initiée par le courtier.
--
-- Réutilise la table commissions déjà existante (beneficiaire_id,
-- precomptee, bordereau_id) plutôt que de recalculer un montant séparé —
-- un précompte est un GROUPEMENT de commissions déjà enregistrées, jamais
-- une nouvelle source de vérité financière.
--
-- Statuts, dans l'ordre : brouillon -> envoye -> valide_mandataire ->
-- facture_recue -> facture_validee -> virement_effectue.
-- Le mandataire ne peut jamais lancer un précompte lui-même (INSERT
-- réservé admin) — conforme à la demande d'Erwan.

CREATE TABLE IF NOT EXISTS public.precomptes_mandataires (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mandataire_id uuid NOT NULL REFERENCES auth.users(id),
  periode_debut date NOT NULL,
  periode_fin date NOT NULL,
  statut text NOT NULL DEFAULT 'brouillon'
    CHECK (statut IN ('brouillon','envoye','valide_mandataire','facture_recue','facture_validee','virement_effectue','conteste')),
  montant_total numeric(10,2) NOT NULL DEFAULT 0,
  facture_storage_path text,
  facture_numero text,
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  envoye_le timestamptz,
  valide_le timestamptz,
  facture_recue_le timestamptz,
  facture_validee_le timestamptz,
  facture_validee_par uuid REFERENCES auth.users(id),
  virement_effectue_le timestamptz,
  virement_effectue_par uuid REFERENCES auth.users(id)
);
COMMENT ON TABLE public.precomptes_mandataires IS
  'Précompte de rétrocession : groupe de commissions envoyées au mandataire pour validation puis facturation. Toujours initié par le cabinet, jamais par le mandataire.';

CREATE INDEX IF NOT EXISTS idx_precomptes_mandataire ON public.precomptes_mandataires(mandataire_id);

CREATE TABLE IF NOT EXISTS public.precompte_lignes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  precompte_id uuid NOT NULL REFERENCES public.precomptes_mandataires(id) ON DELETE CASCADE,
  commission_id uuid NOT NULL REFERENCES public.commissions(id),
  contrat_id uuid REFERENCES public.contrats(id),
  montant numeric(10,2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (commission_id)
);
COMMENT ON CONSTRAINT precompte_lignes_commission_id_key ON public.precompte_lignes IS
  'Une commission ne peut appartenir qu''à un seul précompte : empêche de la compter deux fois.';

CREATE INDEX IF NOT EXISTS idx_precompte_lignes_precompte ON public.precompte_lignes(precompte_id);

ALTER TABLE public.precomptes_mandataires ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.precompte_lignes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Voir ses precomptes"
  ON public.precomptes_mandataires FOR SELECT TO authenticated
  USING (
    mandataire_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
    OR public.est_manager_actif_de(mandataire_id)
  );

CREATE POLICY "Admin cree un precompte"
  ON public.precomptes_mandataires FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Maj precompte selon le role"
  ON public.precomptes_mandataires FOR UPDATE TO authenticated
  USING (mandataire_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (mandataire_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Voir les lignes de ses precomptes"
  ON public.precompte_lignes FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.precomptes_mandataires p
      WHERE p.id = precompte_id
        AND (p.mandataire_id = auth.uid() OR public.has_role(auth.uid(), 'admin') OR public.est_manager_actif_de(p.mandataire_id))
    )
  );

CREATE POLICY "Admin gere les lignes de precompte"
  ON public.precompte_lignes FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
