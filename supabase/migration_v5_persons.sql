-- Go Beyond Ops — migração v5: espinha de identidade (persons)
--
-- PROBLEMA QUE RESOLVE
-- A mesma pessoa existe hoje espalhada em quatro lugares sem nada que os ligue:
--   leads (CRM) · quiz_leads (quiz) · Guru (checkout) · student_profiles (app).
-- Todo cruzamento vira trabalho manual por e-mail. Esta migração cria o registro-ouro
-- (public.persons) e faz todos os domínios apontarem para ele.
--
-- PRINCÍPIO
-- persons  = a PESSOA (identidade + contato). Uma linha por ser humano.
-- customer = ESTADO derivado (tem compra aprovada), não tabela. Ver migração v6.
-- profiles / student_profiles continuam sendo as camadas de AUTH (funcionário / aluno);
-- persons é a camada de CONTATO. São coisas diferentes e continuam separadas.
--
-- NÃO QUEBRA NADA: só adiciona. Nenhuma coluna existente é renomeada ou removida,
-- nenhuma policy existente é alterada. person_id entra nullable em tudo.
--
-- Idempotente: pode rodar de novo.

-- ============================================================
-- 1. Normalização (as duas causas de erro de cruzamento)
-- ============================================================

-- E-mail: minúsculo, sem espaço e sem o lixo de querystring.
-- O redirect pós-compra monta a URL com "?" no lugar de "&", então o quiz gravou
-- 3.347 e-mails no formato "pessoa@dominio.com?name=Fulano". O split em "?" limpa isso.
create or replace function public.normalize_email(v text)
returns text
language sql
immutable
as $$
  select nullif(
    case
      when position('@' in lower(btrim(split_part(coalesce(v, ''), '?', 1)))) > 1
        then lower(btrim(split_part(v, '?', 1)))
      else null
    end,
    ''
  );
$$;

-- Telefone → E.164. Devolve null se não for um número plausível, porque telefone
-- inválido guardado como se fosse válido é pior que campo vazio.
--
-- NÃO é só Brasil: a base tem ~1.000 contatos com DDI estrangeiro (Portugal, Reino
-- Unido, Irlanda, Angola, Itália, Moçambique...), que são alunos morando fora. Uma
-- função que só aceitasse +55 descartaria todos eles silenciosamente.
--
-- p_country é o DDI conhecido da origem (a exportação da Guru traz numa coluna
-- separada). Sem ele, assume Brasil.
create or replace function public.normalize_phone(p_phone text, p_country text default '55')
returns text
language plpgsql
immutable
as $$
declare
  d  text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  cc text := nullif(regexp_replace(coalesce(p_country, ''), '\D', '', 'g'), '');
begin
  if d = '' then
    return null;
  end if;
  cc := coalesce(cc, '55');

  if cc = '55' then
    -- Brasil é tratado à parte porque há ambiguidade real: "55" tanto é o DDI
    -- quanto o DDD do Rio Grande do Sul. O comprimento desfaz o empate —
    -- 10/11 dígitos é número local, 12/13 já vem com o DDI.
    if length(d) in (10, 11) then
      d := '55' || d;
    elsif length(d) in (12, 13) and left(d, 2) = '55' then
      null;  -- já completo
    else
      return null;
    end if;
  else
    if left(d, length(cc)) <> cc then
      d := cc || d;
    end if;
    if length(d) < 8 or length(d) > 15 then   -- limites do E.164
      return null;
    end if;
  end if;

  return '+' || d;
end;
$$;

