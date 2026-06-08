import { createContext, useContext, useEffect, useState } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase, TENANT_SLUG } from './supabase'

type AuthCtx = {
  user: User | null
  session: Session | null
  loading: boolean
  currentTenantId: string | null
  loadTenantError: string | null
  roleError: string | null
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

const Ctx = createContext<AuthCtx | null>(null)

export function useAuth() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser]             = useState<User | null>(null)
  const [session, setSession]       = useState<Session | null>(null)
  const [loading, setLoading]       = useState(true)
  const [currentTenantId, setTenantId] = useState<string | null>(null)
  const [loadTenantError, setLoadTenantError] = useState<string | null>(null)
  const [roleError, setRoleError]   = useState<string | null>(null)

  async function loadProfile(uid: string) {
    setRoleError(null)
    try {
      const [profileRes, tenantRes] = await Promise.all([
        supabase.from('user_profiles').select('role').eq('id', uid).single(),
        supabase.from('tenants').select('id').eq('slug', TENANT_SLUG).single(),
      ])

      const role = profileRes.data?.role ?? 'user'
      if (role !== 'tecnico') {
        // No es técnico — cerrar sesión y mostrar error
        await supabase.auth.signOut()
        setRoleError('Esta aplicación es exclusiva para técnicos de campo. Usá el editor principal para tu tipo de cuenta.')
        setLoading(false)
        return
      }

      if (tenantRes.error) throw tenantRes.error
      setTenantId(tenantRes.data?.id ?? null)
    } catch (err) {
      console.error('loadProfile failed:', err)
      setLoadTenantError(err instanceof Error ? err.message : 'Error al verificar acceso')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setUser(data.session?.user ?? null)
      if (data.session?.user) {
        loadProfile(data.session.user.id)
      } else {
        setLoading(false)
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess)
      setUser(sess?.user ?? null)
      if (sess?.user) {
        loadProfile(sess.user.id)
      } else {
        setTenantId(null)
        setRoleError(null)
        setLoading(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function login(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
  }

  async function logout() {
    await supabase.auth.signOut()
    setRoleError(null)
  }

  return (
    <Ctx.Provider value={{ user, session, loading, currentTenantId, loadTenantError, roleError, login, logout }}>
      {children}
    </Ctx.Provider>
  )
}
