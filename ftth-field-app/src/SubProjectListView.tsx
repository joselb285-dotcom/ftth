import { useEffect, useRef, useState } from 'react'
import { useAuth } from './AuthContext'
import {
  getAllCachedSubProjects, syncSubProject, deleteCachedSubProject,
  makeKey, type CachedSubProject
} from './cache'
import type { Project, SubProject } from './types'

export default function SubProjectListView({
  project,
  onBack,
  onOpenSubProject
}: {
  project: Project
  onBack: () => void
  onOpenSubProject: (sp: SubProject) => void
}) {
  const { currentTenantId } = useAuth()
  const [cached, setCached]         = useState<Record<string, CachedSubProject>>({})
  const [syncing, setSyncing]       = useState<string | null>(null)
  const [syncError, setSyncError]   = useState<string | null>(null)
  const [syncResult, setSyncResult] = useState<Record<string, 'updated' | 'cached'>>({})
  const syncResultTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  const [isOnline, setIsOnline]     = useState(navigator.onLine)
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null)

  useEffect(() => {
    const up   = () => setIsOnline(true)
    const down = () => setIsOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down) }
  }, [])

  useEffect(() => {
    getAllCachedSubProjects().then(list => {
      const map: Record<string, CachedSubProject> = {}
      for (const c of list) map[c.key] = c
      setCached(map)
    })
  }, [])

  async function handleSync(sp: SubProject) {
    if (!currentTenantId) return
    const key = makeKey(currentTenantId, project.id, sp.id)
    setSyncing(key)
    setSyncError(null)
    try {
      const result = await syncSubProject(currentTenantId, project, sp.id)
      setCached(prev => ({ ...prev, [key]: result }))
      const label = result.fromCache ? 'cached' : 'updated'
      setSyncResult(prev => ({ ...prev, [key]: label }))
      clearTimeout(syncResultTimers.current[key])
      syncResultTimers.current[key] = setTimeout(() => {
        setSyncResult(prev => { const next = { ...prev }; delete next[key]; return next })
      }, 3000)
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : 'Error al sincronizar')
    } finally {
      setSyncing(null)
    }
  }

  async function handleDelete(sp: SubProject) {
    if (!currentTenantId) return
    const key = makeKey(currentTenantId, project.id, sp.id)
    await deleteCachedSubProject(key)
    setCached(prev => { const next = { ...prev }; delete next[key]; return next })
    setConfirmingDelete(null)
  }

  function handleOpen(sp: SubProject) {
    if (!currentTenantId) return
    const key = makeKey(currentTenantId, project.id, sp.id)
    const cachedEntry = cached[key]
    if (cachedEntry) {
      onOpenSubProject(cachedEntry.subProject)
    } else if (isOnline) {
      // Sync on-the-fly then open
      handleSync(sp).then(() => {
        getAllCachedSubProjects().then(list => {
          const found = list.find(c => c.key === key)
          if (found) onOpenSubProject(found.subProject)
        })
      })
    }
  }

  return (
    <div className="list-screen">
      <header className="list-header">
        <div className="list-header-top">
          <div>
            <button className="back-btn" onClick={onBack}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 18l-6-6 6-6"/>
              </svg>
              Proyectos
            </button>
            <h1 className="list-title">{project.name}</h1>
          </div>
          <div className={`online-badge ${isOnline ? 'online' : 'offline'}`}>
            <span className="online-dot" />
            {isOnline ? 'En línea' : 'Sin conexión'}
          </div>
        </div>
        {syncError && <div className="state-msg error" style={{ marginTop: 8 }}>{syncError}</div>}
      </header>

      <div className="list-body">
        {project.subProjects.length === 0 && (
          <div className="state-msg">Este proyecto no tiene sub-proyectos.</div>
        )}
        {project.subProjects.map(sp => {
          const key = currentTenantId ? makeKey(currentTenantId, project.id, sp.id) : ''
          const cachedEntry = cached[key]
          const isSyncing = syncing === key
          const hasCache = !!cachedEntry
          const canOpen = hasCache || isOnline
          const syncLabel = syncResult[key]

          return (
            <div key={sp.id} className="sp-card">
              <div className="sp-card-main" onClick={() => canOpen && handleOpen(sp)} style={{ opacity: canOpen ? 1 : 0.5 }}>
                <div className="sp-card-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/>
                    <circle cx="12" cy="10" r="3"/>
                  </svg>
                </div>
                <div className="sp-card-body">
                  <div className="sp-card-name">{sp.name}</div>
                  {sp.description && <div className="sp-card-sub">{sp.description}</div>}
                  <div className="sp-card-meta">
                    {sp.features.length} elemento{sp.features.length !== 1 ? 's' : ''}
                    {sp.location && ` · ${sp.location.displayName.split(',')[0]}`}
                  </div>
                  {hasCache && (
                    <div className="cache-badge">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/>
                      </svg>
                      Disponible offline · {new Date(cachedEntry.cachedAt).toLocaleDateString('es-AR')}
                    </div>
                  )}
                </div>
                {canOpen && (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="list-card-arrow">
                    <path d="M9 18l6-6-6-6"/>
                  </svg>
                )}
              </div>

              <div className="sp-card-actions">
                {isOnline && (
                  <button
                    className={`btn-sync ${isSyncing ? 'syncing' : ''}`}
                    disabled={isSyncing}
                    onClick={() => handleSync(sp)}
                    title={hasCache ? 'Actualizar datos offline' : 'Descargar para uso offline'}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={isSyncing ? 'spin' : ''}>
                      <polyline points="23 4 23 10 17 10"/>
                      <polyline points="1 20 1 14 7 14"/>
                      <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
                    </svg>
                    {isSyncing
                      ? 'Sincronizando...'
                      : syncLabel === 'cached'
                        ? 'Ya sincronizado'
                        : syncLabel === 'updated'
                          ? 'Datos actualizados'
                          : hasCache ? 'Actualizar' : 'Descargar'}
                  </button>
                )}
                {hasCache && !isSyncing && confirmingDelete !== sp.id && (
                  <button
                    className="btn-del-cache"
                    onClick={() => setConfirmingDelete(sp.id)}
                    title="Eliminar datos offline"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6"/>
                      <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
                      <path d="M10 11v6M14 11v6"/>
                    </svg>
                  </button>
                )}
              </div>
              {confirmingDelete === sp.id && (
                <div className="sp-card-confirm-delete">
                  <span>¿Eliminar datos offline?</span>
                  <button className="btn-confirm-cancel" onClick={() => setConfirmingDelete(null)}>Cancelar</button>
                  <button className="btn-confirm-delete" onClick={() => handleDelete(sp)}>Eliminar</button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
