-- Go Beyond Ops — DADOS DE DEMONSTRAÇÃO
-- Gera leads em todas as etapas + reuniões (futuras, realizadas, no-show) + vendas,
-- para popular kanban, calendário, funil, conversões e rankings.
-- Rodar no SQL Editor DEPOIS de: schema.sql, seed.sql (produtos) e seed_test_users.sql (usuários).
--
-- Todos os registros criados aqui levam utm = {"demo": true} para facilitar a limpeza.
--
-- ┌── PARA LIMPAR OS DADOS DE DEMONSTRAÇÃO DEPOIS (descomente e rode) ──┐
-- delete from public.sales where lead_id in (select id from public.leads where utm->>'demo' = 'true');
-- delete from public.leads where utm->>'demo' = 'true';  -- reuniões e eventos somem por cascade
-- └────────────────────────────────────────────────────────────────────┘

do $$
declare
  v_sdr uuid;
  v_social uuid;
  v_closer uuid;
  v_prod uuid[];
  v_lead uuid;
  v_meeting uuid;
  v_owner uuid;
  i int;
  v_hours int[] := array[9, 11, 14, 16];

  -- Etapas iniciais (sem reunião)
  early_names text[] := array[
    'Fernanda Alves','Ricardo Gomes','Juliana Martins','Bruno Carvalho','Patrícia Rocha',
    'Thiago Mendes','Camila Barros','Leonardo Pires','Aline Souza','Rafael Nunes',
    'Vanessa Dias','Gustavo Freitas'
  ];
  early_stages text[] := array[
    'novo_lead','novo_lead','em_atendimento','em_atendimento','em_qualificacao',
    'em_qualificacao','oferta_reuniao','follow_up_prevenda','novo_lead','em_qualificacao',
    'follow_up_prevenda','em_atendimento'
  ];
  early_prof text[] := array[
    'Advogada','Empresário','Médica','Engenheiro','Arquiteta',
    'Consultor','Dentista','Publicitário','Nutricionista','Contador',
    'Psicóloga','Corretor'
  ];
  early_income text[] := array[
    'acima10','8a10','acima10','5a8','8a10',
    '5a8','acima10','5a8','8a10','acima10',
    '5a8','8a10'
  ];

  sched_names text[] := array[
    'Mariana Teixeira','Felipe Andrade','Larissa Cunha','Diego Moreira','Beatriz Lopes','Rodrigo Santos'
  ];
  sched_prof text[] := array['Empresária','Investidor','Médica','Empresário','Advogada','Engenheiro'];

  held_names text[] := array['Renata Correia','André Ramos','Sofia Cardoso','Marcelo Vieira','Isabela Fonseca'];
  held_prof text[] := array['Empresária','Consultor','Médica','Empresário','Dentista'];

  noshow_names text[] := array['Paulo Henrique','Débora Castro','Vinícius Araújo'];
  noshow_prof text[] := array['Comerciante','Professora','Autônomo'];

  followup_names text[] := array['Cristiane Melo','Eduardo Tavares','Natália Pinto','Gabriel Reis'];
  followup_prof text[] := array['Empresária','Investidor','Arquiteta','Consultor'];

  sold_names text[] := array[
    'Luciana Ferreira','Marcos Antônio','Carolina Duarte','Henrique Batista',
    'Priscila Ramos','Alexandre Costa','Tatiane Lima','Fábio Cardoso'
  ];
  sold_prof text[] := array['Empresária','Médico','Advogada','Empresário','Dentista','Investidor','Arquiteta','Consultor'];
  sold_amount numeric[] := array[4997, 8997, 2497, 4997, 8997, 4997, 2497, 8997];
