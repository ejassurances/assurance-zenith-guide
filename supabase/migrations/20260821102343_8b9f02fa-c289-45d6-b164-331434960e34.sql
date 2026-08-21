UPDATE public.produits SET statut = 'retire'
WHERE id = '71125071-3b1e-4d7b-baa7-a1057d000c10';

DELETE FROM public.produits WHERE id IN (
  '48a60012-d614-4f7c-b36d-1897a31e3970',
  '83cc7cf8-56c3-471e-8051-2a48ab66bdd2',
  '271838d1-032a-4382-82fa-ddd7c2705b7b',
  'b6420a13-b24e-47ea-a6df-6af4e2a05edd',
  '713f22ab-1735-4655-97d1-50c01bccfc2a',
  '296790f5-de2a-4ca5-92d6-a40c6ce01632',
  'bad6c15a-798f-4d8f-82d1-4b321d77f351',
  '049a27a8-dcb8-4aa7-99f3-00506b676196',
  'f1a4c420-2124-4184-a255-bddb786ce0ad',
  '0eb1c29a-17c7-4884-bac5-ddb364792d81',
  'd2b8c1c1-bf1b-48ff-8f64-ecdcb7aec7bd',
  'f749717f-2c73-41b1-b123-bb86062b6971',
  '11177c42-0d36-4dae-9119-ba8f0949f21e',
  '7827712b-6c5f-405e-973e-435f43893b02',
  'c63dc39d-f6e6-457d-9de1-44855deb6e43',
  '17a1657b-59ca-46d4-89cf-c5554b447500',
  '7b8b9cbc-0081-4d38-8d2b-64aa587a5046',
  '5a231a9d-e854-4717-ab39-a41eccec2567',
  '8561dcc8-4ae9-4293-862c-86cf0884b5c0'
);