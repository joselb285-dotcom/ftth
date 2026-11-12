import { describe, it, expect } from 'vitest'
import { traceOpticalPath, computeLineLength, traceFromOltPort } from '../OpticalPath'
import {
  twoHopTopology, threeHopTopology, loopTopology,
  spliceBoxFeature, nodeFeature, fiberLineFeature,
  napFeature, spliceBoxMiddle, nodeFeature2,
  boxA,
} from './fixtures'
import type { AppFeature } from '../types'

// ── computeLineLength ─────────────────────────────────────────────────────────

describe('computeLineLength', () => {
  it('returns 0 for a single point (degenerate line)', () => {
    expect(computeLineLength([[-64.18, -31.42]])).toBe(0)
  })

  it('returns positive km for a non-zero segment', () => {
    // Two points ~700 m apart in Córdoba
    const km = computeLineLength([[-64.185, -31.425], [-64.18, -31.42]])
    expect(km).toBeGreaterThan(0.5)
    expect(km).toBeLessThan(1)
  })

  it('sums multiple segments correctly', () => {
    const coords = [[-64.185, -31.425], [-64.18, -31.42], [-64.175, -31.415]]
    const total = computeLineLength(coords)
    const seg1  = computeLineLength([[-64.185, -31.425], [-64.18, -31.42]])
    const seg2  = computeLineLength([[-64.18, -31.42], [-64.175, -31.415]])
    expect(total).toBeCloseTo(seg1 + seg2, 6)
  })
})

// ── traceOpticalPath — error cases ────────────────────────────────────────────

describe('traceOpticalPath — error cases', () => {
  it('returns found:false when fiberId does not exist in any feature', () => {
    const result = traceOpticalPath('nonexistent-fiber', twoHopTopology)
    expect(result.found).toBe(false)
    expect(result.error).toMatch(/no encontrada/)
  })

  it('returns found:false when there is no splice connection for the fiber', () => {
    const box: AppFeature = {
      ...spliceBoxFeature,
      properties: {
        ...spliceBoxFeature.properties,
        id: 'box_no_conn',
        spliceCard: {
          cables: [{
            id: 'cin', name: 'Entrada', side: 'left',
            fibers: [{ id: 'f_orphan', index: 0, color: 'blue' }],
          }],
          connections: [],  // no connections
          splitters: [],
        },
      },
    }
    const result = traceOpticalPath('f_orphan', [box])
    expect(result.found).toBe(false)
    expect(result.error).toMatch(/Sin conexión/)
  })

  it('returns found:false when out-cable has no linkedFeatureId', () => {
    const box: AppFeature = {
      ...spliceBoxFeature,
      properties: {
        ...spliceBoxFeature.properties,
        id: 'box_no_link',
        spliceCard: {
          cables: [
            { id: 'cin', name: 'Entrada', side: 'left', fibers: [{ id: 'f1', index: 0, color: 'blue' }] },
            { id: 'cout', name: 'Salida', side: 'right', fibers: [{ id: 'f2', index: 0, color: 'blue' }] },
            // cout has no linkedFeatureId
          ],
          connections: [{ id: 'c', leftFiberId: 'f1', rightFiberId: 'f2', active: true }],
          splitters: [],
        },
      },
    }
    const result = traceOpticalPath('f1', [box])
    expect(result.found).toBe(false)
    expect(result.error).toMatch(/sin vínculo/)
  })

  it('detects loops and returns found:false', () => {
    const result = traceOpticalPath('f_loop_start', loopTopology)
    expect(result.found).toBe(false)
    expect(result.error).toMatch(/Bucle/)
  })
})

// ── traceOpticalPath — happy paths ────────────────────────────────────────────

describe('traceOpticalPath — 2-hop path (box → node)', () => {
  const result = traceOpticalPath('f_client', twoHopTopology)

  it('returns found:true', () => {
    expect(result.found).toBe(true)
    expect(result.error).toBeUndefined()
  })

  it('resolves clientName from fiber', () => {
    expect(result.clientName).toBe('Cliente Test')
  })

  it('produces exactly 2 hops', () => {
    expect(result.hops).toHaveLength(2)
  })

  it('first hop is the splice_box with correct in/out cables', () => {
    const hop = result.hops[0]
    expect(hop.featureId).toBe('box1')
    expect(hop.featureType).toBe('splice_box')
    expect(hop.inCable?.fiberId).toBe('f_client')
    expect(hop.outCable?.fiberId).toBe('f_out')
  })

  it('last hop is the node', () => {
    const hop = result.hops[1]
    expect(hop.featureId).toBe('node1')
    expect(hop.featureType).toBe('node')
  })

  it('allFeatureIds contains both features in order', () => {
    expect(result.allFeatureIds).toEqual(['box1', 'node1'])
  })

  it('lineFeatureIds contains the fiber line', () => {
    expect(result.lineFeatureIds).toContain('line1')
  })
})

