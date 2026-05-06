import type { SpliceCard } from './types'
import type { TitleBlockData } from './TitleBlockFormModal'

// ── Print-friendly fiber colors (same as SpliceExportView) ───────────────────
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

// ── Page dimensions (A4 @ 96 dpi, same as page 1) ────────────────────────────
const PW = 794
const PH = 1123
const ML = 94    // left margin (binding fold, consistent with page 1)
const MR = 10
const MT = 8
const CW = PW - ML - MR  // 690 px content width

const FONT      = '"Helvetica Neue", Helvetica, Arial, sans-serif'
const C_HDR_BG  = '#1a3a5c'
const C_COL_BG  = '#d4e2f5'
const C_EVEN    = '#ffffff'
const C_ODD     = '#eef3fb'
const C_GRID    = '#b8c8dc'
const C_BORDER  = '#2c3e50'

// ── Column layout (widths sum to CW = 690) ────────────────────────────────────
type ColDef = {
  label:    string
  w:        number
  center?:  boolean
  isColor?: boolean
  isStatus?: boolean
}
const COLS: ColDef[] = [
  { label: '#',          w: 22,  center: true },
  { label: 'CABLE ENT.', w: 163 },
  { label: 'F#',         w: 26,  center: true },
  { label: 'COLOR',      w: 55,  isColor: true },
  { label: 'CABLE SAL.', w: 163 },
  { label: 'F#',         w: 26,  center: true },
  { label: 'COLOR',      w: 55,  isColor: true },
  { label: 'CLIENTE',    w: 130 },
  { label: 'ESTADO',     w: 50,  center: true, isStatus: true },
]
// widths: 22+163+26+55+163+26+55+130+50 = 690 ✓

// ── Row heights ───────────────────────────────────────────────────────────────
const TITLE_H = 28
const INFO_H  = 46
const COL_H   = 22
const ROW_H   = 17
const STATS_H = 24

// ── Row data type ─────────────────────────────────────────────────────────────
type SummaryRow = {
  n:      number
  cabIn:  string; fibIn:  string; colIn:  string
  cabOut: string; fibOut: string; colOut: string
  client: string
  status: 'Activa' | 'Inactiva' | 'Libre'
}

// ── Component ─────────────────────────────────────────────────────────────────
interface Props {
  card:         SpliceCard
  titleBlock:   TitleBlockData
  featureName:  string
}

