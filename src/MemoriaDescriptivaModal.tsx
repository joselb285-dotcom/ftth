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

// ── Helper: longitud real de un cable incluyendo ganancias ────────────────────

function fiberRealM(f: AppFeature, allFeatures: AppFeature[]): number {
  if (f.geometry.type !== 'LineString') return 0
  const geoM    = computeLineLength((f.geometry as GeoJSON.LineString).coordinates) * 1000
  const extraM  = f.properties.extraLengthM ?? 0
  const bypassM = f.properties.bypassM ?? 0
  const camM    = allFeatures
    .filter(c => c.properties.featureType === 'camera' && c.properties.linkedLineId === f.properties.id)
    .reduce((s, c) => s + (c.properties.reserveM ?? 0) + (c.properties.bypassM ?? 0), 0)
  return geoM + extraM + bypassM + camM
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

function drawUnifilarDiagram(pdf: PDF, features: AppFeature[], company: CompanyProfile, addNewPage = true) {
  if (addNewPage) pdf.addPage()
  addHeader(pdf, company, pdf.getNumberOfPages())
  addFooter(pdf, pdf.getNumberOfPages())
  let y = 18
  y = sectionTitle(pdf, addNewPage ? '5. DIAGRAMA UNIFILAR ÓPTICO DE LA RED' : 'DIAGRAMA UNIFILAR ÓPTICO DE LA RED', y)

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

function drawPresupuestoOptico(pdf: PDF, features: AppFeature[], company: CompanyProfile, addNewPage = true) {
  if (addNewPage) pdf.addPage()
  addHeader(pdf, company, pdf.getNumberOfPages())
  addFooter(pdf, pdf.getNumberOfPages())
  let y = 18
  y = sectionTitle(pdf, addNewPage ? '6. TABLA DE PRESUPUESTO ÓPTICO' : 'TABLA DE PRESUPUESTO ÓPTICO', y)

  const cnt: Record<string, number> = {}
  features.forEach(f => { cnt[f.properties.featureType] = (cnt[f.properties.featureType] || 0) + 1 })
  let fiberKm = 0
  features.forEach(f => {
    if (['fiber_line', 'fiber_aerial', 'fiber_underground'].includes(f.properties.featureType))
      fiberKm += fiberRealM(f, features) / 1000
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

function drawPlanillaMateriales(pdf: PDF, features: AppFeature[], company: CompanyProfile, addNewPage = true) {
  if (addNewPage) pdf.addPage()
  addHeader(pdf, company, pdf.getNumberOfPages())
  addFooter(pdf, pdf.getNumberOfPages())
  let y = 18
  y = sectionTitle(pdf, addNewPage ? '7. PLANILLA DE MATERIALES' : 'PLANILLA DE MATERIALES', y)

  const cnt: Record<string, number> = {}
  features.forEach(f => { cnt[f.properties.featureType] = (cnt[f.properties.featureType] || 0) + 1 })
  const fiberM: Record<string, number> = { fiber_aerial: 0, fiber_underground: 0, fiber_line: 0 }
  features.forEach(f => {
    if (f.properties.featureType in fiberM)
      fiberM[f.properties.featureType] += fiberRealM(f, features)
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

  // Nominatim puede devolver: "2759, Ingeniero Virasoro, 3342, General Alvear, Corrientes, Argentina"
  // Los tokens numéricos son códigos postales o números de calle → los descartamos
  const rawLoc    = sub.location?.displayName || ''
  const allParts  = rawLoc.split(', ')
  // Descartar tokens numéricos (códigos postales) y nombres de calle/ruta
  const textParts = allParts.filter(p => !/^\d+$/.test(p.trim()))
  const streetRe  = /^(ruta|rp\b|r\.n\.|r\.p\.|avenida|av\.|av\s|calle|pasaje|pje\.|boulevard|bv\.|camino|acceso|autopista)/i
  const nonStreet = textParts.filter(p => !streetRe.test(p.trim()))
  const localidad = nonStreet[0] || textParts[0] || sub.name || '—'
  const provincia = textParts.length >= 3 ? textParts[textParts.length - 2] : ''
  const pais      = textParts.length >= 2 ? textParts[textParts.length - 1] : 'Argentina'

  // ── Helpers locales ────────────────────────────────────────────────────────
  function np(): number {
    pdf.addPage()
    addHeader(pdf, company, pdf.getNumberOfPages())
    addFooter(pdf, pdf.getNumberOfPages())
    return 18
  }
  function ck(y: number, needed = 25): number { return y > H - needed ? np() : y }
  const YMAX = H - 18  // límite inferior: 18mm sobre el footer (footer en H-10=287)
  function rp(text: string, y: number, size = 9.5): number {
    setFont(pdf, 'normal', size, C.dark)
    const lines = pdf.splitTextToSize(text, CW)
    lines.forEach((l: string) => {
      if (y > YMAX) { y = np(); setFont(pdf, 'normal', size, C.dark) }
      pdf.text(l, M, y); y += 5.2
    })
    return y + 3
  }
  function li(n: number, text: string, y: number): number {
    setFont(pdf, 'normal', 9.5, C.dark)
    const lines = pdf.splitTextToSize(`${n}. ${text}`, CW - 10)
    lines.forEach((l: string, i: number) => {
      if (y > YMAX) { y = np(); setFont(pdf, 'normal', 9.5, C.dark) }
      pdf.text(l, i === 0 ? M + 6 : M + 12, y); y += 5.2
    })
    return y + 1.5
  }
  // Título de sección: línea separadora fina + texto azul (estilo académico del PDF)
  function sec(title: string, y: number): number {
    pdf.setDrawColor(180, 200, 230); pdf.setLineWidth(0.4); pdf.line(M, y, W - M, y); y += 6
    setFont(pdf, 'bold', 13, C.primary); pdf.text(title, M, y)
    return y + 9
  }
  // Subtítulo (9.1, 17.2, etc.): texto azul mediano
  function ssh(text: string, y: number): number {
    y = ck(y, 18)
    setFont(pdf, 'bold', 10.5, C.accent); pdf.text(text, M, y); return y + 7
  }

  // ── Portada ────────────────────────────────────────────────────────────────
  coverPage(pdf, company, sub, projectName)

  // ══════════════════════════════════════════════════════════════════════════
  // 1. Introducción y marco conceptual
  // ══════════════════════════════════════════════════════════════════════════
  let y = np()
  y = sec('1. Introducción y marco conceptual', y)
  y = rp('El presente documento tiene por objeto describir los criterios técnicos, metodológicos y constructivos aplicables al despliegue de una red de fibra óptica hasta el hogar, denominada FTTH —Fiber To The Home—, orientada a brindar servicios de telecomunicaciones de alta capacidad, baja latencia y elevada disponibilidad.', y)
  y = rp('En el actual contexto de transformación digital, las redes FTTH constituyen una infraestructura crítica para la provisión de servicios de datos, voz, video, aplicaciones corporativas, plataformas en la nube, servicios inteligentes y conectividad residencial de alta demanda. A diferencia de las redes basadas en cobre o soluciones inalámbricas, la fibra óptica permite garantizar mayores anchos de banda, menor atenuación, mayor inmunidad electromagnética y una capacidad de escalabilidad superior a largo plazo.', y)
  y = rp('El proyecto se fundamenta en una arquitectura de Red Óptica Pasiva, conocida como PON —Passive Optical Network—, bajo un esquema punto a multipunto. En esta topología, la señal óptica se origina en el equipamiento activo ubicado en la Oficina Central o Central Office, específicamente desde la OLT —Optical Line Terminal—, y se distribuye a través de la Red de Distribución Óptica u ODN —Optical Distribution Network— hasta alcanzar los terminales ópticos de usuario final, ONT/ONU.', y)
  y = rp('La distribución de la señal se realiza mediante elementos pasivos, tales como splitters ópticos, cajas de empalme, cajas de terminación óptica, cables de fibra óptica, conectores, bandejas de fusión y elementos de sujeción mecánica. Esta configuración permite reducir la cantidad de equipamiento activo en planta externa, optimizar costos operativos y mejorar la confiabilidad general de la red.', y)

  // ══════════════════════════════════════════════════════════════════════════
  // 2. Fundamentos de transmisión óptica
  // ══════════════════════════════════════════════════════════════════════════
  y = ck(y, 40); y = sec('2. Fundamentos de transmisión óptica', y)
  y = rp('La operación eficiente de una red de fibra óptica se basa en el principio físico de reflexión interna total, fenómeno que permite la propagación de la señal luminosa dentro del núcleo de la fibra óptica. Dicho fenómeno se produce por la diferencia de índices de refracción entre el núcleo —core— y el revestimiento —cladding—.', y)
  y = rp('La Ley de Snell explica el comportamiento de la luz al atravesar medios con distintos índices de refracción. En el caso de la fibra óptica, la señal se mantiene confinada dentro del núcleo siempre que el ángulo de incidencia sea superior al ángulo crítico. Por este motivo, el manejo adecuado del cable durante el tendido resulta determinante para evitar pérdidas por curvatura, microcurvaturas, macrocurvaturas o esfuerzos mecánicos que alteren la trayectoria de propagación de la señal.', y)
  y = rp('En consecuencia, durante la instalación deberán respetarse estrictamente los radios mínimos de curvatura definidos por el fabricante, tanto en condiciones dinámicas —durante el tendido— como en condiciones estáticas —una vez finalizada la instalación—. El incumplimiento de estos parámetros puede generar atenuaciones ópticas, degradación de la señal, pérdidas de potencia y disminución de la vida útil de la infraestructura.', y)

  // ══════════════════════════════════════════════════════════════════════════
  // 3. Localización geográfica del proyecto
  // ══════════════════════════════════════════════════════════════════════════
  y = ck(y, 50); y = sec('3. Localización geográfica del proyecto', y)
  y = rp('El despliegue de la red FTTH se focalizará en la siguiente área de intervención:', y)
  setFont(pdf, 'bold', 9, C.dark)
  pdf.text(`Localidad: ${localidad}`, M, y); y += 5.5
  if (provincia) { pdf.text(`Provincia: ${provincia}`, M, y); y += 5.5 }
  pdf.text(`País: ${pais}`, M, y); y += 8
  y = rp('La delimitación del área de cobertura deberá surgir de un proceso de ingeniería FTTH que contemple la relación entre cobertura, polígono de servicio, densidad poblacional, demanda proyectada, penetración estimada, disponibilidad de infraestructura soporte y factibilidad técnica de despliegue.', y)
  y = rp('El diseño deberá permitir una utilización eficiente de los recursos de planta externa, optimizando la relación entre hogares pasados, capacidad instalada, cantidad de hilos disponibles, ubicación de cajas de terminación óptica y puntos de distribución.', y)

  // ══════════════════════════════════════════════════════════════════════════
  // 4. Tecnología aplicada
  // ══════════════════════════════════════════════════════════════════════════
  y = ck(y, 40); y = sec('4. Tecnología aplicada', y)
  y = rp('Para el presente proyecto se adopta la tecnología GPON —Gigabit Passive Optical Network—, conforme al estándar ITU-T G.984.', y)
  y = rp('La tecnología GPON permite la transmisión de servicios de banda ancha mediante una red óptica pasiva, con una capacidad nominal de hasta 2,488 Gbps en sentido descendente —downstream— y 1,244 Gbps en sentido ascendente —upstream—. Esta capacidad resulta adecuada para la prestación de servicios residenciales, comerciales e institucionales de alta demanda.', y)
  y = rp('La elección de una arquitectura GPON se fundamenta en los siguientes criterios técnicos:', y)
  ;[
    'Mayor eficiencia en el uso de fibras troncales.',
    'Reducción de equipamiento activo en planta externa.',
    'Menor consumo energético operativo.',
    'Facilidad de escalamiento por sectores o polígonos.',
    'Mejor relación costo-beneficio por hogar pasado.',
    'Compatibilidad con servicios de datos, voz, IPTV, video y aplicaciones futuras.',
    'Capacidad de evolución hacia tecnologías superiores como XG-PON, XGS-PON o NG-PON2.',
  ].forEach((t, i) => { y = ck(y, 12); y = li(i + 1, t, y) })
  y += 2

  // ══════════════════════════════════════════════════════════════════════════
  // 5. Topología general de red
  // ══════════════════════════════════════════════════════════════════════════
  y = ck(y, 50); y = sec('5. Topología general de red', y)
  y = rp('La red FTTH estará compuesta por los siguientes segmentos principales:', y)
  ;[
    'Oficina Central o Central Office: sitio donde se aloja el equipamiento activo principal, incluyendo OLT, sistemas de alimentación, respaldo energético, distribución óptica y equipamiento de red.',
    'Red troncal o feeder: tramo principal de fibra óptica que vincula la Oficina Central con los puntos de distribución.',
    'Red de distribución: segmento encargado de acercar la capacidad óptica hacia los distintos sectores del área de cobertura.',
    'Red de acceso o acometida: tramo final que conecta la caja de terminación óptica con el domicilio del abonado.',
    'Terminal de usuario ONT/ONU: equipo instalado en el cliente final para la conversión de señal óptica a interfaces de servicio.',
  ].forEach((t, i) => { y = ck(y, 15); y = li(i + 1, t, y) })
  y += 2
  y = rp('La topología PON se prioriza frente a esquemas punto a punto debido a su eficiencia de planta externa, menor densidad de fibra requerida en la red troncal, reducción de costos de implementación y menor cantidad de puntos activos susceptibles de falla.', y)

  // ══════════════════════════════════════════════════════════════════════════
  // 6. Metodología de tendido de fibra óptica
  // ══════════════════════════════════════════════════════════════════════════
  y = ck(y, 40); y = sec('6. Metodología de tendido de fibra óptica', y)
  y = rp('El despliegue aéreo de fibra óptica constituye una metodología eficiente para la expansión de redes de alta capacidad, principalmente por su menor requerimiento de obra civil y por la posibilidad de aprovechar infraestructura existente, tales como postes de distribución eléctrica, columnas o estructuras de soporte autorizadas.', y)
  y = rp('No obstante, la viabilidad técnica del tendido aéreo depende de una correcta selección del cable, una adecuada evaluación de los vanos, una precisa definición de los herrajes y una ejecución controlada de la tensión mecánica aplicada durante la instalación.', y)
  y = rp('Para este tipo de despliegue se utilizarán principalmente cables ADSS —All-Dielectric Self-Supporting— y cables ópticos tipo oval, según la función del tramo, las condiciones de instalación y las especificaciones de ingeniería.', y)
  y = rp('El cable ADSS resulta adecuado para tendidos aéreos por su condición dieléctrica y autosoportada, lo que permite su instalación sin mensajero metálico adicional. Esta característica mejora la seguridad eléctrica, reduce riesgos de inducción electromagnética y facilita su instalación en zonas con infraestructura eléctrica existente.', y)

  // ══════════════════════════════════════════════════════════════════════════
  // 7. Consideraciones mecánicas del tendido aéreo
  // ══════════════════════════════════════════════════════════════════════════
  y = ck(y, 40); y = sec('7. Consideraciones mecánicas del tendido aéreo', y)
  y = rp('Previo a la instalación deberá realizarse una evaluación técnica de los siguientes parámetros:', y)
  ;[
    'Longitud de vano entre postes.', 'Altura libre disponible.', 'Estado estructural de los postes.',
    'Existencia de cruces de calles, rutas, accesos o líneas eléctricas.', 'Flecha admisible del cable.',
    'Carga de viento.', 'Peso propio del cable.', 'Tensión máxima de instalación.',
    'Radio mínimo de curvatura.', 'Puntos de retención, suspensión y reserva técnica.',
  ].forEach((t, i) => { y = ck(y, 12); y = li(i + 1, t, y) })
  y += 2
  y = rp('La integridad de la Red de Distribución Óptica depende de que el esfuerzo mecánico sobre el filamento de sílice sea mínimo una vez finalizada la instalación. Por tal motivo, los elementos de sujeción deberán estar correctamente dimensionados y deberán emplearse materiales resistentes a la corrosión, fatiga mecánica, radiación UV y condiciones ambientales adversas.', y)

  // ══════════════════════════════════════════════════════════════════════════
  // 8. Instalación de soportes, herrajes y fijaciones
  // ══════════════════════════════════════════════════════════════════════════
  y = ck(y, 40); y = sec('8. Instalación de soportes, herrajes y fijaciones', y)
  y = rp('La instalación aérea deberá ejecutarse mediante el uso de herrajes de suspensión, retención, preformados, crucetas, poleas de tendido y sistemas de flejado adecuados para cada tipo de cable.', y)
  y = rp('La fijación de soportes al poste deberá realizarse mediante flejes de acero inoxidable o galvanizado, tensionados con herramienta flejadora. En puntos de retención, remate, cambio de dirección o desnivel, será obligatorio utilizar sistemas de doble agarre, doble hebilla o mecanismos de seguridad equivalentes, a fin de evitar desplazamientos laterales, vibraciones, deslizamientos o fatiga prematura de la cubierta del cable.', y)
  y = rp('Los herrajes deberán instalarse conforme a las especificaciones del fabricante, respetando el diámetro exterior del cable, la carga de trabajo admisible y las condiciones ambientales del sitio.', y)

  // ══════════════════════════════════════════════════════════════════════════
  // 9. Herrajes de suspensión y retención
  // ══════════════════════════════════════════════════════════════════════════
  y = ck(y, 40); y = sec('9. Herrajes de suspensión y retención', y)
  y = rp('Se definen dos categorías principales de herrajes según su función dentro del tramo:', y)
  y = ck(y, 30); y = ssh('9.1 Herraje de suspensión', y)
  y = rp('El herraje de suspensión se utiliza en tramos rectos o de baja exigencia mecánica. Su función principal es sostener el cable y mantenerlo elevado, permitiendo un grado controlado de flexibilidad ante movimientos provocados por viento, dilatación térmica o vibraciones.', y)
  y = rp('Este tipo de herraje no debe absorber la tensión total del vano, sino acompañar el recorrido del cable sin generar estrangulamientos ni deformaciones sobre la cubierta.', y)
  y = ck(y, 30); y = ssh('9.2 Herraje de retención o anclaje', y)
  y = rp('El herraje de retención, también denominado anclaje, remate o corneta, se utiliza en extremos de tramo, cambios de dirección, cruces, desniveles, acometidas especiales y puntos donde sea necesario absorber la tensión mecánica del cable.', y)
  y = rp('Su función es transferir la carga longitudinal del tendido hacia la estructura soporte, evitando que dicha tensión se propague de manera continua a lo largo de la red.', y)

  // ══════════════════════════════════════════════════════════════════════════
  // 10. Control de tensión y radio de curvatura
  // ══════════════════════════════════════════════════════════════════════════
  y = ck(y, 40); y = sec('10. Control de tensión y radio de curvatura', y)
  y = rp('Durante el tendido deberán respetarse estrictamente los radios mínimos de curvatura especificados para el cable utilizado.', y)
  y = rp('Como criterio general, se adoptarán los siguientes valores de referencia:', y)
  y = li(1, 'Condición dinámica: radio mínimo equivalente a 20 veces el diámetro exterior del cable.', y)
  y = li(2, 'Condición estática: radio mínimo equivalente a 10 veces el diámetro exterior del cable.', y)
  y += 2
  y = rp('Por ejemplo, para un cable de 144 fibras con un diámetro exterior de 14,4 mm, el radio mínimo de curvatura en condición estática será de 144 mm.', y)
  y = rp('El incumplimiento de estos valores puede producir atenuaciones por macrocurvatura, microcurvatura, fisuras internas, daños en tubos holgados, deformación de la cubierta exterior o pérdida permanente de rendimiento óptico.', y)

  // ══════════════════════════════════════════════════════════════════════════
  // 11. Procedimiento general de despliegue
  // ══════════════════════════════════════════════════════════════════════════
  y = ck(y, 40); y = sec('11. Procedimiento general de despliegue', y)
  y = rp('El despliegue deberá ejecutarse mediante cuadrillas coordinadas, con señalización vial, elementos de protección personal, herramientas adecuadas y supervisión técnica en campo.', y)
  y = rp('El procedimiento general comprenderá las siguientes etapas:', y)
  y = ck(y, 30); y = ssh('11.1 Planificación y preparación de materiales', y)
  y = rp('Previo al inicio de tareas se deberán verificar y disponer los siguientes elementos:', y)
  ;[
    'Bobina de fibra óptica.', 'Portabobina o sistema de soporte.', 'Herrajes de suspensión.',
    'Herrajes de retención.', 'Preformados compatibles con el diámetro del cable.',
    'Flejes, hebillas y herramientas de flejado.', 'Poleas de tendido.',
    'Crucetas o raquetas de reserva.', 'Elementos de señalización.',
    'Equipos de medición y control.',
    'Planos de ingeniería, diagramas de empalme y plan de tendido.',
  ].forEach((t, i) => { y = ck(y, 12); y = li(i + 1, t, y) })
  y += 2
  y = rp('La bobina deberá asegurarse en el punto inicial del tendido, garantizando su correcta alineación con el recorrido del cable y evitando esfuerzos laterales.', y)
  y = ck(y, 30); y = ssh('11.2 Instalación de herrajes temporales y poleas', y)
  y = rp('Se deberán instalar poleas o soportes temporales en los postes definidos por la ingeniería de tendido. Las poleas deberán contar con un diámetro adecuado para evitar curvaturas excesivas durante el paso del cable.', y)
  y = rp('Para cables ADSS se recomienda el uso de poleas de diámetro suficiente, preferentemente cercanas a 0,6 m, cuando las condiciones del tramo así lo requieran. Esta práctica permite mantener el radio de curvatura dentro de parámetros seguros y facilita el desplazamiento progresivo del cable.', y)
  y = ck(y, 30); y = ssh('11.3 Tendido y desenrollado del cable', y)
  y = rp('El cable deberá desenrollarse desde la parte superior de la bobina, evitando torsiones, giros no controlados o arrastres sobre superficies abrasivas.', y)
  y = rp('El tendido podrá realizarse mediante dos métodos principales:', y)
  y = li(1, 'Método por tracción: la bobina permanece fija sobre soportes o vehículo portabobina, mientras el cable es traccionado progresivamente a través de poleas.', y)
  y = li(2, 'Método progresivo: la bobina se desplaza acompañando el tendido, reduciendo esfuerzos de tracción en determinados escenarios.', y)
  y += 2
  y = rp('El método por tracción resulta adecuado para terrenos estables, trazas lineales y recorridos con bajo nivel de obstrucción. En todos los casos deberá utilizarse un sistema de freno o control de tensión para evitar esfuerzos superiores a los admisibles por el fabricante.', y)

  // ══════════════════════════════════════════════════════════════════════════
  // 12. Regla de control 15/15
  // ══════════════════════════════════════════════════════════════════════════
  y = ck(y, 30); y = sec('12. Regla de control 15/15', y)
  y = rp('Durante el despliegue deberá aplicarse como criterio operativo la denominada regla 15/15, consistente en mantener una distancia mínima aproximada de 15 metros entre la bobina y el primer punto de elevación, a fin de garantizar un ángulo de ingreso inferior a 15 grados.', y)
  y = rp('Esta práctica reduce el riesgo de curvaturas excesivas, deformaciones de cubierta, esfuerzos localizados y generación de atenuaciones ópticas durante la instalación.', y)

  // ══════════════════════════════════════════════════════════════════════════
  // 13. Segmentación de tensión y estabilidad estructural
  // ══════════════════════════════════════════════════════════════════════════
  y = ck(y, 40); y = sec('13. Segmentación de tensión y estabilidad estructural', y)
  y = rp('Con el objeto de preservar la estabilidad mecánica de la red, no deberán superarse tramos extensos sin puntos de retención intermedios. Como criterio general, se recomienda no exceder los 600 metros de tendido sin instalar un herraje de retención, salvo que la ingeniería específica del tramo y las especificaciones del fabricante indiquen condiciones diferentes.', y)
  y = rp('Asimismo, deberán instalarse herrajes de retención en:', y)
  ;[
    'Cambios de dirección.', 'Cruces de calles o rutas.', 'Desniveles pronunciados.',
    'Finales de tramo.', 'Sectores expuestos a fuertes vientos.',
    'Zonas con vanos extensos.', 'Puntos de derivación o reserva técnica.',
  ].forEach((t, i) => { y = ck(y, 12); y = li(i + 1, t, y) })
  y += 2
  y = rp('Esta segmentación permite distribuir las cargas, evitar la acumulación de tensión y reducir el riesgo de falla mecánica en la red.', y)

  // ══════════════════════════════════════════════════════════════════════════
  // 14. Instalación de remates, suspensiones y preformados
  // ══════════════════════════════════════════════════════════════════════════
  y = ck(y, 40); y = sec('14. Instalación de remates, suspensiones y preformados', y)
  y = rp('Los preformados constituyen elementos críticos para la distribución uniforme del esfuerzo mecánico sobre el cable. Su diseño helicoidal permite transformar la tracción longitudinal en compresión radial controlada, abrazando el cable sin generar puntos de presión excesiva.', y)
  y = rp('Durante su instalación deberán cumplirse los siguientes criterios:', y)
  ;[
    'Validar que el diámetro del preformado coincida con el diámetro exterior del cable.',
    'Evitar el uso de preformados de menor diámetro, ya que pueden producir estrangulamiento y atenuación inmediata.',
    'Evitar el uso de preformados de mayor diámetro, ya que pueden generar deslizamiento del cable.',
    'Asegurar que el cable ingrese por el centro del herraje.',
    'No permitir salidas laterales que expongan la cubierta a aristas metálicas.',
    'No utilizar herramientas punzantes o elementos que puedan dañar la chaqueta.',
    'Completar el cierre del preformado una vez validada la tensión final del tramo.',
  ].forEach((t, i) => { y = ck(y, 12); y = li(i + 1, t, y) })
  y += 2
  y = rp('Una instalación incorrecta de preformados puede provocar daños mecánicos, pérdidas ópticas, fatiga prematura del cable o fallas progresivas en la red.', y)

  // ══════════════════════════════════════════════════════════════════════════
  // 15. Gestión de reservas técnicas
  // ══════════════════════════════════════════════════════════════════════════
  y = ck(y, 40); y = sec('15. Gestión de reservas técnicas', y)
  y = rp('La red deberá contemplar reservas técnicas de fibra óptica en puntos estratégicos, tales como cajas de empalme, cajas de distribución, cambios de dirección, puntos de derivación y sectores críticos de mantenimiento.', y)
  y = rp('Las reservas deberán organizarse mediante crucetas, raquetas o soportes específicos, respetando en todo momento el radio mínimo de curvatura del cable.', y)
  y = rp('Como criterio general, se recomienda disponer:', y)
  y = li(1, 'Reservas aproximadas de 30 metros en cierres de empalme principales.', y)
  y = li(2, 'Reservas de entre 15 y 20 metros en puntos de empalme secundarios.', y)
  y = li(3, 'Reservas adicionales en cruces, puntos críticos o sectores de futura expansión.', y)
  y += 2
  y = rp('Estas reservas permiten realizar empalmes, reconfiguraciones, reparaciones o ampliaciones sin necesidad de reemplazar tramos completos de cable.', y)

  // ══════════════════════════════════════════════════════════════════════════
  // 16. Especificaciones técnicas de cables de fibra óptica
  // ══════════════════════════════════════════════════════════════════════════
  y = ck(y, 60); y = sec('16. Especificaciones técnicas de cables de fibra óptica', y)
  y = rp('Los cables seleccionados deberán responder a una estructura de tubo holgado —Loose Tube—, con miembro central de refuerzo tipo FRP, cubierta exterior de alta resistencia y características mecánicas aptas para tendido aéreo.', y)
  y += 2
  setFont(pdf, 'bold', 8.5, C.accent); pdf.text('Tabla de referencia técnica', M, y); y += 5
  pdf.setFillColor(...C.dark); pdf.rect(M, y, CW, 7, 'F')
  setFont(pdf, 'bold', 8, C.white)
  pdf.text('Característica', M + 2, y + 4.8); pdf.text('Especificación técnica', M + 88, y + 4.8); y += 7
  ;([
    ['Cantidad de fibras',           '6, 12, 24, 36, 48, 72, 96 y 144 fibras'],
    ['Tipo de estructura',           'Tubo holgado —Loose Tube—'],
    ['Material del buffer',          'PBT'],
    ['Diámetro del buffer',          '1,9 mm a 2,1 mm'],
    ['Miembro central de refuerzo',  'FRP / PE-FRP'],
    ['Cubierta exterior',            'MDPE —Polietileno de Media Densidad—'],
    ['Peso aproximado',              '80 kg/km para 6 FO hasta 180 kg/km para 144 FO'],
    ['Longitud de bobina',           '4 km ± 10 %'],
    ['Temperatura de instalación',   '-10 °C a +70 °C'],
    ['Temperatura de operación',     '-40 °C a +70 °C'],
    ['Resistencia mecánica',         'Según especificación del fabricante'],
    ['Aplicación',                   'Planta externa aérea y red de distribución óptica'],
  ] as [string, string][]).forEach(([lbl, val], i) => {
    y = ck(y, 20)
    pdf.setFillColor(...(i % 2 === 0 ? C.rowEven : C.white)); pdf.rect(M, y, CW, 6, 'F')
    setFont(pdf, 'bold', 8, C.dark); pdf.text(lbl, M + 2, y + 4)
    setFont(pdf, 'normal', 8, C.dark); pdf.text(val, M + 88, y + 4); y += 6
  })
  y += 6

  // ══════════════════════════════════════════════════════════════════════════
  // 17. Cajas de empalme y distribución
  // ══════════════════════════════════════════════════════════════════════════
  y = ck(y, 50); y = sec('17. Cajas de empalme y distribución', y)
  y = ssh('17.1 Cajas de empalme FOSC', y)
  y = rp('Las cajas de empalme FOSC —Fiber Optic Splice Closure— serán utilizadas para proteger las fusiones ópticas en la red troncal y de distribución.', y)
  y = rp('Estos elementos deberán garantizar:', y)
  ;[
    'Estanqueidad.', 'Protección mecánica.', 'Organización interna de fibras.',
    'Gestión adecuada de bandejas de empalme.', 'Posibilidad de futuras ampliaciones.',
    'Resistencia a condiciones ambientales.', 'Protección contra humedad, polvo y agentes externos.',
  ].forEach((t, i) => { y = ck(y, 12); y = li(i + 1, t, y) })
  y += 2
  y = rp('Las cajas deberán instalarse en puntos definidos por la ingeniería, respetando criterios de accesibilidad, seguridad, reserva técnica y continuidad operativa.', y)
  y = ck(y, 40); y = ssh('17.2 Cajas de terminación óptica CTO/NAP', y)
  y = rp('Las cajas de terminación óptica, también denominadas CTO o NAP, constituyen el punto de acceso desde el cual se realiza la conexión hacia el abonado final.', y)
  y = rp('Estas cajas podrán configurarse en arquitecturas de red distribuida, centralizada o en cascada, según el diseño adoptado para el polígono de servicio.', y)
  y = rp('Deberán permitir:', y)
  ;[
    'Alojamiento de splitters ópticos.', 'Gestión ordenada de fibras.',
    'Puertos de salida para acometidas.', 'Protección mecánica y ambiental.',
    'Identificación de clientes o puertos.', 'Mantenimiento sencillo y seguro.',
  ].forEach((t, i) => { y = ck(y, 12); y = li(i + 1, t, y) })
  y += 4

  // ══════════════════════════════════════════════════════════════════════════
  // 18. Splitters ópticos
  // ══════════════════════════════════════════════════════════════════════════
  y = ck(y, 50); y = sec('18. Splitters ópticos', y)
  y = rp('Los splitters ópticos son componentes pasivos encargados de dividir la señal proveniente de la OLT hacia múltiples abonados.', y)
  y = rp('Para el presente diseño se estandariza el uso de splitters 1x16, con el objetivo de equilibrar la cobertura del polígono, el presupuesto de potencia óptica, la cantidad de usuarios por puerto PON y la disponibilidad de ancho de banda.', y)
  y = rp('La relación de división deberá verificarse en función de:', y)
  ;[
    'Potencia de transmisión de la OLT.', 'Sensibilidad de recepción de la ONT.',
    'Longitud total del enlace.', 'Pérdidas por empalmes.', 'Pérdidas por conectores.',
    'Atenuación propia del cable.', 'Pérdida de inserción del splitter.', 'Margen de seguridad operativo.',
  ].forEach((t, i) => { y = ck(y, 12); y = li(i + 1, t, y) })
  y += 4

  // ══════════════════════════════════════════════════════════════════════════
  // 19. Equipamiento en Oficina Central
  // ══════════════════════════════════════════════════════════════════════════
  y = ck(y, 50); y = sec('19. Equipamiento en Oficina Central', y)
  y = rp('La Oficina Central constituye el nodo principal de gestión, agregación y distribución de servicios. En este sitio se alojará el equipamiento activo encargado de iluminar la red óptica y vincularla con el core de transporte o red de servicios.', y)
  y = ck(y, 35); y = ssh('19.1 OLT —Optical Line Terminal—', y)
  y = rp('La OLT actuará como terminal de línea óptica y será responsable de la gestión de los puertos PON, asignación de perfiles de servicio, administración de abonados, control de ancho de banda y supervisión de la red.', y)
  y = rp('Se recomienda el uso de una arquitectura modular que contemple, según disponibilidad del fabricante, los siguientes módulos:', y)
  ;[
    'Módulo de control y gestión.', 'Módulo de alimentación.', 'Módulos de puertos PON.',
    'Módulos de uplink GE/10GE.', 'Sistema de ventilación.',
    'Fuente de energía redundante.', 'Sistema de administración remota.',
  ].forEach((t, i) => { y = ck(y, 12); y = li(i + 1, t, y) })
  y += 2
  y = ck(y, 30); y = ssh('19.2 EDFA —Erbium Doped Fiber Amplifier—', y)
  y = rp('El EDFA podrá utilizarse cuando el diseño contemple servicios de video RF, CATV sobre fibra o enlaces que requieran compensación de pérdidas ópticas.', y)
  y = rp('Su función será amplificar la señal óptica sin necesidad de conversión electro-óptica intermedia, permitiendo mantener niveles adecuados de potencia en tramos de distribución de mayor exigencia.', y)

  // ══════════════════════════════════════════════════════════════════════════
  // 20. Proceso de ingeniería e implementación
  // ══════════════════════════════════════════════════════════════════════════
  y = ck(y, 40); y = sec('20. Proceso de ingeniería e implementación', y)
  y = rp('El desarrollo del proyecto deberá seguir un ciclo técnico ordenado que contemple las siguientes etapas:', y)
  ;([
    ['20.1 Delimitación de cobertura',         'Definición del polígono de servicio, identificación de zonas objetivo, análisis de densidad de viviendas, comercios, instituciones y potenciales usuarios.'],
    ['20.2 Estimación de alcance y penetración','Proyección de demanda, cálculo de hogares pasados, usuarios potenciales, tasa de adopción esperada y dimensionamiento inicial de puertos PON.'],
    ['20.3 Relevamiento de campo',              'Inspección física de postes, cruces, obstáculos, alturas disponibles, estado de infraestructura existente y puntos críticos de instalación.'],
    ['20.4 Gestión de permisos',                'Tramitación de autorizaciones ante organismos municipales, prestatarias eléctricas, propietarios de infraestructura, entes reguladores o autoridades competentes.'],
    ['20.5 Diseño de red',                      'Definición de arquitectura lógica, ubicación de OLT, rutas troncales, puntos de distribución, cajas de empalme, CTO/NAP, splitters y reservas técnicas.'],
    ['20.6 Ingeniería de detalle',              'Elaboración de planos constructivos, diagramas de empalme, identificación de fibras, cálculo de presupuesto óptico, plan de tendido, plan de fusión y plan de medición.'],
    ['20.7 Listado de materiales —BOM—',        'Cuantificación técnica de cables, herrajes, cajas, splitters, conectores, bandejas, accesorios, equipamiento activo, herramientas y elementos de instalación.'],
    ['20.8 Implementación',                     'Ejecución física del tendido, montaje de herrajes, instalación de cajas, fusionado, organización de reservas, montaje de equipamiento en Oficina Central y puesta en servicio inicial.'],
    ['20.9 Mediciones y certificación',         'Verificación técnica de la red mediante instrumentos de medición óptica, generación de registros, validación de parámetros y aceptación final de infraestructura.'],
  ] as [string, string][]).forEach(([titulo, desc]) => { y = ck(y, 20); y = ssh(titulo, y); y = rp(desc, y) })

  // ══════════════════════════════════════════════════════════════════════════
  // 21. Mediciones críticas y certificación de red
  // ══════════════════════════════════════════════════════════════════════════
  y = ck(y, 40); y = sec('21. Mediciones críticas y certificación de red', y)
  y = rp('La certificación final de la red constituye una instancia obligatoria para validar la calidad constructiva y el desempeño óptico de la infraestructura desplegada.', y)
  y = ck(y, 40); y = ssh('21.1 Medición con OTDR', y)
  y = rp('El OTDR —Optical Time Domain Reflectometer— deberá utilizarse para realizar pruebas de reflectometría óptica, permitiendo identificar eventos a lo largo del enlace, tales como empalmes, conectores, pérdidas, reflectancias, cortes, macrocurvaturas o anomalías mecánicas.', y)
  y = rp('Mediante esta prueba se deberá verificar:', y)
  ;[
    'Atenuación total del enlace.', 'Pérdida por kilómetro.', 'Pérdidas individuales por empalme.',
    'Pérdidas por conectores.', 'Existencia de macrocurvaturas o microcurvaturas.',
    'Continuidad de cada hilo.', 'Ubicación de eventos reflectivos y no reflectivos.',
    'Integridad de la fibra en puntos de retención o reserva.',
  ].forEach((t, i) => { y = ck(y, 12); y = li(i + 1, t, y) })
  y += 2
  y = ck(y, 30); y = ssh('21.2 Medición con Power Meter', y)
  y = rp('El medidor de potencia óptica —Power Meter— deberá utilizarse para verificar los niveles de señal recibidos en puntos clave de la red, especialmente en CTO, puntos de distribución y ONT del abonado final.', y)
  y = rp('Esta medición permitirá confirmar que la potencia óptica recibida se encuentra dentro del rango dinámico permitido por los equipos activos, garantizando la correcta operación del servicio.', y)

  // ══════════════════════════════════════════════════════════════════════════
  // 22. Criterios de aceptación técnica
  // ══════════════════════════════════════════════════════════════════════════
  y = ck(y, 60); y = sec('22. Criterios de aceptación técnica', y)
  y = rp('La red será considerada apta para su puesta en servicio cuando cumpla, como mínimo, con los siguientes criterios:', y)
  ;[
    'Continuidad óptica comprobada en todos los hilos habilitados.',
    'Atenuación dentro de los márgenes definidos por ingeniería.',
    'Ausencia de eventos anómalos en trazas OTDR.',
    'Niveles de potencia óptica compatibles con la OLT y la ONT.',
    'Correcta identificación de fibras, cajas, puertos y splitters.',
    'Reservas técnicas correctamente dispuestas.',
    'Herrajes instalados sin deformación del cable.',
    'Radios de curvatura respetados en toda la red.',
    'Cajas de empalme y CTO correctamente selladas.',
    'Documentación técnica actualizada conforme a obra.',
  ].forEach((t, i) => { y = ck(y, 12); y = li(i + 1, t, y) })
  y += 4

  // ══════════════════════════════════════════════════════════════════════════
  // 23. Conclusión
  // ══════════════════════════════════════════════════════════════════════════
  y = ck(y, 110); y = sec('23. Conclusión', y)
  y = rp('La implementación de una red FTTH basada en arquitectura GPON requiere una planificación integral, una ejecución técnica rigurosa y una certificación óptica completa. La correcta selección de materiales, el control de tensión durante el tendido, el respeto de los radios de curvatura, la adecuada instalación de herrajes y la medición final de la infraestructura son factores determinantes para garantizar el desempeño y la vida útil de la red.', y)
  y = rp('El cumplimiento de los criterios desarrollados en la presente memoria descriptiva permitirá disponer de una Red de Distribución Óptica robusta, escalable, de bajo mantenimiento y preparada para soportar las crecientes demandas de conectividad, servicios digitales y ancho de banda futuro.', y)
  y = rp('La infraestructura resultante estará orientada a brindar una solución de telecomunicaciones confiable, eficiente y técnicamente apta para la prestación de servicios de clase portadora.', y)

  // ── Firma ─────────────────────────────────────────────────────────────────
  y = ck(y, 20)
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

// ── Generadores independientes (exportados para el menú Acciones) ─────────────

export function generateUnifilarPdf(sub: SubProject, projectName: string) {
  const company = loadCompanyProfile()
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  drawUnifilarDiagram(pdf, sub.features, company, false)
  const safe = (sub.name || 'proyecto').replace(/\s+/g, '-').toLowerCase()
  pdf.save(`diagrama-unifilar-${safe}.pdf`)
}

export function generatePresupuestoPdf(sub: SubProject, projectName: string) {
  const company = loadCompanyProfile()
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  drawPresupuestoOptico(pdf, sub.features, company, false)
  const safe = (sub.name || 'proyecto').replace(/\s+/g, '-').toLowerCase()
  pdf.save(`presupuesto-optico-${safe}.pdf`)
}

export function generatePlanillaPdf(sub: SubProject, projectName: string) {
  const company = loadCompanyProfile()
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  drawPlanillaMateriales(pdf, sub.features, company, false)
  const safe = (sub.name || 'proyecto').replace(/\s+/g, '-').toLowerCase()
  pdf.save(`planilla-materiales-${safe}.pdf`)
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
