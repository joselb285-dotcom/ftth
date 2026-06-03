import { useRef, useState } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import jsPDF from 'jspdf'
import type { AppFeature } from './types'
import SpliceExportView from './SpliceExportView'
import { typeLabels, statusLabels } from './editorConstants'
import { computeLineLength } from './OpticalPath'
import { useReportData, generateMaterialsCSV } from './useReportData'

// ── jsPDF helpers ─────────────────────────────────────────────────────────────
type PDF = InstanceType<typeof jsPDF>

const W = 210, H = 297
const M = 14          // margin mm
const CW = W - 2 * M  // content width
const HDR_H = 10      // header band height
const FOOT_H = 8
const CONTENT_TOP = M + HDR_H + 4
const CONTENT_BOT = H - M - FOOT_H - 2

const C = {
  primary:   [37, 99, 235]  as [number,number,number],
  dark:      [9,  15, 30]   as [number,number,number],
  light:     [241,245,249]  as [number,number,number],
  mid:       [148,163,184]  as [number,number,number],
  white:     [255,255,255]  as [number,number,number],
  black:     [15, 23, 42]   as [number,number,number],
  green:     [16, 185,129]  as [number,number,number],
  amber:     [245,158, 11]  as [number,number,number],
  red:       [239, 68, 68]  as [number,number,number],
  rowEven:   [248,250,252]  as [number,number,number],
  rowOdd:    [255,255,255]  as [number,number,number],
  headerBg:  [30, 58,138]   as [number,number,number],
}

function rgb(c: [number,number,number]) { return { r: c[0], g: c[1], b: c[2] } }

function addPageHeader(pdf: PDF, title: string, sub: string) {
  pdf.setFillColor(...C.dark)
  pdf.rect(0, 0, W, HDR_H, 'F')
  pdf.setFillColor(...C.primary)
  pdf.rect(0, HDR_H - 1.2, W, 1.2, 'F')
  pdf.setTextColor(...C.white)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(7)
  pdf.text(title.toUpperCase(), M, HDR_H - 3)
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(6.5)
  pdf.text(sub, W - M, HDR_H - 3, { align: 'right' })
}

function addPageFooter(pdf: PDF, pageNum: number, fecha: string) {
  const y = H - FOOT_H + 2
  pdf.setFillColor(...C.light)
  pdf.rect(0, H - FOOT_H, W, FOOT_H, 'F')
  pdf.setFillColor(...C.primary)
  pdf.rect(0, H - FOOT_H, W, 0.5, 'F')
  pdf.setTextColor(...C.mid)
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(6)
  pdf.text('FTTH GIS Editor — Reporte Técnico', M, y + 2)
  pdf.text(fecha, W / 2, y + 2, { align: 'center' })
  pdf.text(`Pág. ${pageNum}`, W - M, y + 2, { align: 'right' })
}

interface ColDef { header: string; width: number; align?: 'left' | 'right' | 'center'; key?: string }

function drawTable(
  pdf: PDF, cols: ColDef[], rows: string[][], startY: number,
  opts?: { rowH?: number; fontSize?: number }
): number {
  const rowH = opts?.rowH ?? 6
  const fs = opts?.fontSize ?? 7
  let y = startY

  // Header
  pdf.setFillColor(...C.headerBg)
  pdf.rect(M, y, CW, rowH + 1, 'F')
  pdf.setTextColor(...C.white)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(fs)
  let cx = M + 2
  for (const col of cols) {
    const align = col.align ?? 'left'
    const tx = align === 'right' ? cx + col.width - 2 : align === 'center' ? cx + col.width / 2 : cx
    pdf.text(col.header, tx, y + rowH - 1.5, { align })
    cx += col.width
  }
  y += rowH + 1

  // Rows
  pdf.setFont('helvetica', 'normal')
  for (let ri = 0; ri < rows.length; ri++) {
    if (y + rowH > CONTENT_BOT) {
      pdf.addPage()
      y = CONTENT_TOP
    }
    pdf.setFillColor(...(ri % 2 === 0 ? C.rowEven : C.rowOdd))
    pdf.rect(M, y, CW, rowH, 'F')
    pdf.setTextColor(...C.black)
    pdf.setFontSize(fs)
    cx = M + 2
    for (let ci = 0; ci < cols.length; ci++) {
      const col = cols[ci]
      const cell = rows[ri][ci] ?? ''
      const maxChars = Math.floor(col.width / (fs * 0.35))
      const text = cell.length > maxChars ? cell.slice(0, maxChars - 1) + '…' : cell
      const align = col.align ?? 'left'
      const tx = align === 'right' ? cx + col.width - 2 : align === 'center' ? cx + col.width / 2 : cx
      pdf.text(text, tx, y + rowH - 1.5, { align })
      cx += col.width
    }
    // Row border
    pdf.setDrawColor(220, 228, 240)
    pdf.setLineWidth(0.15)
    pdf.line(M, y + rowH, M + CW, y + rowH)
    y += rowH
  }
  // Outer border
  pdf.setDrawColor(...C.mid)
  pdf.setLineWidth(0.3)
  pdf.rect(M, startY, CW, y - startY, 'S')
  return y + 4
}

