ALTER TABLE public.crm_emails ADD COLUMN IF NOT EXISTS ai_context jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.crm_emails.ai_context IS 'CD-SI-001-B : graphe relationnel/contextuel proposé par l''IA (email-context-v1.2, schema_version 1.1.0). Propositions non validées — ne jamais dériver de FK métier automatiquement.';

CREATE INDEX IF NOT EXISTS idx_crm_emails_ai_context ON public.crm_emails USING GIN (ai_context);
CREATE INDEX IF NOT EXISTS idx_crm_emails_contrat_id ON public.crm_emails (contrat_id);