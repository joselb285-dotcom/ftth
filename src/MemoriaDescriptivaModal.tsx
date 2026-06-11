import { useEffect, useRef, useState } from 'react'
import jsPDF from 'jspdf'
import type { AppFeature, SubProject } from './types'
import { typeLabels } from './editorConstants'
import { computeLineLength } from './OpticalPath'

// ── Perfil de empresa ─────────────────────────────────────────────────────────

export interface CompanyProfile {
  name:        string
  rut:         string
  address:     string
  phone:       string
  email:       string
  website:     string
  responsable: string
  cargo:       string
  logo:        string   // base64 data URL
}

const STORAGE_KEY = 'ftth-company-profile'

const EMPTY: CompanyProfile = {
  name: '', rut: '', address: '', phone: '', email: '',
  website: '', responsable: '', cargo: '', logo: '',
}

export function loadCompanyProfile(): CompanyProfile {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? { ...EMPTY, ...JSON.parse(raw) } : { ...EMPTY }
  } catch { return { ...EMPTY } }
}

function saveCompanyProfile(p: CompanyProfile) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(p))
}

// ── Generador PDF ─────────────────────────────────────────────────────────────

const W = 210, H = 297, M = 15, CW = W - M * 2
const C = {
  primary:  [30,  58, 138] as [number,number,number],
  accent:   [37,  99, 235] as [number,number,number],
  dark:     [15,  23,  42] as [number,number,number],
  gray:     [100,116, 139] as [number,number,number],
  lightBg:  [241,245, 249] as [number,number,number],
  white:    [255,255, 255] as [number,number,number],
  rowEven:  [248,250, 252] as [number,number,number],
  green:    [16, 185, 129] as [number,number,number],
}

type PDF = InstanceType<typeof jsPDF>

function setFont(pdf: PDF, style: 'normal'|'bold'|'italic', size: number, color = C.dark) {
  pdf.setFont('helvetica', style)
  pdf.setFontSize(size)
  pdf.setTextColor(...color)
}

function hLine(pdf: PDF, y: number, color = C.primary, lw = 0.4) {
  pdf.setDrawColor(...color); pdf.setLineWidth(lw)
  pdf.line(M, y, W - M, y)
}

function sectionTitle(pdf: PDF, text: string, y: number): number {
  pdf.setFillColor(...C.primary)
  pdf.rect(M, y, CW, 7, 'F')
  setFont(pdf, 'bold', 10, C.white)
  pdf.text(text, M + 3, y + 4.8)
  return y + 10
}

function coverPage(pdf: PDF, company: CompanyProfile, sub: SubProject, projectName: string) {
  // Fondo degradado superior
  pdf.setFillColor(...C.primary)
  pdf.rect(0, 0, W, 80, 'F')
  pdf.setFillColor(...C.accent)
  pdf.rect(0, 75, W, 5, 'F')

  // Logo de empresa
  if (company.logo) {
    try { pdf.addImage(company.logo, 'PNG', M, 10, 40, 20, undefined, 'FAST') } catch { /* skip */ }
  }

  // Título del documento
  setFont(pdf, 'bold', 22, C.white)
  pdf.text('MEMORIA DESCRIPTIVA', W / 2, 98, { align: 'center' })
  setFont(pdf, 'bold', 16, C.white)
  pdf.text('RED FTTH', W / 2, 108, { align: 'center' })

  // Nombre del proyecto
  setFont(pdf, 'bold', 13, C.dark)
  const projLines = pdf.splitTextToSize(sub.name || 'Sin nombre', CW - 20)
  pdf.text(projLines, W / 2, 128, { align: 'center' })

  if (sub.location?.displayName) {
    setFont(pdf, 'normal', 10, C.gray)
    pdf.text(sub.location.displayName, W / 2, 136, { align: 'center' })
  }

  // Línea decorativa
  hLine(pdf, 145, C.accent, 0.8)

  // Datos de empresa en caja
  const bx = M + 10, by = 152, bw = CW - 20
  pdf.setFillColor(...C.lightBg)
  pdf.roundedRect(bx, by, bw, 55, 2, 2, 'F')
  pdf.setDrawColor(...C.accent); pdf.setLineWidth(0.5)
  pdf.roundedRect(bx, by, bw, 55, 2, 2, 'S')

  setFont(pdf, 'bold', 9, C.primary)
  pdf.text('EMPRESA EJECUTORA', bx + bw / 2, by + 7, { align: 'center' })
  hLine(pdf, by + 9, C.accent, 0.3)

  const infoLines: [string, string][] = [
    ['Empresa',      company.name || '—'],
    ['RUT / NIT',    company.rut  || '—'],
    ['Dirección',    company.address || '—'],
    ['Teléfono',     company.phone || '—'],
    ['Email',        company.email || '—'],
    ['Responsable',  company.responsable || '—'],
    ['Cargo',        company.cargo || '—'],
  ]
  let iy = by + 14
  infoLines.forEach(([lbl, val]) => {
    setFont(pdf, 'bold', 8, C.gray)
    pdf.text(lbl + ':', bx + 5, iy)
    setFont(pdf, 'normal', 8, C.dark)
    pdf.text(val, bx + 35, iy)
    iy += 5.5
  })

  // Fecha
  setFont(pdf, 'normal', 8, C.gray)
  const fecha = new Date().toLocaleDateString('es', { year: 'numeric', month: 'long', day: 'numeric' })
  pdf.text(`Fecha de emisión: ${fecha}`, W / 2, 222, { align: 'center' })
  pdf.text(`Proyecto: ${projectName}`, W / 2, 228, { align: 'center' })

  // Footer portada
  pdf.setFillColor(...C.primary)
  pdf.rect(0, H - 15, W, 15, 'F')
  setFont(pdf, 'normal', 7, C.white)
  pdf.text('Documento generado por FTTH GIS Editor', M, H - 6)
  if (company.website) pdf.text(company.website, W - M, H - 6, { align: 'right' })
}

