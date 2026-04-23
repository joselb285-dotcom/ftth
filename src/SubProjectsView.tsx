import { useMemo, useState } from 'react'
import type { Project, SubProject, AppFeature } from './types'

type PowerAlarm = {
  fiberId: string
  clientName: string
  powerDbm: number
  featureId: string
  featureName: string
  severity: 'warn' | 'crit'
}

interface SubProjectsViewProps {
  project: Project
  onBack: () => void
  onOpenSubProject: (id: string) => void
  onCreateSubProject: () => void
  onDeleteSubProject: (id: string) => void
  collectPowerAlarms: (feats: AppFeature[]) => PowerAlarm[]
  onTraceAlarm?: (fiberId: string, subProjectId: string) => void
}

type SubProjectStatus = 'ok' | 'warn' | 'crit' | 'idle'
type FilterKey = 'all' | 'ok' | 'incidents' | 'nodata' | 'noolt'
type ViewMode = 'grid' | 'list'

interface SubProjectStats {
  sp: SubProject
  totalElements: number
  nodeCount: number
  spliceCount: number
  napCount: number
  fiberCount: number
  activeCount: number
  plannedCount: number
  maintenanceCount: number
  damagedCount: number
  healthPct: number
  kmFibra: number
  oltCount: number
  alarms: PowerAlarm[]
  critCount: number
  warnCount: number
  status: SubProjectStatus
  updatedAt: Date
}

function haversineKm(a: [number, number], b: [number, number]): number {
  const R = 6371
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b[0] - a[0])
  const dLon = toRad(b[1] - a[1])
  const lat1 = toRad(a[0])
  const lat2 = toRad(b[0])
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2)
  return 2 * R * Math.asin(Math.sqrt(h))
}

function fiberLengthKm(feats: AppFeature[]): number {
  let total = 0
  for (const f of feats) {
    if (f.properties.featureType !== 'fiber_line') continue
    const geom = f.geometry
    if (!geom) continue
    const coords = geom.type === 'LineString'
      ? [geom.coordinates as number[][]]
      : geom.type === 'MultiLineString'
        ? (geom.coordinates as number[][][])
        : null
    if (!coords) continue
    for (const line of coords) {
      for (let i = 1; i < line.length; i++) {
        const [x1, y1] = line[i - 1]
        const [x2, y2] = line[i]
        total += haversineKm([y1, x1], [y2, x2])
      }
    }
  }
  return total
}

function computeStats(sp: SubProject, collectPowerAlarms: (f: AppFeature[]) => PowerAlarm[]): SubProjectStats {
  const feats = sp.features
  const nodeCount = feats.filter(f => f.properties.featureType === 'node').length
  const spliceCount = feats.filter(f => f.properties.featureType === 'splice_box').length
  const napCount = feats.filter(f => f.properties.featureType === 'nap').length
  const fiberCount = feats.filter(f => f.properties.featureType === 'fiber_line').length
  const activeCount = feats.filter(f => f.properties.status === 'active').length
  const plannedCount = feats.filter(f => f.properties.status === 'planned').length
  const maintenanceCount = feats.filter(f => f.properties.status === 'maintenance').length
  const damagedCount = feats.filter(f => f.properties.status === 'damaged').length
  const totalElements = feats.length
  const healthPct = totalElements > 0 ? Math.round((activeCount / totalElements) * 100) : 0
  const kmFibra = fiberLengthKm(feats)
  const oltCount = sp.zabbixOltHosts?.length ?? 0
  const alarms = collectPowerAlarms(feats)
  const critCount = alarms.filter(a => a.severity === 'crit').length
  const warnCount = alarms.filter(a => a.severity === 'warn').length
  let status: SubProjectStatus = 'idle'
  if (totalElements === 0) status = 'idle'
  else if (critCount > 0 || damagedCount > 0) status = 'crit'
  else if (warnCount > 0 || maintenanceCount > 0) status = 'warn'
  else if (activeCount > 0) status = 'ok'
  else status = 'idle'
  return {
    sp, totalElements, nodeCount, spliceCount, napCount, fiberCount,
    activeCount, plannedCount, maintenanceCount, damagedCount,
    healthPct, kmFibra, oltCount, alarms, critCount, warnCount,
    status, updatedAt: new Date(sp.updatedAt),
  }
}