function sectionTitle(pdf: PDF, text: string, y: number): number {
  pdf.setFillColor(...C.primary)
  pdf.rect(M, y, 3, 7, 'F')
  pdf.setTextColor(...C.black)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(11)
  pdf.text(text, M + 5, y + 5.5)
  pdf.setFont('helvetica', 'normal')
  return y + 11
}

function kpiCard(pdf: PDF, x: number, y: number, w: number, h: number, value: string, label: string, color: [number,number,number]) {
  pdf.setFillColor(...C.light)
  pdf.roundedRect(x, y, w, h, 2, 2, 'F')
  pdf.setFillColor(...color)
  pdf.roundedRect(x, y, w, 2, 2, 2, 'F')
  pdf.rect(x, y + 1, w, 1, 'F')
  pdf.setTextColor(...color)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(17)
  pdf.text(value, x + w / 2, y + h / 2 + 1, { align: 'center' })
  pdf.setTextColor(...C.mid)
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(7)
  pdf.text(label, x + w / 2, y + h - 3, { align: 'center' })
}

async function svgToCanvas(svgMarkup: string, w: number, h: number): Promise<HTMLCanvasElement> {
  const svgBlob = new Blob(
    [`<?xml version="1.0" encoding="UTF-8"?>`, svgMarkup],
    { type: 'image/svg+xml;charset=utf-8' }
  )
  const url = URL.createObjectURL(svgBlob)
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      const scale = 2
      canvas.width = w * scale; canvas.height = h * scale
      const ctx = canvas.getContext('2d')!
      ctx.scale(scale, scale)
      ctx.fillStyle = 'white'
      ctx.fillRect(0, 0, w, h)
      ctx.drawImage(img, 0, 0, w, h)
      URL.revokeObjectURL(url)
      resolve(canvas)
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('SVG render failed')) }
    img.src = url
  })
}

// ── Props ─────────────────────────────────────────────────────────────────────
interface Props {
  features: AppFeature[]
  projectName: string
  subProjectName: string
  mapElementRef: React.RefObject<HTMLDivElement | null>
  onClose: () => void
}

