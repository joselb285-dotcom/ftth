import { useEffect, useState } from 'react'
import { useAuth } from './AuthContext'
import { supabase } from './supabase'
import { getAllCachedSubProjects } from './cache'
import type { Project } from './types'
import { useTheme } from './useTheme'

// Reconstruct a minimal project list from cached subprojects for offline use
function buildOfflineProjects(cached: Awaited<ReturnType<typeof getAllCachedSubProjects>>): Project[] {
  const map = new Map<string, Project>()
  for (const c of cached) {
    if (!map.has(c.projectId)) {
      map.set(c.projectId, {
        id: c.projectId,
        name: c.projectName,
        description: '',
        createdAt: '',
        updatedAt: '',
        subProjects: []
      })
    }
    map.get(c.projectId)!.subProjects.push(c.subProject)
  }
  return [...map.values()]
}

export default function ProjectListView({ onOpenProject }: { onOpenProject: (p: Project) => void }) {
  const { currentTenantId, logout } = useAuth()
  const { theme, toggle: toggleTheme } = useTheme()
  const [projects, setProjects]   = useState<Project[]>([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState<string | null>(null)
  const [cachedCount, setCachedCount] = useState(0)
  const [isOnline, setIsOnline]   = useState(navigator.onLine)

  useEffect(() => {
    const up   = () => setIsOnline(true)
    const down = () => setIsOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down) }
  }, [])

  useEffect(() => {
    async function load() {
      const cached = await getAllCachedSubProjects()
      setCachedCount(cached.length)

      if (!navigator.onLine) {
        // Offline: reconstruct project list from cache
        setProjects(buildOfflineProjects(cached))
        setLoading(false)
        return
      }

      if (!currentTenantId) return

      try {
        const { data, error: err } = await supabase
          .from('projects')
          .select('data')
          .eq('tenant_id', currentTenantId)
        if (err) throw err
        setProjects((data ?? []).map(r => r.data as Project))
      } catch (e) {
        // Network failed — fall back to cache
        if (cached.length > 0) {
          setProjects(buildOfflineProjects(cached))
        } else {
          setError(e instanceof Error ? e.message : 'Error al cargar')
        }
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [currentTenantId])

  return (
    <div className="list-screen">
      <header className="list-header">
        <div className="list-header-top">
          <div>
            <h1 className="list-title">Proyectos</h1>
            <div className={`online-badge ${isOnline ? 'online' : 'offline'}`}>
              <span className="online-dot" />
              {isOnline ? 'En línea' : 'Sin conexión'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-icon" onClick={toggleTheme} title={theme === 'dark' ? 'Tema claro' : 'Tema oscuro'}>
            {theme === 'dark' ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="5"/>
                <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
                <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
              </svg>
            )}
          </button>
          <button className="btn-icon" onClick={logout} title="Salir">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
          </button>
          </div>
        </div>
        {cachedCount > 0 && (
          <div className="cache-info">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            {cachedCount} sub-proyecto{cachedCount !== 1 ? 's' : ''} disponible{cachedCount !== 1 ? 's' : ''} offline
          </div>
        )}
      </header>

      <div className="list-body">
        {loading && <div className="state-msg">Cargando proyectos...</div>}
        {error && <div className="state-msg error">{error}</div>}
        {!loading && !error && projects.length === 0 && (
          <div className="state-msg">
            {isOnline
              ? 'No hay proyectos disponibles.'
              : 'Sin conexión y sin datos cacheados. Conectate a internet al menos una vez.'}
          </div>
        )}
        {projects.map(project => (
          <button key={project.id} className="list-card" onClick={() => onOpenProject(project)}>
            <div className="list-card-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
                <polyline points="9 22 9 12 15 12 15 22"/>
              </svg>
            </div>
            <div className="list-card-body">
              <div className="list-card-name">{project.name}</div>
              {project.description && (
                <div className="list-card-sub">{project.description}</div>
              )}
              <div className="list-card-meta">
                {project.subProjects.length} sub-proyecto{project.subProjects.length !== 1 ? 's' : ''}
              </div>
            </div>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="list-card-arrow">
              <path d="M9 18l6-6-6-6"/>
            </svg>
          </button>
        ))}
      </div>
    </div>
  )
}
