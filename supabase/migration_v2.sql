-- Go Beyond Ops — migração v2
-- 1) Atividades de CRM (Ligação, Follow-up, Lembrete, E-mail, Tarefa)
-- 2) Reverte a visibilidade para "cada um vê os seus" + fila de não atribuídos
--    (Admin continua vendo tudo e pode distribuir; meetings ficam legíveis para o
--     slot picker checar horários ocupados).
-- Rodar no SQL Editor do Supabase.

-- ============================================================
-- 1) Atividades
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

-- ============================================================
-- 2) Visibilidade por dono (reverte o board compartilhado)
-- ============================================================

-- leads: cada um vê os seus + fila sem dono; admin vê tudo.
drop policy if exists leads_select on public.leads;
create policy leads_select on public.leads
  for select to authenticated
  using (
    public.get_my_role() = 'admin'
    or owner_id = auth.uid()
    or closer_id = auth.uid()
    or (owner_id is null and public.get_my_role() in ('sdr', 'social_seller'))
  );

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

-- meetings: SELECT permanece aberto para o slot picker enxergar horários ocupados
-- (os detalhes do lead continuam protegidos pela RLS de leads).
drop policy if exists meetings_select on public.meetings;
create policy meetings_select on public.meetings
  for select to authenticated
  using (true);

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