// ── Config ────────────────────────────────────────────────────────────────────
interface Config {
  empresa: string
  elaboradoPor: string
  nroPlano: string
  sections: {
    cover: boolean
    map: boolean
    summary: boolean
    elements: boolean
    spliceCards: boolean
    clients: boolean
    materials: boolean
  }
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function ReportModal({ features, projectName, subProjectName, mapElementRef, onClose }: Props) {
  const data = useReportData(features)
  const [cfg, setCfg] = useState<Config>({
    empresa: '',
    elaboradoPor: '',
    nroPlano: '001',
    sections: {
      cover: true, map: true, summary: true,
      elements: true, spliceCards: true, clients: true, materials: true,
    },
  })
  const [generating, setGenerating] = useState(false)
  const [progress, setProgress] = useState('')
  const progressRef = useRef(setProgress)
  progressRef.current = setProgress

  function toggleSection(key: keyof Config['sections']) {
    setCfg(c => ({ ...c, sections: { ...c.sections, [key]: !c.sections[key] } }))
  }

  // ── CSV export ──────────────────────────────────────────────────────────────
  function exportCSV() {
    const csv = generateMaterialsCSV(data, projectName, subProjectName)
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `materiales-${subProjectName.replace(/\s+/g, '-')}.csv`
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    URL.revokeObjectURL(a.href)
  }

  // ── PDF generation ──────────────────────────────────────────────────────────
  async function generatePDF() {
    setGenerating(true)
    const step = (s: string) => progressRef.current(s)

    try {
      const { default: jsPDF } = await import('jspdf')
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
      const fecha = new Date().toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' })
      let pageNum = 0

      const newPage = (addHeader = true) => {
        if (pageNum > 0) pdf.addPage()
        pageNum++
        if (addHeader) {
          addPageHeader(pdf, projectName, subProjectName)
          addPageFooter(pdf, pageNum, fecha)
        }
      }

      // ── PORTADA ─────────────────────────────────────────────────────────────
      if (cfg.sections.cover) {
        step('Generando portada…')
        newPage(false)
        // Background accent band
        pdf.setFillColor(...C.dark)
        pdf.rect(0, 0, W, H / 3, 'F')
        pdf.setFillColor(...C.primary)
        pdf.rect(0, H / 3, W, 2, 'F')
        // Decorative stripe
        pdf.setFillColor(37, 99, 235, 0.15)
        for (let i = 0; i < 6; i++) {
          pdf.setFillColor(255, 255, 255)
          pdf.setGState(pdf.GState({ opacity: 0.04 + i * 0.01 }))
          pdf.rect(W - 60 + i * 8, 0, 6, H / 3, 'F')
        }
        pdf.setGState(pdf.GState({ opacity: 1 }))
        // Title in dark area
        pdf.setTextColor(...C.white)
        pdf.setFont('helvetica', 'bold')
        pdf.setFontSize(9)
        pdf.text('REPORTE TÉCNICO DE RED FTTH', W / 2, 45, { align: 'center' })
        pdf.setFontSize(22)
        pdf.text(projectName, W / 2, 62, { align: 'center' })
        pdf.setFont('helvetica', 'normal')
        pdf.setFontSize(14)
        pdf.setTextColor(148, 163, 184)
        pdf.text(subProjectName, W / 2, 74, { align: 'center' })
        // Metadata block
        const mx = M, my = H / 3 + 18
        pdf.setTextColor(...C.black)
        const meta: [string, string][] = [
          ['Empresa:', cfg.empresa || '—'],
          ['Elaborado por:', cfg.elaboradoPor || '—'],
          ['Fecha:', fecha],
          ['N° Plano:', cfg.nroPlano || '001'],
        ]
        meta.forEach(([label, value], i) => {
          const y = my + i * 13
          pdf.setFont('helvetica', 'bold')
          pdf.setFontSize(8)
          pdf.setTextColor(...C.mid)
          pdf.text(label, mx, y)
          pdf.setFont('helvetica', 'normal')
          pdf.setFontSize(11)
          pdf.setTextColor(...C.black)
          pdf.text(value, mx, y + 6)
          pdf.setDrawColor(...C.light)
          pdf.setLineWidth(0.3)
          pdf.line(mx, y + 8, W - mx, y + 8)
        })
        // Stats preview at bottom
        const bw = (CW - 6) / 4, bh = 24, by = H - M - bh - 10
        const kpis: [string, string, [number,number,number]][] = [
          [String(data.stats.totalElements), 'Elementos', C.primary],
          [`${data.stats.totalFiberLengthKm.toFixed(2)} km`, 'Fibra trazada', C.green],
          [String(data.stats.napCount + data.stats.spliceBoxCount), 'Cajas', C.amber],
          [String(data.stats.totalClientCount), 'Clientes', [168,85,247]],
        ]
        kpis.forEach(([val, lbl, col], i) => {
          kpiCard(pdf, M + i * (bw + 2), by, bw, bh, val, lbl, col)
        })
        addPageFooter(pdf, pageNum, fecha)
      }

      // ── MAPA ────────────────────────────────────────────────────────────────
      if (cfg.sections.map && mapElementRef.current) {
        step('Capturando mapa…')
        newPage()
        const { default: html2canvas } = await import('html2canvas')
        const canvas = await html2canvas(mapElementRef.current, {
          useCORS: true, allowTaint: true, scale: 1.5,
        })
        const imgData = canvas.toDataURL('image/png')
        const imgH = Math.round(CW * canvas.height / canvas.width)
        let y = CONTENT_TOP
        y = sectionTitle(pdf, 'Plano del Subproyecto', y)
        const maxImgH = CONTENT_BOT - y - 4
        const finalH = Math.min(imgH, maxImgH)
        pdf.addImage(imgData, 'PNG', M, y, CW, finalH)
      }

      // ── RESUMEN ─────────────────────────────────────────────────────────────
      if (cfg.sections.summary) {
        step('Generando resumen…')
        newPage()
        let y = CONTENT_TOP
        y = sectionTitle(pdf, 'Resumen del Subproyecto', y)

        // KPI grid
        const kw = (CW - 9) / 4, kh = 22
        const kpis2: [string, string, [number,number,number]][] = [
          [String(data.stats.nodeCount), 'Nodos', C.primary],
          [String(data.stats.spliceBoxCount), 'Cajas empalme', C.amber],
          [String(data.stats.napCount), 'Cajas NAP', C.green],
          [String(data.stats.fiberLineCount), 'Tramos fibra', [168,85,247]],
        ]
        kpis2.forEach(([val, lbl, col], i) => {
          kpiCard(pdf, M + i * (kw + 3), y, kw, kh, val, lbl, col)
        })
        y += kh + 6

        const kpis3: [string, string, [number,number,number]][] = [
          [`${data.stats.totalFiberLengthKm.toFixed(3)} km`, 'Longitud trazada', C.primary],
          [`${data.stats.totalFiberLengthPhysicalKm.toFixed(3)} km`, 'Longitud física', C.green],
          [String(data.stats.totalClientCount), 'Clientes', C.amber],
          [`${data.stats.activeCount}/${data.stats.totalElements}`, 'Activos', C.green],
        ]
        kpis3.forEach(([val, lbl, col], i) => {
          kpiCard(pdf, M + i * (kw + 3), y, kw, kh, val, lbl, col)
        })
        y += kh + 10

        // Estado de elementos
        y = sectionTitle(pdf, 'Estado de elementos', y)
        y = drawTable(pdf,
          [
            { header: 'Estado', width: 50 },
            { header: 'Cantidad', width: 30, align: 'right' },
            { header: '% del total', width: 30, align: 'right' },
          ],
          [
            ['Activo', String(data.stats.activeCount), `${Math.round(data.stats.activeCount / Math.max(1, data.stats.totalElements) * 100)}%`],
            ['Planificado', String(data.stats.plannedCount), `${Math.round(data.stats.plannedCount / Math.max(1, data.stats.totalElements) * 100)}%`],
            ['Mantenimiento', String(data.stats.maintenanceCount), `${Math.round(data.stats.maintenanceCount / Math.max(1, data.stats.totalElements) * 100)}%`],
            ['Dañado', String(data.stats.damagedCount), `${Math.round(data.stats.damagedCount / Math.max(1, data.stats.totalElements) * 100)}%`],
          ], y
        )
      }

      // ── LISTA DE ELEMENTOS ──────────────────────────────────────────────────
      if (cfg.sections.elements && data.elements.length > 0) {
        step('Generando lista de elementos…')
        newPage()
        let y = CONTENT_TOP
        y = sectionTitle(pdf, 'Lista de Elementos', y)
        y = drawTable(pdf,
          [
            { header: 'Tipo', width: 38 },
            { header: 'Nombre', width: 50 },
            { header: 'Código', width: 28 },
            { header: 'Estado', width: 28 },
            { header: 'Longitud', width: 22, align: 'right' },
            { header: 'Fibras', width: 16, align: 'right' },
          ],
          data.elements.map(e => [
            e.type,
            e.name,
            e.code,
            e.status,
            e.lengthM !== null ? `${e.lengthM} m` : '—',
            e.fiberCount !== null ? String(e.fiberCount) : '—',
          ]),
          y, { rowH: 5.5 }
        )
      }

      // ── CARTAS DE EMPALME ───────────────────────────────────────────────────
      if (cfg.sections.spliceCards) {
        const boxesWithCards = features.filter(f =>
          (f.properties.featureType === 'splice_box' || f.properties.featureType === 'nap') &&
          (f.properties.spliceCard?.cables.length ?? 0) > 0
        )
        for (const feat of boxesWithCards) {
          step(`Renderizando carta: ${feat.properties.name || feat.properties.featureType}…`)
          try {
            const titleBlock = {
              empresa: cfg.empresa,
              titulo: 'Carta de empalme',
              proyecto: projectName,
              subProyecto: subProjectName,
              fecha,
              nroPlano: cfg.nroPlano,
              hoja: String(pageNum + 1),
              escala: '1:1',
              dibujo: cfg.elaboradoPor,
              revision: '0',
              aprobo: cfg.elaboradoPor,
              revNum: '0',
              logoDataUrl: null,
            }
            const svgMarkup = renderToStaticMarkup(
              <SpliceExportView card={feat.properties.spliceCard!} titleBlock={titleBlock} />
            )
            const PAGE_W = 794, PAGE_H = 1123
            const canvas = await svgToCanvas(svgMarkup, PAGE_W, PAGE_H)
            pdf.addPage()
            pageNum++
            pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, W, H)
          } catch { /* skip failed card */ }
        }
      }

      // ── LISTA DE CLIENTES ───────────────────────────────────────────────────
      if (cfg.sections.clients && data.clients.length > 0) {
        step('Generando lista de clientes…')
        newPage()
        let y = CONTENT_TOP
        y = sectionTitle(pdf, 'Lista de Clientes', y)
        y = drawTable(pdf,
          [
            { header: 'Caja', width: 32 },
            { header: 'Cable', width: 28 },
            { header: 'F.', width: 8, align: 'center' },
            { header: 'Cliente', width: 36 },
            { header: 'ONU Modelo', width: 28 },
            { header: 'Serie', width: 24 },
            { header: 'Potencia', width: 18, align: 'right' },
            { header: 'Estado', width: 18 },
          ],
          data.clients.map(c => [
            c.featureName, c.cable, c.fiber, c.clientName,
            c.onuModel, c.onuSerial, c.powerDbm ? `${c.powerDbm} dBm` : '—', c.powerClass,
          ]),
          y, { rowH: 5.5 }
        )
      }

      // ── PLANILLA DE MATERIALES ──────────────────────────────────────────────
      if (cfg.sections.materials && data.materials.length > 0) {
        step('Generando planilla de materiales…')
        newPage()
        let y = CONTENT_TOP
        y = sectionTitle(pdf, 'Planilla de Materiales', y)
        y = drawTable(pdf,
          [
            { header: 'Ítem', width: 18 },
            { header: 'Descripción', width: 106 },
            { header: 'Cantidad', width: 22, align: 'right' },
            { header: 'Unidad', width: 16, align: 'center' },
            { header: 'Detalle', width: 20 },
          ],
          data.materials.map(m => [m.item, m.description, String(m.quantity), m.unit, m.detail ?? '']),
          y
        )
      }

      // ── Save ────────────────────────────────────────────────────────────────
      step('Guardando PDF…')
      const safeName = `reporte-${subProjectName.replace(/\s+/g, '-')}-${new Date().toISOString().slice(0, 10)}`
      pdf.save(`${safeName}.pdf`)
      step('✓ PDF generado exitosamente')
      setTimeout(() => setGenerating(false), 1200)
    } catch (err) {
      console.error(err)
      step('Error al generar el PDF.')
      setGenerating(false)
    }
  }

