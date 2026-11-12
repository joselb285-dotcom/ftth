import type { AppFeature, FiberCable, FiberColor, RackPanel, RackPort, SpliceCard } from './types'

// ── Types ─────────────────────────────────────────────────────────────────────

export type PathHop = {
  featureId: string
  featureName: string
  featureType: string
  inCable?: { id: string; name: string; fiberId: string; fiberIndex: number; fiberColor: FiberColor }
  outCable?: { id: string; name: string; fiberId: string; fiberIndex: number; fiberColor: FiberColor }
  splitterName?: string
  /** Paso por un ODF (subnodo/nodo): puerto de entrada y, si hay vínculo ODF↔ODF, destino. */
  odf?: { inPort: string; outPort?: string; patch?: boolean; toFeatureName?: string; toPort?: string }
}

export type BudgetItem = {
  label: string
  detail: string
  lossDb: number
}

export type OpticalBudget = {
  items: BudgetItem[]
  totalLossDb: number
  measuredRxDbm?: number
  oltTxPowerDbm: number
  theoreticalRxDbm: number
}

export type OpticalPath = {
  found: boolean
  clientFiberId: string
  clientName?: string
  opticalDistanceM?: number  // distancia OTDR ingresada manualmente
  hops: PathHop[]
  allFeatureIds: string[]   // point features (nodes/boxes/NAPs) in path order
  lineFeatureIds: string[]  // fiber_line IDs explicitly linked via linkedLineId
  error?: string
  budget?: OpticalBudget
}

// ── Budget constants ──────────────────────────────────────────────────────────

const DEFAULT_ATTENUATION_DB_KM = 0.35   // SMF G.652D
const DEFAULT_FUSION_LOSS_DB    = 0.1    // per fusion splice
const DEFAULT_CONNECTOR_LOSS_DB = 0.3    // per connector
const ENDPOINT_CONNECTORS       = 2      // OLT patch + ONU
const DEFAULT_OLT_TX_DBM        = 5      // potencia nominal de salida GPON OLT

const SPLITTER_LOSS_DB: Record<number, number> = {
  2: 3.5, 4: 7.0, 8: 10.5, 16: 13.5, 32: 17.0,
}

/** Separador usado en PathHop.splitterName cuando el camino atraviesa splitters en cascada. */
const SPLITTER_CHAIN_SEP = ' → '

// ── Geometry helpers ──────────────────────────────────────────────────────────

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R    = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a    = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/** Returns total arc length in km for a GeoJSON LineString coordinate array [lon,lat]. */
export function computeLineLength(coords: number[][]): number {
  let km = 0
  for (let i = 1; i < coords.length; i++) {
    km += haversineKm(coords[i-1][1], coords[i-1][0], coords[i][1], coords[i][0])
  }
  return km
}

// ── Budget calculator ─────────────────────────────────────────────────────────

