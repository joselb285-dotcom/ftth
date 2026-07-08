import type { Fiber, FiberCable, SpliceCard, Splitter } from './types'
import type { TitleBlockData } from './TitleBlockFormModal'

// ── Fiber colors — print-friendly (dark on white) ────────────────────────────
const FIBER_HEX: Record<string, string> = {
  blue:   '#1565C0', orange: '#BF360C', green:  '#1B5E20',
  brown:  '#4E342E', slate:  '#37474F', white:  '#9E9E9E',
  red:    '#B71C1C', black:  '#212121', yellow: '#F57F17',
  violet: '#4A148C', rose:   '#880E4F', aqua:   '#006064',
}
const FIBER_LABEL: Record<string, string> = {
  blue: 'Azul', orange: 'Naranja', green: 'Verde', brown: 'Marrón',
  slate: 'Pizarra', white: 'Blanco', red: 'Rojo', black: 'Negro',
  yellow: 'Amarillo', violet: 'Violeta', rose: 'Rosa', aqua: 'Aqua',
}

// ── A4 portrait page (794×1123 px @ 96dpi) ───────────────────────────────────
const PW = 794
const PH = 1123

// IRAM 4508: margins mm→px (1mm ≈ 3.779px @ 96dpi)
const ML = 94   // left 25mm
const MT = 8    // top minimal — diagram starts at top
const MR = 10
const MB = 10

const CONTENT_W = PW - ML - MR
const ROTULO_H  = 175
const LEGEND_H  = 18
const CONTENT_H = PH - MT - MB - ROTULO_H - LEGEND_H - 6

// Diagram column widths
const LEFT_W  = 200
const RIGHT_W = 200
const MID_W   = CONTENT_W - LEFT_W - RIGHT_W

// Row heights
const SEC_H   = 22
const CAB_H   = 20
const FIB_H   = 14   // individual fiber row (cables ≤ 12 f)
const BUF_H   = 20   // buffer row height (cables > 12 f)
const BUFS    = 12   // fibers per buffer
const CAB_GAP = 4

const COLOR_SEQ = [
  'blue', 'orange', 'green', 'brown', 'slate', 'white',
  'red', 'black', 'yellow', 'violet', 'rose', 'aqua',
] as const

// Splitter geometry — mirrors on-screen at 0.75× scale (same as FIB_H/FIBER_ROW_H)
const SP_W      = 60   // screen: 80
const SP_HDR    = 20   // screen: 26
const SP_PORT_H = 14   // screen: 18  — one row per port (incl. input row)
const SP_GAP    = 10

// Palette — light/print theme
const C_HDR_BG   = '#1a3a5c'
const C_CAB_BG   = '#d4e2f5'
const C_CAB_TXT  = '#0d2244'
const C_EVEN     = '#ffffff'
const C_ODD      = '#eef3fb'
const C_MID_BG   = '#e8f0fb'
const C_PANEL_BG = '#f2f6fc'
const C_BORDER   = '#2c3e50'
const C_GRID     = '#b8c8dc'

const FONT = '"Helvetica Neue", Helvetica, Arial, sans-serif'

// ── Cable layout plan (for PDF export) ───────────────────────────────────────
// Buffers with no connected fibers are hidden; connected buffers expand to show
// individual fiber rows, mirroring the on-screen expanded BufferGroup view.

type BufferPlan = {
  bufferIndex: number
  fibers: Fiber[]
  yInBody: number   // y of buffer header within cable body
  height: number    // BUF_H + fibers.length * FIB_H
}

type CablePlan = {
  cable: FiberCable
  bodyH: number
  simple: boolean      // true when cable.fibers.length <= BUFS (flat fiber list)
  buffers: BufferPlan[] // only for !simple; only connected buffers
  fiberBodyY: Map<string, number> // fiber.id → y of fiber center within cable body
}

function buildCablePlan(cable: FiberCable, connectedIds: Set<string>): CablePlan {
  const n = cable.fibers.length
  const fiberBodyY = new Map<string, number>()

  if (n <= BUFS) {
    cable.fibers.forEach((f, fi) => fiberBodyY.set(f.id, fi * FIB_H + FIB_H / 2))
    return { cable, bodyH: n * FIB_H, simple: true, buffers: [], fiberBodyY }
  }

  const fpb = cable.fibersPerBuffer ?? BUFS
  let yInBody = 0
  const buffers: BufferPlan[] = []

  for (let bi = 0; bi < Math.ceil(n / fpb); bi++) {
    const fibers = cable.fibers.slice(bi * fpb, (bi + 1) * fpb)
    if (!fibers.some(f => connectedIds.has(f.id))) continue
    const bufH = BUF_H + fibers.length * FIB_H
    buffers.push({ bufferIndex: bi, fibers, yInBody, height: bufH })
    fibers.forEach((f, fi) => fiberBodyY.set(f.id, yInBody + BUF_H + fi * FIB_H + FIB_H / 2))
    yInBody += bufH + CAB_GAP
  }

  const bodyH = buffers.length > 0 ? yInBody - CAB_GAP : 0
  return { cable, bodyH, simple: false, buffers, fiberBodyY }
}

