import type { OpticalPath, PathHop } from './OpticalPath'

const FIBER_HEX: Record<string, string> = {
  blue: '#2979ff', orange: '#ff6d00', green: '#00c853',
  brown: '#8d6e63', slate: '#90a4ae', white: '#bdbdbd',
  red: '#f44336', black: '#757575', yellow: '#ffd600',
  violet: '#ab47bc', rose: '#f06292', aqua: '#00e5ff',
}

const TYPE_ICON: Record<string, string> = {
  node:       '🖥',
  splice_box: '📦',
  nap:        '🔌',
  fiber_line: '〰',
}

interface Props {
  path: OpticalPath
  onClose: () => void
}

export default function OpticalPathPanel({ path, onClose }: Props) {
  const reversedHops = [...path.hops].reverse()  // node first → client last

  return (
    <div className="optical-path-panel">
      <div className="op-header">
        <div className="op-title">
          <span className="op-icon">📍</span>
          <div>
            <strong>Trazado óptico</strong>
            {path.clientName && <span className="op-client-name"> — {path.clientName}</span>}
          </div>
        </div>
        <button className="op-close" onClick={onClose}>✕</button>
      </div>

      {!path.found && path.error && (
        <div className="op-error">
          <span>⚠️</span> {path.error}
        </div>
      )}

      <div className="op-hops">
        {reversedHops.map((hop, i) => (
          <HopRow key={hop.featureId} hop={hop} index={i} total={reversedHops.length} />
        ))}
      </div>

      <div className="op-footer">
        {path.hops.length} nodo(s) · {path.found ? '✅ Camino completo' : '⚠️ Camino incompleto'}
      </div>
    </div>
  )
}

function HopRow({ hop, index, total }: { hop: PathHop; index: number; total: number }) {
  const isFirst = index === 0
  const isLast  = index === total - 1
  const isNode  = hop.featureType === 'node'

  // For display: when reversed, outCable is "coming from" the previous feature (node side)
  // inCable is "going to" the next feature (client side)
  // We show the outCable fiber as the one traversing toward us
  const fiberIn  = hop.outCable  // cable arriving FROM node direction
  const fiberOut = hop.inCable   // cable going TO client direction

  return (
    <div className={`op-hop ${isNode ? 'op-hop-node' : ''} ${isFirst ? 'op-hop-first' : ''} ${isLast ? 'op-hop-last' : ''}`}>
      {/* Vertical connector line above */}
      {!isFirst && <div className="op-connector" />}

      <div className="op-hop-content">
        <div className="op-hop-icon">{TYPE_ICON[hop.featureType] ?? '●'}</div>
        <div className="op-hop-info">
          <div className="op-hop-name">{hop.featureName}</div>
          <div className="op-hop-type">{friendlyType(hop.featureType)}</div>

          {hop.splitterName && (
            <div className="op-splitter-badge">
              🔀 Splitter: {hop.splitterName}
            </div>
          )}

          {(fiberIn || fiberOut) && (
            <div className="op-fibers">
              {fiberIn && (
                <FiberChip label="Entrada" cable={fiberIn} />
              )}
              {fiberIn && fiberOut && <span className="op-fiber-arrow">→</span>}
              {fiberOut && (
                <FiberChip label="Salida" cable={fiberOut} />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function FiberChip({ label, cable }: {
  label: string
  cable: { name: string; fiberIndex: number; fiberColor: string }
}) {
  const color = FIBER_HEX[cable.fiberColor] ?? '#888'
  return (
    <div className="op-fiber-chip">
      <span className="op-fiber-dot" style={{ background: color }} />
      <span className="op-fiber-label">{label}</span>
      <span className="op-fiber-cable">{cable.name}</span>
      <span className="op-fiber-idx">F{cable.fiberIndex}</span>
    </div>
  )
}

function friendlyType(t: string) {
  return { node: 'Nodo / OLT', splice_box: 'Caja de empalme', nap: 'Caja NAP', fiber_line: 'Línea de fibra' }[t] ?? t
}
