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
// Aguja de brújula cartográfica: rombo con norte negro y sur blanco.
// Estilo clásico de mapas geográficos (IRAM / IGN / topográficos).
export function drawNorthArrow(canvas: HTMLCanvasElement, dpr = 2) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const H   = 12 * dpr   // semialto del rombo (centro → punta)
  const W   =  4 * dpr   // semiancho del rombo (centro → lado)
  const PAD = 10 * dpr

  // Centro del rombo — esquina superior derecha
  const CX = canvas.width - PAD - W - 4 * dpr
  const CY = PAD + H + 8 * dpr   // margen para etiqueta "N" encima

  ctx.save()
  ctx.lineJoin = 'miter'

  // Mitad sur: blanca con borde negro (se dibuja primero)
  ctx.beginPath()
  ctx.moveTo(CX, CY + H)   // punta sur
  ctx.lineTo(CX - W, CY)
  ctx.lineTo(CX + W, CY)
  ctx.closePath()
  ctx.fillStyle = '#ffffff'
  ctx.fill()

  // Mitad norte: negra (encima de la anterior)
  ctx.beginPath()
  ctx.moveTo(CX, CY - H)   // punta norte
  ctx.lineTo(CX - W, CY)
  ctx.lineTo(CX + W, CY)
  ctx.closePath()
  ctx.fillStyle = '#1a1a1a'
  ctx.fill()

  // Borde exterior del rombo completo
  ctx.beginPath()
  ctx.moveTo(CX, CY - H)
  ctx.lineTo(CX - W, CY)
  ctx.lineTo(CX, CY + H)
  ctx.lineTo(CX + W, CY)
  ctx.closePath()
  ctx.strokeStyle = '#1a1a1a'
  ctx.lineWidth   = 1.0 * dpr
  ctx.stroke()

  // Línea divisoria horizontal (separa N y S)
  ctx.beginPath()
  ctx.moveTo(CX - W, CY)
  ctx.lineTo(CX + W, CY)
  ctx.stroke()

  // Punto central
  ctx.beginPath()
  ctx.arc(CX, CY, 1.8 * dpr, 0, Math.PI * 2)
  ctx.fillStyle = '#ffffff'
  ctx.fill()
  ctx.strokeStyle = '#1a1a1a'
  ctx.lineWidth   = 0.7 * dpr
  ctx.stroke()

  // Etiqueta "N" sobre la punta norte
  ctx.font          = `bold ${9 * dpr}px Arial, Helvetica, sans-serif`
  ctx.textAlign     = 'center'
  ctx.textBaseline  = 'middle'
  ctx.fillStyle     = '#1a1a1a'
  ctx.fillText('N', CX, CY - H - 6 * dpr)

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
    // C3: fecha (solo fila Dibujó) — minFs 3.2 para que quepa en una línea
    iramRect(pdf, xC3, ry, S(10), dh)
    if (i === 0) {
      iramLabel(pdf, 'Fecha', xC3 + 1, ry + 1.8)
      iramFit(pdf, tb.fecha || '', xC3 + S(5), ry + dh * 0.70, S(9.5), dh * 0.5, 5, 3.2)
    }
    // C4: nombre — centrado en toda la celda
    iramRect(pdf, xC4, ry, S(19), dh)
    if (val) {
      iramFit(pdf, val, xC4 + S(9.5), ry + dh / 2, S(18), dh - 1, 5.5, 3.8, false)
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
  nap:               '#16a34a',
  splice_box:        '#f97316',
  poste:             '#d97706',
  node:              '#2563eb',
  camera:            '#0891b2',
  fiber_line:        '#1d4ed8',
  zone:              '#8b5cf6',
  fiber_aerial:      '#15803d',
  fiber_underground: '#92400e',
  manhole:           '#7c3aed',
  fdh:               '#0e7490',
  ont:               '#be185d',
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

// ── Carga tile raster con CORS ────────────────────────────────────────────────
function loadTile(url: string): Promise<HTMLImageElement | null> {
  return new Promise(resolve => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload  = () => resolve(img)
    img.onerror = () => resolve(null)
    setTimeout(() => resolve(null), 8000)
    img.src = url
  })
}

