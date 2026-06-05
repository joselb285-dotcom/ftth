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

// ── Renderer: fondo blanco + calles negras vectoriales (Overpass OSM) ─────────
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

  const cwx  = lon2worldX(center.lng, zoom)
  const cwy  = lat2worldY(center.lat, zoom)
  const tlwx = cwx - canvasW / 2
  const tlwy = cwy - canvasH / 2

  const toPixel = (lng: number, lat: number) => ({
    x: lon2worldX(lng, zoom) - tlwx,
    y: lat2worldY(lat, zoom) - tlwy,
  })

  // Bounding box del viewport + pequeño margen
  const z2    = 256 * Math.pow(2, zoom)
  const pad   = 0.002
  const south = worldY2lat(tlwy + canvasH, zoom) - pad
  const north = worldY2lat(tlwy,           zoom) + pad
  const west  = tlwx            / z2 * 360 - 180 - pad
  const east  = (tlwx + canvasW) / z2 * 360 - 180 + pad

  // Grosor de línea por tipo de vía
  const LW: Record<string, number> = {
    motorway: 2.5, trunk: 2.2, primary: 2.0,
    secondary: 1.7, tertiary: 1.4,
    residential: 1.1, unclassified: 1.1,
    living_street: 1.0, service: 0.8, pedestrian: 0.8,
  }

  try {
    const bbox = `${south},${west},${north},${east}`
    const q    = `[out:json][timeout:20];(way["highway"~"motorway|trunk|primary|secondary|tertiary|residential|unclassified|service|living_street|pedestrian"](${bbox}););out geom;`
    const ctrl = new AbortController()
    const tid  = setTimeout(() => ctrl.abort(), 18000)
    const resp = await fetch(
      `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(q)}`,
      { signal: ctrl.signal, cache: 'no-store' }
    ).finally(() => clearTimeout(tid))

    if (resp.ok) {
      const data = await resp.json()
      ctx.strokeStyle = '#222222'
      ctx.lineJoin    = 'round'
      ctx.lineCap     = 'round'

      for (const el of (data.elements as any[])) {
        if (el.type !== 'way' || !el.geometry?.length) continue
        ctx.lineWidth = LW[el.tags?.highway] ?? 1.0
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
  } catch { /* sin internet → fondo blanco con solo la red FTTH */ }

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
    const d = 6     // tamaño base del ícono (aumentado para legibilidad)
    const ft = kind  // feature type

    ctx.save()
    ctx.shadowColor   = 'rgba(0,0,0,0.2)'
    ctx.shadowBlur    = 2
    ctx.shadowOffsetX = 1
    ctx.shadowOffsetY = 1

    if (ft === 'poste' || ft === 'camera') {
      ctx.shadowColor = 'transparent'
      ctx.strokeStyle = color
      ctx.lineWidth   = 1.5
      if (planned) ctx.setLineDash([3, 2])
      if (ft === 'poste') {
        // Asterisco * (3 líneas a 0°, 60°, 120°)
        for (let a = 0; a < Math.PI; a += Math.PI / 3) {
          ctx.beginPath()
          ctx.moveTo(p.x + Math.cos(a) * d, p.y + Math.sin(a) * d)
          ctx.lineTo(p.x - Math.cos(a) * d, p.y - Math.sin(a) * d)
          ctx.stroke()
        }
      } else {
        // X para cámara
        ctx.beginPath()
        ctx.moveTo(p.x - d, p.y - d); ctx.lineTo(p.x + d, p.y + d)
        ctx.moveTo(p.x + d, p.y - d); ctx.lineTo(p.x - d, p.y + d)
        ctx.stroke()
      }
    } else {
      // Formas rellenas
      ctx.beginPath()
      if (ft === 'nap') {
        // Triángulo ▲
        ctx.moveTo(p.x, p.y - d * 1.2)
        ctx.lineTo(p.x + d, p.y + d * 0.8)
        ctx.lineTo(p.x - d, p.y + d * 0.8)
        ctx.closePath()
      } else if (ft === 'splice_box') {
        // Cuadrado ■
        ctx.rect(p.x - d, p.y - d, d * 2, d * 2)
      } else if (ft === 'node') {
        // Diamante ◆
        ctx.moveTo(p.x, p.y - d * 1.2)
        ctx.lineTo(p.x + d, p.y)
        ctx.lineTo(p.x, p.y + d * 1.2)
        ctx.lineTo(p.x - d, p.y)
        ctx.closePath()
      } else {
        ctx.arc(p.x, p.y, d, 0, Math.PI * 2)
      }
      if (planned) {
        ctx.fillStyle = '#ffffff'; ctx.fill()
        ctx.shadowColor = 'transparent'
        ctx.setLineDash([3, 2]); ctx.strokeStyle = color; ctx.lineWidth = 1.2; ctx.stroke()
      } else {
        ctx.fillStyle = color; ctx.fill()
        ctx.shadowColor = 'transparent'
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1; ctx.stroke()
      }
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
  type IconItem = { kind: 'icon'; label: string; hex: string; shape: 'tri'|'sq'|'asterisk'|'diamond'|'x' }
  type LineItem = { kind: 'line'; label: string; hex: string; dashed: boolean }
  type LegendItem = IconItem | LineItem

  const items: LegendItem[] = [
    { kind: 'icon', label: 'Caja NAP',           hex: EXPORT_COLORS.nap,        shape: 'tri'     },
    { kind: 'icon', label: 'Caja empalme',        hex: EXPORT_COLORS.splice_box, shape: 'sq'      },
    { kind: 'icon', label: 'Poste',               hex: EXPORT_COLORS.poste,      shape: 'asterisk'},
    { kind: 'icon', label: 'Nodo',                hex: EXPORT_COLORS.node,       shape: 'diamond' },
    { kind: 'icon', label: 'Res. de cable',       hex: EXPORT_COLORS.camera,     shape: 'x'       },
    { kind: 'line', label: 'Fibra activa',        hex: EXPORT_COLORS.fiber_line, dashed: false    },
    { kind: 'line', label: 'Fibra planificada',   hex: EXPORT_COLORS.fiber_line, dashed: true     },
  ]
  const LW  = 44
  const HDR = 7
  const RH  = (totalH - HDR - 1) / items.length

  // Fondo blanco (sin borde)
  pdf.setFillColor(255, 255, 255)
  pdf.setGState(pdf.GState({ opacity: 0.95 }))
  pdf.roundedRect(x, y - totalH, LW, totalH, 1.5, 1.5, 'F')
  pdf.setGState(pdf.GState({ opacity: 1 }))

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

    if (item.kind === 'icon') {
      const ix = x + 5, d = 1.5   // iconos más pequeños → más legibles
      pdf.setFillColor(r, g, b)
      pdf.setDrawColor(r, g, b)
      pdf.setLineWidth(0.5)
      switch (item.shape) {
        case 'tri':
          pdf.triangle(ix - d, iy + d * 0.85, ix + d, iy + d * 0.85, ix, iy - d, 'F')
          break
        case 'sq':
          pdf.rect(ix - d, iy - d, d * 2, d * 2, 'F')
          break
        case 'asterisk':
          // 3 líneas a 0°, 60°, 120° → asterisco *
          for (let a = 0; a < Math.PI; a += Math.PI / 3) {
            pdf.line(
              ix + Math.cos(a) * d * 1.4, iy + Math.sin(a) * d * 1.4,
              ix - Math.cos(a) * d * 1.4, iy - Math.sin(a) * d * 1.4,
            )
          }
          break
        case 'diamond':
          pdf.lines([[d,d],[-d,d],[-d,-d],[d,-d]], ix, iy - d, [1,1], 'FD', true)
          break
        case 'x':
          pdf.line(ix - d, iy - d, ix + d, iy + d)
          pdf.line(ix + d, iy - d, ix - d, iy + d)
          break
      }
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