function addHeader(pdf: PDF, company: CompanyProfile, pageNum: number) {
  pdf.setFillColor(...C.primary)
  pdf.rect(0, 0, W, 10, 'F')
  setFont(pdf, 'bold', 7.5, C.white)
  pdf.text('MEMORIA DESCRIPTIVA — RED FTTH', M, 6.5)
  setFont(pdf, 'normal', 7, C.white)
  pdf.text(company.name || '', W - M, 6.5, { align: 'right' })
}

function addFooter(pdf: PDF, pageNum: number) {
  pdf.setFillColor(...C.lightBg)
  pdf.rect(0, H - 10, W, 10, 'F')
  hLine(pdf, H - 10, C.accent, 0.3)
  setFont(pdf, 'normal', 7, C.gray)
  pdf.text(`Página ${pageNum}`, W / 2, H - 4, { align: 'center' })
  const fecha = new Date().toLocaleDateString('es')
  pdf.text(fecha, W - M, H - 4, { align: 'right' })
}

function drawUnifilarDiagram(pdf: PDF, features: AppFeature[], company: CompanyProfile) {
  pdf.addPage()
  addHeader(pdf, company, pdf.getNumberOfPages())
  addFooter(pdf, pdf.getNumberOfPages())
  let y = 18
  y = sectionTitle(pdf, '5. DIAGRAMA UNIFILAR ÓPTICO DE LA RED', y)

  const cnt: Record<string, number> = {}
  features.forEach(f => { cnt[f.properties.featureType] = (cnt[f.properties.featureType] || 0) + 1 })
  const nodeC = cnt['node'] || 0, fdhC = cnt['fdh'] || 0, napC = cnt['nap'] || 0
  const ontC = cnt['ont'] || 0, sboxC = cnt['splice_box'] || 0

  const dh = 125
  pdf.setFillColor(249, 251, 255); pdf.roundedRect(M, y, CW, dh, 3, 3, 'F')
  pdf.setDrawColor(...C.accent); pdf.setLineWidth(0.3); pdf.roundedRect(M, y, CW, dh, 3, 3, 'S')
  const cx = W / 2

  const drawBox = (px: number, py: number, w: number, h: number, lbl: string, sub: string, fill: [number, number, number]) => {
    pdf.setFillColor(...fill); pdf.setDrawColor(20, 30, 60); pdf.setLineWidth(0.3)
    pdf.roundedRect(px - w / 2, py - h / 2, w, h, 1.5, 1.5, 'FD')
    setFont(pdf, 'bold', 7, C.white); pdf.text(lbl, px, py + (sub ? -1.5 : 0.5), { align: 'center' })
    if (sub) { setFont(pdf, 'normal', 6, C.white); pdf.text(sub, px, py + 3.5, { align: 'center' }) }
  }
  const vl = (x: number, y1: number, y2: number, col: [number, number, number] = C.primary) => {
    pdf.setDrawColor(...col); pdf.setLineWidth(0.5); pdf.line(x, y1, x, y2)
  }
  const dl = (x1: number, y1: number, x2: number, y2: number) => {
    pdf.setDrawColor(...C.accent); pdf.setLineWidth(0.4); pdf.line(x1, y1, x2, y2)
  }

  const L1 = y + 15, L2 = y + 38, L3 = y + 63, L4 = y + 90
  drawBox(cx, L1, 36, 13, 'ODF / OLT', nodeC > 0 ? `(${nodeC} nodo${nodeC > 1 ? 's' : ''})` : 'Nodo central', C.primary)
  vl(cx, L1 + 6.5, L2 - 7)

  if (fdhC > 0) {
    drawBox(cx, L2, 36, 13, 'FDH', `(${fdhC} equipo${fdhC > 1 ? 's' : ''})`, C.primary)
    if (napC > 0) { dl(cx, L2 + 6.5, cx - (sboxC > 0 ? 28 : 0), L3 - 6); drawBox(cx - (sboxC > 0 ? 28 : 0), L3, 30, 12, 'NAP / FAT', `(${napC})`, [22, 101, 52]) }
    if (sboxC > 0) { dl(cx, L2 + 6.5, cx + 28, L3 - 6); drawBox(cx + 28, L3, 30, 12, 'Cja. Empalme', `(${sboxC})`, [120, 53, 15]) }
  } else {
    pdf.setFillColor(...C.accent); pdf.roundedRect(cx - 22, L2 - 7, 44, 14, 2, 2, 'F')
    setFont(pdf, 'bold', 7.5, C.white); pdf.text('SPLITTER 1:N', cx, L2 - 1, { align: 'center' })
    setFont(pdf, 'normal', 6, C.white); pdf.text('División óptica pasiva', cx, L2 + 4, { align: 'center' })
    const pts: Array<{ lbl: string; cnt: number; col: [number, number, number] }> = []
    if (napC > 0)  pts.push({ lbl: 'NAP / FAT',    cnt: napC,  col: [22, 101, 52] })
    if (sboxC > 0) pts.push({ lbl: 'Cja. Empalme', cnt: sboxC, col: [120, 53, 15] })
    if (pts.length === 0) pts.push({ lbl: 'NAP / FAT', cnt: 0, col: [22, 101, 52] })
    const sp = 50, sx = cx - sp * (pts.length - 1) / 2
    pts.forEach((p, i) => { const px = sx + i * sp; dl(cx, L2 + 7, px, L3 - 6); drawBox(px, L3, 32, 12, p.lbl, p.cnt > 0 ? `(${p.cnt})` : '—', p.col) })
  }

  if (ontC > 0) {
    const napX = fdhC > 0 && napC > 0 && sboxC > 0 ? cx - 28 : cx
    vl(napX, L3 + 6, L4 - 5.5, C.green)
    drawBox(napX, L4, 36, 12, 'ONT / Cliente', `(${ontC} usuario${ontC > 1 ? 's' : ''})`, C.green)
  }

  let sy = y + 12
  setFont(pdf, 'normal', 6.5, C.gray)
  ;[`Nodos: ${nodeC || 1}`, `FDH: ${fdhC || '—'}`, `NAP: ${napC || '—'}`, `Cja.Emp: ${sboxC || '—'}`, `ONT: ${ontC || '—'}`]
    .forEach(s => { pdf.text(s, W - M - 2, sy, { align: 'right' }); sy += 6 })
  setFont(pdf, 'italic', 6, C.gray)
  pdf.text('Nota: Esquema de referencia. Jerarquía lógica GPON, no refleja topología geográfica exacta.', M + 3, y + dh - 2)
}

