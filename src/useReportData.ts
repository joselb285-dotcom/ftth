import { useMemo } from 'react'
import type { AppFeature } from './types'
import { computeLineLength } from './OpticalPath'
import { typeLabels, statusLabels } from './editorConstants'

// ── Material row ──────────────────────────────────────────────────────────────
export interface MaterialRow {
  item: string
  description: string
  quantity: number
  unit: string
  detail?: string
}

// ── Client row ────────────────────────────────────────────────────────────────
export interface ClientRow {
  featureName: string
  featureType: string
  cable: string
  fiber: string
  clientName: string
  address: string
  phone: string
  onuModel: string
  onuSerial: string
  powerDbm: string
  powerClass: string
}

// ── Element row ───────────────────────────────────────────────────────────────
export interface ElementRow {
  type: string
  name: string
  code: string
  status: string
  lengthM: number | null
  fiberCount: number | null
  notes: string
}

// ── Report data ───────────────────────────────────────────────────────────────
export interface ReportData {
  stats: {
    totalElements: number
    nodeCount: number
    spliceBoxCount: number
    napCount: number
    fiberLineCount: number
    cameraCount: number
    zoneCount: number
    activeCount: number
    plannedCount: number
    maintenanceCount: number
    damagedCount: number
    totalFiberLengthKm: number
    totalFiberLengthPhysicalKm: number
    totalClientCount: number
    activeSpliceBoxes: number
  }
  materials: MaterialRow[]
  elements: ElementRow[]
  clients: ClientRow[]
}

function powerClass(dbm: string | undefined): string {
  if (!dbm) return ''
  const v = parseFloat(dbm)
  if (isNaN(v)) return ''
  if (v >= -8)  return 'Alta potencia'
  if (v >= -27) return 'OK'
  if (v >= -30) return 'Advertencia'
  return 'Crítica'
}

