import { createContext, useContext, useEffect, useState } from 'react'
import { api, setToken } from './api'

export type UserRole = 'superadmin' | 'admin' | 'user' | 'tecnico'

type AuthUser = { id: string; email: string; fullName: string | null }
type Tenant = { id: string; slug: string; name: string }

type SessionResponse = {
  token?: string
  user: { id: string; email: string; fullName: string | null; role: UserRole; adminId: string | null }
  tenant: Tenant | null
}

type AuthCtx = {
  user: AuthUser | null
  session: unknown
  loading: boolean
  role: UserRole
  isSuperadmin: boolean
  isAdmin: boolean
  isTecnico: boolean
  adminId: string | null
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
  const [user, setUser]           = useState<AuthUser | null>(null)
  const [loading, setLoading]     = useState(true)
  const [role, setRole]           = useState<UserRole>('user')
  const [adminId, setAdminId]     = useState<string | null>(null)
  const [tenant, setTenant]       = useState<Tenant | null>(null)

  function applySession(data: SessionResponse) {
    setUser({ id: data.user.id, email: data.user.email, fullName: data.user.fullName })
    setRole(data.user.role)
    setAdminId(data.user.adminId ?? null)
    setTenant(data.tenant)
  }

  function clear() {
    setToken(null)
    setUser(null)
    setRole('user')
    setAdminId(null)
    setTenant(null)
  }

  useEffect(() => {
    api<SessionResponse>('/api/auth/session')
      .then(applySession)
      .catch(() => clear())
      .finally(() => setLoading(false))

    function onExpired() { clear() }
    window.addEventListener('auth-expired', onExpired)
    return () => window.removeEventListener('auth-expired', onExpired)
  }, [])

  async function login(email: string, password: string) {
    const data = await api<SessionResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    })
    if (data.token) setToken(data.token)
    applySession(data)
  }

  async function logout() {
    clear()
  }

  return (
    <Ctx.Provider value={{
      user,
      session: user ? {} : null,
      loading,
      role,
      isSuperadmin: role === 'superadmin',
      isAdmin: role === 'admin',
      isTecnico: role === 'tecnico',
      adminId,
      currentTenantId: tenant?.id ?? null,
      currentTenantSlug: tenant?.slug ?? 'ftth',
      login,
      logout,
    }}>
      {children}
    </Ctx.Provider>
  )
}
