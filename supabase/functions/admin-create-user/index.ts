// Edge Function: admin-create-user
// Cria uma conta de acesso (Supabase Auth) para um membro da equipe.
// Só pode ser chamada por um usuário autenticado com role='admin' em public.profiles.
// O profile é criado automaticamente pelo trigger on_auth_user_created (ver schema.sql).

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

const VALID_ROLES = ['admin', 'sdr', 'social_seller', 'closer']

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

    const { data: callerProfile, error: profileError } = await adminClient
      .from('profiles')
      .select('role')
      .eq('id', callerData.user.id)
      .single()

    if (profileError || callerProfile?.role !== 'admin') {
      return json({ error: 'Apenas administradores podem criar contas.' }, 403)
    }

    const body = await req.json().catch(() => null)
    const { full_name, email, password, role } = body ?? {}

    if (!full_name || !email || !password || !role) {
      return json({ error: 'Campos obrigatórios: full_name, email, password, role.' }, 400)
    }
    if (!VALID_ROLES.includes(role)) {
      return json({ error: `Papel inválido. Use um de: ${VALID_ROLES.join(', ')}.` }, 400)
    }
    if (String(password).length < 6) {
      return json({ error: 'Senha precisa ter ao menos 6 caracteres.' }, 400)
    }

    const { data: created, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name, role },
    })

    if (createError) return json({ error: createError.message }, 400)

    return json({ user: { id: created.user?.id, email: created.user?.email } }, 200)
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Erro inesperado.' }, 500)
  }
})