function relativeTime(date: Date): string {
  const diffMs = Date.now() - date.getTime()
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return 'Ahora'
  if (mins < 60) return `Hace ${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `Hace ${hours}h`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'Ayer'
  if (days < 7) return `Hace ${days}d`
  return date.toLocaleDateString('es-AR')
}

const statusLabel: Record<SubProjectStatus, string> = {
  ok: 'Operativo',
  warn: 'Mantenimiento',
  crit: 'Con incidencias',
  idle: 'Sin datos',
}

function CardMiniMap({ stats }: { stats: SubProjectStats }) {
  // Posiciones deterministas basadas en el id del subproyecto
  const seed = Array.from(stats.sp.id).reduce((a, c) => a + c.charCodeAt(0), 0)
  const rand = (n: number) => {
    const x = Math.sin(seed + n) * 10000
    return x - Math.floor(x)
  }
  const markers: Array<{ cls: string; left: number; top: number; danger?: boolean }> = []
  const maxN = Math.min(stats.nodeCount, 3)
  for (let i = 0; i < maxN; i++) {
    markers.push({ cls: 'm-node', left: 10 + rand(i * 3 + 1) * 70, top: 20 + rand(i * 3 + 2) * 55 })
  }
  const maxS = Math.min(stats.spliceCount, 2)
  for (let i = 0; i < maxS; i++) {
    markers.push({ cls: 'm-splice', left: 15 + rand(i * 5 + 7) * 65, top: 20 + rand(i * 5 + 8) * 55 })
  }
  const maxP = Math.min(stats.napCount, 3)
  for (let i = 0; i < maxP; i++) {
    const danger = stats.status === 'crit' && i === 0
    markers.push({ cls: 'm-nap', left: 15 + rand(i * 7 + 11) * 65, top: 25 + rand(i * 7 + 12) * 50, danger })
  }
  const fiberStyles: React.CSSProperties[] = []
  const maxF = Math.min(stats.fiberCount, 3)
  for (let i = 0; i < maxF; i++) {
    fiberStyles.push({
      left: `${10 + rand(i * 11 + 21) * 20}%`,
      top: `${30 + rand(i * 11 + 22) * 40}%`,
      width: `${40 + rand(i * 11 + 23) * 35}%`,
      transform: `rotate(${(rand(i * 11 + 24) * 40) - 20}deg)`,
      background: stats.status === 'crit' ? 'rgba(239,68,68,0.85)' : undefined,
      boxShadow: stats.status === 'crit' ? '0 0 6px rgba(239,68,68,.6)' : undefined,
    })
  }
  return (
    <>
      <div className="sp-card-map-grid"></div>
      {fiberStyles.map((st, i) => (
        <div key={`f${i}`} className="sp-card-fiber" style={st}></div>
      ))}
      {markers.map((m, i) => (
        <div key={`m${i}`}
          className={`sp-card-marker ${m.cls}`}
          style={{
            left: `${m.left}%`,
            top: `${m.top}%`,
            ...(m.danger ? { background: '#ef4444', color: '#ef4444' } : {}),
          }}
        ></div>
      ))}
    </>
  )
}

export default function SubProjectsView({
  project, onBack, onOpenSubProject, onCreateSubProject, onDeleteSubProject,
  collectPowerAlarms, onTraceAlarm,
}: SubProjectsViewProps) {
  const [activeFilter, setActiveFilter] = useState<FilterKey>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [sortMode, setSortMode] = useState<'recent' | 'name' | 'elements'>('recent')
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  const allStats = useMemo(
    () => project.subProjects.map(sp => computeStats(sp, collectPowerAlarms)),
    [project.subProjects, collectPowerAlarms]
  )

  const counts = useMemo(() => ({
    all: allStats.length,
    ok: allStats.filter(s => s.status === 'ok').length,
    incidents: allStats.filter(s => s.status === 'crit' || s.status === 'warn').length,
    nodata: allStats.filter(s => s.status === 'idle').length,
    noolt: allStats.filter(s => s.oltCount === 0).length,
  }), [allStats])

  const totals = useMemo(() => {
    const totalElements = allStats.reduce((s, a) => s + a.totalElements, 0)
    const activeElements = allStats.reduce((s, a) => s + a.activeCount, 0)
    const totalIncidents = allStats.reduce((s, a) => s + a.critCount + a.warnCount + a.damagedCount, 0)
    const incidentZones = allStats.filter(a => a.critCount + a.warnCount + a.damagedCount > 0).length
    const oltSet = new Set<string>()
    allStats.forEach(a => (a.sp.zabbixOltHosts ?? []).forEach(h => oltSet.add(h)))
    const kmFibra = allStats.reduce((s, a) => s + a.kmFibra, 0)
    const activePct = totalElements > 0 ? Math.round((activeElements / totalElements) * 100) : 0
    return {
      totalElements, activeElements, activePct, totalIncidents, incidentZones,
      oltCount: oltSet.size, kmFibra,
    }
  }, [allStats])

  const filtered = useMemo(() => {
    let list = allStats
    if (activeFilter === 'ok') list = list.filter(s => s.status === 'ok')
    else if (activeFilter === 'incidents') list = list.filter(s => s.status === 'crit' || s.status === 'warn')
    else if (activeFilter === 'nodata') list = list.filter(s => s.status === 'idle')
    else if (activeFilter === 'noolt') list = list.filter(s => s.oltCount === 0)
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      list = list.filter(s =>
        s.sp.name.toLowerCase().includes(q) ||
        (s.sp.description?.toLowerCase().includes(q) ?? false) ||
        (s.sp.location?.displayName.toLowerCase().includes(q) ?? false)
      )
    }
    const arr = [...list]
    if (sortMode === 'recent') arr.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
    else if (sortMode === 'name') arr.sort((a, b) => a.sp.name.localeCompare(b.sp.name))
    else if (sortMode === 'elements') arr.sort((a, b) => b.totalElements - a.totalElements)
    return arr
  }, [allStats, activeFilter, searchQuery, sortMode])

  const lastUpdated = useMemo(() => {
    if (allStats.length === 0) return null
    const max = allStats.reduce((m, s) => Math.max(m, s.updatedAt.getTime()), 0)
    return new Date(max)
  }, [allStats])

  function confirmDeleteAction() {
    if (confirmDelete) {
      onDeleteSubProject(confirmDelete)
      setConfirmDelete(null)
    }
  }

  return (
    <div className="sp-screen">

      {/* ── Topbar ─────────────────────────────────────────────────────────── */}
      <div className="sp-topbar">
        <div>
          <div className="sp-crumbs">
            <a onClick={onBack}>Proyectos</a>
            <svg className="sp-sep" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6"/></svg>
            <span className="sp-current">{project.name}</span>
          </div>
          <h1 className="sp-title">
            {project.name}
            <span className="sp-title-badge">
              {project.subProjects.length} sub-proyecto{project.subProjects.length !== 1 ? 's' : ''}
            </span>
          </h1>
          <p className="sp-subtitle">
            {project.description || 'Sin descripción'}
            {lastUpdated && (
              <> · Actualizado {relativeTime(lastUpdated).toLowerCase()}</>
            )}
          </p>
        </div>
        <div className="sp-actions">
          <button className="sp-btn sp-btn-secondary" onClick={onBack} title="Volver a proyectos">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
            Proyectos
          </button>
          <button className="sp-btn sp-btn-primary" onClick={onCreateSubProject} title="Crear nuevo sub-proyecto">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Nuevo sub-proyecto
          </button>
        </div>
      </div>

      {/* ── KPI strip ──────────────────────────────────────────────────────── */}
      <div className="sp-kpi-strip">
        <div className="sp-kpi" style={{ ['--kpi-accent' as any]: '#3b82f6' }}>
          <div className="sp-kpi-label">Elementos totales</div>
          <div className="sp-kpi-value">{totals.totalElements.toLocaleString('es-AR')}</div>
          <div className="sp-kpi-foot">en {project.subProjects.length} zona{project.subProjects.length !== 1 ? 's' : ''}</div>
        </div>
        <div className="sp-kpi" style={{ ['--kpi-accent' as any]: '#10b981' }}>
          <div className="sp-kpi-label">Operativos</div>
          <div className="sp-kpi-value">{totals.activePct}<span style={{ fontSize: '.8em', color: 'var(--text-muted)' }}>%</span></div>
          <div className="sp-kpi-foot">{totals.activeElements.toLocaleString('es-AR')} activos</div>
        </div>
        <div className="sp-kpi" style={{ ['--kpi-accent' as any]: '#ef4444' }}>
          <div className="sp-kpi-label">Con incidencias</div>
          <div className="sp-kpi-value">{totals.totalIncidents}</div>
          <div className="sp-kpi-foot">
            {totals.incidentZones > 0
              ? `en ${totals.incidentZones} sub-proyecto${totals.incidentZones !== 1 ? 's' : ''}`
              : 'sin alertas'}
          </div>
        </div>
        <div className="sp-kpi" style={{ ['--kpi-accent' as any]: '#06b6d4' }}>
          <div className="sp-kpi-label">OLTs monitoreadas</div>
          <div className="sp-kpi-value">{totals.oltCount}</div>
          <div className="sp-kpi-foot">{totals.oltCount > 0 ? 'Zabbix conectado' : 'Sin OLTs'}</div>
        </div>
        <div className="sp-kpi" style={{ ['--kpi-accent' as any]: '#f59e0b' }}>
          <div className="sp-kpi-label">Km de fibra</div>
          <div className="sp-kpi-value">
            {totals.kmFibra >= 10
              ? totals.kmFibra.toFixed(1).replace('.', ',')
              : totals.kmFibra.toFixed(2).replace('.', ',')}
          </div>
          <div className="sp-kpi-foot">polilínea total</div>
        </div>
      </div>

      {/* ── Toolbar ────────────────────────────────────────────────────────── */}
      <div className="sp-toolbar">
        <div className="sp-filters" role="tablist">
          {([
            { key: 'all' as FilterKey, label: 'Todos', count: counts.all },
            { key: 'ok' as FilterKey, label: 'Operativos', count: counts.ok },
            { key: 'incidents' as FilterKey, label: 'Con incidencias', count: counts.incidents },
            { key: 'nodata' as FilterKey, label: 'Sin datos', count: counts.nodata },
            { key: 'noolt' as FilterKey, label: 'Sin OLT', count: counts.noolt },
          ]).map(f => (
            <button
              key={f.key}
              className={`sp-chip${activeFilter === f.key ? ' active' : ''}`}
              role="tab"
              onClick={() => setActiveFilter(f.key)}
            >
              {f.label}
              {f.count > 0 && <span className="sp-chip-count">{f.count}</span>}
            </button>
          ))}
        </div>
        <div className="sp-toolbar-right">
          <div className="sp-search">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input
              placeholder="Buscar por nombre o ubicación…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="sp-view-toggle">
            <button
              className={viewMode === 'grid' ? 'active' : ''}
              title="Vista tarjetas"
              onClick={() => setViewMode('grid')}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
            </button>
            <button
              className={viewMode === 'list' ? 'active' : ''}
              title="Vista tabla"
              onClick={() => setViewMode('list')}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
            </button>
          </div>
          <select
            className="sp-sort"
            value={sortMode}
            onChange={e => setSortMode(e.target.value as 'recent' | 'name' | 'elements')}
            title="Ordenar"
          >
            <option value="recent">Más reciente</option>
            <option value="name">Alfabético</option>
            <option value="elements">Más elementos</option>
          </select>
        </div>
      </div>

      {/* ── Contenido ─────────────────────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <div className="sp-empty">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/>
            <path d="M9 12h6M12 9v6"/>
          </svg>
          <h3>
            {allStats.length === 0
              ? 'Sin sub-proyectos'
              : searchQuery
                ? 'Sin resultados'
                : 'Sin coincidencias'}
          </h3>
          <p>
            {allStats.length === 0
              ? 'Creá un sub-proyecto para comenzar a mapear tu red.'
              : searchQuery
                ? `No hay sub-proyectos que coincidan con "${searchQuery}".`
                : 'Probá con otro filtro.'}
          </p>
          {allStats.length === 0 && (
            <button className="sp-btn sp-btn-primary" onClick={onCreateSubProject}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Crear primer sub-proyecto
            </button>
          )}
        </div>
      ) : viewMode === 'grid' ? (
        <div className="sp-grid">
          {filtered.map(stats => {
            const sp = stats.sp
            const healthText = stats.totalElements === 0 ? '—' : `${stats.healthPct}%`
            const healthColor =
              stats.status === 'crit' ? '#fca5a5' :
              stats.status === 'warn' ? '#fcd34d' :
              stats.totalElements === 0 ? 'var(--text-muted)' : undefined
            const segs = [
              { cls: 'seg-active', count: stats.activeCount },
              { cls: 'seg-planned', count: stats.plannedCount },
              { cls: 'seg-maint', count: stats.maintenanceCount },
              { cls: 'seg-damaged', count: stats.damagedCount },
            ].filter(s => s.count > 0)
            const segTotal = segs.reduce((s, x) => s + x.count, 0) || 1
            const statusBadgeLabel =
              stats.status === 'crit' && stats.critCount + stats.damagedCount > 0
                ? `${stats.critCount + stats.damagedCount} incidencia${stats.critCount + stats.damagedCount !== 1 ? 's' : ''}`
                : stats.status === 'warn' && stats.warnCount + stats.maintenanceCount > 0
                  ? `${stats.warnCount + stats.maintenanceCount} en mant.`
                  : statusLabel[stats.status]
            const primaryAlarm = stats.alarms[0]
            return (
              <article
                key={sp.id}
                className="sp-card"
                tabIndex={0}
                onClick={() => onOpenSubProject(sp.id)}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onOpenSubProject(sp.id)
                  }
                }}
              >
                <div className="sp-card-header">
                  <CardMiniMap stats={stats} />
                  <div className={`sp-card-olt${stats.oltCount === 0 ? ' sp-card-olt-empty' : ''}`}
                       title={stats.oltCount === 0 ? 'Sin OLT asignada' : `${stats.oltCount} OLT(s) monitoreadas`}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
                    {stats.oltCount === 0 ? 'Sin OLT' : `${stats.oltCount} OLT`}
                  </div>
                  <div className={`sp-card-status-badge status-${stats.status}`}>
                    {statusBadgeLabel}
                  </div>
                </div>

                <div className="sp-card-body">
                  <h3 className="sp-card-name" title={sp.name}>{sp.name}</h3>
                  {sp.location && (
                    <p className="sp-card-location">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
                      {sp.location.displayName.split(',').slice(0, 2).join(',')}
                    </p>
                  )}
                  {sp.description && (
                    <p className="sp-card-desc">{sp.description}</p>
                  )}

                  <div className="sp-card-metrics">
                    <div className="sp-metric">
                      <span className="sp-metric-label">Elementos</span>
                      <span className="sp-metric-value">
                        {stats.totalElements}
                        {stats.status === 'idle' && stats.plannedCount > 0 && <small>planif.</small>}
                      </span>
                    </div>
                    <div className="sp-metric">
                      <span className="sp-metric-label">Km fibra</span>
                      <span className="sp-metric-value">
                        {stats.kmFibra >= 10
                          ? stats.kmFibra.toFixed(1).replace('.', ',')
                          : stats.kmFibra.toFixed(2).replace('.', ',')}
                        <small>km</small>
                      </span>
                    </div>
                  </div>

                  <div className="sp-type-chips">
                    <span className="sp-type-chip chip-node"><span className="sp-dot"></span>{stats.nodeCount}</span>
                    <span className="sp-type-chip chip-splice"><span className="sp-dot"></span>{stats.spliceCount}</span>
                    <span className="sp-type-chip chip-nap"><span className="sp-dot"></span>{stats.napCount}</span>
                    <span className="sp-type-chip chip-fiber"><span className="sp-dot"></span>{stats.fiberCount}</span>
                  </div>

                  <div className="sp-health">
                    <div className="sp-health-row">
                      <span>Salud</span>
                      <b style={healthColor ? { color: healthColor } : undefined}>{healthText}</b>
                    </div>
                    <div className="sp-health-bar">
                      {segs.length > 0 ? (
                        segs.map((s, i) => (
                          <div
                            key={i}
                            className={`sp-health-seg ${s.cls}`}
                            style={{ width: `${(s.count / segTotal) * 100}%` }}
                          ></div>
                        ))
                      ) : (
                        <div className="sp-health-seg seg-planned" style={{ width: '100%' }}></div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="sp-card-footer">
                  {stats.status === 'crit' && primaryAlarm ? (
                    <button
                      className="sp-card-updated sp-card-alert-btn"
                      onClick={e => {
                        e.stopPropagation()
                        onTraceAlarm?.(primaryAlarm.fiberId, sp.id)
                      }}
                      title={`Trazar camino óptico — ${primaryAlarm.clientName}`}
                    >
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                      Alerta: {primaryAlarm.clientName}
                    </button>
                  ) : (
                    <span className="sp-card-updated">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                      Actualizado {relativeTime(stats.updatedAt).toLowerCase()}
                    </span>
                  )}
                  <div className="sp-card-quickactions" onClick={e => e.stopPropagation()}>
                    <button className="sp-qa-btn" title="Abrir editor" onClick={() => onOpenSubProject(sp.id)}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 17l10-10M17 17V7H7"/></svg>
                    </button>
                    <button className="sp-qa-btn sp-qa-btn-danger" title="Eliminar sub-proyecto"
                            onClick={() => setConfirmDelete(sp.id)}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>
                    </button>
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      ) : (
        /* ── List view ──────────────────────────────────────────────────── */
        <div className="sp-list">
          <table>
            <thead>
              <tr>
                <th>Sub-proyecto</th>
                <th>Ubicación</th>
                <th>Estado</th>
                <th>Elementos</th>
                <th>Salud</th>
                <th>OLTs</th>
                <th>Actualizado</th>
                <th style={{ width: 90 }}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(stats => {
                const sp = stats.sp
                const segs = [
                  { cls: 'seg-active', count: stats.activeCount },
                  { cls: 'seg-planned', count: stats.plannedCount },
                  { cls: 'seg-maint', count: stats.maintenanceCount },
                  { cls: 'seg-damaged', count: stats.damagedCount },
                ].filter(s => s.count > 0)
                const segTotal = segs.reduce((s, x) => s + x.count, 0) || 1
                const statusBadgeLabel =
                  stats.status === 'crit' && stats.critCount + stats.damagedCount > 0
                    ? `${stats.critCount + stats.damagedCount} incidencia${stats.critCount + stats.damagedCount !== 1 ? 's' : ''}`
                    : stats.status === 'warn' && stats.warnCount + stats.maintenanceCount > 0
                      ? `${stats.warnCount + stats.maintenanceCount} en mant.`
                      : statusLabel[stats.status]
                return (
                  <tr
                    key={sp.id}
                    className="row-clickable"
                    onClick={() => onOpenSubProject(sp.id)}
                  >
                    <td>
                      <div className="sp-list-name">
                        {sp.name}
                        {sp.description && <small>{sp.description.length > 60 ? sp.description.slice(0, 59) + '…' : sp.description}</small>}
                      </div>
                    </td>
                    <td>
                      {sp.location ? (
                        <span className="sp-list-loc">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
                          {sp.location.displayName.split(',').slice(0, 2).join(',')}
                        </span>
                      ) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                    </td>
                    <td>
                      <span className={`sp-card-status-badge status-${stats.status}`} style={{ position: 'static' }}>
                        {statusBadgeLabel}
                      </span>
                    </td>
                    <td>{stats.totalElements}</td>
                    <td>
                      <div className="sp-list-health">
                        <div className="sp-health-bar">
                          {segs.length > 0 ? segs.map((s, i) => (
                            <div key={i} className={`sp-health-seg ${s.cls}`}
                                 style={{ width: `${(s.count / segTotal) * 100}%` }}></div>
                          )) : <div className="sp-health-seg seg-planned" style={{ width: '100%' }}></div>}
                        </div>
                        <span>{stats.totalElements === 0 ? '—' : `${stats.healthPct}%`}</span>
                      </div>
                    </td>
                    <td>{stats.oltCount > 0 ? stats.oltCount : <span style={{ color: 'var(--text-muted)' }}>—</span>}</td>
                    <td>{relativeTime(stats.updatedAt)}</td>
                    <td onClick={e => e.stopPropagation()}>
                      <div className="sp-card-quickactions">
                        <button className="sp-qa-btn" title="Abrir editor" onClick={() => onOpenSubProject(sp.id)}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 17l10-10M17 17V7H7"/></svg>
                        </button>
                        <button className="sp-qa-btn sp-qa-btn-danger" title="Eliminar"
                                onClick={() => setConfirmDelete(sp.id)}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>
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

      {/* ── Confirm delete modal ────────────────────────────────────────── */}
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
            <h3 className="dash-modal-title">Eliminar sub-proyecto</h3>
            <p className="dash-modal-body">
              Esta acción eliminará el sub-proyecto y todos sus elementos permanentemente. No puede deshacerse.
            </p>
            <div className="dash-modal-actions">
              <button className="dash-modal-cancel" onClick={() => setConfirmDelete(null)}>Cancelar</button>
              <button className="dash-modal-confirm" onClick={confirmDeleteAction}>Eliminar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
