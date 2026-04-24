import { useRef, useState } from 'react'
import type { HistoryPoint } from './zabbix'

interface Props {
  inData: HistoryPoint[]
  outData: HistoryPoint[]
  unit: string
  hours: number
}

const W   = 560
const H   = 220
const PAD = { top: 20, right: 16, bottom: 32, left: 72 }
const PW  = W - PAD.left - PAD.right
const PH  = H - PAD.top - PAD.bottom

const COLOR_IN  = '#34d399'
const COLOR_OUT = '#fb923c'

function formatBw(val: number, unit: string): string {
  const u = unit.toLowerCase()
  if (u.includes('mbps') || u.includes('mbit')) return `${val.toFixed(1)} Mbps`
  if (u.includes('kbps') || u.includes('kbit')) return `${(val / 1000).toFixed(1)} Mbps`
  if (val >= 1e9) return `${(val / 1e9).toFixed(2)} Gbps`
  if (val >= 1e6) return `${(val / 1e6).toFixed(2)} Mbps`
  if (val >= 1e3) return `${(val / 1e3).toFixed(1)} Kbps`
  return `${Math.round(val)} bps`
}

function niceMax(raw: number): number {
  if (raw <= 0) return 1
  const exp  = Math.floor(Math.log10(raw))
  const frac = raw / Math.pow(10, exp)
  const nice = frac <= 1 ? 1 : frac <= 2 ? 2 : frac <= 5 ? 5 : 10
  return nice * Math.pow(10, exp)
}

function makePath(points: HistoryPoint[], tMin: number, tMax: number, maxVal: number, fill: boolean): string {
  if (points.length < 2) return ''
  const xOf = (t: number) => PAD.left + ((t - tMin) / (tMax - tMin)) * PW
  const yOf = (v: number) => PAD.top + PH - (v / maxVal) * PH
  const pts  = points.map(p => `${xOf(p.clock).toFixed(1)},${yOf(p.value).toFixed(1)}`)
  if (!fill) return `M ${pts.join(' L ')}`
  const bottom = (PAD.top + PH).toFixed(1)
  return `M ${xOf(points[0].clock).toFixed(1)},${bottom} L ${pts.join(' L ')} L ${xOf(points[points.length - 1].clock).toFixed(1)},${bottom} Z`
}

function timeLabel(clock: number, hours: number): string {
  const d = new Date(clock * 1000)
  if (hours <= 24) return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
  return `${d.getDate()}/${(d.getMonth() + 1).toString().padStart(2, '0')} ${d.getHours().toString().padStart(2, '0')}h`
}

function interpolate(data: HistoryPoint[], t: number): number | null {
  if (!data.length) return null
  const after = data.findIndex(p => p.clock >= t)
  if (after === -1) return data[data.length - 1].value
  if (after === 0)  return data[0].value
  const a = data[after - 1], b = data[after]
  return a.value + ((t - a.clock) / (b.clock - a.clock)) * (b.value - a.value)
}

