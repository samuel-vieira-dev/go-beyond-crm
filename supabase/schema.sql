-- Go Beyond Ops — schema do ciclo de vida do lead
-- Rodar no SQL Editor do Supabase (projeto compartilhado entre apps da Go Beyond).
-- Idempotente: pode ser executado novamente sem duplicar objetos.

-- ============================================================
-- Extensões
-- ============================================================
create extension if not exists "pgcrypto";

-- ============================================================
-- Enums
-- ============================================================
do $$ begin
  create type public.app_role as enum ('admin', 'sdr', 'social_seller', 'closer');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.lead_origin as enum ('quiz', 'clint', 'instagram', 'indicacao', 'manual', 'outro');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.lead_stage as enum (
    'novo_lead',
    'em_atendimento',
    'em_qualificacao',
    'oferta_reuniao',
    'follow_up_prevenda',
    'agendado',
    'reuniao_agendada',
    'reuniao_nao_realizada',
    'reuniao_realizada',
    'follow_up_fechamento',
    'venda_fechada',
    'perdido'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.meeting_status as enum ('agendada', 'realizada', 'nao_compareceu', 'remarcada', 'cancelada');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.lead_event_type as enum (
    'created', 'stage_change', 'note', 'meeting_booked', 'meeting_outcome', 'sale', 'claimed'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.goal_metric as enum ('agendamentos', 'reunioes_realizadas', 'vendas', 'faturamento');
exception when duplicate_object then null; end $$;

-- ============================================================
-- Tabelas
-- ============================================================

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null,
  role public.app_role not null default 'sdr',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  whatsapp text not null,
  email text,
  instagram text,
  profession text,
  income_range text,
  origin public.lead_origin not null default 'manual',
  is_mql boolean not null default false,
  stage public.lead_stage not null default 'novo_lead',
  owner_id uuid references public.profiles (id) on delete set null,
  closer_id uuid references public.profiles (id) on delete set null,
  quiz_answers jsonb,
  utm jsonb,
  lost_reason text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.meetings (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads (id) on delete cascade,
  closer_id uuid not null references public.profiles (id),
  booked_by uuid references public.profiles (id),
  scheduled_at timestamptz not null,
  status public.meeting_status not null default 'agendada',
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  default_price numeric(12, 2) not null default 0,
  active boolean not null default true
);

create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads (id),
  meeting_id uuid references public.meetings (id),
  closer_id uuid not null references public.profiles (id),
  product_id uuid not null references public.products (id),
  amount numeric(12, 2) not null,
  sold_at timestamptz not null default now()
);

create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  metric public.goal_metric not null,
  target_reachable numeric(12, 2) not null,
  target_high numeric(12, 2) not null,
  target_super numeric(12, 2) not null,
  period_start date not null,
  period_end date not null,
  created_at timestamptz not null default now()
);

create table if not exists public.lead_events (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads (id) on delete cascade,
  actor_id uuid references public.profiles (id),
  type public.lead_event_type not null,
  from_stage public.lead_stage,
  to_stage public.lead_stage,
  payload jsonb,
  created_at timestamptz not null default now()
);

-- ============================================================
-- Índices
-- ============================================================
create index if not exists leads_owner_id_idx on public.leads (owner_id);
create index if not exists leads_closer_id_idx on public.leads (closer_id);
create index if not exists leads_stage_idx on public.leads (stage);
create index if not exists leads_created_at_idx on public.leads (created_at);
create index if not exists meetings_closer_id_idx on public.meetings (closer_id);
create index if not exists meetings_scheduled_at_idx on public.meetings (scheduled_at);
create index if not exists sales_closer_id_idx on public.sales (closer_id);
create index if not exists sales_sold_at_idx on public.sales (sold_at);
create index if not exists lead_events_lead_id_idx on public.lead_events (lead_id);

-- ============================================================
-- Funções auxiliares
-- ============================================================

-- Lê o papel do usuário autenticado sem recursão de RLS (security definer).
create or replace function public.get_my_role()
returns public.app_role
language sql
security definer
set search_path = public
stable
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists leads_set_updated_at on public.leads;
create trigger leads_set_updated_at
  before update on public.leads
  for each row execute function public.set_updated_at();

-- Cria o profile automaticamente quando um usuário é criado no Supabase Auth
-- (a Edge Function admin-create-user passa full_name/role em raw_user_meta_data).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.email),
    coalesce((new.raw_user_meta_data ->> 'role')::public.app_role, 'sdr')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- RLS
-- ============================================================
alter table public.profiles enable row level security;
alter table public.leads enable row level security;
alter table public.meetings enable row level security;
alter table public.products enable row level security;
alter table public.sales enable row level security;
alter table public.goals enable row level security;
alter table public.lead_events enable row level security;

-- profiles: qualquer autenticado pode ler (necessário para selects de responsável/closer);
-- só admin gerencia (criação real acontece via Edge Function com service role).
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using (true);

drop policy if exists profiles_admin_write on public.profiles;
create policy profiles_admin_write on public.profiles
  for all to authenticated
  using (public.get_my_role() = 'admin')
  with check (public.get_my_role() = 'admin');

-- leads: cada um vê os seus + fila de não atribuídos; admin vê tudo e distribui.
drop policy if exists leads_select on public.leads;
create policy leads_select on public.leads
  for select to authenticated
  using (
    public.get_my_role() = 'admin'
    or owner_id = auth.uid()
    or closer_id = auth.uid()
    or (owner_id is null and public.get_my_role() in ('sdr', 'social_seller'))
  );

