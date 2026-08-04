-- Go Beyond Ops — migração v6: views de ciclo de vida
--
-- Depende de migration_v5_persons.sql.
--
-- Aqui mora a resposta para "quero saber tudo sobre essa pessoa":
--   customers       → quem é cliente (estado derivado, não tabela duplicada)
--   person_360      → uma linha por pessoa com o resumo de todos os domínios
--   person_timeline → a linha do tempo, um evento por linha, pronta pra tela de detalhe
--
-- Views herdam a RLS das tabelas de base (security_invoker), então quem não pode
-- ver a pessoa continua não podendo ver — sem policy nova para manter.

-- ============================================================
-- customers — cliente é ESTADO, não cadastro
-- ============================================================
-- Por que view e não tabela: a exportação da Guru tem 10.998 contatos, mas só
-- 5.372 compraram. Uma tabela "customers" com esses 10.998 seria 51% de não-clientes.
-- E duas tabelas com a mesma pessoa viram, inevitavelmente, duas verdades diferentes.
--
-- Conta compra real (purchases) quando existir; cai para o snapshot da Guru enquanto
-- o webhook de transação não estiver ligado.
create or replace view public.customers
with (security_invoker = true) as
select
  p.id            as person_id,
  p.full_name,
  p.email_norm    as email,
  p.phone_e164,
  p.doc,
  coalesce(pur.orders_count, pc.orders_count, 0)     as orders_count,
  coalesce(pur.total_spent,  pc.total_spent,  0)     as total_spent,
  coalesce(pur.first_purchase_at, pc.first_captured_at) as first_purchase_at,
  coalesce(pur.last_purchase_at,  pc.last_purchase_at)  as last_purchase_at,
  case when pur.orders_count is not null then 'purchases' else 'guru_snapshot' end as data_source,
  p.created_at
from public.persons p
left join public.person_commerce pc on pc.person_id = p.id
left join lateral (
  select count(*)::int          as orders_count,
         sum(amount)            as total_spent,
         min(purchased_at)      as first_purchase_at,
         max(purchased_at)      as last_purchase_at
  from public.purchases x
  where x.person_id = p.id and x.status = 'aprovada'
  having count(*) > 0
) pur on true
where coalesce(pur.orders_count, pc.orders_count, 0) > 0;

-- ============================================================
-- person_360 — uma linha por pessoa, todos os domínios
-- ============================================================
create or replace view public.person_360
with (security_invoker = true) as
select
  p.id          as person_id,
  p.full_name,
  p.email_norm  as email,
  p.phone_e164,
  p.doc,
  p.first_source,
  p.first_seen_at,

  -- Comercial — vem da view customers para existir UMA definição de "é cliente"
  c.person_id is not null      as is_customer,
  coalesce(c.orders_count, 0)  as orders_count,
  coalesce(c.total_spent, 0)   as total_spent,
  c.first_purchase_at,
  c.last_purchase_at,

  -- CRM
  ld.lead_id,
  ld.stage       as lead_stage,
  ld.is_mql,
  ld.origin      as lead_origin,
  ld.owner_id    as lead_owner_id,
  ld.lead_created_at,

  -- Quiz
  coalesce(qz.quiz_count, 0) as quiz_count,
  qz.last_quiz,
  qz.last_segment,
  qz.last_answers,
  qz.last_quiz_at,

  -- App
  sp.id is not null          as has_app_account,
  sp.onboarding_status       as app_onboarding_status,
  sp.level                   as app_level,
  sp.created_at              as app_signup_at,
  coalesce(ap.conversations_count, 0) as app_conversations,
  ap.last_app_activity_at

from public.persons p

left join public.customers c on c.person_id = p.id

-- Lead mais recente da pessoa
left join lateral (
  select l.id as lead_id, l.stage, l.is_mql, l.origin, l.owner_id, l.created_at as lead_created_at
  from public.leads l
  where l.person_id = p.id
  order by l.created_at desc
  limit 1
) ld on true

-- Resumo dos quizzes: quantos, e o conteúdo do último
left join lateral (
  select count(*)::int as quiz_count,
         (array_agg(q.quiz      order by q.created_at desc))[1] as last_quiz,
         (array_agg(q.segment   order by q.created_at desc))[1] as last_segment,
         (array_agg(q.answers   order by q.created_at desc))[1] as last_answers,
         max(q.created_at)                                      as last_quiz_at
  from public.quiz_leads q
  where q.person_id = p.id
) qz on true

left join public.student_profiles sp on sp.person_id = p.id

-- Atividade no app
left join lateral (
  select count(*)::int as conversations_count, max(c.created_at) as last_app_activity_at
  from public.john_conversations c
  where c.user_id = sp.id
) ap on true;

