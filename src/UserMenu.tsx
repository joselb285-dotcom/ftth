import { useState, useRef, useEffect } from 'react'
import { THEMES, applyTheme, type ThemeName } from './ThemePicker'

interface Props {
  email: string
  isSuperadmin?: boolean
  isAdmin?: boolean
  onAdminClick?: () => void
  onLogout: () => void
}

export default function UserMenu({ email, isSuperadmin, isAdmin, onAdminClick, onLogout }: Props) {
  const [open, setOpen] = useState(false)
  const [current, setCurrent] = useState<ThemeName>(
    () => (localStorage.getItem('ftth-theme') as ThemeName) ?? 'océano'
  )
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onOut(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onOut)
    return () => document.removeEventListener('mousedown', onOut)
  }, [])

  function selectTheme(id: ThemeName) {
    setCurrent(id)
    applyTheme(id)
  }

  const initials = email ? email.slice(0, 2).toUpperCase() : 'GIS'
  const displayName = email ? email.split('@')[0] : 'Usuario'
  const rolLabel = isSuperadmin ? 'Superadmin' : isAdmin ? 'Admin' : 'Editor'

  return (
    <div className="user-menu" ref={ref}>
      <button
        className="user-menu-trigger"
        onClick={() => setOpen(o => !o)}
        title={`${email} · ${rolLabel}`}
      >
        <span className="user-menu-avatar">{initials}</span>
      </button>

      {open && (
        <div className="user-menu-dropdown">
          <div className="user-menu-header">
            <span className="user-menu-name" title={email}>{displayName}</span>
            <span className="user-menu-role">{rolLabel}</span>
          </div>

          <div className="user-menu-section-label">Tema de color</div>
          <div className="user-menu-themes">
            {THEMES.map(t => (
              <button
                key={t.id}
                className={`user-menu-swatch${current === t.id ? ' active' : ''}`}
                onClick={() => selectTheme(t.id)}
                title={t.label}
              >
                <span style={{ background: t.bg, display: 'block', width: '100%', height: '100%', borderRadius: 3, position: 'relative', overflow: 'hidden' }}>
                  <span style={{ position: 'absolute', bottom: 2, right: 2, width: 7, height: 7, borderRadius: '50%', background: t.accent }} />
                </span>
              </button>
            ))}
          </div>

          <div className="user-menu-divider" />

          {(isSuperadmin || isAdmin) && onAdminClick && (
            <button className="user-menu-item" onClick={() => { setOpen(false); onAdminClick() }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
                <circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>
              </svg>
              {isSuperadmin ? 'Panel superadmin' : 'Panel admin'}
            </button>
          )}

          <button className="user-menu-item user-menu-logout" onClick={() => { setOpen(false); onLogout() }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
            Cerrar sesión
          </button>
        </div>
      )}
    </div>
  )
}
