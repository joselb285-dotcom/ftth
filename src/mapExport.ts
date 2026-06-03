/**
 * Map export utilities: north arrow, title block (rótulo técnico), PDF layout.
 * All functions are pure — no React deps.
 */
import type jsPDFType from 'jspdf'
import type { TitleBlockData } from './TitleBlockFormModal'

// ── North arrow ───────────────────────────────────────────────────────────────
/**
 * Draws a compass rose with "N" label in the upper-right corner of the canvas.
 * @param dpr The device-pixel ratio used when capturing (html2canvas scale).
 */
export function drawNorthArrow(canvas: HTMLCanvasElement, dpr = 2) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const SIZE = 56 * dpr   // overall diameter
  const PAD  = 16 * dpr   // padding from edge
  const CX   = canvas.width  - PAD - SIZE / 2
  const CY   = PAD + SIZE / 2
  const R    = SIZE / 2 - 2 * dpr

  ctx.save()

  // ── Drop shadow
  ctx.shadowColor   = 'rgba(0,0,0,0.3)'
  ctx.shadowBlur    = 6 * dpr
  ctx.shadowOffsetX = 1 * dpr
  ctx.shadowOffsetY = 2 * dpr

  // ── Background circle
  ctx.beginPath()
  ctx.arc(CX, CY, R, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(255,255,255,0.93)'
  ctx.fill()
  ctx.shadowColor = 'transparent'

  // ── Thin ring
  ctx.beginPath()
  ctx.arc(CX, CY, R, 0, Math.PI * 2)
  ctx.strokeStyle = '#374151'
  ctx.lineWidth   = 1.5 * dpr
  ctx.stroke()

  // ── Inner tick ring (cardinal marks)
  const ticks = [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2]
  for (const angle of ticks) {
    ctx.save()
    ctx.translate(CX, CY)
    ctx.rotate(angle)
    ctx.beginPath()
    ctx.moveTo(0, -R + 4 * dpr)
    ctx.lineTo(0, -R + 8 * dpr)
    ctx.strokeStyle = '#9ca3af'
    ctx.lineWidth   = 1 * dpr
    ctx.stroke()
    ctx.restore()
  }

  // ── North arrow (black half — left)
  const tipY    = -R + 10 * dpr
  const baseW   =  8 * dpr
  const baseMid = CY + 5 * dpr

  ctx.beginPath()
  ctx.moveTo(CX,          CY + tipY)
  ctx.lineTo(CX - baseW,  baseMid)
  ctx.lineTo(CX,          CY)
  ctx.closePath()
  ctx.fillStyle = '#111827'
  ctx.fill()

  // ── North arrow (white half — right)
  ctx.beginPath()
  ctx.moveTo(CX,          CY + tipY)
  ctx.lineTo(CX + baseW,  baseMid)
  ctx.lineTo(CX,          CY)
  ctx.closePath()
  ctx.fillStyle = '#ffffff'
  ctx.fill()
  ctx.strokeStyle = '#374151'
  ctx.lineWidth   = 0.8 * dpr
  ctx.stroke()

  // ── South pointer (gray)
  const sY = R - 10 * dpr
  ctx.beginPath()
  ctx.moveTo(CX,         CY + sY)
  ctx.lineTo(CX - baseW, CY - 5 * dpr)
  ctx.lineTo(CX,         CY)
  ctx.closePath()
  ctx.fillStyle = '#6b7280'
  ctx.fill()

  ctx.beginPath()
  ctx.moveTo(CX,         CY + sY)
  ctx.lineTo(CX + baseW, CY - 5 * dpr)
  ctx.lineTo(CX,         CY)
  ctx.closePath()
  ctx.fillStyle = '#d1d5db'
  ctx.fill()

  // ── Center dot
  ctx.beginPath()
  ctx.arc(CX, CY, 3.5 * dpr, 0, Math.PI * 2)
  ctx.fillStyle = '#111827'
  ctx.fill()

  // ── "N" label
  ctx.font          = `bold ${12 * dpr}px Arial, Helvetica, sans-serif`
  ctx.textAlign     = 'center'
  ctx.textBaseline  = 'middle'
  ctx.fillStyle     = '#111827'
  ctx.fillText('N', CX, CY + tipY - 5 * dpr)

  // ── "S" label (small)
  ctx.font          = `bold ${8 * dpr}px Arial, Helvetica, sans-serif`
  ctx.fillStyle     = '#6b7280'
  ctx.fillText('S', CX, CY + sY + 6 * dpr)

  ctx.restore()
}

// ── Rótulo técnico (title block) ──────────────────────────────────────────────
type PDF = InstanceType<typeof jsPDFType>