function planTopY(plans: CablePlan[], idx: number): number {
  return plans.slice(0, idx).reduce((s, p) => s + CAB_H + p.bodyH + CAB_GAP, 0)
}
function orthoSegment(px: number, py: number, laneX: number, midY: number, isBottom: boolean): string {
  if (isBottom) return `M ${px} ${py} L ${px} ${midY} L ${laneX} ${midY}`
  return `M ${px} ${py} L ${laneX} ${py} L ${laneX} ${midY}`
}

// Box height = header + (1 input row + N output rows) × port row height
function splitterH(ratio: number): number {
  return SP_HDR + (1 + ratio) * SP_PORT_H
}

// Y of splitter top (stacked in middle column)
function splitterTopY(splitters: Splitter[], idx: number): number {
  return splitters.slice(0, idx).reduce((s, sp) => s + splitterH(sp.ratio) + SP_GAP, 0)
}

// Port positions relative to diagram origin (DX, DY)
type PortPos = { x: number; y: number }
function getSplitterPortPos(
  splitters: Splitter[], sp: Splitter, si: number,
  portId: string, midX: number
): PortPos | null {
  const sy = SEC_H + splitterTopY(splitters, si)
  if (sp.inputPortId === portId) {
    return { x: midX, y: sy + SP_HDR + SP_PORT_H / 2 }
  }
  const oi = sp.outputPortIds.indexOf(portId)
  if (oi !== -1) {
    return { x: midX + SP_W, y: sy + SP_HDR + (1 + oi) * SP_PORT_H + SP_PORT_H / 2 }
  }
  return null
}

// ── Text component ────────────────────────────────────────────────────────────
type TA = 'start' | 'middle' | 'end'
type TxtOpts = { sz?: number; bold?: boolean; color?: string; a?: TA; italic?: boolean; ls?: number }
function Txt({ x, y, t, o = {} }: { x: number; y: number; t: string; o?: TxtOpts }) {
  return (
    <text
      x={x} y={y}
      textAnchor={o.a ?? 'start'}
      dominantBaseline="central"
      fontSize={o.sz ?? 8}
      fontWeight={o.bold ? '700' : '400'}
      fontStyle={o.italic ? 'italic' : 'normal'}
      letterSpacing={o.ls ?? 0}
      fill={o.color ?? '#1a1a1a'}
      fontFamily={FONT}
    >{t}</text>
  )
}

// ── IRAM 4508:2008 Rótulo ─────────────────────────────────────────────────────
//
// Structure (width = CONTENT_W, height = ROTULO_H):
//
// ┌──────────┬────────────────────────────────┬────────┬───────┬────────┐
// │          │  EMPRESA (bold, large)          │        │       │        │
// │  LOGO    │  Título del plano               │  N°    │ HOJA  │ ESCALA │
// │          │                                 │ PLANO  │       │        │
// ├──────────┼────────────────────────────────┤        │       │        │
// │          │  Proyecto:                      │        │       │        │
// │ (sistema)│  Sub-proyecto:                  ├────────┼───────┼────────┤
// ├──────────┼──────────┬──────────┬──────────┤        │       │        │
// │ DIBUJÓ   │ REVISÓ   │ APROBÓ   │  FECHA   │  REV   │ FECHA │ NORMA  │
// │ nombre   │ nombre   │ nombre   │          │        │       │        │
// └──────────┴──────────┴──────────┴──────────┴────────┴───────┴────────┘

// ── Cell helper: label at top-left + value perfectly centered ────────────────
function Cell({
  x, y, w, h, label, value, valueSz = 12, valueBold = true, bg = 'white', valueColor = '#0d1f3c'
}: {
  x: number; y: number; w: number; h: number
  label: string; value: string
  valueSz?: number; valueBold?: boolean; bg?: string; valueColor?: string
}) {
  const LBL_H = 8  // compact label area at top
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} fill={bg} />
      {/* Label pinned to top-left — small and light */}
      <text x={x + 4} y={y + LBL_H / 2 + 1}
        dominantBaseline="central" textAnchor="start"
        fontSize={4.5} fill="#8090a0" letterSpacing={0.5} fontFamily={FONT}
      >{label}</text>
      {/* Value centered in remaining space */}
      <text
        x={x + w / 2} y={y + LBL_H + (h - LBL_H) / 2}
        dominantBaseline="central" textAnchor="middle"
        fontSize={valueSz} fontWeight={valueBold ? '700' : '400'}
        fill={valueColor} fontFamily={FONT}
      >{value}</text>
    </g>
  )
}

