// Edge Function: quiz-intake
// Endpoint PÚBLICO (sem segredo) para o quiz-link-bio salvar leads no Supabase.
// A página é pública, então não dá para embutir segredo no JS. Proteção = validação
// básica do payload (telefone BR válido + campos esperados do quiz). Grava com
// service role. Leads entram na fila do SDR (sem dono). Todos os segmentos (AF e GB)
// são salvos; is_mql sai da rota (GB=MQL true, AF false).

import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function onlyDigits(v: unknown) {
  return String(v ?? '').replace(/\D/g, '')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405)

  try {
    // deno-lint-ignore no-explicit-any
    const p = (await req.json()) as Record<string, any>
    console.log('[quiz-intake] payload:', JSON.stringify(p).slice(0, 1500))

    let phone = onlyDigits(p?.lead?.phone ?? p?.phone ?? p?.contact_phone)
    // Remove o código do país (55) — guardamos o número BR de 10/11 dígitos.
    if (phone.length >= 12 && phone.startsWith('55')) phone = phone.slice(2)
    if (phone.length < 10 || phone.length > 11) {
      return json({ error: 'Telefone inválido.' }, 400)
    }

    const answers: { question_id?: string; question?: string; answer?: string }[] = p?.form_answers ?? []
    const byId = (id: string) => answers.find((a) => a?.question_id === id)?.answer ?? ''
    const rota = String(byId('rota'))
    const isMql = rota.toUpperCase().includes('MQL') && !rota.toLowerCase().includes('nao')

    // Respostas do quiz viram NOTA (texto), não campos personalizados (escala melhor).
    const notes = answers
      .filter((a) => a?.answer)
      .map((a) => `${a.question || a.question_id}: ${a.answer}`)
      .join('\n') || null

    const rawEmail = p?.lead?.email ?? p?.email ?? null
    const email = rawEmail && String(rawEmail).includes('@naoinformado') ? null : rawEmail

    const utm = p?.utm && Object.keys(p.utm).length ? p.utm : null

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    // Já existe um card ABERTO desse contato (mesmo telefone ou e-mail)? Não duplica.
    const { data: existingLeadId } = await supabase.rpc('find_open_lead', {
      p_phone: phone,
      p_email: email,
    })
    if (existingLeadId) {
      await supabase.from('lead_events').insert({
        lead_id: existingLeadId,
        type: 'note',
        payload: { source: 'quiz-link-bio', note: 'Tentativa de novo lead — já existia card aberto para este contato.' },
      })
      console.log(`[quiz-intake] duplicado — reaproveitando lead ${existingLeadId}`)
      return json({ ok: true, lead_id: existingLeadId, duplicated: true }, 200)
    }

    // Distribuição automática round-robin entre os SDRs ativos.
    const { data: ownerId } = await supabase.rpc('next_sdr_owner')

    const { data: lead, error } = await supabase
      .from('leads')
      .insert({
        name: phone, // sem nome no quiz → título do card é o número
        whatsapp: phone,
        email,
        origin: 'quiz',
        is_mql: isMql,
        stage: 'novo_lead',
        notes,
        utm,
        owner_id: ownerId ?? null,
      })
      .select()
      .single()

    if (error) {
      console.error('[quiz-intake] erro insert:', error.message)
      return json({ error: error.message }, 400)
    }

    await supabase.from('lead_events').insert({
      lead_id: lead.id,
      type: 'created',
      to_stage: 'novo_lead',
      payload: { source: 'quiz-link-bio', segmento: byId('segmento') || null },
    })

    console.log(`[quiz-intake] OK lead ${lead.id} (mql=${isMql})`)
    return json({ ok: true, lead_id: lead.id }, 200)
  } catch (err) {
    console.error('[quiz-intake] exceção:', err instanceof Error ? err.message : String(err))
    return json({ error: err instanceof Error ? err.message : 'Erro inesperado.' }, 500)
  }
})