-- ============================================================
-- person_timeline — o ciclo de vida, evento a evento
-- ============================================================
-- Cada fonte vira linhas com o mesmo formato. Fonte nova no futuro = mais um
-- UNION ALL aqui, sem tocar em nada do que já existe.
create or replace view public.person_timeline
with (security_invoker = true) as

  -- Virou lead
  select l.person_id, l.created_at as occurred_at, 'lead_created' as event_type, 'crm' as domain,
         'Entrou no CRM como ' || l.origin::text as label,
         jsonb_build_object('lead_id', l.id, 'origin', l.origin, 'is_mql', l.is_mql) as payload
  from public.leads l where l.person_id is not null

  union all
  -- Movimentações no funil
  select l.person_id, e.created_at, 'lead_' || e.type::text, 'crm',
         coalesce(e.from_stage::text || ' → ' || e.to_stage::text, e.type::text),
         coalesce(e.payload, '{}'::jsonb)
  from public.lead_events e
  join public.leads l on l.id = e.lead_id
  where l.person_id is not null

  union all
  -- Respondeu quiz (com as respostas junto)
  select q.person_id, q.created_at, 'quiz_answered', 'quiz',
         'Respondeu o quiz ' || q.quiz || coalesce(' — ' || q.segment, ''),
         jsonb_build_object('quiz', q.quiz, 'segment', q.segment, 'answers', q.answers, 'utm', q.utm)
  from public.quiz_leads q where q.person_id is not null

  union all
  -- Comprou (transação real)
  select pu.person_id, pu.purchased_at, 'purchase', 'commerce',
         'Compra: ' || coalesce(pu.product_name, 'produto') || ' — R$ ' || pu.amount::text,
         jsonb_build_object('amount', pu.amount, 'source', pu.source, 'status', pu.status)
  from public.purchases pu where pu.status = 'aprovada'

  union all
  -- Última compra conhecida via snapshot da Guru (enquanto não há transação individual)
  select pc.person_id, pc.last_purchase_at, 'purchase_snapshot', 'commerce',
         'Última compra (snapshot Guru) — ' || pc.orders_count::text || ' pedido(s), R$ ' || pc.total_spent::text,
         jsonb_build_object('orders_count', pc.orders_count, 'total_spent', pc.total_spent, 'snapshot_at', pc.snapshot_at)
  from public.person_commerce pc
  where pc.last_purchase_at is not null
    and not exists (select 1 from public.purchases x where x.person_id = pc.person_id)

  union all
  -- Criou conta no app
  select sp.person_id, sp.created_at, 'app_signup', 'app',
         'Criou conta no Autodidata Fluente',
         jsonb_build_object('onboarding_status', sp.onboarding_status, 'level', sp.level)
  from public.student_profiles sp where sp.person_id is not null

  union all
  -- Concluiu onboarding
  select sp.person_id, os.completed_at, 'app_onboarding_done', 'app',
         'Concluiu o onboarding',
         jsonb_build_object('mode', os.mode)
  from public.onboarding_sessions os
  join public.student_profiles sp on sp.id = os.user_id
  where os.completed_at is not null and sp.person_id is not null

  union all
  -- Conversou com o John
  select sp.person_id, c.created_at, 'app_conversation', 'app',
         'Conversa com o John (' || c.kind || ')',
         jsonb_build_object('conversation_id', c.id, 'kind', c.kind)
  from public.john_conversations c
  join public.student_profiles sp on sp.id = c.user_id
  where sp.person_id is not null;

-- ============================================================
-- RPC para a tela de detalhe
-- ============================================================
create or replace function public.get_person_timeline(p_person_id uuid)
returns table (occurred_at timestamptz, event_type text, domain text, label text, payload jsonb)
language sql
stable
as $$
  select t.occurred_at, t.event_type, t.domain, t.label, t.payload
  from public.person_timeline t
  where t.person_id = p_person_id
    and t.occurred_at is not null
  order by t.occurred_at;
$$;

grant execute on function public.get_person_timeline(uuid) to authenticated;

-- ============================================================
-- Exportação de leads para disparo (o caso de uso imediato)
-- ============================================================
-- Filtra por segmento/renda/urgência do quiz e devolve só quem tem telefone.
create or replace function public.export_quiz_contacts(
  p_from      timestamptz default '-infinity',
  p_to        timestamptz default 'infinity',
  p_quiz      text default null,
  p_segment   text default null,
  p_only_customers boolean default false
)
returns table (
  full_name    text,
  phone_e164   text,
  email        text,
  quiz         text,
  segment      text,
  urgencia     text,
  renda        text,
  motivacao    text,
  obstaculo    text,
  is_customer  boolean,
  total_spent  numeric,
  answered_at  timestamptz
)
language sql
stable
as $$
  -- SEM security definer de propósito: a RLS de persons/person_commerce já restringe
  -- a admin. Definer aqui só criaria superfície de escalonamento sem ganho nenhum.
  select distinct on (p.id)
    p.full_name,
    p.phone_e164,
    p.email_norm,
    q.quiz,
    q.segment,
    q.answers ->> 'urgencia',
    q.answers ->> 'renda',
    q.answers ->> 'motivacao',
    q.answers ->> 'obstaculo',
    coalesce(pc.orders_count, 0) > 0,
    coalesce(pc.total_spent, 0),
    q.created_at
  from public.quiz_leads q
  join public.persons p on p.id = q.person_id
  left join public.person_commerce pc on pc.person_id = p.id
  where p.phone_e164 is not null
    and q.created_at between p_from and p_to
    and (p_quiz is null or q.quiz = p_quiz)
    and (p_segment is null or q.segment = p_segment)
    and (not p_only_customers or coalesce(pc.orders_count, 0) > 0)
  order by p.id, q.created_at desc;
$$;

grant execute on function public.export_quiz_contacts(timestamptz, timestamptz, text, text, boolean)
  to authenticated;
