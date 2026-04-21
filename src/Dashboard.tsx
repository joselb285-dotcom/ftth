import { useMemo, useState } from 'react'
import type { Project, ZabbixConfig } from './types'
import DashTraffic from './DashTraffic'

interface DashboardProps {
  projects: Project[]
  zabbixConfig?: ZabbixConfig | null
  onOpenProject: (id: string) => void
  onCreateProject: () => void
  onDeleteProject: (id: string) => void
}

export default function Dashboard({ projects, zabbixConfig, onOpenProject, onCreateProject, onDeleteProject }: DashboardProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [activeNav, setActiveNav] = useState('dashboard')
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  const stats = useMemo(() => {
    const totalSubProjects = projects.reduce((sum, p) => sum + p.subProjects.length, 0)
    const totalElements = projects.reduce((sum, p) =>
      p.subProjects.reduce((s, sp) => s + sp.features.length, sum), 0)
    const activeElements = projects.reduce((sum, p) =>
      p.subProjects.reduce((s, sp) =>
        s + sp.features.filter(f => f.properties.status === 'active').length, sum), 0)
    const plannedElements = projects.reduce((sum, p) =>
      p.subProjects.reduce((s, sp) =>
        s + sp.features.filter(f => f.properties.status === 'planned').length, sum), 0)
    const maintenanceElements = projects.reduce((sum, p) =>
      p.subProjects.reduce((s, sp) =>
        s + sp.features.filter(f => f.properties.status === 'maintenance').length, sum), 0)
    const damagedElements = projects.reduce((sum, p) =>
      p.subProjects.reduce((s, sp) =>
        s + sp.features.filter(f => f.properties.status === 'damaged').length, sum), 0)
    const nodeCount = projects.reduce((sum, p) =>
      p.subProjects.reduce((s, sp) =>
        s + sp.features.filter(f => f.properties.featureType === 'node').length, sum), 0)
    const spliceCount = projects.reduce((sum, p) =>
      p.subProjects.reduce((s, sp) =>
        s + sp.features.filter(f => f.properties.featureType === 'splice_box').length, sum), 0)
    const napCount = projects.reduce((sum, p) =>
      p.subProjects.reduce((s, sp) =>
        s + sp.features.filter(f => f.properties.featureType === 'nap').length, sum), 0)
    const fiberCount = projects.reduce((sum, p) =>
      p.subProjects.reduce((s, sp) =>
        s + sp.features.filter(f => f.properties.featureType === 'fiber_line').length, sum), 0)
    return {
      totalProjects: projects.length,
      totalSubProjects,
      totalElements,
      activeElements,
      plannedElements,
      maintenanceElements,
      damagedElements,
      activeRate: totalElements > 0 ? Math.round((activeElements / totalElements) * 100) : 0,
      nodeCount, spliceCount, napCount, fiberCount,
    }
  }, [projects])

  const filteredProjects = useMemo(() => {
    if (!searchQuery) return projects
    const q = searchQuery.toLowerCase()
    return projects.filter(p =>
      p.name.toLowerCase().includes(q) ||
      (p.description?.toLowerCase().includes(q) ?? false)
    )
  }, [projects, searchQuery])

  const recentProjects = useMemo(() =>
    [...filteredProjects].sort((a, b) =>
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    )
  , [filteredProjects])

  const chartData = useMemo(() => {
    const sorted = [...projects]
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, 7)
    const maxVal = Math.max(1, ...sorted.map(p => p.subProjects.length))
    return sorted.map(p => ({
      name: p.name.length > 10 ? p.name.slice(0, 9) + '…' : p.name,
      value: p.subProjects.length,
      pct: Math.max((p.subProjects.length / maxVal) * 100, 4),
    }))
  }, [projects])

  const today = new Date().toLocaleDateString('es-AR', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  })
  const todayCap = today.charAt(0).toUpperCase() + today.slice(1)

  function handleDelete(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    setConfirmDelete(id)
  }

  function confirmDeleteAction() {
    if (confirmDelete) {
      onDeleteProject(confirmDelete)
      setConfirmDelete(null)
    }
  }

  return (
    <div className="dash-shell">

      {/* ── Sidebar ──────────────────────────────────────────────────────────── */}
      <aside className="dash-sidebar">
        <div className="dash-logo">
          <div className="dash-logo-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L2 7l10 5 10-5-10-5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M2 17l10 5 10-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M2 12l10 5 10-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <div>
            <div className="dash-logo-name">FTTH GIS</div>
            <div className="dash-logo-sub">Editor Pro</div>
          </div>
        </div>

        <nav className="dash-nav">
          <div className="dash-nav-section">
            <span className="dash-nav-section-label">Principal</span>
            <button
              className={`dash-nav-item${activeNav === 'dashboard' ? ' dash-nav-active' : ''}`}
              onClick={() => setActiveNav('dashboard')}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                <rect x="3" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="2"/>
                <rect x="14" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="2"/>
                <rect x="3" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="2"/>
                <rect x="14" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="2"/>
              </svg>
              Dashboard
            </button>
            <button
              className={`dash-nav-item${activeNav === 'projects' ? ' dash-nav-active' : ''}`}
              onClick={() => setActiveNav('projects')}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
              </svg>
              Proyectos
              {projects.length > 0 && (
                <span className="dash-nav-badge">{projects.length}</span>
              )}
            </button>
          </div>

          <div className="dash-nav-section">
            <span className="dash-nav-section-label">Herramientas</span>
            <button className="dash-nav-item dash-nav-disabled">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                <path d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Editor GIS
              <span className="dash-nav-tag">Beta</span>
            </button>
            <button className="dash-nav-item dash-nav-disabled">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                <path d="M9 17H7A5 5 0 017 7h2M15 7h2a5 5 0 010 10h-2M8 12h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
              Trazados Ópticos
            </button>
            <button className="dash-nav-item dash-nav-disabled">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
                <polyline points="14,2 14,8 20,8" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
                <line x1="16" y1="13" x2="8" y2="13" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                <line x1="16" y1="17" x2="8" y2="17" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
              Informes PDF
            </button>
          </div>

          <div className="dash-nav-section">
            <span className="dash-nav-section-label">Sistema</span>
            <button className="dash-nav-item dash-nav-disabled">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2"/>
                <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" stroke="currentColor" strokeWidth="2"/>
              </svg>
              Configuración
            </button>
          </div>
        </nav>

        <div className="dash-sidebar-footer">
          <div className="dash-user">
            <div className="dash-user-avatar">GIS</div>
            <div className="dash-user-info">
              <span className="dash-user-name">Administrador</span>
              <span className="dash-user-role">Ingeniero FTTH</span>
            </div>
            <span className="dash-online-dot" title="En línea"></span>
          </div>
        </div>
      </aside>

      {/* ── Main ─────────────────────────────────────────────────────────────── */}
      <div className="dash-main">

        {/* Topbar */}
        <header className="dash-topbar">
          <div className="dash-topbar-left">
            <nav className="dash-breadcrumb">
              <span className="dash-bc-root">Sistema</span>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" className="dash-bc-sep">
                <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <span className="dash-bc-current">Dashboard</span>
            </nav>
          </div>
          <div className="dash-topbar-right">
            <div className="dash-search-wrap">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" className="dash-search-icon">
                <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="2"/>
                <path d="M21 21l-4.35-4.35" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
              <input
                type="text"
                placeholder="Buscar proyectos..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="dash-search-input"
              />
              {searchQuery && (
                <button className="dash-search-clear" onClick={() => setSearchQuery('')}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
                    <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
                  </svg>
                </button>
              )}
            </div>
            <button className="dash-icon-btn" title="Notificaciones">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
            <button className="dash-icon-btn" title="Ayuda">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
                <path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3M12 17h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </button>
            <div className="dash-topbar-divider"></div>
            <button className="dash-primary-btn" onClick={onCreateProject}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                <line x1="12" y1="5" x2="12" y2="19" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
                <line x1="5" y1="12" x2="19" y2="12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
              </svg>
              Nuevo proyecto
            </button>
          </div>
        </header>

        {/* Content */}
        <main className="dash-content">

          {/* Welcome row */}
          <div className="dash-welcome-row">
            <div>
              <h2 className="dash-page-title">Panel de Control</h2>
              <p className="dash-page-sub">{todayCap}</p>
            </div>
            <div className="dash-system-pill">
              <span className="dash-pulse-dot"></span>
              Sistema operativo
            </div>
          </div>

          {/* KPI grid */}
          <div className="dash-kpi-grid">

            <div className="dash-kpi-card">
              <div className="dash-kpi-header">
                <div className="dash-kpi-icon-wrap kpi-blue">
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
                    <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
                  </svg>
                </div>
                <span className="dash-kpi-label">Proyectos</span>
              </div>
              <div className="dash-kpi-value">{stats.totalProjects}</div>
              <div className="dash-kpi-foot">
                <span className="dash-kpi-tag neutral">Total registrados</span>
              </div>
            </div>

            <div className="dash-kpi-card">
              <div className="dash-kpi-header">
                <div className="dash-kpi-icon-wrap kpi-teal">
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
                    <path d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <span className="dash-kpi-label">Sub-proyectos</span>
              </div>
              <div className="dash-kpi-value">{stats.totalSubProjects}</div>
              <div className="dash-kpi-foot">
                <span className="dash-kpi-tag neutral">Zonas de despliegue</span>
              </div>
            </div>

            <div className="dash-kpi-card">
              <div className="dash-kpi-header">
                <div className="dash-kpi-icon-wrap kpi-green">
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
                    <polyline points="22,12 18,12 15,21 9,3 6,12 2,12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <span className="dash-kpi-label">Elementos trazados</span>
              </div>
              <div className="dash-kpi-value">{stats.totalElements}</div>
              <div className="dash-kpi-foot">
                <span className="dash-kpi-tag green">{stats.activeElements} activos</span>
              </div>
            </div>

            <div className="dash-kpi-card">
              <div className="dash-kpi-header">
                <div className="dash-kpi-icon-wrap kpi-purple">
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
                    <path d="M18 20V10M12 20V4M6 20v-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <span className="dash-kpi-label">Tasa de activación</span>
              </div>
              <div className="dash-kpi-value">
                {stats.activeRate}<span className="dash-kpi-unit">%</span>
              </div>
              <div className="dash-kpi-foot">
                <span className={`dash-kpi-tag ${stats.activeRate >= 70 ? 'green' : stats.activeRate >= 40 ? 'amber' : 'neutral'}`}>
                  {stats.activeRate >= 70 ? '▲ Óptimo' : stats.activeRate >= 40 ? '● En progreso' : '○ Inicial'}
                </span>
              </div>
            </div>

          </div>

          {/* Middle row */}
          <div className="dash-mid-row">

            {/* Bar chart */}
            <div className="dash-panel">
              <div className="dash-panel-head">
                <div>
                  <h3 className="dash-panel-title">Sub-proyectos por proyecto</h3>
                  <p className="dash-panel-sub">Distribución de zonas de despliegue</p>
                </div>
              </div>
              <div className="dash-chart-zone">
                {chartData.length === 0 ? (
                  <div className="dash-empty-state">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                      <path d="M18 20V10M12 20V4M6 20v-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    <span>Sin proyectos para graficar</span>
                  </div>
                ) : (
                  <div className="dash-bar-chart">
                    {chartData.map((d, i) => (
                      <div key={i} className="dash-bar-col">
                        <span className="dash-bar-val">{d.value > 0 ? d.value : ''}</span>
                        <div className="dash-bar-track">
                          <div className="dash-bar-fill" style={{ height: `${d.pct}%` }}></div>
                        </div>
                        <span className="dash-bar-name">{d.name}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Status & type breakdown */}
            <div className="dash-panel">
              <div className="dash-panel-head">
                <div>
                  <h3 className="dash-panel-title">Estado de infraestructura</h3>
                  <p className="dash-panel-sub">Distribución operativa de elementos</p>
                </div>
              </div>

              <div className="dash-status-rows">
                {[
                  { label: 'Activos',        value: stats.activeElements,      cls: 'green',  icon: '●' },
                  { label: 'Planificados',   value: stats.plannedElements,     cls: 'blue',   icon: '◎' },
                  { label: 'Mantenimiento',  value: stats.maintenanceElements, cls: 'amber',  icon: '▲' },
                  { label: 'Dañados',        value: stats.damagedElements,     cls: 'red',    icon: '✕' },
                ].map(row => (
                  <div key={row.label} className="dash-status-row">
                    <div className="dash-status-left">
                      <span className={`dash-status-icon s-${row.cls}`}>{row.icon}</span>
                      <span className="dash-status-label">{row.label}</span>
                    </div>
                    <div className="dash-status-right">
                      <div className="dash-status-track">
                        <div
                          className={`dash-status-fill sf-${row.cls}`}
                          style={{ width: stats.totalElements > 0 ? `${(row.value / stats.totalElements) * 100}%` : '0%' }}
                        ></div>
                      </div>
                      <span className="dash-status-count">{row.value}</span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="dash-type-divider"></div>

              <div className="dash-type-row">
                {[
                  { label: 'Nodos',    value: stats.nodeCount,   color: '#3b82f6' },
                  { label: 'Empalmes', value: stats.spliceCount, color: '#f97316' },
                  { label: 'NAP',      value: stats.napCount,    color: '#10b981' },
                  { label: 'Fibras',   value: stats.fiberCount,  color: '#ef4444' },
                ].map(t => (
                  <div key={t.label} className="dash-type-chip">
                    <span className="dash-type-dot" style={{ background: t.color }}></span>
                    <span className="dash-type-name">{t.label}</span>
                    <span className="dash-type-num">{t.value}</span>
                  </div>
                ))}
              </div>
            </div>

          </div>

          {/* Projects table */}
          <div className="dash-panel dash-panel-full">
            <div className="dash-panel-head">
              <div>
                <h3 className="dash-panel-title">Proyectos registrados</h3>
                <p className="dash-panel-sub">
                  {searchQuery
                    ? `${filteredProjects.length} resultado(s) para "${searchQuery}"`
                    : `${projects.length} proyecto(s) en total`}
                </p>
              </div>
              <button className="dash-primary-btn" onClick={onCreateProject}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                  <line x1="12" y1="5" x2="12" y2="19" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
                  <line x1="5" y1="12" x2="19" y2="12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
                </svg>
                Nuevo
              </button>
            </div>

            {recentProjects.length === 0 ? (
              <div className="dash-empty-state dash-empty-lg">
                <svg width="44" height="44" viewBox="0 0 24 24" fill="none">
                  <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
                  <path d="M9 12h6M12 9v6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                </svg>
                <span>{searchQuery ? 'Sin resultados para la búsqueda.' : 'No hay proyectos aún.'}</span>
                {!searchQuery && (
                  <button className="dash-primary-btn" onClick={onCreateProject}>
                    Crear primer proyecto
                  </button>
                )}
              </div>
            ) : (
              <div className="dash-table-scroll">
                <table className="dash-table">
                  <thead>
                    <tr>
                      <th>Proyecto</th>
                      <th>Descripción</th>
                      <th>Zonas</th>
                      <th>Elementos</th>
                      <th>Actualización</th>
                      <th>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentProjects.map(p => {
                      const totalEl = p.subProjects.reduce((s, sp) => s + sp.features.length, 0)
                      const activeEl = p.subProjects.reduce((s, sp) =>
                        s + sp.features.filter(f => f.properties.status === 'active').length, 0)
                      const upd = new Date(p.updatedAt)
                      const daysAgo = Math.floor((Date.now() - upd.getTime()) / 86_400_000)
                      const dateLabel = daysAgo === 0 ? 'Hoy' : daysAgo === 1 ? 'Ayer' : `Hace ${daysAgo}d`
                      return (
                        <tr key={p.id} className="dash-tr" onClick={() => onOpenProject(p.id)}>
                          <td>
                            <div className="dash-td-name">
                              <div className="dash-td-icon">
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
                                  <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round"/>
                                </svg>
                              </div>
                              <span className="dash-td-text">{p.name}</span>
                            </div>
                          </td>
                          <td className="dash-td-desc">
                            {p.description
                              ? <span>{p.description.length > 45 ? p.description.slice(0, 44) + '…' : p.description}</span>
                              : <span className="dash-td-empty">—</span>}
                          </td>
                          <td>
                            <span className="dash-pill pill-blue">{p.subProjects.length}</span>
                          </td>
                          <td>
                            <div className="dash-td-elements">
                              <span className="dash-pill pill-gray">{totalEl}</span>
                              {activeEl > 0 && (
                                <span className="dash-pill pill-green">{activeEl} act.</span>
                              )}
                            </div>
                          </td>
                          <td>
                            <div className="dash-td-date">
                              <span className="dash-date-primary">{dateLabel}</span>
                              <span className="dash-date-secondary">{upd.toLocaleDateString('es-AR')}</span>
                            </div>
                          </td>
                          <td>
                            <div className="dash-td-actions" onClick={e => e.stopPropagation()}>
                              <button className="dash-act-open" onClick={() => onOpenProject(p.id)}>
                                Abrir
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
                                  <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                              </button>
                              <button className="dash-act-del" onClick={e => handleDelete(p.id, e)} title="Eliminar proyecto">
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                                  <polyline points="3,6 5,6 21,6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                                  <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6M10 11v6M14 11v6M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Traffic panel */}
          {zabbixConfig && (
            <DashTraffic projects={projects} zabbixConfig={zabbixConfig} />
          )}

        </main>
      </div>

      {/* ── Confirm delete modal ─────────────────────────────────────────────── */}
      {confirmDelete && (
        <div className="dash-modal-backdrop" onClick={() => setConfirmDelete(null)}>
          <div className="dash-modal" onClick={e => e.stopPropagation()}>
            <div className="dash-modal-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
                <line x1="12" y1="9" x2="12" y2="13" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                <line x1="12" y1="17" x2="12.01" y2="17" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </div>
            <h3 className="dash-modal-title">Confirmar eliminación</h3>
            <p className="dash-modal-body">
              Esta acción eliminará el proyecto y todos sus sub-proyectos permanentemente. No puede deshacerse.
            </p>
            <div className="dash-modal-actions">
              <button className="dash-modal-cancel" onClick={() => setConfirmDelete(null)}>Cancelar</button>
              <button className="dash-modal-confirm" onClick={confirmDeleteAction}>Eliminar proyecto</button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
