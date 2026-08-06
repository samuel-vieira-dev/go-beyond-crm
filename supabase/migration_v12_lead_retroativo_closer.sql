-- Go Beyond Ops — migração v12: lead retroativo lançado pelo closer
--
-- PROBLEMA QUE RESOLVE
-- Reunião que aconteceu (ou que foi marcada) sem passar pelo kanban ficava só como
-- número agregado no relatório diário (social_metrics): sem nome, sem produto, sem
-- card. O closer não tinha como registrar "fulano, reunião dia 04/08, vendeu 9.500".
--
-- Este lançamento cria REGISTRO DE VERDADE (lead + meeting + sale, quando houver),
-- com as datas do dia em que o fato aconteceu. Duas consequências:
--   1. o closer precisa poder INSERIR lead — hoje a policy só deixa admin/pré-venda;
--   2. lead lançado pelo closer nem sempre tem WhatsApp (ele tem o nome e o resultado,
--      o contato ficou no direct/no telefone), e a coluna era not null.
--
-- ATENÇÃO À CONTAGEM DUPLA: o que entra por aqui vira card e já soma no funil.
-- O mesmo fato NÃO pode ser lançado também na grade "Seu relatório do dia" — lá é
-- só para o que não tem nome/card.
--
-- Idempotente: pode rodar de novo.

begin;

-- ════════════════════════════════════════════════════════════
-- 1. WhatsApp deixa de ser obrigatório
-- ════════════════════════════════════════════════════════════
-- O formulário de pré-venda continua exigindo (validação no cliente); a coluna é que
-- deixa de barrar o lançamento retroativo, onde só o nome é garantido.
alter table public.leads alter column whatsapp drop not null;

comment on column public.leads.whatsapp is
  'Opcional: lead retroativo lançado pelo closer costuma ter só o nome.';

-- ════════════════════════════════════════════════════════════
-- 2. Closer passa a poder criar lead — mas só já sob a responsabilidade dele
-- ════════════════════════════════════════════════════════════
-- O with check amarra closer_id = auth.uid(): closer não cria lead solto no pool da
-- pré-venda nem no nome de outro closer.
drop policy if exists leads_insert on public.leads;
create policy leads_insert on public.leads
  for insert to authenticated
  with check (
    public.get_my_role() in ('admin', 'sdr', 'social_seller')
    or (public.get_my_role() = 'closer' and closer_id = auth.uid())
  );

commit;

-- ════════════════════════════════════════════════════════════
-- 3. Conferência
-- ════════════════════════════════════════════════════════════
select column_name, is_nullable
  from information_schema.columns
 where table_schema = 'public' and table_name = 'leads' and column_name = 'whatsapp';

select polname, pg_get_expr(polwithcheck, polrelid) as with_check
  from pg_policy
 where polrelid = 'public.leads'::regclass and polname = 'leads_insert';