function computeBudget(
  hops: PathHop[],
  lineIds: string[],
  allFeatures: AppFeature[],
  clientFiberId: string,
): OpticalBudget {
  const items: BudgetItem[] = []

  // 1. Fiber attenuation per line segment (incluye extraLengthM, bypassM y cámaras vinculadas)
  for (const lineId of lineIds) {
    const feat = allFeatures.find(f => f.properties.id === lineId)
    if (!feat || feat.geometry.type !== 'LineString') continue
    const geoKm    = computeLineLength(feat.geometry.coordinates)
    const extraKm  = (feat.properties.extraLengthM ?? 0) / 1000
    const bypassKm = (feat.properties.bypassM ?? 0) / 1000
    // Cámaras vinculadas a este tramo
    const camExtrasKm = allFeatures
      .filter(c => c.properties.featureType === 'camera' && c.properties.linkedLineId === lineId)
      .reduce((s, c) => s + ((c.properties.reserveM ?? 0) + (c.properties.bypassM ?? 0)) / 1000, 0)
    const lenKm = geoKm + extraKm + bypassKm + camExtrasKm
    const atten = feat.properties.fiberAttenuationDbPerKm ?? DEFAULT_ATTENUATION_DB_KM
    const extras = []
    if (extraKm > 0)  extras.push(`${feat.properties.extraLengthM} m rollos`)
    if (bypassKm > 0) extras.push(`${feat.properties.bypassM} m bypass`)
    if (camExtrasKm > 0) extras.push(`${(camExtrasKm * 1000).toFixed(0)} m cámaras`)
    const detail = extras.length > 0
      ? `${(geoKm * 1000).toFixed(0)} m + ${extras.join(' + ')} × ${atten} dB/km`
      : `${(lenKm * 1000).toFixed(0)} m × ${atten} dB/km`
    items.push({
      label:  feat.properties.name || 'Fibra',
      detail,
      lossDb: parseFloat((lenKm * atten).toFixed(3)),
    })
  }

  // 2. Fusion splice losses + reserva en caja
  for (const hop of hops) {
    if (hop.featureType === 'node' && !hop.outCable) continue
    const feat = allFeatures.find(f => f.properties.id === hop.featureId)
    const n = (hop.inCable ? 1 : 0) + (hop.outCable ? 1 : 0)
    if (n > 0) {
      items.push({
        label:  hop.featureName,
        detail: `${n} empalme${n > 1 ? 's' : ''} fusión × ${DEFAULT_FUSION_LOSS_DB} dB`,
        lossDb: parseFloat((n * DEFAULT_FUSION_LOSS_DB).toFixed(3)),
      })
    }
    const reserveKm = (feat?.properties.reserveM ?? 0) / 1000
    if (reserveKm > 0) {
      const atten = DEFAULT_ATTENUATION_DB_KM
      items.push({
        label:  `${hop.featureName} — reserva`,
        detail: `${feat!.properties.reserveM} m reserva × ${atten} dB/km`,
        lossDb: parseFloat((reserveKm * atten).toFixed(3)),
      })
    }
  }

  // 2b. Vínculos ODF↔ODF entre subnodos/nodos (patch: 2 conectores por vínculo)
  for (const hop of hops) {
    if (!hop.odf?.patch && !hop.odf?.toFeatureName) continue
    const dest = hop.odf.toFeatureName
      ? `${hop.featureName} → ${hop.odf.toFeatureName}`
      : hop.featureName
    items.push({
      label:  `${hop.odf.toFeatureName ? 'Vínculo ODF' : 'Patchcord'} ${dest}`,
      detail: `${hop.odf.inPort} → ${hop.odf.outPort ?? '?'} · 2 conectores × ${DEFAULT_CONNECTOR_LOSS_DB} dB`,
      lossDb: parseFloat((2 * DEFAULT_CONNECTOR_LOSS_DB).toFixed(3)),
    })
  }

  // 3. Splitter insertion losses (un hop puede atravesar una cascada de splitters)
  for (const hop of hops) {
    if (!hop.splitterName) continue
    const feat = allFeatures.find(f => f.properties.id === hop.featureId)
    for (const spName of hop.splitterName.split(SPLITTER_CHAIN_SEP)) {
      const sp = feat?.properties.spliceCard?.splitters?.find(s => s.name === spName)
      if (!sp) continue
      const loss = SPLITTER_LOSS_DB[sp.ratio] ?? 0
      if (loss > 0) {
        items.push({
          label:  `Splitter ${sp.name}`,
          detail: `1:${sp.ratio} = ${loss} dB`,
          lossDb: loss,
        })
      }
    }
  }

  // 4. Connector losses at endpoints
  items.push({
    label:  'Conectores de extremo',
    detail: `${ENDPOINT_CONNECTORS} × ${DEFAULT_CONNECTOR_LOSS_DB} dB (ODF + ONU)`,
    lossDb: parseFloat((ENDPOINT_CONNECTORS * DEFAULT_CONNECTOR_LOSS_DB).toFixed(3)),
  })

  const totalLossDb = parseFloat(items.reduce((s, i) => s + i.lossDb, 0).toFixed(2))

  // 5. Measured RX power from client fiber (Zabbix)
  let measuredRxDbm: number | undefined
  outer: for (const f of allFeatures) {
    const sc = f.properties.spliceCard
    if (!sc) continue
    for (const cable of sc.cables) {
      const fiber = cable.fibers.find(fi => fi.id === clientFiberId)
      if (fiber?.clientInfo?.onuPowerDbm) {
        const v = parseFloat(fiber.clientInfo.onuPowerDbm)
        if (!isNaN(v)) { measuredRxDbm = v; break outer }
      }
    }
  }

  // 6. Theoretical RX power at the client = OLT TX power − total path loss
  const nodeHop = [...hops].reverse().find(h => h.featureType === 'node')
  const nodeFeat = nodeHop ? allFeatures.find(f => f.properties.id === nodeHop.featureId) : undefined
  const oltTxPowerDbm = nodeFeat?.properties.oltTxPowerDbm ?? DEFAULT_OLT_TX_DBM
  const theoreticalRxDbm = parseFloat((oltTxPowerDbm - totalLossDb).toFixed(2))

  return { items, totalLossDb, measuredRxDbm, oltTxPowerDbm, theoreticalRxDbm }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function findCableForFiber(cables: FiberCable[], fiberId: string): FiberCable | undefined {
  return cables.find(c => c.fibers.some(f => f.id === fiberId))
}

/**
 * Sigue la cadena de splitters conectados dentro de la misma carta de empalme
 * (splitter → splitter fusionados directamente, sin pasar por un cable) hasta
 * llegar a una fibra que ya no pertenece a ningún splitter (una fibra de cable).
 * Devuelve null si la cadena termina en un puerto sin conexión.
 */
function resolveThroughSplitters(
  startFiberId: string,
  sc: SpliceCard,
): { finalFiberId: string; splitterNames: string[] } | null {
  const splitterNames: string[] = []
  let currentId = startFiberId
  let guard = 0
  while (guard++ < 20) {
    const via = sc.splitters?.find(sp => sp.inputPortId === currentId || sp.outputPortIds.includes(currentId))
    if (!via) return { finalFiberId: currentId, splitterNames }
    splitterNames.push(via.name)
    const isInput   = via.inputPortId === currentId
    const throughId = isInput ? (via.outputPortIds[0] ?? null) : via.inputPortId
    if (!throughId) return null
    const splConn = sc.connections.find(c => c.leftFiberId === throughId || c.rightFiberId === throughId)
    if (!splConn) return null
    currentId = splConn.leftFiberId === throughId ? splConn.rightFiberId : splConn.leftFiberId
  }
  return null
}

// ── ODF helpers (nodos / subnodos) ────────────────────────────────────────────

function isRackFeature(f: AppFeature | undefined): boolean {
  const t = f?.properties.featureType
  return t === 'node' || t === 'subnode'
}

type PortRef = { panel: RackPanel; port: RackPort }

/** Puertos de todos los paneles ODF del rack, ordenados por unidad y luego por índice. */
function odfPorts(f: AppFeature): PortRef[] {
  const panels = [...(f.properties.rack?.panels ?? [])]
    .filter(p => p.kind === 'odf')
    .sort((a, b) => a.unit - b.unit)
  return panels.flatMap(panel =>
    [...panel.ports].sort((a, b) => a.index - b.index).map(port => ({ panel, port })))
}

function findPortInRack(f: AppFeature, portId: string): PortRef | undefined {
  for (const panel of f.properties.rack?.panels ?? []) {
    const port = [...panel.ports, ...(panel.portGroups ?? []).flatMap(g => g.ports)].find(p => p.id === portId)
    if (port) return { panel, port }
  }
  return undefined
}

function portName(e: PortRef): string {
  return `${e.panel.name} P${e.port.index}`
}

/** ODF del nodo que representa el cable que llega desde `fromId` (por la línea `lineId` si se conoce). */
function findArrivalPanel(f: AppFeature, fromId: string, lineId?: string): RackPanel | undefined {
  const cands = (f.properties.rack?.panels ?? []).filter(p => p.kind === 'odf' && p.linkedFeatureId === fromId)
  return cands.find(p => lineId && p.linkedLineId === lineId) ?? cands[0]
}

/** Busca el vínculo ODF de un puerto en ambos sentidos (guardado en este rack o en el del otro extremo). */
function findOdfLink(
  f: AppFeature, portId: string, allFeatures: AppFeature[],
): { feature: AppFeature; portId: string } | null {
  const own = f.properties.rack?.links?.find(l => l.fromPortId === portId)
  if (own) {
    const feature = allFeatures.find(x => x.properties.id === own.toFeatureId)
    return feature ? { feature, portId: own.toPortId } : null
  }
  for (const other of allFeatures) {
    const l = other.properties.rack?.links?.find(x => x.toFeatureId === f.properties.id && x.toPortId === portId)
    if (l) return { feature: other, portId: l.fromPortId }
  }
  return null
}

type RackExit = {
  error?: string
  /** El camino sigue por un cable que sale del nodo hacia otro feature. */
  cont?: { feature: AppFeature; fiberIndex: number; fromId: string; lineId?: string; cable: NonNullable<PathHop['outCable']> }
}

/**
 * Atraviesa un nodo/subnodo. La fibra N del cable que llega entra por el puerto N del ODF
 * de ese cable; de ahí sale por patchcord (conexión del rack) hacia otro ODF (cable de salida),
 * hacia un equipo activo (OLT: fin del camino) o por un vínculo ODF↔ODF a otro nodo.
 */
function traverseRackFeature(
  first: AppFeature,
  fiberIndex: number,
  fromId: string,
  lineId: string | undefined,
  inCable: PathHop['inCable'],
  hops: PathHop[],
  allFeatures: AppFeature[],
  /** Arranque desde el rack (puerto OLT → patchcord → ODF): salta la entrada por cable. */
  start?: { outPortId: string; inName: string },
): RackExit {
  const mkHop = (f: AppFeature): PathHop =>
    ({ featureId: f.properties.id, featureName: f.properties.name, featureType: f.properties.featureType })

  let feat = first
  let linkEntryPortId: string | null = null   // null = llegada por cable
  const seen = new Set<string>()

  for (let guard = 0; guard < MAX_HOPS; guard++) {
    const rack = feat.properties.rack
    const byCable = linkEntryPortId === null
    const isStart = !!start && guard === 0
    let entry: PortRef | undefined
    let patch = false

    if (isStart) {
      entry = findPortInRack(feat, start!.outPortId)
      if (!entry) return { error: 'ODF de salida no encontrado en el rack' }
    } else if (byCable) {
      const panel = findArrivalPanel(feat, fromId, lineId)
      if (panel) {
        const port = panel.ports.find(p => p.index === fiberIndex)
        if (!port) {
          hops.push({ ...mkHop(feat), inCable })
          return { error: `El ODF "${panel.name}" de "${feat.properties.name}" no tiene el puerto ${fiberIndex}` }
        }
        entry = { panel, port }
        patch = true
      } else if (feat.properties.featureType === 'node') {
        hops.push({ ...mkHop(feat), inCable })   // nodo sin ODF configurado: fin del camino
        return {}
      } else {
        entry = odfPorts(feat)[fiberIndex - 1]
        if (!entry) {
          hops.push({ ...mkHop(feat), inCable })
          return { error: `"${feat.properties.name}" no tiene el puerto ODF ${fiberIndex} (cargar ODF con suficientes puertos)` }
        }
      }
    } else {
      entry = findPortInRack(feat, linkEntryPortId!)
      patch = true
    }
    const inName = entry ? portName(entry) : '?'
    const hop: PathHop = { ...mkHop(feat), inCable: byCable ? inCable : undefined, odf: { inPort: inName } }
    if (isStart) hop.odf = { inPort: start!.inName, outPort: inName, patch: true }
    hops.push(hop)

    // Puerto de salida: por patchcord, o directo si el subnodo no tiene ODF de cable configurado
    let out: PortRef | undefined = entry
    if (patch && entry) {
      const conn = rack?.connections.find(c => c.fromPortId === entry!.port.id || c.toPortId === entry!.port.id)
      if (!conn) {
        if (!byCable && feat.properties.featureType === 'node') return {}   // llegó por vínculo ODF: fin en el nodo
        return { error: `Puerto ${inName} de "${feat.properties.name}" sin patchcord` }
      }
      out = findPortInRack(feat, conn.fromPortId === entry.port.id ? conn.toPortId : conn.fromPortId)
      if (!out) return { error: `Patchcord de ${inName} apunta a un puerto inexistente en "${feat.properties.name}"` }
      hop.odf = { inPort: inName, outPort: portName(out), patch: true }
      if (out.panel.kind !== 'odf') return {}   // patch hacia OLT / equipo activo: fin del camino
    }

    if (seen.has(feat.properties.id + out!.port.id)) return { error: 'Bucle detectado en patchcords ODF' }
    seen.add(feat.properties.id + out!.port.id)

    // Vínculo ODF↔ODF hacia otro nodo/subnodo
    const link = findOdfLink(feat, out!.port.id, allFeatures)
    if (link) {
      const tp = findPortInRack(link.feature, link.portId)
      hop.odf = { ...hop.odf!, outPort: portName(out!), toFeatureName: link.feature.properties.name, toPort: tp ? portName(tp) : '?' }
      feat = link.feature
      linkEntryPortId = link.portId
      continue
    }

    // Cable de salida del nodo hacia otro feature del mapa
    if (out!.panel.linkedFeatureId) {
      const next = allFeatures.find(f => f.properties.id === out!.panel.linkedFeatureId)
      if (!next) return { error: `Feature vinculado al ODF "${out!.panel.name}" no encontrado` }
      const cable = {
        id: out!.panel.id, name: out!.panel.name, fiberId: out!.port.id,
        fiberIndex: out!.port.index, fiberColor: 'blue' as FiberColor,
      }
      hop.outCable = cable
      return { cont: { feature: next, fiberIndex: out!.port.index, fromId: feat.properties.id, lineId: out!.panel.linkedLineId, cable } }
    }
    return { error: `Puerto ${portName(out!)} de "${feat.properties.name}" sin patchcord, cable ni vínculo a otro ODF` }
  }
  return { error: 'Demasiados saltos ODF' }
}

function findFeatureContainingFiber(fiberId: string, allFeatures: AppFeature[]): AppFeature | undefined {
  return allFeatures.find(feat => {
    const sc = feat.properties.spliceCard
    if (!sc) return false
    return sc.cables.some(c => c.fibers.some(f => f.id === fiberId))
  })
}

function fail(base: Partial<OpticalPath>, error: string): OpticalPath {
  return {
    found: false,
    clientFiberId: base.clientFiberId ?? '',
    clientName: base.clientName,
    hops: base.hops ?? [],
    allFeatureIds: (base.hops ?? []).map(h => h.featureId),
    lineFeatureIds: base.lineFeatureIds ?? [],
    error,
  }
}

// ── Main tracer ───────────────────────────────────────────────────────────────

const MAX_HOPS = 20

export function traceOpticalPath(
  clientFiberId: string,
  allFeatures: AppFeature[]
): OpticalPath {
  const startFeature = findFeatureContainingFiber(clientFiberId, allFeatures)
  if (!startFeature) {
    return fail({ clientFiberId }, 'Fibra no encontrada en ningún feature')
  }

  const clientCable       = findCableForFiber(startFeature.properties.spliceCard!.cables, clientFiberId)
  const clientFiber       = clientCable?.fibers.find(f => f.id === clientFiberId)
  const clientName        = clientFiber?.clientName ?? clientFiber?.clientInfo?.name
  const opticalDistanceM  = clientFiber?.clientInfo?.opticalDistanceM

  const hops: PathHop[]    = []
  const lineIds: string[]  = []
  const visited = new Set<string>()
  let currentFeature = startFeature
  let currentFiberId = clientFiberId
  let steps = 0
  const base = () => ({ clientFiberId, clientName, hops, lineFeatureIds: lineIds })

  /**
   * Entra a un nodo/subnodo: lo atraviesa (ODF → patchcord → ODF) y, si el camino sale por otro
   * cable, entra al siguiente feature. Devuelve 'done' (fin), 'continue' (seguir el lazo principal)
   * o un mensaje de error.
   */
  function enterRack(
    nextFeat: AppFeature, fiberIndex: number, fromId: string, lineId: string | undefined,
    via: PathHop['outCable'],
  ): 'done' | 'continue' | string {
    let feat = nextFeat, idx = fiberIndex, from = fromId, line = lineId, cable = via
    for (let guard = 0; guard < MAX_HOPS; guard++) {
      if (isRackFeature(feat)) {
        const r = traverseRackFeature(feat, idx, from, line, cable, hops, allFeatures)
        if (r.error) return r.error
        if (!r.cont) return 'done'
        if (r.cont.lineId && !lineIds.includes(r.cont.lineId)) lineIds.push(r.cont.lineId)
        from = feat.properties.id
        feat = r.cont.feature; idx = r.cont.fiberIndex; line = r.cont.lineId; cable = r.cont.cable
        continue
      }
      // Siguiente feature con carta de empalme: buscar su cable de vuelta al nodo
      const nextSC = feat.properties.spliceCard
      const matchCable =
        nextSC?.cables.find(c => c.linkedFeatureId === from) ??
        (line ? nextSC?.cables.find(c => c.linkedLineId === line) : undefined)
      if (!matchCable) return `No hay cable vinculado al nodo en "${feat.properties.name}". Vincular cables con 🔗.`
      const matchFiber = matchCable.fibers.find(f => f.index === idx)
      if (!matchFiber) return `Fibra ${idx} no encontrada en cable de "${feat.properties.name}"`
      if (matchCable.linkedLineId && !lineIds.includes(matchCable.linkedLineId)) lineIds.push(matchCable.linkedLineId)
      currentFeature = feat
      currentFiberId = matchFiber.id
      return 'continue'
    }
    return 'Demasiados saltos'
  }

  while (steps < MAX_HOPS) {
    steps++
    const fid = currentFeature.properties.id

    if (visited.has(fid)) return fail(base(), 'Bucle detectado en el camino')
    visited.add(fid)

    const sc  = currentFeature.properties.spliceCard
    const hop: PathHop = {
      featureId:   fid,
      featureName: currentFeature.properties.name,
      featureType: currentFeature.properties.featureType,
    }

    const inCable = sc ? findCableForFiber(sc.cables, currentFiberId) : undefined
    if (inCable) {
      const inFiber = inCable.fibers.find(f => f.id === currentFiberId)!
      hop.inCable = { id: inCable.id, name: inCable.name, fiberId: currentFiberId, fiberIndex: inFiber.index, fiberColor: inFiber.color }
    }

    if (currentFeature.properties.featureType === 'node') { hops.push(hop); break }
    if (!sc) { hops.push(hop); break }

    const conn = sc.connections.find(
      c => c.leftFiberId === currentFiberId || c.rightFiberId === currentFiberId
    )
    if (!conn) {
      hops.push(hop)
      return fail(base(), `Sin conexión para la fibra en "${currentFeature.properties.name}"`)
    }

    const nextFiberId = conn.leftFiberId === currentFiberId ? conn.rightFiberId : conn.leftFiberId

    // ── Splitter path (soporta splitters en cascada dentro de la misma carta) ──
    const splitterVia = sc.splitters?.find(sp =>
      sp.inputPortId === nextFiberId || sp.outputPortIds.includes(nextFiberId)
    )
    if (splitterVia) {
      const resolved = resolveThroughSplitters(nextFiberId, sc)
      if (resolved) {
        hop.splitterName = resolved.splitterNames.join(SPLITTER_CHAIN_SEP)
        const { finalFiberId } = resolved
        const outCable2 = findCableForFiber(sc.cables, finalFiberId)
        if (outCable2?.linkedFeatureId) {
          const outFiber2 = outCable2.fibers.find(f => f.id === finalFiberId)!
          hop.outCable = { id: outCable2.id, name: outCable2.name, fiberId: finalFiberId, fiberIndex: outFiber2.index, fiberColor: outFiber2.color }
          if (outCable2.linkedLineId) lineIds.push(outCable2.linkedLineId)
          hops.push(hop)
          const nextFeat = allFeatures.find(f => f.properties.id === outCable2.linkedFeatureId)
          if (!nextFeat) break
          if (isRackFeature(nextFeat)) {
            const r = enterRack(nextFeat, outFiber2.index, fid, outCable2.linkedLineId, hop.outCable)
            if (r === 'done') break
            if (r === 'continue') continue
            return fail(base(), r)
          }
          const matchCable = nextFeat.properties.spliceCard?.cables.find(c => c.linkedFeatureId === fid)
          const matchFiber = matchCable?.fibers.find(f => f.index === outFiber2.index)
          if (!matchFiber) break
          currentFeature = nextFeat
          currentFiberId = matchFiber.id
          continue
        }
      }
      hops.push(hop); break
    }

    // ── Regular cable path ─────────────────────────────────────────────────
    const outCable = findCableForFiber(sc.cables, nextFiberId)
    if (!outCable?.linkedFeatureId) {
      const outFiber = outCable?.fibers.find(f => f.id === nextFiberId)
      if (outCable && outFiber) hop.outCable = { id: outCable.id, name: outCable.name, fiberId: nextFiberId, fiberIndex: outFiber.index, fiberColor: outFiber.color }
      hops.push(hop)
      return fail(base(), `Cable "${outCable?.name ?? '?'}" sin vínculo al mapa en "${currentFeature.properties.name}"`)
    }

    const outFiber = outCable.fibers.find(f => f.id === nextFiberId)!
    hop.outCable = { id: outCable.id, name: outCable.name, fiberId: nextFiberId, fiberIndex: outFiber.index, fiberColor: outFiber.color }

    // Collect the fiber_line ID for this cable segment
    if (outCable.linkedLineId) lineIds.push(outCable.linkedLineId)

    hops.push(hop)

    const nextFeature = allFeatures.find(f => f.properties.id === outCable.linkedFeatureId)
    if (!nextFeature) return fail(base(), `Feature vinculado "${outCable.linkedFeatureId}" no encontrado`)

    if (isRackFeature(nextFeature)) {
      const r = enterRack(nextFeature, outFiber.index, fid, outCable.linkedLineId, hop.outCable)
      if (r === 'done') break
      if (r === 'continue') continue
      return fail(base(), r)
    }

    // Find the matching cable in the next feature using three strategies (in order):
    // 1. Cable whose linkedFeatureId points back to current feature (explicit reverse link)
    // 2. Cable that shares the same linkedLineId as the outgoing cable (shared fiber_line)
    // 3. Any cable on the opposite side with same fiber count (last resort heuristic)
    const nextSC = nextFeature.properties.spliceCard
    const oppSide = outCable.side === 'left' ? 'right' : 'left'
    const matchCable =
      nextSC?.cables.find(c => c.linkedFeatureId === fid) ??
      (outCable.linkedLineId ? nextSC?.cables.find(c => c.linkedLineId === outCable.linkedLineId) : undefined) ??
      nextSC?.cables.find(c => c.side === oppSide && c.fibers.length === outCable.fibers.length)

    if (!matchCable) return fail(base(), `No hay cable vinculado al feature "${currentFeature.properties.name}" en "${nextFeature.properties.name}". Vincular cables con 🔗.`)

    const matchFiber = matchCable.fibers.find(f => f.index === outFiber.index)
    if (!matchFiber) return fail(base(), `Fibra ${outFiber.index} no encontrada en cable de "${nextFeature.properties.name}"`)

    // Collect line ID from the incoming cable (dedup)
    if (matchCable.linkedLineId && !lineIds.includes(matchCable.linkedLineId)) {
      lineIds.push(matchCable.linkedLineId)
    }

    currentFeature = nextFeature
    currentFiberId = matchFiber.id
  }

  const allFeatureIds = [...new Set(hops.map(h => h.featureId))]
  const budget = computeBudget(hops, lineIds, allFeatures, clientFiberId)
  return { found: hops.length > 0, clientFiberId, clientName, opticalDistanceM, hops, allFeatureIds, lineFeatureIds: lineIds, budget }
}

// ── Camino desde un puerto OLT (sentido OLT → clientes / otros nodos) ──────────

export type DownstreamEnd = 'client' | 'equipment' | 'free' | 'open' | 'error'

export type DownstreamPath = {
  hops: PathHop[]
  end: DownstreamEnd
  endLabel: string
  error?: string
  lineFeatureIds: string[]
  /** Solo al trazar desde un puerto ODF: sentido del camino. */
  direction?: string
}

export type DownstreamTrace = {
  startLabel: string
  paths: DownstreamPath[]
  error?: string
}

const MAX_DOWNSTREAM_PATHS = 300

/**
 * Sigue la fibra desde un puerto de la OLT: patchcord → ODF → cable → cajas/NAP (con splitters,
 * que ramifican) → clientes, u otro nodo (ODF → patchcord → ODF …). Cada salto ODF informa
 * el puerto de entrada y de salida, así se ve si la fibra cambia de puerto.
 */
export function traceFromPort(nodeId: string, portId: string, allFeatures: AppFeature[]): DownstreamTrace {
  const node = allFeatures.find(f => f.properties.id === nodeId)
  if (!node || !isRackFeature(node)) return { startLabel: '', paths: [], error: 'Nodo no encontrado' }
  const olt = findPortInRack(node, portId)
  if (!olt) return { startLabel: '', paths: [], error: 'Puerto no encontrado en el rack' }
  const startLabel = `${node.properties.name} · ${portName(olt)}`
  const odfMode = olt.panel.kind === 'odf'
  let direction: string | undefined

  const conn = node.properties.rack?.connections.find(c => c.fromPortId === portId || c.toPortId === portId)
  if (!conn && !odfMode) return { startLabel, paths: [], error: 'El puerto no tiene patchcord: conéctalo a un puerto de ODF en el rack.' }
  const peer = conn ? findPortInRack(node, conn.fromPortId === portId ? conn.toPortId : conn.fromPortId) : undefined
  if (conn && !peer && !odfMode) return { startLabel, paths: [], error: 'El patchcord apunta a un puerto inexistente' }

  const paths: DownstreamPath[] = []
  const hopOf = (f: AppFeature): PathHop =>
    ({ featureId: f.properties.id, featureName: f.properties.name, featureType: f.properties.featureType })
  const push = (hops: PathHop[], lines: string[], end: DownstreamEnd, endLabel: string, error?: string) => {
    if (paths.length < MAX_DOWNSTREAM_PATHS) paths.push({ hops: [...hops], end, endLabel, error, lineFeatureIds: [...lines], direction })
  }

  function afterRack(r: RackExit, hops: PathHop[], lines: string[], depth: number) {
    if (r.error) return push(hops, lines, 'error', '', r.error)
    if (!r.cont) {
      const last = hops[hops.length - 1]
      return push(hops, lines, 'equipment', `${last?.featureName ?? ''}${last?.odf?.outPort && last.odf.patch ? ' → ' + last.odf.outPort : ''}`)
    }
    const nl = r.cont.lineId && !lines.includes(r.cont.lineId) ? [...lines, r.cont.lineId] : lines
    enter(r.cont.feature, r.cont.fiberIndex, r.cont.fromId, r.cont.lineId, r.cont.cable, hops, nl, depth + 1)
  }

  function enter(
    feat: AppFeature, idx: number, from: string, line: string | undefined,
    cable: PathHop['outCable'], hops: PathHop[], lines: string[], depth: number,
  ) {
    if (depth > MAX_HOPS) return push(hops, lines, 'error', '', 'Demasiados saltos')
    if (isRackFeature(feat)) {
      const h = [...hops]
      const r = traverseRackFeature(feat, idx, from, line, cable, h, allFeatures)
      return afterRack(r, h, lines, depth)
    }
    const sc = feat.properties.spliceCard
    if (!sc) return push([...hops, hopOf(feat)], lines, 'equipment', feat.properties.name)
    const matchCable =
      sc.cables.find(c => c.linkedFeatureId === from) ??
      (line ? sc.cables.find(c => c.linkedLineId === line) : undefined)
    if (!matchCable) {
      return push([...hops, hopOf(feat)], lines, 'error', '',
        `No hay cable vinculado en "${feat.properties.name}" hacia el nodo/caja anterior. Vincular cables con 🔗.`)
    }
    const nl = matchCable.linkedLineId && !lines.includes(matchCable.linkedLineId) ? [...lines, matchCable.linkedLineId] : lines
    const fiber = matchCable.fibers.find(f => f.index === idx)
    if (!fiber) {
      return push([...hops, hopOf(feat)], nl, 'error', '', `Fibra ${idx} no encontrada en cable de "${feat.properties.name}"`)
    }
    expand(feat, sc, fiber.id,
      { id: matchCable.id, name: matchCable.name, fiberId: fiber.id, fiberIndex: fiber.index, fiberColor: fiber.color },
      hops, nl, depth)
  }

  function expand(
    feat: AppFeature, sc: SpliceCard, startFiberId: string,
    inCable: NonNullable<PathHop['inCable']>, hops: PathHop[], lines: string[], depth: number,
  ) {
    const finals: { fiberId: string; splitters: string[] }[] = []
    let openStart = false

    const follow = (fiberId: string, spl: string[], guard: number, isStart: boolean) => {
      if (guard > 20) return
      const c = sc.connections.find(x => x.leftFiberId === fiberId || x.rightFiberId === fiberId)
      if (!c) { if (isStart) openStart = true; return }   // salida de splitter sin conexión = libre
      const nextId = c.leftFiberId === fiberId ? c.rightFiberId : c.leftFiberId
      const sp = sc.splitters?.find(s => s.inputPortId === nextId)
      if (sp) {
        for (const outId of sp.outputPortIds) follow(outId, [...spl, sp.name], guard + 1, false)
        return
      }
      finals.push({ fiberId: nextId, splitters: spl })
    }
    follow(startFiberId, [], 0, true)

    if (openStart) {
      return push([...hops, { ...hopOf(feat), inCable }], lines, 'open',
        `Fibra ${inCable.fiberIndex} sin empalme en "${feat.properties.name}"`)
    }
    for (const fin of finals) {
      const outCable = findCableForFiber(sc.cables, fin.fiberId)
      const outFiber = outCable?.fibers.find(f => f.id === fin.fiberId)
      const hop: PathHop = {
        ...hopOf(feat), inCable,
        splitterName: fin.splitters.length ? fin.splitters.join(SPLITTER_CHAIN_SEP) : undefined,
      }
      if (outCable && outFiber) {
        hop.outCable = { id: outCable.id, name: outCable.name, fiberId: fin.fiberId, fiberIndex: outFiber.index, fiberColor: outFiber.color }
      }
      const next = outCable?.linkedFeatureId ? allFeatures.find(f => f.properties.id === outCable.linkedFeatureId) : undefined
      if (outCable && outFiber && next) {
        const nl = outCable.linkedLineId && !lines.includes(outCable.linkedLineId) ? [...lines, outCable.linkedLineId] : lines
        enter(next, outFiber.index, feat.properties.id, outCable.linkedLineId, hop.outCable, [...hops, hop], nl, depth + 1)
        continue
      }
      const client = outFiber?.clientName ?? outFiber?.clientInfo?.name
      if (client) { push([...hops, hop], lines, 'client', client); continue }
      if (feat.properties.featureType === 'nap') {
        push([...hops, hop], lines, 'free', `Puerto ${outFiber?.index ?? '?'} libre en "${feat.properties.name}"`)
      } else {
        push([...hops, hop], lines, 'open', `Cable "${outCable?.name ?? '?'}" sin vínculo al mapa en "${feat.properties.name}"`)
      }
    }
  }

  // ── Desde un puerto de ODF: por el cable del propio ODF y por el patchcord ──
  if (odfMode) {
    const panel = olt.panel
    direction = 'Por el cable de este ODF'
    const next = panel.linkedFeatureId ? allFeatures.find(f => f.properties.id === panel.linkedFeatureId) : undefined
    const startOdf = { inPort: portName(olt) }
    if (!next) {
      push([{ ...hopOf(node), odf: startOdf }], [], 'open', '',
        panel.linkedFeatureId ? 'El feature vinculado al ODF no existe' : `El ODF "${panel.name}" no tiene cable vinculado (editar el panel → Cable hacia).`)
    } else {
      const cable = { id: panel.id, name: panel.name, fiberId: olt.port.id, fiberIndex: olt.port.index, fiberColor: 'blue' as FiberColor }
      const lines = panel.linkedLineId ? [panel.linkedLineId] : []
      enter(next, olt.port.index, nodeId, panel.linkedLineId, cable,
        [{ ...hopOf(node), odf: startOdf, outCable: cable }], lines, 0)
    }
    direction = 'Por el patchcord'
    if (!peer) {
      push([{ ...hopOf(node), odf: startOdf }], [], 'free', 'Puerto sin patchcord')
    } else if (peer.panel.kind !== 'odf') {
      push([{ ...hopOf(node), odf: { inPort: portName(olt), outPort: portName(peer), patch: true } }], [], 'equipment', peer.panel.name)
    } else {
      const h2: PathHop[] = []
      const r2 = traverseRackFeature(node, 0, '', undefined, undefined, h2, allFeatures,
        { outPortId: peer.port.id, inName: portName(olt) })
      afterRack(r2, h2, [], 0)
    }
    return { startLabel, paths }
  }

  const startHop = { ...hopOf(node) }
  const hops: PathHop[] = [startHop]
  if (!peer) return { startLabel, paths }
  if (peer.panel.kind !== 'odf') {
    startHop.odf = { inPort: portName(olt), outPort: portName(peer), patch: true }
    push(hops, [], 'equipment', peer.panel.name)
    return { startLabel, paths }
  }
  const h: PathHop[] = []
  const r = traverseRackFeature(node, 0, '', undefined, undefined, h, allFeatures,
    { outPortId: peer.port.id, inName: portName(olt) })
  afterRack(r, h, [], 0)
  return { startLabel, paths }
}

export const traceFromOltPort = traceFromPort
