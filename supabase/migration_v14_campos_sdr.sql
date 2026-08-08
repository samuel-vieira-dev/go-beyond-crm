-- Go Beyond Ops — migração v14: campos novos do relatório diário da SDR
--
-- O QUE MUDA
-- A grade "Seu relatório do dia" da SDR passa a ter seis colunas, nesta ordem:
--   1. Leads recebidos     (READ-ONLY, derivado do kanban: leads.owner_id + created_at)
--   2. Leads qualificados  (READ-ONLY, derivado do kanban: os mesmos, com is_mql)
--   3. Agendamentos diretos (manual — coluna nova aqui)
--   4. Em atendimento       (manual — coluna nova aqui)
--   5. Follow-up            (manual — já existia: follow_ups)
--   6. Agendamentos         (manual — já existia: agendamentos)
--
-- As duas primeiras NÃO viram coluna: são contagem derivada de public.leads, lida na
-- hora. Guardar cópia delas aqui criaria uma segunda verdade que envelhece sozinha —
-- qualificar um lead depois deixaria o número gravado desatualizado.
--
-- "mqls" e "ofertas" saem da grade da SDR (o qualificado agora é o derivado do
-- kanban), mas as colunas ficam: a Social Seller ainda lança as duas.
--
-- Idempotente: pode rodar de novo.

begin;

-- ════════════════════════════════════════════════════════════
-- 1. Colunas novas
-- ════════════════════════════════════════════════════════════
alter table public.social_metrics add column if not exists em_atendimento       integer not null default 0;
alter table public.social_metrics add column if not exists agendamentos_diretos integer not null default 0;

comment on column public.social_metrics.em_atendimento is
  'Leads que a pré-venda colocou em atendimento no dia, lançados à mão.';
comment on column public.social_metrics.agendamentos_diretos is
  'Reunião marcada direto, sem passar pelo fluxo de qualificação. Métrica SEPARADA de '
  '"agendamentos": no ranking de pré-vendas as duas aparecem em colunas distintas, e no '
  'funil geral (Dashboard) elas são somadas.';

-- ════════════════════════════════════════════════════════════
-- 2. Constraint de não-negativo passa a cobrir as colunas novas
-- ════════════════════════════════════════════════════════════
-- Recriada porque um check já existente não se estende sozinho a coluna nova.
alter table public.social_metrics drop constraint if exists social_metrics_nao_negativo;
alter table public.social_metrics add constraint social_metrics_nao_negativo check (
  ativacoes >= 0 and conversas >= 0 and mqls >= 0 and ofertas >= 0 and follow_ups >= 0
  and agendamentos >= 0 and reunioes_realizadas >= 0 and no_shows >= 0
  and em_atendimento >= 0 and agendamentos_diretos >= 0
);

commit;

-- ════════════════════════════════════════════════════════════
-- 3. Conferência
-- ════════════════════════════════════════════════════════════
select column_name, data_type, column_default
  from information_schema.columns
 where table_schema = 'public' and table_name = 'social_metrics'
   and column_name in ('em_atendimento', 'agendamentos_diretos')
 order by column_name;
