-- Go Beyond Ops — migração v8: Leads Upsell AF (lista de acionamento por WhatsApp)
--
-- Depende de migration_v5_persons.sql e v6.
--
-- O QUE ENTREGA
-- A tela "Leads Upsell AF" do SDR: quem respondeu o quiz pós-venda, tem telefone,
-- e ainda não foi chamado no WhatsApp. Marcar como "contatado" registra QUEM chamou
-- e, opcionalmente, cria o card na coluna "Novo Lead" do kanban de quem marcou.
--
-- POR QUE FUNÇÃO E NÃO ACESSO DIRETO ÀS TABELAS
-- persons guarda CPF (doc) e o snapshot financeiro da pessoa. Liberar select em
-- persons para o papel sdr entregaria isso tudo junto. A função abaixo devolve só
-- as colunas que a tela usa — o SDR nunca enxerga CPF nem faturamento.
--
-- Idempotente: pode rodar de novo.

-- ============================================================
-- 1. Estado de acionamento — uma linha por pessoa
-- ============================================================
-- Chave por person_id (não por resposta de quiz): a mesma pessoa pode ter respondido
-- o quiz mais de uma vez, mas é chamada no WhatsApp uma vez só.
create table if not exists public.quiz_outreach (
  person_id    uuid primary key references public.persons (id) on delete cascade,
  contacted    boolean not null default false,
  contacted_by uuid references public.profiles (id) on delete set null,
  contacted_at timestamptz,
  lead_id      uuid references public.leads (id) on delete set null,  -- card criado no kanban, se houve
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists quiz_outreach_contacted_idx on public.quiz_outreach (contacted);
create index if not exists quiz_outreach_by_idx        on public.quiz_outreach (contacted_by);

drop trigger if exists quiz_outreach_set_updated_at on public.quiz_outreach;
create trigger quiz_outreach_set_updated_at
  before update on public.quiz_outreach
  for each row execute function public.set_updated_at();

alter table public.quiz_outreach enable row level security;

-- Lista compartilhada: todo SDR (e admin) enxerga o estado de todo mundo, para não
-- acontecer de duas pessoas chamarem o mesmo lead. A escrita passa pela RPC abaixo.
drop policy if exists quiz_outreach_select on public.quiz_outreach;
create policy quiz_outreach_select on public.quiz_outreach
  for select to authenticated
  using (public.get_my_role() in ('admin', 'sdr'));

-- ============================================================
-- 2. A lista
-- ============================================================
-- Uma linha por PESSOA (a resposta mais recente do quiz), só quem tem telefone —
-- sem telefone não há o que acionar.
create or replace function public.get_quiz_upsell_leads()
returns table (
  person_id     uuid,
  full_name     text,
  email         text,
  phone_e164    text,
  answered_at   timestamptz,
  segment       text,
  is_qualified  boolean,
  answers       jsonb,
  quiz_count    integer,
  contacted     boolean,
  contacted_at  timestamptz,
  contacted_by  uuid,
  contacted_by_name text,
  lead_id       uuid
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    p.full_name,
    p.email_norm,
    p.phone_e164,
    q.created_at,
    q.segment,
    coalesce(q.segment, '') like 'MQL%'   as is_qualified,
    q.answers,
    q.total::int,
    coalesce(o.contacted, false),
    o.contacted_at,
    o.contacted_by,
    pr.full_name,
    o.lead_id
  from public.persons p
  join lateral (
    select ql.segment, ql.answers, ql.created_at,
           count(*) over () as total
    from public.quiz_leads ql
    where ql.person_id = p.id and ql.quiz = 'pos-venda'
    order by ql.created_at desc
    limit 1
  ) q on true
  left join public.quiz_outreach o on o.person_id = p.id
  left join public.profiles pr      on pr.id = o.contacted_by
  where p.phone_e164 is not null
    and public.get_my_role() in ('admin', 'sdr')  -- definer: a checagem é explícita
  order by q.created_at desc;
$$;

grant execute on function public.get_quiz_upsell_leads() to authenticated;

-- ============================================================
-- 3. Marcar como contatado (e, se pedido, criar o card no kanban)
-- ============================================================
-- Tudo numa transação só: marcar + criar lead + registrar o evento. Se o lead já
-- existir para essa pessoa, reaproveita em vez de duplicar card no kanban.
create or replace function public.mark_quiz_outreach(
  p_person_id   uuid,
  p_contacted   boolean default true,
  p_create_lead boolean default false
)
returns uuid   -- id do lead criado/existente, ou null
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role     public.app_role := public.get_my_role();
  v_lead_id  uuid;
  v_person   public.persons%rowtype;
  v_answers  jsonb;
  v_segment  text;
begin
  if v_role not in ('admin', 'sdr') then
    raise exception 'Sem permissão para acionar leads do quiz.';
  end if;

  select * into v_person from public.persons where id = p_person_id;
  if not found then
    raise exception 'Pessoa não encontrada.';
  end if;

  insert into public.quiz_outreach (person_id, contacted, contacted_by, contacted_at)
  values (
    p_person_id,
    p_contacted,
    case when p_contacted then auth.uid() end,
    case when p_contacted then now() end
  )
  on conflict (person_id) do update
    set contacted    = excluded.contacted,
        -- Desmarcar limpa a autoria: senão fica "chamado por" alguém que não chamou.
        contacted_by = case when excluded.contacted then coalesce(quiz_outreach.contacted_by, auth.uid()) end,
        contacted_at = case when excluded.contacted then coalesce(quiz_outreach.contacted_at, now()) end
  returning lead_id into v_lead_id;

  if p_create_lead and v_lead_id is null then
    -- Já existe card para essa pessoa? Então não cria outro.
    select id into v_lead_id from public.leads where person_id = p_person_id order by created_at limit 1;

    if v_lead_id is null then
      select ql.answers, ql.segment into v_answers, v_segment
      from public.quiz_leads ql
      where ql.person_id = p_person_id and ql.quiz = 'pos-venda'
      order by ql.created_at desc limit 1;

      insert into public.leads (name, whatsapp, email, origin, is_mql, stage, owner_id, person_id, quiz_answers, notes)
      values (
        coalesce(v_person.full_name, v_person.phone_e164),
        v_person.phone_e164,
        v_person.email_norm,
        'quiz',
        coalesce(v_segment, '') like 'MQL%',
        'novo_lead',
        auth.uid(),
        p_person_id,
        v_answers,
        'Veio da lista Leads Upsell AF (quiz pós-venda).'
      )
      returning id into v_lead_id;

      insert into public.lead_events (lead_id, actor_id, type, to_stage, payload)
      values (v_lead_id, auth.uid(), 'created', 'novo_lead',
              jsonb_build_object('source', 'quiz-upsell-af', 'segmento', v_segment));
    end if;

    update public.quiz_outreach set lead_id = v_lead_id where person_id = p_person_id;
  end if;

  return v_lead_id;
end;
$$;

grant execute on function public.mark_quiz_outreach(uuid, boolean, boolean) to authenticated;
