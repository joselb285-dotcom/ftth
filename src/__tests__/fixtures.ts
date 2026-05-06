import type { AppFeature } from '../types'

// ── 2-hop topology: splice_box → node ────────────────────────────────────────
// client fiber f_client lives in box1; box1 sends f_out to node1 via line1

export const nodeFeature: AppFeature = {
  type: 'Feature',
  geometry: { type: 'Point', coordinates: [-64.18, -31.42] },
  properties: {
    id: 'node1', featureType: 'node', name: 'Nodo Central',
    code: '', notes: '', status: 'active', color: '#2563eb',
  },
}

export const spliceBoxFeature: AppFeature = {
  type: 'Feature',
  geometry: { type: 'Point', coordinates: [-64.185, -31.425] },
  properties: {
    id: 'box1', featureType: 'splice_box', name: 'Caja 1',
    code: '', notes: '', status: 'active', color: '#f97316',
    spliceCard: {
      cables: [
        {
          id: 'cin', name: 'Cable Entrada', side: 'left',
          fibers: [{ id: 'f_client', index: 0, color: 'blue', clientName: 'Cliente Test' }],
        },
        {
          id: 'cout', name: 'Cable Salida', side: 'right',
          linkedFeatureId: 'node1', linkedLineId: 'line1',
          fibers: [{ id: 'f_out', index: 0, color: 'blue' }],
        },
      ],
      connections: [
        { id: 'conn1', leftFiberId: 'f_client', rightFiberId: 'f_out', active: true },
      ],
      splitters: [],
    },
  },
}

export const fiberLineFeature: AppFeature = {
  type: 'Feature',
  // ~700 m segment in Córdoba
  geometry: { type: 'LineString', coordinates: [[-64.185, -31.425], [-64.18, -31.42]] },
  properties: {
    id: 'line1', featureType: 'fiber_line', name: 'Fibra Principal',
    code: '', notes: '', status: 'active', color: '#dc2626',
    fiberAttenuationDbPerKm: 0.35,
  },
}

export const twoHopTopology: AppFeature[] = [nodeFeature, spliceBoxFeature, fiberLineFeature]

// ── 3-hop topology: nap → splice_box → node ───────────────────────────────────

export const napFeature: AppFeature = {
  type: 'Feature',
  geometry: { type: 'Point', coordinates: [-64.19, -31.43] },
  properties: {
    id: 'nap1', featureType: 'nap', name: 'NAP 01',
    code: '', notes: '', status: 'active', color: '#16a34a',
    spliceCard: {
      cables: [
        {
          id: 'nap_cin', name: 'Cable Cliente', side: 'left',
          fibers: [{ id: 'f_nap_client', index: 0, color: 'blue', clientName: 'Cliente NAP' }],
        },
        {
          id: 'nap_cout', name: 'Cable NAP-Caja', side: 'right',
          linkedFeatureId: 'box2', linkedLineId: 'line_nap',
          fibers: [{ id: 'f_nap_out', index: 0, color: 'blue' }],
        },
      ],
      connections: [
        { id: 'nap_conn', leftFiberId: 'f_nap_client', rightFiberId: 'f_nap_out', active: true },
      ],
      splitters: [],
    },
  },
}

export const spliceBoxMiddle: AppFeature = {
  type: 'Feature',
  geometry: { type: 'Point', coordinates: [-64.185, -31.425] },
  properties: {
    id: 'box2', featureType: 'splice_box', name: 'Caja Intermedia',
    code: '', notes: '', status: 'active', color: '#f97316',
    spliceCard: {
      cables: [
        {
          id: 'box2_from_nap', name: 'Cable desde NAP', side: 'left',
          linkedFeatureId: 'nap1', linkedLineId: 'line_nap',
          fibers: [{ id: 'f_from_nap', index: 0, color: 'blue' }],
        },
        {
          id: 'box2_to_node', name: 'Cable a Nodo', side: 'right',
          linkedFeatureId: 'node2', linkedLineId: 'line_box',
          fibers: [{ id: 'f_to_node', index: 0, color: 'blue' }],
        },
      ],
      connections: [
        { id: 'box2_conn', leftFiberId: 'f_from_nap', rightFiberId: 'f_to_node', active: true },
      ],
      splitters: [],
    },
  },
}