function drawPresupuestoOptico(pdf: PDF, features: AppFeature[], company: CompanyProfile) {
  pdf.addPage()
  addHeader(pdf, company, pdf.getNumberOfPages())
  addFooter(pdf, pdf.getNumberOfPages())
  let y = 18
  y = sectionTitle(pdf, '6. TABLA DE PRESUPUESTO ÓPTICO', y)

  const cnt: Record<string, number> = {}
  features.forEach(f => { cnt[f.properties.featureType] = (cnt[f.properties.featureType] || 0) + 1 })
  let fiberKm = 0
  features.forEach(f => {
    if (['fiber_line', 'fiber_aerial', 'fiber_underground'].includes(f.properties.featureType) && f.geometry.type === 'LineString')
      fiberKm += computeLineLength((f.geometry as GeoJSON.LineString).coordinates)
  })
  const nodeC = cnt['node'] || 0, fdhC = cnt['fdh'] || 0, napC = cnt['nap'] || 0, sboxC = cnt['splice_box'] || 0
  const nConn = (nodeC + fdhC + napC) * 2
  const nSplc = sboxC * 4 + Math.max(0, Math.round(fiberKm * 2))
  const BUDGET = 28, FIBER_ATT = 0.35, CONN_LOSS = 0.3, SPLIC_LOSS = 0.1
  const SPLIT: Record<string, number> = { '1:8': 10.5, '1:16': 13.5, '1:32': 16.5 }
  const fLoss = fiberKm * FIBER_ATT, cLoss = nConn * CONN_LOSS, sLoss = nSplc * SPLIC_LOSS

  setFont(pdf, 'normal', 9, C.dark)
  const intro = [
    `Presupuesto de potencia óptica para tecnología GPON clase B+ (presupuesto total: ${BUDGET} dB, TX: +3.0 dBm, RX: −28.0 dBm).`,
    `Cálculo basado en ${(fiberKm * 1000).toFixed(0)} m de fibra total, ${nConn} conectores y ${nSplc} empalmes estimados.`,
  ]
  intro.forEach(l => { pdf.text(l, M, y); y += 5 }); y += 4

  y = sectionTitle(pdf, '6.1 Parámetros de cálculo', y)
  const params: [string, string, string][] = [
    ['Atenuación fibra monomodo (1310 nm)', '0.35 dB/km', `Longitud: ${(fiberKm * 1000).toFixed(0)} m → ${fLoss.toFixed(2)} dB`],
    ['Conectores SC/APC', '0.30 dB/ud', `${nConn} ud estimados → ${cLoss.toFixed(2)} dB`],
    ['Empalmes por fusión', '0.10 dB/ud', `${nSplc} ud estimados → ${sLoss.toFixed(2)} dB`],
    ['Potencia TX OLT (GPON B+)', '+3.0 dBm', 'Clase B+'],
    ['Sensibilidad mínima ONT', '−28.0 dBm', 'Mínimo receptor'],
    ['Presupuesto óptico total', '28.0 dB', 'TX − RX (clase B+)'],
  ]
  params.forEach(([lbl, val, obs], i) => {
    pdf.setFillColor(...(i % 2 === 0 ? C.rowEven : C.white)); pdf.rect(M, y, CW, 6.5, 'F')
    setFont(pdf, 'bold', 8, C.dark); pdf.text(lbl, M + 2, y + 4.5)
    setFont(pdf, 'bold', 8, C.accent); pdf.text(val, M + 88, y + 4.5)
    setFont(pdf, 'normal', 7.5, C.gray); pdf.text(obs, M + 115, y + 4.5)
    y += 6.5
  }); y += 6

  y = sectionTitle(pdf, '6.2 Balance por relación de división óptica', y)
  const cols = [M + 2, M + 68, M + 100, M + 130, M + 158]
  pdf.setFillColor(...C.dark); pdf.rect(M, y, CW, 7, 'F')
  setFont(pdf, 'bold', 8, C.white)
  pdf.text('Elemento de pérdida', cols[0], y + 4.8)
  pdf.text('Detalle', cols[1], y + 4.8)
  pdf.text('1:8', cols[2], y + 4.8); pdf.text('1:16', cols[3], y + 4.8); pdf.text('1:32', cols[4], y + 4.8)
  y += 7
  const rows2: [string, string, string, string, string][] = [
    ['Fibra óptica', `${(fiberKm * 1000).toFixed(0)} m × 0.35 dB/km`, `${fLoss.toFixed(2)} dB`, `${fLoss.toFixed(2)} dB`, `${fLoss.toFixed(2)} dB`],
    ['Conectores SC/APC', `${nConn} × 0.30 dB`, `${cLoss.toFixed(2)} dB`, `${cLoss.toFixed(2)} dB`, `${cLoss.toFixed(2)} dB`],
    ['Empalmes por fusión', `${nSplc} × 0.10 dB`, `${sLoss.toFixed(2)} dB`, `${sLoss.toFixed(2)} dB`, `${sLoss.toFixed(2)} dB`],
    ['Divisor óptico PLC', 'Según relación', '10.50 dB', '13.50 dB', '16.50 dB'],
  ]
  rows2.forEach(([c0, c1, c2, c3, c4], i) => {
    pdf.setFillColor(...(i % 2 === 0 ? C.rowEven : C.white)); pdf.rect(M, y, CW, 6.5, 'F')
    setFont(pdf, 'normal', 8, C.dark); pdf.text(c0, cols[0], y + 4.5)
    setFont(pdf, 'normal', 7.5, C.gray); pdf.text(c1, cols[1], y + 4.5)
    setFont(pdf, 'normal', 8, C.dark); pdf.text(c2, cols[2], y + 4.5); pdf.text(c3, cols[3], y + 4.5); pdf.text(c4, cols[4], y + 4.5)
    y += 6.5
  })
  const splitRatios = ['1:8', '1:16', '1:32'] as const
  const totals = splitRatios.map(r => fLoss + cLoss + sLoss + SPLIT[r])
  const margins = totals.map(t => BUDGET - t)
  pdf.setFillColor(...C.primary); pdf.rect(M, y, CW, 6.5, 'F')
  setFont(pdf, 'bold', 8, C.white); pdf.text('TOTAL PÉRDIDAS', cols[0], y + 4.5)
  totals.forEach((t, i) => pdf.text(`${t.toFixed(2)} dB`, cols[2 + i], y + 4.5)); y += 6.5

  pdf.setFillColor(...C.dark); pdf.rect(M, y, CW, 7, 'F')
  setFont(pdf, 'bold', 8, C.white); pdf.text('MARGEN DISPONIBLE', cols[0], y + 5)
  const marginRGB: [number, number, number][] = margins.map(m => m >= 3 ? [74, 222, 128] : m >= 0 ? [251, 191, 36] : [248, 113, 113])
  margins.forEach((m, i) => { pdf.setTextColor(...marginRGB[i]); pdf.text(`${m.toFixed(2)} dB`, cols[2 + i], y + 5) })
  pdf.setTextColor(...C.dark); y += 12
  setFont(pdf, 'italic', 7.5, C.gray)
  pdf.text('* Cálculo estimativo. Se recomienda medición OTDR en campo. Margen ≥ 3 dB se considera óptimo.', M, y)
}

