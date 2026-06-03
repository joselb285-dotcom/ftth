import type { FiberCable, FiberColor, SpliceCard, SpliceConnection, Splitter } from './types'

// ── Shared helpers (mirror de los de SpliceCardModal) ─────────────────────────
function uid() { return crypto.randomUUID() }

const COLOR_SEQ: FiberColor[] = [
  'blue', 'orange', 'green', 'brown', 'slate', 'white',
  'red', 'black', 'yellow', 'violet', 'rose', 'aqua',
]

function makeFibers(count: number, startIndex = 1) {
  return Array.from({ length: count }, (_, i) => ({
    id: uid(),
    index: startIndex + i,
    color: COLOR_SEQ[(startIndex - 1 + i) % 12] as FiberColor,
  }))
}

function cable(name: string, side: 'left' | 'right', count: number, fibersPerBuffer?: number): FiberCable {
  return { id: uid(), name, side, fibers: makeFibers(count), ...(fibersPerBuffer ? { fibersPerBuffer } : {}) }
}

function conn(leftFiberId: string, rightFiberId: string): SpliceConnection {
  return { id: uid(), leftFiberId, rightFiberId, active: false }
}

function splitter(name: string, ratio: number, posX: number, posY: number): Splitter {
  return {
    id: uid(), name, ratio,
    inputPortId: uid(),
    outputPortIds: Array.from({ length: ratio }, () => uid()),
    posX, posY,
  }
}

// splitterBoxH mirrors la función del modal: 26 + (1 + ratio) * 18
function splitterH(ratio: number) { return 26 + (1 + ratio) * 18 }

// ── Template definition ────────────────────────────────────────────────────────
export type TemplateCategory = 'paso' | 'nap' | 'distribucion'

export interface SpliceTemplate {
  id: string
  name: string
  description: string
  category: TemplateCategory
  /** Preview: [[left labels], [center labels], [right labels]] */
  preview: { left: string[]; center?: string[]; right: string[] }
  generate: () => SpliceCard
}