describe('traceOpticalPath — 3-hop path (nap → box → node)', () => {
  const result = traceOpticalPath('f_nap_client', threeHopTopology)

  it('returns found:true', () => {
    expect(result.found).toBe(true)
  })

  it('produces exactly 3 hops', () => {
    expect(result.hops).toHaveLength(3)
  })

  it('hops traverse nap → box → node', () => {
    expect(result.hops[0].featureId).toBe('nap1')
    expect(result.hops[1].featureId).toBe('box2')
    expect(result.hops[2].featureId).toBe('node2')
  })

  it('allFeatureIds has all three in order', () => {
    expect(result.allFeatureIds).toEqual(['nap1', 'box2', 'node2'])
  })

  it('lineFeatureIds has both fiber lines', () => {
    expect(result.lineFeatureIds).toContain('line_nap')
    expect(result.lineFeatureIds).toContain('line_box')
  })
})

// ── Splitters en cascada (fusionados directamente dentro de la misma carta) ────

describe('traceOpticalPath — cascaded splitters within the same splice card', () => {
  const box: AppFeature = {
    ...spliceBoxFeature,
    properties: {
      ...spliceBoxFeature.properties,
      spliceCard: {
        cables: [
          {
            id: 'cin', name: 'Cable Entrada', side: 'left',
            fibers: [{ id: 'f_client', index: 0, color: 'blue', clientName: 'Cliente Test' }],
          },
          {
            id: 'cout', name: 'Cable Salida', side: 'right',
            linkedFeatureId: 'node1', linkedLineId: 'line1',
            fibers: [{ id: 'f_up', index: 0, color: 'blue' }],
          },
        ],
        connections: [
          { id: 'conn_a', leftFiberId: 'f_client', rightFiberId: 'sp1_out0', active: true },
          { id: 'conn_b', leftFiberId: 'sp1_in', rightFiberId: 'sp2_out0', active: true },
          { id: 'conn_c', leftFiberId: 'sp2_in', rightFiberId: 'f_up', active: true },
        ],
        splitters: [
          { id: 'sp1', name: 'SP1', ratio: 8, inputPortId: 'sp1_in', outputPortIds: ['sp1_out0'] },
          { id: 'sp2', name: 'SP2', ratio: 4, inputPortId: 'sp2_in', outputPortIds: ['sp2_out0'] },
        ],
      },
    },
  }
  const result = traceOpticalPath('f_client', [nodeFeature, box, fiberLineFeature])

  it('returns found:true instead of stopping at the splitter-to-splitter fusion', () => {
    expect(result.found).toBe(true)
    expect(result.error).toBeUndefined()
  })

  it('follows through both splitters and reaches the node', () => {
    expect(result.allFeatureIds).toEqual(['box1', 'node1'])
  })

  it('records both splitter names on the hop', () => {
    expect(result.hops[0].splitterName).toBe('SP1 → SP2')
  })

  it('collects the outgoing line for the map animation', () => {
    expect(result.lineFeatureIds).toContain('line1')
  })

  it('includes insertion loss for both cascaded splitters in the budget', () => {
    const sp1Item = result.budget!.items.find(i => i.label === 'Splitter SP1')
    const sp2Item = result.budget!.items.find(i => i.label === 'Splitter SP2')
    expect(sp1Item?.lossDb).toBeCloseTo(10.5, 2)
    expect(sp2Item?.lossDb).toBeCloseTo(7.0, 2)
  })
})

// ── Budget ────────────────────────────────────────────────────────────────────

