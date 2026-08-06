-- Go Beyond Ops — backfill de 01/08/2026 a 04/08/2026
--
-- POR QUE EXISTE
-- O time só começou a operar no CRM em 05/08. Os quatro primeiros dias de agosto
-- aconteceram fora da plataforma e os números vieram por print/planilha. Este script
-- os lança na camada manual criada pela migration_v10 — sem criar lead nenhum no
-- kanban, que era o requisito.
--
-- DEPENDE DE: migration_v10_metricas_manuais.sql (rode ela primeiro).
-- IDEMPOTENTE: pode rodar de novo; usa ON CONFLICT nas métricas e apaga o lote
-- anterior de manual_sales antes de reinserir.
--
-- ────────────────────────────────────────────────────────────
-- PROCEDÊNCIA DE CADA NÚMERO (leia antes de conferir)
-- ────────────────────────────────────────────────────────────
-- Ana e Carolina .. print do relatório diário (ativações/conversas/ofertas/
--                   follow-ups/agendamentos por dia). Números exatos, não derivados.
-- Bruna ........... print "Meus Registros" por fluxo (Tráfego/Orgânico/Alunos),
--                   somado por dia. MQL = qualificado (confirmado pelo Samuel).
-- Closers ......... vieram como TOTAL do período, sem quebra por dia. Distribuídos
--                   igualmente entre os dias (decisão do Samuel), com o resto sobrando
--                   para os primeiros dias. O total do período está exato; o valor de
--                   um dia isolado é uma estimativa — está anotado em cada linha.
-- Vendas .......... 5 vendas, R$ 46.500 no total. Sem data informada: todas lançadas
--                   em 04/08 (último dia do período). Ajustável pela tela do closer.

begin;

-- ════════════════════════════════════════════════════════════
-- 1. Pré-venda — Ana e Carolina (social sellers)
-- ════════════════════════════════════════════════════════════
-- ⚠ Carolina 04/08: já havia 5 ativações / 3 conversas lançadas no CRM. O print
--   diz 30 / 7. O print vence (é o registro de quem operou o dia). Se o 5/3 for o
--   correto, remova a linha de 2026-08-04 da Carolina abaixo antes de rodar.
--
-- ⚠ Ana 01/08 e 02/08 NÃO estão aqui: o print chegou cortado. Pelo total informado
--   (12 agendamentos de 01 a 04) e o que aparece no print (6 + 5 = 11), falta 1
--   agendamento em algum dos dois dias. Lance pela tela quando tiver o número.

insert into public.social_metrics
  (profile_id, date, ativacoes, conversas, ofertas, follow_ups, agendamentos, nota)
values
  -- Ana — 8febc459-e64d-4a82-9be3-3c7d7a405eda
  ('8febc459-e64d-4a82-9be3-3c7d7a405eda', '2026-08-03', 33, 8, 7, 10, 5, 'backfill 01-04/08 (print)'),
  ('8febc459-e64d-4a82-9be3-3c7d7a405eda', '2026-08-04', 31, 7, 6, 12, 6, 'backfill 01-04/08 (print)'),

  -- Carolina — 7a28764b-42c5-454a-afbd-6a3a4252cdf9
  ('7a28764b-42c5-454a-afbd-6a3a4252cdf9', '2026-08-01', 32, 4, 3,  9, 2, 'backfill 01-04/08 (print)'),
  ('7a28764b-42c5-454a-afbd-6a3a4252cdf9', '2026-08-03', 31, 7, 7, 10, 7, 'backfill 01-04/08 (print)'),
  ('7a28764b-42c5-454a-afbd-6a3a4252cdf9', '2026-08-04', 30, 7, 8,  7, 5, 'backfill 01-04/08 (print; sobrescreve 5/3)')
on conflict (profile_id, date) do update set
  ativacoes    = excluded.ativacoes,
  conversas    = excluded.conversas,
  ofertas      = excluded.ofertas,
  follow_ups   = excluded.follow_ups,
  agendamentos = excluded.agendamentos,
  nota         = excluded.nota,
  updated_at   = now();

