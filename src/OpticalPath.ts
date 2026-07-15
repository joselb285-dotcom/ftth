import type { AppFeature, FiberCable, FiberColor, SpliceCard } from './types'

// ── Types ─────────────────────────────────────────────────────────────────────

export type PathHop = {
  featureId: string
  featureName: string
  featureType: string
  inCable?: { id: string; name: string; fiberId: string; fiberIndex: number; fiberColor: FiberColor }
  outCable?: { id: string; name: string; fiberId: string; fiberIndex: number; fiberColor: FiberColor }
  splitterName?: string
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
    if (hop.featureType === 'node') continue
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

  return { items, totalLossDb, measuredRxDbm }
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
          if (nextFeat.properties.featureType === 'node') {
            hops.push({ featureId: nextFeat.properties.id, featureName: nextFeat.properties.name, featureType: nextFeat.properties.featureType, inCable: hop.outCable })
            break
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

    if (nextFeature.properties.featureType === 'node') {
      hops.push({ featureId: nextFeature.properties.id, featureName: nextFeature.properties.name, featureType: nextFeature.properties.featureType, inCable: hop.outCable })
      break
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