describe('traceOpticalPath — budget', () => {
  const result = traceOpticalPath('f_client', twoHopTopology)

  it('budget is present', () => {
    expect(result.budget).toBeDefined()
  })

  it('totalLossDb is positive', () => {
    expect(result.budget!.totalLossDb).toBeGreaterThan(0)
  })

  it('includes fiber attenuation item', () => {
    const fiberItem = result.budget!.items.find(i => i.label === 'Fibra Principal')
    expect(fiberItem).toBeDefined()
    expect(fiberItem!.lossDb).toBeGreaterThan(0)
  })

  it('includes splice fusion loss item', () => {
    const spliceItem = result.budget!.items.find(i => i.label === 'Caja 1')
    expect(spliceItem).toBeDefined()
  })

  it('includes endpoint connector loss item', () => {
    const connItem = result.budget!.items.find(i => i.label === 'Conectores de extremo')
    expect(connItem).toBeDefined()
    // 2 connectors × 0.3 dB = 0.6 dB
    expect(connItem!.lossDb).toBeCloseTo(0.6, 2)
  })

  it('totalLossDb equals sum of all items', () => {
    const sum = result.budget!.items.reduce((acc, i) => acc + i.lossDb, 0)
    expect(result.budget!.totalLossDb).toBeCloseTo(sum, 1)
  })

  it('measuredRxDbm is undefined when no clientInfo.onuPowerDbm', () => {
    expect(result.budget!.measuredRxDbm).toBeUndefined()
  })

  it('measuredRxDbm is set when fiber has onuPowerDbm', () => {
    const topologyWithPower: AppFeature[] = [
      nodeFeature,
      {
        ...spliceBoxFeature,
        properties: {
          ...spliceBoxFeature.properties,
          spliceCard: {
            ...spliceBoxFeature.properties.spliceCard!,
            cables: [
              {
                id: 'cin', name: 'Cable Entrada', side: 'left',
                fibers: [{
                  id: 'f_client', index: 0, color: 'blue', clientName: 'Cliente Test',
                  clientInfo: { name: 'Cliente Test', onuPowerDbm: '-25.5' },
                }],
              },
              {
                id: 'cout', name: 'Cable Salida', side: 'right',
                linkedFeatureId: 'node1', linkedLineId: 'line1',
                fibers: [{ id: 'f_out', index: 0, color: 'blue' }],
              },
            ],
          },
        },
      },
      fiberLineFeature,
    ]
    const r = traceOpticalPath('f_client', topologyWithPower)
    expect(r.budget!.measuredRxDbm).toBe(-25.5)
  })

  it('theoreticalRxDbm defaults to 5 dBm OLT TX minus total loss', () => {
    expect(result.budget!.oltTxPowerDbm).toBe(5)
    expect(result.budget!.theoreticalRxDbm).toBeCloseTo(5 - result.budget!.totalLossDb, 2)
  })

  it('theoreticalRxDbm uses the node\'s custom oltTxPowerDbm when set', () => {
    const topologyWithTx: AppFeature[] = [
      { ...nodeFeature, properties: { ...nodeFeature.properties, oltTxPowerDbm: 3 } },
      spliceBoxFeature,
      fiberLineFeature,
    ]
    const r = traceOpticalPath('f_client', topologyWithTx)
    expect(r.budget!.oltTxPowerDbm).toBe(3)
    expect(r.budget!.theoreticalRxDbm).toBeCloseTo(3 - r.budget!.totalLossDb, 2)
  })
})

