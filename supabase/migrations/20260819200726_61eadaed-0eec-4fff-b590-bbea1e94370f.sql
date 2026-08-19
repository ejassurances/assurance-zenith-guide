DO $$
DECLARE c uuid;
BEGIN
  FOR c IN SELECT id FROM public.clients LOOP
    PERFORM public.calculer_risque_lcbft(c);
  END LOOP;
END $$;