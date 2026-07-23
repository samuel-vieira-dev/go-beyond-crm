// Edge Function: lead-intake
// Webhook público para receber leads do quiz (mesmo payload "form_response" que hoje
// vai pro relay AWSales — ver quiz-link-bio/RASTREAMENTO.md). Protegido por um
// header secreto (LEAD_INTAKE_SECRET) em vez de sessão de usuário.
// Usa a service role key, então grava direto sem passar pelas policies de RLS.

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

interface FormAnswer {
  question_id: string
  question: string
  answer: string
}

interface QuizPayload {
  event?: string
  timestamp?: string
  form?: { id?: string; name?: string }
  lead?: { phone?: string; email?: string }
  form_answers?: FormAnswer[]
  metadata?: Record<string, unknown>
}

function onlyDigits(value: string) {
  return value.replace(/\D/g, '')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405)

  const expectedSecret = Deno.env.get('LEAD_INTAKE_SECRET')
  const providedSecret = req.headers.get('x-webhook-secret')
  if (!expectedSecret || providedSecret !== expectedSecret) {
    return json({ error: 'Não autorizado.' }, 401)
  }

  try {
    const payload = (await req.json()) as QuizPayload

    const phoneDigits = onlyDigits(payload.lead?.phone ?? '')
    if (!phoneDigits) return json({ error: 'lead.phone é obrigatório.' }, 400)

    const answers = payload.form_answers ?? []
    const quizAnswers: Record<string, string> = {}
    for (const a of answers) quizAnswers[a.question_id] = a.answer

    const rota = answers.find((a) => a.question_id === 'rota')?.answer ?? ''
    const isMql = rota.toUpperCase().includes('MQL') && !rota.toLowerCase().includes('nao')

    const rawEmail = payload.lead?.email ?? null
    const email = rawEmail && rawEmail.includes('@naoinformado') ? null : rawEmail

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, serviceRoleKey)

    const { data: lead, error } = await supabase
      .from('leads')
      .insert({
        name: `Lead via Quiz (${phoneDigits.slice(-4)})`,
        whatsapp: phoneDigits,
        email,
        origin: 'quiz',
        is_mql: isMql,
        stage: 'novo_lead',
        quiz_answers: quizAnswers,
        utm: payload.metadata ?? null,
      })
      .select()
      .single()

    if (error) return json({ error: error.message }, 400)

    await supabase.from('lead_events').insert({
      lead_id: lead.id,
      type: 'created',
      to_stage: 'novo_lead',
      payload: { source: 'lead-intake-webhook', form: payload.form ?? null },
    })

    return json({ ok: true, lead_id: lead.id }, 200)
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Erro inesperado.' }, 500)
  }
})