-- ════════════════════════════════════════════════════════════
-- 2. Pré-venda — Bruna (SDR)
-- ════════════════════════════════════════════════════════════
-- Soma dos três fluxos do print. Confere: 2 + 0 + 10 = 12 agendamentos de 01 a 03,
-- exatamente o total informado.
--   01/08 · MQLs 0 + 22 + 6 = 28 · Agend. 0 + 0 + 2 = 2
--   02/08 · MQLs 0 + 25 + 9 = 34 · Agend. 0
--   03/08 · MQLs 0 + 19 + 11 = 30 · Agend. 0 + 3 + 7 = 10
--
-- ⚠ As colunas "Agend. S.B." e "Call S.B." do print ficaram de fora: não existe
--   equivalente no schema e o significado da sigla não foi confirmado. Os
--   agendamentos fecham com o total informado usando só a coluna "Agend.", então
--   nenhum número foi perdido — mas confirme se S.B. deveria somar em algum lugar.

insert into public.social_metrics (profile_id, date, mqls, agendamentos, nota)
values
  ('7559f1cd-b8da-4043-95ca-939fc97f512e', '2026-08-01', 28,  2, 'backfill 01-04/08 (print por fluxo)'),
  ('7559f1cd-b8da-4043-95ca-939fc97f512e', '2026-08-02', 34,  0, 'backfill 01-04/08 (print por fluxo)'),
  ('7559f1cd-b8da-4043-95ca-939fc97f512e', '2026-08-03', 30, 10, 'backfill 01-04/08 (print por fluxo)')
on conflict (profile_id, date) do update set
  mqls         = excluded.mqls,
  agendamentos = excluded.agendamentos,
  nota         = excluded.nota,
  updated_at   = now();

-- ════════════════════════════════════════════════════════════
-- 3. Closers — reuniões realizadas e no-shows
-- ════════════════════════════════════════════════════════════
-- Totais informados, divididos igualmente pelos dias do período. O resto da divisão
-- vai para os primeiros dias (ex.: 5 no-shows em 2 dias = 3 + 2).
--
--   Luis Felipe · 01–04 (4 dias) · 10 realizadas → 3+3+2+2 · 8 no-shows → 2+2+2+2
--   Gleiziane   · 03–04 (2 dias) · 11 realizadas → 6+5      · 5 no-shows → 3+2
--   Luana       · 03–04 (2 dias) · 11 realizadas → 6+5      · 3 no-shows → 2+1

insert into public.social_metrics (profile_id, date, reunioes_realizadas, no_shows, nota)
values
  -- Luis Felipe — 2d5986a0-cda8-41ee-ad09-89840d212c82
  ('2d5986a0-cda8-41ee-ad09-89840d212c82', '2026-08-01', 3, 2, 'backfill: total do periodo dividido por dia'),
  ('2d5986a0-cda8-41ee-ad09-89840d212c82', '2026-08-02', 3, 2, 'backfill: total do periodo dividido por dia'),
  ('2d5986a0-cda8-41ee-ad09-89840d212c82', '2026-08-03', 2, 2, 'backfill: total do periodo dividido por dia'),
  ('2d5986a0-cda8-41ee-ad09-89840d212c82', '2026-08-04', 2, 2, 'backfill: total do periodo dividido por dia'),

  -- Gleiziane — 34b03ec4-33a9-4925-8424-ca7cc23cf359
  ('34b03ec4-33a9-4925-8424-ca7cc23cf359', '2026-08-03', 6, 3, 'backfill: total do periodo dividido por dia'),
  ('34b03ec4-33a9-4925-8424-ca7cc23cf359', '2026-08-04', 5, 2, 'backfill: total do periodo dividido por dia'),

  -- Luana — 5765a6ba-8ea9-4c88-b2be-b009ab261002
  ('5765a6ba-8ea9-4c88-b2be-b009ab261002', '2026-08-03', 6, 2, 'backfill: total do periodo dividido por dia'),
  ('5765a6ba-8ea9-4c88-b2be-b009ab261002', '2026-08-04', 5, 1, 'backfill: total do periodo dividido por dia')