export default function SpliceSummaryView({ card, titleBlock, featureName }: Props) {
  // Build fiber → {cable, fiber} lookup
  type Ref = { cable: SpliceCard['cables'][0]; fiber: SpliceCard['cables'][0]['fibers'][0] }
  const fiberMap = new Map<string, Ref>()
  for (const cable of card.cables) {
    for (const fiber of cable.fibers) fiberMap.set(fiber.id, { cable, fiber })
  }

  // ── Build rows ──────────────────────────────────────────────────────────────
  const rows: SummaryRow[] = []
  let n = 1

  // Active connections first, then inactive
  const sorted = [
    ...card.connections.filter(c => c.active),
    ...card.connections.filter(c => !c.active),
  ]
  for (const conn of sorted) {
    const lRef = fiberMap.get(conn.leftFiberId)
    const rRef = fiberMap.get(conn.rightFiberId)
    if (!lRef || !rRef) continue
    // Normalize so cabIn = left cable, cabOut = right cable
    const entRef = lRef.cable.side === 'left' ? lRef : rRef
    const salRef = lRef.cable.side === 'left' ? rRef : lRef
    const client = (
      entRef.fiber.clientName ?? salRef.fiber.clientName ??
      entRef.fiber.clientInfo?.name ?? salRef.fiber.clientInfo?.name ?? ''
    ).slice(0, 19)
    rows.push({
      n: n++,
      cabIn:  entRef.cable.name, fibIn:  `F${entRef.fiber.index}`, colIn:  entRef.fiber.color,
      cabOut: salRef.cable.name, fibOut: `F${salRef.fiber.index}`, colOut: salRef.fiber.color,
      client, status: conn.active ? 'Activa' : 'Inactiva',
    })
  }

  // Free (unconnected) fibers
  const connectedIds = new Set(card.connections.flatMap(c => [c.leftFiberId, c.rightFiberId]))
  for (const cable of card.cables) {
    for (const fiber of cable.fibers) {
      if (connectedIds.has(fiber.id)) continue
      rows.push({
        n: n++,
        cabIn: cable.name, fibIn: `F${fiber.index}`, colIn: fiber.color,
        cabOut: '', fibOut: '', colOut: '',
        client: (fiber.clientName ?? fiber.clientInfo?.name ?? '').slice(0, 19),
        status: 'Libre',
      })
    }
  }

  // ── Pre-compute column X positions ─────────────────────────────────────────
  const colXs: number[] = []
  let cx = ML
  for (const col of COLS) { colXs.push(cx); cx += col.w }

  // ── Layout Y coordinates ────────────────────────────────────────────────────
  const titleY  = MT
  const infoY   = titleY + TITLE_H
  const colHdrY = infoY + INFO_H
  const rowsY   = colHdrY + COL_H

  // How many rows fit before bottom margin
  const maxRows    = Math.floor((PH - 30 - rowsY - STATS_H - 8) / ROW_H)
  const visibleRows = rows.slice(0, maxRows)
  const statsY     = rowsY + visibleRows.length * ROW_H + 4

  const nActive   = rows.filter(r => r.status === 'Activa').length
  const nInactive = rows.filter(r => r.status === 'Inactiva').length
  const nLibre    = rows.filter(r => r.status === 'Libre').length

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${PW} ${PH}`}
      width={PW} height={PH}
      style={{ background: 'white', display: 'block' }}
    >
      <rect width={PW} height={PH} fill="white" />

      {/* ── Left binding margin band ── */}
      <rect x={0} y={MT} width={ML - 4} height={PH - MT - 15} fill="#f4f7fc" />
      <line x1={(ML - 4) / 2} y1={MT + 30} x2={(ML - 4) / 2} y2={PH - 40}
        stroke={C_GRID} strokeWidth={0.5} strokeDasharray="4 4" />

      {/* ── Title bar ── */}
      <rect x={ML} y={titleY} width={CW} height={TITLE_H} fill={C_HDR_BG} />
      <text x={ML + CW / 2} y={titleY + TITLE_H / 2}
        dominantBaseline="central" textAnchor="middle"
        fontSize={11} fontWeight="700" fill="white" letterSpacing={1} fontFamily={FONT}
      >
        RESUMEN DE EMPALMES — {featureName.toUpperCase()}
      </text>

      {/* ── Info header: Empresa | Proyecto + Sub-proyecto | Fecha + Plano ── */}
      <rect x={ML}       y={infoY} width={175}      height={INFO_H} fill="#e8eef8" />
      <rect x={ML + 175} y={infoY} width={275}      height={INFO_H} fill="white" />
      <rect x={ML + 450} y={infoY} width={CW - 450} height={INFO_H} fill="#e8f0f8" />

      {/* Empresa */}
      <text x={ML + 8} y={infoY + 11}
        fontSize={4.5} fill="#8090a0" letterSpacing={0.5} fontFamily={FONT}>EMPRESA</text>
      <text x={ML + 8} y={infoY + 31}
        fontSize={titleBlock.empresa ? 12 : 9} fontWeight={titleBlock.empresa ? '700' : '400'}
        fill={titleBlock.empresa ? '#0d1f3c' : '#b0bec5'} fontFamily={FONT}
      >{titleBlock.empresa || 'Sin empresa'}</text>

      {/* Proyecto + Sub-proyecto */}
      <text x={ML + 183} y={infoY + 11}
        fontSize={4.5} fill="#8090a0" letterSpacing={0.5} fontFamily={FONT}>PROYECTO / SUB-PROYECTO</text>
      <text x={ML + 183} y={infoY + 27}
        fontSize={9} fontWeight="700" fill="#0d1f3c" fontFamily={FONT}>{titleBlock.proyecto}</text>
      <text x={ML + 183} y={infoY + 40}
        fontSize={8} fill="#2a4060" fontFamily={FONT}>{titleBlock.subProyecto}</text>

      {/* Fecha + Plano */}
      <text x={ML + 458} y={infoY + 11}
        fontSize={4.5} fill="#8090a0" letterSpacing={0.5} fontFamily={FONT}>FECHA</text>
      <text x={ML + 458} y={infoY + 27}
        fontSize={10} fontWeight="700" fill="#0d1f3c" fontFamily={FONT}>{titleBlock.fecha}</text>
      <text x={ML + 458} y={infoY + 40}
        fontSize={7} fill="#4a6080" fontFamily={FONT}>
        {titleBlock.nroPlano ? `Plano ${titleBlock.nroPlano} · ` : ''}Hoja 2/2
      </text>

      {/* Info row borders */}
      <rect x={ML} y={infoY} width={CW} height={INFO_H}
        fill="none" stroke={C_GRID} strokeWidth={0.7} />
      <line x1={ML + 175} y1={infoY} x2={ML + 175} y2={infoY + INFO_H} stroke={C_GRID} strokeWidth={0.5} />
      <line x1={ML + 450} y1={infoY} x2={ML + 450} y2={infoY + INFO_H} stroke={C_GRID} strokeWidth={0.5} />

      {/* ── Column headers ── */}
      <rect x={ML} y={colHdrY} width={CW} height={COL_H} fill={C_COL_BG} />
      {COLS.map((col, i) => (
        <g key={i}>
          <line x1={colXs[i]} y1={colHdrY} x2={colXs[i]} y2={colHdrY + COL_H}
            stroke={C_GRID} strokeWidth={0.6} />
          <text
            x={col.center ? colXs[i] + col.w / 2 : colXs[i] + 5}
            y={colHdrY + COL_H / 2}
            dominantBaseline="central"
            textAnchor={col.center ? 'middle' : 'start'}
            fontSize={6.5} fontWeight="700" fill="#0d2244" letterSpacing={0.4} fontFamily={FONT}
          >{col.label}</text>
        </g>
      ))}
      <rect x={ML} y={colHdrY} width={CW} height={COL_H}
        fill="none" stroke={C_GRID} strokeWidth={0.7} />

      {/* ── Data rows ── */}
      {visibleRows.map((row, ri) => {
        const ry = rowsY + ri * ROW_H
        const bg = ri % 2 === 0 ? C_EVEN : C_ODD
        const statusColor =
          row.status === 'Activa'   ? '#1B5E20' :
          row.status === 'Inactiva' ? '#5a6880' : '#9eadc0'

        const cellValues = [
          String(row.n),
          row.cabIn,  row.fibIn,  row.colIn,
          row.cabOut, row.fibOut, row.colOut,
          row.client,
          row.status,
        ]

        return (
          <g key={ri}>
            <rect x={ML} y={ry} width={CW} height={ROW_H} fill={bg} />
            <line x1={ML} y1={ry + ROW_H} x2={ML + CW} y2={ry + ROW_H}
              stroke={C_GRID} strokeWidth={0.3} />

            {COLS.map((col, ci) => {
              const val = cellValues[ci]
              const x   = colXs[ci]
              return (
                <g key={ci}>
                  <line x1={x} y1={ry} x2={x} y2={ry + ROW_H}
                    stroke={C_GRID} strokeWidth={0.3} />

                  {col.isColor && val ? (
                    /* Color chip + label */
                    <>
                      <rect
                        x={x + 4} y={ry + ROW_H / 2 - 4.5}
                        width={9} height={9} rx={1.5}
                        fill={FIBER_HEX[val] ?? '#888'}
                        stroke="rgba(0,0,0,0.18)" strokeWidth={0.4}
                      />
                      <text x={x + 17} y={ry + ROW_H / 2}
                        dominantBaseline="central" fontSize={6.5}
                        fill="#1a2a3c" fontFamily={FONT}
                      >{FIBER_LABEL[val] ?? val}</text>
                    </>
                  ) : (
                    <text
                      x={col.center ? x + col.w / 2 : x + 4}
                      y={ry + ROW_H / 2}
                      dominantBaseline="central"
                      textAnchor={col.center ? 'middle' : 'start'}
                      fontSize={col.isStatus ? 7 : 6.5}
                      fontWeight={col.isStatus ? '600' : '400'}
                      fill={col.isStatus ? statusColor : '#1a2a3c'}
                      fontFamily={FONT}
                    >
                      {!col.center && val.length > 21 ? val.slice(0, 20) + '…' : val}
                    </text>
                  )}
                </g>
              )
            })}
          </g>
        )
      })}

      {/* Table outer border */}
      <rect x={ML} y={colHdrY} width={CW} height={COL_H + visibleRows.length * ROW_H}
        fill="none" stroke={C_GRID} strokeWidth={0.8} />

      {/* Truncation note */}
      {rows.length > maxRows && (
        <text x={ML + 8} y={statsY - 4}
          fontSize={7} fill="#888" fontStyle="italic" fontFamily={FONT}
        >* Se muestran {maxRows} de {rows.length} filas.</text>
      )}

      {/* ── Stats bar ── */}
      <rect x={ML} y={statsY} width={CW} height={STATS_H} fill="#e8f0f8" />
      <text x={ML + 10} y={statsY + STATS_H / 2}
        dominantBaseline="central" fontSize={7.5} fontWeight="700" fill="#2a4060" fontFamily={FONT}
      >
        Total: {rows.length} fibra(s)
        {' · '}Activas: {nActive}
        {' · '}Inactivas: {nInactive}
        {' · '}Libres: {nLibre}
      </text>
      <text x={ML + CW - 10} y={statsY + STATS_H / 2}
        dominantBaseline="central" textAnchor="end" fontSize={7} fill="#4a6080" fontFamily={FONT}
      >{new Date().toLocaleDateString('es-AR')}</text>
      <rect x={ML} y={statsY} width={CW} height={STATS_H}
        fill="none" stroke={C_GRID} strokeWidth={0.7} />

      {/* Page border */}
      <rect x={ML} y={MT} width={CW} height={PH - MT - 15}
        fill="none" stroke={C_BORDER} strokeWidth={1.5} />
    </svg>
  )
}