// ── Templates ─────────────────────────────────────────────────────────────────
export const SPLICE_TEMPLATES: SpliceTemplate[] = [

  // ── PASO / TRÁNSITO ──────────────────────────────────────────────────────────
  {
    id: 'passthrough_12',
    name: 'Paso directo 12F',
    description: '1 cable de entrada 12 fibras con fusiones directas a 1 cable de salida.',
    category: 'paso',
    preview: { left: ['Entrada 12f'], right: ['Salida 12f'] },
    generate() {
      const left  = cable('Entrada', 'left', 12, 12)
      const right = cable('Salida',  'right', 12, 12)
      const conns = left.fibers.map((f, i) => conn(f.id, right.fibers[i].id))
      return { cables: [left, right], connections: conns, splitters: [] }
    },
  },

  {
    id: 'passthrough_24',
    name: 'Paso directo 24F',
    description: '1 cable de entrada 24 fibras con fusiones directas a 1 cable de salida.',
    category: 'paso',
    preview: { left: ['Entrada 24f'], right: ['Salida 24f'] },
    generate() {
      const left  = cable('Entrada', 'left', 24, 12)
      const right = cable('Salida',  'right', 24, 12)
      const conns = left.fibers.map((f, i) => conn(f.id, right.fibers[i].id))
      return { cables: [left, right], connections: conns, splitters: [] }
    },
  },

  {
    id: 'passthrough_branch_8',
    name: 'Paso con derivación 8F',
    description: 'Cable troncal 24F pasa completo (16F) y deriva 8F a distribución. Las primeras 16 fusiones son directas.',
    category: 'paso',
    preview: { left: ['Troncal entrada 24f'], right: ['Troncal salida 16f', 'Derivación 8f'] },
    generate() {
      const trunkIn  = cable('Troncal entrada', 'left',  24, 12)
      const trunkOut = cable('Troncal salida',  'right', 16,  8)
      const branch   = cable('Derivación',      'right',  8,  8)
      const conns = [
        ...trunkIn.fibers.slice(0, 16).map((f, i) => conn(f.id, trunkOut.fibers[i].id)),
        ...trunkIn.fibers.slice(16).map((f, i)    => conn(f.id, branch.fibers[i].id)),
      ]
      return { cables: [trunkIn, trunkOut, branch], connections: conns, splitters: [] }
    },
  },

  {
    id: 'passthrough_48',
    name: 'Paso directo 48F',
    description: '1 cable de entrada 48 fibras con fusiones directas a 1 cable de salida. Ideal para troncales de alta capacidad.',
    category: 'paso',
    preview: { left: ['Entrada 48f'], right: ['Salida 48f'] },
    generate() {
      const left  = cable('Entrada', 'left', 48, 12)
      const right = cable('Salida',  'right', 48, 12)
      const conns = left.fibers.map((f, i) => conn(f.id, right.fibers[i].id))
      return { cables: [left, right], connections: conns, splitters: [] }
    },
  },

  // ── NAP / SPLITTER ────────────────────────────────────────────────────────────
  {
    id: 'nap_1x4',
    name: 'NAP 1×4',
    description: '1 fibra feeder → splitter 1×4 → 4 cables de cliente (1F c/u). Ideal para NAP de baja capacidad.',
    category: 'nap',
    preview: { left: ['Feeder 2f'], center: ['Splitter 1×4'], right: ['×4 Cliente 1f'] },
    generate() {
      const feeder  = cable('Feeder', 'left', 2, 2)
      const clients = Array.from({ length: 4 }, (_, i) => cable(`Cliente ${i + 1}`, 'right', 1))
      const sp = splitter('Splitter 1×4', 4, 260, 0)
      const conns = [
        conn(feeder.fibers[0].id, sp.inputPortId),
        ...clients.map((c, i) => conn(sp.outputPortIds[i], c.fibers[0].id)),
      ]
      return { cables: [feeder, ...clients], connections: conns, splitters: [sp] }
    },
  },

  {
    id: 'nap_1x8',
    name: 'NAP 1×8',
    description: '1 fibra feeder → splitter 1×8 → 8 cables de cliente (1F c/u). El caso más común en FTTH.',
    category: 'nap',
    preview: { left: ['Feeder 2f'], center: ['Splitter 1×8'], right: ['×8 Cliente 1f'] },
    generate() {
      const feeder  = cable('Feeder', 'left', 2, 2)
      const clients = Array.from({ length: 8 }, (_, i) => cable(`Cliente ${i + 1}`, 'right', 1))
      const sp = splitter('Splitter 1×8', 8, 260, 0)
      const conns = [
        conn(feeder.fibers[0].id, sp.inputPortId),
        ...clients.map((c, i) => conn(sp.outputPortIds[i], c.fibers[0].id)),
      ]
      return { cables: [feeder, ...clients], connections: conns, splitters: [sp] }
    },
  },

  {
    id: 'nap_1x16',
    name: 'NAP 1×16',
    description: '1 fibra feeder → splitter 1×16 → 16 cables de cliente (1F c/u). Para NAPs de alta densidad.',
    category: 'nap',
    preview: { left: ['Feeder 2f'], center: ['Splitter 1×16'], right: ['×16 Cliente 1f'] },
    generate() {
      const feeder  = cable('Feeder', 'left', 2, 2)
      const clients = Array.from({ length: 16 }, (_, i) => cable(`Cliente ${i + 1}`, 'right', 1))
      const sp = splitter('Splitter 1×16', 16, 260, 0)
      const conns = [
        conn(feeder.fibers[0].id, sp.inputPortId),
        ...clients.map((c, i) => conn(sp.outputPortIds[i], c.fibers[0].id)),
      ]
      return { cables: [feeder, ...clients], connections: conns, splitters: [sp] }
    },
  },

  {
    id: 'nap_dual_1x4',
    name: 'NAP doble 2×(1×4)',
    description: '2 fibras feeder → 2 splitters 1×4 → 8 clientes. Útil para redundancia o dos zonas separadas.',
    category: 'nap',
    preview: { left: ['Feeder 4f'], center: ['Splitter A 1×4', 'Splitter B 1×4'], right: ['×8 Cliente 1f'] },
    generate() {
      const feeder  = cable('Feeder', 'left', 4, 4)
      const clients = Array.from({ length: 8 }, (_, i) => cable(`Cliente ${i + 1}`, 'right', 1))
      const h4 = splitterH(4)
      const spA = splitter('Splitter A 1×4', 4, 260, 0)
      const spB = splitter('Splitter B 1×4', 4, 260, h4 + 14)
      const conns = [
        conn(feeder.fibers[0].id, spA.inputPortId),
        conn(feeder.fibers[1].id, spB.inputPortId),
        ...clients.slice(0, 4).map((c, i) => conn(spA.outputPortIds[i], c.fibers[0].id)),
        ...clients.slice(4)   .map((c, i) => conn(spB.outputPortIds[i], c.fibers[0].id)),
      ]
      return { cables: [feeder, ...clients], connections: conns, splitters: [spA, spB] }
    },
  },

  {
    id: 'nap_dual_1x8',
    name: 'NAP doble 2×(1×8)',
    description: '2 fibras feeder → 2 splitters 1×8 → 16 clientes. Solución de alta densidad con 2 splitters.',
    category: 'nap',
    preview: { left: ['Feeder 4f'], center: ['Splitter A 1×8', 'Splitter B 1×8'], right: ['×16 Cliente 1f'] },
    generate() {
      const feeder  = cable('Feeder', 'left', 4, 4)
      const clients = Array.from({ length: 16 }, (_, i) => cable(`Cliente ${i + 1}`, 'right', 1))
      const h8 = splitterH(8)
      const spA = splitter('Splitter A 1×8', 8, 260, 0)
      const spB = splitter('Splitter B 1×8', 8, 260, h8 + 14)
      const conns = [
        conn(feeder.fibers[0].id, spA.inputPortId),
        conn(feeder.fibers[1].id, spB.inputPortId),
        ...clients.slice(0,  8).map((c, i) => conn(spA.outputPortIds[i], c.fibers[0].id)),
        ...clients.slice(8, 16).map((c, i) => conn(spB.outputPortIds[i], c.fibers[0].id)),
      ]
      return { cables: [feeder, ...clients], connections: conns, splitters: [spA, spB] }
    },
  },

  // ── DISTRIBUCIÓN ──────────────────────────────────────────────────────────────
  {
    id: 'dist_24_2x12',
    name: 'Distribución 24F → 2×12F',
    description: 'Cable troncal 24F dividido en 2 cables de distribución de 12F. Las fusiones se crean automáticamente en orden.',
    category: 'distribucion',
    preview: { left: ['Troncal 24f'], right: ['Distribución 1 · 12f', 'Distribución 2 · 12f'] },
    generate() {
      const trunk = cable('Troncal', 'left', 24, 12)
      const d1    = cable('Distribución 1', 'right', 12, 12)
      const d2    = cable('Distribución 2', 'right', 12, 12)
      const conns = [
        ...trunk.fibers.slice(0,  12).map((f, i) => conn(f.id, d1.fibers[i].id)),
        ...trunk.fibers.slice(12, 24).map((f, i) => conn(f.id, d2.fibers[i].id)),
      ]
      return { cables: [trunk, d1, d2], connections: conns, splitters: [] }
    },
  },

  {
    id: 'dist_24_3x8',
    name: 'Distribución 24F → 3×8F',
    description: 'Cable troncal 24F dividido en 3 cables de distribución de 8F. Fusiones automáticas consecutivas.',
    category: 'distribucion',
    preview: { left: ['Troncal 24f'], right: ['Distribución 1 · 8f', 'Distribución 2 · 8f', 'Distribución 3 · 8f'] },
    generate() {
      const trunk = cable('Troncal', 'left', 24, 12)
      const d1    = cable('Distribución 1', 'right', 8, 8)
      const d2    = cable('Distribución 2', 'right', 8, 8)
      const d3    = cable('Distribución 3', 'right', 8, 8)
      const conns = [
        ...trunk.fibers.slice(0,  8).map((f, i) => conn(f.id, d1.fibers[i].id)),
        ...trunk.fibers.slice(8, 16).map((f, i) => conn(f.id, d2.fibers[i].id)),
        ...trunk.fibers.slice(16)   .map((f, i) => conn(f.id, d3.fibers[i].id)),
      ]
      return { cables: [trunk, d1, d2, d3], connections: conns, splitters: [] }
    },
  },

  {
    id: 'dist_48_4x12',
    name: 'Distribución 48F → 4×12F',
    description: 'Cable troncal 48F dividido en 4 cables de distribución de 12F. Para despliegues de alta densidad.',
    category: 'distribucion',
    preview: { left: ['Troncal 48f'], right: ['Dist. 1 · 12f', 'Dist. 2 · 12f', 'Dist. 3 · 12f', 'Dist. 4 · 12f'] },
    generate() {
      const trunk = cable('Troncal', 'left', 48, 12)
      const dists = Array.from({ length: 4 }, (_, i) => cable(`Distribución ${i + 1}`, 'right', 12, 12))
      const conns = dists.flatMap((d, di) =>
        trunk.fibers.slice(di * 12, di * 12 + 12).map((f, i) => conn(f.id, d.fibers[i].id))
      )
      return { cables: [trunk, ...dists], connections: conns, splitters: [] }
    },
  },

  {
    id: 'dist_pass_and_branch',
    name: 'Paso + distribución',
    description: 'Cable troncal 48F: 24F pasan al siguiente nodo y 24F se distribuyen en 3 ramas de 8F.',
    category: 'distribucion',
    preview: { left: ['Troncal 48f'], right: ['Troncal salida 24f', 'Dist. A 8f', 'Dist. B 8f', 'Dist. C 8f'] },
    generate() {
      const trunk   = cable('Troncal entrada', 'left',  48, 12)
      const trunkOu = cable('Troncal salida',  'right', 24, 12)
      const dA      = cable('Distribución A',  'right',  8, 8)
      const dB      = cable('Distribución B',  'right',  8, 8)
      const dC      = cable('Distribución C',  'right',  8, 8)
      const conns = [
        ...trunk.fibers.slice(0,  24).map((f, i) => conn(f.id, trunkOu.fibers[i].id)),
        ...trunk.fibers.slice(24, 32).map((f, i) => conn(f.id, dA.fibers[i].id)),
        ...trunk.fibers.slice(32, 40).map((f, i) => conn(f.id, dB.fibers[i].id)),
        ...trunk.fibers.slice(40, 48).map((f, i) => conn(f.id, dC.fibers[i].id)),
      ]
      return { cables: [trunk, trunkOu, dA, dB, dC], connections: conns, splitters: [] }
    },
  },
]

export const CATEGORY_LABELS: Record<TemplateCategory, string> = {
  paso:         'Paso / Tránsito',
  nap:          'NAP / Splitter',
  distribucion: 'Distribución',
}
