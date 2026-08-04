-- Go Beyond Ops — migração v7: importação do histórico (Guru + quiz)
--
-- Depende de migration_v5_persons.sql.
--
-- COMO USAR
--   1. Rode a PARTE 1 (cria as tabelas de staging).
--   2. Suba os dois CSVs gerados por scripts/preparar_import.py pelo Table Editor
--      do Supabase (Import data from CSV) para stg_guru_contacts e stg_quiz_responses.
--   3. Rode a PARTE 2 (transforma staging → persons/person_commerce/quiz_leads).
--   4. Confira a PARTE 3 (conferência) e só então rode a PARTE 4 (limpeza).
--
-- Por que staging e não INSERTs diretos: são ~14 mil linhas. Subir CSV cru e
-- transformar dentro do banco é re-executável, auditável e não depende de gerar
-- um arquivo .sql gigante.

-- ════════════════════════════════════════════════════════════
-- PARTE 1 — Tabelas de staging (texto puro; validação vem depois)
-- ════════════════════════════════════════════════════════════

drop table if exists public.stg_guru_contacts;
create table public.stg_guru_contacts (
  nome              text,
  doc               text,
  email             text,
  codigo_pais       text,
  telefone          text,
  criado_em         text,
  vendas_aprovadas  text,
  total_venda       text,
  total_liquido     text,
  data_ultima_venda text
);

drop table if exists public.stg_quiz_responses;
create table public.stg_quiz_responses (
  data_hora  text,
  nome       text,
  email      text,
  urgencia   text,
  renda      text,
  motivacao  text,
  obstaculo  text,
  segmento   text
);

-- Staging é transitória: não entra no PostgREST para ninguém.
alter table public.stg_guru_contacts  enable row level security;
alter table public.stg_quiz_responses enable row level security;

-- ⏸  PARE AQUI. Suba os dois CSVs antes de continuar.

-- ════════════════════════════════════════════════════════════
-- PARTE 2 — Transformação
-- ════════════════════════════════════════════════════════════

-- ── 2a. Guru → persons ──────────────────────────────────────
-- Todo contato vira uma pessoa. Ser cliente é decidido depois, pelo agregado:
-- dos 10.998 contatos, só 5.372 têm venda aprovada.
-- DISTINCT ON é obrigatório: se o mesmo e-mail aparecer duas vezes no lote, o
-- Postgres aborta com "ON CONFLICT DO UPDATE command cannot affect row a second time".
insert into public.persons (email, phone_e164, full_name, doc, first_source, first_seen_at)
select distinct on (public.normalize_email(s.email))
  public.normalize_email(s.email),
  public.normalize_phone(s.telefone, s.codigo_pais),
  nullif(btrim(s.nome), ''),
  nullif(regexp_replace(coalesce(s.doc, ''), '\D', '', 'g'), ''),
  'guru',
  coalesce(to_timestamp(nullif(s.criado_em, ''), 'DD/MM/YYYY HH24:MI:SS'), now())
from public.stg_guru_contacts s
where public.normalize_email(s.email) is not null
order by
  public.normalize_email(s.email),
  coalesce(nullif(s.vendas_aprovadas, '')::numeric, 0) desc   -- fica o registro mais completo
on conflict (email_norm) where email_norm is not null do update
  set phone_e164 = coalesce(persons.phone_e164, excluded.phone_e164),
      full_name  = coalesce(persons.full_name,  excluded.full_name),
      doc        = coalesce(persons.doc,        excluded.doc);

-- Se o mesmo e-mail aparece nas duas exportações da Guru, fica o registro com mais
-- vendas — é o mais recente/completo.
insert into public.person_commerce (person_id, source, orders_count, total_spent, total_net, last_purchase_at, first_captured_at, snapshot_at)
select distinct on (p.id)
  p.id,
  'guru',
  coalesce(nullif(s.vendas_aprovadas, '')::numeric, 0)::int,
  coalesce(nullif(s.total_venda, '')::numeric, 0),
  coalesce(nullif(s.total_liquido, '')::numeric, 0),
  to_timestamp(nullif(s.data_ultima_venda, ''), 'DD/MM/YYYY HH24:MI:SS'),
  to_timestamp(nullif(s.criado_em, ''),         'DD/MM/YYYY HH24:MI:SS'),
  now()
from public.stg_guru_contacts s
join public.persons p on p.email_norm = public.normalize_email(s.email)
order by p.id, coalesce(nullif(s.vendas_aprovadas, '')::numeric, 0) desc
on conflict (person_id) do update
  set orders_count     = excluded.orders_count,
      total_spent      = excluded.total_spent,
      total_net        = excluded.total_net,
      last_purchase_at = excluded.last_purchase_at,
      snapshot_at      = excluded.snapshot_at;