function cell(
  pdf: PDF,
  x: number, y: number, w: number, h: number,
  label: string, value: string,
  opts: { bold?: boolean; valueFontSize?: number; center?: boolean } = {}
) {
  const { bold = false, valueFontSize = 8, center = false } = opts
  // Border
  pdf.setDrawColor(50, 50, 50)
  pdf.setLineWidth(0.25)
  pdf.rect(x, y, w, h, 'S')

  // Label (small uppercase)
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(5)
  pdf.setTextColor(100, 100, 100)
  pdf.text(label.toUpperCase(), x + 1.5, y + 3)

  // Value
  pdf.setFont('helvetica', bold ? 'bold' : 'normal')
  pdf.setFontSize(valueFontSize)
  pdf.setTextColor(20, 20, 20)

  // Truncate value to fit column
  const maxChars = Math.max(4, Math.floor((w - 3) / (valueFontSize * 0.38)))
  const display  = value.length > maxChars ? value.slice(0, maxChars - 1) + '…' : value

  if (center) {
    pdf.text(display, x + w / 2, y + h / 2 + 1.5, { align: 'center', baseline: 'middle' })
  } else {
    pdf.text(display, x + 1.5, y + h / 2 + 1.5, { baseline: 'middle' })
  }
}

/**
 * Draws a proper IRAM-style technical title block inside the rectangle
 * [x, y, w, h] (all in mm) on the given jsPDF instance.
 *
 * Layout (two rows):
 *   Row 1: Empresa | Título del plano        | N° Plano | Escala
 *   Row 2: Proyecto + Sub-proyecto           | Fecha    | Hoja   | Logo/Rev
 */
export function drawRotulo(
  pdf: PDF,
  tb: TitleBlockData,
  x: number, y: number, w: number, h: number
) {
  // Overall background
  pdf.setFillColor(255, 255, 255)
  pdf.rect(x, y, w, h, 'FD')

  const ROW  = h / 2
  const LOGO = 30   // logo column width
  const INFO = w - LOGO

  // ── Row 1 (top) ─────────────────────────────────────────────────────────────
  //  [Empresa 36 | Título ___60___ | N°Plano 24 | Escala 24 | (gap to logo)]
  const r1: [string, string, number][] = [
    ['Empresa',        tb.empresa  || '—', 36],
    ['Título del plano', tb.titulo || '—', 60],
    ['N° de plano',    tb.nroPlano || '—', 22],
    ['Escala',         tb.escala   || '1:S/E', INFO - 36 - 60 - 22],
  ]
  let cx = x
  for (const [lbl, val, cw] of r1) {
    cell(pdf, cx, y, cw, ROW, lbl, val, { bold: lbl === 'Título del plano' || lbl === 'N° de plano' })
    cx += cw
  }

  // ── Row 2 (bottom) ──────────────────────────────────────────────────────────
  //  [Proyecto 60 | Sub-proyecto 60 | Fecha 24 | Elaboró 36 | Hoja 20]
  const r2: [string, string, number][] = [
    ['Proyecto',      tb.proyecto    || '—', 60],
    ['Sub-proyecto',  tb.subProyecto || '—', 60],
    ['Fecha',         tb.fecha       || '—', 26],
    ['Elaboró',       tb.dibujo      || '—', INFO - 60 - 60 - 26],
  ]
  cx = x
  for (const [lbl, val, cw] of r2) {
    cell(pdf, cx, y + ROW, cw, ROW, lbl, val)
    cx += cw
  }

  // ── Logo / hoja column (right, full height) ────────────────────────────────
  pdf.setDrawColor(50, 50, 50)
  pdf.setLineWidth(0.25)
  pdf.rect(x + INFO, y, LOGO, h, 'S')
  pdf.line(x + INFO, y + ROW, x + INFO + LOGO, y + ROW)

  if (tb.logoDataUrl) {
    try {
      pdf.addImage(tb.logoDataUrl, 'PNG', x + INFO + 2, y + 2, LOGO - 4, ROW - 4)
    } catch { /* ignore bad logo */ }
  } else {
    pdf.setFont('helvetica', 'italic')
    pdf.setFontSize(6)
    pdf.setTextColor(160, 160, 160)
    pdf.text('FTTH GIS Editor', x + INFO + LOGO / 2, y + ROW / 2, { align: 'center', baseline: 'middle' })
  }

  // Hoja cell
  cell(pdf, x + INFO, y + ROW, LOGO, ROW, 'Hoja', tb.hoja || '1', { bold: true, valueFontSize: 12, center: true })
}

// ── CORS-compatible layer names ───────────────────────────────────────────────
// These tile providers send Access-Control-Allow-Origin: * headers,
// so html2canvas can read their pixels when crossOrigin='anonymous' is set.
// Google Maps does NOT support CORS — any layer using mt*.google.com will be
// switched to OSM automatically during PDF export.
export const CORS_LAYERS = new Set([
  'OSM',
  'CartoDB Oscuro',
  'Topográfico',   // now served by ESRI World Topo Map — CORS verified
  'Esri Satélite', // CORS verified: Access-Control-Allow-Origin: *
])

// ── Wait for Leaflet map tiles to finish loading ──────────────────────────────
export function waitForMapLoad(map: import('leaflet').Map, timeoutMs = 3500): Promise<void> {
  return new Promise(resolve => {
    let resolved = false
    const done = () => { if (!resolved) { resolved = true; resolve() } }
    // Leaflet fires 'load' when all visible tiles are loaded
    map.once('load', done)
    // Fallback timeout so export never hangs indefinitely
    setTimeout(done, timeoutMs)
  })
}