export function useReportData(features: AppFeature[]): ReportData {
  return useMemo(() => {
    const nodes      = features.filter(f => f.properties.featureType === 'node')
    const spliceBoxes= features.filter(f => f.properties.featureType === 'splice_box')
    const naps       = features.filter(f => f.properties.featureType === 'nap')
    const fiberLines = features.filter(f => f.properties.featureType === 'fiber_line')
    const cameras    = features.filter(f => f.properties.featureType === 'camera')
    const zones      = features.filter(f => f.properties.featureType === 'zone')
    const postes     = features.filter(f => f.properties.featureType === 'poste')

    // ── Stats ──────────────────────────────────────────────────────────────────
    const totalFiberLengthKm = fiberLines.reduce((sum, f) => {
      if (f.geometry.type !== 'LineString') return sum
      return sum + computeLineLength((f.geometry as GeoJSON.LineString).coordinates)
    }, 0)

    const totalFiberLengthPhysicalKm = fiberLines.reduce((sum, f) => {
      if (f.geometry.type !== 'LineString') return sum
      const geo = computeLineLength((f.geometry as GeoJSON.LineString).coordinates) * 1000
      const extra = (f.properties.extraLengthM ?? 0) + (f.properties.bypassM ?? 0)
      return sum + (geo + extra) / 1000
    }, 0)

    // Pole gain total
    const totalPoleGainM = postes.reduce((s, p) => s + (p.properties.poleGainM ?? 0), 0)

    // Clients from splice cards
    const clients: ClientRow[] = []
    for (const f of [...spliceBoxes, ...naps]) {
      for (const cable of f.properties.spliceCard?.cables ?? []) {
        for (const fiber of cable.fibers) {
          if (fiber.clientInfo?.name || fiber.clientName) {
            clients.push({
              featureName: f.properties.name || typeLabels[f.properties.featureType],
              featureType: typeLabels[f.properties.featureType],
              cable: cable.name,
              fiber: `F${fiber.index}`,
              clientName: fiber.clientInfo?.name || fiber.clientName || '',
              address: fiber.clientInfo?.address || '',
              phone: fiber.clientInfo?.phone || '',
              onuModel: fiber.clientInfo?.onuModel || '',
              onuSerial: fiber.clientInfo?.onuSerial || '',
              powerDbm: fiber.clientInfo?.onuPowerDbm || '',
              powerClass: powerClass(fiber.clientInfo?.onuPowerDbm),
            })
          }
        }
      }
    }

    // Splitters by ratio
    const splittersByRatio: Record<number, number> = {}
    for (const f of [...spliceBoxes, ...naps]) {
      for (const sp of f.properties.spliceCard?.splitters ?? []) {
        splittersByRatio[sp.ratio] = (splittersByRatio[sp.ratio] ?? 0) + 1
      }
    }

    const stats = {
      totalElements: features.length,
      nodeCount: nodes.length,
      spliceBoxCount: spliceBoxes.length,
      napCount: naps.length,
      fiberLineCount: fiberLines.length,
      cameraCount: cameras.length,
      zoneCount: zones.length,
      activeCount: features.filter(f => f.properties.status === 'active').length,
      plannedCount: features.filter(f => f.properties.status === 'planned').length,
      maintenanceCount: features.filter(f => f.properties.status === 'maintenance').length,
      damagedCount: features.filter(f => f.properties.status === 'damaged').length,
      totalFiberLengthKm,
      totalFiberLengthPhysicalKm,
      totalClientCount: clients.length,
      activeSpliceBoxes: [...spliceBoxes, ...naps].filter(f =>
        (f.properties.spliceCard?.cables.length ?? 0) > 0
      ).length,
    }

    // ── Materials ──────────────────────────────────────────────────────────────
    const materials: MaterialRow[] = []

    // Fibra óptica por tramo
    if (fiberLines.length > 0) {
      materials.push({
        item: 'FO-001',
        description: 'Fibra óptica (longitud trazada en mapa)',
        quantity: Math.round(totalFiberLengthKm * 1000),
        unit: 'm',
        detail: `${totalFiberLengthKm.toFixed(3)} km`,
      })
      materials.push({
        item: 'FO-002',
        description: 'Fibra óptica (longitud física total con rollos y bypass)',
        quantity: Math.round(totalFiberLengthPhysicalKm * 1000),
        unit: 'm',
        detail: `${totalFiberLengthPhysicalKm.toFixed(3)} km`,
      })
    }

    // Cajas
    if (nodes.length) materials.push({ item: 'EQ-001', description: 'Nodo activo (OLT/Central)', quantity: nodes.length, unit: 'un.' })
    if (spliceBoxes.length) materials.push({ item: 'EQ-002', description: 'Caja de empalme', quantity: spliceBoxes.length, unit: 'un.' })
    if (naps.length) materials.push({ item: 'EQ-003', description: 'Caja NAP (Punto de acceso)', quantity: naps.length, unit: 'un.' })
    if (cameras.length) materials.push({ item: 'EQ-004', description: 'Cámara de reserva de cable', quantity: cameras.length, unit: 'un.' })

    // Postes del relevamiento
    if (postes.length > 0) {
      const byType: Record<string, number> = {}
      const byAttachment: Record<string, number> = {}
      const byElement: Record<string, number> = {}
      for (const p of postes) {
        const t = p.properties.poleType ?? 'otro'
        byType[t] = (byType[t] ?? 0) + 1
        const a = p.properties.poleAttachment ?? 'suspension'
        byAttachment[a] = (byAttachment[a] ?? 0) + 1
        const el = p.properties.poleElement ?? 'ninguno'
        if (el !== 'ninguno') byElement[el] = (byElement[el] ?? 0) + 1
      }
      const typeNames: Record<string, string> = { hormigon: 'Hormigón', metalico: 'Metálico', madera: 'Madera', otro: 'Otro' }
      Object.entries(byType).forEach(([t, n], i) => {
        materials.push({ item: `PS-${String(i+1).padStart(3,'0')}`, description: `Poste ${typeNames[t] ?? t} (relevamiento)`, quantity: n, unit: 'un.' })
      })
      if (byAttachment['retencion'] || byAttachment['ambas']) {
        const qty = (byAttachment['retencion'] ?? 0) + (byAttachment['ambas'] ?? 0)
        materials.push({ item: 'PS-RET', description: 'Herraje de retención', quantity: qty, unit: 'juego' })
      }
      if (byAttachment['suspension'] || byAttachment['ambas']) {
        const qty = (byAttachment['suspension'] ?? 0) + (byAttachment['ambas'] ?? 0)
        materials.push({ item: 'PS-SUS', description: 'Herraje de suspensión', quantity: qty, unit: 'juego' })
      }
      if (byElement['nap']) materials.push({ item: 'PS-NAP', description: 'Caja NAP en poste', quantity: byElement['nap'], unit: 'un.' })
      if (byElement['empalme']) materials.push({ item: 'PS-EMP', description: 'Caja de empalme en poste', quantity: byElement['empalme'], unit: 'un.' })
      if (totalPoleGainM > 0) materials.push({ item: 'PS-GAN', description: 'Ganancia total de cable en postes', quantity: Math.round(totalPoleGainM), unit: 'm', detail: `${postes.filter(p => (p.properties.poleGainM ?? 0) > 0).length} postes con ganancia` })
    }

    // Splitters
    const sortedRatios = Object.keys(splittersByRatio).map(Number).sort((a, b) => a - b)
    sortedRatios.forEach((ratio, i) => {
      materials.push({
        item: `SP-${String(i + 1).padStart(3, '0')}`,
        description: `Splitter óptico 1×${ratio}`,
        quantity: splittersByRatio[ratio],
        unit: 'un.',
      })
    })

    // ODF ports (from node rack data)
    const totalOdfCount = nodes.reduce((sum, n) => sum + (n.properties.odfCount ?? 0), 0)
    if (totalOdfCount > 0) materials.push({ item: 'ODF-001', description: 'Puerto ODF (bandejas)', quantity: totalOdfCount, unit: 'un.' })

    // Clients
    if (clients.length > 0) materials.push({ item: 'CLI-001', description: 'Clientes (puertos de servicio activos)', quantity: clients.length, unit: 'un.' })

    // ── Elements ───────────────────────────────────────────────────────────────
    const elements: ElementRow[] = features.map(f => {
      let lengthM: number | null = null
      if (f.geometry.type === 'LineString') {
        const geo = computeLineLength((f.geometry as GeoJSON.LineString).coordinates) * 1000
        const extra = (f.properties.extraLengthM ?? 0) + (f.properties.bypassM ?? 0)
        lengthM = Math.round(geo + extra)
      }
      return {
        type: typeLabels[f.properties.featureType],
        name: f.properties.name || '(sin nombre)',
        code: f.properties.code || '',
        status: statusLabels[f.properties.status],
        lengthM,
        fiberCount: f.properties.fiberCount ?? null,
        notes: f.properties.notes || '',
      }
    })

    return { stats, materials, elements, clients }
  }, [features])
}

