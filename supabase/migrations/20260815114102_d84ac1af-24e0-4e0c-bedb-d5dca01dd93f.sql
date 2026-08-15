ALTER TABLE public.dossier_devis ADD COLUMN IF NOT EXISTS assureur_porteur text;

COMMENT ON COLUMN public.dossier_devis.assureur_porteur IS 'Assureur porteur réel de l''offre (renseigné par les connecteurs API quand produit_id est vide) — sert à la détection des doublons inter-grossistes.';