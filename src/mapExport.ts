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

  // Geometría
  const A   = 18 * dpr   // brazo: centro → punta de flecha
  const AH  =  7 * dpr   // alto del triángulo
  const AW  =  3 * dpr   // semiancho de la base del triángulo
  const LG  =  9 * dpr   // distancia de la punta a la etiqueta
  const PAD = 10 * dpr   // margen desde el borde del canvas

  // Centro: calculado para que todas las etiquetas quepan dentro
  const CX = canvas.width - PAD - A - LG - 5 * dpr
  const CY = PAD + A + LG + 5 * dpr

  ctx.save()
  ctx.lineCap  = 'round'
  ctx.lineJoin = 'round'

  // Cruz de líneas que conecta las 4 agujas
  ctx.strokeStyle = '#444'
  ctx.lineWidth   = 1.2 * dpr
  ctx.beginPath()
  ctx.moveTo(CX, CY - A + AH)
  ctx.lineTo(CX, CY + A - AH)
  ctx.moveTo(CX - A + AH, CY)
  ctx.lineTo(CX + A - AH, CY)
  ctx.stroke()

  // 4 agujas cardinales
  type ArrowDef = { tx:number; ty:number; bx1:number; by1:number; bx2:number; by2:number; fill:string; lbl:string; lx:number; ly:number }
  const arrows: ArrowDef[] = [
    { tx: CX,   ty: CY-A,  bx1: CX-AW, by1: CY-A+AH, bx2: CX+AW, by2: CY-A+AH, fill: '#111111', lbl: 'N', lx: CX,      ly: CY-A-LG },
    { tx: CX,   ty: CY+A,  bx1: CX+AW, by1: CY+A-AH, bx2: CX-AW, by2: CY+A-AH, fill: '#777777', lbl: 'S', lx: CX,      ly: CY+A+LG },
    { tx: CX+A, ty: CY,    bx1: CX+A-AH, by1: CY-AW, bx2: CX+A-AH, by2: CY+AW, fill: '#777777', lbl: 'E', lx: CX+A+LG, ly: CY },
    { tx: CX-A, ty: CY,    bx1: CX-A+AH, by1: CY+AW, bx2: CX-A+AH, by2: CY-AW, fill: '#777777', lbl: 'O', lx: CX-A-LG, ly: CY },
  ]

  for (const { tx, ty, bx1, by1, bx2, by2, fill, lbl, lx, ly } of arrows) {
    ctx.beginPath()
    ctx.moveTo(tx, ty); ctx.lineTo(bx1, by1); ctx.lineTo(bx2, by2)
    ctx.closePath()
    ctx.fillStyle   = fill
    ctx.fill()
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth   = 0.6 * dpr
    ctx.stroke()

    const isN = lbl === 'N'
    ctx.font         = isN
      ? `bold ${11 * dpr}px Arial, Helvetica, sans-serif`
      : `${9  * dpr}px Arial, Helvetica, sans-serif`
    ctx.textAlign    = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle    = isN ? '#111111' : '#555555'
    ctx.fillText(lbl, lx, ly)
  }

  ctx.restore()
}

// ── Rótulo técnico estilo IRAM ────────────────────────────────────────────────
// Referencia: 175mm × 51mm (Figura 2 IRAM).  Escala proporcional a w × h.
// Columnas ref (mm): 26 | 20 | 10 | 19 | 45 | 55
// Filas ref (mm):    17 | 11 | 9  | 14  (col izq/centro)
//                    17 | 17 | 8.5 | 8.5 (col derecha)
type PDF = InstanceType<typeof jsPDFType>

function iramLabel(pdf: PDF, text: string, x: number, y: number) {
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(4.5)
  pdf.setTextColor(110, 110, 110)
  pdf.text(text.toUpperCase(), x, y)
}

function iramRect(pdf: PDF, x: number, y: number, w: number, h: number) {
  pdf.setDrawColor(50, 50, 50)
  pdf.setLineWidth(0.25)
  pdf.rect(x, y, w, h, 'S')
}

