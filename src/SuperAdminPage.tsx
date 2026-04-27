import { useEffect, useState, useRef } from 'react'
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
  const [tab, setTab]         = useState<'manage' | 'directory'>('manage')

  // Create user form
  const [newEmail, setNewEmail]       = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newName, setNewName]         = useState('')
  const [creating, setCreating]       = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  // Edit user (manage tab)
  const [editingId, setEditingId]     = useState<string | null>(null)
  const [editName, setEditName]       = useState('')
  const [editPwd, setEditPwd]         = useState('')
  const [editSaving, setEditSaving]   = useState(false)
  const [editMsg, setEditMsg]         = useState<{ id: string; msg: string; ok: boolean } | null>(null)
  const editRef = useRef<HTMLInputElement>(null)

  // Directory tab: password change per user
  const [dirPwd, setDirPwd]   = useState<Record<string, string>>({})
  const [dirMsg, setDirMsg]   = useState<Record<string, { msg: string; ok: boolean }>>({})
  const [dirSaving, setDirSaving] = useState<Record<string, boolean>>({})

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

  function startEdit(u: UserProfile) {
    setEditingId(u.id)
    setEditName(u.full_name ?? '')
    setEditPwd('')
    setEditMsg(null)
    setTimeout(() => editRef.current?.focus(), 50)
  }

  // Llama la Edge Function para cambiar contraseña directamente
  async function changePasswordDirect(userId: string, newPwd: string): Promise<void> {
    const { data, error } = await supabase.functions.invoke('admin-change-password', {
      body: { user_id: userId, new_password: newPwd },
    })
    if (error) throw new Error(error.message)
    if (data?.error) throw new Error(data.error)
  }

  async function saveEdit(u: UserProfile) {
    setEditSaving(true)
    setEditMsg(null)
    try {
      if (editName !== (u.full_name ?? '')) {
        const { error } = await supabase.from('user_profiles')
          .update({ full_name: editName || null })
          .eq('id', u.id)
        if (error) throw error
      }
      if (editPwd.length >= 6) {
        await changePasswordDirect(u.id, editPwd)
        setEditMsg({ id: u.id, msg: 'Contraseña cambiada correctamente', ok: true })
      } else {
        setEditMsg({ id: u.id, msg: 'Guardado', ok: true })
      }
      setEditingId(null)
      await loadData()
    } catch (err: unknown) {
      setEditMsg({ id: u.id, msg: err instanceof Error ? err.message : 'Error', ok: false })
    } finally {
      setEditSaving(false)
    }
  }

  async function saveDirectoryPwd(u: UserProfile) {
    const pwd = dirPwd[u.id] ?? ''
    if (pwd.length < 6) {
      setDirMsg(prev => ({ ...prev, [u.id]: { msg: 'Mínimo 6 caracteres', ok: false } }))
      return
    }
    setDirSaving(prev => ({ ...prev, [u.id]: true }))
    setDirMsg(prev => ({ ...prev, [u.id]: { msg: '', ok: true } }))
    try {
      await changePasswordDirect(u.id, pwd)
      setDirPwd(prev => ({ ...prev, [u.id]: '' }))
      setDirMsg(prev => ({ ...prev, [u.id]: { msg: 'Contraseña actualizada', ok: true } }))
    } catch (err: unknown) {
      setDirMsg(prev => ({ ...prev, [u.id]: { msg: err instanceof Error ? err.message : 'Error', ok: false } }))
    } finally {
      setDirSaving(prev => ({ ...prev, [u.id]: false }))
    }
  }

  async function deleteUser(userId: string, email: string) {
    if (!confirm(`¿Eliminar al usuario ${email}? Esta acción no se puede deshacer.`)) return
    await supabase.from('user_tenants').delete().eq('user_id', userId)
    await supabase.from('user_profiles').delete().eq('id', userId)
    await loadData()
  }

  function initials(u: UserProfile) {
    const name = u.full_name || u.email
    return name.split(/[\s@]/)[0].slice(0, 2).toUpperCase()
  }

  return (
    <div className="client-modal-overlay" onClick={onClose}>
      <div className="client-modal" style={{ maxWidth: 760, maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
        <div className="client-modal-header">
          <div>
            <h2>Superadmin — Gestión de usuarios</h2>
            <p className="client-modal-sub">Administrá usuarios, roles y contraseñas</p>
          </div>
          <button className="secondary" onClick={onClose}>✕</button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid #1e3a5f', padding: '0 16px' }}>
          {(['manage', 'directory'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              style={{
                background: 'none', border: 'none', padding: '8px 16px',
                cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600,
                color: tab === t ? '#60a5fa' : '#64748b',
                borderBottom: tab === t ? '2px solid #3b82f6' : '2px solid transparent',
                marginBottom: -1,
              }}>
              {t === 'manage' ? 'Gestión' : 'Directorio'}
            </button>
          ))}
        </div>

        <div className="client-modal-body" style={{ overflowY: 'auto', flex: 1 }}>

          {/* ── TAB: GESTIÓN ─────────────────────────────────────────────────── */}
          {tab === 'manage' && (
            <>
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
                  Contraseña inicial
                  <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Mínimo 6 caracteres" />
                </label>
              </div>
              {createError && <div className="login-error" style={{ marginTop: 8 }}>{createError}</div>}
              <button onClick={createUser} disabled={creating || !newEmail || !newPassword} style={{ marginTop: 8 }}>
                {creating ? 'Creando...' : '+ Crear usuario'}
              </button>

              <div className="client-section-title" style={{ marginTop: 20 }}>Usuarios ({users.length})</div>
              {loading ? (
                <div style={{ color: '#94a3b8', fontSize: '0.85rem' }}>Cargando...</div>
              ) : error ? (
                <div className="login-error">{error}</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {users.map(u => {
                    const myTenants = userTenants.filter(ut => ut.user_id === u.id).map(ut => ut.tenant_id)
                    const isEditing = editingId === u.id
                    return (
                      <div key={u.id} style={{
                        background: '#0d1a2e', border: `1px solid ${isEditing ? '#3b82f6' : '#1e3a5f'}`, borderRadius: 6,
                        padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                          <div style={{ flex: 1, minWidth: 160 }}>
                            <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>{u.full_name || u.email}</div>
                            {u.full_name && <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{u.email}</div>}
                          </div>

                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            {tenants.map(t => {
                              const has = myTenants.includes(t.id)
                              return (
                                <button key={t.id} className={has ? '' : 'secondary'}
                                  style={{ fontSize: '0.72rem', padding: '3px 8px' }}
                                  onClick={() => toggleTenant(u.id, t.id, has)}>
                                  {t.slug} {has ? '✓' : '+'}
                                </button>
                              )
                            })}
                          </div>

                          <button className={u.is_superadmin ? '' : 'secondary'}
                            style={{ fontSize: '0.72rem', padding: '3px 8px' }}
                            onClick={() => toggleSuperadmin(u.id, u.is_superadmin)}>
                            {u.is_superadmin ? '★ Admin' : '☆ Admin'}
                          </button>

                          <button className="secondary" style={{ fontSize: '0.72rem', padding: '3px 8px' }}
                            onClick={() => isEditing ? setEditingId(null) : startEdit(u)}>
                            ✏️ Editar
                          </button>

                          {u.id !== currentUser?.id && (
                            <button className="secondary"
                              style={{ fontSize: '0.72rem', padding: '3px 8px', color: '#f87171' }}
                              onClick={() => deleteUser(u.id, u.email)}>
                              ✕
                            </button>
                          )}
                        </div>

                        {isEditing && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 4, borderTop: '1px solid #1e3a5f' }}>
                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                              <label style={{ flex: 1, minWidth: 180, fontSize: '0.8rem', color: '#94a3b8', display: 'flex', flexDirection: 'column', gap: 4 }}>
                                Nombre completo
                                <input ref={editRef} value={editName} onChange={e => setEditName(e.target.value)} placeholder="Nombre" />
                              </label>
                              <label style={{ flex: 1, minWidth: 180, fontSize: '0.8rem', color: '#94a3b8', display: 'flex', flexDirection: 'column', gap: 4 }}>
                                Nueva contraseña
                                <input type="password" value={editPwd} onChange={e => setEditPwd(e.target.value)} placeholder="Mínimo 6 caracteres" />
                              </label>
                            </div>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                              <button onClick={() => saveEdit(u)} disabled={editSaving} style={{ fontSize: '0.8rem' }}>
                                {editSaving ? 'Guardando...' : 'Guardar'}
                              </button>
                              <button className="secondary" style={{ fontSize: '0.8rem' }} onClick={() => setEditingId(null)}>
                                Cancelar
                              </button>
                            </div>
                            {editMsg?.id === u.id && (
                              <div style={{ fontSize: '0.78rem', color: editMsg.ok ? '#34d399' : '#f87171' }}>
                                {editMsg.ok ? '✓' : '✗'} {editMsg.msg}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </>
          )}

          {/* ── TAB: DIRECTORIO ──────────────────────────────────────────────── */}
          {tab === 'directory' && (
            <>
              <div className="client-section-title" style={{ marginBottom: 4 }}>
                Directorio de usuarios ({users.length})
              </div>
              <p style={{ fontSize: '0.75rem', color: '#475569', margin: '0 0 12px' }}>
                Podés cambiar la contraseña de cualquier usuario directamente, sin necesidad de email.
              </p>

              {loading ? (
                <div style={{ color: '#94a3b8', fontSize: '0.85rem' }}>Cargando...</div>
              ) : error ? (
                <div className="login-error">{error}</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {users.map(u => {
                    const myTenants = userTenants
                      .filter(ut => ut.user_id === u.id)
                      .map(ut => tenants.find(t => t.id === ut.tenant_id)?.slug ?? ut.tenant_id)
                    const saving = dirSaving[u.id] ?? false
                    const msg = dirMsg[u.id]

                    return (
                      <div key={u.id} style={{
                        background: '#0d1a2e', border: '1px solid #1e3a5f', borderRadius: 6,
                        padding: '10px 12px',
                      }}>
                        {/* Fila superior: avatar + info + tenants + rol */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                          {/* Avatar con iniciales */}
                          <div style={{
                            width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
                            background: u.is_superadmin ? '#1d4ed8' : '#1e3a5f',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: '0.75rem', fontWeight: 700, color: '#e2e8f0',
                          }}>
                            {initials(u)}
                          </div>

                          {/* Nombre + email */}
                          <div style={{ flex: 1, minWidth: 160 }}>
                            <div style={{ fontWeight: 600, fontSize: '0.88rem', color: '#e2e8f0' }}>
                              {u.full_name || <span style={{ color: '#64748b' }}>Sin nombre</span>}
                              {u.id === currentUser?.id && (
                                <span style={{ marginLeft: 6, fontSize: '0.7rem', color: '#60a5fa' }}>(yo)</span>
                              )}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontFamily: 'monospace' }}>{u.email}</div>
                          </div>

                          {/* Tenants */}
                          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                            {myTenants.length === 0
                              ? <span style={{ fontSize: '0.7rem', color: '#334155' }}>Sin proyectos</span>
                              : myTenants.map(slug => (
                                <span key={slug} style={{
                                  fontSize: '0.7rem', padding: '2px 6px', borderRadius: 3,
                                  background: '#0f2744', color: '#60a5fa', border: '1px solid #1e3a5f'
                                }}>{slug}</span>
                              ))
                            }
                          </div>

                          {/* Rol */}
                          <span style={{
                            fontSize: '0.7rem', padding: '2px 8px', borderRadius: 3,
                            background: u.is_superadmin ? '#1d4ed8' : '#1e3a5f',
                            color: u.is_superadmin ? '#bfdbfe' : '#64748b',
                            fontWeight: 600,
                          }}>
                            {u.is_superadmin ? '★ Superadmin' : 'Usuario'}
                          </span>
                        </div>

                        {/* Fila de cambio de contraseña */}
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}>
                          <input
                            type="password"
                            value={dirPwd[u.id] ?? ''}
                            onChange={e => setDirPwd(prev => ({ ...prev, [u.id]: e.target.value }))}
                            placeholder="Nueva contraseña (mín. 6 chars)"
                            style={{ flex: 1, minWidth: 200, fontSize: '0.8rem', padding: '5px 8px' }}
                            onKeyDown={e => { if (e.key === 'Enter') saveDirectoryPwd(u) }}
                          />
                          <button
                            onClick={() => saveDirectoryPwd(u)}
                            disabled={saving || (dirPwd[u.id] ?? '').length < 6}
                            style={{ fontSize: '0.78rem', padding: '5px 12px', whiteSpace: 'nowrap' }}
                          >
                            {saving ? 'Cambiando...' : 'Cambiar contraseña'}
                          </button>
                        </div>

                        {msg && (
                          <div style={{ marginTop: 4, fontSize: '0.75rem', color: msg.ok ? '#34d399' : '#f87171' }}>
                            {msg.ok ? '✓' : '✗'} {msg.msg}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </>
          )}
        </div>

        <div className="client-modal-footer">
          <button className="secondary" onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  )
}
