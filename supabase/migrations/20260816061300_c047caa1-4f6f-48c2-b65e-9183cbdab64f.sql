ALTER TABLE public.client_reponses_ia
  ADD COLUMN IF NOT EXISTS signalee_incorrecte boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS motif_signalement text,
  ADD COLUMN IF NOT EXISTS signalee_le timestamptz,
  ADD COLUMN IF NOT EXISTS signalee_par uuid;

ALTER TABLE public.sinistres
  ADD COLUMN IF NOT EXISTS rappel_sans_action_le timestamptz;