function Rotulo({ tb, x, y, w, h }: { tb: TitleBlockData; x: number; y: number; w: number; h: number }) {
  const BS = 1.8
  const GS = 0.8

  // Column widths — logo cell is 3× wider than before
  const cLogo = 160
  const cNro  = 62
  const cHoja = 48
  const cEsc  = 44
  const cMain = w - cLogo - cNro - cHoja - cEsc

  // Row heights
  const rH1 = Math.round(h * 0.40)  // logo + empresa
  const rH2 = Math.round(h * 0.27)  // proyecto
  const rH3 = h - rH1 - rH2         // firmas

  const x0 = x,  x1 = x + cLogo,  x2 = x1 + cMain
  const x3 = x2 + cNro,  x4 = x3 + cHoja
  const y0 = y,  y1 = y + rH1,  y2 = y + rH1 + rH2

  const LBL_H = 11
  const hline = (ly: number, lx1 = x, lx2 = x + w, sw = GS) =>
    <line x1={lx1} y1={ly} x2={lx2} y2={ly} stroke={C_BORDER} strokeWidth={sw} />
  const vline = (lx: number, ly1 = y, ly2 = y + h, sw = GS) =>
    <line x1={lx} y1={ly1} x2={lx} y2={ly2} stroke={C_BORDER} strokeWidth={sw} />

  return (
    <g>
      <rect x={x} y={y} width={w} height={h} fill="white" />

      {/* ── ROW 1: Logo | Empresa+Título | N°Plano | Hoja | Escala ── */}
      {/* Logo cell */}
      <rect x={x0} y={y0} width={cLogo} height={rH1} fill="#f4f7fc" />
      {tb.logoDataUrl
        ? <image href={tb.logoDataUrl} x={x0 + 6} y={y0 + 5} width={cLogo - 12} height={rH1 - 10} preserveAspectRatio="xMidYMid meet" />
        : <>
            <rect x={x0 + 10} y={y0 + 8} width={cLogo - 20} height={rH1 - 16} rx={4} fill="#e8eef8" stroke="#c0cfe0" strokeWidth={0.5} />
            <text x={x0 + cLogo / 2} y={y0 + rH1 / 2} dominantBaseline="central" textAnchor="middle" fontSize={11} fill="#b0bec5" fontFamily={FONT}>LOGO</text>
          </>
      }

      {/* Empresa + título — two lines, both centered */}
      <rect x={x1} y={y0} width={cMain} height={rH1} fill="white" />
      <text x={x1 + cMain / 2} y={y0 + rH1 * 0.33}
        dominantBaseline="central" textAnchor="middle"
        fontSize={14} fontWeight="700" fill="#0d1f3c" letterSpacing={0.6} fontFamily={FONT}
      >{tb.empresa.toUpperCase()}</text>
      <text x={x1 + cMain / 2} y={y0 + rH1 * 0.70}
        dominantBaseline="central" textAnchor="middle"
        fontSize={11} fill="#2a4060" fontFamily={FONT}
      >{tb.titulo}</text>

      {/* N° Plano — spans rows 1+2 */}
      <Cell x={x2} y={y0} w={cNro} h={rH1 + rH2} label="N° DE PLANO" value={tb.nroPlano} valueSz={16} bg="#f0f5ff" />
      {/* Hoja — spans rows 1+2 */}
      <Cell x={x3} y={y0} w={cHoja} h={rH1 + rH2} label="HOJA" value={tb.hoja} valueSz={16} bg="#f0f5ff" />
      {/* Escala — spans rows 1+2 */}
      <Cell x={x4} y={y0} w={cEsc} h={rH1 + rH2} label="ESCALA" value={tb.escala} valueSz={12} bg="#f0f5ff" />

      {/* ── ROW 2: Sistema | Proyecto+Sub-proyecto ── */}
      <Cell x={x0} y={y1} w={cLogo} h={rH2} label="SISTEMA" value="FTTH" valueSz={14} bg="#e8f0f8" />

      {/* Proyecto + sub-proyecto en celda principal */}
      <rect x={x1} y={y1} width={cMain} height={rH2} fill="white" />
      <text x={x1 + 5} y={y1 + LBL_H / 2 + 1} dominantBaseline="central" textAnchor="start"
        fontSize={4.5} fill="#8090a0" letterSpacing={0.5} fontFamily={FONT}>PROYECTO</text>
      <text x={x1 + cMain / 2} y={y1 + LBL_H + (rH2 - LBL_H) * 0.30}
        dominantBaseline="central" textAnchor="middle"
        fontSize={11} fontWeight="700" fill="#0d1f3c" fontFamily={FONT}
      >{tb.proyecto}</text>
      <text x={x1 + 5} y={y1 + LBL_H + (rH2 - LBL_H) * 0.62} dominantBaseline="central" textAnchor="start"
        fontSize={4.5} fill="#8090a0" letterSpacing={0.5} fontFamily={FONT}>SUB-PROYECTO / DENOMINACIÓN</text>
      <text x={x1 + cMain / 2} y={y1 + LBL_H + (rH2 - LBL_H) * 0.88}
        dominantBaseline="central" textAnchor="middle"
        fontSize={10} fill="#2a4060" fontFamily={FONT}
      >{tb.subProyecto}</text>

      {/* ── ROW 3: Dibujó / Revisó / Aprobó | Fecha | Rev | Norma ── */}
      {(['DIBUJÓ', 'REVISÓ', 'APROBÓ'] as const).map((lbl2, i) => {
        const vals = [tb.dibujo, tb.revision, tb.aprobo]
        const cw3 = (cLogo + cMain) / 3
        const cx  = x0 + i * cw3
        return (
          <Cell key={lbl2} x={cx} y={y2} w={cw3} h={rH3}
            label={lbl2} value={vals[i]} valueSz={11} valueBold={false}
            bg={i % 2 === 0 ? '#f8fafc' : 'white'} />
        )
      })}
      <Cell x={x2} y={y2} w={cNro} h={rH3} label="FECHA" value={tb.fecha} valueSz={11} valueBold={false} bg="#f0f5ff" />
      <Cell x={x3} y={y2} w={cHoja} h={rH3} label="REVISIÓN N°" value={tb.revNum} valueSz={14} bg="#f0f5ff" />
      <Cell x={x4} y={y2} w={cEsc} h={rH3} label="NORMA" value="IRAM 4508" valueSz={8} valueBold={false} bg="#f0f5ff" />

      {/* ── Grid ── */}
      {hline(y1)}
      {hline(y2)}
      {vline(x1)}
      {vline(x2)}
      {vline(x3)}
      {vline(x4)}
      {vline(x0 + (cLogo + cMain) / 3, y2, y + h)}
      {vline(x0 + (cLogo + cMain) * 2 / 3, y2, y + h)}
      {hline(y1, x2, x + w)}

      {/* Outer border */}
      <rect x={x} y={y} width={w} height={h} fill="none" stroke={C_BORDER} strokeWidth={BS} />
    </g>
  )
}

