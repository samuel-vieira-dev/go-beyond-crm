-- Go Beyond Ops — migração v10: camada de lançamento manual de métricas
--
-- PROBLEMA QUE RESOLVE
-- Agendamento, reunião realizada, no-show e venda só existem hoje como linha de
-- public.meetings / public.sales, e as duas exigem lead_id NOT NULL. Consequência:
-- todo número que aconteceu fora do CRM (time operando no WhatsApp/Business Suite,
-- ou período anterior à adoção da plataforma) só entraria no dashboard se alguém
-- fabricasse leads — sujando o kanban com dezenas de cards falsos que ninguém vai
-- atender e que corrompem o funil de origem.
--
-- Esta migração cria o lugar certo para esse número: agregado por pessoa e por dia,
-- sem card, explicitamente marcado como lançamento manual.
--
-- PRINCÍPIO: manual SOMA ao que veio do CRM, nunca substitui.
-- Um dia pode ter 3 agendamentos com card + 2 lançados à mão = 5 no relatório.
-- Por isso os defaults são 0 e nada aqui reescreve meetings/sales.
--
-- Idempotente: pode rodar de novo.

-- ════════════════════════════════════════════════════════════
-- 1. social_metrics vira a tabela de lançamento de TODOS os papéis
-- ════════════════════════════════════════════════════════════
-- O nome fica por compatibilidade: renomear derrubaria o front que já está no ar
-- (o deploy antigo continua lendo 'social_metrics' até o próximo build subir).
-- As colunas novas entram com default 0, então o front antigo segue funcionando
-- sem enxergá-las.

alter table public.social_metrics add column if not exists mqls                integer not null default 0;
alter table public.social_metrics add column if not exists ofertas             integer not null default 0;
alter table public.social_metrics add column if not exists follow_ups          integer not null default 0;
alter table public.social_metrics add column if not exists agendamentos        integer not null default 0;
alter table public.social_metrics add column if not exists reunioes_realizadas integer not null default 0;
alter table public.social_metrics add column if not exists no_shows            integer not null default 0;
alter table public.social_metrics add column if not exists nota                text;

comment on table public.social_metrics is
  'Lançamento manual de métricas por pessoa/dia (todos os papéis, não só social seller — '
  'o nome é histórico). SOMA ao que é derivado de leads/meetings/sales; nunca substitui.';

comment on column public.social_metrics.mqls is
  'Leads qualificados lançados à mão (equivalente manual de leads.is_mql).';
comment on column public.social_metrics.agendamentos is
  'Reuniões agendadas sem card no kanban (equivalente manual de meetings).';
comment on column public.social_metrics.reunioes_realizadas is
  'Reuniões realizadas sem card (equivalente manual de meetings.status = realizada).';
comment on column public.social_metrics.no_shows is
  'No-shows sem card (equivalente manual de meetings.status = nao_compareceu).';

-- Números lançados à mão são contagem: negativo é sempre erro de digitação.
do $$ begin
  alter table public.social_metrics add constraint social_metrics_nao_negativo check (
    ativacoes >= 0 and conversas >= 0 and mqls >= 0 and ofertas >= 0 and follow_ups >= 0
    and agendamentos >= 0 and reunioes_realizadas >= 0 and no_shows >= 0
  );
exception when duplicate_object then null; end $$;

create index if not exists social_metrics_date_idx on public.social_metrics (date);

-- ════════════════════════════════════════════════════════════
-- 2. manual_sales — venda sem card
-- ════════════════════════════════════════════════════════════
-- Não cabe em social_metrics porque venda tem dimensões próprias (produto, canal,
-- valor) e o dashboard quebra faturamento por canal. Espelha public.sales, menos
-- o lead_id — que é justamente o que não existe aqui.
--
-- amount é o valor REALIZADO, não o de tabela: o closer negocia. products.default_price
-- é só a sugestão que o formulário preenche.

create table if not exists public.manual_sales (
  id           uuid primary key default gen_random_uuid(),
  closer_id    uuid not null references public.profiles (id) on delete cascade,
  sold_on      date not null,
  product_id   uuid references public.products (id) on delete set null,
  product_name text,                                  -- congela o nome mesmo se o produto sumir
  channel      text,                                  -- CHANNEL_TAGS do front ('Social Selling', ...)
  amount       numeric(12, 2) not null check (amount >= 0),
  nota         text,
  created_by   uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists manual_sales_closer_idx  on public.manual_sales (closer_id, sold_on);
create index if not exists manual_sales_sold_on_idx on public.manual_sales (sold_on);
create index if not exists manual_sales_channel_idx on public.manual_sales (channel);

comment on table public.manual_sales is
  'Venda fechada sem card no kanban (backfill ou operação fora do CRM). '
  'Soma a public.sales nos rankings, no funil e no faturamento por canal.';

drop trigger if exists manual_sales_set_updated_at on public.manual_sales;
create trigger manual_sales_set_updated_at
  before update on public.manual_sales
  for each row execute function public.set_updated_at();

-- ── RLS: mesma regra de public.sales (admin vê tudo; closer vê e edita as suas) ──
alter table public.manual_sales enable row level security;

drop policy if exists manual_sales_select on public.manual_sales;
create policy manual_sales_select on public.manual_sales
  for select to authenticated
  using (public.get_my_role() = 'admin' or closer_id = auth.uid());

drop policy if exists manual_sales_insert on public.manual_sales;
create policy manual_sales_insert on public.manual_sales
  for insert to authenticated
  with check (public.get_my_role() = 'admin' or closer_id = auth.uid());

drop policy if exists manual_sales_update on public.manual_sales;
create policy manual_sales_update on public.manual_sales
  for update to authenticated
  using (public.get_my_role() = 'admin' or closer_id = auth.uid())
  with check (public.get_my_role() = 'admin' or closer_id = auth.uid());

drop policy if exists manual_sales_delete on public.manual_sales;
create policy manual_sales_delete on public.manual_sales
  for delete to authenticated
  using (public.get_my_role() = 'admin' or closer_id = auth.uid());

-- ════════════════════════════════════════════════════════════
-- 3. Realtime
-- ════════════════════════════════════════════════════════════
-- Sem isto os dashboards só atualizam no refetch manual — social_metrics já é
-- assinada pelos hooks, manual_sales precisa entrar na publicação também.
do $$ begin
  alter publication supabase_realtime add table public.manual_sales;
exception when duplicate_object then null; end $$;
