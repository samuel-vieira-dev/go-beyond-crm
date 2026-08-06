-- Go Beyond Ops — migração v11: venda e faturamento no relatório diário
--
-- PROBLEMA QUE RESOLVE
-- O closer preenche o dia dele numa linha só: reuniões marcadas, realizadas,
-- no-shows, vendas e faturamento. Mas vendas e faturamento só existiam em
-- manual_sales, uma linha POR VENDA, com produto e canal — detalhe demais para o
-- lançamento do fim do dia, e impossível de editar numa grade de números.
--
-- Aqui o agregado diário passa a morar junto com o resto do lançamento, em
-- social_metrics. manual_sales continua existindo, mas muda de papel: deixa de ser
-- a fonte do total e passa a ser só a ATRIBUIÇÃO POR CANAL desse total.
--
-- REGRA QUE EVITA CONTAGEM DUPLA (implementada em useChannelSales):
--   total do período  = soma de social_metrics.faturamento
--   quebra por canal  = manual_sales agrupada por canal, e o que sobrar do total
--                       cai em "Sem canal"
-- Assim o dashboard de canal nunca soma mais do que o funil mostra.
--
-- Idempotente: pode rodar de novo.

begin;

-- ════════════════════════════════════════════════════════════
-- 1. Agregado diário de venda
-- ════════════════════════════════════════════════════════════
alter table public.social_metrics add column if not exists vendas      integer not null default 0;
alter table public.social_metrics add column if not exists faturamento numeric(12, 2) not null default 0;

comment on column public.social_metrics.vendas is
  'Vendas fechadas no dia (agregado do relatório diário do closer).';
comment on column public.social_metrics.faturamento is
  'Faturamento do dia. É o valor NEGOCIADO, não o preço de tabela do produto.';

-- O check antigo não cobria as colunas novas; refaz incluindo as duas.
alter table public.social_metrics drop constraint if exists social_metrics_nao_negativo;
alter table public.social_metrics add constraint social_metrics_nao_negativo check (
  ativacoes >= 0 and conversas >= 0 and mqls >= 0 and ofertas >= 0 and follow_ups >= 0
  and agendamentos >= 0 and reunioes_realizadas >= 0 and no_shows >= 0
  and vendas >= 0 and faturamento >= 0
);

-- ════════════════════════════════════════════════════════════
-- 2. Migra o que já está em manual_sales para o agregado diário
-- ════════════════════════════════════════════════════════════
-- As 5 vendas do backfill de 01–04/08 viram contagem + soma por closer/dia.
-- manual_sales NÃO é apagada: ela é que guarda de qual canal veio cada real.
insert into public.social_metrics (profile_id, date, vendas, faturamento)
select closer_id, sold_on, count(*)::int, sum(amount)
  from public.manual_sales
 group by closer_id, sold_on
on conflict (profile_id, date) do update set
  vendas      = excluded.vendas,
  faturamento = excluded.faturamento,
  updated_at  = now();

commit;

-- ════════════════════════════════════════════════════════════
-- 3. Conferência — os dois lados têm que bater
-- ════════════════════════════════════════════════════════════
-- Esperado para 01–04/08: 5 vendas, R$ 46.500 nos dois selects.

select 'agregado (social_metrics)' as fonte, sum(vendas) as vendas, sum(faturamento) as faturamento
  from public.social_metrics where date between '2026-08-01' and '2026-08-04'
union all
select 'atribuido por canal (manual_sales)', count(*), sum(amount)
  from public.manual_sales where sold_on between '2026-08-01' and '2026-08-04';
