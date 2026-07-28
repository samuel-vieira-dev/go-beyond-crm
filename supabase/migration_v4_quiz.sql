-- Go Beyond Ops — migração v4: analytics do quiz-link-bio
-- Tabela de eventos (view/click por tela) + RPC de agregação para o Dashboard do Quiz.
-- Insert liberado para anon (a página do quiz é pública); leitura só admin.

create table if not exists public.quiz_events (
  id uuid primary key default gen_random_uuid(),
  session_id text,
  screen text not null,
  event_type text not null check (event_type in ('view', 'click')),
  segmento text,
  rota text,
  utm jsonb,
  created_at timestamptz not null default now()
);
create index if not exists quiz_events_created_idx on public.quiz_events (created_at);
create index if not exists quiz_events_screen_idx on public.quiz_events (screen);

alter table public.quiz_events enable row level security;

drop policy if exists quiz_events_insert on public.quiz_events;
create policy quiz_events_insert on public.quiz_events
  for insert to anon, authenticated
  with check (event_type in ('view', 'click'));

drop policy if exists quiz_events_select on public.quiz_events;
create policy quiz_events_select on public.quiz_events
  for select to authenticated
  using (public.get_my_role() = 'admin');

create or replace function public.get_quiz_stats(p_from timestamptz, p_to timestamptz)
returns table(screen text, views bigint, clicks bigint)
language sql stable security definer set search_path = public as $$
  select screen,
    count(*) filter (where event_type = 'view') as views,
    count(*) filter (where event_type = 'click') as clicks
  from public.quiz_events
  where created_at >= p_from and created_at <= p_to
  group by screen;
$$;
grant execute on function public.get_quiz_stats(timestamptz, timestamptz) to authenticated;
