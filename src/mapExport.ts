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

// ── Colores fijos por tipo de elemento ───────────────────────────────────────
const EXPORT_COLORS: Record<string, string> = {
  nap:        '#16a34a',  // verde
  splice_box: '#f97316',  // naranja
  poste:      '#d97706',  // ámbar
  node:       '#2563eb',  // azul
  camera:     '#0891b2',  // cian
  fiber_line: '#dc2626',  // rojo (usa color del feature)
  zone:       '#8b5cf6',  // violeta
}

// ── Web Mercator projection (same math Leaflet uses internally) ───────────────
function lon2worldX(lng: number, zoom: number): number {
  return ((lng + 180) / 360) * 256 * Math.pow(2, zoom)
}

function lat2worldY(lat: number, zoom: number): number {
  const sin = Math.sin(lat * Math.PI / 180)
  return (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * 256 * Math.pow(2, zoom)
}

// ── Tile-based canvas renderer ────────────────────────────────────────────────
// CartoDB Positron: fondo blanco con calles y nombres, CORS libre.
export async function renderMapToCanvas(
  center: { lat: number; lng: number },
  zoom:   number,
  canvasW: number,
  canvasH: number,
  features: import('./types').AppFeature[],
): Promise<HTMLCanvasElement> {
  const canvas  = document.createElement('canvas')
  canvas.width  = canvasW
  canvas.height = canvasH
  const ctx = canvas.getContext('2d')!

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvasW, canvasH)

  const TILE    = 256
  const maxT    = Math.pow(2, zoom)
  const cwx     = lon2worldX(center.lng, zoom)
  const cwy     = lat2worldY(center.lat, zoom)
  const tlwx    = cwx - canvasW / 2
  const tlwy    = cwy - canvasH / 2
  const subdoms = ['a', 'b', 'c', 'd']

  const tx0 = Math.floor(tlwx / TILE)
  const ty0 = Math.floor(tlwy / TILE)
  const tx1 = Math.ceil((tlwx + canvasW) / TILE)
  const ty1 = Math.ceil((tlwy + canvasH) / TILE)

  // Usamos fetch() + Blob URL en lugar de <img crossOrigin> para evitar que
  // el Service Worker devuelva respuestas opacas que taintan el canvas.
  const loadTile = async (url: string, sx: number, sy: number): Promise<void> => {
    let blobUrl: string | null = null
    try {
      const resp = await fetch(url, { mode: 'cors', cache: 'no-store' })
      if (!resp.ok) return
      const blob = await resp.blob()
      blobUrl = URL.createObjectURL(blob)
      await new Promise<void>((res, rej) => {
        const img = new Image()
        img.onload  = () => { ctx.drawImage(img, sx, sy, TILE, TILE); res() }
        img.onerror = () => res()   // tile fallida → deja fondo blanco
        img.src = blobUrl!
      })
    } catch { /* tile no disponible → fondo blanco */ }
    finally { if (blobUrl) URL.revokeObjectURL(blobUrl) }
  }

  const tileTasks: Promise<void>[] = []
  let tileIdx = 0
  for (let tx = tx0; tx < tx1; tx++) {
    for (let ty = ty0; ty < ty1; ty++) {
      const sx  = Math.round(tx * TILE - tlwx)
      const sy  = Math.round(ty * TILE - tlwy)
      const stx = ((tx % maxT) + maxT) % maxT
      const sty = ((ty % maxT) + maxT) % maxT
      const sub = subdoms[tileIdx++ % subdoms.length]
      // CartoDB Positron: fondo blanco, calles y nombres de calles
      const url = `https://${sub}.basemaps.cartocdn.com/light_all/${zoom}/${stx}/${sty}.png`
      tileTasks.push(loadTile(url, sx, sy))
    }
  }
  await Promise.all(tileTasks)

  const toPixel = (lng: number, lat: number) => ({
    x: lon2worldX(lng, zoom) - tlwx,
    y: lat2worldY(lat, zoom) - tlwy,
  })

  // Orden de capas: zonas → líneas → puntos
  const zones  = features.filter(f => f.geometry.type === 'Polygon')
  const lines  = features.filter(f => f.geometry.type === 'LineString')
  const points = features.filter(f => f.geometry.type === 'Point')

  for (const f of [...zones, ...lines, ...points]) {
    drawFeatureOnCanvas(ctx, f, toPixel)
  }

  drawExportLegend(ctx, canvasW, canvasH)

  return canvas
}

