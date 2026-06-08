import { useRef } from 'react'
import type { AppFeature, FiberColor, FiberCable, SpliceCard, Splitter } from './types'
import { FIBER_COLORS } from './fiberColors'

// ── Fiber labels ──────────────────────────────────────────────────────────────
const FIBER_LABEL: Record<FiberColor, string> = {
  blue: 'Azul', orange: 'Naranja', green: 'Verde', brown: 'Marrón',
  slate: 'Gris', white: 'Blanco', red: 'Rojo', black: 'Negro',
  yellow: 'Amarillo', violet: 'Violeta', rose: 'Rosa', aqua: 'Aqua',
}

const statusLabels: Record<string, string> = {
  planned: 'Planificado', active: 'Activo',
  maintenance: 'Mantenimiento', damaged: 'Dañado',
}

// ── Layout constants ──────────────────────────────────────────────────────────
const W       = 380
const LEFT_W  = 125
const RIGHT_W = 125
const MID_W   = W - LEFT_W - RIGHT_W   // 130
const SEC_H   = 20
const CAB_H   = 18
const FIB_H   = 17
const CAB_GAP = 6
const SP_W    = 58
const SP_HDR  = 18
const SP_PORT_H = 15
const SP_GAP  = 8

const SP_X = LEFT_W + Math.floor((MID_W - SP_W) / 2)  // splitter box left X
const LEX  = LEFT_W                  // left fibers exit X
const REX  = LEFT_W + MID_W         // right fibers entry X

// ── Dark palette ──────────────────────────────────────────────────────────────
const C_HDR    = '#1a3a5c'
const C_CAB    = '#152a45'
const C_CAB_T  = '#93c5e0'
const C_EVEN   = '#0f1520'
const C_ODD    = '#131c2b'
const C_MID    = '#0d1623'
const C_PANEL  = '#0e1724'
const C_BORDER = '#1e3050'
const C_GRID   = '#1a2840'
const C_TEXT   = '#cbd5e1'
const C_SUB    = '#475569'

// ── Geometry helpers ──────────────────────────────────────────────────────────
function cableTopY(cables: FiberCable[], idx: number): number {
  return cables.slice(0, idx).reduce((s, c) => s + CAB_H + c.fibers.length * FIB_H + CAB_GAP, 0)
}
function fiberMidY(cables: FiberCable[], ci: number, fi: number): number {
  return SEC_H + cableTopY(cables, ci) + CAB_H + fi * FIB_H + FIB_H / 2
}
function bezier(x1: number, y1: number, x2: number, y2: number): string {
  const cx = (x1 + x2) / 2
  return `M ${x1} ${y1} C ${cx} ${y1} ${cx} ${y2} ${x2} ${y2}`
}
function splitterBoxH(sp: Splitter): number {
  return SP_HDR + (1 + sp.ratio) * SP_PORT_H
}
function splitterTopY(splitters: Splitter[], idx: number): number {
  return splitters.slice(0, idx).reduce((s, sp) => s + splitterBoxH(sp) + SP_GAP, 0)
}

