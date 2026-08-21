-- Conseiller par défaut : Erwan JAFFRELOT
DO $$
DECLARE
  erwan_id uuid := '937a8dc4-f8a1-491d-8937-a5e380dd04ce';
BEGIN
  -- Mise à jour de l'adresse e-mail affichée pour le conseiller
  UPDATE public.profiles
  SET email = 'erwan.jaffrelot@ej-assurances.fr'
  WHERE id = erwan_id;

  -- Rattachement des prospects sans conseiller au conseiller par défaut
  UPDATE public.clients
  SET commercial_id = erwan_id
  WHERE statut = 'prospect'
    AND commercial_id IS NULL;
END $$;