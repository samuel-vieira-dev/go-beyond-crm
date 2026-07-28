// Edge Function: admin-delete-user
// Exclui um membro da equipe (auth.users → cascade em profiles). Só admin.

import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Sessão ausente.' }, 401)

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: callerData, error: callerError } = await callerClient.auth.getUser()
    if (callerError || !callerData.user) return json({ error: 'Sessão inválida.' }, 401)

    const adminClient = createClient(supabaseUrl, serviceRoleKey)
    const { data: callerProfile } = await adminClient
      .from('profiles')
      .select('role')
      .eq('id', callerData.user.id)
      .single()
    if (callerProfile?.role !== 'admin') {
      return json({ error: 'Apenas administradores podem excluir contas.' }, 403)
    }

    const { user_id } = (await req.json().catch(() => ({}))) as { user_id?: string }
    if (!user_id) return json({ error: 'user_id é obrigatório.' }, 400)
    if (user_id === callerData.user.id) return json({ error: 'Você não pode excluir a si mesmo.' }, 400)

    const { error: delError } = await adminClient.auth.admin.deleteUser(user_id)
    if (delError) return json({ error: delError.message }, 400)

    return json({ ok: true }, 200)
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Erro inesperado.' }, 500)
  }
})