// ── Subnodo: caja → subnodo (ODF) ⇄ nodo (ODF) ────────────────────────────────
describe('traceOpticalPath con subnodo', () => {
  const mkOdf = (id: string, n: number) => ({
    id: 'p_' + id, unit: 1, heightU: 1, kind: 'odf' as const, name: 'ODF ' + id,
    ports: Array.from({ length: n }, (_, i) => ({ id: `${id}_${i + 1}`, index: i + 1, label: '', status: 'free' as const })),
  })
  const sub: AppFeature = {
    type: 'Feature', geometry: { type: 'Point', coordinates: [-64.183, -31.423] },
    properties: {
      id: 'sub1', featureType: 'subnode', name: 'Subnodo 1', code: '', notes: '', status: 'active', color: '#0ea5e9',
      rack: {
        totalUnits: 12, panels: [mkOdf('s', 4)], connections: [],
        links: [{ id: 'l1', fromPortId: 's_1', toFeatureId: 'node1', toPortId: 'n_1' }],
      },
    },
  }
  const node: AppFeature = {
    ...nodeFeature,
    properties: { ...nodeFeature.properties, rack: { totalUnits: 12, panels: [mkOdf('n', 4)], connections: [] } },
  }
  const box: AppFeature = {
    ...spliceBoxFeature,
    properties: {
      ...spliceBoxFeature.properties,
      spliceCard: {
        ...spliceBoxFeature.properties.spliceCard!,
        cables: [
          spliceBoxFeature.properties.spliceCard!.cables[0],
          { id: 'cout', name: 'Cable Salida', side: 'right', linkedFeatureId: 'sub1', linkedLineId: 'line1',
            fibers: [{ id: 'f_out', index: 1, color: 'blue' }] },
        ],
      },
    },
  }

  it('sigue el vínculo ODF hasta el nodo y suma pérdida de conectores', () => {
    const path = traceOpticalPath('f_client', [node, sub, box, fiberLineFeature])
    expect(path.found).toBe(true)
    expect(path.hops.map(h => h.featureType)).toEqual(['splice_box', 'subnode', 'node'])
    expect(path.budget!.items.some(i => i.label.startsWith('Vínculo ODF'))).toBe(true)
  })

  it('falla si el puerto ODF no está vinculado', () => {
    const unlinked = { ...sub, properties: { ...sub.properties, rack: { ...sub.properties.rack!, links: [] } } }
    const path = traceOpticalPath('f_client', [node, unlinked, box, fiberLineFeature])
    expect(path.found).toBe(false)
    expect(path.error).toMatch(/vínculo a otro ODF/)
  })
})

// ── Nodo de paso: caja1 → ODF in ⇢ patchcord ⇢ ODF out → caja2 → nodo OLT ────
describe('traceOpticalPath con nodo de paso (ODF + patchcord)', () => {
  const ports = (id: string, n: number) =>
    Array.from({ length: n }, (_, i) => ({ id: `${id}_${i + 1}`, index: i + 1, label: '', status: 'free' as const }))
  const mid: AppFeature = {
    type: 'Feature', geometry: { type: 'Point', coordinates: [-64.19, -31.43] },
    properties: {
      id: 'mid', featureType: 'node', name: 'Nodo Paso', code: '', notes: '', status: 'active', color: '#2563eb',
      rack: {
        totalUnits: 12,
        panels: [
          { id: 'pin', unit: 1, heightU: 1, kind: 'odf', name: 'ODF Entrada', ports: ports('in', 4), linkedFeatureId: 'box1' },
          { id: 'pout', unit: 2, heightU: 1, kind: 'odf', name: 'ODF Salida', ports: ports('out', 4), linkedFeatureId: 'box2', linkedLineId: 'line2' },
        ],
        connections: [{ id: 'pc', fromPortId: 'in_1', toPortId: 'out_1', active: true }],
      },
    },
  }
  const box1: AppFeature = {
    ...spliceBoxFeature,
    properties: {
      ...spliceBoxFeature.properties,
      spliceCard: {
        ...spliceBoxFeature.properties.spliceCard!,
        cables: [
          spliceBoxFeature.properties.spliceCard!.cables[0],
          { id: 'cout', name: 'Cable Salida', side: 'right', linkedFeatureId: 'mid', linkedLineId: 'line1',
            fibers: [{ id: 'f_out', index: 1, color: 'blue' }] },
        ],
      },
    },
  }
  const box2: AppFeature = {
    type: 'Feature', geometry: { type: 'Point', coordinates: [-64.2, -31.44] },
    properties: {
      id: 'box2', featureType: 'splice_box', name: 'Caja 2', code: '', notes: '', status: 'active', color: '#f97316',
      spliceCard: {
        cables: [
          { id: 'b2in', name: 'In', side: 'left', linkedFeatureId: 'mid', linkedLineId: 'line2', fibers: [{ id: 'b2f_in', index: 1, color: 'blue' }] },
          { id: 'b2out', name: 'Out', side: 'right', linkedFeatureId: 'node1', fibers: [{ id: 'b2f_out', index: 1, color: 'blue' }] },
        ],
        connections: [{ id: 'c2', leftFiberId: 'b2f_in', rightFiberId: 'b2f_out', active: true }],
        splitters: [],
      },
    },
  }
  // box1 está unida al nodo de paso; el cliente vive en box1
  it('atraviesa el nodo por patchcord y llega al nodo final', () => {
    const path = traceOpticalPath('f_client', [nodeFeature, mid, box1, box2, fiberLineFeature])
    expect(path.error).toBeUndefined()
    expect(path.found).toBe(true)
    expect(path.hops.map(h => h.featureId)).toEqual(['box1', 'mid', 'box2', 'node1'])
    expect(path.budget!.items.some(i => i.label.startsWith('Patchcord'))).toBe(true)
  })

  it('falla si el puerto no tiene patchcord', () => {
    const noPatch = { ...mid, properties: { ...mid.properties, rack: { ...mid.properties.rack!, connections: [] } } }
    const path = traceOpticalPath('f_client', [nodeFeature, noPatch, box1, box2, fiberLineFeature])
    expect(path.found).toBe(false)
    expect(path.error).toMatch(/sin patchcord/)
  })
})

