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

    const { data: profile } = await caller
      .from('user_profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    const callerRole = profile?.role
    if (callerRole !== 'superadmin' && callerRole !== 'admin') {
      return new Response(JSON.stringify({ error: 'Prohibido: se requiere rol admin o superadmin' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...CORS },
      })
    }

    const { user_id } = await req.json()
    if (!user_id) throw new Error('user_id es requerido')

    // Admins solo pueden eliminar usuarios que estén bajo su gestión
    if (callerRole === 'admin') {
      const { data: targetProfile } = await caller
        .from('user_profiles')
        .select('admin_id, role')
        .eq('id', user_id)
        .single()
      if (targetProfile?.admin_id !== user.id || targetProfile?.role !== 'user') {
        return new Response(JSON.stringify({ error: 'Prohibido: ese usuario no está bajo tu gestión' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', ...CORS },
        })
      }
    }

    const svc = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Borrar datos de tablas primero
    await svc.from('user_tenants').delete().eq('user_id', user_id)
    await svc.from('user_profiles').delete().eq('id', user_id)

    // Borrar de Auth (esto libera el email para futuras creaciones)
    const { error: deleteErr } = await svc.auth.admin.deleteUser(user_id)
    if (deleteErr) throw deleteErr

    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json', ...CORS },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'Error desconocido' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...CORS },
    })
  }
})
