-- Go Beyond Ops — dados de exemplo
-- Rodar depois de schema.sql. Usuários NÃO são criados aqui (Supabase Auth exige a
-- Admin API) — crie-os pela tela Equipe do app (Edge Function admin-create-user) ou
-- em Authentication > Add User no Dashboard do Supabase, depois ajuste o `role` em
-- public.profiles se necessário.

insert into public.products (name, default_price, active) values
  ('Mentoria Individual — 6 meses', 4997.00, true),
  ('Mentoria Individual — 12 meses', 8997.00, true),
  ('Mentoria em Grupo — 6 meses', 2497.00, true)
on conflict do nothing;

-- Leads de exemplo sem responsável, para testar a fila de "Assumir lead".
insert into public.leads (name, whatsapp, email, instagram, profession, income_range, origin, is_mql, stage)
values
  ('Ana Paula Ribeiro', '11988887777', 'ana.ribeiro@example.com', '@anapaula.rb', 'Advogada', 'acima10', 'quiz', true, 'novo_lead'),
  ('Carlos Eduardo Souza', '21977776666', 'cadu.souza@example.com', '@cadusouza', 'Empresário', '8a10', 'quiz', true, 'novo_lead'),
  ('Marina Costa Lima', '31966665555', null, '@marina.costalima', 'Designer', '5a8', 'instagram', false, 'novo_lead')
on conflict do nothing;