// ── Cable panel (left or right) ───────────────────────────────────────────────
function CablePanel({
  cables, sc, panelX, panelW, side, totalH,
}: {
  cables: FiberCable[]
  sc: SpliceCard
  panelX: number
  panelW: number
  side: 'left' | 'right'
  totalH: number
}) {
  return (
    <>
      <rect x={panelX} y={0} width={panelW} height={totalH} fill={C_PANEL} />
      {/* Section header */}
      <rect x={panelX} y={0} width={panelW} height={SEC_H} fill={C_HDR} />
      <text x={panelX + panelW / 2} y={SEC_H / 2}
        textAnchor="middle" dominantBaseline="central"
        fontSize={7} fontWeight="700" fill="white" letterSpacing={0.4}>
        {side === 'left' ? 'CABLES ENTRADA' : 'CABLES SALIDA'}
      </text>

      {cables.map((cable, ci) => {
        const cy = SEC_H + cableTopY(cables, ci)
        return (
          <g key={cable.id}>
            {/* Cable header row */}
            <rect x={panelX} y={cy} width={panelW} height={CAB_H} fill={C_CAB} />
            <text x={panelX + 5} y={cy + CAB_H / 2} dominantBaseline="central"
              fontSize={8} fontWeight="700" fill={C_CAB_T}>{cable.name}</text>
            <text x={panelX + panelW - 4} y={cy + CAB_H / 2} dominantBaseline="central"
              textAnchor="end" fontSize={6.5} fill={C_SUB}>{cable.fibers.length}f</text>

            {cable.fibers.map((fiber, fi) => {
              const fy     = cy + CAB_H + fi * FIB_H
              const fc     = FIBER_COLORS[fiber.color] ?? '#888'
              const isConn = sc.connections.some(c => c.leftFiberId === fiber.id || c.rightFiberId === fiber.id)
              const client = fiber.clientName || fiber.clientInfo?.name

              return (
                <g key={fiber.id}>
                  <rect x={panelX} y={fy} width={panelW} height={FIB_H}
                    fill={fi % 2 === 0 ? C_EVEN : C_ODD} />
                  <line x1={panelX} y1={fy + FIB_H} x2={panelX + panelW} y2={fy + FIB_H}
                    stroke={C_GRID} strokeWidth={0.4} />

                  {side === 'left' ? (
                    <>
                      {/* color square */}
                      <rect x={panelX + 4} y={fy + FIB_H / 2 - 4.5} width={9} height={9} rx={1.5} fill={fc} />
                      {/* Fx */}
                      <text x={panelX + 17} y={fy + FIB_H / 2} dominantBaseline="central"
                        fontSize={7} fontWeight="700" fill={C_TEXT}>F{fiber.index}</text>
                      {/* color name */}
                      <text x={panelX + 31} y={fy + FIB_H / 2} dominantBaseline="central"
                        fontSize={5.5} fill={C_SUB}>{FIBER_LABEL[fiber.color] ?? ''}</text>
                      {/* client name */}
                      {client && (
                        <text x={panelX + panelW - 11} y={fy + FIB_H / 2} dominantBaseline="central"
                          textAnchor="end" fontSize={5.5} fill="#7dd3fc">
                          {client.length > 11 ? client.slice(0, 10) + '…' : client}
                        </text>
                      )}
                      {/* connection dot */}
                      <circle cx={panelX + panelW - 5} cy={fy + FIB_H / 2} r={3.5}
                        fill={isConn ? '#22c55e' : '#1e293b'} stroke={C_BORDER} strokeWidth={0.5} />
                    </>
                  ) : (
                    <>
                      {/* connection dot */}
                      <circle cx={panelX + 6} cy={fy + FIB_H / 2} r={3.5}
                        fill={isConn ? '#22c55e' : '#1e293b'} stroke={C_BORDER} strokeWidth={0.5} />
                      {/* client name */}
                      {client && (
                        <text x={panelX + 13} y={fy + FIB_H / 2} dominantBaseline="central"
                          fontSize={5.5} fill="#7dd3fc">
                          {client.length > 11 ? client.slice(0, 10) + '…' : client}
                        </text>
                      )}
                      {/* color name */}
                      <text x={panelX + panelW - 30} y={fy + FIB_H / 2} dominantBaseline="central"
                        textAnchor="end" fontSize={5.5} fill={C_SUB}>{FIBER_LABEL[fiber.color] ?? ''}</text>
                      {/* Fx */}
                      <text x={panelX + panelW - 15} y={fy + FIB_H / 2} dominantBaseline="central"
                        textAnchor="end" fontSize={7} fontWeight="700" fill={C_TEXT}>F{fiber.index}</text>
                      {/* color square */}
                      <rect x={panelX + panelW - 13} y={fy + FIB_H / 2 - 4.5} width={9} height={9} rx={1.5} fill={fc} />
                    </>
                  )}
                </g>
              )
            })}
          </g>
        )
      })}

      {/* Panel border */}
      <rect x={panelX} y={0} width={panelW} height={totalH}
        fill="none" stroke={C_BORDER} strokeWidth={0.8} />
    </>
  )
}