  const spliceBoxCount = features.filter(f =>
    (f.properties.featureType === 'splice_box' || f.properties.featureType === 'nap') &&
    (f.properties.spliceCard?.cables.length ?? 0) > 0
  ).length

  const SECTIONS: { key: keyof Config['sections']; label: string; detail: string }[] = [
    { key: 'cover',       label: 'Portada',                 detail: 'Título, datos del proyecto y métricas clave' },
    { key: 'map',         label: 'Plano del mapa',          detail: 'Captura de la vista actual del mapa' },
    { key: 'summary',     label: 'Resumen del subproyecto', detail: 'KPIs, estado de elementos, longitud de fibra' },
    { key: 'elements',    label: 'Lista de elementos',      detail: `${features.length} elementos trazados` },
    { key: 'spliceCards', label: 'Cartas de empalme',       detail: `${spliceBoxCount} caja${spliceBoxCount !== 1 ? 's' : ''} con datos` },
    { key: 'clients',     label: 'Lista de clientes',       detail: `${data.stats.totalClientCount} cliente${data.stats.totalClientCount !== 1 ? 's' : ''} registrados` },
    { key: 'materials',   label: 'Planilla de materiales',  detail: `${data.materials.length} ítems calculados` },
  ]

  return (
    <div className="report-overlay" onClick={!generating ? onClose : undefined}>
      <div className="report-modal" onClick={e => e.stopPropagation()}>

        <div className="report-header">
          <div>
            <h2 className="report-title">Reporte técnico completo</h2>
            <p className="report-sub">{projectName} · {subProjectName}</p>
          </div>
          {!generating && (
            <button className="report-close" onClick={onClose} aria-label="Cerrar">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          )}
        </div>

        <div className="report-body">

          {/* Left: config */}
          <div className="report-config">
            <div className="report-section-label">Datos del documento</div>
            <div className="report-fields">
              <label className="report-field">
                <span>Empresa</span>
                <input placeholder="Nombre de la empresa" value={cfg.empresa}
                  onChange={e => setCfg(c => ({ ...c, empresa: e.target.value }))} />
              </label>
              <label className="report-field">
                <span>Elaborado por</span>
                <input placeholder="Ing. / Técnico" value={cfg.elaboradoPor}
                  onChange={e => setCfg(c => ({ ...c, elaboradoPor: e.target.value }))} />
              </label>
              <label className="report-field">
                <span>N° de plano</span>
                <input placeholder="001" value={cfg.nroPlano}
                  onChange={e => setCfg(c => ({ ...c, nroPlano: e.target.value }))} />
              </label>
            </div>

            <div className="report-section-label" style={{ marginTop: 18 }}>Secciones a incluir</div>
            <div className="report-sections">
              {SECTIONS.map(s => (
                <label key={s.key} className={`report-section-row${cfg.sections[s.key] ? ' checked' : ''}`}>
                  <input type="checkbox" checked={cfg.sections[s.key]}
                    onChange={() => toggleSection(s.key)} />
                  <div>
                    <strong>{s.label}</strong>
                    <small>{s.detail}</small>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Right: preview */}
          <div className="report-preview">
            <div className="report-section-label">Vista previa de materiales</div>
            <div className="report-materials-preview">
              <table className="report-table">
                <thead>
                  <tr><th>Ítem</th><th>Descripción</th><th>Cant.</th><th>U.</th></tr>
                </thead>
                <tbody>
                  {data.materials.map(m => (
                    <tr key={m.item}>
                      <td className="mono">{m.item}</td>
                      <td>{m.description}</td>
                      <td className="right">{m.quantity.toLocaleString('es-AR')}</td>
                      <td>{m.unit}</td>
                    </tr>
                  ))}
                  {data.materials.length === 0 && (
                    <tr><td colSpan={4} className="empty-cell">Sin elementos trazados</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Footer actions */}
        <div className="report-footer">
          {generating ? (
            <div className="report-progress">
              <div className="report-spinner" />
              <span>{progress}</span>
            </div>
          ) : (
            <>
              <button className="report-btn-csv" onClick={exportCSV} title="Exportar planilla de materiales como CSV (compatible con Excel)">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <line x1="16" y1="13" x2="8" y2="13"/>
                  <line x1="16" y1="17" x2="8" y2="17"/>
                </svg>
                Planilla CSV
              </button>
              <button className="report-btn-pdf" onClick={generatePDF}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <line x1="16" y1="13" x2="8" y2="13"/>
                  <line x1="16" y1="17" x2="8" y2="17"/>
                  <line x1="12" y1="21" x2="12" y2="13"/>
                  <polyline points="9 18 12 21 15 18"/>
                </svg>
                Generar PDF completo
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