// Escribe texto centrado en una celda. Reduce la tipografía automáticamente
// hasta minFs si el texto no entra en ancho. Si sigue sin entrar, parte en
// líneas (splitTextToSize) y centra el bloque verticalmente.
function iramFit(
  pdf: PDF, text: string,
  cx: number, cy: number,   // centro de la celda
  cw: number, ch: number,   // ancho y alto de la celda (sin padding)
  maxFs = 7, minFs = 4.5,
  bold = false
) {
  if (!text) return
  const PAD = 1.2           // margen interior horizontal
  const usableW = cw - PAD * 2
  pdf.setFont('helvetica', bold ? 'bold' : 'normal')
  pdf.setTextColor(15, 15, 15)

  // Encuentra el fontSize que hace entrar el texto en una línea
  let fs = maxFs
  while (fs > minFs) {
    pdf.setFontSize(fs)
    if (pdf.getTextWidth(text) <= usableW) break
    fs = Math.round((fs - 0.5) * 10) / 10
  }
  pdf.setFontSize(fs)

  const lines: string[] = pdf.splitTextToSize(text, usableW)
  const lineH = fs * 0.3528 * 1.35   // mm por línea (pt → mm × leading)
  const blockH = lines.length * lineH
  const startY = cy - blockH / 2 + lineH / 2

  lines.forEach((line, i) => {
    pdf.text(line, cx, startY + i * lineH, { align: 'center', baseline: 'middle' })
  })
}