// ── Main SVG diagram ──────────────────────────────────────────────────────────
function SpliceDiagram({ sc, svgRef }: { sc: SpliceCard; svgRef?: React.RefObject<SVGSVGElement | null> }) {
  const leftCables  = sc.cables.filter(c => c.side === 'left')
  const rightCables = sc.cables.filter(c => c.side === 'right')
  const splitters   = sc.splitters ?? []

  if (sc.cables.length === 0) {
    return <div className="state-msg">Sin fibras registradas.</div>
  }

  // Total content height
  const cableH = (cables: FiberCable[]) =>
    cables.reduce((s, c) => s + CAB_H + c.fibers.length * FIB_H + CAB_GAP, 0)
  const splitterTotalH = splitters.reduce((s, sp) => s + splitterBoxH(sp) + SP_GAP, 0)
  const H = Math.max(cableH(leftCables), cableH(rightCables), splitterTotalH) + SEC_H + 16

  // Port position map: portId → { x, y }
  const portMap: Record<string, { x: number; y: number; color: string }> = {}

  leftCables.forEach((cable, ci) =>
    cable.fibers.forEach((fiber, fi) => {
      portMap[fiber.id] = { x: LEX, y: fiberMidY(leftCables, ci, fi), color: FIBER_COLORS[fiber.color] ?? '#888' }
    })
  )
  rightCables.forEach((cable, ci) =>
    cable.fibers.forEach((fiber, fi) => {
      portMap[fiber.id] = { x: REX, y: fiberMidY(rightCables, ci, fi), color: FIBER_COLORS[fiber.color] ?? '#888' }
    })
  )
  splitters.forEach((sp, si) => {
    const sy  = SEC_H + splitterTopY(splitters, si)
    const inY = sy + SP_HDR + SP_PORT_H / 2
    portMap[sp.inputPortId] = { x: SP_X, y: inY, color: '#3b82f6' }
    sp.outputPortIds.forEach((pid, oi) => {
      portMap[pid] = {
        x: SP_X + SP_W,
        y: sy + SP_HDR + (1 + oi) * SP_PORT_H + SP_PORT_H / 2,
        color: '#34d399',
      }
    })
  })

  return (
    <div style={{ overflowX: 'auto', overflowY: 'visible', WebkitOverflowScrolling: 'touch' as never }}>
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} width={W} height={H}
        xmlns="http://www.w3.org/2000/svg" style={{ display: 'block', minWidth: W }}>
        <rect width={W} height={H} fill={C_MID} />

        {/* Left cables panel */}
        <CablePanel cables={leftCables} sc={sc} panelX={0} panelW={LEFT_W} side="left" totalH={H} />

        {/* Middle area */}
        <rect x={LEFT_W} y={0} width={MID_W} height={H} fill={C_MID} />
        <rect x={LEFT_W} y={0} width={MID_W} height={SEC_H} fill="#0d1e35" />
        <text x={LEFT_W + MID_W / 2} y={SEC_H / 2} textAnchor="middle" dominantBaseline="central"
          fontSize={6} fill={C_SUB}>
          {sc.connections.filter(c => c.active).length}A · {sc.connections.length}T
          {splitters.length > 0 ? ` · ${splitters.length}SPL` : ''}
        </text>

        {/* Splitter boxes */}
        {splitters.map((sp, si) => {
          const sy  = SEC_H + splitterTopY(splitters, si)
          const bh  = splitterBoxH(sp)
          const inY = sy + SP_HDR + SP_PORT_H / 2
          const outY = (oi: number) => sy + SP_HDR + (1 + oi) * SP_PORT_H + SP_PORT_H / 2
          return (
            <g key={sp.id}>
              <rect x={SP_X} y={sy} width={SP_W} height={SP_HDR}
                fill="#1e3a5c" stroke="#3b82f6" strokeWidth={0.8} rx={3} />
              <rect x={SP_X} y={sy + SP_HDR} width={SP_W} height={bh - SP_HDR}
                fill="#0f1e35" stroke="#3b82f6" strokeWidth={0.8} />
              <text x={SP_X + SP_W / 2} y={sy + SP_HDR / 2} textAnchor="middle" dominantBaseline="central"
                fontSize={6} fontWeight="700" fill="#93c5fd">
                1×{sp.ratio} {sp.name}
              </text>
              {/* Input port dot (left side of box) */}
              <circle cx={SP_X} cy={inY} r={4} fill="#3b82f6" stroke="#0a1020" strokeWidth={0.6} />
              {/* Output port dots (right side of box) */}
              {sp.outputPortIds.map((pid, oi) => (
                <circle key={pid} cx={SP_X + SP_W} cy={outY(oi)}
                  r={4} fill="#34d399" stroke="#0a1020" strokeWidth={0.6} />
              ))}
            </g>
          )
        })}

        {/* Bezier connection curves */}
        {sc.connections.map(conn => {
          const lP = portMap[conn.leftFiberId]
          const rP = portMap[conn.rightFiberId]
          if (!lP || !rP) return null
          const leftFiber = leftCables.flatMap(c => c.fibers).find(f => f.id === conn.leftFiberId)
          const color = leftFiber ? (FIBER_COLORS[leftFiber.color] ?? lP.color) : lP.color
          return (
            <path key={conn.id}
              d={bezier(lP.x, lP.y, rP.x, rP.y)}
              fill="none"
              stroke={color}
              strokeWidth={conn.active ? 2 : 1.2}
              strokeOpacity={conn.active ? 0.85 : 0.4}
              strokeDasharray={conn.active ? undefined : '5 3'}
              strokeLinecap="round"
            />
          )
        })}

        {/* Right cables panel */}
        <CablePanel cables={rightCables} sc={sc} panelX={LEFT_W + MID_W} panelW={RIGHT_W} side="right" totalH={H} />
      </svg>
    </div>
  )
}