function drawPlanillaMateriales(pdf: PDF, features: AppFeature[], company: CompanyProfile) {
  pdf.addPage()
  addHeader(pdf, company, pdf.getNumberOfPages())
  addFooter(pdf, pdf.getNumberOfPages())
  let y = 18
  y = sectionTitle(pdf, '7. PLANILLA DE MATERIALES', y)

  const cnt: Record<string, number> = {}
  features.forEach(f => { cnt[f.properties.featureType] = (cnt[f.properties.featureType] || 0) + 1 })
  const fiberM: Record<string, number> = { fiber_aerial: 0, fiber_underground: 0, fiber_line: 0 }
  features.forEach(f => {
    if (f.properties.featureType in fiberM && f.geometry.type === 'LineString')
      fiberM[f.properties.featureType] += computeLineLength((f.geometry as GeoJSON.LineString).coordinates) * 1000
  })

  const MARGIN = 1.15
  const nodeC = cnt['node'] || 0, fdhC = cnt['fdh'] || 0, napC = cnt['nap'] || 0
  const sboxC = cnt['splice_box'] || 0, ontC = cnt['ont'] || 0, posteC = cnt['poste'] || 0, manhC = cnt['manhole'] || 0

  setFont(pdf, 'normal', 9, C.dark)
  pdf.text('Materiales estimados para la ejecución del proyecto basados en los elementos registrados en el GIS.', M, y); y += 5
  pdf.text(`Las longitudes de cable incluyen ${((MARGIN - 1) * 100).toFixed(0)}% de margen de instalación. Cantidades referenciales.`, M, y); y += 8

  pdf.setFillColor(...C.dark); pdf.rect(M, y, CW, 7, 'F')
  setFont(pdf, 'bold', 8, C.white)
  pdf.text('N°', M + 2, y + 4.8)
  pdf.text('Descripción del material', M + 12, y + 4.8)
  pdf.text('Ud.', M + 118, y + 4.8)
  pdf.text('Cant.', M + 133, y + 4.8)
  pdf.text('Observaciones', M + 150, y + 4.8)
  y += 7

  type MatRow = { n: number; desc: string; unit: string; qty: string; obs: string }
  const mat: MatRow[] = []
  let n = 1

  if (fiberM.fiber_aerial > 0)      mat.push({ n: n++, desc: 'Cable FO ADSS 12 hilos monomodo', unit: 'm', qty: Math.ceil(fiberM.fiber_aerial * MARGIN).toString(), obs: 'Incluye 15% margen' })
  if (fiberM.fiber_underground > 0) mat.push({ n: n++, desc: 'Cable FO subterráneo 12 hilos monomodo', unit: 'm', qty: Math.ceil(fiberM.fiber_underground * MARGIN).toString(), obs: 'Incluye 15% margen' })
  if (fiberM.fiber_line > 0)        mat.push({ n: n++, desc: 'Cable FO drop 2 hilos (acometida)', unit: 'm', qty: Math.ceil(fiberM.fiber_line * MARGIN).toString(), obs: 'Incluye 15% margen' })
  if (nodeC > 0)   mat.push({ n: n++, desc: 'Nodo ODF / Rack activo GPON', unit: 'ud', qty: nodeC.toString(), obs: 'Según diseño de red' })
  if (fdhC > 0)    mat.push({ n: n++, desc: 'FDH (Fiber Distribution Hub)', unit: 'ud', qty: fdhC.toString(), obs: 'Capacidad según diseño' })
  if (napC > 0)    mat.push({ n: n++, desc: 'NAP / FAT (Caja de acometida) 8 puertos SC/APC', unit: 'ud', qty: napC.toString(), obs: '' })
  if (sboxC > 0)   mat.push({ n: n++, desc: 'Caja de empalme / manga óptica', unit: 'ud', qty: sboxC.toString(), obs: 'Con bandejas' })
  if (manhC > 0)   mat.push({ n: n++, desc: 'Cámara / Pozo subterráneo', unit: 'ud', qty: manhC.toString(), obs: '' })
  if (posteC > 0)  mat.push({ n: n++, desc: 'Poste de concreto o metálico', unit: 'ud', qty: posteC.toString(), obs: 'Según norma vigente' })
  if (ontC > 0)    mat.push({ n: n++, desc: 'ONT (Optical Network Terminal)', unit: 'ud', qty: ontC.toString(), obs: 'GPON / XGS-PON' })
  const estConn = (nodeC + fdhC + napC + sboxC) * 4
  if (estConn > 0) mat.push({ n: n++, desc: 'Conector SC/APC (pigtail)', unit: 'ud', qty: estConn.toString(), obs: 'Estimado' })
  if (napC > 0)    mat.push({ n: n++, desc: 'Splitter PLC 1:8 en cassette', unit: 'ud', qty: napC.toString(), obs: 'Estimado, 1 por NAP' })
  if (fdhC > 0)    mat.push({ n: n++, desc: 'Splitter PLC 1:16 en cassette', unit: 'ud', qty: fdhC.toString(), obs: 'Estimado, 1 por FDH' })
  mat.push({ n: n++, desc: 'Patch cord SC/APC – SC/APC 1 m', unit: 'ud', qty: Math.max(4, (nodeC + fdhC + napC) * 2).toString(), obs: 'Estimado' })
  if (fiberM.fiber_underground > 0) {
    mat.push({ n: n++, desc: 'Tubería HDPE Ø40/33 mm (ducto subterráneo)', unit: 'm', qty: Math.ceil(fiberM.fiber_underground * MARGIN).toString(), obs: 'Incluye 15% margen' })
    mat.push({ n: n++, desc: 'Cinta señalizadora para cable FO', unit: 'm', qty: Math.ceil(fiberM.fiber_underground * 1.1).toString(), obs: '' })
  }

  mat.forEach((row, i) => {
    if (y > H - 20) { pdf.addPage(); addHeader(pdf, company, pdf.getNumberOfPages()); addFooter(pdf, pdf.getNumberOfPages()); y = 18 }
    pdf.setFillColor(...(i % 2 === 0 ? C.rowEven : C.white)); pdf.rect(M, y, CW, 6.5, 'F')
    setFont(pdf, 'normal', 8, C.dark); pdf.text(row.n.toString(), M + 2, y + 4.5); pdf.text(row.desc, M + 12, y + 4.5)
    setFont(pdf, 'normal', 8, C.gray); pdf.text(row.unit, M + 118, y + 4.5)
    setFont(pdf, 'bold', 8, C.dark); pdf.text(row.qty, M + 133, y + 4.5)
    setFont(pdf, 'normal', 7, C.gray); pdf.text(row.obs, M + 150, y + 4.5)
    y += 6.5
  })
  y += 5
  setFont(pdf, 'italic', 7.5, C.gray)
  pdf.text('* Las cantidades son estimadas a partir del dibujo GIS. El proyecto ejecutivo puede modificar estos valores.', M, y)
}