// ── Renderer: plano técnico tipo CAD — fondo blanco, trazado negro Overpass ───
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

  // Fondo blanco puro — estilo plano técnico
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvasW, canvasH)

  const cwx  = lon2worldX(center.lng, zoom)
  const cwy  = lat2worldY(center.lat, zoom)
  const tlwx = cwx - canvasW / 2
  const tlwy = cwy - canvasH / 2

  const toPixel = (lng: number, lat: number) => ({
    x: lon2worldX(lng, zoom) - tlwx,
    y: lat2worldY(lat, zoom) - tlwy,
  })

  // Bbox con padding para que no queden calles cortadas en los bordes
  const z2    = 256 * Math.pow(2, zoom)
  const pad   = 0.004
  const south = worldY2lat(tlwy + canvasH, zoom) - pad
  const north = worldY2lat(tlwy,           zoom) + pad
  const west  = tlwx             / z2 * 360 - 180 - pad
  const east  = (tlwx + canvasW) / z2 * 360 - 180 + pad

  // Anchos de casing [exterior negro, interior blanco] por tipo de vía
  const CW: Record<string, [number, number]> = {
    motorway:      [16, 11], trunk:         [14,  9.5],
    primary:       [11,  7], secondary:     [ 8,  5.0],
    tertiary:      [ 7,  4.5], residential: [ 6,  3.5],
    unclassified:  [ 6,  3.5], living_street:[ 5,  3.0],
    service:       [ 4,  2.2], pedestrian:   [ 3,  1.5],
  }
  const DEF: [number, number] = [5, 3]

  function drawWays(ways: any[], lw: (hw: string) => number, color: string) {
    ctx.strokeStyle = color; ctx.lineJoin = 'round'; ctx.lineCap = 'round'
    for (const el of ways) {
      if (el.type !== 'way' || !el.geometry?.length) continue
      ctx.lineWidth = lw(el.tags?.highway ?? '')
      const g = el.geometry as { lon: number; lat: number }[]
      ctx.beginPath()
      const p0 = toPixel(g[0].lon, g[0].lat)
      ctx.moveTo(p0.x, p0.y)
      for (let i = 1; i < g.length; i++) {
        const p = toPixel(g[i].lon, g[i].lat)
        ctx.lineTo(p.x, p.y)
      }
      ctx.stroke()
    }
  }

  const ENDPOINTS = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
  ]
  const q = `[out:json][timeout:18];(way["highway"~"motorway|trunk|primary|secondary|tertiary|residential|unclassified|service|living_street|pedestrian"](${south},${west},${north},${east}););out geom;`

  let ways: any[] = []
  for (const ep of ENDPOINTS) {
    try {
      const ctrl = new AbortController()
      const tid  = setTimeout(() => ctrl.abort(), 15000)
      const resp = await fetch(`${ep}?data=${encodeURIComponent(q)}`, { signal: ctrl.signal, cache: 'no-store' })
        .catch(() => null).finally(() => clearTimeout(tid))
      if (resp?.ok) {
        ways = ((await resp.json()).elements as any[]).filter(e => e.type === 'way' && e.geometry?.length >= 2)
        break
      }
    } catch { /* siguiente endpoint */ }
  }

  if (ways.length > 0) {
    // Pasada 1 — casing negro
    drawWays(ways, hw => (CW[hw] ?? DEF)[0], '#111111')
    // Pasada 2 — relleno blanco (deja solo el borde negro visible)
    drawWays(ways, hw => (CW[hw] ?? DEF)[1], '#ffffff')
    // Pasada 3 — nombres de calles alineados al eje de la vía
    drawStreetLabels(ctx, ways, toPixel, canvasW)
  }

  // Orden de capas FTTH: zonas → líneas → puntos
  const zones  = features.filter(f => f.geometry.type === 'Polygon')
  const lines  = features.filter(f => f.geometry.type === 'LineString')
  const points = features.filter(f => f.geometry.type === 'Point')
  for (const f of [...zones, ...lines, ...points]) {
    drawFeatureOnCanvas(ctx, f, toPixel)
  }

  return canvas
}