on conflict (profile_id, date) do update set
  reunioes_realizadas = excluded.reunioes_realizadas,
  no_shows            = excluded.no_shows,
  nota                = excluded.nota,
  updated_at          = now();

-- ════════════════════════════════════════════════════════════
-- 4. Vendas — 5 vendas, R$ 46.500
-- ════════════════════════════════════════════════════════════
-- Luis Felipe · 2 vendas: as 3 aulas individuais são UM pacote de R$ 18.500
--               (confirmado pelo Samuel), mais 1 aula em grupo de R$ 6.000.
-- product_id aponta para o produto de tabela mais próximo; o valor lançado é o
-- NEGOCIADO, que é por isso que amount é independente de products.default_price.

delete from public.manual_sales where nota = 'backfill 01-04/08';

insert into public.manual_sales (closer_id, sold_on, product_id, product_name, channel, amount, nota)
values
  -- Luis Felipe — R$ 24.500
  ('2d5986a0-cda8-41ee-ad09-89840d212c82', '2026-08-04',
   '22c33339-95ae-4c92-b4ea-5df270d6ac86', 'GB - 3 Aulas Individuais', 'Social Selling',       18500.00, 'backfill 01-04/08'),
  ('2d5986a0-cda8-41ee-ad09-89840d212c82', '2026-08-04',
   '23572431-7e36-4337-a18a-a60f277aa38a', 'GB - 1 Aula em Grupo',     'Formulário - Alunos',   6000.00, 'backfill 01-04/08'),

  -- Gleiziane — R$ 14.500
  ('34b03ec4-33a9-4925-8424-ca7cc23cf359', '2026-08-04',
   '23572431-7e36-4337-a18a-a60f277aa38a', 'GB - 1 Aula em Grupo',     'Social Selling',        6000.00, 'backfill 01-04/08'),
  ('34b03ec4-33a9-4925-8424-ca7cc23cf359', '2026-08-04',
   'd94a7b9e-8891-401f-91c9-58732615b35a', 'GB - 1 Aula Individual',   'Formulário - Alunos',   8500.00, 'backfill 01-04/08'),

  -- Luana — R$ 7.500
  ('5765a6ba-8ea9-4c88-b2be-b009ab261002', '2026-08-04',
   '6d107645-8d32-4df7-96ef-3f30e37b0497', 'GB - 1 Aula em Grupo',     'Social Selling',        7500.00, 'backfill 01-04/08');

commit;

-- ════════════════════════════════════════════════════════════
-- 5. Conferência — rode e compare com os totais informados
-- ════════════════════════════════════════════════════════════
-- Esperado:
--   Ana 11 agendamentos (falta 1: print cortado) · Carolina 14 · Bruna 12
--   Luis Felipe 10 realizadas / 8 no-shows · Gleiziane 11 / 5 · Luana 11 / 3
--   Vendas 5 · Faturamento R$ 46.500

select p.full_name,
       p.role,
       sum(m.ativacoes)           as ativacoes,
       sum(m.conversas)           as conversas,
       sum(m.mqls)                as qualificados,
       sum(m.agendamentos)        as agendamentos,
       sum(m.reunioes_realizadas) as realizadas,
       sum(m.no_shows)            as no_shows
  from public.social_metrics m
  join public.profiles p on p.id = m.profile_id
 where m.date between '2026-08-01' and '2026-08-04'
 group by p.full_name, p.role
 order by p.role, p.full_name;

select p.full_name, count(*) as vendas, sum(s.amount) as faturamento
  from public.manual_sales s
  join public.profiles p on p.id = s.closer_id
 where s.sold_on between '2026-08-01' and '2026-08-04'
 group by p.full_name
 order by faturamento desc;

select channel, count(*) as vendas, sum(amount) as faturamento
  from public.manual_sales
 where sold_on between '2026-08-01' and '2026-08-04'
 group by channel
 order by faturamento desc;
