import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { useAuth } from './AuthContext'

type UserProfile = {
  id: string
  email: string
  full_name: string | null
  is_superadmin: boolean
}

type Tenant = {
  id: string
  slug: string
  name: string
}

type UserTenant = {
  user_id: string
  tenant_id: string
  role: string
}

interface Props {
  onClose: () => void
}

export default function SuperAdminPage({ onClose }: Props) {
  const { user: currentUser } = useAuth()
  const [users, setUsers]     = useState<UserProfile[]>([])
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [userTenants, setUserTenants] = useState<UserTenant[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  // Create user form
  const [newEmail, setNewEmail]       = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newName, setNewName]         = useState('')
  const [creating, setCreating]       = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  async function loadData() {
    setLoading(true)
    const [profilesRes, tenantsRes, utRes] = await Promise.all([
      supabase.from('user_profiles').select('id, email, full_name, is_superadmin'),
      supabase.from('tenants').select('id, slug, name'),
      supabase.from('user_tenants').select('user_id, tenant_id, role'),
    ])
    if (profilesRes.error) { setError(profilesRes.error.message); setLoading(false); return }
    setUsers(profilesRes.data ?? [])
    setTenants(tenantsRes.data ?? [])
    setUserTenants(utRes.data ?? [])
    setLoading(false)
  }

  useEffect(() => { loadData() }, [])

  async function createUser() {
    if (!newEmail || !newPassword) return
    setCreating(true)
    setCreateError(null)
    try {
      const { data, error } = await supabase.auth.signUp({
        email: newEmail,
        password: newPassword,
        options: { data: { full_name: newName } }
      })
      if (error) throw error
      if (data.user) {
        await supabase.from('user_profiles')
          .update({ full_name: newName || null })
          .eq('id', data.user.id)
      }
      setNewEmail('')
      setNewPassword('')
      setNewName('')
      await loadData()
    } catch (err: unknown) {
      setCreateError(err instanceof Error ? err.message : 'Error al crear usuario')
    } finally {
      setCreating(false)
    }
  }

  async function toggleTenant(userId: string, tenantId: string, hasAccess: boolean) {
    if (hasAccess) {
      await supabase.from('user_tenants').delete()
        .eq('user_id', userId).eq('tenant_id', tenantId)
    } else {
      await supabase.from('user_tenants').insert({ user_id: userId, tenant_id: tenantId, role: 'user' })
    }
    await loadData()
  }

  async function toggleSuperadmin(userId: string, current: boolean) {
    if (userId === currentUser?.id && current) {
      if (!confirm('¿Quitarte el rol de superadmin? No podrás revertirlo desde la app.')) return
    }
    await supabase.from('user_profiles').update({ is_superadmin: !current }).eq('id', userId)
    await loadData()
  }

  async function deleteUser(userId: string, email: string) {
    if (!confirm(`¿Eliminar al usuario ${email}? Esta acción no se puede deshacer.`)) return
    await supabase.from('user_tenants').delete().eq('user_id', userId)
    await supabase.from('user_profiles').delete().eq('id', userId)
    await loadData()
  }

  return (
    <div className="client-modal-overlay" onClick={onClose}>
      <div className="client-modal" style={{ maxWidth: 720, maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
        <div className="client-modal-header">
          <div>
            <h2>Superadmin — Gestión de usuarios</h2>
            <p className="client-modal-sub">Creá usuarios y asignales acceso a proyectos</p>
          </div>
          <button className="secondary" onClick={onClose}>✕</button>
        </div>

        <div className="client-modal-body" style={{ overflowY: 'auto', flex: 1 }}>
          {/* Crear usuario */}
          <div className="client-section-title">Crear nuevo usuario</div>
          <div className="client-form-grid">
            <label>
              Nombre completo
              <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Juan García" />
            </label>
            <label>
              Email
              <input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="usuario@empresa.com" />
            </label>
            <label>
              Contraseña temporal
              <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Mínimo 6 caracteres" />
            </label>
          </div>
          {createError && <div className="login-error" style={{ marginTop: 8 }}>{createError}</div>}
          <button
            onClick={createUser}
            disabled={creating || !newEmail || !newPassword}
            style={{ marginTop: 8 }}
          >
            {creating ? 'Creando...' : '+ Crear usuario'}
          </button>

          {/* Lista de usuarios */}
          <div className="client-section-title" style={{ marginTop: 20 }}>Usuarios ({users.length})</div>
          {loading ? (
            <div style={{ color: '#94a3b8', fontSize: '0.85rem' }}>Cargando...</div>
          ) : error ? (
            <div className="login-error">{error}</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {users.map(u => {
                const myTenants = userTenants.filter(ut => ut.user_id === u.id).map(ut => ut.tenant_id)
                return (
                  <div key={u.id} style={{
                    background: '#0d1a2e', border: '1px solid #1e3a5f', borderRadius: 6,
                    padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap'
                  }}>
                    <div style={{ flex: 1, minWidth: 180 }}>
                      <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>{u.full_name || u.email}</div>
                      {u.full_name && <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{u.email}</div>}
                    </div>

                    {/* Acceso a tenants */}
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {tenants.map(t => {
                        const has = myTenants.includes(t.id)
                        return (
                          <button
                            key={t.id}
                            className={has ? '' : 'secondary'}
                            style={{ fontSize: '0.72rem', padding: '3px 8px' }}
                            onClick={() => toggleTenant(u.id, t.id, has)}
                            title={has ? `Quitar acceso a ${t.name}` : `Dar acceso a ${t.name}`}
                          >
                            {t.slug} {has ? '✓' : '+'}
                          </button>
                        )
                      })}
                    </div>

                    {/* Superadmin toggle */}
                    <button
                      className={u.is_superadmin ? '' : 'secondary'}
                      style={{ fontSize: '0.72rem', padding: '3px 8px' }}
                      onClick={() => toggleSuperadmin(u.id, u.is_superadmin)}
                      title={u.is_superadmin ? 'Quitar superadmin' : 'Dar superadmin'}
                    >
                      {u.is_superadmin ? '★ Admin' : '☆ Admin'}
                    </button>

                    {/* Eliminar (no eliminarse a sí mismo) */}
                    {u.id !== currentUser?.id && (
                      <button
                        className="secondary"
                        style={{ fontSize: '0.72rem', padding: '3px 8px', color: '#f87171' }}
                        onClick={() => deleteUser(u.id, u.email)}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="client-modal-footer">
          <button className="secondary" onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  )
}
