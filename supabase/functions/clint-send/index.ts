// Edge Function: clint-send
// Chamada pelo painel (botão "Clint" da tela Leads Upsell AF) para empurrar um lead
// para o webhook de integração da Clint. Proxy simples: recebe nome/telefone/e-mail
// do front, repassa para a URL da Clint. A URL fica só aqui — não no bundle do client.
//
// Sem validação de payload por pedido explícito (quem valida do lado da Clint é a Clint).

import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const CLINT_WEBHOOK_URL = 'https://functions-api.clint.digital/endpoints/integration/webhook/001f7a55-d8e1-44b5-a33f-51d6b6aac2f5'

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405)

  // Só usuário autenticado do painel aciona isso — quem chama é o botão da tela.
  const authHeader = req.headers.get('authorization')
  if (!authHeader) return json({ error: 'Não autenticado.' }, 401)
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: userData, error: userErr } = await supabase.auth.getUser()
  if (userErr || !userData?.user) return json({ error: 'Sessão inválida.' }, 401)

  try {
    // deno-lint-ignore no-explicit-any
    const p = (await req.json()) as Record<string, any>
    const payload = { nome: p?.nome ?? null, telefone: p?.telefone ?? null, email: p?.email ?? null }

    console.log('[clint-send] enviando:', payload.nome, payload.telefone)

    const resp = await fetch(CLINT_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const bodyText = await resp.text()

    if (!resp.ok) {
      console.error('[clint-send] Clint retornou erro:', resp.status, bodyText.slice(0, 500))
      return json({ error: `Clint respondeu ${resp.status}`, detail: bodyText.slice(0, 500) }, 502)
    }

    console.log('[clint-send] OK:', resp.status)
    return json({ ok: true, clint_status: resp.status }, 200)
  } catch (err) {
    console.error('[clint-send] exceção:', err instanceof Error ? err.message : String(err))
    return json({ error: err instanceof Error ? err.message : 'Erro inesperado.' }, 500)
  }
})