export default function BandwidthChart({ inData, outData, unit, hours }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [hover, setHover] = useState<{ x: number; inVal: number | null; outVal: number | null } | null>(null)

  const now  = Math.floor(Date.now() / 1000)
  const tMin = now - hours * 3600
  const tMax = now

  const allVals = [...inData.map(p => p.value), ...outData.map(p => p.value)]
  const rawMax  = allVals.length ? Math.max(...allVals) : 1
  const maxVal  = niceMax(rawMax * 1.1)

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(f => ({
    v: maxVal * f,
    y: PAD.top + PH - f * PH,
  }))

  const xTicks = Array.from({ length: 5 }, (_, i) => ({
    t: tMin + (i / 4) * (tMax - tMin),
    x: PAD.left + (i / 4) * PW,
  }))

  function onMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect  = svgRef.current!.getBoundingClientRect()
    const svgX  = (e.clientX - rect.left) * (W / rect.width)
    if (svgX < PAD.left || svgX > PAD.left + PW) { setHover(null); return }
    const ratio = (svgX - PAD.left) / PW
    const t     = tMin + ratio * (tMax - tMin)
    setHover({ x: svgX, inVal: interpolate(inData, t), outVal: interpolate(outData, t) })
  }

  const pathInFill  = makePath(inData,  tMin, tMax, maxVal, true)
  const pathInLine  = makePath(inData,  tMin, tMax, maxVal, false)
  const pathOutFill = makePath(outData, tMin, tMax, maxVal, true)
  const pathOutLine = makePath(outData, tMin, tMax, maxVal, false)
  const noData      = inData.length === 0 && outData.length === 0

  return (
    <div className="bw-chart-wrap">
      <div style={{ position: 'relative' }}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className="bw-chart-svg"
          onMouseMove={onMouseMove}
          onMouseLeave={() => setHover(null)}
        >
          {/* Background */}
          <rect x={PAD.left} y={PAD.top} width={PW} height={PH} fill="#050d1a" rx={2} />

          {/* Y grid + labels */}
          {yTicks.map((t, i) => (
            <g key={i}>
              <line
                x1={PAD.left} y1={t.y} x2={PAD.left + PW} y2={t.y}
                stroke={i === 0 ? '#334155' : '#1e293b'} strokeWidth={i === 0 ? 1.5 : 1}
              />
              <text x={PAD.left - 6} y={t.y + 4} textAnchor="end" fontSize={10} fill="#64748b">
                {formatBw(t.v, unit)}
              </text>
            </g>
          ))}

          {/* Axis lines */}
          <line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={PAD.top + PH} stroke="#334155" strokeWidth={1.5} />
          <line x1={PAD.left} y1={PAD.top + PH} x2={PAD.left + PW} y2={PAD.top + PH} stroke="#334155" strokeWidth={1.5} />

          {/* X labels */}
          {xTicks.map((t, i) => (
            <text key={i} x={t.x} y={H - 8} textAnchor="middle" fontSize={10} fill="#64748b">
              {timeLabel(t.t, hours)}
            </text>
          ))}

          {/* Areas */}
          {pathInFill  && <path d={pathInFill}  fill={COLOR_IN}  fillOpacity={0.15} />}
          {pathOutFill && <path d={pathOutFill} fill={COLOR_OUT} fillOpacity={0.15} />}

          {/* Lines */}
          {pathInLine  && <path d={pathInLine}  fill="none" stroke={COLOR_IN}  strokeWidth={2} strokeLinejoin="round" />}
          {pathOutLine && <path d={pathOutLine} fill="none" stroke={COLOR_OUT} strokeWidth={2} strokeLinejoin="round" />}

          {/* No data */}
          {noData && (
            <text x={W / 2} y={H / 2} textAnchor="middle" fontSize={12} fill="#475569">
              Sin datos para el período seleccionado
            </text>
          )}

          {/* Hover crosshair */}
          {hover && (
            <>
              <line x1={hover.x} y1={PAD.top} x2={hover.x} y2={PAD.top + PH}
                stroke="#64748b" strokeWidth={1} strokeDasharray="4 3" />
              {hover.inVal !== null && (
                <circle cx={hover.x} cy={PAD.top + PH - (hover.inVal / maxVal) * PH}
                  r={4} fill={COLOR_IN} stroke="#0f172a" strokeWidth={1.5} />
              )}
              {hover.outVal !== null && (
                <circle cx={hover.x} cy={PAD.top + PH - (hover.outVal / maxVal) * PH}
                  r={4} fill={COLOR_OUT} stroke="#0f172a" strokeWidth={1.5} />
              )}
            </>
          )}
        </svg>

        {/* Tooltip */}
        {hover && (hover.inVal !== null || hover.outVal !== null) && (
          <div className="bw-tooltip">
            {hover.inVal !== null && (
              <span style={{ color: COLOR_IN }}>↓ {formatBw(hover.inVal, unit)}</span>
            )}
            {hover.outVal !== null && (
              <span style={{ color: COLOR_OUT }}>↑ {formatBw(hover.outVal, unit)}</span>
            )}
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="bw-legend">
        {inData.length > 0 && (
          <span className="bw-leg-item">
            <svg width="20" height="8"><line x1="0" y1="4" x2="20" y2="4" stroke={COLOR_IN} strokeWidth="2"/></svg>
            ↓ Descarga
          </span>
        )}
        {outData.length > 0 && (
          <span className="bw-leg-item">
            <svg width="20" height="8"><line x1="0" y1="4" x2="20" y2="4" stroke={COLOR_OUT} strokeWidth="2"/></svg>
            ↑ Subida
          </span>
        )}
      </div>
    </div>
  )
}