function drawFeatureOnCanvas(
  ctx: CanvasRenderingContext2D,
  feature: import('./types').AppFeature,
  toPixel: (lng: number, lat: number) => { x: number; y: number },
) {
  const { geometry, properties } = feature
  const kind    = properties.featureType
  const color   = EXPORT_COLORS[kind] ?? properties.color ?? '#3b82f6'
  const planned = properties.status === 'planned'

  if (geometry.type === 'LineString') {
    const coords = (geometry as GeoJSON.LineString).coordinates
    if (coords.length < 2) return
    ctx.save()
    ctx.beginPath()
    ctx.strokeStyle = color
    ctx.lineWidth   = 2.5
    ctx.lineJoin    = 'round'
    ctx.lineCap     = 'round'
    if (planned) ctx.setLineDash([6, 4])
    const p0 = toPixel(coords[0][0], coords[0][1])
    ctx.moveTo(p0.x, p0.y)
    for (let i = 1; i < coords.length; i++) {
      const p = toPixel(coords[i][0], coords[i][1])
      ctx.lineTo(p.x, p.y)
    }
    ctx.stroke()
    ctx.restore()

  } else if (geometry.type === 'Point') {
    const p = toPixel(
      (geometry as GeoJSON.Point).coordinates[0],
      (geometry as GeoJSON.Point).coordinates[1],
    )
    const r = 6
    ctx.save()
    ctx.shadowColor   = 'rgba(0,0,0,0.3)'
    ctx.shadowBlur    = 3
    ctx.shadowOffsetX = 1
    ctx.shadowOffsetY = 1
    ctx.beginPath()
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2)
    if (planned) {
      // Planificado: hueco con borde discontinuo
      ctx.fillStyle = '#ffffff'
      ctx.fill()
      ctx.shadowColor = 'transparent'
      ctx.setLineDash([3, 2])
      ctx.strokeStyle = color
      ctx.lineWidth   = 2
      ctx.stroke()
    } else {
      // Activo: relleno sólido
      ctx.fillStyle = color
      ctx.fill()
      ctx.shadowColor = 'transparent'
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth   = 1.5
      ctx.stroke()
    }
    ctx.restore()

  } else if (geometry.type === 'Polygon') {
    const ring = (geometry as GeoJSON.Polygon).coordinates[0]
    if (!ring || ring.length < 3) return
    ctx.save()
    if (planned) ctx.setLineDash([5, 4])
    ctx.beginPath()
    const p0 = toPixel(ring[0][0], ring[0][1])
    ctx.moveTo(p0.x, p0.y)
    for (let i = 1; i < ring.length; i++) {
      const p = toPixel(ring[i][0], ring[i][1])
      ctx.lineTo(p.x, p.y)
    }
    ctx.closePath()
    ctx.fillStyle   = color + '22'
    ctx.fill()
    ctx.strokeStyle = color
    ctx.lineWidth   = 1.5
    ctx.stroke()
    ctx.restore()
  }
}

// ── Leyenda compacta en esquina inferior izquierda ────────────────────────────
function drawExportLegend(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const items: [string, string][] = [
    ['Caja NAP',        EXPORT_COLORS.nap],
    ['Caja empalme',    EXPORT_COLORS.splice_box],
    ['Poste',           EXPORT_COLORS.poste],
    ['Nodo',            EXPORT_COLORS.node],
    ['Reserva cable',   EXPORT_COLORS.camera],
    ['Fibra óptica',    EXPORT_COLORS.fiber_line],
  ]
  const PAD = 10, RH = 18, RW = 140, R = 5
  const bx = PAD, by = h - PAD - items.length * RH - 28

  // Fondo semitransparente
  ctx.save()
  ctx.fillStyle = 'rgba(255,255,255,0.88)'
  ctx.strokeStyle = '#d1d5db'
  ctx.lineWidth = 0.8
  roundRect(ctx, bx, by, RW, items.length * RH + 28, 4)
  ctx.fill(); ctx.stroke()

  // Título
  ctx.font = 'bold 9px Arial, sans-serif'
  ctx.fillStyle = '#374151'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.fillText('REFERENCIAS', bx + 8, by + 6)

  // Leyenda activo/planificado
  ctx.font = '8px Arial, sans-serif'
  ctx.fillStyle = '#6b7280'
  ctx.fillText('● Activo  ○ Planificado', bx + 8, by + 17)

  items.forEach(([label, color], i) => {
    const iy = by + 28 + i * RH
    // Círculo de color
    ctx.beginPath()
    ctx.arc(bx + 14, iy + RH / 2, R, 0, Math.PI * 2)
    ctx.fillStyle   = color
    ctx.fill()
    ctx.strokeStyle = '#fff'
    ctx.lineWidth   = 1
    ctx.stroke()
    // Texto
    ctx.font      = '9px Arial, sans-serif'
    ctx.fillStyle = '#1f2937'
    ctx.textBaseline = 'middle'
    ctx.fillText(label, bx + 24, iy + RH / 2)
  })
  ctx.restore()
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

// ── Wait for Leaflet map tiles to finish loading (kept for compatibility) ─────
export function waitForMapLoad(map: import('leaflet').Map, timeoutMs = 3500): Promise<void> {
  return new Promise(resolve => {
    let resolved = false
    const done = () => { if (!resolved) { resolved = true; resolve() } }
    map.once('load', done)
    setTimeout(done, timeoutMs)
  })
}
