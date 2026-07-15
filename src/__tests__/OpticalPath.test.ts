import { describe, it, expect } from 'vitest'
import { traceOpticalPath, computeLineLength } from '../OpticalPath'
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
})
