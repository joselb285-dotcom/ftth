import type { SubProject, NapClient } from './types'
import { extractNapClients } from './editorConstants'

type PowerStatus = NapClient['powerStatus']

const STATUS_META: Record<PowerStatus, { label: string; cls: string; barColor: string }> = {
  ok:      { label: 'OK',       cls: 'pwr-ok',      barColor: '#22c55e' },
  warn:    { label: 'Bajo',     cls: 'pwr-warn',     barColor: '#f59e0b' },
  crit:    { label: 'Crítico',  cls: 'pwr-crit',     barColor: '#ef4444' },
  unknown: { label: 'Sin dato', cls: 'pwr-unknown',  barColor: '#64748b' },
}

function computeStats(subProject: SubProject) {
  const napFeatures = subProject.features.filter(f => f.properties.featureType === 'nap')
  const allClients  = napFeatures.flatMap(f => extractNapClients(f))
  const byStatus: Record<PowerStatus, number> = { ok: 0, warn: 0, crit: 0, unknown: 0 }
  for (const c of allClients) byStatus[c.powerStatus]++
  const napCritical = napFeatures
    .map(f => ({ name: f.properties.name, critCount: extractNapClients(f).filter(c => c.powerStatus === 'crit').length }))
    .filter(n => n.critCount > 0)
    .sort((a, b) => b.critCount - a.critCount)
  return { napCount: napFeatures.length, clientCount: allClients.length, byStatus, napCritical }
}

export default function StatsSheet({ subProject, onClose }: { subProject: SubProject; onClose: () => void }) {
  const { napCount, clientCount, byStatus, napCritical } = computeStats(subProject)
  const total = clientCount || 1

  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="nap-sheet">
        <div className="sheet-handle" />
        <div className="sheet-header">
          <div className="sheet-header-main">
            <div>
              <div className="sheet-title">Estadísticas de red</div>
              <div className="sheet-meta" style={{ marginTop: 4 }}>
                <span className="sheet-count">{napCount} NAP{napCount !== 1 ? 's' : ''}</span>
                <span className="sheet-count">· {clientCount} cliente{clientCount !== 1 ? 's' : ''}</span>
              </div>
            </div>
            <button className="sheet-close" onClick={onClose}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        </div>
        <div className="sheet-body">
          <div className="stats-section-title">Potencia óptica</div>
          <div className="stats-bars">
            {(['ok', 'warn', 'crit', 'unknown'] as PowerStatus[]).map(status => {
              const count = byStatus[status]
              const meta  = STATUS_META[status]
              const pct   = Math.round((count / total) * 100)
              return (
                <div key={status} className="stats-bar-row">
                  <div className="stats-bar-label">
                    <span className={`pwr-badge ${meta.cls}`}>{meta.label}</span>
                    <span className="stats-bar-count">{count}</span>
                  </div>
                  <div className="stats-bar-track">
                    <div className="stats-bar-fill" style={{ width: `${pct}%`, background: meta.barColor }} />
                  </div>
                  <span className="stats-bar-pct">{clientCount > 0 ? `${pct}%` : '—'}</span>
                </div>
              )
            })}
          </div>
          {napCritical.length > 0 && (
            <>
              <div className="stats-section-title" style={{ marginTop: 20 }}>NAPs con clientes críticos</div>
              <div className="stats-nap-list">
                {napCritical.map(n => (
                  <div key={n.name} className="stats-nap-row">
                    <span className="stats-nap-name">{n.name}</span>
                    <span className="pwr-badge pwr-crit">{n.critCount} crítico{n.critCount !== 1 ? 's' : ''}</span>
                  </div>
                ))}
              </div>
            </>
          )}
          {napCritical.length === 0 && clientCount > 0 && (
            <div className="sheet-state-msg">Sin clientes en estado crítico.</div>
          )}
        </div>
      </div>
    </>
  )
}
