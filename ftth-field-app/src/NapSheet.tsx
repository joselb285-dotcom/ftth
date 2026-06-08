import { useState } from 'react'
import type { AppFeature, NapClient } from './types'
import { FIBER_COLORS } from './fiberColors'

const powerLabel: Record<NapClient['powerStatus'], { label: string; cls: string }> = {
  ok:      { label: 'OK',         cls: 'pwr-ok' },
  warn:    { label: 'Bajo',       cls: 'pwr-warn' },
  crit:    { label: 'Crítico',    cls: 'pwr-crit' },
  unknown: { label: 'Sin dato',   cls: 'pwr-unknown' },
}

const statusLabels: Record<string, string> = {
  planned: 'Planificado', active: 'Activo',
  maintenance: 'Mantenimiento', damaged: 'Dañado'
}

function ClientRow({ client, onTrace }: { client: NapClient; onTrace: (fiberId: string) => void }) {
  const [expanded, setExpanded] = useState(false)
  const info = client.clientInfo
  const pwr = powerLabel[client.powerStatus]

  return (
    <div className={`client-row ${expanded ? 'expanded' : ''}`}>
      <button className="client-row-header" onClick={() => setExpanded(v => !v)}>
        <span
          className="fiber-dot"
          style={{ background: FIBER_COLORS[client.fiberColor] ?? '#94a3b8' }}
        />
        <div className="client-row-info">
          <div className="client-name">{client.clientName || 'Sin nombre'}</div>
          {info.address && <div className="client-addr">{info.address}</div>}
        </div>
        <div className="client-row-right">
          <span className={`pwr-badge ${pwr.cls}`}>{pwr.label}</span>
          {info.onuPowerDbm && (
            <span className="pwr-dbm">{parseFloat(info.onuPowerDbm).toFixed(1)} dBm</span>
          )}
          <svg
            className={`expand-icon ${expanded ? 'open' : ''}`}
            width="14" height="14" viewBox="0 0 24 24"
            fill="none" stroke="currentColor" strokeWidth="2.5"
            strokeLinecap="round" strokeLinejoin="round"
          >
            <path d="M9 18l6-6-6-6"/>
          </svg>
        </div>
      </button>

      {expanded && (
        <div className="client-detail">
          {info.phone && (
            <a href={`tel:${info.phone}`} className="detail-row detail-link">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81a19.79 19.79 0 01-3.07-8.72A2 2 0 012 .99h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 8.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/>
              </svg>
              {info.phone}
            </a>
          )}
          {info.email && (
            <a href={`mailto:${info.email}`} className="detail-row detail-link">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                <polyline points="22,6 12,13 2,6"/>
              </svg>
              {info.email}
            </a>
          )}
          {info.onuModel && (
            <div className="detail-row">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="3" width="20" height="14" rx="2"/>
                <path d="M8 21h8M12 17v4"/>
              </svg>
              ONU: {info.onuModel}
            </div>
          )}
          {info.onuSerial && (
            <div className="detail-row">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0110 0v4"/>
              </svg>
              Serial: <span className="mono">{info.onuSerial}</span>
            </div>
          )}
          {info.oltHost && (
            <div className="detail-row">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
              </svg>
              OLT: <span className="mono">{info.oltHost}</span>
            </div>
          )}
          {info.onuPowerDbm && (
            <div className="detail-row">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
              </svg>
              Potencia óptica: <span className={`pwr-badge ${pwr.cls}`}>{parseFloat(info.onuPowerDbm).toFixed(2)} dBm</span>
            </div>
          )}
          {info.notes && (
            <div className="detail-row detail-notes">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
              </svg>
              {info.notes}
            </div>
          )}
          <div className="detail-row detail-fiber-idx">
            <span>Fibra #{client.fiberIndex}</span>
            <button className="btn-trace" onClick={() => onTrace(client.fiberId)}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="2"/>
                <path d="M4.93 4.93a10 10 0 000 14.14M19.07 4.93a10 10 0 010 14.14"/>
                <path d="M7.76 7.76a6 6 0 000 8.48M16.24 7.76a6 6 0 010 8.48"/>
              </svg>
              Trazar camino óptico
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function NapSheet({
  feature,
  clients,
  onClose,
  onTraceClient,
  onViewSpliceCard,
  initialSearch = '',
}: {
  feature: AppFeature
  clients: NapClient[]
  onClose: () => void
  onTraceClient: (fiberId: string) => void
  onViewSpliceCard: () => void
  initialSearch?: string
}) {
  const [search, setSearch] = useState(initialSearch)
  const props = feature.properties

  const filtered = search.trim()
    ? clients.filter(c =>
        c.clientName.toLowerCase().includes(search.toLowerCase()) ||
        c.clientInfo.address?.toLowerCase().includes(search.toLowerCase()) ||
        c.clientInfo.onuSerial?.toLowerCase().includes(search.toLowerCase())
      )
    : clients

  const critCount = clients.filter(c => c.powerStatus === 'crit').length
  const warnCount = clients.filter(c => c.powerStatus === 'warn').length

  return (
    <>
      {/* Backdrop */}
      <div className="sheet-backdrop" onClick={onClose} />

      {/* Sheet */}
      <div className="nap-sheet">
        {/* Handle */}
        <div className="sheet-handle" />

        {/* Header */}
        <div className="sheet-header">
          <div className="sheet-header-main">
            <div>
              <div className="sheet-title">{props.name}</div>
              {props.code && <div className="sheet-code">{props.code}</div>}
              <div className="sheet-meta">
                <span className={`status-pill st-${props.status}`}>{statusLabels[props.status] ?? props.status}</span>
                <span className="sheet-count">{clients.length} cliente{clients.length !== 1 ? 's' : ''}</span>
                {critCount > 0 && <span className="pwr-badge pwr-crit">{critCount} crítico{critCount !== 1 ? 's' : ''}</span>}
                {warnCount > 0 && <span className="pwr-badge pwr-warn">{warnCount} bajo{warnCount !== 1 ? 's' : ''}</span>}
              </div>
            </div>
            <button className="sheet-close" onClick={onClose}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
          {props.notes && <div className="sheet-notes">{props.notes}</div>}
        {feature.properties.spliceCard && (
          <button className="btn-splice-card" onClick={onViewSpliceCard}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/>
            </svg>
            Ver carta de empalme
          </button>
        )}
        </div>

        {/* Search */}
        {clients.length > 4 && (
          <div className="sheet-search">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/>
              <line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              type="search"
              placeholder="Buscar cliente, dirección, serial..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        )}

        {/* Client list */}
        <div className="sheet-body">
          {clients.length === 0 && (
            <div className="state-msg">Esta NAP no tiene clientes registrados.</div>
          )}
          {filtered.length === 0 && search && (
            <div className="state-msg">Sin resultados para "{search}".</div>
          )}
          {filtered.map(client => (
            <ClientRow
              key={client.fiberId}
              client={client}
              onTrace={fid => { onTraceClient(fid); onClose() }}
            />
          ))}
        </div>
      </div>
    </>
  )
}