// Nombres de calles alineados al eje de la vía, solo para calles con nombre
// y tramo suficientemente largo para caber el texto sin solapamiento.
function drawStreetLabels(
  ctx: CanvasRenderingContext2D,
  ways: any[],
  toPixel: (lng: number, lat: number) => { x: number; y: number },
  canvasW: number,
) {
  // Tamaño base por tipo de vía (px en canvas de referencia 900px)
  const BASE: Record<string, number> = {
    motorway: 10, trunk: 9, primary: 9, secondary: 8,
    tertiary: 7, residential: 6, unclassified: 6, living_street: 5,
  }
  const sc = Math.max(1.5, canvasW / 900)
  // Deduplicación por nombre: evita el mismo label dos veces muy cerca,
  // pero permite que calles distintas que se crucen sean etiquetadas.
  const placedByName = new Map<string, Array<{ x: number; y: number }>>()

  ctx.save()
  ctx.textBaseline = 'middle'
  ctx.textAlign    = 'center'

  for (const el of ways) {
    const hw   = el.tags?.highway ?? ''
    const name = el.tags?.name as string | undefined
    if (!name || !(hw in BASE)) continue

    const g = el.geometry as { lon: number; lat: number }[]
    if (g.length < 2) continue

    // Segmento más largo = mejor ángulo de lectura
    let bestI = 0, maxLen = 0
    for (let i = 0; i < g.length - 1; i++) {
      const a = toPixel(g[i].lon, g[i].lat)
      const b = toPixel(g[i + 1].lon, g[i + 1].lat)
      const l = Math.hypot(b.x - a.x, b.y - a.y)
      if (l > maxLen) { maxLen = l; bestI = i }
    }

    const fontSize = Math.round(BASE[hw] * sc)
    ctx.font = `${fontSize}px Arial, sans-serif`
    const textW = ctx.measureText(name).width
    if (maxLen < textW * 1.1) continue  // tramo demasiado corto para el texto

    const a  = toPixel(g[bestI].lon, g[bestI].lat)
    const b  = toPixel(g[bestI + 1].lon, g[bestI + 1].lat)
    const cx = (a.x + b.x) / 2
    const cy = (a.y + b.y) / 2

    // Solo evitar el mismo nombre repetido muy cerca (no bloquear nombres distintos)
    const prev = placedByName.get(name) ?? []
    const minDist = textW * 2.2
    if (prev.some(p => Math.hypot(p.x - cx, p.y - cy) < minDist)) continue
    prev.push({ x: cx, y: cy })
    placedByName.set(name, prev)

    let angle = Math.atan2(b.y - a.y, b.x - a.x)
    if (angle > Math.PI / 2)  angle -= Math.PI
    if (angle < -Math.PI / 2) angle += Math.PI

    ctx.save()
    ctx.translate(cx, cy)
    ctx.rotate(angle)
    // Halo fino blanco para legibilidad sobre el fondo blanco con bordes negros
    ctx.strokeStyle = 'rgba(255,255,255,0.95)'
    ctx.lineWidth   = fontSize * 0.35
    ctx.lineJoin    = 'round'
    ctx.strokeText(name, 0, 0)
    ctx.fillStyle   = '#222222'
    ctx.fillText(name, 0, 0)
    ctx.restore()
  }

  ctx.restore()
}