drop policy if exists leads_insert on public.leads;
create policy leads_insert on public.leads
  for insert to authenticated
  with check (public.get_my_role() in ('admin', 'sdr', 'social_seller'));

drop policy if exists leads_update on public.leads;
create policy leads_update on public.leads
  for update to authenticated
  using (
    public.get_my_role() = 'admin'
    or owner_id = auth.uid()
    or closer_id = auth.uid()
    or (owner_id is null and public.get_my_role() in ('sdr', 'social_seller'))
  )
  with check (
    public.get_my_role() = 'admin'
    or owner_id = auth.uid()
    or closer_id = auth.uid()
  );

drop policy if exists leads_delete on public.leads;
create policy leads_delete on public.leads
  for delete to authenticated
  using (
    public.get_my_role() = 'admin'
    or owner_id = auth.uid()
    or closer_id = auth.uid()
    or (owner_id is null and public.get_my_role() in ('sdr', 'social_seller'))
  );

-- meetings: SELECT aberto para o slot picker enxergar horários ocupados
-- (detalhes do lead seguem protegidos pela RLS de leads).
drop policy if exists meetings_select on public.meetings;
create policy meetings_select on public.meetings
  for select to authenticated
  using (true);

drop policy if exists meetings_insert on public.meetings;
create policy meetings_insert on public.meetings
  for insert to authenticated
  with check (
    public.get_my_role() in ('admin', 'sdr', 'social_seller', 'closer')
  );

drop policy if exists meetings_update on public.meetings;
create policy meetings_update on public.meetings
  for update to authenticated
  using (true)
  with check (true);

-- products: leitura liberada para todos autenticados; escrita só admin.
drop policy if exists products_select on public.products;
create policy products_select on public.products
  for select to authenticated
  using (true);

drop policy if exists products_admin_write on public.products;
create policy products_admin_write on public.products
  for all to authenticated
  using (public.get_my_role() = 'admin')
  with check (public.get_my_role() = 'admin');

-- sales: admin vê tudo; closer vê e registra as próprias.
drop policy if exists sales_select on public.sales;
create policy sales_select on public.sales
  for select to authenticated
  using (public.get_my_role() = 'admin' or closer_id = auth.uid());

drop policy if exists sales_insert on public.sales;
create policy sales_insert on public.sales
  for insert to authenticated
  with check (public.get_my_role() = 'admin' or closer_id = auth.uid());

drop policy if exists sales_update on public.sales;
create policy sales_update on public.sales
  for update to authenticated
  using (public.get_my_role() = 'admin' or closer_id = auth.uid())
  with check (public.get_my_role() = 'admin' or closer_id = auth.uid());

-- goals: cada um vê a própria meta; admin vê e gerencia todas.
drop policy if exists goals_select on public.goals;
create policy goals_select on public.goals
  for select to authenticated
  using (public.get_my_role() = 'admin' or profile_id = auth.uid());

drop policy if exists goals_admin_write on public.goals;
create policy goals_admin_write on public.goals
  for all to authenticated
  using (public.get_my_role() = 'admin')
  with check (public.get_my_role() = 'admin');

-- lead_events: segue a visibilidade do lead relacionado.
drop policy if exists lead_events_select on public.lead_events;
create policy lead_events_select on public.lead_events
  for select to authenticated
  using (
    public.get_my_role() = 'admin'
    or exists (
      select 1 from public.leads l
      where l.id = lead_events.lead_id
        and (l.owner_id = auth.uid() or l.closer_id = auth.uid())
    )
  );

drop policy if exists lead_events_insert on public.lead_events;
create policy lead_events_insert on public.lead_events
  for insert to authenticated
  with check (actor_id = auth.uid() or public.get_my_role() = 'admin');

-- ============================================================
-- Atividades de CRM (Ligação, Follow-up, Lembrete, E-mail, Tarefa)
-- ============================================================
do $$ begin
  create type public.activity_type as enum ('ligacao', 'email', 'followup', 'lembrete', 'tarefa');
exception when duplicate_object then null; end $$;

create table if not exists public.activities (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads (id) on delete cascade,
  created_by uuid references public.profiles (id) on delete set null,
  type public.activity_type not null default 'followup',
  title text,
  notes text,
  due_at timestamptz,
  done boolean not null default false,
  done_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists activities_lead_id_idx on public.activities (lead_id);
create index if not exists activities_pending_idx on public.activities (created_by, done, due_at);

alter table public.activities enable row level security;

drop policy if exists activities_select on public.activities;
create policy activities_select on public.activities
  for select to authenticated
  using (
    public.get_my_role() = 'admin'
    or created_by = auth.uid()
    or exists (
      select 1 from public.leads l
      where l.id = activities.lead_id
        and (l.owner_id = auth.uid() or l.closer_id = auth.uid())
    )
  );

drop policy if exists activities_insert on public.activities;
create policy activities_insert on public.activities
  for insert to authenticated
  with check (created_by = auth.uid());

drop policy if exists activities_update on public.activities;
create policy activities_update on public.activities
  for update to authenticated
  using (public.get_my_role() = 'admin' or created_by = auth.uid())
  with check (public.get_my_role() = 'admin' or created_by = auth.uid());

drop policy if exists activities_delete on public.activities;
create policy activities_delete on public.activities
  for delete to authenticated
  using (public.get_my_role() = 'admin' or created_by = auth.uid());
