// Edge Function: lead-intake
// Webhook para criar leads automaticamente a partir de fontes externas:
//  - Clint (payload achatado: contact_name, contact_phone, contact_email, contact_utm_*, deal_*)
//  - Quiz / relay AWSales (payload aninhado: { lead: { phone, email }, form_answers: [...] })
// Protegido por um header secreto (LEAD_INTAKE_SECRET) — não usa sessão de usuário.
// Grava com a service role key (bypassa RLS). Leads entram sem dono, na fila do SDR.

import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-webhook-secret',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function onlyDigits(value: string) {
  return String(value ?? '').replace(/\D/g, '')
}

function clean(value: unknown): string | null {
  const s = typeof value === 'string' ? value.trim() : value == null ? '' : String(value)
  if (!s) return null
  if (s.includes('@naoinformado')) return null
  return s
}

// deixa só as chaves com valor (para o jsonb de utm/rastreio)
function compact(obj: Record<string, unknown>) {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(obj)) {
    if (v !== null && v !== undefined && v !== '') out[k] = v
  }
  return Object.keys(out).length ? out : null
}

Deno.serve(async (req) => {
  console.log(`[lead-intake] ${req.method} recebido`)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405)

  const expectedSecret = Deno.env.get('LEAD_INTAKE_SECRET')
  // Aceita o segredo pelo header OU pela query string (?secret= / ?token=),
  // porque a Clint não permite configurar headers customizados.
  const url = new URL(req.url)
  const providedSecret =
    req.headers.get('x-webhook-secret') ||
    url.searchParams.get('secret') ||
    url.searchParams.get('token') ||
    ''
  if (!expectedSecret) {
    console.error('[lead-intake] LEAD_INTAKE_SECRET não configurado no ambiente')
    return json({ error: 'Segredo não configurado no servidor.' }, 500)
  }
  if (providedSecret !== expectedSecret) {
    console.warn(`[lead-intake] 401 — segredo ${providedSecret ? 'incorreto' : 'ausente'} (header e query)`)
    return json({ error: 'Não autorizado.' }, 401)
  }

  let raw = ''
  try {
    raw = await req.text()
    console.log('[lead-intake] payload recebido:', raw.slice(0, 2000))
    // deno-lint-ignore no-explicit-any
    const body = (raw ? JSON.parse(raw) : {}) as Record<string, any>

    // ---- Extrai os campos aceitando os dois formatos ----
    // Clint (achatado) tem prioridade; quiz (aninhado) como fallback.
    const rawPhone = body.contact_phone ?? body.phone ?? body.lead?.phone ?? ''
    let phoneDigits = onlyDigits(rawPhone)
    if (phoneDigits.length >= 12 && phoneDigits.startsWith('55')) phoneDigits = phoneDigits.slice(2)
    if (!phoneDigits) return json({ error: 'Telefone (contact_phone) é obrigatório.' }, 400)

    // Sem nome → título do card é o número.
    const name = clean(body.contact_name ?? body.name ?? body.lead?.name) ?? phoneDigits
    const email = clean(body.contact_email ?? body.email ?? body.lead?.email)
    const instagram = clean(body.contact_instagram ?? body.instagram)

    // Fonte: é 'clint' quando vem da Clint (payload achatado), senão 'quiz'.
    const isClint = body.contact_phone !== undefined || body.deal_origin !== undefined || body.deal_stage !== undefined
    const origin = isClint ? 'clint' : 'quiz'

    // Respostas do quiz (formato antigo) viram NOTA em texto.
    const notes =
      (body.form_answers ?? [])
        .filter((a: { answer?: string }) => a?.answer)
        .map((a: { question?: string; question_id?: string; answer?: string }) => `${a.question || a.question_id}: ${a.answer}`)
        .join('\n') || null
    const rota = (body.form_answers ?? []).find((a: { question_id?: string }) => a?.question_id === 'rota')?.answer ?? ''
    const isMql = String(rota).toUpperCase().includes('MQL') && !String(rota).toLowerCase().includes('nao')

    // UTMs / rastreio consolidados no jsonb.
    const utm = compact({
      utm: body.contact_utm,
      utm_source: body.contact_utm_source ?? body.utm_source,
      utm_medium: body.contact_utm_medium ?? body.utm_medium,
      utm_campaign: body.contact_utm_campaign ?? body.utm_campaign,
      utm_term: body.contact_utm_term ?? body.utm_term,
      utm_content: body.contact_utm_content ?? body.utm_content,
      deal_origin: body.deal_origin,
      deal_stage: body.deal_stage,
      deal_user: body.deal_user,
      ...(body.metadata ?? {}),
    })

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, serviceRoleKey)

    // Distribuição automática round-robin entre os SDRs ativos.
    const { data: ownerId } = await supabase.rpc('next_sdr_owner')

    const { data: lead, error } = await supabase
      .from('leads')
      .insert({
        name,
        whatsapp: phoneDigits,
        email,
        instagram,
        origin,
        is_mql: isMql,
        stage: 'novo_lead',
        notes,
        utm,
        owner_id: ownerId ?? null, // SDR escolhido por round-robin
      })
      .select()
      .single()

    if (error) {
      console.error('[lead-intake] erro ao inserir lead:', error.message, '| dados:', JSON.stringify({ name, phoneDigits, origin }))
      return json({ error: error.message }, 400)
    }

    await supabase.from('lead_events').insert({
      lead_id: lead.id,
      type: 'created',
      to_stage: 'novo_lead',
      payload: { source: isClint ? 'clint-webhook' : 'quiz-webhook' },
    })

    console.log(`[lead-intake] OK — lead criado ${lead.id} (${origin}, ${name})`)
    return json({ ok: true, lead_id: lead.id }, 200)
  } catch (err) {
    console.error('[lead-intake] exceção:', err instanceof Error ? err.message : String(err), '| payload bruto:', raw.slice(0, 1000))
    return json({ error: err instanceof Error ? err.message : 'Erro inesperado.' }, 500)
  }
})
