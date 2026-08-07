-- Go Beyond Ops — migração v13: "perdido" vira MARCA do lead, não etapa
--
-- PROBLEMA QUE RESOLVE
-- Perder um lead só era possível arrastando o card para a coluna "Perdido" — que só
-- existe no board da Gestão. No board do SDR, da Social Seller e do Closer não havia
-- como marcar perda: o card ficava para sempre na coluna, poluindo o pipeline.
--
-- Além disso, trocar `stage` para 'perdido' apagava a informação mais útil da perda:
-- EM QUE ETAPA ela aconteceu. Perder na qualificação e perder no follow-up de
-- fechamento são problemas diferentes, e depois do stage_change viravam a mesma coisa.
--
-- SOLUÇÃO
-- `is_lost` é um flag independente de `stage`. O lead perdido guarda a etapa em que
-- estava, some do kanban (o board filtra is_lost = false) e reaparece inteiro, na
-- coluna de origem, quando o filtro "Ver Leads Perdidos" é ligado.
--
-- Idempotente: pode rodar de novo.

-- ════════════════════════════════════════════════════════════
-- 0. Eventos de auditoria da perda
-- ════════════════════════════════════════════════════════════
-- Fora de transação: um valor novo de enum não pode ser USADO na mesma transação
-- em que foi criado, e o passo 2 grava eventos.
alter type public.lead_event_type add value if not exists 'lost';
alter type public.lead_event_type add value if not exists 'reopened';

begin;

-- ════════════════════════════════════════════════════════════
-- 1. Colunas
-- ════════════════════════════════════════════════════════════
alter table public.leads add column if not exists is_lost boolean not null default false;
alter table public.leads add column if not exists lost_at timestamptz;

comment on column public.leads.is_lost is
  'Lead descartado. Independente de stage: a etapa preservada diz ONDE a perda aconteceu.';
comment on column public.leads.lost_at is
  'Quando foi marcado como perdido. Null enquanto is_lost = false.';

-- O kanban filtra por is_lost em toda consulta; sem índice parcial isso vira
-- seq scan na tabela inteira em todo board.
create index if not exists leads_is_lost_idx on public.leads (is_lost) where is_lost;

-- ════════════════════════════════════════════════════════════
-- 2. Backfill do que já estava em stage = 'perdido'
-- ════════════════════════════════════════════════════════════
-- Mantém o stage: são leads antigos e não há como recuperar a etapa anterior. Eles
-- aparecem na coluna "Perdido" da Gestão quando o filtro de perdidos está ligado.
update public.leads
   set is_lost = true,
       lost_at = coalesce(lost_at, updated_at)
 where stage = 'perdido'
   and is_lost = false;

commit;

-- ════════════════════════════════════════════════════════════
-- 3. Conferência
-- ════════════════════════════════════════════════════════════
select count(*) filter (where is_lost)                       as perdidos,
       count(*) filter (where is_lost and stage <> 'perdido') as perdidos_com_etapa_preservada,
       count(*)                                              as total
  from public.leads;