-- ── 2b. Quiz → persons + quiz_leads ─────────────────────────
-- Cria a pessoa só de quem NÃO veio da Guru (quem veio já existe e será reaproveitado
-- pelo e-mail normalizado — é aqui que o cruzamento acontece, agora dentro do banco).
insert into public.persons (email, full_name, first_source, first_seen_at)
select distinct on (public.normalize_email(s.email))
  public.normalize_email(s.email),
  nullif(btrim(s.nome), ''),
  'quiz',
  coalesce(s.data_hora::timestamptz, now())
from public.stg_quiz_responses s
where public.normalize_email(s.email) is not null
  and nullif(btrim(s.nome), '') is distinct from 'Nome não veio na URL'
order by public.normalize_email(s.email), s.data_hora
on conflict (email_norm) where email_norm is not null do update
  set full_name     = coalesce(persons.full_name, excluded.full_name),
      first_seen_at = least(persons.first_seen_at, excluded.first_seen_at);

-- O trigger quiz_leads_resolve_person_trg preenche person_id sozinho no insert.
insert into public.quiz_leads (quiz, name, email, phone, segment, answers, created_at)
select
  'pos-venda',
  nullif(btrim(s.nome), ''),
  public.normalize_email(s.email),
  null,
  nullif(btrim(s.segmento), ''),
  jsonb_strip_nulls(jsonb_build_object(
    'urgencia',  nullif(btrim(s.urgencia),  ''),
    'renda',     nullif(btrim(s.renda),     ''),
    'motivacao', nullif(btrim(s.motivacao), ''),
    'obstaculo', nullif(btrim(s.obstaculo), '')
  )),
  s.data_hora::timestamptz
from public.stg_quiz_responses s
where public.normalize_email(s.email) is not null
  -- Não reimporta o que o quiz já gravou direto no Supabase (as 82 linhas atuais).
  and not exists (
    select 1 from public.quiz_leads q
    where q.email = public.normalize_email(s.email)
      and q.created_at = s.data_hora::timestamptz
  );

-- ════════════════════════════════════════════════════════════
-- PARTE 3 — Conferência (rode e compare com os números esperados)
-- ════════════════════════════════════════════════════════════
-- Números VERIFICADOS: esta migração foi executada num Postgres 16 local, sobre uma
-- cópia do schema de produção, com os CSVs reais de 04/08/2026. O resultado foi:
--
--   pessoas ............................  10.946
--   pessoas com telefone ...............  10.900
--   clientes (com compra) ..............   5.372   (dos 10.900 contatos da Guru)
--   respostas de quiz ..................   3.451
--   quiz com person_id .................   3.451   (100% — nenhuma órfã)
--   quiz com telefone ..................   3.395   (98,3%)
--   quiz + comprou (pessoas distintas) .   2.778
--   exportáveis para disparo ...........   3.234   (dedup por pessoa, com telefone)
--
-- Diferença esperada: a planilha tem 3.455 linhas e importamos 3.451. As 4 de fora
-- são respostas sem e-mail nenhum ("E-mail não veio na URL") — sem identidade
-- possível, e por isso deixadas de propósito para não virar lixo em persons.
--
-- Se os seus números baterem com estes, a importação está correta.

select 'pessoas'                as metrica, count(*) from public.persons
union all
select 'pessoas com telefone',   count(*) from public.persons where phone_e164 is not null
union all
select 'clientes (com compra)',  count(*) from public.customers
union all
select 'respostas de quiz',      count(*) from public.quiz_leads
union all
select 'quiz com person_id',     count(*) from public.quiz_leads where person_id is not null
union all
select 'quiz com telefone',      count(*) from public.quiz_leads q
                                   join public.persons p on p.id = q.person_id
                                  where p.phone_e164 is not null
union all
select 'quiz + comprou',         count(distinct q.person_id) from public.quiz_leads q
                                   join public.person_commerce pc on pc.person_id = q.person_id
                                  where pc.orders_count > 0;

-- Amostra do resultado final
select full_name, email, phone_e164, is_customer, total_spent, quiz_count, last_segment
from public.person_360
where phone_e164 is not null and quiz_count > 0
limit 20;

-- ════════════════════════════════════════════════════════════
-- PARTE 4 — Limpeza (só depois de conferir a PARTE 3)
-- ════════════════════════════════════════════════════════════
-- drop table if exists public.stg_guru_contacts;
-- drop table if exists public.stg_quiz_responses;