begin
  select id into v_sdr from public.profiles where role = 'sdr' order by created_at limit 1;
  select id into v_social from public.profiles where role = 'social_seller' order by created_at limit 1;
  select id into v_closer from public.profiles where role = 'closer' order by created_at limit 1;

  if v_sdr is null or v_social is null or v_closer is null then
    raise exception 'Faltam usuários. Rode seed_test_users.sql antes (SDR, Social Seller e Closer).';
  end if;

  select array_agg(id order by default_price) into v_prod from public.products where active;
  if v_prod is null then
    raise exception 'Nenhum produto ativo. Rode seed.sql antes.';
  end if;

  -- ============ Etapas iniciais (sem reunião) ============
  for i in 1..array_length(early_names, 1) loop
    v_owner := case when i % 2 = 0 then v_social else v_sdr end;
    insert into public.leads (name, whatsapp, email, instagram, profession, income_range, origin, is_mql, stage, owner_id, utm)
    values (
      early_names[i],
      '119' || lpad((100 + i)::text, 8, '0'),
      lower(replace(early_names[i], ' ', '.')) || '@example.com',
      case when v_owner = v_social then '@' || lower(replace(early_names[i], ' ', '')) else null end,
      early_prof[i],
      early_income[i],
      (case when v_owner = v_social then 'instagram' else 'quiz' end)::public.lead_origin,
      early_income[i] in ('8a10', 'acima10'),
      early_stages[i]::public.lead_stage,
      v_owner,
      '{"demo": true}'::jsonb
    )
    returning id into v_lead;

    insert into public.lead_events (lead_id, actor_id, type, to_stage)
    values (v_lead, v_owner, 'created', early_stages[i]::public.lead_stage);
  end loop;

  -- ============ Reunião agendada (futuras, esta/próxima semana) ============
  for i in 1..array_length(sched_names, 1) loop
    v_owner := case when i % 2 = 0 then v_social else v_sdr end;
    insert into public.leads (name, whatsapp, email, profession, income_range, origin, is_mql, stage, owner_id, closer_id, utm)
    values (
      sched_names[i],
      '119' || lpad((200 + i)::text, 8, '0'),
      lower(replace(sched_names[i], ' ', '.')) || '@example.com',
      sched_prof[i], 'acima10',
      (case when v_owner = v_social then 'instagram' else 'quiz' end)::public.lead_origin,
      true, 'reuniao_agendada', v_owner, v_closer, '{"demo": true}'::jsonb
    )
    returning id into v_lead;

    insert into public.meetings (lead_id, closer_id, booked_by, scheduled_at, status)
    values (
      v_lead, v_closer, v_owner,
      ((current_date + (1 + (i - 1) / 4)) + make_time(v_hours[1 + ((i - 1) % 4)], 0, 0)) at time zone 'America/Sao_Paulo',
      'agendada'
    )
    returning id into v_meeting;

    insert into public.lead_events (lead_id, actor_id, type, to_stage, payload)
    values (v_lead, v_owner, 'meeting_booked', 'reuniao_agendada', jsonb_build_object('meeting_id', v_meeting));
  end loop;

  -- ============ Reunião realizada (sem venda ainda) ============
  for i in 1..array_length(held_names, 1) loop
    v_owner := case when i % 2 = 0 then v_social else v_sdr end;
    insert into public.leads (name, whatsapp, email, profession, income_range, origin, is_mql, stage, owner_id, closer_id, utm)
    values (
      held_names[i], '119' || lpad((300 + i)::text, 8, '0'),
      lower(replace(held_names[i], ' ', '.')) || '@example.com',
      held_prof[i], 'acima10',
      (case when v_owner = v_social then 'instagram' else 'quiz' end)::public.lead_origin,
      true, 'reuniao_realizada', v_owner, v_closer, '{"demo": true}'::jsonb
    )
    returning id into v_lead;

    insert into public.meetings (lead_id, closer_id, booked_by, scheduled_at, status)
    values (v_lead, v_closer, v_owner, now() - make_interval(days => i), 'realizada');
  end loop;

  -- ============ Reunião não realizada (no-show) ============
  for i in 1..array_length(noshow_names, 1) loop
    v_owner := case when i % 2 = 0 then v_social else v_sdr end;
    insert into public.leads (name, whatsapp, email, profession, income_range, origin, is_mql, stage, owner_id, closer_id, utm)
    values (
      noshow_names[i], '119' || lpad((400 + i)::text, 8, '0'),
      lower(replace(noshow_names[i], ' ', '.')) || '@example.com',
      noshow_prof[i], '5a8',
      (case when v_owner = v_social then 'instagram' else 'quiz' end)::public.lead_origin,
      true, 'reuniao_nao_realizada', v_owner, v_closer, '{"demo": true}'::jsonb
    )
    returning id into v_lead;

    insert into public.meetings (lead_id, closer_id, booked_by, scheduled_at, status)
    values (v_lead, v_closer, v_owner, now() - make_interval(days => i + 1), 'nao_compareceu');
  end loop;

  -- ============ Follow-up de fechamento (reunião realizada, decidindo) ============
  for i in 1..array_length(followup_names, 1) loop
    v_owner := case when i % 2 = 0 then v_social else v_sdr end;
    insert into public.leads (name, whatsapp, email, profession, income_range, origin, is_mql, stage, owner_id, closer_id, utm)
    values (
      followup_names[i], '119' || lpad((500 + i)::text, 8, '0'),
      lower(replace(followup_names[i], ' ', '.')) || '@example.com',
      followup_prof[i], 'acima10',
      (case when v_owner = v_social then 'instagram' else 'quiz' end)::public.lead_origin,
      true, 'follow_up_fechamento', v_owner, v_closer, '{"demo": true}'::jsonb
    )
    returning id into v_lead;

    insert into public.meetings (lead_id, closer_id, booked_by, scheduled_at, status)
    values (v_lead, v_closer, v_owner, now() - make_interval(days => i + 2), 'realizada');
  end loop;

  -- ============ Venda fechada (reunião realizada + venda) ============
  for i in 1..array_length(sold_names, 1) loop
    v_owner := case when i % 2 = 0 then v_social else v_sdr end;
    insert into public.leads (name, whatsapp, email, profession, income_range, origin, is_mql, stage, owner_id, closer_id, utm)
    values (
      sold_names[i], '119' || lpad((600 + i)::text, 8, '0'),
      lower(replace(sold_names[i], ' ', '.')) || '@example.com',
      sold_prof[i], 'acima10',
      (case when v_owner = v_social then 'instagram' else 'quiz' end)::public.lead_origin,
      true, 'venda_fechada', v_owner, v_closer, '{"demo": true}'::jsonb
    )
    returning id into v_lead;

    insert into public.meetings (lead_id, closer_id, booked_by, scheduled_at, status)
    values (v_lead, v_closer, v_owner, now() - make_interval(days => i * 3), 'realizada')
    returning id into v_meeting;

    insert into public.sales (lead_id, meeting_id, closer_id, product_id, amount, sold_at)
    values (
      v_lead, v_meeting, v_closer,
      v_prod[1 + (i % array_length(v_prod, 1))],
      sold_amount[i],
      now() - make_interval(days => (i * 3) - 1)
    );

    insert into public.lead_events (lead_id, actor_id, type, to_stage)
    values (v_lead, v_closer, 'sale', 'venda_fechada');
  end loop;

  raise notice 'Demo criada: 12 iniciais, 6 agendadas, 5 realizadas, 3 no-show, 4 follow-up, 8 vendas.';
end $$;

-- Conferir o resultado por etapa:
select stage, count(*) from public.leads where utm->>'demo' = 'true' group by stage order by 1;
