import { createContext, useContext, useEffect, useState } from 'react'
import { api, getToken, setToken } from './api'

export type AuthUser = { id: string; email: string; fullName: string | null; role: string }
type Tenant = { id: string; slug: string; name: string }
type SessionRes = { user: AuthUser; tenant: Tenant | null }

type AuthCtx = {
  user: AuthUser | null
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

const ROLE_MSG = 'Esta aplicación es exclusiva para técnicos de campo. Usá el editor principal para tu tipo de cuenta.'

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser]             = useState<AuthUser | null>(null)
  const [loading, setLoading]       = useState(true)
  const [currentTenantId, setTenantId] = useState<string | null>(null)
  const [loadTenantError, setLoadTenantError] = useState<string | null>(null)
  const [roleError, setRoleError]   = useState<string | null>(null)

  function applySession(s: SessionRes): boolean {
    if (s.user.role !== 'tecnico') {
      setToken(null)
      setUser(null)
      setRoleError(ROLE_MSG)
      return false
    }
    setRoleError(null)
    setUser(s.user)
    setTenantId(s.tenant?.id ?? null)
    return true
  }

  useEffect(() => {
    if (!getToken()) { setLoading(false); return }
    api<SessionRes>('/api/auth/session')
      .then(applySession)
      .catch(err => {
        // 401 ya limpia el token; sin red se deja al usuario sin sesión activa
        if (err?.status !== 401) setLoadTenantError(err instanceof Error ? err.message : 'Error al verificar acceso')
      })
      .finally(() => setLoading(false))

    const expired = () => { setUser(null); setTenantId(null) }
    window.addEventListener('auth-expired', expired)
    return () => window.removeEventListener('auth-expired', expired)
  }, [])

  async function login(email: string, password: string) {
    const res = await api<{ token: string; user: AuthUser; tenant: Tenant | null }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    })
    setToken(res.token)
    applySession(res)
  }

  async function logout() {
    setToken(null)
    setUser(null)
    setTenantId(null)
    setRoleError(null)
  }

  return (
    <Ctx.Provider value={{ user, loading, currentTenantId, loadTenantError, roleError, login, logout }}>
      {children}
    </Ctx.Provider>
  )
}
