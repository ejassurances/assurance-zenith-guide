CREATE TABLE public.config_labels_gmail (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  service_cle TEXT NOT NULL UNIQUE,
  libelle TEXT NOT NULL,
  prefixe TEXT NOT NULL,
  adresse TEXT,
  theme TEXT NOT NULL DEFAULT '',
  actif BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.config_labels_gmail TO authenticated;
GRANT ALL ON public.config_labels_gmail TO service_role;

ALTER TABLE public.config_labels_gmail ENABLE ROW LEVEL SECURITY;

CREATE POLICY "config_labels_gmail_select_staff" ON public.config_labels_gmail
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'mandataire'));

CREATE POLICY "config_labels_gmail_admin_write" ON public.config_labels_gmail
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_config_labels_gmail_updated_at
  BEFORE UPDATE ON public.config_labels_gmail
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.config_labels_gmail (service_cle, libelle, prefixe, adresse, theme) VALUES
('gestion_commerciale', 'Gestion Commerciale', 'Direction Commerciale/Gestion Commerciale/', NULL, 'prospection entrante, demande de devis ou d''étude, nouveau prospect, souscription en cours de vente'),
('service_client', 'Service Client', 'Direction Commerciale/Service Client/', 'service.client@ej-assurances.fr', 'demande d''un client existant : gestion de contrat, avenant, résiliation, remboursement, sinistre, envoi de justificatif, question sur ses garanties'),
('service_partenaire', 'Service Partenaire', 'Direction Commerciale/Service Partenaire/', 'partenaires@ej-assurances.fr', 'échanges avec une compagnie, un assureur, un grossiste ou une plateforme : codes courtier, conventions, actualités produits, invitations, challenges'),
('service_achat', 'Service Achat', 'Direction Financiere/Service Achat/', 'comptabilite@ej-assurances.fr', 'factures fournisseurs, abonnements, achats et dépenses du cabinet'),
('service_commission', 'Service Commission', 'Direction Financiere/Service Commission/', 'comptabilite@ej-assurances.fr', 'bordereaux de commissions, relevés de rémunération, règlements des compagnies'),
('service_reclamation', 'Service Reclamation', 'Direction Juridique et Conformite/Service Reclamation/', 'reclamation@ej-assurances.fr', 'réclamation formelle : mécontentement, contestation, mise en cause du cabinet ou de la compagnie, saisine du médiateur'),
('service_conformite', 'Service Conformite', 'Direction Juridique et Conformite/Service Conformite/', NULL, 'veille réglementaire, ACPR, ORIAS, DDA, RGPD, obligations de conformité');