-- ============================================================
-- 2. persons — o registro-ouro
-- ============================================================
create table if not exists public.persons (
  id            uuid primary key default gen_random_uuid(),

  -- Contato. email_norm é GERADO: impossível gravar fora do padrão, o que torna
  -- o índice único confiável para sempre.
  email         text,
  email_norm    text generated always as (public.normalize_email(email)) stored,
  phone_e164    text,
  full_name     text,
  doc           text,                      -- CPF (vem da Guru)

  -- Ponte para o app: student_profiles.id == auth.users.id
  auth_user_id  uuid,

  -- Procedência
  first_source  text,                      -- 'quiz' | 'guru' | 'crm' | 'app' | 'import'
  first_seen_at timestamptz not null default now(),

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Unicidade parcial: e-mail e auth_user_id são chaves quando presentes.
create unique index if not exists persons_email_norm_uidx
  on public.persons (email_norm) where email_norm is not null;
create unique index if not exists persons_auth_user_uidx
  on public.persons (auth_user_id) where auth_user_id is not null;
create index if not exists persons_phone_idx
  on public.persons (phone_e164) where phone_e164 is not null;
create index if not exists persons_doc_idx
  on public.persons (doc) where doc is not null;

drop trigger if exists persons_set_updated_at on public.persons;
create trigger persons_set_updated_at
  before update on public.persons
  for each row execute function public.set_updated_at();

-- ============================================================
-- 3. resolve_person — o coração da identidade
-- ============================================================
-- Acha ou cria a pessoa, na ordem: auth_user_id → e-mail → telefone.
-- Enriquece campos vazios sem nunca sobrescrever dado existente com null.
-- SECURITY DEFINER para que o quiz (anon) consiga resolver identidade sem
-- ganhar permissão de escrita direta em persons.
create or replace function public.resolve_person(
  p_email        text default null,
  p_phone        text default null,
  p_name         text default null,
  p_doc          text default null,
  p_source       text default null,
  p_auth_user_id uuid default null,
  p_seen_at      timestamptz default null,
  p_country      text default '55'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := public.normalize_email(p_email);
  v_phone text := public.normalize_phone(p_phone, p_country);
  v_name  text := nullif(btrim(coalesce(p_name, '')), '');
  v_doc   text := nullif(regexp_replace(coalesce(p_doc, ''), '\D', '', 'g'), '');
  v_id    uuid;
begin
  -- Nomes-placeholder do quiz não são nome de gente.
  if v_name in ('Nome não veio na URL', 'E-mail não veio na URL') then
    v_name := null;
  end if;

  if p_auth_user_id is not null then
    select id into v_id from public.persons where auth_user_id = p_auth_user_id;
  end if;

  if v_id is null and v_email is not null then
    select id into v_id from public.persons where email_norm = v_email;
  end if;

  if v_id is null and v_phone is not null then
    select id into v_id from public.persons where phone_e164 = v_phone order by created_at limit 1;
  end if;

  if v_id is null then
    insert into public.persons (email, phone_e164, full_name, doc, auth_user_id, first_source, first_seen_at)
    values (v_email, v_phone, v_name, v_doc, p_auth_user_id, p_source, coalesce(p_seen_at, now()))
    returning id into v_id;
  else
    update public.persons set
      email         = coalesce(email, v_email),
      phone_e164    = coalesce(phone_e164, v_phone),
      full_name     = coalesce(full_name, v_name),
      doc           = coalesce(doc, v_doc),
      auth_user_id  = coalesce(auth_user_id, p_auth_user_id),
      first_seen_at = least(first_seen_at, coalesce(p_seen_at, first_seen_at))
    where id = v_id;
  end if;

  return v_id;
end;
$$;

grant execute on function public.resolve_person(text, text, text, text, text, uuid, timestamptz, text)
  to anon, authenticated, service_role;

-- ============================================================
-- 4. Ligar os domínios existentes a persons
-- ============================================================

alter table public.leads       add column if not exists person_id uuid references public.persons (id) on delete set null;
alter table public.quiz_leads  add column if not exists person_id uuid references public.persons (id) on delete set null;

create index if not exists leads_person_id_idx      on public.leads (person_id);
create index if not exists quiz_leads_person_id_idx on public.quiz_leads (person_id);
create index if not exists quiz_leads_created_idx   on public.quiz_leads (created_at);

-- Todo lead novo do quiz resolve identidade sozinho. É isto que impede o
-- cruzamento manual de planilha de voltar a acontecer.
create or replace function public.quiz_leads_resolve_person()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.person_id is null then
    new.person_id := public.resolve_person(
      p_email   => new.email,
      p_phone   => new.phone,
      p_name    => new.name,
      p_source  => 'quiz',
      p_seen_at => coalesce(new.created_at, now())
    );
  end if;
  return new;
end;
$$;

drop trigger if exists quiz_leads_resolve_person_trg on public.quiz_leads;
create trigger quiz_leads_resolve_person_trg
  before insert on public.quiz_leads
  for each row execute function public.quiz_leads_resolve_person();

-- ============================================================
-- 5. Comércio — separado de public.sales, de propósito
-- ============================================================
-- public.sales é venda COM CLOSER (closer_id not null) e alimenta ranking e metas
-- do time. Compra self-service do Autodidata Fluente não tem closer: jogar a Guru
-- lá dentro corromperia todo o dashboard de performance. Por isso, tabela própria.

-- 5a. Transação individual. Hoje vazia; é o destino do webhook da Guru.
create table if not exists public.purchases (
  id           uuid primary key default gen_random_uuid(),
  person_id    uuid not null references public.persons (id) on delete cascade,
  source       text not null,             -- 'guru' | 'manual' | ...
  external_id  text,                      -- id da transação na origem (idempotência)
  product_name text,
  product_id   uuid references public.products (id),
  amount       numeric(12, 2) not null default 0,
  status       text not null default 'aprovada',
  purchased_at timestamptz not null,
  raw          jsonb,
  created_at   timestamptz not null default now()
);
create unique index if not exists purchases_source_external_uidx
  on public.purchases (source, external_id) where external_id is not null;
create index if not exists purchases_person_idx on public.purchases (person_id, purchased_at);

-- 5b. Snapshot agregado. A exportação de Contatos da Guru NÃO traz transação
-- individual — traz totais por contato (vendas aprovadas / total venda / data última
-- venda). Fabricar linhas em purchases a partir disso seria inventar dado, então o
-- agregado mora aqui, explicitamente marcado como snapshot com a data em que foi tirado.
create table if not exists public.person_commerce (
  person_id         uuid primary key references public.persons (id) on delete cascade,
  source            text not null default 'guru',
  orders_count      integer not null default 0,
  total_spent       numeric(12, 2) not null default 0,
  total_net         numeric(12, 2),
  last_purchase_at  timestamptz,
  first_captured_at timestamptz,
  snapshot_at       timestamptz not null default now()
);
create index if not exists person_commerce_customer_idx
  on public.person_commerce (orders_count) where orders_count > 0;

-- ============================================================
-- 6. Ponte com o app (Autodidata Fluente)
-- ============================================================
-- student_profiles hoje não guarda e-mail — ele só existe em auth.users, que a
-- API não expõe. Sem e-mail, não há como ligar aluno do app a comprador da Guru.
-- A coluna abaixo fecha essa lacuna; o trigger já recebe new.email de graça.
alter table public.student_profiles add column if not exists email text;
alter table public.student_profiles add column if not exists person_id uuid references public.persons (id) on delete set null;

create index if not exists student_profiles_person_idx on public.student_profiles (person_id);
create index if not exists student_profiles_email_idx  on public.student_profiles (email);

create or replace function public.handle_new_student_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_person uuid;
begin
  if new.raw_user_meta_data ->> 'app' is distinct from 'autodidata' then
    return new;
  end if;

  -- Liga o aluno à identidade já existente (ele comprou antes de criar conta),
  -- ou cria a pessoa se for o primeiro contato.
  v_person := public.resolve_person(
    p_email        => new.email,
    p_name         => coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    p_source       => 'app',
    p_auth_user_id => new.id
  );

  insert into public.student_profiles (id, name, email, person_id, onboarding_status)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', new.email),
    new.email,
    v_person,
    'pending'
  )
  on conflict (id) do update
    set email     = coalesce(student_profiles.email, excluded.email),
        person_id = coalesce(student_profiles.person_id, excluded.person_id);

  return new;
end;
$$;

-- ============================================================
-- 7. RLS
-- ============================================================
-- Dado de contato e financeiro é sensível. Leitura: admin vê tudo; SDR/closer só
-- veem a pessoa por trás de um lead que já podem ver (herda a regra de leads).
-- Escrita: ninguém pelo PostgREST — só service_role (imports e Edge Functions) e
-- resolve_person, que é security definer.

alter table public.persons         enable row level security;
alter table public.purchases       enable row level security;
alter table public.person_commerce enable row level security;

drop policy if exists persons_select on public.persons;
create policy persons_select on public.persons
  for select to authenticated
  using (
    public.get_my_role() = 'admin'
    or exists (
      select 1 from public.leads l
      where l.person_id = persons.id
        and (l.owner_id = auth.uid() or l.closer_id = auth.uid())
    )
  );

drop policy if exists persons_admin_write on public.persons;
create policy persons_admin_write on public.persons
  for all to authenticated
  using (public.get_my_role() = 'admin')
  with check (public.get_my_role() = 'admin');

drop policy if exists purchases_select on public.purchases;
create policy purchases_select on public.purchases
  for select to authenticated
  using (public.get_my_role() = 'admin');

drop policy if exists person_commerce_select on public.person_commerce;
create policy person_commerce_select on public.person_commerce
  for select to authenticated
  using (public.get_my_role() = 'admin');

-- student_profiles hoje é "id = auth.uid()" e mais nada: nem o admin enxerga.
-- Sem isto, engajamento no app nunca aparece no painel. Policy ADITIVA — o aluno
-- continua vendo o próprio registro exatamente como antes.
drop policy if exists student_profiles_admin_select on public.student_profiles;
create policy student_profiles_admin_select on public.student_profiles
  for select to authenticated
  using (public.get_my_role() = 'admin');

-- ============================================================
-- 8. Backfill do que já existe no banco
-- ============================================================
-- Volumes atuais são pequenos (52 leads, 82 quiz_leads, 2 alunos), então roda direto.

update public.leads l
   set person_id = public.resolve_person(
         p_email   => l.email,
         p_phone   => l.whatsapp,
         p_name    => l.name,
         p_source  => 'crm',
         p_seen_at => l.created_at
       )
 where l.person_id is null
   and (l.email is not null or l.whatsapp is not null);

update public.quiz_leads q
   set person_id = public.resolve_person(
         p_email   => q.email,
         p_phone   => q.phone,
         p_name    => q.name,
         p_source  => 'quiz',
         p_seen_at => q.created_at
       )
 where q.person_id is null
   and (q.email is not null or q.phone is not null);

-- ============================================================
-- LIMPEZA OPCIONAL (revise antes de rodar)
-- ============================================================
-- Existem DUAS versões de get_quiz_stats em produção: a de 2 argumentos (v4) e a
-- de 3 (com p_quiz). O front só chama a de 3 — useQuizAnalytics.ts sempre manda
-- p_quiz. A de 2 é código morto e uma ambiguidade esperando para confundir.
-- Descomente para remover:
--
-- drop function if exists public.get_quiz_stats(timestamptz, timestamptz);