// ── CSV export ────────────────────────────────────────────────────────────────
export function generateMaterialsCSV(
  data: ReportData,
  projectName: string,
  subProjectName: string,
): string {
  const lines: string[] = []
  const row = (...cols: (string | number)[]) =>
    lines.push(cols.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))
  const sep = () => lines.push('')

  // ── Portada
  row('PLANILLA DE MATERIALES — FTTH GIS EDITOR')
  row('Proyecto', projectName)
  row('Sub-proyecto', subProjectName)
  row('Fecha', new Date().toLocaleDateString('es-AR'))
  sep()

  // ── Resumen
  row('RESUMEN')
  row('Descripción', 'Cantidad')
  row('Total elementos trazados', data.stats.totalElements)
  row('Nodos activos', data.stats.nodeCount)
  row('Cajas de empalme', data.stats.spliceBoxCount)
  row('Cajas NAP', data.stats.napCount)
  row('Tramos de fibra', data.stats.fiberLineCount)
  row('Longitud trazada (m)', Math.round(data.stats.totalFiberLengthKm * 1000))
  row('Longitud física total (m)', Math.round(data.stats.totalFiberLengthPhysicalKm * 1000))
  row('Clientes con datos', data.stats.totalClientCount)
  sep()

  // ── Materiales
  row('LISTA DE MATERIALES')
  row('Ítem', 'Descripción', 'Cantidad', 'Unidad', 'Detalle')
  data.materials.forEach(m => row(m.item, m.description, m.quantity, m.unit, m.detail ?? ''))
  sep()

  // ── Fibras por tramo
  row('DETALLE DE TRAMOS DE FIBRA')
  row('Nombre', 'Código', 'Estado', 'Cant. fibras', 'Longitud trazada (m)', 'Rollos ganancia (m)', 'By-pass (m)', 'Longitud física (m)', 'Atenuación (dB/km)')
  data.elements
    .filter(e => e.lengthM !== null)
    .forEach(e => {
      const f = e as ElementRow & { lengthM: number }
      row(e.name, e.code, e.status, e.fiberCount ?? '', f.lengthM, '', '', f.lengthM, '')
    })
  sep()

  // ── Elementos
  row('LISTA DE ELEMENTOS')
  row('Tipo', 'Nombre', 'Código', 'Estado', 'Notas')
  data.elements.forEach(e => row(e.type, e.name, e.code, e.status, e.notes))
  sep()

  // ── Clientes
  row('LISTA DE CLIENTES')
  row('Caja', 'Tipo', 'Cable', 'Fibra', 'Nombre cliente', 'Dirección', 'Teléfono', 'ONU Modelo', 'ONU Serie', 'Potencia (dBm)', 'Estado potencia')
  data.clients.forEach(c =>
    row(c.featureName, c.featureType, c.cable, c.fiber, c.clientName, c.address, c.phone, c.onuModel, c.onuSerial, c.powerDbm, c.powerClass)
  )

  return lines.join('\n')
}
