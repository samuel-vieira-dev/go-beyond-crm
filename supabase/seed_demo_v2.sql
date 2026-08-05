-- Go Beyond Ops — RESET + 30 LEADS DE TESTE
-- Apaga TODOS os leads existentes e recria 30 leads coerentes, espalhados pelo funil.
-- Rodar inteiro no SQL Editor do Supabase.
--
-- Distribuição (30 leads):
--   4  novo_lead              8  Tráfego
--   3  em_atendimento         7  Organico
--   3  em_qualificacao        7  Formulário - Alunos
--   2  oferta_reuniao         8  Social Selling
--   3  follow_up_prevenda
--   5  reuniao_agendada   (reuniões futuras)
--   2  reuniao_nao_realizada (no-show)
--   2  reuniao_realizada
--   2  follow_up_fechamento
--   4  venda_fechada      (com venda registrada)
--
-- Tudo leva utm->>'demo' = 'true' para facilitar a limpeza depois.

-- ============================================================
-- 1. Limpeza — apaga TODOS os leads
-- ============================================================
delete from public.sales;          -- FK para leads sem cascade
delete from public.leads;          -- meetings, lead_events e activities somem por cascade

-- ============================================================
-- 2. Seed
-- ============================================================
do $$
declare
  v_sdrs    uuid[];
  v_socials uuid[];
  v_closers uuid[];
  v_prods   uuid[];
  v_prices  numeric[];

  v_lead    uuid;
  v_meeting uuid;
  v_owner   uuid;
  v_closer  uuid;
  v_pidx    int;
  i         int;
  n_sdr     int := 0;
  n_soc     int := 0;
  n_clo     int := 0;

  v_hours int[] := array[9, 10, 11, 14, 15, 16, 17];

  -- ── Dados dos 30 leads ────────────────────────────────────
  names text[] := array[
    /* novo_lead            */ 'Fernanda Alves','Ricardo Gomes','Juliana Martins','Bruno Carvalho',
    /* em_atendimento       */ 'Patrícia Rocha','Thiago Mendes','Camila Barros',
    /* em_qualificacao      */ 'Leonardo Pires','Aline Souza','Rafael Nunes',
    /* oferta_reuniao       */ 'Vanessa Dias','Gustavo Freitas',
    /* follow_up_prevenda   */ 'Cristiane Melo','Eduardo Tavares','Natália Pinto',
    /* reuniao_agendada     */ 'Mariana Teixeira','Felipe Andrade','Larissa Cunha','Diego Moreira','Beatriz Lopes',
    /* reuniao_nao_realizada*/ 'Paulo Henrique','Débora Castro',
    /* reuniao_realizada    */ 'Renata Correia','André Ramos',
    /* follow_up_fechamento */ 'Sofia Cardoso','Marcelo Vieira',
    /* venda_fechada        */ 'Luciana Ferreira','Marcos Antônio','Carolina Duarte','Henrique Batista'
  ];

  stages text[] := array[
    'novo_lead','novo_lead','novo_lead','novo_lead',
    'em_atendimento','em_atendimento','em_atendimento',
    'em_qualificacao','em_qualificacao','em_qualificacao',
    'oferta_reuniao','oferta_reuniao',
    'follow_up_prevenda','follow_up_prevenda','follow_up_prevenda',
    'reuniao_agendada','reuniao_agendada','reuniao_agendada','reuniao_agendada','reuniao_agendada',
    'reuniao_nao_realizada','reuniao_nao_realizada',
    'reuniao_realizada','reuniao_realizada',
    'follow_up_fechamento','follow_up_fechamento',
    'venda_fechada','venda_fechada','venda_fechada','venda_fechada'
  ];

  profs text[] := array[
    'Advogada','Empresário','Médica','Engenheiro',
    'Arquiteta','Consultor','Dentista',
    'Publicitário','Nutricionista','Contador',
    'Psicóloga','Corretor',
    'Empresária','Investidor','Arquiteta',
    'Empresária','Investidor','Médica','Empresário','Advogada',
    'Comerciante','Professora',
    'Empresária','Consultor',
    'Médica','Empresário',
    'Empresária','Médico','Advogada','Empresário'
  ];

  -- Canal de cada lead. 'Social Selling' => dono é social seller e origem instagram.
  tags text[] := array[
    'Tráfego','Social Selling','Organico','Formulário - Alunos',
    'Tráfego','Social Selling','Organico',
    'Formulário - Alunos','Tráfego','Social Selling',
    'Social Selling','Social Selling',
    'Organico','Formulário - Alunos','Tráfego',
    'Tráfego','Social Selling','Organico','Formulário - Alunos','Tráfego',
    'Organico','Social Selling',
    'Formulário - Alunos','Tráfego',
    'Organico','Formulário - Alunos',
    'Tráfego','Organico','Formulário - Alunos','Social Selling'
  ];

  -- Faixa de renda coerente com a qualificação (>= 5k = qualificado).
  incomes text[] := array[
    'ate3','5a8','3a5','acima10',
    '5a8','acima10','3a5',
    '5a8','8a10','acima10',
    '8a10','5a8',
    '5a8','acima10','8a10',
    'acima10','8a10','acima10','5a8','8a10',
    '5a8','5a8',
    'acima10','8a10',
    'acima10','8a10',
    'acima10','acima10','8a10','acima10'
  ];
