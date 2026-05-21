import { createContext, useContext, useEffect, useState } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase, TENANT_SLUG } from './supabase'

export type UserRole = 'superadmin' | 'admin' | 'user'

type AuthCtx = {
  user: User | null
  session: Session | null
  loading: boolean
  role: UserRole
  isSuperadmin: boolean
  isAdmin: boolean
  currentTenantId: string | null
  currentTenantSlug: string
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
  const [user, setUser]         = useState<User | null>(null)
  const [session, setSession]   = useState<Session | null>(null)
  const [loading, setLoading]   = useState(true)
  const [role, setRole]         = useState<UserRole>('user')
  const [currentTenantId, setTenantId] = useState<string | null>(null)

  async function loadProfile(uid: string) {
    const [profileRes, tenantRes] = await Promise.all([
      supabase.from('user_profiles').select('role').eq('id', uid).single(),
      supabase.from('tenants').select('id').eq('slug', TENANT_SLUG).single(),
    ])
    setRole((profileRes.data?.role as UserRole) ?? 'user')
    setTenantId(tenantRes.data?.id ?? null)
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setUser(data.session?.user ?? null)
      if (data.session?.user) {
        loadProfile(data.session.user.id).finally(() => setLoading(false))
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
        setRole('user')
        setTenantId(null)
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
  }

  const isSuperadmin = role === 'superadmin'
  const isAdmin      = role === 'admin'

  return (
    <Ctx.Provider value={{
      user, session, loading, role, isSuperadmin, isAdmin,
      currentTenantId, currentTenantSlug: TENANT_SLUG, login, logout,
    }}>
      {children}
    </Ctx.Provider>
  )
}