function generateMemoriaPdf(company: CompanyProfile, sub: SubProject, projectName: string) {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const features = sub.features

  // ── Portada ────────────────────────────────────────────────────────────────
  coverPage(pdf, company, sub, projectName)

  // ── Página 2: Descripción general + tabla de contenidos ───────────────────
  pdf.addPage()
  addHeader(pdf, company, 2)
  addFooter(pdf, 2)
  let y = 18

  y = sectionTitle(pdf, '1. DESCRIPCIÓN GENERAL DEL PROYECTO', y)
  setFont(pdf, 'normal', 9, C.dark)
  const intro = [
    `El presente documento constituye la Memoria Descriptiva del proyecto de red de fibra óptica FTTH`,
    `(Fiber To The Home) denominado "${sub.name}". Describe la infraestructura pasiva proyectada,`,
    `los elementos de red considerados y las especificaciones técnicas aplicadas.`,
  ]
  intro.forEach(line => { pdf.text(line, M, y); y += 5 })
  y += 3

  // Datos del subproyecto
  y = sectionTitle(pdf, '2. DATOS DEL PROYECTO', y)
  const rows: [string, string][] = [
    ['Nombre del subproyecto', sub.name || '—'],
    ['Proyecto',              projectName || '—'],
    ['Ubicación',             sub.location?.displayName || '—'],
    ['Empresa ejecutora',     company.name || '—'],
    ['Responsable técnico',   company.responsable || '—'],
    ['Cargo',                 company.cargo || '—'],
    ['Fecha de elaboración',  new Date().toLocaleDateString('es', { year:'numeric', month:'long', day:'numeric' })],
  ]
  rows.forEach(([lbl, val], i) => {
    pdf.setFillColor(...(i % 2 === 0 ? C.rowEven : C.white))
    pdf.rect(M, y, CW, 6, 'F')
    setFont(pdf, 'bold', 8.5, C.dark); pdf.text(lbl, M + 2, y + 4.2)
    setFont(pdf, 'normal', 8.5, C.dark); pdf.text(val, M + 70, y + 4.2)
    y += 6
  })
  y += 5

  // Tabla de contenidos
  y = sectionTitle(pdf, 'ÍNDICE DE CONTENIDOS', y)
  const toc = [
    '1. Descripción General del Proyecto',
    '2. Datos del Proyecto',
    '3. Inventario de Equipos y Elementos de Red',
    '4. Descripción de la Red Diseñada',
    '5. Diagrama Unifilar Óptico de la Red',
    '6. Tabla de Presupuesto Óptico',
    '7. Planilla de Materiales',
    '8. Especificaciones Técnicas',
    '9. Conclusiones y Recomendaciones',
  ]
  toc.forEach((item, i) => {
    setFont(pdf, 'normal', 9, C.dark)
    pdf.text(`${item}`, M + 4, y + 4)
    setFont(pdf, 'normal', 9, C.gray)
    pdf.text(`${i + 2}`, W - M - 4, y + 4, { align: 'right' })
    hLine(pdf, y + 6.5, C.lightBg, 0.2)
    y += 7
  })

  // ── Página 3: Inventario de elementos ─────────────────────────────────────
  pdf.addPage()
  addHeader(pdf, company, 3)
  addFooter(pdf, 3)
  y = 18

  y = sectionTitle(pdf, '3. INVENTARIO DE EQUIPOS Y ELEMENTOS DE RED', y)

  // Agrupar features por tipo
  const byType: Record<string, AppFeature[]> = {}
  features.forEach(f => {
    const k = f.properties.featureType
    if (!byType[k]) byType[k] = []
    byType[k].push(f)
  })

  // Cabecera de tabla
  pdf.setFillColor(...C.dark)
  pdf.rect(M, y, CW, 7, 'F')
  setFont(pdf, 'bold', 8.5, C.white)
  pdf.text('Tipo de elemento',       M + 2,       y + 4.8)
  pdf.text('Cantidad',               M + 90,      y + 4.8)
  pdf.text('Estado',                 M + 115,     y + 4.8)
  pdf.text('Observaciones',          M + 145,     y + 4.8)
  y += 7

  let rowIdx = 0
  Object.entries(byType).forEach(([kind, items]) => {
    const active  = items.filter(f => f.properties.status !== 'planned').length
    const planned = items.filter(f => f.properties.status === 'planned').length
    pdf.setFillColor(...(rowIdx % 2 === 0 ? C.rowEven : C.white))
    pdf.rect(M, y, CW, 6.5, 'F')
    setFont(pdf, 'normal', 8.5, C.dark)
    pdf.text((typeLabels as any)[kind] ?? kind, M + 2, y + 4.5)
    pdf.text(String(items.length), M + 90, y + 4.5)
    const estadoTxt = active > 0 && planned > 0
      ? `${active} activo / ${planned} planeado`
      : planned > 0 ? 'Planificado' : 'Activo'
    pdf.text(estadoTxt, M + 115, y + 4.5)
    y += 6.5; rowIdx++
    if (y > H - 25) {
      pdf.addPage()
      addHeader(pdf, company, pdf.getNumberOfPages())
      addFooter(pdf, pdf.getNumberOfPages())
      y = 18
    }
  })

  // Totales
  y += 2
  pdf.setFillColor(...C.primary)
  pdf.rect(M, y, CW, 6.5, 'F')
  setFont(pdf, 'bold', 8.5, C.white)
  pdf.text('TOTAL DE ELEMENTOS', M + 2, y + 4.5)
  pdf.text(String(features.length), M + 90, y + 4.5)
  y += 10

  // ── Página siguiente: Red diseñada ─────────────────────────────────────────
  pdf.addPage()
  addHeader(pdf, company, pdf.getNumberOfPages())
  addFooter(pdf, pdf.getNumberOfPages())
  y = 18

  y = sectionTitle(pdf, '4. DESCRIPCIÓN DE LA RED DISEÑADA', y)

  // Longitudes de fibra
  const fiberTypes: Record<string, { totalKm: number; label: string }> = {
    fiber_line:        { totalKm: 0, label: 'Fibra SMF (drop/distribución)' },
    fiber_aerial:      { totalKm: 0, label: 'Fibra aérea ADSS' },
    fiber_underground: { totalKm: 0, label: 'Fibra subterránea' },
  }
  features.forEach(f => {
    const ft = f.properties.featureType
    if (ft in fiberTypes && f.geometry.type === 'LineString') {
      fiberTypes[ft].totalKm += computeLineLength((f.geometry as GeoJSON.LineString).coordinates)
    }
  })

  setFont(pdf, 'bold', 9, C.dark)
  pdf.text('4.1 Longitudes de cable de fibra óptica', M, y); y += 7

  pdf.setFillColor(...C.dark)
  pdf.rect(M, y, CW, 7, 'F')
  setFont(pdf, 'bold', 8.5, C.white)
  pdf.text('Tipo de fibra', M + 2, y + 4.8)
  pdf.text('Long. total (m)', M + 110, y + 4.8)
  pdf.text('Long. total (km)', M + 145, y + 4.8)
  y += 7

  let fiIdx = 0
  Object.values(fiberTypes).forEach(({ label, totalKm }) => {
    if (totalKm === 0) return
    pdf.setFillColor(...(fiIdx % 2 === 0 ? C.rowEven : C.white))
    pdf.rect(M, y, CW, 6.5, 'F')
    setFont(pdf, 'normal', 8.5, C.dark)
    pdf.text(label, M + 2, y + 4.5)
    pdf.text(`${(totalKm * 1000).toFixed(0)} m`, M + 110, y + 4.5)
    pdf.text(`${totalKm.toFixed(3)} km`, M + 145, y + 4.5)
    y += 6.5; fiIdx++
  })

  const totalKm = Object.values(fiberTypes).reduce((s, v) => s + v.totalKm, 0)
  pdf.setFillColor(...C.primary)
  pdf.rect(M, y, CW, 6.5, 'F')
  setFont(pdf, 'bold', 8.5, C.white)
  pdf.text('TOTAL FIBRA', M + 2, y + 4.5)
  pdf.text(`${(totalKm * 1000).toFixed(0)} m`, M + 110, y + 4.5)
  pdf.text(`${totalKm.toFixed(3)} km`, M + 145, y + 4.5)
  y += 12

  setFont(pdf, 'bold', 9, C.dark)
  pdf.text('4.2 Arquitectura de red', M, y); y += 6
  setFont(pdf, 'normal', 9, C.dark)
  const arch = [
    'La red diseñada sigue una arquitectura pasiva punto-multipunto (P2MP) basada en tecnología GPON,',
    'con divisiones ópticas pasivas en las cajas NAP/FAT. La señal óptica es distribuida desde el nodo',
    'central (ODF) hacia los clientes finales (ONT) a través de la red de distribución y acometida.',
  ]
  arch.forEach(line => { pdf.text(line, M, y); y += 5 })
  y += 5

  // ── Secciones 5, 6, 7: nuevas páginas ─────────────────────────────────────
  drawUnifilarDiagram(pdf, features, company)
  drawPresupuestoOptico(pdf, features, company)
  drawPlanillaMateriales(pdf, features, company)

  // ── Especificaciones técnicas ──────────────────────────────────────────────
  pdf.addPage()
  addHeader(pdf, company, pdf.getNumberOfPages())
  addFooter(pdf, pdf.getNumberOfPages())
  y = 18
  y = sectionTitle(pdf, '8. ESPECIFICACIONES TÉCNICAS', y)
  const specs: [string, string][] = [
    ['Tecnología de acceso',  'GPON / XGS-PON (ITU-T G.984 / G.9807)'],
    ['Tipo de fibra',         'Monomodo (SMF) — ITU-T G.652.D'],
    ['Cable aéreo',           'ADSS — All Dielectric Self Supporting'],
    ['Cable subterráneo',     'Ducto HDPE Ø 40/33 mm o similar'],
    ['Conectores',            'SC/APC (ángulo físico)'],
    ['Pérdida conector',      '≤ 0.3 dB'],
    ['Pérdida empalme fusión','≤ 0.1 dB'],
    ['Relación de división',  '1:8 / 1:16 / 1:32 según diseño'],
    ['Presupuesto óptico',    '28 dB (GPON clase B+)'],
  ]
  specs.forEach(([lbl, val], i) => {
    pdf.setFillColor(...(i % 2 === 0 ? C.rowEven : C.white))
    pdf.rect(M, y, CW, 6, 'F')
    setFont(pdf, 'bold', 8.5, C.dark); pdf.text(lbl, M + 2, y + 4)
    setFont(pdf, 'normal', 8.5, C.dark); pdf.text(val, M + 75, y + 4)
    y += 6
  })
  y += 8

  // ── Conclusiones ──────────────────────────────────────────────────────────
  if (y > H - 50) {
    pdf.addPage()
    addHeader(pdf, company, pdf.getNumberOfPages())
    addFooter(pdf, pdf.getNumberOfPages())
    y = 18
  }

  y = sectionTitle(pdf, '9. CONCLUSIONES Y RECOMENDACIONES', y)
  setFont(pdf, 'normal', 9, C.dark)
  const conclusiones = [
    `El diseño de la red FTTH para el proyecto "${sub.name}" contempla una solución técnicamente`,
    'viable, escalable y alineada con los estándares internacionales de telecomunicaciones.',
    '',
    'Se recomienda:',
    '  • Verificar los permisos de instalación en postes y ductos antes de la ejecución.',
    '  • Realizar pruebas OTDR en cada tramo de fibra instalado.',
    '  • Documentar las coordenadas finales de cada elemento una vez instalado.',
    '  • Mantener el registro actualizado en el sistema GIS.',
  ]
  conclusiones.forEach(line => { pdf.text(line, M, y); y += 5 })
  y += 10

  // Firma
  hLine(pdf, y, C.accent, 0.5); y += 8
  setFont(pdf, 'bold', 9, C.dark)
  pdf.text(company.responsable || '________________________________', M + CW / 4, y, { align: 'center' })
  pdf.text('________________________________', M + (CW * 3) / 4, y, { align: 'center' })
  y += 5
  setFont(pdf, 'normal', 8, C.gray)
  pdf.text(company.cargo || 'Responsable Técnico', M + CW / 4, y, { align: 'center' })
  pdf.text('Revisado por', M + (CW * 3) / 4, y, { align: 'center' })

  return pdf
}