// ── Legend bar ────────────────────────────────────────────────────────────────
function LegendBar({ x, y, w }: { x: number; y: number; w: number }) {
  const items = [
    { t: 'Fibra activa',     dash: false, color: '#1565C0', dot: false },
    { t: 'Fibra inactiva',   dash: true,  color: '#78909C', dot: false },
    { t: 'Puerto conectado', dash: false, color: '#1B5E20', dot: true  },
    { t: 'Puerto libre',     dash: false, color: '#B0BEC5', dot: true  },
  ]
  return (
    <g>
      <rect x={x} y={y - 2} width={w} height={16} fill="#f2f6fc" rx={2} />
      <Txt x={x + 6} y={y + 6} t="REFERENCIAS:" o={{ sz: 6.5, bold: true, color: '#3a4a5a', ls: 0.4 }} />
      {items.map((item, i) => {
        const ix = x + 80 + i * 152
        return (
          <g key={item.t}>
            {item.dot
              ? <circle cx={ix + 6} cy={y + 6} r={4.5} fill={item.color} stroke="white" strokeWidth={0.5} />
              : <line x1={ix} y1={y + 6} x2={ix + 18} y2={y + 6}
                  stroke={item.color} strokeWidth={item.dash ? 1.2 : 2.2}
                  strokeDasharray={item.dash ? '5 3' : undefined} strokeLinecap="round" />
            }
            <Txt x={ix + (item.dot ? 13 : 22)} y={y + 6} t={item.t}
              o={{ sz: 6.5, color: '#2a3a4a' }} />
          </g>
        )
      })}
    </g>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
interface Props {
  card: SpliceCard
  titleBlock: TitleBlockData
}

export default function SpliceExportView({ card, titleBlock }: Props) {
  const leftCables   = card.cables.filter(c => c.side === 'left')
  const rightCables  = card.cables.filter(c => c.side === 'right')
  const bottomCables = card.cables.filter(c => c.side === 'bottom')
  const splitters    = card.splitters ?? []

  // Bottom section height — allocated at the bottom of CONTENT_H
  const totalBotFibers = bottomCables.reduce((s, c) => s + c.fibers.length, 0)
  const BOT_SECTION_H = totalBotFibers > 0 ? 80 : 0
  const MAIN_H = CONTENT_H - BOT_SECTION_H

  // Diagram coords
  const DX  = ML
  const DY  = MT
  const LEX = DX + LEFT_W           // left endpoint X (right edge of left panel)
  const REX = DX + LEFT_W + MID_W   // right endpoint X (left edge of right panel)
  const MID_X = DX + LEFT_W         // middle area left X

  // Splitter box X inside middle area (centered)
  const SP_X = MID_X + (MID_W - SP_W) / 2

  // Bottom cable horizontal layout
  const BOT_COL_W    = totalBotFibers > 0 ? Math.min(28, Math.max(14, CONTENT_W / totalBotFibers)) : 20
  const BOT_TOTAL_W  = BOT_COL_W * totalBotFibers
  const BOT_START_X  = DX + (CONTENT_W - BOT_TOTAL_W) / 2
  const BOT_Y        = DY + MAIN_H        // absolute y where bottom section starts
  const BOT_PORT_Y   = BOT_Y + 20        // port circles are 20px inside bottom section

  const connectedIds = new Set(card.connections.flatMap(c => [c.leftFiberId, c.rightFiberId]))

  // Build per-cable layout plans: hide empty buffers, expand connected buffers to fiber level
  const leftPlans  = leftCables.map(c => buildCablePlan(c, connectedIds))
  const rightPlans = rightCables.map(c => buildCablePlan(c, connectedIds))

  // Build universal port position map: portId → { x, y (relative to DY) }
  type PP = { x: number; y: number; color: string }
  const portMap: Record<string, PP> = {}

  function addPlanPorts(plans: CablePlan[], edgeX: number) {
    plans.forEach((plan, ci) => {
      const topY = SEC_H + planTopY(plans, ci) + CAB_H
      plan.fiberBodyY.forEach((bodyY, fiberId) => {
        const fiber = plan.cable.fibers.find(f => f.id === fiberId)
        portMap[fiberId] = { x: edgeX, y: topY + bodyY, color: FIBER_HEX[fiber?.color ?? ''] ?? '#555' }
      })
    })
  }
  addPlanPorts(leftPlans, LEX)
  addPlanPorts(rightPlans, REX)

  splitters.forEach((sp, si) => {
    const pos = getSplitterPortPos(splitters, sp, si, sp.inputPortId, SP_X)
    if (pos) portMap[sp.inputPortId] = { x: pos.x, y: pos.y, color: '#1565C0' }
    sp.outputPortIds.forEach(pid => {
      const p = getSplitterPortPos(splitters, sp, si, pid, SP_X)
      if (p) portMap[pid] = { x: p.x, y: p.y, color: '#00838F' }
    })
  })
  // Bottom cable port positions (y relative to DY so DY + y = absolute y)
  let botFiberGlobalIdx = 0
  bottomCables.forEach(cable => {
    cable.fibers.forEach(fiber => {
      portMap[fiber.id] = {
        x: BOT_START_X + botFiberGlobalIdx * BOT_COL_W + BOT_COL_W / 2,
        y: BOT_PORT_Y - DY,
        color: FIBER_HEX[fiber.color] ?? '#555',
      }
      botFiberGlobalIdx++
    })
  })

  // Layout positions
  const RX       = ML
  const RY       = PH - MB - ROTULO_H
  const LEGEND_Y = RY - LEGEND_H - 4

  // Render individual fiber row (shared by simple cables and expanded buffer fibers)
  const renderFiberRow = (fiber: Fiber, fi: number, fy: number, panelX: number, panelW: number, side: 'left' | 'right') => {
    const fc   = FIBER_HEX[fiber.color] ?? '#555'
    const conn = connectedIds.has(fiber.id)
    return (
      <g key={fiber.id}>
        <rect x={panelX} y={fy} width={panelW} height={FIB_H} fill={fi % 2 === 0 ? C_EVEN : C_ODD} />
        <line x1={panelX} y1={fy + FIB_H} x2={panelX + panelW} y2={fy + FIB_H} stroke={C_GRID} strokeWidth={0.4} />
        {side === 'left' ? <>
          <rect x={panelX + 5} y={fy + FIB_H / 2 - 4} width={9} height={9} rx={1.5} fill={fc} stroke="rgba(0,0,0,0.18)" strokeWidth={0.5} />
          <Txt x={panelX + 18} y={fy + FIB_H / 2} t={`F${fiber.index}`} o={{ sz: 7, bold: true, color: '#1a2a3c' }} />
          <Txt x={panelX + 33} y={fy + FIB_H / 2} t={FIBER_LABEL[fiber.color] ?? ''} o={{ sz: 6.5, color: '#3a5070' }} />
          {fiber.clientName && <Txt x={panelX + panelW - 13} y={fy + FIB_H / 2}
            t={fiber.clientName.length > 13 ? fiber.clientName.slice(0, 12) + '…' : fiber.clientName}
            o={{ sz: 6, color: '#0d2b4e', a: 'end' }} />}
          <circle cx={panelX + panelW - 6} cy={fy + FIB_H / 2} r={3.5} fill={conn ? '#1B5E20' : '#b0c4d8'} stroke="white" strokeWidth={0.8} />
        </> : <>
          <circle cx={panelX + 6} cy={fy + FIB_H / 2} r={3.5} fill={conn ? '#1B5E20' : '#b0c4d8'} stroke="white" strokeWidth={0.8} />
          {fiber.clientName && <Txt x={panelX + 14} y={fy + FIB_H / 2}
            t={fiber.clientName.length > 13 ? fiber.clientName.slice(0, 12) + '…' : fiber.clientName}
            o={{ sz: 6, color: '#0d2b4e' }} />}
          <Txt x={panelX + panelW - 27} y={fy + FIB_H / 2} t={FIBER_LABEL[fiber.color] ?? ''} o={{ sz: 6.5, color: '#3a5070', a: 'end' }} />
          <Txt x={panelX + panelW - 15} y={fy + FIB_H / 2} t={`F${fiber.index}`} o={{ sz: 7, bold: true, color: '#1a2a3c', a: 'end' }} />
          <rect x={panelX + panelW - 14} y={fy + FIB_H / 2 - 4} width={9} height={9} rx={1.5} fill={fc} stroke="rgba(0,0,0,0.18)" strokeWidth={0.5} />
        </>}
      </g>
    )
  }

  const renderCablePanel = (
    plans: CablePlan[],
    panelX: number,
    panelW: number,
    side: 'left' | 'right',
    panelH: number
  ) => (
    <>
      <rect x={panelX} y={DY} width={panelW} height={panelH} fill={C_PANEL_BG} />
      <rect x={panelX} y={DY} width={panelW} height={SEC_H} fill={C_HDR_BG} />
      <Txt x={panelX + panelW / 2} y={DY + SEC_H / 2}
        t={side === 'left' ? 'CABLES DE ENTRADA' : 'CABLES DE SALIDA'}
        o={{ sz: 8.5, bold: true, color: 'white', a: 'middle', ls: 0.5 }} />

      {plans.map((plan, ci) => {
        const cy = DY + SEC_H + planTopY(plans, ci)
        const n  = plan.cable.fibers.length
        return (
          <g key={plan.cable.id}>
            <rect x={panelX} y={cy} width={panelW} height={CAB_H} fill={C_CAB_BG} />
            <line x1={panelX} y1={cy + CAB_H} x2={panelX + panelW} y2={cy + CAB_H} stroke={C_GRID} strokeWidth={0.6} />
            <Txt x={panelX + 8} y={cy + CAB_H / 2} t={plan.cable.name} o={{ sz: 9, bold: true, color: C_CAB_TXT }} />
            <Txt x={panelX + panelW - 7} y={cy + CAB_H / 2} t={`${n}f`} o={{ sz: 7.5, color: '#4a6a8a', a: 'end' }} />

            {plan.simple ? (
              /* ── Individual fiber rows (≤ 12 f) ── */
              plan.cable.fibers.map((fiber, fi) =>
                renderFiberRow(fiber, fi, cy + CAB_H + fi * FIB_H, panelX, panelW, side)
              )
            ) : (
              /* ── Buffered (> 12 f): show only connected buffers, each expanded to fiber rows ── */
              plan.buffers.map(buf => {
                const tubeColor = FIBER_HEX[COLOR_SEQ[buf.bufferIndex % 12]] ?? '#888'
                const usedInBuf = buf.fibers.filter(f => connectedIds.has(f.id)).length
                const by = cy + CAB_H + buf.yInBody
                return (
                  <g key={buf.bufferIndex}>
                    {/* Buffer header */}
                    <rect x={panelX} y={by} width={panelW} height={BUF_H}
                      fill={buf.bufferIndex % 2 === 0 ? '#dce9f8' : '#e8f0fb'} />
                    <line x1={panelX} y1={by + BUF_H} x2={panelX + panelW} y2={by + BUF_H}
                      stroke={C_GRID} strokeWidth={0.5} />
                    {side === 'left' ? <>
                      <rect x={panelX + 5} y={by + BUF_H / 2 - 5} width={11} height={11} rx={2}
                        fill={tubeColor} stroke="rgba(0,0,0,0.18)" strokeWidth={0.5} />
                      <Txt x={panelX + 21} y={by + BUF_H / 2}
                        t={`Buffer ${buf.bufferIndex + 1}  F${buf.fibers[0].index}–F${buf.fibers[buf.fibers.length - 1].index}`}
                        o={{ sz: 7.5, bold: true, color: '#1a2a3c' }} />
                      <Txt x={panelX + panelW - 7} y={by + BUF_H / 2}
                        t={`${usedInBuf}/${buf.fibers.length}`}
                        o={{ sz: 7, color: '#1B5E20', a: 'end' }} />
                    </> : <>
                      <Txt x={panelX + 7} y={by + BUF_H / 2}
                        t={`${usedInBuf}/${buf.fibers.length}`}
                        o={{ sz: 7, color: '#1B5E20' }} />
                      <Txt x={panelX + panelW - 21} y={by + BUF_H / 2}
                        t={`F${buf.fibers[0].index}–F${buf.fibers[buf.fibers.length - 1].index}  Buffer ${buf.bufferIndex + 1}`}
                        o={{ sz: 7.5, bold: true, color: '#1a2a3c', a: 'end' }} />
                      <rect x={panelX + panelW - 17} y={by + BUF_H / 2 - 5} width={11} height={11} rx={2}
                        fill={tubeColor} stroke="rgba(0,0,0,0.18)" strokeWidth={0.5} />
                    </>}
                    {/* Individual fiber rows within this buffer */}
                    {buf.fibers.map((fiber, fi) =>
                      renderFiberRow(fiber, fi, by + BUF_H + fi * FIB_H, panelX, panelW, side)
                    )}
                  </g>
                )
              })
            )}
          </g>
        )
      })}
      <rect x={panelX} y={DY} width={panelW} height={panelH} fill="none" stroke={C_GRID} strokeWidth={0.8} />
    </>
  )

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      xmlnsXlink="http://www.w3.org/1999/xlink"
      viewBox={`0 0 ${PW} ${PH}`}
      width={PW}
      height={PH}
      style={{ background: 'white', display: 'block' }}
    >
      <rect width={PW} height={PH} fill="white" />

      {/* Outer border */}
      <rect x={ML} y={MT} width={CONTENT_W} height={CONTENT_H} fill="white" stroke={C_BORDER} strokeWidth={2} />

      {/* ── LEFT PANEL ── */}
      {renderCablePanel(leftPlans, DX, LEFT_W, 'left', MAIN_H)}

      {/* ── MIDDLE AREA ── */}
      <rect x={MID_X} y={DY} width={MID_W} height={MAIN_H} fill={C_MID_BG} />
      <rect x={MID_X} y={DY} width={MID_W} height={SEC_H} fill="#dce9f8" />
      <Txt x={MID_X + MID_W / 2} y={DY + SEC_H / 2}
        t={`${card.connections.filter(c => c.active).length} ACTIVAS · ${card.connections.length} TOTAL · ${splitters.length} SPLITTER(S)`}
        o={{ sz: 7, color: '#2a4a6a', a: 'middle' }} />

      {/* Splitter boxes */}
      {splitters.map((sp, si) => {
        const sy  = DY + SEC_H + splitterTopY(splitters, si)
        const bh  = splitterH(sp.ratio)
        const inY  = sy + SP_HDR + SP_PORT_H / 2
        const outY = (oi: number) => sy + SP_HDR + (1 + oi) * SP_PORT_H + SP_PORT_H / 2
        return (
          <g key={sp.id}>
            <rect x={SP_X} y={sy} width={SP_W} height={SP_HDR}
              fill="#dce9f8" stroke="#3b82f6" strokeWidth={1} rx={3} />
            <rect x={SP_X} y={sy + SP_HDR} width={SP_W} height={bh - SP_HDR}
              fill="white" stroke="#3b82f6" strokeWidth={1} />
            <Txt x={SP_X + SP_W / 2} y={sy + SP_HDR / 2}
              t={`1×${sp.ratio} ${sp.name}`}
              o={{ sz: 6.5, bold: true, color: '#0d2044', a: 'middle' }} />
            <circle cx={SP_X} cy={inY} r={4} fill="#3b82f6" stroke="white" strokeWidth={0.8} />
            {sp.outputPortIds.map((pid, oi) => (
              <circle key={pid} cx={SP_X + SP_W} cy={outY(oi)}
                r={4} fill="#34d399" stroke="white" strokeWidth={0.8} />
            ))}
          </g>
        )
      })}

      {/* ── Connection lines (bezier routing, no downward stubs) ── */}
      {(() => {
        const resolve = (fiberId: string) =>
          FIBER_HEX[card.cables.find(c => c.fibers.some(f => f.id === fiberId))
            ?.fibers.find(f => f.id === fiberId)?.color ?? ''] ?? '#888'

        // Keep card.connections order — same as user sees on screen
        const items = card.connections
          .map(conn => ({
            conn,
            lP: portMap[conn.leftFiberId],
            rP: portMap[conn.rightFiberId],
            lc: resolve(conn.leftFiberId),
            rc: resolve(conn.rightFiberId),
          }))
          .filter(x => x.lP && x.rP)

        if (items.length === 0) return null

        const count  = items.length
        // Spread lanes across 80% of middle area, same index order as screen
        const laneW  = count > 1 ? Math.min(22, (MID_W * 0.80) / (count - 1)) : 0
        const laneX0 = MID_X + MID_W / 2 - laneW * (count - 1) / 2

        return items.map(({ conn, lP, rP, lc, rc }, idx) => {
          const absLy  = DY + lP.y
          const absRy  = DY + rP.y
          const laneX  = conn.bendX ?? (laneX0 + idx * laneW)
          const fusionY = conn.bendY ?? (absLy + absRy) / 2
          const isLBot = lP.y > MAIN_H
          const isRBot = rP.y > MAIN_H

          // Bezier curves: each segment exits HORIZONTALLY from its port then
          // curves smoothly to the fusion point — no abrupt vertical drop.
          // Bottom ports keep the original vertical-first orthogonal routing.
          const bezierTo = (
            px: number, py: number,
            fx: number, fy: number,
            isBottom: boolean
          ): string => {
            if (isBottom) {
              // bottom port: go vertical first, then horizontal
              return `M ${px} ${py} L ${px} ${fy} L ${fx} ${fy}`
            }
            // Side port: cubic bezier — exits horizontally, curves to fusion
            const cpX = (px + fx) / 2  // mid-horizontal control point
            return `M ${px} ${py} C ${cpX} ${py} ${fx} ${(py + fy) / 2} ${fx} ${fy}`
          }

          const dL = bezierTo(lP.x, absLy, laneX, fusionY, isLBot)
          const dR = bezierTo(rP.x, absRy, laneX, fusionY, isRBot)
          const sw  = conn.active ? 2.5 : 1.8
          const dash = conn.active ? undefined : '7 3'

          return (
            <g key={conn.id}>
              {/* White casing so lines read on the panel background */}
              <path d={dL} fill="none" stroke="white" strokeWidth={sw + 2.5} />
              <path d={dR} fill="none" stroke="white" strokeWidth={sw + 2.5} />
              {/* Left fiber — its color up to fusion */}
              <path d={dL} fill="none" stroke={lc} strokeWidth={sw} strokeDasharray={dash} />
              {/* Right fiber — its color from fusion */}
              <path d={dR} fill="none" stroke={rc} strokeWidth={sw} strokeDasharray={dash} />
              {/* Fusion marker */}
              <circle cx={laneX} cy={fusionY} r={4} fill="white" stroke="#2c3e50" strokeWidth={1.2} />
              <circle cx={laneX} cy={fusionY} r={1.8} fill="#2c3e50" />
            </g>
          )
        })
      })()}

      {/* ── BOTTOM CABLE SECTION ── */}
      {BOT_SECTION_H > 0 && (() => {
        let xIdx = 0
        return (
          <g>
            <line x1={DX} y1={BOT_Y} x2={DX + CONTENT_W} y2={BOT_Y}
              stroke="#3b82f6" strokeWidth={1.2} strokeDasharray="4 2" />
            <Txt x={DX + 4} y={BOT_Y + 8}
              t="SALIDA (INFERIOR)" o={{ sz: 5.5, bold: true, color: '#60a5fa', ls: 0.6 }} />
            {bottomCables.map(cable => {
              const cableStartX = BOT_START_X + xIdx * BOT_COL_W
              const cableW = cable.fibers.length * BOT_COL_W
              const result = (
                <g key={cable.id}>
                  <rect x={cableStartX} y={BOT_Y + 14} width={cableW} height={8} fill="#1e3a5c" rx={1} />
                  <Txt x={cableStartX + cableW / 2} y={BOT_Y + 18}
                    t={cable.name.length > 14 ? cable.name.slice(0, 13) + '…' : cable.name}
                    o={{ sz: 5, bold: true, color: '#93c5fd', a: 'middle' }} />
                  {cable.fibers.map((fiber, fi) => {
                    const fx = cableStartX + fi * BOT_COL_W + BOT_COL_W / 2
                    const fc = FIBER_HEX[fiber.color] ?? '#555'
                    const isConn = connectedIds.has(fiber.id)
                    return (
                      <g key={fiber.id}>
                        <circle cx={fx} cy={BOT_PORT_Y} r={3.5}
                          fill={isConn ? '#1B5E20' : '#b0c4d8'} stroke="white" strokeWidth={0.7} />
                        <rect x={fx - 4} y={BOT_PORT_Y + 6} width={8} height={8} rx={1.5}
                          fill={fc} stroke="rgba(0,0,0,0.18)" strokeWidth={0.5} />
                        <Txt x={fx} y={BOT_PORT_Y + 22}
                          t={`F${fiber.index}`} o={{ sz: 5.5, a: 'middle', bold: true, color: '#1a2a3c' }} />
                      </g>
                    )
                  })}
                </g>
              )
              xIdx += cable.fibers.length
              return result
            })}
          </g>
        )
      })()}

      {/* ── RIGHT PANEL ── */}
      {renderCablePanel(rightPlans, DX + LEFT_W + MID_W, RIGHT_W, 'right', MAIN_H)}

      {/* ── Legend ── */}
      <LegendBar x={ML} y={LEGEND_Y} w={CONTENT_W} />

      {/* ── Rótulo IRAM 4508:2008 ── */}
      <Rotulo tb={titleBlock} x={RX} y={RY} w={CONTENT_W} h={ROTULO_H} />
    </svg>
  )
}