// ── Camino desde puerto OLT ───────────────────────────────────────────────────
describe('traceFromOltPort', () => {
  const pt = (id: string, n: number) =>
    Array.from({ length: n }, (_, i) => ({ id: `${id}_${i + 1}`, index: i + 1, label: '', status: 'free' as const }))
  const nodeN: AppFeature = {
    type: 'Feature', geometry: { type: 'Point', coordinates: [-64.18, -31.42] },
    properties: {
      id: 'nodeN', featureType: 'node', name: 'Nodo N', code: '', notes: '', status: 'active', color: '#2563eb',
      rack: {
        totalUnits: 12,
        panels: [
          { id: 'olt', unit: 1, heightU: 1, kind: 'olt', name: 'OLT', ports: [], portGroups: [{ id: 'g', label: 'PON (2)', ports: pt('olt', 2) }] },
          { id: 'odfA', unit: 2, heightU: 1, kind: 'odf', name: 'ODF A', ports: pt('a', 4), linkedFeatureId: 'boxA' },
        ],
        connections: [{ id: 'pc', fromPortId: 'olt_1', toPortId: 'a_3', active: true }],
      },
    },
  }
  const fib = (p: string, n: number, extra: Record<string, unknown> = {}) =>
    Array.from({ length: n }, (_, i) => ({ id: `${p}${i + 1}`, index: i + 1, color: 'blue' as const, ...(i === 0 ? extra : {}) }))
  const boxA: AppFeature = {
    type: 'Feature', geometry: { type: 'Point', coordinates: [-64.19, -31.43] },
    properties: {
      id: 'boxA', featureType: 'splice_box', name: 'Caja A', code: '', notes: '', status: 'active', color: '#f97316',
      spliceCard: {
        cables: [
          { id: 'cin', name: 'Entrada', side: 'left', linkedFeatureId: 'nodeN', fibers: fib('in', 4) },
          { id: 'cout', name: 'Cliente', side: 'right', fibers: fib('out', 4, { clientName: 'Cliente X' }) },
        ],
        connections: [{ id: 'c3', leftFiberId: 'in3', rightFiberId: 'out1', active: true }],
        splitters: [],
      },
    },
  }

  it('sigue patchcord a otro puerto del ODF hasta el cliente', () => {
    const t = traceFromOltPort('nodeN', 'olt_1', [nodeN, boxA])
    expect(t.error).toBeUndefined()
    expect(t.paths).toHaveLength(1)
    expect(t.paths[0].end).toBe('client')
    expect(t.paths[0].endLabel).toBe('Cliente X')
    expect(t.paths[0].hops[0].odf).toMatchObject({ inPort: 'OLT P1', outPort: 'ODF A P3', patch: true })
  })

  it('informa fibra abierta si no hay empalme', () => {
    const open = { ...boxA, properties: { ...boxA.properties, spliceCard: { ...boxA.properties.spliceCard!, connections: [] } } }
    const t = traceFromOltPort('nodeN', 'olt_1', [nodeN, open])
    expect(t.paths[0].end).toBe('open')
  })

  it('desde un puerto ODF sigue el cable y el patchcord', () => {
    const t = traceFromOltPort('nodeN', 'a_3', [nodeN, boxA])
    expect(t.error).toBeUndefined()
    const cable = t.paths.find(p => p.direction === 'Por el cable de este ODF')!
    const patch = t.paths.find(p => p.direction === 'Por el patchcord')!
    expect(cable.end).toBe('client')
    expect(patch.end).toBe('equipment')
    expect(patch.endLabel).toBe('OLT')
  })

  it('avisa si el puerto no tiene patchcord', () => {
    const t = traceFromOltPort('nodeN', 'olt_2', [nodeN, boxA])
    expect(t.error).toMatch(/patchcord/)
  })
})
