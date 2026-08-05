// Edge Function: yay-intake
// Recebe as respostas dos formulários da Yay! Forms e cria leads na coluna
// "Novo Lead" do SDR, distribuídos por round-robin.
//
// Autenticação (aceita qualquer uma das duas):
//   1) Cabeçalho personalizado  x-webhook-secret: <YAY_INTAKE_SECRET>
//   2) Assinatura HMAC SHA256 do corpo, com o mesmo segredo (headers x-signature /
//      x-yay-signature / x-hub-signature-256)
//
// Tag do formulário (para separar Alunos / Tráfego / Orgânico), em ordem:
//   1) cabeçalho x-form-tag
//   2) hiddenFields (tag / form_tag / origem)
//   3) mapa formId -> tag na env YAY_FORM_TAGS (JSON)

import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, x-webhook-secret, x-form-tag, x-signature, x-yay-signature, x-hub-signature-256',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

/** Assinatura HMAC SHA256 do corpo, em hex e em base64. */
async function hmacBoth(raw: string, secret: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const buf = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(raw)))
  const hex = Array.from(buf)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  const b64 = btoa(String.fromCharCode(...buf))
  return { hex, b64 }
}

/** Remove HTML e espaços — os títulos vêm com tags às vezes. */
function clean(v: unknown): string {
  return String(v ?? '')
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalize(v: string) {
  return v
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

/** Telefone BR: só dígitos, sem o 55 do país. */
function phoneBr(v: string) {
  let d = String(v ?? '').replace(/\D/g, '')
  if (d.length >= 12 && d.startsWith('55')) d = d.slice(2)
  return d
}

/**
 * Qualificado = renda a partir de R$ 5.000 (opções E, F, G).
 * Pega o primeiro valor monetário da resposta: "Entre R$5.000 a R$8.000" -> 5000.
 */
function isQualified(renda: string): boolean {
  const m = normalize(renda).match(/(\d{1,3}(?:\.\d{3})+|\d{4,})/)
  if (!m) return false // "Até um salário mínimo"
  const value = Number(m[1].replace(/\./g, ''))
  return Number.isFinite(value) && value >= 5000
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405)

  const raw = await req.text()
  const secret = Deno.env.get('YAY_INTAKE_SECRET')

  if (secret) {
    const { hex, b64 } = await hmacBoth(raw, secret)
    let ok = false
    const received: string[] = []

    // O Yay! Forms não documenta o nome do cabeçalho da assinatura, então
    // aceitamos QUALQUER cabeçalho cujo valor seja o segredo em texto puro ou
    // o HMAC SHA256 do corpo (hex ou base64, com ou sem prefixo "sha256=").
    for (const [name, value] of req.headers) {
      if (['authorization', 'cookie', 'apikey'].includes(name)) continue
      received.push(name)
      const v = value.trim()
      const bare = v.replace(/^(sha256|hmac-sha256)[=\s]/i, '').trim()
      if (v === secret || bare === secret || bare.toLowerCase() === hex || bare === b64) {
        ok = true
        break
      }
    }

    if (!ok) {
      console.warn(
        `[yay-intake] 401 — nenhuma assinatura válida. Cabeçalhos recebidos: ${received.join(', ')}`,
      )
      return json({ error: 'Não autorizado.' }, 401)
    }
  }

  try {
    // deno-lint-ignore no-explicit-any
    const body = JSON.parse(raw) as any
    const r = body?.response ?? body
    console.log('[yay-intake] resposta', r?.id, 'form', r?.formId)

    // ── Lê as respostas casando pelo TÍTULO da pergunta (os IDs mudam por formulário) ──
    const fields: { title: string; content: string }[] = []
    for (const a of Object.values(r?.answers ?? {})) {
      // deno-lint-ignore no-explicit-any
      const ans = a as any
      const title = clean(ans?.fieldTitle)
      const content = clean(ans?.content)
      if (title) fields.push({ title, content })
    }
    const find = (...keys: string[]) => {
      const f = fields.find((x) => keys.some((k) => normalize(x.title).includes(k)))
      return f?.content ?? ''
    }

    const name = find('seu nome', 'nome')
    const instagram = find('instagram', '@ no insta')
    const email = find('e-mail', 'email')
    const phone = phoneBr(find('numero de contato', 'contato', 'telefone', 'whatsapp', 'celular'))
    const renda = find('renda')

    if (!phone && !email) {
      console.warn('[yay-intake] sem telefone e sem email — ignorado')
      return json({ error: 'Resposta sem telefone nem email.' }, 400)
    }

    // ── Tag do formulário ──
    let formTag =
      req.headers.get('x-form-tag') ??
      r?.hiddenFields?.tag ??
      r?.hiddenFields?.form_tag ??
      r?.hiddenFields?.origem ??
      null
    if (!formTag && r?.formId) {
      try {
        const map = JSON.parse(Deno.env.get('YAY_FORM_TAGS') ?? '{}')
        formTag = map[r.formId] ?? null
      } catch { /* mapa não configurado */ }
    }
    formTag = formTag ? clean(formTag) : null
    // Cabeçalho HTTP não carrega acento com segurança — o webhook manda um slug
    // simples (alunos / trafego / organico) e aqui vira a tag final exibida no card.
    if (formTag) {
      const key = normalize(formTag).replace(/[^a-z]/g, '')
      const TAGS: Record<string, string> = {
        alunos: 'Formulário - Alunos',
        formularioalunos: 'Formulário - Alunos',
        trafego: 'Tráfego',
        organico: 'Organico',
      }
      formTag = TAGS[key] ?? formTag
    }

    // Notas: todas as perguntas respondidas, em texto.
    const notes =
      fields
        .filter((f) => f.content)
        .map((f) => `${f.title}: ${f.content}`)
        .join('\n') || null

    const t = r?.tracking ?? {}
    const utm: Record<string, unknown> = {}
    for (const k of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']) {
      if (t[k]) utm[k] = t[k]
    }
    if (formTag) utm.formulario = formTag
    if (r?.formId) utm.yay_form_id = r.formId

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    // Não duplica se a Yay reenviar a mesma resposta.
    if (r?.id) {
      const { data: existing } = await supabase
        .from('leads')
        .select('id')
        .eq('yay_response_id', String(r.id))
        .maybeSingle()
      if (existing) {
        console.log('[yay-intake] resposta já importada:', r.id)
        return json({ ok: true, duplicated: true, lead_id: existing.id })
      }
    }

    // Já existe um card ABERTO desse contato (mesmo telefone ou e-mail)? Não duplica —
    // cobre o caso da própria Yay reenviando com um novo yay_response_id (resposta
    // reenviada/reeditada) e o caso de outra fonte já ter criado o card antes.
    const { data: existingLeadId } = await supabase.rpc('find_open_lead', {
      p_phone: phone,
      p_email: email,
    })
    if (existingLeadId) {
      await supabase.from('lead_events').insert({
        lead_id: existingLeadId,
        type: 'note',
        payload: { source: 'yay-forms', form_id: r?.formId ?? null, note: 'Tentativa de novo lead — já existia card aberto para este contato.' },
      })
      console.log(`[yay-intake] duplicado — reaproveitando lead ${existingLeadId}`)
      return json({ ok: true, lead_id: existingLeadId, duplicated: true })
    }

    const { data: ownerId } = await supabase.rpc('next_sdr_owner')

    const { data: lead, error } = await supabase
      .from('leads')
      .insert({
        name: name || phone || email || 'Lead formulário',
        whatsapp: phone || null,
        email: email || null,
        instagram: instagram ? (instagram.startsWith('@') ? instagram : `@${instagram}`) : null,
        income_range: renda || null,
        origin: 'quiz',
        form_tag: formTag,
        is_mql: isQualified(renda),
        stage: 'novo_lead',
        notes,
        utm: Object.keys(utm).length ? utm : null,
        yay_response_id: r?.id ? String(r.id) : null,
        owner_id: ownerId ?? null,
      })
      .select()
      .single()

    if (error) {
      console.error('[yay-intake] erro ao inserir:', error.message)
      return json({ error: error.message }, 400)
    }

    await supabase.from('lead_events').insert({
      lead_id: lead.id,
      type: 'created',
      to_stage: 'novo_lead',
      payload: { source: 'yay-forms', form_tag: formTag, form_id: r?.formId ?? null },
    })

    console.log(`[yay-intake] OK lead ${lead.id} (${formTag ?? 'sem tag'}, qualificado=${isQualified(renda)})`)
    return json({ ok: true, lead_id: lead.id, qualificado: isQualified(renda), tag: formTag })
  } catch (err) {
    console.error('[yay-intake] exceção:', err instanceof Error ? err.message : String(err))
    return json({ error: err instanceof Error ? err.message : 'Erro inesperado.' }, 500)
  }
})