// ── Componente Modal ──────────────────────────────────────────────────────────

interface Props {
  subProject:  SubProject | null
  projectName: string
  onClose: () => void
}

type Tab = 'empresa' | 'generar'

export default function MemoriaDescriptivaModal({ subProject, projectName, onClose }: Props) {
  const [tab, setTab]         = useState<Tab>('empresa')
  const [profile, setProfile] = useState<CompanyProfile>(loadCompanyProfile)
  const [saved, setSaved]     = useState(false)
  const [busy, setBusy]       = useState(false)
  const logoInputRef          = useRef<HTMLInputElement>(null)

  useEffect(() => { if (saved) { const t = setTimeout(() => setSaved(false), 2000); return () => clearTimeout(t) } }, [saved])

  function handleSave() {
    saveCompanyProfile(profile)
    setSaved(true)
  }

  function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => setProfile(p => ({ ...p, logo: ev.target?.result as string ?? '' }))
    reader.readAsDataURL(file)
  }

  async function handleGenerate() {
    if (!subProject) return
    setBusy(true)
    try {
      saveCompanyProfile(profile)
      const pdf = generateMemoriaPdf(profile, subProject, projectName)
      const safeName = (subProject.name || 'proyecto').replace(/\s+/g, '-').toLowerCase()
      pdf.save(`memoria-descriptiva-${safeName}.pdf`)
    } finally {
      setBusy(false)
    }
  }

  const field = (label: string, key: keyof CompanyProfile, placeholder = '') => (
    <div style={{ marginBottom: 10 }}>
      <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
        {label}
      </label>
      <input
        value={profile[key] as string}
        onChange={e => setProfile(p => ({ ...p, [key]: e.target.value }))}
        placeholder={placeholder}
        style={{ width: '100%', background: '#0f172a', border: '1px solid #1e3a5f', borderRadius: 6, padding: '6px 10px', color: '#e2e8f0', fontSize: '0.82rem', boxSizing: 'border-box' }}
      />
    </div>
  )

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
      <div style={{ background: '#0f172a', border: '1px solid #1e3a5f', borderRadius: 12, width: 560, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 48px rgba(0,0,0,0.5)' }}>

        {/* Header */}
        <div style={{ padding: '16px 20px 0', borderBottom: '1px solid #1e3a5f' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: '0.68rem', color: '#3b82f6', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>Documento técnico</div>
              <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: '#f1f5f9' }}>Memoria Descriptiva</h2>
              {subProject && <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: 2 }}>{subProject.name}</div>}
            </div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '1.2rem', padding: 4, lineHeight: 1 }}>✕</button>
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: 4 }}>
            {(['empresa', 'generar'] as Tab[]).map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                background: tab === t ? '#1e40af' : 'none',
                border: 'none', borderRadius: '6px 6px 0 0', padding: '6px 16px',
                color: tab === t ? '#fff' : '#64748b', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600,
              }}>
                {t === 'empresa' ? '🏢 Datos de empresa' : '📄 Generar documento'}
              </button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: '18px 20px', overflowY: 'auto', flex: 1 }}>

          {tab === 'empresa' && (
            <>
              <p style={{ fontSize: '0.78rem', color: '#64748b', margin: '0 0 16px' }}>
                Esta información aparecerá en la portada y encabezados del documento. Se guarda localmente en el navegador.
              </p>

              {/* Logo */}
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                  Logo de empresa
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  {profile.logo
                    ? <img src={profile.logo} alt="logo" style={{ height: 48, maxWidth: 120, objectFit: 'contain', background: '#fff', borderRadius: 6, padding: 4 }} />
                    : <div style={{ width: 120, height: 48, background: '#1e293b', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#475569', fontSize: '0.72rem' }}>Sin logo</div>
                  }
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <button onClick={() => logoInputRef.current?.click()} style={{ background: '#1e3a5f', border: '1px solid #3b82f6', borderRadius: 6, padding: '5px 12px', color: '#93c5fd', cursor: 'pointer', fontSize: '0.78rem' }}>
                      Subir imagen
                    </button>
                    {profile.logo && (
                      <button onClick={() => setProfile(p => ({ ...p, logo: '' }))} style={{ background: 'none', border: '1px solid #374151', borderRadius: 6, padding: '4px 12px', color: '#6b7280', cursor: 'pointer', fontSize: '0.75rem' }}>
                        Quitar logo
                      </button>
                    )}
                  </div>
                  <input ref={logoInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleLogoUpload} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
                <div style={{ gridColumn: '1 / -1' }}>{field('Razón social / Nombre empresa', 'name', 'Empresa Telecomunicaciones S.A.')}</div>
                {field('RUT / NIT / RUC', 'rut', '12.345.678-9')}
                {field('Teléfono', 'phone', '+56 2 1234 5678')}
                <div style={{ gridColumn: '1 / -1' }}>{field('Dirección', 'address', 'Av. Principal 123, Ciudad')}</div>
                {field('Email', 'email', 'contacto@empresa.cl')}
                {field('Sitio web', 'website', 'www.empresa.cl')}
                {field('Responsable técnico', 'responsable', 'Ing. Juan Pérez')}
                {field('Cargo', 'cargo', 'Jefe de Proyectos')}
              </div>
            </>
          )}

          {tab === 'generar' && (
            <>
              <p style={{ fontSize: '0.78rem', color: '#64748b', margin: '0 0 16px' }}>
                El documento se genera automáticamente con los datos del proyecto activo y el perfil de empresa configurado.
              </p>

              <div style={{ background: '#0f2a1a', border: '1px solid #166534', borderRadius: 8, padding: 14, marginBottom: 16 }}>
                <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#4ade80', marginBottom: 8 }}>✓ Contenido generado automáticamente</div>
                {['Portada con logo y datos de empresa', 'Índice de contenidos', 'Descripción general del proyecto', 'Inventario de equipos (' + (subProject?.features.length ?? 0) + ' elementos)', 'Longitudes de cable por tipo de fibra', 'Diagrama unifilar óptico de la red', 'Tabla de presupuesto óptico (1:8 / 1:16 / 1:32)', 'Planilla de materiales con cantidades', 'Especificaciones técnicas GPON/FTTH', 'Conclusiones y recomendaciones', 'Página de firmas'].map(item => (
                  <div key={item} style={{ fontSize: '0.78rem', color: '#86efac', padding: '2px 0' }}>• {item}</div>
                ))}
              </div>

              {!profile.name && (
                <div style={{ background: '#1c1007', border: '1px solid #92400e', borderRadius: 8, padding: 10, marginBottom: 14, fontSize: '0.78rem', color: '#fbbf24' }}>
                  ⚠ Completa los datos de empresa en la pestaña anterior para personalizar el documento.
                </div>
              )}

              {!subProject && (
                <div style={{ background: '#1a0f0f', border: '1px solid #7f1d1d', borderRadius: 8, padding: 10, marginBottom: 14, fontSize: '0.78rem', color: '#fca5a5' }}>
                  ✕ No hay un subproyecto activo. Abre un editor de subproyecto para generar la memoria.
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 20px', borderTop: '1px solid #1e3a5f', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose} style={{ background: 'none', border: '1px solid #334155', borderRadius: 7, padding: '7px 16px', color: '#94a3b8', cursor: 'pointer', fontSize: '0.82rem' }}>
            Cerrar
          </button>
          {tab === 'empresa' && (
            <button onClick={handleSave} style={{ background: saved ? '#166534' : '#1e40af', border: 'none', borderRadius: 7, padding: '7px 18px', color: '#fff', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600, transition: 'background 0.2s' }}>
              {saved ? '✓ Guardado' : 'Guardar datos'}
            </button>
          )}
          {tab === 'generar' && (
            <button onClick={handleGenerate} disabled={busy || !subProject} style={{ background: busy || !subProject ? '#1e293b' : '#1e40af', border: 'none', borderRadius: 7, padding: '7px 18px', color: busy || !subProject ? '#475569' : '#fff', cursor: busy || !subProject ? 'not-allowed' : 'pointer', fontSize: '0.82rem', fontWeight: 600 }}>
              {busy ? 'Generando…' : '📄 Generar PDF'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
