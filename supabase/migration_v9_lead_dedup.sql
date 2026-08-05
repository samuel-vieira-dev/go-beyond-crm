-- Go Beyond Ops — migração v9: dedup de leads no intake
--
-- PROBLEMA
-- lead-intake, yay-intake e quiz-intake inserem sem checar se o contato já tem
-- um card aberto. Isso gerou 27 pares duplicados: a mesma resposta da Yay Forms
-- chegava por dois caminhos (yay-intake direto + Clint retransmitindo pro
-- lead-intake) — confirmado pelos lead_events (source: yay-forms vs
-- clint-webhook, gap médio de 4s, às vezes invertido). O webhook da Clint foi
-- desativado do lado de fora; esta migração fecha a brecha no código também,
-- pra qualquer fonte futura que caia no mesmo padrão.
--
-- REGRA
-- Existe lead ABERTO (stage fora de 'venda_fechada'/'perdido') com o mesmo
-- telefone OU e-mail? Reaproveita esse card — não cria um novo, só registra
-- a tentativa como evento. Lead FECHADO não bloqueia: reengajamento vira
-- oportunidade nova, de propósito.
--
-- Idempotente: pode rodar de novo.

create or replace function public.find_open_lead(p_phone text, p_email text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.leads
  where stage not in ('venda_fechada', 'perdido')
    and (
      (nullif(p_phone, '') is not null and whatsapp = p_phone)
      or (nullif(p_email, '') is not null and email = p_email)
    )
  order by created_at asc
  limit 1;
$$;

grant execute on function public.find_open_lead(text, text) to anon, authenticated, service_role;