// ── SpliceSheet (bottom sheet wrapper) ───────────────────────────────────────
export default function SpliceSheet({
  feature,
  onClose,
  onTraceClient,
}: {
  feature: AppFeature
  onClose: () => void
  onTraceClient: (fiberId: string) => void
}) {
  void onTraceClient
  const sc    = feature.properties.spliceCard ?? { cables: [], connections: [], splitters: [] }
  const props = feature.properties
  const svgRef = useRef<SVGSVGElement | null>(null)

  const totalFibers  = sc.cables.reduce((a, c) => a + c.fibers.length, 0)
  const clientFibers = sc.cables.flatMap(c => c.fibers.filter(f => f.clientName || f.clientInfo?.name)).length

  function exportPng() {
    const svg = svgRef.current
    if (!svg) return
    const svgW = svg.width.baseVal.value
    const svgH = svg.height.baseVal.value
    const scale = (window.devicePixelRatio || 1) * 2
    const svgStr = new XMLSerializer().serializeToString(svg)
    const dataUri = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svgStr)))}`
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width  = svgW * scale
      canvas.height = svgH * scale
      const ctx = canvas.getContext('2d')!
      ctx.fillStyle = '#0e1724'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      canvas.toBlob(blob => {
        if (!blob) return
        const a = document.createElement('a')
        a.href = URL.createObjectURL(blob)
        a.download = `empalme-${props.code || props.name}.png`
        a.click()
        URL.revokeObjectURL(a.href)
      }, 'image/png')
    }
    img.src = dataUri
  }

  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="nap-sheet splice-sheet">
        <div className="sheet-handle" />

        <div className="sheet-header">
          <div className="sheet-header-main">
            <div>
              <div className="sheet-title">{props.name}</div>
              {props.code && <div className="sheet-code">{props.code}</div>}
              <div className="sheet-meta">
                <span className={`status-pill st-${props.status}`}>{statusLabels[props.status] ?? props.status}</span>
                <span className="sheet-count">{totalFibers} fibras</span>
                <span className="sheet-count">· {sc.connections.length} empalmes</span>
                {clientFibers > 0 && <span className="sheet-count">· {clientFibers} clientes</span>}
              </div>
            </div>
            <div className="sheet-header-actions">
              {sc.cables.length > 0 && (
                <button className="btn-export-png" onClick={exportPng} title="Exportar PNG">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                    <polyline points="7 10 12 15 17 10"/>
                    <line x1="12" y1="15" x2="12" y2="3"/>
                  </svg>
                  PNG
                </button>
              )}
              <button className="sheet-close" onClick={onClose}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"/>
                  <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
          </div>
          {props.notes && <div className="sheet-notes">{props.notes}</div>}
        </div>

        <div className="sheet-body">
          <SpliceDiagram sc={sc} svgRef={svgRef} />
        </div>
      </div>
    </>
  )
}