function drawFeatureOnCanvas(
  ctx: CanvasRenderingContext2D,
  feature: import('./types').AppFeature,
  toPixel: (lng: number, lat: number) => { x: number; y: number },
) {
  const { geometry, properties } = feature
  const kind    = properties.featureType
  let   color   = EXPORT_COLORS[kind] ?? properties.color ?? '#3b82f6'
  const planned = properties.status === 'planned'
  // Fibra activa = azul, planificada = rojo punteado
  if (kind === 'fiber_line') color = planned ? '#dc2626' : '#1d4ed8'

  // Escala adaptativa: canvas de 2800px → sc≈3.1; menor → proporcional
  const sc = Math.max(1.5, ctx.canvas.width / 900)

  if (geometry.type === 'LineString') {
    const coords = (geometry as GeoJSON.LineString).coordinates
    if (coords.length < 2) return
    ctx.save()
    ctx.strokeStyle = color
    ctx.lineJoin    = 'round'
    ctx.lineCap     = 'round'

    if (kind === 'fiber_aerial') {
      ctx.lineWidth = 1.2 * sc
      ctx.beginPath()
      const p0a = toPixel(coords[0][0], coords[0][1])
      ctx.moveTo(p0a.x, p0a.y)
      for (let i = 1; i < coords.length; i++) { const pa = toPixel(coords[i][0], coords[i][1]); ctx.lineTo(pa.x, pa.y) }
      ctx.stroke()
      ctx.lineWidth = 0.55 * sc
      for (let i = 0; i < coords.length - 1; i++) {
        const pa = toPixel(coords[i][0], coords[i][1])
        const pb = toPixel(coords[i + 1][0], coords[i + 1][1])
        const segLen = Math.hypot(pb.x - pa.x, pb.y - pa.y)
        const count = Math.max(1, Math.round(segLen / (18 * sc)))
        for (let k = 0; k < count; k++) {
          const t0 = k / count, t1 = (k + 1) / count
          const ax = pa.x + t0 * (pb.x - pa.x), ay = pa.y + t0 * (pb.y - pa.y)
          const bx = pa.x + t1 * (pb.x - pa.x), by = pa.y + t1 * (pb.y - pa.y)
          const mx = (ax + bx) / 2, my = (ay + by) / 2
          const nx = -(by - ay), ny = bx - ax
          const nl = Math.hypot(nx, ny) || 1
          ctx.beginPath(); ctx.moveTo(ax, ay)
          ctx.quadraticCurveTo(mx + nx / nl * 4 * sc, my + ny / nl * 4 * sc, bx, by)
          ctx.stroke()
        }
      }
    } else if (kind === 'fiber_underground') {
      ctx.lineWidth = 1.2 * sc
      ctx.setLineDash([7 * sc, 4 * sc])
      ctx.beginPath()
      const p0u = toPixel(coords[0][0], coords[0][1])
      ctx.moveTo(p0u.x, p0u.y)
      for (let i = 1; i < coords.length; i++) { const pu = toPixel(coords[i][0], coords[i][1]); ctx.lineTo(pu.x, pu.y) }
      ctx.stroke()
    } else {
      if (kind === 'fiber_line') color = planned ? '#dc2626' : '#1d4ed8'
      ctx.lineWidth = 1.5 * sc
      if (planned) ctx.setLineDash([6 * sc, 4 * sc])
      ctx.beginPath()
      const p0 = toPixel(coords[0][0], coords[0][1])
      ctx.moveTo(p0.x, p0.y)
      for (let i = 1; i < coords.length; i++) { const p = toPixel(coords[i][0], coords[i][1]); ctx.lineTo(p.x, p.y) }
      ctx.stroke()
    }
    ctx.restore()

  } else if (geometry.type === 'Point') {
    const p = toPixel(
      (geometry as GeoJSON.Point).coordinates[0],
      (geometry as GeoJSON.Point).coordinates[1],
    )
    const d = Math.round(6 * sc * 0.65)  // iconos más compactos para mejor lectura del mapa
    const ft = kind

    ctx.save()
    ctx.strokeStyle = color
    ctx.fillStyle   = color
    ctx.lineWidth   = 0.7 * sc
    if (planned) ctx.setLineDash([3 * sc, 2 * sc])

    // ── FTTH standard symbols — ITU-T G.671 / G.984 ──────────────────────────
    if (ft === 'node') {
      // ODF: double rect + 4 connector dots
      ctx.shadowColor = 'rgba(0,0,0,0.25)'; ctx.shadowBlur = 2; ctx.shadowOffsetY = 1
      ctx.globalAlpha = planned ? 0.5 : 1
      ctx.strokeRect(p.x - d, p.y - d * 0.75, d * 2, d * 1.5)
      ctx.strokeRect(p.x - d * 0.7, p.y - d * 0.5, d * 1.4, d)
      ctx.shadowColor = 'transparent'
      if (!planned) {
        ctx.fillStyle = color
        ;[-0.55, -0.2, 0.2, 0.55].forEach(ox => {
          ctx.beginPath(); ctx.arc(p.x + ox * d, p.y - d * 0.35, d * 0.14, 0, Math.PI * 2); ctx.fill()
        })
      }
    } else if (ft === 'splice_box') {
      // Manga: horizontal ellipse + entry lines
      ctx.shadowColor = 'rgba(0,0,0,0.2)'; ctx.shadowBlur = 2; ctx.shadowOffsetY = 1
      ctx.globalAlpha = planned ? 0.5 : 1
      ctx.beginPath(); ctx.ellipse(p.x, p.y, d * 1.1, d * 0.65, 0, 0, Math.PI * 2); ctx.stroke()
      ctx.beginPath(); ctx.ellipse(p.x, p.y, d * 0.65, d * 0.35, 0, 0, Math.PI * 2); ctx.stroke()
      ctx.shadowColor = 'transparent'
      ctx.beginPath()
      ctx.moveTo(p.x - d * 1.1 - 3, p.y); ctx.lineTo(p.x - d * 1.1, p.y)
      ctx.moveTo(p.x + d * 1.1, p.y); ctx.lineTo(p.x + d * 1.1 + 3, p.y)
      ctx.stroke()
    } else if (ft === 'nap') {
      // NAP/FAT: rect + 4 output ports
      ctx.shadowColor = 'rgba(0,0,0,0.2)'; ctx.shadowBlur = 2; ctx.shadowOffsetY = 1
      ctx.globalAlpha = planned ? 0.5 : 1
      ctx.strokeRect(p.x - d, p.y - d, d * 1.5, d * 2)
      ctx.shadowColor = 'transparent'
      const ox = p.x + d * 0.5 + 2
      ;[-0.65, -0.22, 0.22, 0.65].forEach(oy => {
        ctx.beginPath(); ctx.moveTo(ox, p.y + oy * d); ctx.lineTo(ox + 4, p.y + oy * d); ctx.stroke()
      })
      ctx.beginPath(); ctx.moveTo(p.x - d - 3, p.y); ctx.lineTo(p.x - d, p.y); ctx.stroke()
    } else if (ft === 'fdh') {
      // FDH: rect + 2×3 dot grid + side lines
      ctx.shadowColor = 'rgba(0,0,0,0.2)'; ctx.shadowBlur = 2; ctx.shadowOffsetY = 1
      ctx.globalAlpha = planned ? 0.5 : 1
      ctx.strokeRect(p.x - d, p.y - d, d * 1.6, d * 2)
      ctx.shadowColor = 'transparent'
      if (!planned) {
        ;[-0.55, -0.0, 0.55].forEach(oy =>
          [-0.6, 0.0].forEach(ox => {
            ctx.beginPath(); ctx.arc(p.x - d * 0.1 + ox * d * 0.85, p.y + oy * d * 0.8, d * 0.15, 0, Math.PI * 2); ctx.fill()
          })
        )
      }
      ;[-0.55, 0, 0.55].forEach(oy => {
        ctx.beginPath(); ctx.moveTo(p.x + d * 0.6, p.y + oy * d); ctx.lineTo(p.x + d * 0.6 + 4, p.y + oy * d); ctx.stroke()
      })
    } else if (ft === 'manhole') {
      // Cámara: dashed rect + grid lines
      ctx.shadowColor = 'rgba(0,0,0,0.2)'; ctx.shadowBlur = 2; ctx.shadowOffsetY = 1
      ctx.strokeRect(p.x - d, p.y - d * 0.75, d * 2, d * 1.5)
      ctx.shadowColor = 'transparent'
      ctx.lineWidth = 0.8 * sc
      ;[-0.2, 0.2].forEach(oy => {
        ctx.beginPath(); ctx.moveTo(p.x - d, p.y + oy * d); ctx.lineTo(p.x + d, p.y + oy * d); ctx.stroke()
      })
      ;[-0.3, 0.3].forEach(ox => {
        ctx.beginPath(); ctx.moveTo(p.x + ox * d, p.y - d * 0.75); ctx.lineTo(p.x + ox * d, p.y + d * 0.75); ctx.stroke()
      })
    } else if (ft === 'ont') {
      // ONT: rect + LED strip
      ctx.shadowColor = 'rgba(0,0,0,0.2)'; ctx.shadowBlur = 2; ctx.shadowOffsetY = 1
      ctx.globalAlpha = planned ? 0.5 : 1
      ctx.strokeRect(p.x - d * 0.9, p.y - d * 0.75, d * 1.8, d * 1.5)
      ctx.shadowColor = 'transparent'
      if (!planned) {
        const ledColors = ['#00e676', '#00e676', '#ffca28']
        ledColors.forEach((lc, k) => {
          ctx.fillStyle = lc
          ctx.beginPath(); ctx.arc(p.x - d * 0.45 + k * d * 0.45, p.y - d * 0.42, d * 0.17, 0, Math.PI * 2); ctx.fill()
        })
        ctx.fillStyle = color
      }
    } else if (ft === 'poste') {
      // Poste ADSS: fuste + cruceta + puntos en extremos + base
      ctx.lineWidth = 0.9 * sc
      ctx.beginPath(); ctx.moveTo(p.x, p.y - d * 1.3); ctx.lineTo(p.x, p.y + d * 0.8); ctx.stroke()
      ctx.lineWidth = 0.7 * sc
      ctx.beginPath(); ctx.moveTo(p.x - d * 0.9, p.y - d * 0.7); ctx.lineTo(p.x + d * 0.9, p.y - d * 0.7); ctx.stroke()
      // Puntos en extremos de cruceta
      ctx.beginPath(); ctx.arc(p.x - d * 0.9, p.y - d * 0.7, d * 0.22, 0, Math.PI * 2); ctx.fill()
      ctx.beginPath(); ctx.arc(p.x + d * 0.9, p.y - d * 0.7, d * 0.22, 0, Math.PI * 2); ctx.fill()
      // Base
      ctx.beginPath(); ctx.arc(p.x, p.y + d * 0.8, d * 0.28, 0, Math.PI * 2); ctx.fill()
    } else if (ft === 'camera') {
      // Reserva de cable: concentric circles
      ctx.lineWidth = 1; [d, d * 0.65, d * 0.35].forEach((r, i) => {
        ctx.globalAlpha = 0.3 + i * 0.3
        ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.stroke()
      })
      ctx.globalAlpha = 1
      ctx.beginPath(); ctx.arc(p.x, p.y, d * 0.12, 0, Math.PI * 2); ctx.fill()
    } else {
      // Fallback circle
      ctx.beginPath(); ctx.arc(p.x, p.y, d, 0, Math.PI * 2)
      ctx.fillStyle = color; ctx.fill()
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 0.8; ctx.stroke()
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
// features: si se pasa, solo muestra ítems cuyos tipos están presentes en el mapa
export function drawPdfLegend(
  pdf: InstanceType<typeof jsPDFType>,
  x: number, y: number,
  totalH = 44,
  features?: import('./types').AppFeature[],
) {
  type LegendItem = {
    label: string; hex: string; key: string
    draw: (pdf: InstanceType<typeof jsPDFType>, ix: number, iy: number, d: number) => void
  }

  const ph = (hex: string) => ({
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  })

  function drawSeg(pdf: InstanceType<typeof jsPDFType>, ix: number, iy: number, dashed = false) {
    if (dashed) {
      const seg = 1.6, gap = 1.0; let cx = ix - 5
      while (cx + seg <= ix + 5) { pdf.line(cx, iy, cx + seg, iy); cx += seg + gap }
    } else { pdf.line(ix - 5, iy, ix + 5, iy) }
  }

  // Calcula las claves de tipos presentes en el mapa
  const presentKeys = new Set<string>()
  if (features) {
    for (const f of features) {
      const ft = f.properties.featureType
      if (ft === 'fiber_line') {
        presentKeys.add(f.properties.status === 'planned' ? 'fiber_line:planned' : 'fiber_line:active')
      } else {
        presentKeys.add(ft)
      }
    }
  }
  const show = (key: string) => !features || presentKeys.has(key)

  // ── Grupo 1: Equipos pasivos FTTH ──────────────────────────────────────────
  const allEquipos: LegendItem[] = [
    { label: 'Nodo / ODF',         key: 'node',       hex: EXPORT_COLORS.node,
      draw(pdf, ix, iy, d) {
        const {r,g,b} = ph(this.hex); pdf.setDrawColor(r,g,b); pdf.setFillColor(r,g,b); pdf.setLineWidth(0.25)
        pdf.rect(ix - d, iy - d * 0.75, d * 2, d * 1.5, 'S')
        pdf.rect(ix - d * 0.65, iy - d * 0.45, d * 1.3, d * 0.9, 'S')
        ;[-0.5, -0.17, 0.17, 0.5].forEach(ox => pdf.circle(ix + ox * d, iy - d * 0.3, d * 0.13, 'F'))
      }},
    { label: 'Manga / Empalme',    key: 'splice_box', hex: EXPORT_COLORS.splice_box,
      draw(pdf, ix, iy, d) {
        const {r,g,b} = ph(this.hex); pdf.setDrawColor(r,g,b); pdf.setLineWidth(0.25)
        pdf.ellipse(ix, iy, d * 1.1, d * 0.58, 'S')
        pdf.ellipse(ix, iy, d * 0.6, d * 0.3, 'S')
        pdf.setLineWidth(0.18)
        pdf.line(ix - d * 1.1 - 2, iy, ix - d * 1.1, iy)
        pdf.line(ix + d * 1.1, iy, ix + d * 1.1 + 2, iy)
      }},
    { label: 'Caja NAP / FAT',     key: 'nap',        hex: EXPORT_COLORS.nap,
      draw(pdf, ix, iy, d) {
        const {r,g,b} = ph(this.hex); pdf.setDrawColor(r,g,b); pdf.setLineWidth(0.25)
        pdf.rect(ix - d, iy - d, d * 1.5, d * 2, 'S')
        pdf.setLineWidth(0.18)
        ;[-0.65, -0.22, 0.22, 0.65].forEach(oy => pdf.line(ix + d * 0.5, iy + oy * d, ix + d * 0.5 + 2.5, iy + oy * d))
        pdf.line(ix - d - 2, iy, ix - d, iy)
      }},
    { label: 'FDH / Hub',          key: 'fdh',        hex: EXPORT_COLORS.fdh,
      draw(pdf, ix, iy, d) {
        const {r,g,b} = ph(this.hex); pdf.setDrawColor(r,g,b); pdf.setFillColor(r,g,b); pdf.setLineWidth(0.25)
        pdf.rect(ix - d, iy - d, d * 1.6, d * 2, 'S')
        ;[-0.5, 0.1].forEach(oy => [-0.55, 0.05].forEach(ox =>
          pdf.circle(ix - d * 0.1 + ox * d * 0.8, iy + oy * d * 0.85, d * 0.13, 'F')
        ))
      }},
    { label: 'Cámara subterránea', key: 'manhole',    hex: EXPORT_COLORS.manhole,
      draw(pdf, ix, iy, d) {
        const {r,g,b} = ph(this.hex); pdf.setDrawColor(r,g,b); pdf.setLineWidth(0.25)
        pdf.setLineDashPattern([1.0, 0.7], 0)
        pdf.rect(ix - d, iy - d * 0.7, d * 2, d * 1.4, 'S')
        pdf.setLineDashPattern([], 0)
        pdf.setLineWidth(0.15)
        ;[-0.2, 0.2].forEach(oy => pdf.line(ix - d, iy + oy * d, ix + d, iy + oy * d))
        ;[-0.3, 0.3].forEach(ox => pdf.line(ix + ox * d, iy - d * 0.7, ix + ox * d, iy + d * 0.7))
      }},
    { label: 'ONT / Terminal',     key: 'ont',        hex: EXPORT_COLORS.ont,
      draw(pdf, ix, iy, d) {
        const {r,g,b} = ph(this.hex); pdf.setDrawColor(r,g,b); pdf.setLineWidth(0.25)
        pdf.rect(ix - d * 0.9, iy - d * 0.7, d * 1.8, d * 1.4, 'S')
        const leds: [number,number,number][] = [[92,212,0],[92,212,115],[250,202,230]]
        leds.forEach(([rr,gg,bb], k) => {
          pdf.setFillColor(rr, gg, bb)
          pdf.circle(ix - d * 0.4 + k * d * 0.4, iy - d * 0.35, d * 0.15, 'F')
        })
      }},
    { label: 'Poste ADSS',         key: 'poste',      hex: EXPORT_COLORS.poste,
      draw(pdf, ix, iy, d) {
        const {r,g,b} = ph(this.hex); pdf.setDrawColor(r,g,b); pdf.setFillColor(r,g,b)
        pdf.setLineWidth(0.32); pdf.line(ix, iy - d * 1.2, ix, iy + d * 0.8)
        pdf.setLineWidth(0.25); pdf.line(ix - d * 0.9, iy - d * 0.6, ix + d * 0.9, iy - d * 0.6)
        pdf.circle(ix - d * 0.9, iy - d * 0.6, d * 0.16, 'F')
        pdf.circle(ix + d * 0.9, iy - d * 0.6, d * 0.16, 'F')
        pdf.circle(ix, iy + d * 0.8, d * 0.20, 'F')
      }},
    { label: 'Reserva de cable',   key: 'camera',     hex: EXPORT_COLORS.camera,
      draw(pdf, ix, iy, d) {
        const {r,g,b} = ph(this.hex); pdf.setDrawColor(r,g,b); pdf.setLineWidth(0.20)
        ;[d, d * 0.65, d * 0.35].forEach(r2 => pdf.circle(ix, iy, r2, 'S'))
      }},
  ]

  // ── Grupo 2: Tipos de fibra ─────────────────────────────────────────────────
  const allFibras: LegendItem[] = [
    { label: 'Fibra SMF activa',      key: 'fiber_line:active',  hex: '#1d4ed8',
      draw(pdf, ix, iy) {
        const {r,g,b} = ph('#1d4ed8'); pdf.setDrawColor(r,g,b); pdf.setLineWidth(0.55); drawSeg(pdf, ix, iy)
      }},
    { label: 'Fibra SMF planificada', key: 'fiber_line:planned', hex: '#dc2626',
      draw(pdf, ix, iy) {
        const {r,g,b} = ph('#dc2626'); pdf.setDrawColor(r,g,b); pdf.setLineWidth(0.55); drawSeg(pdf, ix, iy, true)
      }},
    { label: 'Fibra aérea ADSS',      key: 'fiber_aerial',       hex: EXPORT_COLORS.fiber_aerial,
      draw(pdf, ix, iy, d) {
        const {r,g,b} = ph(this.hex); pdf.setDrawColor(r,g,b); pdf.setLineWidth(0.55)
        drawSeg(pdf, ix, iy + d * 0.3)
        pdf.setLineWidth(0.20)
        ;[-0.5, 0.1].forEach(ox => {
          pdf.lines([[d * 0.6, -d * 0.55], [d * 0.6, d * 0.55]], ix + ox * d * 1.4, iy + d * 0.3, [1,1], undefined, false)
        })
      }},
    { label: 'Fibra subterránea',     key: 'fiber_underground',  hex: EXPORT_COLORS.fiber_underground,
      draw(pdf, ix, iy) {
        const {r,g,b} = ph(this.hex); pdf.setDrawColor(r,g,b); pdf.setLineWidth(0.55); drawSeg(pdf, ix, iy, true)
      }},
  ]

  // Filtrar a solo los tipos presentes en el mapa
  const equipos = allEquipos.filter(item => show(item.key))
  const fibras  = allFibras.filter(item => show(item.key))

  if (equipos.length === 0 && fibras.length === 0) return  // nada que mostrar

  // ── Layout ─────────────────────────────────────────────────────────────────
  const LW       = 55
  const HDR_MAIN = 6.0
  const SEP_H    = fibras.length > 0 && equipos.length > 0 ? 1.5 : 0
  const allItems = equipos.length + fibras.length
  const RH       = (totalH - HDR_MAIN - SEP_H - 1) / allItems
  const d        = Math.min(0.85, RH * 0.38)  // icono compacto — cabe en la fila sin solaparse

  pdf.setFillColor(255, 255, 255)
  pdf.setGState(pdf.GState({ opacity: 0.95 }))
  pdf.roundedRect(x, y - totalH, LW, totalH, 1.5, 1.5, 'F')
  pdf.setGState(pdf.GState({ opacity: 1 }))

  let cursor = y - totalH + 1.5

  // Título + etiquetas de sección
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(5.5)
  pdf.setTextColor(30, 30, 30)
  pdf.text('REFERENCIAS FTTH', x + 2, cursor + 2.8)
  // Chips de sección a la derecha del título
  pdf.setFontSize(3.8)
  pdf.setTextColor(60, 100, 180)
  pdf.text('EQUIPOS', x + LW - 25, cursor + 2.0)
  pdf.setTextColor(30, 120, 50)
  pdf.text('/ FIBRAS', x + LW - 14, cursor + 2.0)
  cursor += HDR_MAIN

  // ── Ítems de equipos
  equipos.forEach(item => {
    const iy2 = cursor + RH / 2
    item.draw(pdf, x + 5.5, iy2, d)
    pdf.setLineDashPattern([], 0)
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(4.6)
    pdf.setTextColor(20, 20, 20)
    pdf.text(item.label, x + 12, iy2, { baseline: 'middle' })
    cursor += RH
  })

  // Separador fino entre equipos y fibras
  pdf.setDrawColor(180, 180, 180)
  pdf.setLineWidth(0.25)
  pdf.setLineDashPattern([1, 0.8], 0)
  pdf.line(x + 1, cursor, x + LW - 1, cursor)
  pdf.setLineDashPattern([], 0)
  cursor += SEP_H

  // ── Ítems de fibras
  fibras.forEach(item => {
    const iy2 = cursor + RH / 2
    item.draw(pdf, x + 5.5, iy2, d)
    pdf.setLineDashPattern([], 0)
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(4.6)
    pdf.setTextColor(20, 20, 20)
    pdf.text(item.label, x + 12, iy2, { baseline: 'middle' })
    cursor += RH
  })
}

// ── Plano índice: muestra orientación y posición de la hoja actual ───────────
// Ubicado en el área del plano. totalPages: 1, 2 o 4. pageIndex: 0-based.
export function drawIndexDiagram(
  pdf: InstanceType<typeof jsPDFType>,
  x: number, y: number, w: number, h: number,
  pageIndex: number,
  totalPages: number,
  division?: string,
) {
  const HDR = 3
  pdf.setFillColor(255, 255, 255)
  pdf.setDrawColor(90, 90, 90)
  pdf.setLineWidth(0.3)
  pdf.rect(x, y, w, h, 'FD')

  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(3.2)
  pdf.setTextColor(50, 50, 50)
  pdf.text('PLANO ÍNDICE', x + w / 2, y + HDR * 0.6, { align: 'center', baseline: 'middle' })

  // Layout del grid según tipo de división
  let cols: number, rows: number
  if (totalPages >= 4) {
    cols = 2; rows = 2
  } else if (totalPages === 2) {
    // '2h' = arriba/abajo → 1 col × 2 filas
    // '2v' = izq/der      → 2 cols × 1 fila
    cols = division === '2h' ? 1 : 2
    rows = division === '2h' ? 2 : 1
  } else {
    cols = 1; rows = 1
  }

  const LEG_H = 3.5
  const gy = y + HDR
  const gh = h - HDR - LEG_H
  const cw = w / cols
  const ch = gh / rows

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const idx  = r * cols + c
      const cx   = x + c * cw
      const cy   = gy + r * ch
      const curr = idx === pageIndex
      pdf.setFillColor(...(curr ? [190, 220, 255] as [number,number,number]
                               : [232, 232, 232] as [number,number,number]))
      pdf.setDrawColor(110, 110, 110)
      pdf.setLineWidth(0.2)
      pdf.rect(cx, cy, cw, ch, 'FD')
      pdf.setFont('helvetica', curr ? 'bold' : 'normal')
      pdf.setFontSize(totalPages >= 4 ? 4.5 : 5.5)
      pdf.setTextColor(...(curr ? [15, 50, 130] as [number,number,number]
                               : [80, 80, 80] as [number,number,number]))
      pdf.text(`${idx + 1}`, cx + cw / 2, cy + ch / 2, { align: 'center', baseline: 'middle' })
    }
  }

  // Referencia: cuadro azul + "Esta hoja"
  const ly = y + h - LEG_H + 0.5
  pdf.setFillColor(190, 220, 255)
  pdf.rect(x + 0.8, ly, 2, 1.8, 'F')
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(2.8)
  pdf.setTextColor(80, 80, 80)
  pdf.text('Esta hoja', x + 3.5, ly + 0.9, { baseline: 'middle' })
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
