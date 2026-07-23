-- Go Beyond Ops — migração: board compartilhado
-- Relaxa a RLS para que qualquer membro autenticado veja e mova todos os leads,
-- reuniões e eventos. A atribuição (owner_id/closer_id) passa a ser apenas um
-- marcador de responsável, não um filtro de visibilidade.
-- Rodar no SQL Editor do Supabase (pode rodar sobre um banco que já tem o schema).

-- leads: todos autenticados leem e atualizam qualquer lead; só admin exclui.
drop policy if exists leads_select on public.leads;
create policy leads_select on public.leads
  for select to authenticated
  using (true);

drop policy if exists leads_update on public.leads;
create policy leads_update on public.leads
  for update to authenticated
  using (true)
  with check (true);

-- insert continua restrito a quem cadastra (admin/sdr/social_seller).
drop policy if exists leads_insert on public.leads;
create policy leads_insert on public.leads
  for insert to authenticated
  with check (public.get_my_role() in ('admin', 'sdr', 'social_seller'));

-- lead_events: histórico visível para todos autenticados.
drop policy if exists lead_events_select on public.lead_events;
create policy lead_events_select on public.lead_events
  for select to authenticated
  using (true);

-- meetings: todos veem e atualizam qualquer reunião (necessário para mover cards
-- de qualquer closer e registrar resultado no board compartilhado).
drop policy if exists meetings_select on public.meetings;
create policy meetings_select on public.meetings
  for select to authenticated
  using (true);

drop policy if exists meetings_update on public.meetings;
create policy meetings_update on public.meetings
  for update to authenticated
  using (true)
  with check (true);