export function drawRotulo(
  pdf: PDF,
  tb: TitleBlockData,
  x: number, y: number, w: number, h: number
) {
  const sx = w / 175
  const sy = h / 51
  const S  = (rx: number) => rx * sx
  const T  = (ry: number) => ry * sy

  // Posiciones X (borde izquierdo de cada columna)
  const xC1 = x             // logo/empresa  26mm
  const xC2 = x + S(26)     // dib/rev/esc   20mm
  const xC3 = x + S(46)     // fecha         10mm
  const xC4 = x + S(56)     // nombre        19mm
  const xC5 = x + S(75)     // título+proy   45mm  ← se fusiona con C3+C4 en filas 2-4
  const xC6 = x + S(120)    // col derecha   55mm

  // Posiciones Y principales
  const yR1 = y              // fila 1 top
  const yR2 = y + T(17)     // inicio filas 2-4
  const yR3 = y + T(28)
  const yR4 = y + T(37)

  // Col derecha
  const yD2 = y + T(17)
  const yD3 = y + T(34)
  const yD4 = y + T(42.5)

  // Fondo blanco
  pdf.setFillColor(255, 255, 255)
  pdf.rect(x, y, w, h, 'FD')

  // ── ① Logo / Empresa (C1, altura total) ──────────────────────────────────
  iramRect(pdf, xC1, yR1, S(26), h)
  if (tb.logoDataUrl) {
    try {
      const props = pdf.getImageProperties(tb.logoDataUrl)
      const aspect = props.width / props.height
      const pad = 2
      const aW = S(26) - pad * 2, aH = h - pad * 2
      let iW = aW, iH = aW / aspect
      if (iH > aH) { iH = aH; iW = aH * aspect }
      pdf.addImage(tb.logoDataUrl, 'PNG',
        xC1 + pad + (aW - iW) / 2,
        yR1 + pad + (aH - iH) / 2,
        iW, iH)
    } catch { /**/ }
  } else {
    iramLabel(pdf, 'Empresa', xC1 + 1, yR1 + 2)
    iramFit(pdf, tb.empresa || '—', xC1 + S(13), yR1 + h / 2, S(24), h - 6, 7, 4.5, true)
  }

  // ── C2 fila 1 (17mm): Dibujó / Revisó / Aprobó en 3 sub-filas ───────────
  const dh  = T(17) / 3
  const rows = [
    { lbl: 'Dibujó',  val: tb.dibujo   || '' },
    { lbl: 'Revisó',  val: tb.revision  || '' },
    { lbl: 'Aprobó',  val: tb.aprobo    || '' },
  ]
  rows.forEach(({ lbl, val }, i) => {
    const ry = yR1 + i * dh
    // C2: etiqueta
    iramRect(pdf, xC2, ry, S(20), dh)
    iramLabel(pdf, lbl, xC2 + 1, ry + 1.8)
    // C3: fecha (solo fila Dibujó) — valor en tercio inferior para no solapar etiqueta
    iramRect(pdf, xC3, ry, S(10), dh)
    if (i === 0) {
      iramLabel(pdf, 'Fecha', xC3 + 1, ry + 1.8)
      iramFit(pdf, tb.fecha || '', xC3 + S(5), ry + dh * 0.74, S(9), dh * 0.42, 5.5, 4)
    }
    // C4: nombre — sin sub-etiqueta, valor centrado en la celda
    iramRect(pdf, xC4, ry, S(19), dh)
    if (val) {
      iramFit(pdf, val, xC4 + S(9.5), ry + dh / 2, S(18), dh - 1.5, 5.5, 4, false)
    }
  })

  // ── C2 fila 2 (11mm): Escala ─────────────────────────────────────────────
  iramRect(pdf, xC2, yR2, S(20), T(11))
  iramLabel(pdf, 'Escala', xC2 + 1, yR2 + 2)
  iramFit(pdf, tb.escala || 'S/E', xC2 + S(10), yR2 + T(5.5), S(18), T(8), 7, 4.5, true)

  // ── C2 fila 3 (9mm): Rev. N° ─────────────────────────────────────────────
  iramRect(pdf, xC2, yR3, S(20), T(9))
  iramLabel(pdf, 'Rev. N°', xC2 + 1, yR3 + 2)
  iramFit(pdf, tb.revNum || '0', xC2 + S(10), yR3 + T(4.5), S(18), T(6), 7, 4.5, true)

  // ── C2 fila 4 (14mm): Aprobó ─────────────────────────────────────────────
  iramRect(pdf, xC2, yR4, S(20), T(14))
  iramLabel(pdf, 'Aprobó', xC2 + 1, yR4 + 2)
  iramFit(pdf, tb.aprobo || '', xC2 + S(10), yR4 + T(7), S(18), T(10), 6, 4, false)

  // ── C3+C4+C5 filas 2-4 (74mm × 34mm): Proyecto + Sub-proyecto UNIFICADO ──
  const uniW = S(74)        // 29 + 45 = 74mm ref
  iramRect(pdf, xC3, yR2, uniW, T(34))
  iramLabel(pdf, 'Proyecto', xC3 + 1, yR2 + 2)
  iramFit(pdf, tb.proyecto || '—',
    xC3 + uniW / 2, yR2 + T(9), uniW, T(13), 8, 4.5, true)
  iramLabel(pdf, 'Sub-proyecto / Ubicación', xC3 + 1, yR2 + T(18.5))
  iramFit(pdf, tb.subProyecto || '—',
    xC3 + uniW / 2, yR2 + T(27), uniW, T(12), 7, 4.5, false)

  // ── C5 fila 1 (17mm): Título del plano ───────────────────────────────────
  iramRect(pdf, xC5, yR1, S(45), T(17))
  iramLabel(pdf, 'Título del plano', xC5 + 1, yR1 + 2)
  iramFit(pdf, tb.titulo || '—',
    xC5 + S(22.5), yR1 + T(8.5), S(43), T(12), 8.5, 4.5, true)

  // ── C6 D1 (17mm): Empresa / Organización ─────────────────────────────────
  iramRect(pdf, xC6, yR1, S(55), T(17))
  iramLabel(pdf, 'Empresa / Organización', xC6 + 1, yR1 + 2)
  iramFit(pdf, tb.empresa || '—',
    xC6 + S(27.5), yR1 + T(8.5), S(53), T(12), 7.5, 4.5, true)

  // ── C6 D2 (17mm): N° de plano ────────────────────────────────────────────
  iramRect(pdf, xC6, yD2, S(55), T(17))
  iramLabel(pdf, 'N° de plano', xC6 + 1, yD2 + 2)
  iramFit(pdf, tb.nroPlano || '—',
    xC6 + S(27.5), yD2 + T(8.5), S(53), T(12), 11, 5, true)

  // ── C6 D3 (8.5mm): Fecha ─────────────────────────────────────────────────
  iramRect(pdf, xC6, yD3, S(55), T(8.5))
  iramLabel(pdf, 'Fecha', xC6 + 1, yD3 + 2)
  iramFit(pdf, tb.fecha || '—',
    xC6 + S(27.5), yD3 + T(4.25), S(53), T(5), 6.5, 4, false)

  // ── C6 D4 (8.5mm): Hoja ──────────────────────────────────────────────────
  iramRect(pdf, xC6, yD4, S(55), T(8.5))
  iramLabel(pdf, 'Hoja', xC6 + 1, yD4 + 2)
  iramFit(pdf, tb.hoja || '1',
    xC6 + S(27.5), yD4 + T(4.25), S(53), T(5), 8, 4.5, true)

  // ── Borde exterior ────────────────────────────────────────────────────────
  pdf.setDrawColor(30, 30, 30)
  pdf.setLineWidth(0.5)
  pdf.rect(x, y, w, h, 'S')
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
export function lon2worldX(lng: number, zoom: number): number {
  return ((lng + 180) / 360) * 256 * Math.pow(2, zoom)
}

export function lat2worldY(lat: number, zoom: number): number {
  const sin = Math.sin(lat * Math.PI / 180)
  return (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * 256 * Math.pow(2, zoom)
}

// Inversa de lat2worldY: dado worldY en píxeles, devuelve la latitud
export function worldY2lat(worldY: number, zoom: number): number {
  const yFrac = worldY / (256 * Math.pow(2, zoom))
  const k = Math.exp((0.5 - yFrac) * 4 * Math.PI)
  return Math.asin((k - 1) / (k + 1)) * 180 / Math.PI
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

  // CartoDB Positron nolabels @2x: renderizado vectorial interno → líneas suaves,
  // sin pixelación, sin bloques de edificios, sin artefactos de edge detection.
  const subdoms = ['a', 'b', 'c', 'd']
  let tileIdx = 0
  const tileTasks: Promise<void>[] = []
  for (let tx = tx0; tx < tx1; tx++) {
    for (let ty = ty0; ty < ty1; ty++) {
      const sx  = Math.round(tx * TILE - tlwx)
      const sy  = Math.round(ty * TILE - tlwy)
      const stx = ((tx % maxT) + maxT) % maxT
      const sty = ((ty % maxT) + maxT) % maxT
      const sub = subdoms[tileIdx++ % subdoms.length]
      const url = `https://${sub}.basemaps.cartocdn.com/light_nolabels/${zoom}/${stx}/${sty}@2x.png`
      tileTasks.push(loadTile(url, sx, sy))
    }
  }
  await Promise.all(tileTasks)

  // Realzar contraste: fondo→blanco puro, calles→gris visible, sin binarizar
  // CartoDB Positron: fondo ~240-255, calles ~175-225, agua/parques ~210-230
  {
    const imgData = ctx.getImageData(0, 0, canvasW, canvasH)
    const d = imgData.data
    for (let i = 0; i < d.length; i += 4) {
      const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
      const v = gray > 230 ? 255                                               // fondo → blanco
              : gray > 148 ? Math.round((gray - 148) / 82 * 190)              // calles → gris suave
              : Math.round(gray * 0.3)                                         // trazos oscuros
      d[i] = d[i + 1] = d[i + 2] = v
    }
    ctx.putImageData(imgData, 0, 0)
  }

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
    ctx.lineWidth   = 1.5
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
    const r = 4
    ctx.save()
    ctx.shadowColor   = 'rgba(0,0,0,0.2)'
    ctx.shadowBlur    = 2
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
      ctx.lineWidth   = 1.2
      ctx.stroke()
    } else {
      // Activo: relleno sólido
      ctx.fillStyle = color
      ctx.fill()
      ctx.shadowColor = 'transparent'
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth   = 1
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
    ctx.lineWidth   = 1
    ctx.stroke()
    ctx.restore()
  }
}

// ── Leyenda en PDF — adyacente al rótulo, mismo alto ─────────────────────────
// x: borde izquierdo, y: borde inferior, totalH: alto total (se ajusta al rótulo)
export function drawPdfLegend(pdf: InstanceType<typeof jsPDFType>, x: number, y: number, totalH = 44) {
  type CircleItem = { kind: 'circle'; label: string; hex: string }
  type LineItem   = { kind: 'line';   label: string; hex: string; dashed: boolean }
  type LegendItem = CircleItem | LineItem

  const items: LegendItem[] = [
    { kind: 'circle', label: 'Caja NAP',           hex: EXPORT_COLORS.nap        },
    { kind: 'circle', label: 'Caja empalme',        hex: EXPORT_COLORS.splice_box },
    { kind: 'circle', label: 'Poste',               hex: EXPORT_COLORS.poste      },
    { kind: 'circle', label: 'Nodo',                hex: EXPORT_COLORS.node       },
    { kind: 'circle', label: 'Res. de cable',       hex: EXPORT_COLORS.camera     },
    { kind: 'line',   label: 'Fibra activa',        hex: EXPORT_COLORS.fiber_line, dashed: false },
    { kind: 'line',   label: 'Fibra planificada',   hex: EXPORT_COLORS.fiber_line, dashed: true  },
  ]
  const LW  = 44
  const HDR = 7
  const RH  = (totalH - HDR - 1) / items.length

  // Fondo blanco
  pdf.setFillColor(255, 255, 255)
  pdf.setGState(pdf.GState({ opacity: 0.95 }))
  pdf.roundedRect(x, y - totalH, LW, totalH, 1.5, 1.5, 'F')
  pdf.setGState(pdf.GState({ opacity: 1 }))

  // Borde
  pdf.setDrawColor(160, 160, 160)
  pdf.setLineWidth(0.25)
  pdf.roundedRect(x, y - totalH, LW, totalH, 1.5, 1.5, 'S')

  const ty = y - totalH + 1.5

  // Título
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(5.5)
  pdf.setTextColor(40, 40, 40)
  pdf.text('REFERENCIAS', x + 2, ty + 3)

  const parseHex = (hex: string) => ({
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  })

  items.forEach((item, i) => {
    const iy = ty + HDR + i * RH + RH / 2
    const { r, g, b } = parseHex(item.hex)

    if (item.kind === 'circle') {
      pdf.setFillColor(r, g, b)
      pdf.setDrawColor(255, 255, 255)
      pdf.setLineWidth(0.3)
      pdf.circle(x + 4, iy, 1.4, 'FD')
    } else {
      // Línea de fibra — sólida o punteada
      pdf.setDrawColor(r, g, b)
      pdf.setLineWidth(0.8)
      if (item.dashed) {
        // jsPDF no tiene setLineDash nativo; usamos segmentos manuales
        const seg = 1.4, gap = 1.0
        let cx = x + 1
        while (cx + seg <= x + 9) {
          pdf.line(cx, iy, cx + seg, iy)
          cx += seg + gap
        }
      } else {
        pdf.line(x + 1, iy, x + 9, iy)
      }
      pdf.setLineWidth(0.25)
    }

    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(4.8)
    pdf.setTextColor(20, 20, 20)
    pdf.text(item.label, x + 11, iy, { baseline: 'middle' })
  })
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
