// Edge Function: meta-webhook
// Recebe eventos do Instagram (@beyondwithjohn) e cria leads na etapa "Ativações"
// do board do Social Seller.
//
// Eventos tratados:
//  - comments  : alguém comentou num post → vira lead
//  - messaging : DM. Se for eco (is_echo), a social seller abordou alguém → vira lead.
//                Se for mensagem recebida, a pessoa respondeu → vira lead também.
//
// Segurança: valida a assinatura X-Hub-Signature-256 com META_APP_SECRET.
// Env necessárias: META_VERIFY_TOKEN, META_APP_SECRET, (opcional) META_ACCESS_TOKEN, IG_BUSINESS_ID

import { createClient } from 'npm:@supabase/supabase-js@2'

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

/** Confere a assinatura HMAC-SHA256 que a Meta envia no header. */
async function validSignature(raw: string, header: string | null, secret: string) {
  if (!header?.startsWith('sha256=')) return false
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(raw))
  const expected = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  return header.slice(7) === expected
}

/** Busca o @username a partir do IGSID (opcional — precisa de META_ACCESS_TOKEN). */
async function fetchUsername(igsid: string): Promise<string | null> {
  const token = Deno.env.get('META_ACCESS_TOKEN')
  if (!token) return null
  try {
    const r = await fetch(`https://graph.facebook.com/v21.0/${igsid}?fields=username&access_token=${token}`)
    const d = await r.json()
    return d?.username ?? null
  } catch {
    return null
  }
}

Deno.serve(async (req) => {
  const url = new URL(req.url)

  // ── 1) Verificação do webhook (a Meta chama uma vez, no cadastro) ──
  if (req.method === 'GET') {
    const mode = url.searchParams.get('hub.mode')
    const token = url.searchParams.get('hub.verify_token')
    const challenge = url.searchParams.get('hub.challenge')
    if (mode === 'subscribe' && token === Deno.env.get('META_VERIFY_TOKEN')) {
      console.log('[meta-webhook] verificação OK')
      return new Response(challenge ?? '', { status: 200 })
    }
    console.warn('[meta-webhook] verificação FALHOU (verify_token não confere)')
    return new Response('Forbidden', { status: 403 })
  }

  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405)

  const raw = await req.text()

  const appSecret = Deno.env.get('META_APP_SECRET')
  if (appSecret) {
    const ok = await validSignature(raw, req.headers.get('x-hub-signature-256'), appSecret)
    if (!ok) {
      console.warn('[meta-webhook] assinatura inválida')
      return json({ error: 'Assinatura inválida.' }, 401)
    }
  }

  try {
    // deno-lint-ignore no-explicit-any
    const body = JSON.parse(raw) as any
    console.log('[meta-webhook] evento:', raw.slice(0, 1500))

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const businessId = Deno.env.get('IG_BUSINESS_ID') ?? ''

    // Só interessa quem a conta @beyondwithjohn ABORDOU por DM (eco de mensagem enviada).
    // Comentários, curtidas e mensagens recebidas NÃO viram lead.
    const contacts = new Map<string, { username: string | null; via: string }>()

    for (const entry of body?.entry ?? []) {
      for (const m of entry?.messaging ?? []) {
        if (m?.message?.is_echo !== true) continue // ignora DMs recebidas
        const person = m?.recipient?.id // no eco, o destinatário é a pessoa abordada
        if (!person || String(person) === businessId) continue
        contacts.set(String(person), { username: null, via: 'abordagem por DM' })
      }
    }

    if (contacts.size === 0) return json({ ok: true, created: 0 })

    let created = 0
    for (const [igsid, info] of contacts) {
      // Já existe lead desse contato? Não duplica.
      const { data: existing } = await supabase
        .from('leads')
        .select('id')
        .eq('instagram_id', igsid)
        .maybeSingle()
      if (existing) continue

      const username = info.username ?? (await fetchUsername(igsid))
      const { data: ownerId } = await supabase.rpc('next_social_seller_owner')

      const { data: lead, error } = await supabase
        .from('leads')
        .insert({
          name: username ? `@${username}` : `Instagram ${igsid.slice(-6)}`,
          instagram: username ? `@${username}` : null,
          instagram_id: igsid,
          whatsapp: null, // captado depois, na conversa
          origin: 'instagram',
          is_mql: false,
          stage: 'novo_lead', // = coluna "Ativações" no board do Social Seller
          notes: `Entrou por ${info.via} no Instagram.`,
          owner_id: ownerId ?? null,
        })
        .select()
        .single()

      if (error) {
        console.error('[meta-webhook] erro ao criar lead:', error.message)
        continue
      }

      await supabase.from('lead_events').insert({
        lead_id: lead.id,
        type: 'created',
        to_stage: 'novo_lead',
        payload: { source: 'instagram', via: info.via },
      })
      created++
    }

    console.log(`[meta-webhook] ${created} lead(s) criado(s)`)
    return json({ ok: true, created })
  } catch (err) {
    console.error('[meta-webhook] exceção:', err instanceof Error ? err.message : String(err))
    // Responde 200 para a Meta não reenviar em loop; o erro fica no log.
    return json({ ok: false })
  }
})
