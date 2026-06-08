import { useState } from 'react'
import { useAuth } from './AuthContext'

export default function LoginPage() {
  const { login, roleError } = useAuth()
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await login(email, password)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al iniciar sesión')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-logo">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="2"/>
            <path d="M4.93 4.93a10 10 0 000 14.14M19.07 4.93a10 10 0 010 14.14"/>
            <path d="M7.76 7.76a6 6 0 000 8.48M16.24 7.76a6 6 0 010 8.48"/>
          </svg>
        </div>
        <h1 className="login-title">FTTH Campo</h1>
        <p className="login-sub">Acceso para técnicos de campo</p>
        <form className="login-form" onSubmit={handleSubmit}>
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="tecnico@empresa.com"
              autoComplete="email"
              required
            />
          </label>
          <label>
            Contraseña
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </label>
          {(error || roleError) && <div className="login-error">{error || roleError}</div>}
          <button type="submit" className="btn-primary" disabled={loading || !email || !password}>
            {loading ? 'Ingresando...' : 'Ingresar'}
          </button>
        </form>
      </div>
    </div>
  )
}