export const nodeFeature2: AppFeature = {
  type: 'Feature',
  geometry: { type: 'Point', coordinates: [-64.18, -31.42] },
  properties: {
    id: 'node2', featureType: 'node', name: 'Nodo Principal',
    code: '', notes: '', status: 'active', color: '#2563eb',
  },
}

export const fiberLineNap: AppFeature = {
  type: 'Feature',
  geometry: { type: 'LineString', coordinates: [[-64.19, -31.43], [-64.185, -31.425]] },
  properties: {
    id: 'line_nap', featureType: 'fiber_line', name: 'Fibra NAP-Caja',
    code: '', notes: '', status: 'active', color: '#dc2626',
    fiberAttenuationDbPerKm: 0.35,
  },
}

export const fiberLineBox: AppFeature = {
  type: 'Feature',
  geometry: { type: 'LineString', coordinates: [[-64.185, -31.425], [-64.18, -31.42]] },
  properties: {
    id: 'line_box', featureType: 'fiber_line', name: 'Fibra Caja-Nodo',
    code: '', notes: '', status: 'active', color: '#dc2626',
    fiberAttenuationDbPerKm: 0.35,
  },
}

export const threeHopTopology: AppFeature[] = [
  napFeature, spliceBoxMiddle, nodeFeature2, fiberLineNap, fiberLineBox,
]

// ── Loop topology: boxA ↔ boxB (circular) ────────────────────────────────────

export const boxA: AppFeature = {
  type: 'Feature',
  geometry: { type: 'Point', coordinates: [-64.18, -31.42] },
  properties: {
    id: 'boxA', featureType: 'splice_box', name: 'Caja A',
    code: '', notes: '', status: 'active', color: '#f97316',
    spliceCard: {
      cables: [
        {
          id: 'cA_in', name: 'Entrada A', side: 'left',
          fibers: [{ id: 'f_loop_start', index: 0, color: 'blue', clientName: 'Loop Client' }],
        },
        {
          id: 'cA_out', name: 'Salida A→B', side: 'right',
          linkedFeatureId: 'boxB',
          fibers: [{ id: 'fA_out', index: 0, color: 'blue' }],
        },
      ],
      connections: [{ id: 'connA', leftFiberId: 'f_loop_start', rightFiberId: 'fA_out', active: true }],
      splitters: [],
    },
  },
}

export const boxB: AppFeature = {
  type: 'Feature',
  geometry: { type: 'Point', coordinates: [-64.182, -31.422] },
  properties: {
    id: 'boxB', featureType: 'splice_box', name: 'Caja B',
    code: '', notes: '', status: 'active', color: '#f97316',
    spliceCard: {
      cables: [
        {
          id: 'cB_in', name: 'Entrada B←A', side: 'left',
          linkedFeatureId: 'boxA',
          fibers: [{ id: 'fB_in', index: 0, color: 'blue' }],
        },
        {
          id: 'cB_out', name: 'Salida B→A', side: 'right',
          linkedFeatureId: 'boxA',
          fibers: [{ id: 'fB_out', index: 0, color: 'blue' }],
        },
      ],
      connections: [{ id: 'connB', leftFiberId: 'fB_in', rightFiberId: 'fB_out', active: true }],
      splitters: [],
    },
  },
}

export const loopTopology: AppFeature[] = [boxA, boxB]

// ── Simple feature list (no splice cards) for editor tests ───────────────────

export function makePointFeature(id: string, name: string): AppFeature {
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [-64.18, -31.42] },
    properties: {
      id, featureType: 'nap', name,
      code: '', notes: '', status: 'planned', color: '#16a34a',
    },
  }
}
