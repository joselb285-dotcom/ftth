import { useEffect, useRef, useState } from 'react'
import { supabase } from './supabase'
import { useAuth } from './AuthContext'
import type { UserRole } from './AuthContext'

type UserProfile = {
  id: string
  email: string
  full_name: string | null
  role: UserRole
  admin_id: string | null
}

type Tenant = { id: string; slug: string; name: string }

function initials(u: UserProfile) {
  return (u.full_name || u.email).split(/[\s@]/)[0].slice(0, 2).toUpperCase()
}

function roleLabel(r: UserRole) {
  return r === 'superadmin' ? '★ Superadmin' : r === 'admin' ? '◆ Admin' : 'Usuario'
}

function roleBadgeStyle(r: UserRole): React.CSSProperties {
  if (r === 'superadmin') return { background: '#1d4ed8', color: '#bfdbfe' }
  if (r === 'admin')      return { background: '#7c3aed', color: '#ddd6fe' }
  return { background: '#1e3a5f', color: '#64748b' }
}

// ── UserRow fuera del componente para evitar desmontaje en cada render ──────
interface UserRowProps {
  u: UserProfile
  meId: string | undefined
  isSuperadmin: boolean
  tenants: Tenant[]
  userTenants: { user_id: string; tenant_id: string }[]
  editingId: string | null
  editRef: React.RefObject<HTMLInputElement | null>
  editName: string
  editPwd: string
  editSaving: boolean
  editMsg: { id: string; msg: string; ok: boolean } | null
  showRoleToggle?: boolean
  onStartEdit: (u: UserProfile) => void
  onCancelEdit: () => void
  onSaveEdit: (u: UserProfile) => void
  onToggleTenant: (userId: string, tenantId: string, has: boolean) => void
  onToggleRole: (u: UserProfile) => void
  onDelete: (u: UserProfile) => void
  onEditName: (v: string) => void
  onEditPwd: (v: string) => void
}

