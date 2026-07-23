-- Go Beyond Ops — usuários FAKE para validar usabilidade
-- Rodar no SQL Editor do Supabase (depois de schema.sql).
-- Cria 3 contas de teste (SDR, Social Seller, Closer) direto no Supabase Auth,
-- sem precisar da Edge Function admin-create-user.
--
-- Login de todas: senha "gobeyond123"
--   sdr@gobeyond.test
--   social@gobeyond.test
--   closer@gobeyond.test
--
-- Idempotente: se o email já existir, pula. Para remover depois, veja o bloco no fim.

do $$
declare
  rec record;
  new_user_id uuid;
begin
  for rec in
    select * from (values
      ('sdr@gobeyond.test',    'SDR Teste',           'sdr'),
      ('social@gobeyond.test', 'Social Seller Teste', 'social_seller'),
      ('closer@gobeyond.test', 'Closer Teste',        'closer')
    ) as t(email, full_name, role)
  loop
    if exists (select 1 from auth.users where email = rec.email) then
      continue;
    end if;

    new_user_id := gen_random_uuid();

    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data,
      confirmation_token, recovery_token, email_change_token_new, email_change
    ) values (
      '00000000-0000-0000-0000-000000000000',
      new_user_id, 'authenticated', 'authenticated', rec.email,
      crypt('gobeyond123', gen_salt('bf')),
      now(), now(), now(),
      '{"provider":"email","providers":["email"]}',
      jsonb_build_object('full_name', rec.full_name, 'role', rec.role),
      '', '', '', ''
    );

    insert into auth.identities (
      id, user_id, identity_data, provider, provider_id,
      last_sign_in_at, created_at, updated_at
    ) values (
      gen_random_uuid(), new_user_id,
      jsonb_build_object('sub', new_user_id::text, 'email', rec.email),
      'email', new_user_id::text,
      now(), now(), now()
    );
  end loop;
end $$;

-- Garante que os profiles tenham o papel certo (caso o trigger tenha usado o default).
update public.profiles p
set role = 'sdr'
from auth.users u
where p.id = u.id and u.email = 'sdr@gobeyond.test';

update public.profiles p
set role = 'social_seller'
from auth.users u
where p.id = u.id and u.email = 'social@gobeyond.test';

update public.profiles p
set role = 'closer'
from auth.users u
where p.id = u.id and u.email = 'closer@gobeyond.test';

-- Confira o resultado:
select u.email, pr.full_name, pr.role, pr.active
from auth.users u
join public.profiles pr on pr.id = u.id
order by pr.role;

-- ---------------------------------------------------------------------------
-- Para REMOVER os usuários de teste depois (descomente e rode):
-- delete from auth.users
-- where email in ('sdr@gobeyond.test', 'social@gobeyond.test', 'closer@gobeyond.test');
-- (o profile some junto por cascade)
