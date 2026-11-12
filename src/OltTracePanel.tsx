import type { DownstreamPath, DownstreamTrace, PathHop } from './OpticalPath'

const END_LABEL: Record<DownstreamPath['end'], { icon: string; text: string; cls: string }> = {
  client:    { icon: '✅', text: 'Cliente',            cls: 'ok' },
  equipment: { icon: '🖥', text: 'Equipo / nodo',      cls: 'ok' },
  free:      { icon: '⚪', text: 'Puerto libre',       cls: 'free' },
  open:      { icon: '⚠️', text: 'Fibra abierta',      cls: 'warn' },
  error:     { icon: '❌', text: 'Camino interrumpido', cls: 'err' },
}

const TYPE_ICON: Record<string, string> = { node: '🖥', subnode: '🗄', splice_box: '📦', nap: '🔌' }

const portNum = (name?: string) => name?.match(/P(\d+)$/)?.[1]

function HopText({ hop }: { hop: PathHop }) {
  const o = hop.odf
  const a = portNum(o?.inPort), b = portNum(o?.outPort)
  return (
    <span className="otp-hop">
      <b>{TYPE_ICON[hop.featureType] ?? '●'} {hop.featureName}</b>
      {o && (
        <span className="otp-odf">
          {' '}· {o.inPort}{o.outPort && <> {o.patch ? '⇢ patchcord ⇢' : '→'} {o.outPort}</>}
          {o.patch && a && b && (
            <em className={a === b ? 'same' : 'diff'}>{a === b ? ' (mismo puerto)' : ` (cambia de puerto P${a} → P${b})`}</em>
          )}
          {o.toFeatureName && <> ⇄ {o.toFeatureName} ({o.toPort})</>}
        </span>
      )}
      {hop.inCable && <span className="otp-fiber"> · entra {hop.inCable.name} F{hop.inCable.fiberIndex}</span>}
      {hop.splitterName && <span className="otp-fiber"> · 🔀 {hop.splitterName}</span>}
      {hop.outCable && <span className="otp-fiber"> · sale {hop.outCable.name} F{hop.outCable.fiberIndex}</span>}
    </span>
  )
}

export default function OltTracePanel({ trace, onClose }: { trace: DownstreamTrace; onClose: () => void }) {
  const count = (e: DownstreamPath['end']) => trace.paths.filter(p => p.end === e).length
  return (
    <div className="otp-overlay" onClick={onClose}>
      <div className="otp-modal" onClick={e => e.stopPropagation()}>
        <div className="otp-header">
          <div>
            <h3>Camino óptico desde el puerto</h3>
            <p>{trace.startLabel}</p>
          </div>
          <button className="secondary" onClick={onClose}>Cerrar</button>
        </div>

        {trace.error ? (
          <div className="otp-path err">❌ {trace.error}</div>
        ) : (
          <>
            <div className="otp-summary">
              <span>✅ {count('client')} cliente(s)</span>
              <span>🖥 {count('equipment')} equipo(s)/nodo(s)</span>
              <span>⚪ {count('free')} libre(s)</span>
              <span>⚠️ {count('open')} abierta(s)</span>
              <span>❌ {count('error')} interrumpida(s)</span>
            </div>
            <div className="otp-list">
              {trace.paths.length === 0 && <div className="otp-path warn">Sin caminos encontrados.</div>}
              {trace.paths.map((p, i) => {
                const e = END_LABEL[p.end]
                return (
                  <div key={i} className={`otp-path ${e.cls}`}>
                    {p.direction && <div className="otp-dir">{p.direction}</div>}
                    <div className="otp-chain">
                      {p.hops.map((h, j) => (
                        <div key={j} className="otp-step"><HopText hop={h} /></div>
                      ))}
                    </div>
                    <div className="otp-end">
                      {e.icon} {e.text}{p.endLabel && `: ${p.endLabel}`}
                      {p.error && <div className="otp-error">{p.error}</div>}
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