function UserRow({
  u, meId, isSuperadmin, tenants, userTenants,
  editingId, editRef, editName, editPwd, editSaving, editMsg,
  showRoleToggle = false,
  onStartEdit, onCancelEdit, onSaveEdit,
  onToggleTenant, onToggleRole, onDelete,
  onEditName, onEditPwd,
}: UserRowProps) {
  const myTenants = userTenants.filter(ut => ut.user_id === u.id).map(ut => ut.tenant_id)
  const isEditing = editingId === u.id
  const canEdit   = isSuperadmin || u.admin_id === meId

  return (
    <div style={{
      background: '#0d1a2e', border: `1px solid ${isEditing ? '#3b82f6' : '#1e3a5f'}`,
      borderRadius: 6, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{
          width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
          background: roleBadgeStyle(u.role).background,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '0.72rem', fontWeight: 700, color: '#e2e8f0',
        }}>{initials(u)}</div>

        <div style={{ flex: 1, minWidth: 160 }}>
          <div style={{ fontWeight: 600, fontSize: '0.88rem', color: '#e2e8f0' }}>
            {u.full_name || <span style={{ color: '#475569' }}>Sin nombre</span>}
            {u.id === meId && <span style={{ marginLeft: 6, fontSize: '0.7rem', color: '#60a5fa' }}>(yo)</span>}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontFamily: 'monospace' }}>{u.email}</div>
        </div>

        <span style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: 3, fontWeight: 600, ...roleBadgeStyle(u.role) }}>
          {roleLabel(u.role)}
        </span>

        {canEdit && (
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {tenants.map(t => {
              const has = myTenants.includes(t.id)
              return (
                <button key={t.id} className={has ? '' : 'secondary'}
                  style={{ fontSize: '0.7rem', padding: '3px 7px' }}
                  onClick={() => onToggleTenant(u.id, t.id, has)}>
                  {t.slug} {has ? '✓' : '+'}
                </button>
              )
            })}
          </div>
        )}

        {showRoleToggle && isSuperadmin && u.role !== 'superadmin' && (
          <button className={u.role === 'admin' ? '' : 'secondary'}
            style={{ fontSize: '0.7rem', padding: '3px 8px' }}
            onClick={() => onToggleRole(u)}>
            {u.role === 'admin' ? '◆ Admin' : '◇ Promover admin'}
          </button>
        )}

        {canEdit && (
          <button className="secondary" style={{ fontSize: '0.72rem', padding: '3px 8px' }}
            onClick={() => isEditing ? onCancelEdit() : onStartEdit(u)}>
            ✏ Editar
          </button>
        )}

        {canEdit && u.id !== meId && (
          <button className="secondary"
            style={{ fontSize: '0.72rem', padding: '3px 8px', color: '#f87171' }}
            onClick={() => onDelete(u)}>✕</button>
        )}
      </div>

      {isEditing && (
        <div style={{ paddingTop: 8, borderTop: '1px solid #1e3a5f', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <label style={{ flex: 1, minWidth: 180, fontSize: '0.8rem', color: '#94a3b8', display: 'flex', flexDirection: 'column', gap: 4 }}>
              Nombre completo
              <input ref={editRef} value={editName} onChange={e => onEditName(e.target.value)} placeholder="Nombre" />
            </label>
            <label style={{ flex: 1, minWidth: 180, fontSize: '0.8rem', color: '#94a3b8', display: 'flex', flexDirection: 'column', gap: 4 }}>
              Nueva contraseña
              <input type="password" value={editPwd} onChange={e => onEditPwd(e.target.value)} placeholder="Mín. 6 caracteres" />
            </label>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button onClick={() => onSaveEdit(u)} disabled={editSaving} style={{ fontSize: '0.8rem' }}>
              {editSaving ? 'Guardando...' : 'Guardar'}
            </button>
            <button className="secondary" style={{ fontSize: '0.8rem' }} onClick={onCancelEdit}>Cancelar</button>
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
}

// ── Componente principal ─────────────────────────────────────────────────────
interface Props { onClose: () => void }

export default function SuperAdminPage({ onClose }: Props) {
  const { user: me, role: myRole } = useAuth()
  const isSuperadmin = myRole === 'superadmin'
  const isAdmin      = myRole === 'admin'

  const [users,      setUsers]      = useState<UserProfile[]>([])
  const [tenants,    setTenants]    = useState<Tenant[]>([])
  const [userTenants, setUserTenants] = useState<{ user_id: string; tenant_id: string }[]>([])
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState<string | null>(null)

  const [tab, setTab] = useState<'admins' | 'users' | 'directory'>(
    isSuperadmin ? 'admins' : 'users'
  )

  // ── Formulario de creación ─────────────────────────────────────────────────
  const [newEmail,    setNewEmail]    = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newName,     setNewName]     = useState('')
  const [newRole,     setNewRole]     = useState<'admin' | 'user'>(isSuperadmin ? 'admin' : 'user')
  const [creating,    setCreating]    = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [deletedMsg,  setDeletedMsg]  = useState<string | null>(null)
  const createFormRef = useRef<HTMLDivElement>(null)

  // ── Edición inline ─────────────────────────────────────────────────────────
  const [editingId,  setEditingId]  = useState<string | null>(null)
  const [editName,   setEditName]   = useState('')
  const [editPwd,    setEditPwd]    = useState('')
  const [editSaving, setEditSaving] = useState(false)
  const [editMsg,    setEditMsg]    = useState<{ id: string; msg: string; ok: boolean } | null>(null)
  const editRef = useRef<HTMLInputElement>(null)

  // ── Directorio: cambio de contraseña ──────────────────────────────────────
  const [dirPwd,    setDirPwd]    = useState<Record<string, string>>({})
  const [dirMsg,    setDirMsg]    = useState<Record<string, { msg: string; ok: boolean }>>({})
  const [dirSaving, setDirSaving] = useState<Record<string, boolean>>({})

  async function loadData() {
    setLoading(true)
    const [profilesRes, tenantsRes, utRes] = await Promise.all([
      supabase.from('user_profiles').select('id, email, full_name, role, admin_id'),
      supabase.from('tenants').select('id, slug, name'),
      supabase.from('user_tenants').select('user_id, tenant_id'),
    ])
    if (profilesRes.error) { setError(profilesRes.error.message); setLoading(false); return }
    setUsers(profilesRes.data ?? [])
    setTenants(tenantsRes.data ?? [])
    setUserTenants(utRes.data ?? [])
    setLoading(false)
  }

  useEffect(() => { loadData() }, [])

  // ── Listas derivadas ───────────────────────────────────────────────────────
  const admins = users.filter(u => u.role === 'admin' || u.role === 'superadmin')

  const managedUsers = isSuperadmin
    ? users.filter(u => u.role === 'user')
    : users.filter(u => u.role === 'user' && u.admin_id === me?.id)

  const usersByAdmin: Record<string, UserProfile[]> = {}
  for (const u of managedUsers) {
    const key = u.admin_id ?? '__sin_admin__'
    if (!usersByAdmin[key]) usersByAdmin[key] = []
    usersByAdmin[key].push(u)
  }

  const directoryUsers = isSuperadmin
    ? users
    : users.filter(u => u.id === me?.id || u.admin_id === me?.id)

  // ── Crear usuario ──────────────────────────────────────────────────────────
  async function createUser() {
    if (!newEmail || !newPassword) return
    setCreating(true); setCreateError(null)
    try {
      const { data, error } = await supabase.functions.invoke('admin-create-user', {
        body: { email: newEmail, password: newPassword, full_name: newName || null, role: newRole },
      })
      if (error) throw new Error(error.message)
      if (data?.error) throw new Error(data.error)

      if (isAdmin && data.user_id) {
        const myTenantIds = userTenants.filter(ut => ut.user_id === me?.id).map(ut => ut.tenant_id)
        if (myTenantIds.length > 0) {
          await Promise.all(
            myTenantIds.map(tid =>
              supabase.from('user_tenants').insert({ user_id: data.user_id, tenant_id: tid, role: 'user' })
            )
          )
        }
      }

      setNewEmail(''); setNewPassword(''); setNewName(''); setDeletedMsg(null)
      await loadData()
    } catch (err: unknown) {
      setCreateError(err instanceof Error ? err.message : 'Error al crear')
    } finally {
      setCreating(false)
    }
  }

  // ── Toggle tenant ──────────────────────────────────────────────────────────
  async function toggleTenant(userId: string, tenantId: string, has: boolean) {
    if (has) {
      await supabase.from('user_tenants').delete().eq('user_id', userId).eq('tenant_id', tenantId)
    } else {
      await supabase.from('user_tenants').insert({ user_id: userId, tenant_id: tenantId, role: 'user' })
    }
    await loadData()
  }

  // ── Toggle rol (solo superadmin) ───────────────────────────────────────────
  async function toggleRole(u: UserProfile) {
    if (!isSuperadmin) return
    if (u.id === me?.id && !confirm('¿Quitarte el rol de superadmin? No podrás revertirlo desde la app.')) return
    const newR = u.role === 'admin' ? 'user' : 'admin'
    await supabase.from('user_profiles').update({ role: newR }).eq('id', u.id)
    await loadData()
  }

  // ── Edición ────────────────────────────────────────────────────────────────
  function startEdit(u: UserProfile) {
    setEditingId(u.id); setEditName(u.full_name ?? ''); setEditPwd(''); setEditMsg(null)
    setTimeout(() => editRef.current?.focus(), 50)
  }

  async function saveEdit(u: UserProfile) {
    setEditSaving(true); setEditMsg(null)
    try {
      if (editName !== (u.full_name ?? '')) {
        const { error } = await supabase.from('user_profiles')
          .update({ full_name: editName || null }).eq('id', u.id)
        if (error) throw error
      }
      if (editPwd.length >= 6) await changePasswordDirect(u.id, editPwd)
      setEditMsg({ id: u.id, msg: 'Guardado', ok: true })
      setEditingId(null)
      await loadData()
    } catch (err: unknown) {
      setEditMsg({ id: u.id, msg: err instanceof Error ? err.message : 'Error', ok: false })
    } finally {
      setEditSaving(false)
    }
  }

  // ── Contraseña ─────────────────────────────────────────────────────────────
  async function changePasswordDirect(userId: string, newPwd: string) {
    const { data, error } = await supabase.functions.invoke('admin-change-password', {
      body: { user_id: userId, new_password: newPwd },
    })
    if (error) throw new Error(error.message)
    if (data?.error) throw new Error(data.error)
  }

  async function saveDirectoryPwd(u: UserProfile) {
    const pwd = dirPwd[u.id] ?? ''
    if (pwd.length < 6) {
      setDirMsg(prev => ({ ...prev, [u.id]: { msg: 'Mínimo 6 caracteres', ok: false } })); return
    }
    setDirSaving(prev => ({ ...prev, [u.id]: true }))
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

  // ── Eliminar ───────────────────────────────────────────────────────────────
  async function deleteUser(u: UserProfile) {
    if (!confirm(`¿Eliminar a ${u.email}? Esta acción no se puede deshacer.`)) return
    const { data, error } = await supabase.functions.invoke('admin-delete-user', {
      body: { user_id: u.id },
    })
    if (error) { alert(`Error al eliminar: ${error.message}`); return }
    if (data?.error) { alert(`Error al eliminar: ${data.error}`); return }
    await loadData()
    // Pre-llenar formulario con los datos del usuario eliminado
    setNewEmail(u.email)
    setNewName(u.full_name ?? '')
    setNewPassword('')
    setNewRole(u.role === 'admin' ? 'admin' : 'user')
    setTab(u.role === 'admin' || u.role === 'superadmin' ? 'admins' : 'users')
    setDeletedMsg(`"${u.email}" eliminado. Completá la contraseña para recrearlo.`)
    setTimeout(() => createFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100)
  }

  // ── Props comunes para UserRow ─────────────────────────────────────────────
  const rowProps = {
    meId: me?.id, isSuperadmin, tenants, userTenants,
    editingId, editRef, editName, editPwd, editSaving, editMsg,
    onStartEdit: startEdit, onCancelEdit: () => setEditingId(null),
    onSaveEdit: saveEdit, onToggleTenant: toggleTenant, onToggleRole: toggleRole,
    onDelete: deleteUser, onEditName: setEditName, onEditPwd: setEditPwd,
  }

  // ── Tabs ───────────────────────────────────────────────────────────────────
  const tabs = isSuperadmin
    ? ([['admins', 'Admins'], ['users', 'Usuarios'], ['directory', 'Directorio']] as const)
    : ([['users', 'Mis usuarios'], ['directory', 'Directorio']] as const)

  const title    = isSuperadmin ? 'Superadmin — Gestión del sistema' : 'Admin — Gestión de usuarios'
  const subtitle = isSuperadmin
    ? 'Administrá admins, usuarios, roles y accesos'
    : 'Creá y gestioná los usuarios a tu cargo'

  const createLabel = tab === 'admins' ? 'Crear nuevo admin' : 'Crear nuevo usuario'
  const createBtn   = isSuperadmin && newRole === 'admin' ? 'admin' : 'usuario'

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="client-modal-overlay" onClick={onClose}>
      <div className="client-modal"
        style={{ maxWidth: 800, maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
        onClick={e => e.stopPropagation()}>

        <div className="client-modal-header">
          <div>
            <h2>{title}</h2>
            <p className="client-modal-sub">{subtitle}</p>
          </div>
          <button className="secondary" onClick={onClose}>✕</button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid #1e3a5f', padding: '0 16px' }}>
          {tabs.map(([key, label]) => (
            <button key={key} onClick={() => setTab(key as typeof tab)}
              style={{
                background: 'none', border: 'none', padding: '8px 16px', cursor: 'pointer',
                fontSize: '0.82rem', fontWeight: 600,
                color: tab === key ? '#60a5fa' : '#64748b',
                borderBottom: tab === key ? '2px solid #3b82f6' : '2px solid transparent',
                marginBottom: -1,
              }}>
              {label}
            </button>
          ))}
        </div>

        <div className="client-modal-body" style={{ overflowY: 'auto', flex: 1 }}>
          {loading ? (
            <div style={{ color: '#94a3b8', fontSize: '0.85rem' }}>Cargando...</div>
          ) : error ? (
            <div className="login-error">{error}</div>
          ) : (
            <>
              {/* ── TAB: ADMINS ─────────────────────────────────────────── */}
              {tab === 'admins' && isSuperadmin && (
                <>
                  {/* Formulario inlineado — no sub-componente */}
                  <div ref={createFormRef} style={{ marginBottom: 16 }}>
                    {deletedMsg && (
                      <div style={{ marginBottom: 8, padding: '7px 12px', borderRadius: 5,
                        background: '#0f2744', border: '1px solid #3b82f6',
                        fontSize: '0.8rem', color: '#60a5fa' }}>
                        ✓ {deletedMsg}
                      </div>
                    )}
                    <div className="client-section-title">{createLabel}</div>
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
                      <label>
                        Rol
                        <select value={newRole} onChange={e => setNewRole(e.target.value as 'admin' | 'user')}
                          style={{ background: '#0d1a2e', border: '1px solid #1e3a5f', color: '#e2e8f0', borderRadius: 4, padding: '5px 8px' }}>
                          <option value="admin">Admin</option>
                          <option value="user">Usuario</option>
                        </select>
                      </label>
                    </div>
                    {createError && <div className="login-error" style={{ marginTop: 8 }}>{createError}</div>}
                    <button onClick={createUser} disabled={creating || !newEmail || !newPassword} style={{ marginTop: 8 }}>
                      {creating ? 'Creando...' : `+ Crear ${createBtn}`}
                    </button>
                  </div>

                  <div className="client-section-title">Admins ({admins.length})</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {admins.map(u => <UserRow key={u.id} u={u} showRoleToggle {...rowProps} />)}
                    {admins.length === 0 && <div style={{ color: '#475569', fontSize: '0.82rem' }}>No hay admins todavía.</div>}
                  </div>
                </>
              )}

              {/* ── TAB: USUARIOS ───────────────────────────────────────── */}
              {tab === 'users' && (
                <>
                  {/* Formulario inlineado */}
                  <div ref={createFormRef} style={{ marginBottom: 16 }}>
                    {deletedMsg && (
                      <div style={{ marginBottom: 8, padding: '7px 12px', borderRadius: 5,
                        background: '#0f2744', border: '1px solid #3b82f6',
                        fontSize: '0.8rem', color: '#60a5fa' }}>
                        ✓ {deletedMsg}
                      </div>
                    )}
                    <div className="client-section-title">{createLabel}</div>
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
                      {isSuperadmin && (
                        <label>
                          Rol
                          <select value={newRole} onChange={e => setNewRole(e.target.value as 'admin' | 'user')}
                            style={{ background: '#0d1a2e', border: '1px solid #1e3a5f', color: '#e2e8f0', borderRadius: 4, padding: '5px 8px' }}>
                            <option value="admin">Admin</option>
                            <option value="user">Usuario</option>
                          </select>
                        </label>
                      )}
                    </div>
                    {createError && <div className="login-error" style={{ marginTop: 8 }}>{createError}</div>}
                    <button onClick={createUser} disabled={creating || !newEmail || !newPassword} style={{ marginTop: 8 }}>
                      {creating ? 'Creando...' : `+ Crear ${createBtn}`}
                    </button>
                  </div>

                  {isSuperadmin ? (
                    Object.keys(usersByAdmin).length === 0 ? (
                      <div style={{ color: '#475569', fontSize: '0.82rem' }}>No hay usuarios todavía.</div>
                    ) : (
                      Object.entries(usersByAdmin).map(([adminId, usrs]) => {
                        const adminProfile = users.find(u => u.id === adminId)
                        return (
                          <div key={adminId} style={{ marginBottom: 16 }}>
                            <div className="client-section-title" style={{ color: '#a78bfa', marginBottom: 8 }}>
                              {adminId === '__sin_admin__'
                                ? 'Sin admin asignado'
                                : `Admin: ${adminProfile?.full_name || adminProfile?.email || adminId}`}
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                              {usrs.map(u => <UserRow key={u.id} u={u} {...rowProps} />)}
                            </div>
                          </div>
                        )
                      })
                    )
                  ) : (
                    <>
                      <div className="client-section-title">Mis usuarios ({managedUsers.length})</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {managedUsers.map(u => <UserRow key={u.id} u={u} {...rowProps} />)}
                        {managedUsers.length === 0 && (
                          <div style={{ color: '#475569', fontSize: '0.82rem' }}>Todavía no creaste ningún usuario.</div>
                        )}
                      </div>
                    </>
                  )}
                </>
              )}

              {/* ── TAB: DIRECTORIO ─────────────────────────────────────── */}
              {tab === 'directory' && (
                <>
                  <div className="client-section-title" style={{ marginBottom: 4 }}>
                    Directorio ({directoryUsers.length})
                  </div>
                  <p style={{ fontSize: '0.75rem', color: '#475569', margin: '0 0 12px' }}>
                    Cambiá la contraseña de cualquier usuario sin necesidad de email.
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {directoryUsers.map(u => {
                      const myTenants = userTenants
                        .filter(ut => ut.user_id === u.id)
                        .map(ut => tenants.find(t => t.id === ut.tenant_id)?.slug ?? ut.tenant_id)
                      const saving = dirSaving[u.id] ?? false
                      const msg    = dirMsg[u.id]
                      const canChangePwd = isSuperadmin || u.admin_id === me?.id

                      return (
                        <div key={u.id} style={{
                          background: '#0d1a2e', border: '1px solid #1e3a5f', borderRadius: 6, padding: '10px 12px',
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                            <div style={{
                              width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
                              ...roleBadgeStyle(u.role),
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: '0.75rem', fontWeight: 700,
                            }}>{initials(u)}</div>

                            <div style={{ flex: 1, minWidth: 160 }}>
                              <div style={{ fontWeight: 600, fontSize: '0.88rem', color: '#e2e8f0' }}>
                                {u.full_name || <span style={{ color: '#64748b' }}>Sin nombre</span>}
                                {u.id === me?.id && <span style={{ marginLeft: 6, fontSize: '0.7rem', color: '#60a5fa' }}>(yo)</span>}
                              </div>
                              <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontFamily: 'monospace' }}>{u.email}</div>
                            </div>

                            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                              {myTenants.length === 0
                                ? <span style={{ fontSize: '0.7rem', color: '#334155' }}>Sin proyectos</span>
                                : myTenants.map(slug => (
                                  <span key={slug} style={{
                                    fontSize: '0.7rem', padding: '2px 6px', borderRadius: 3,
                                    background: '#0f2744', color: '#60a5fa', border: '1px solid #1e3a5f',
                                  }}>{slug}</span>
                                ))}
                            </div>

                            <span style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: 3, fontWeight: 600, ...roleBadgeStyle(u.role) }}>
                              {roleLabel(u.role)}
                            </span>
                          </div>

                          {canChangePwd && (
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}>
                              <input type="password"
                                value={dirPwd[u.id] ?? ''}
                                onChange={e => setDirPwd(prev => ({ ...prev, [u.id]: e.target.value }))}
                                placeholder="Nueva contraseña (mín. 6 chars)"
                                style={{ flex: 1, minWidth: 200, fontSize: '0.8rem', padding: '5px 8px' }}
                                onKeyDown={e => { if (e.key === 'Enter') saveDirectoryPwd(u) }}
                              />
                              <button onClick={() => saveDirectoryPwd(u)}
                                disabled={saving || (dirPwd[u.id] ?? '').length < 6}
                                style={{ fontSize: '0.78rem', padding: '5px 12px', whiteSpace: 'nowrap' }}>
                                {saving ? 'Cambiando...' : 'Cambiar'}
                              </button>
                            </div>
                          )}
                          {msg && (
                            <div style={{ marginTop: 4, fontSize: '0.75rem', color: msg.ok ? '#34d399' : '#f87171' }}>
                              {msg.ok ? '✓' : '✗'} {msg.msg}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </>
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
