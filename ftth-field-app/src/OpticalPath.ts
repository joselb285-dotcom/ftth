import type { AppFeature, FiberCable, FiberColor } from './types'

// ── Types ─────────────────────────────────────────────────────────────────────

export type PathHop = {
  featureId: string
  featureName: string
  featureType: string
  inCable?: { id: string; name: string; fiberId: string; fiberIndex: number; fiberColor: FiberColor }
  outCable?: { id: string; name: string; fiberId: string; fiberIndex: number; fiberColor: FiberColor }
  splitterName?: string
}

export type OpticalPath = {
  found: boolean
  clientFiberId: string
  clientName?: string
  hops: PathHop[]
  allFeatureIds: string[]   // point features (nodes/boxes/NAPs) in path order
  lineFeatureIds: string[]  // fiber_line IDs explicitly linked via linkedLineId
  error?: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function findCableForFiber(cables: FiberCable[], fiberId: string): FiberCable | undefined {
  return cables.find(c => c.fibers.some(f => f.id === fiberId))
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

  const clientCable = findCableForFiber(startFeature.properties.spliceCard!.cables, clientFiberId)
  const clientFiber = clientCable?.fibers.find(f => f.id === clientFiberId)
  const clientName  = clientFiber?.clientName ?? clientFiber?.clientInfo?.name

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

    // ── Splitter path ──────────────────────────────────────────────────────
    const splitterVia = sc.splitters?.find(sp =>
      sp.inputPortId === nextFiberId || sp.outputPortIds.includes(nextFiberId)
    )
    if (splitterVia) {
      hop.splitterName = splitterVia.name
      const isInput    = splitterVia.inputPortId === nextFiberId
      const throughId  = isInput ? (splitterVia.outputPortIds[0] ?? null) : splitterVia.inputPortId

      if (throughId) {
        const splConn = sc.connections.find(c => c.leftFiberId === throughId || c.rightFiberId === throughId)
        if (splConn) {
          const afterId   = splConn.leftFiberId === throughId ? splConn.rightFiberId : splConn.leftFiberId
          const outCable2 = findCableForFiber(sc.cables, afterId)
          if (outCable2?.linkedFeatureId) {
            const outFiber2 = outCable2.fibers.find(f => f.id === afterId)!
            hop.outCable = { id: outCable2.id, name: outCable2.name, fiberId: afterId, fiberIndex: outFiber2.index, fiberColor: outFiber2.color }
            if (outCable2.linkedLineId) lineIds.push(outCable2.linkedLineId)
            hops.push(hop)
            const nextFeat = allFeatures.find(f => f.properties.id === outCable2.linkedFeatureId)
            if (!nextFeat) break
            const matchCable = nextFeat.properties.spliceCard?.cables.find(c => c.linkedFeatureId === fid)
            const matchFiber = matchCable?.fibers.find(f => f.index === outFiber2.index)
            if (!matchFiber) break
            currentFeature = nextFeat
            currentFiberId = matchFiber.id
            continue
          }
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
  return { found: hops.length > 0, clientFiberId, clientName, hops, allFeatureIds, lineFeatureIds: lineIds }
}
