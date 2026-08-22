ALTER TABLE public.config_labels_gmail RENAME COLUMN prefixe TO label_direction;
UPDATE public.config_labels_gmail SET label_direction = libelle, updated_at = now();
COMMENT ON COLUMN public.config_labels_gmail.label_direction IS 'Libellé Gmail de direction, à plat (aucun sous-libellé). Les états « A valider » et « Archives » sont deux libellés partagés, posés en plus de celui-ci.';