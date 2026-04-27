import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('Sin autorización')

    // Verificar que el caller es superadmin
    const caller = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )
    const { data: { user }, error: authErr } = await caller.auth.getUser()
    if (authErr || !user) throw new Error('Token inválido')

    const { data: profile } = await caller
      .from('user_profiles')
      .select('is_superadmin')
      .eq('id', user.id)
      .single()

    if (!profile?.is_superadmin) {
      return new Response(JSON.stringify({ error: 'Prohibido: no eres superadmin' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json', ...CORS },
      })
    }

    const { user_id, new_password } = await req.json()
    if (!user_id || !new_password || new_password.length < 6) {
      throw new Error('user_id y new_password (mín. 6 chars) son requeridos')
    }

    // Cambiar contraseña con service_role
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )
    const { error } = await admin.auth.admin.updateUserById(user_id, { password: new_password })
    if (error) throw error

    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json', ...CORS },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'Error' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...CORS },
    })
  }
})