begin
  -- ── Times ────────────────────────────────────────────────
  select array_agg(id order by created_at) into v_sdrs    from public.profiles where role = 'sdr'           and active;
  select array_agg(id order by created_at) into v_socials from public.profiles where role = 'social_seller' and active;
  select array_agg(id order by created_at) into v_closers from public.profiles where role = 'closer'        and active;

  -- Sem time cadastrado, cai para o admin — o seed roda de qualquer jeito.
  if v_sdrs    is null then select array_agg(id) into v_sdrs    from public.profiles where role = 'admin'; end if;
  if v_socials is null then v_socials := v_sdrs; end if;
  if v_closers is null then v_closers := v_sdrs; end if;

  if v_sdrs is null then
    raise exception 'Nenhum perfil encontrado. Crie os usuários antes de rodar o seed.';
  end if;

  select array_agg(id order by default_price), array_agg(default_price order by default_price)
    into v_prods, v_prices
    from public.products where active;

  if v_prods is null then
    raise exception 'Nenhum produto ativo. Cadastre os produtos antes de rodar o seed.';
  end if;

  -- ── Leads ────────────────────────────────────────────────
  for i in 1..array_length(names, 1) loop
    -- Dono: social seller para Social Selling, SDR para os demais (round-robin).
    if tags[i] = 'Social Selling' then
      n_soc := n_soc + 1;
      v_owner := v_socials[1 + ((n_soc - 1) % array_length(v_socials, 1))];
    else
      n_sdr := n_sdr + 1;
      v_owner := v_sdrs[1 + ((n_sdr - 1) % array_length(v_sdrs, 1))];
    end if;

    -- Closer só entra a partir do agendamento.
    if stages[i] in ('reuniao_agendada','reuniao_nao_realizada','reuniao_realizada','follow_up_fechamento','venda_fechada') then
      n_clo := n_clo + 1;
      v_closer := v_closers[1 + ((n_clo - 1) % array_length(v_closers, 1))];
    else
      v_closer := null;
    end if;

    insert into public.leads (
      name, whatsapp, email, instagram, profession, income_range,
      origin, form_tag, is_mql, stage, owner_id, closer_id, notes, utm, created_at
    )
    values (
      names[i],
      '119' || lpad((10000000 + i * 137)::text, 8, '0'),
      lower(translate(replace(names[i], ' ', '.'), 'áàâãéêíóôõúüçÁÀÂÃÉÊÍÓÔÕÚÜÇ', 'aaaaeeiooouucAAAAEEIOOOUUC')) || '@example.com',
      case when tags[i] = 'Social Selling'
           then '@' || lower(translate(replace(names[i], ' ', ''), 'áàâãéêíóôõúüçÁÀÂÃÉÊÍÓÔÕÚÜÇ', 'aaaaeeiooouucAAAAEEIOOOUUC'))
           end,
      profs[i],
      incomes[i],
      (case when tags[i] = 'Social Selling' then 'instagram' else 'quiz' end)::public.lead_origin,
      tags[i],
      incomes[i] in ('5a8', '8a10', 'acima10'),
      stages[i]::public.lead_stage,
      v_owner,
      v_closer,
      'Lead de teste — ' || profs[i] || ', renda ' || incomes[i] || '.',
      jsonb_build_object(
        'demo', true,
        'utm_source', case when tags[i] = 'Tráfego' then 'meta-ads'
                           when tags[i] = 'Social Selling' then 'instagram'
                           else 'organico' end,
        'utm_medium', case when tags[i] = 'Tráfego' then 'cpc' else 'social' end,
        'utm_campaign', 'go-beyond-2026'
      ),
      -- Leads mais avançados no funil entraram há mais tempo.
      now() - make_interval(days => 1 + (i / 2))
    )
    returning id into v_lead;

    insert into public.lead_events (lead_id, actor_id, type, to_stage, created_at)
    values (v_lead, v_owner, 'created', stages[i]::public.lead_stage, now() - make_interval(days => 1 + (i / 2)));

    -- ── Reunião agendada (futura) ──────────────────────────
    if stages[i] = 'reuniao_agendada' then
      insert into public.meetings (lead_id, closer_id, booked_by, scheduled_at, status)
      values (
        v_lead, v_closer, v_owner,
        (current_date + (1 + (n_clo % 5)) + make_time(v_hours[1 + (n_clo % 7)], 0, 0)) at time zone 'America/Sao_Paulo',
        'agendada'
      )
      returning id into v_meeting;

      insert into public.lead_events (lead_id, actor_id, type, to_stage, payload)
      values (v_lead, v_owner, 'meeting_booked', 'reuniao_agendada', jsonb_build_object('meeting_id', v_meeting));

    -- ── No-show ────────────────────────────────────────────
    elsif stages[i] = 'reuniao_nao_realizada' then
      insert into public.meetings (lead_id, closer_id, booked_by, scheduled_at, status)
      values (v_lead, v_closer, v_owner, now() - make_interval(days => 2 + n_clo), 'nao_compareceu');

    -- ── Reunião realizada / follow-up de fechamento ────────
    elsif stages[i] in ('reuniao_realizada', 'follow_up_fechamento') then
      insert into public.meetings (lead_id, closer_id, booked_by, scheduled_at, status)
      values (v_lead, v_closer, v_owner, now() - make_interval(days => 1 + n_clo), 'realizada');

    -- ── Venda fechada ──────────────────────────────────────
    elsif stages[i] = 'venda_fechada' then
      insert into public.meetings (lead_id, closer_id, booked_by, scheduled_at, status)
      values (v_lead, v_closer, v_owner, now() - make_interval(days => 3 + n_clo), 'realizada')
      returning id into v_meeting;

      v_pidx := 1 + (n_clo % array_length(v_prods, 1));

      insert into public.sales (lead_id, meeting_id, closer_id, product_id, amount, sold_at)
      values (v_lead, v_meeting, v_closer, v_prods[v_pidx], v_prices[v_pidx], now() - make_interval(days => 2 + n_clo));

      insert into public.lead_events (lead_id, actor_id, type, to_stage)
      values (v_lead, v_closer, 'sale', 'venda_fechada');
    end if;
  end loop;

  raise notice '30 leads de teste criados.';
end $$;

-- ============================================================
-- 3. Conferência
-- ============================================================
select stage, count(*) as leads from public.leads group by stage order by 2 desc;
select form_tag, count(*) as leads from public.leads group by form_tag order by 2 desc;
select p.full_name, p.role, count(l.id) as leads
  from public.profiles p
  left join public.leads l on l.owner_id = p.id
  group by 1, 2 order by 3 desc;
select count(*) as vendas, sum(amount) as receita from public.sales;
