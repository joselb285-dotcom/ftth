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

    const caller = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )
    const { data: { user }, error: authErr } = await caller.auth.getUser()
    if (authErr || !user) throw new Error('Token inválido')

    const { data: callerProfile } = await caller
      .from('user_profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    const callerRole = callerProfile?.role
    if (callerRole !== 'superadmin' && callerRole !== 'admin') {
      return new Response(JSON.stringify({ error: 'Prohibido: se requiere rol admin o superadmin' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json', ...CORS },
      })
    }

    const { email, password, full_name, role: requestedRole, admin_id: requestedAdminId } = await req.json()

    if (!email || !password || password.length < 6) {
      throw new Error('email y password (mín. 6 caracteres) son requeridos')
    }

    // Admins solo pueden crear usuarios con rol 'user' bajo sí mismos
    const newRole: string = callerRole === 'admin' ? 'user' : (requestedRole ?? 'user')
    const newAdminId: string | null = callerRole === 'admin' ? user.id : (requestedAdminId ?? null)

    if (callerRole === 'admin' && requestedRole && requestedRole !== 'user') {
      return new Response(JSON.stringify({ error: 'Los admins solo pueden crear usuarios con rol user' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json', ...CORS },
      })
    }

    const svc = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { data: created, error: createErr } = await svc.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: full_name ?? null },
    })
    if (createErr) throw createErr

    const uid = created.user.id

    // Upsert profile (el trigger puede haberlo creado ya)
    await svc.from('user_profiles').upsert({
      id: uid,
      email,
      full_name: full_name ?? null,
      role: newRole,
      admin_id: newAdminId,
    }, { onConflict: 'id' })

    return new Response(JSON.stringify({ ok: true, user_id: uid }), {
      headers: { 'Content-Type': 'application/json', ...CORS },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'Error' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...CORS },
    })
  }
})
