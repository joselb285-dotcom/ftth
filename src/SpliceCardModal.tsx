import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { AppFeature, ClientInfo, Fiber, FiberCable, FiberColor, SpliceCard, SpliceConnection, Splitter, ZabbixConfig } from './types'
import ClientModal from './ClientModal'
import SpliceExportView from './SpliceExportView'
import SpliceSummaryView from './SpliceSummaryView'
import TitleBlockFormModal, { type TitleBlockData } from './TitleBlockFormModal'
import SpliceTemplatePicker from './SpliceTemplatePicker'
import jsPDF from 'jspdf'

// ── Constants ─────────────────────────────────────────────────────────────────
const FIBER_ROW_H = 24
const CABLE_HDR_H = 34
const CABLE_GAP = 6
const SVG_W = 600
const LEFT_PORT_X = 20
const RIGHT_PORT_X = SVG_W - 20
const SPLITTER_W = 80
const SPLITTER_HDR_H = 26
const SPLITTER_PORT_H = 18
const SPLITTER_GAP = 14
const DEFAULT_SP_X = (SVG_W - SPLITTER_W) / 2

// ── Fiber Colors ──────────────────────────────────────────────────────────────
const FIBER_HEX: Record<FiberColor, string> = {
  blue: '#2979ff', orange: '#ff6d00', green: '#00c853',
  brown: '#8d6e63', slate: '#90a4ae', white: '#eeeeee',
  red: '#f44336', black: '#757575', yellow: '#ffd600',
  violet: '#ab47bc', rose: '#f06292', aqua: '#00e5ff',
}

const FIBER_LABEL: Record<FiberColor, string> = {
  blue: 'Azul', orange: 'Naranja', green: 'Verde', brown: 'Marrón',
  slate: 'Pizarra', white: 'Blanco', red: 'Rojo', black: 'Negro',
  yellow: 'Amarillo', violet: 'Violeta', rose: 'Rosa', aqua: 'Aqua',
}

const COLOR_SEQ: FiberColor[] = [
  'blue', 'orange', 'green', 'brown', 'slate', 'white',
  'red', 'black', 'yellow', 'violet', 'rose', 'aqua',
]

const FIBER_COUNTS = [1, 2, 4, 6, 8, 12, 24, 48, 96]
const SPLITTER_RATIOS = [2, 4, 8, 16, 32, 64]

// ── Helpers ───────────────────────────────────────────────────────────────────
function uid() { return crypto.randomUUID() }

function getPowerClass(dbm: string | undefined): string {
  if (!dbm) return ''
  const v = parseFloat(dbm)
  if (isNaN(v)) return ''
  if (v >= -8)  return 'power-high'
  if (v >= -27) return 'power-ok'
  if (v >= -30) return 'power-warn'
  return 'power-crit'
}

function makeFibers(count: number, startIndex = 1): Fiber[] {
  return Array.from({ length: count }, (_, i) => ({
    id: uid(),
    index: startIndex + i,
    color: COLOR_SEQ[(startIndex - 1 + i) % 12],
  }))
}

function makeSplitter(name: string, ratio: number, posX: number, posY: number): Splitter {
  return {
    id: uid(),
    name,
    ratio,
    inputPortId: uid(),
    outputPortIds: Array.from({ length: ratio }, () => uid()),
    posX,
    posY,
  }
}

function splitterBoxH(sp: Splitter): number {
  return SPLITTER_HDR_H + (1 + sp.ratio) * SPLITTER_PORT_H
}

function getDefaultSplitterY(splitters: Splitter[], idx: number): number {
  let y = 0
  for (let i = 0; i < idx; i++) y += splitterBoxH(splitters[i]) + SPLITTER_GAP
  return y
}

function getSplitterPos(sp: Splitter, splitters: Splitter[], idx: number): { x: number; y: number } {
  return {
    x: sp.posX ?? DEFAULT_SP_X,
    y: sp.posY ?? getDefaultSplitterY(splitters, idx),
  }
}

function getCableStartY(cables: FiberCable[], idx: number): number {
  return cables.slice(0, idx).reduce(
    (acc, c) => acc + CABLE_HDR_H + c.fibers.length * FIBER_ROW_H + CABLE_GAP,
    0
  )
}

function totalCableH(cables: FiberCable[]): number {
  return cables.reduce(
    (s, c) => s + CABLE_HDR_H + c.fibers.length * FIBER_ROW_H + CABLE_GAP,
    0
  )
}

function chunkFibers(fibers: Fiber[], size = 12): Fiber[][] {
  const chunks: Fiber[][] = []
  for (let i = 0; i < fibers.length; i += size) chunks.push(fibers.slice(i, i + size))
  return chunks
}

// ── Port Info ─────────────────────────────────────────────────────────────────
type PortInfo = { x: number; y: number; color: string }

function getPortInfo(
  portId: string,
  leftCables: FiberCable[],
  rightCables: FiberCable[],
  bottomCables: FiberCable[],
  splitters: Splitter[],
  portPos: Record<string, { x: number; y: number }> = {}
): PortInfo | null {
  // Prefer real DOM-measured positions for cable fibers
  const measured = portPos[portId]
  if (measured) {
    for (const c of [...leftCables, ...rightCables, ...bottomCables]) {
      const f = c.fibers.find(f => f.id === portId)
      if (f) return { ...measured, color: FIBER_HEX[f.color] }
    }
  }
  // Fallback to calculated positions (used before first DOM measurement)
  for (let ci = 0; ci < leftCables.length; ci++) {
    const fi = leftCables[ci].fibers.findIndex(f => f.id === portId)
    if (fi !== -1) {
      const y = getCableStartY(leftCables, ci) + CABLE_HDR_H + fi * FIBER_ROW_H + FIBER_ROW_H / 2
      return { x: LEFT_PORT_X, y, color: FIBER_HEX[leftCables[ci].fibers[fi].color] }
    }
  }
  for (let ci = 0; ci < rightCables.length; ci++) {
    const fi = rightCables[ci].fibers.findIndex(f => f.id === portId)
    if (fi !== -1) {
      const y = getCableStartY(rightCables, ci) + CABLE_HDR_H + fi * FIBER_ROW_H + FIBER_ROW_H / 2
      return { x: RIGHT_PORT_X, y, color: FIBER_HEX[rightCables[ci].fibers[fi].color] }
    }
  }
  for (let si = 0; si < splitters.length; si++) {
    const sp = splitters[si]
    const pos = getSplitterPos(sp, splitters, si)
    if (sp.inputPortId === portId) {
      return { x: pos.x, y: pos.y + SPLITTER_HDR_H + SPLITTER_PORT_H / 2, color: '#60a5fa' }
    }
    const oi = sp.outputPortIds.indexOf(portId)
    if (oi !== -1) {
      return { x: pos.x + SPLITTER_W, y: pos.y + SPLITTER_HDR_H + (1 + oi) * SPLITTER_PORT_H + SPLITTER_PORT_H / 2, color: '#34d399' }
    }
  }
  return null
}

// ── Bezier Path ───────────────────────────────────────────────────────────────
function bezierPath(x1: number, y1: number, x2: number, y2: number): string {
  const cx = (x1 + x2) / 2
  return `M ${x1} ${y1} C ${cx} ${y1} ${cx} ${y2} ${x2} ${y2}`
}

// ── Topology helpers ──────────────────────────────────────────────────────────
function detectLineDirection(
  line: AppFeature,
  boxCoords: [number, number],
  nodes: AppFeature[]
): 'entrada' | 'salida' | 'unknown' {
  if (line.geometry.type !== 'LineString') return 'unknown'
  const coords = (line.geometry as GeoJSON.LineString).coordinates as [number, number][]
  if (coords.length < 2 || nodes.length === 0) return 'unknown'

  const first = coords[0] as [number, number]
  const last  = coords[coords.length - 1] as [number, number]
  const dFirst = (first[0] - boxCoords[0]) ** 2 + (first[1] - boxCoords[1]) ** 2
  const dLast  = (last[0]  - boxCoords[0]) ** 2 + (last[1]  - boxCoords[1]) ** 2
  const other  = dFirst < dLast ? last : first

  const nearestNode = (pt: [number, number]) =>
    Math.min(...nodes.map(n => {
      const nc = (n.geometry as GeoJSON.Point).coordinates as [number, number]
      return (nc[0] - pt[0]) ** 2 + (nc[1] - pt[1]) ** 2
    }))

  return nearestNode(other) <= nearestNode(boxCoords) ? 'entrada' : 'salida'
}

function findEndpointFeature(
  line: AppFeature,
  boxCoords: [number, number],
  candidates: AppFeature[]
): AppFeature | null {
  if (line.geometry.type !== 'LineString') return null
  const coords = (line.geometry as GeoJSON.LineString).coordinates as [number, number][]
  if (coords.length < 2) return null

  const first = coords[0] as [number, number]
  const last  = coords[coords.length - 1] as [number, number]
  const dFirst = (first[0] - boxCoords[0]) ** 2 + (first[1] - boxCoords[1]) ** 2
  const dLast  = (last[0]  - boxCoords[0]) ** 2 + (last[1]  - boxCoords[1]) ** 2
  const other  = dFirst < dLast ? last : first

  const THRESH = 0.002 ** 2
  return candidates
    .filter(f => {
      if (f.geometry.type !== 'Point') return false
      const fc = (f.geometry as GeoJSON.Point).coordinates as [number, number]
      return (fc[0] - other[0]) ** 2 + (fc[1] - other[1]) ** 2 <= THRESH
    })
    .sort((a, b) => {
      const pa = (a.geometry as GeoJSON.Point).coordinates as [number, number]
      const pb = (b.geometry as GeoJSON.Point).coordinates as [number, number]
      return ((pa[0]-other[0])**2+(pa[1]-other[1])**2) - ((pb[0]-other[0])**2+(pb[1]-other[1])**2)
    })[0] ?? null
}

// ── Buffer / fibers-per-buffer options ────────────────────────────────────────
const BUFFER_COUNTS = [1, 2, 3, 4, 6, 8, 12, 16, 24]
const FPB_OPTIONS   = [1, 2, 4, 6, 8, 12]   // fibers per buffer, max 12

// ── Add Cable Form ────────────────────────────────────────────────────────────
function AddCableForm({
  onAdd,
  onCancel,
}: {
  onAdd: (name: string, count: number, fibersPerBuffer: number) => void
  onCancel: () => void
}) {
  const [name,    setName]    = useState('')
  const [buffers, setBuffers] = useState(2)
  const [fpb,     setFpb]     = useState(12)

  const totalFibers = buffers * fpb

  function submit() {
    if (!name.trim()) return
    onAdd(name.trim(), totalFibers, fpb)
  }

  return (
    <div className="add-cable-form">
      <input
        value={name}
        onChange={e => setName(e.target.value)}
        placeholder="Nombre del cable"
        autoFocus
        onKeyDown={e => e.key === 'Enter' && submit()}
      />
      <label className="acf-label">
        <span>Buffers</span>
        <select value={buffers} onChange={e => setBuffers(Number(e.target.value))}>
          {BUFFER_COUNTS.map(n => <option key={n} value={n}>{n}</option>)}
        </select>
      </label>
      <label className="acf-label">
        <span>F/buffer</span>
        <select value={fpb} onChange={e => setFpb(Number(e.target.value))}>
          {FPB_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
        </select>
      </label>
      <span className="add-cable-buffer-hint" title="Fibras totales del cable">
        {totalFibers}f total
      </span>
      <button onClick={submit}>Agregar</button>
      <button className="secondary" onClick={onCancel}>Cancelar</button>
    </div>
  )
}

function AddSplitterForm({
  onAdd,
  onCancel,
}: {
  onAdd: (name: string, ratio: number) => void
  onCancel: () => void
}) {
  const [name, setName] = useState('')
  const [ratio, setRatio] = useState(8)

  return (
    <div className="add-cable-form">
      <input
        value={name}
        onChange={e => setName(e.target.value)}
        placeholder="Nombre del splitter"
        autoFocus
        onKeyDown={e =>
          e.key === 'Enter' && name.trim() && onAdd(name.trim(), ratio)
        }
      />
      <select
        value={ratio}
        onChange={e => setRatio(Number(e.target.value))}
      >
        {SPLITTER_RATIOS.map(n => (
          <option key={n} value={n}>
            1×{n}
          </option>
        ))}
      </select>
      <button onClick={() => name.trim() && onAdd(name.trim(), ratio)}>
        Agregar
      </button>
      <button className="secondary" onClick={onCancel}>
        Cancelar
      </button>
    </div>
  )
}

// ── Detected Line Row ─────────────────────────────────────────────────────────
const FEAT_ICON: Record<string, string> = { node: '🖥', splice_box: '📦', nap: '🔌' }

function DetectedLineRow({
  line, direction, endpointFeature, onAdd,
}: {
  line: AppFeature
  direction: 'entrada' | 'salida' | 'unknown'
  endpointFeature: AppFeature | null
  onAdd: (count: number, side: 'left' | 'right', fpb: number) => void
}) {
  const [picking, setPicking] = useState<'left' | 'right' | null>(null)

  // Derive default buffer/fpb from stored fiberCount
  const storedTotal  = line.properties.fiberCount ?? 12
  const defaultFpb   = storedTotal % 12 === 0 ? 12 : storedTotal % 8 === 0 ? 8 : 12
  const defaultBufs  = Math.max(1, Math.ceil(storedTotal / defaultFpb))

  const [buffers, setBuffers] = useState(defaultBufs)
  const [fpb,     setFpb]     = useState(defaultFpb)
  const totalFibers = buffers * fpb

  if (picking) {
    return (
      <div className="detected-line-row det-picking">
        <span className="det-picking-name">{line.properties.name}</span>
        <label className="acf-label">
          <span>Buf.</span>
          <select value={buffers} onChange={e => setBuffers(Number(e.target.value))}>
            {BUFFER_COUNTS.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <label className="acf-label">
          <span>F/buf</span>
          <select value={fpb} onChange={e => setFpb(Number(e.target.value))}>
            {FPB_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <span className="add-cable-buffer-hint">{totalFibers}f</span>
        <button onClick={() => { onAdd(totalFibers, picking, fpb); setPicking(null) }}>✓</button>
        <button className="secondary" onClick={() => setPicking(null)}>✕</button>
      </div>
    )
  }

  const dirLabel = direction === 'entrada' ? '← Entrada' : direction === 'salida' ? '→ Salida' : '↔ ?'

  return (
    <div className="detected-line-row">
      <span className={`det-dir-badge det-${direction}`}>{dirLabel}</span>
      <span className="det-line-name" title={line.properties.name}>{line.properties.name}</span>
      {endpointFeature && (
        <span className="det-endpoint" title={endpointFeature.properties.name}>
          {FEAT_ICON[endpointFeature.properties.featureType] ?? '📍'} {endpointFeature.properties.name}
        </span>
      )}
      {direction === 'unknown' ? (
        <span className="det-add-btns">
          <button className="secondary small" onClick={() => setPicking('left')}>+ Ent.</button>
          <button className="secondary small" onClick={() => setPicking('right')}>+ Sal.</button>
        </span>
      ) : (
        <button className="secondary small" onClick={() => setPicking(direction === 'entrada' ? 'left' : 'right')}>
          + Agregar
        </button>
      )}
    </div>
  )
}

// ── Cable Link Picker v2 ──────────────────────────────────────────────────────
// Un solo clic vincula tanto la línea del mapa como el feature del extremo.
// Solo muestra líneas que tocan geográficamente este elemento.
function CableLinkPicker({
  cable,
  linkableLines,
  boxCoords,
  endpointCandidates,
  nodeFeatures,
  onLink,
  onUnlink,
}: {
  cable: FiberCable
  linkableLines: import('./types').AppFeature[]
  boxCoords: [number, number] | null
  endpointCandidates: import('./types').AppFeature[]
  nodeFeatures: import('./types').AppFeature[]
  onLink: (lineId: string, featureId?: string) => void
  onUnlink: () => void
}) {
  // Enrich each linkable line with its detected endpoint + direction
  const options = linkableLines.map(line => ({
    line,
    endpoint: boxCoords ? findEndpointFeature(line, boxCoords, endpointCandidates) : null,
    direction: boxCoords ? detectLineDirection(line, boxCoords, nodeFeatures) : 'unknown' as const,
  }))

  const linked = cable.linkedLineId
    ? options.find(o => o.line.properties.id === cable.linkedLineId)
    : null

  const FEAT_ICON: Record<string, string> = { node: '🖥', nap: '🔌', splice_box: '📦' }
  const DIR_LABEL: Record<string, string> = { entrada: '← Entrada', salida: '→ Salida', unknown: '↔' }

  // Already linked — show status + change button
  if (linked || cable.linkedLineId) {
    const lineName = linked?.line.properties.name ?? cable.linkedLineId?.slice(0, 8)
    const ep = linked?.endpoint ?? endpointCandidates.find(f => f.properties.id === cable.linkedFeatureId)
    return (
      <div className="clp-linked-status">
        <div className="clp-linked-row">
          <span className="clp-linked-icon">✅</span>
          <div className="clp-linked-info">
            <span className="clp-linked-line">〰 {lineName}</span>
            {ep && (
              <span className="clp-linked-endpoint">
                {FEAT_ICON[ep.properties.featureType] ?? '📍'} {ep.properties.name}
              </span>
            )}
          </div>
          <button className="secondary small" onClick={onUnlink} title="Quitar vinculación">🗑</button>
        </div>
      </div>
    )
  }

  return (
    <div className="clp-picker">
      <p className="clp-hint">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        Seleccioná la línea de fibra que representa este cable:
      </p>

      {options.length === 0 ? (
        <p className="clp-empty">
          No se detectaron líneas de fibra tocando este elemento.<br/>
          Asegurate de que las líneas del mapa lleguen hasta esta caja.
        </p>
      ) : (
        <div className="clp-options">
          {options.map(o => (
            <button
              key={o.line.properties.id}
              className="clp-option"
              onClick={() => onLink(o.line.properties.id, o.endpoint?.properties.id)}
            >
              <span className="clp-opt-dir" data-dir={o.direction}>{DIR_LABEL[o.direction]}</span>
              <span className="clp-opt-line">〰 {o.line.properties.name}</span>
              {o.endpoint ? (
                <span className="clp-opt-endpoint">
                  {FEAT_ICON[o.endpoint.properties.featureType] ?? '📍'} {o.endpoint.properties.name}
                </span>
              ) : (
                <span className="clp-opt-endpoint clp-opt-noep">extremo sin detectar</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Fiber Row ─────────────────────────────────────────────────────────────────
function FiberRow({
  fiber,
  side,
  connected,
  selected,
  connSelected,
  isClientCable,
  onClick,
  onLabelChange,
  onOpenClient,
  onTrace,
}: {
  fiber: Fiber
  side: 'left' | 'right' | 'bottom'
  connected: boolean
  selected: boolean
  connSelected: boolean
  isClientCable: boolean
  onClick: () => void
  onLabelChange: (label: string) => void
  onOpenClient: () => void
  onTrace?: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(fiber.clientName ?? '')

  useEffect(() => {
    if (!editing) setDraft(fiber.clientName ?? '')
  }, [fiber.clientName, editing])

  function commitEdit() {
    setEditing(false)
    onLabelChange(draft.trim())
  }

  const dot = (
    <span
      className="fiber-dot"
      style={{ background: FIBER_HEX[fiber.color] }}
    />
  )
  const label = (
    <span className="fiber-label">
      F{fiber.index}{' '}
      <span className="fiber-color-name">{FIBER_LABEL[fiber.color]}</span>
    </span>
  )
  const epClass = side === 'bottom' ? 'bottom-ep' : `${side}-ep`
  const ep = (
    <span
      className={`fiber-ep ${epClass} ${connected ? 'ep-conn' : ''} ${
        selected ? 'ep-sel' : ''
      }`}
      data-fiber-id={fiber.id}
    />
  )
  const clientEl = (
    <span className="fiber-client-wrap">
      <span
        className="fiber-client"
        onClick={e => { e.stopPropagation(); if (!editing) setEditing(true) }}
      >
        {editing ? (
          <input
            className="fiber-client-input"
            value={draft}
            autoFocus
            onChange={e => setDraft(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={e => {
              if (e.key === 'Enter') commitEdit()
              if (e.key === 'Escape') { setEditing(false); setDraft(fiber.clientName ?? '') }
            }}
            onClick={e => e.stopPropagation()}
          />
        ) : (
          <span className={`fiber-client-text ${fiber.clientName ? 'has-label' : ''}`}>
            {fiber.clientName || '+ etiqueta'}
          </span>
        )}
      </span>
      {isClientCable && (
        <button
          className={`client-info-btn ${fiber.clientInfo ? 'has-info' : ''}`}
          title="Ver/editar datos del cliente"
          onClick={e => { e.stopPropagation(); onOpenClient() }}
        >
          {fiber.clientInfo ? '👤' : '➕'}
        </button>
      )}
      {(fiber.clientName || fiber.clientInfo) && onTrace && (
        <button
          className="client-info-btn trace-btn"
          title="Trazar camino óptico"
          onClick={e => { e.stopPropagation(); onTrace() }}
        >
          📍
        </button>
      )}
    </span>
  )

  return (
    <div
      className={`splice-fiber${side === 'bottom' ? ' splice-fiber-bottom' : ''} ${selected ? 'fiber-sel' : ''} ${
        connSelected ? 'fiber-conn-sel' : ''
      } ${connected ? 'fiber-conn' : ''}`}
      onClick={onClick}
    >
      {side === 'left' ? (
        <>{dot}{label}{clientEl}{ep}</>
      ) : side === 'right' ? (
        <>{ep}{clientEl}{label}{dot}</>
      ) : (
        // bottom: port faces up, compact vertical
        <>{ep}{dot}{label}</>
      )}
    </div>
  )
}

// ── Buffer Group ─────────────────────────────────────────────────────────────
function BufferGroup({
  bufferIndex, fibers, side, connections, pendingPort, selectedConnId, isClientCable,
  onPortClick, onLabelChange, onOpenClient, onTrace,
}: {
  bufferIndex: number
  fibers: Fiber[]
  side: 'left' | 'right' | 'bottom'
  connections: SpliceConnection[]
  pendingPort: string | null
  selectedConnId: string | null
  isClientCable: boolean
  onPortClick: (id: string) => void
  onLabelChange: (fiberId: string, label: string) => void
  onOpenClient: (fiberId: string) => void
  onTrace?: (fiberId: string) => void
}) {
  const connectedIds = new Set(connections.flatMap(c => [c.leftFiberId, c.rightFiberId]))
  const usedCount = fibers.filter(f => connectedIds.has(f.id) || f.clientName || f.clientInfo).length
  const hasSelection = fibers.some(f =>
    f.id === pendingPort ||
    connections.some(c => c.id === selectedConnId && (c.leftFiberId === f.id || c.rightFiberId === f.id))
  )
  const [expanded, setExpanded] = useState(usedCount > 0 || hasSelection)

  useEffect(() => { if (hasSelection) setExpanded(true) }, [hasSelection])

  const tubeColor = FIBER_HEX[COLOR_SEQ[bufferIndex % 12]]

  return (
    <div className="fiber-buffer">
      <div className={`fiber-buffer-hdr ${expanded ? 'expanded' : ''}`} onClick={() => setExpanded(e => !e)}>
        <span className="buffer-tube-dot" style={{ background: tubeColor }} />
        <span className="buffer-label">Buffer {bufferIndex + 1}</span>
        <span className={`buffer-used-badge ${usedCount > 0 ? 'has-used' : ''}`}>
          {usedCount}/{fibers.length}
        </span>
        <span className="buffer-chevron">{expanded ? '▲' : '▼'}</span>
      </div>
      {expanded && fibers.map(fiber => {
        const conn = connections.find(c => c.leftFiberId === fiber.id || c.rightFiberId === fiber.id)
        return (
          <FiberRow
            key={fiber.id}
            fiber={fiber}
            side={side}
            connected={!!conn}
            selected={pendingPort === fiber.id}
            connSelected={conn?.id === selectedConnId}
            isClientCable={isClientCable}
            onClick={() => onPortClick(fiber.id)}
            onLabelChange={label => onLabelChange(fiber.id, label)}
            onOpenClient={() => onOpenClient(fiber.id)}
            onTrace={onTrace ? () => onTrace(fiber.id) : undefined}
          />
        )
      })}
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────
interface Props {
  featureId: string
  featureName: string
  projectName: string
  subProjectName: string
  spliceCard: SpliceCard
  allFeatures?: AppFeature[]
  zabbixConfig?: ZabbixConfig | null
  zabbixOltHosts?: string[]
  onChange: (card: SpliceCard) => void
  onClose: () => void
  onTraceClient?: (fiberId: string) => void
}

const SpliceCardModal = memo(function SpliceCardModal({
  featureId,
  featureName,
  projectName,
  subProjectName,
  spliceCard,
  allFeatures = [],
  zabbixConfig,
  zabbixOltHosts = [],
  onChange,
  onClose,
  onTraceClient,
}: Props) {
  const [card, setCard] = useState<SpliceCard>({ ...spliceCard })
  const [pendingPort, setPendingPort] = useState<string | null>(null)
  const [selectedConnId, setSelectedConnId] = useState<string | null>(null)
  const [addingCableSide, setAddingCableSide] = useState<
    'left' | 'right' | 'bottom' | null
  >(null)
  const [addingSplitter, setAddingSplitter] = useState(false)

  const svgRef = useRef<SVGSVGElement>(null)
  const bodyRef = useRef<HTMLDivElement | null>(null)
  const [exporting, setExporting] = useState(false)
  const dragRef = useRef<{ splitterId: string; offsetX: number; offsetY: number } | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [portPos, setPortPos] = useState<Record<string, { x: number; y: number }>>({})
  const [clientModalTarget, setClientModalTarget] = useState<{ cableId: string; fiberId: string } | null>(null)
  const [showTitleBlockForm, setShowTitleBlockForm] = useState(false)
  const [linkingCableId, setLinkingCableId] = useState<string | null>(null)
  const [showTemplatePicker, setShowTemplatePicker] = useState(false)
  const [draggingCableId, setDraggingCableId] = useState<string | null>(null)
  const [dragOverCableId, setDragOverCableId] = useState<string | null>(null)

  const measurePortPos = useCallback(() => {
    const svgEl = svgRef.current
    const bodyEl = bodyRef.current
    if (!svgEl || !bodyEl) return
    const svgRect = svgEl.getBoundingClientRect()
    const map: Record<string, { x: number; y: number }> = {}
    bodyEl.querySelectorAll<HTMLElement>('[data-fiber-id]').forEach(el => {
      const fid = el.dataset.fiberId!
      const r = el.getBoundingClientRect()
      const isBot = el.classList.contains('bottom-ep')
      const x = el.classList.contains('left-ep')
        ? r.right  - svgRect.left
        : isBot
          ? (r.left + r.right) / 2 - svgRect.left
          : r.left - svgRect.left
      const y = isBot
        ? r.top - svgRect.top
        : (r.top + r.bottom) / 2 - svgRect.top
      map[fid] = { x, y }
    })
    setPortPos(map)
  }, [])

  useLayoutEffect(() => {
    measurePortPos()
  }, [card.cables, measurePortPos])

  useEffect(() => {
    const bodyEl = bodyRef.current
    if (!bodyEl) return
    bodyEl.addEventListener('scroll', measurePortPos)
    window.addEventListener('resize', measurePortPos)
    return () => {
      bodyEl.removeEventListener('scroll', measurePortPos)
      window.removeEventListener('resize', measurePortPos)
    }
  }, [measurePortPos])

  const leftCables   = card.cables.filter(c => c.side === 'left')
  const rightCables  = card.cables.filter(c => c.side === 'right')
  const bottomCables = card.cables.filter(c => c.side === 'bottom')
  const splitters = card.splitters ?? []
  const selectedConn = card.connections.find(
    c => c.id === selectedConnId
  ) ?? null

  function update(next: SpliceCard) {
    setCard(next)
    onChange(next)
  }

  function connOfPort(portId: string): SpliceConnection | null {
    return (
      card.connections.find(
        c => c.leftFiberId === portId || c.rightFiberId === portId
      ) ?? null
    )
  }

  function addCable(
    side: FiberCable['side'], name: string, count: number,
    linkedLineId?: string, linkedFeatureId?: string,
    fibersPerBuffer?: number
  ) {
    const cable: FiberCable = {
      id: uid(),
      name,
      side,
      fibers: makeFibers(count),
      ...(fibersPerBuffer  ? { fibersPerBuffer }  : {}),
      ...(linkedLineId     ? { linkedLineId }     : {}),
      ...(linkedFeatureId  ? { linkedFeatureId }  : {}),
    }
    update({ ...card, cables: [...card.cables, cable] })
    setAddingCableSide(null)
  }

  function moveCableToSide(cableId: string, newSide: FiberCable['side']) {
    update({ ...card, cables: card.cables.map(c => c.id !== cableId ? c : { ...c, side: newSide }) })
  }

  function reorderCable(fromId: string, toId: string) {
    if (fromId === toId) return
    const fromCable = card.cables.find(c => c.id === fromId)
    const toCable   = card.cables.find(c => c.id === toId)
    if (!fromCable || !toCable || fromCable.side !== toCable.side) return
    const cables = [...card.cables]
    const fromIdx = cables.findIndex(c => c.id === fromId)
    cables.splice(fromIdx, 1)
    const toIdx = cables.findIndex(c => c.id === toId)
    cables.splice(toIdx, 0, fromCable)
    update({ ...card, cables })
  }

  function deleteCable(cableId: string) {
    if (!confirm('¿Eliminar este cable y sus conexiones?')) return
    const cable = card.cables.find(c => c.id === cableId)
    const fiberIds = new Set(cable?.fibers.map(f => f.id) ?? [])
    update({
      ...card,
      cables: card.cables.filter(c => c.id !== cableId),
      connections: card.connections.filter(
        c =>
          !fiberIds.has(c.leftFiberId) && !fiberIds.has(c.rightFiberId)
      ),
    })
  }

  function updateFiberLabel(cableId: string, fiberId: string, label: string) {
    update({
      ...card,
      cables: card.cables.map(c =>
        c.id !== cableId ? c : {
          ...c,
          fibers: c.fibers.map(f =>
            f.id !== fiberId ? f : { ...f, clientName: label || undefined }
          ),
        }
      ),
    })
  }

  function updateClientInfo(cableId: string, fiberId: string, info: ClientInfo) {
    update({
      ...card,
      cables: card.cables.map(c =>
        c.id !== cableId ? c : {
          ...c,
          fibers: c.fibers.map(f =>
            f.id !== fiberId ? f : {
              ...f,
              clientInfo: info,
              clientName: info.name || f.clientName,
            }
          ),
        }
      ),
    })
  }

  function linkCableToFeature(cableId: string, linkedFeatureId: string | undefined, linkedLineId?: string | null) {
    update({
      ...card,
      cables: card.cables.map(c => {
        if (c.id !== cableId) return c
        const next = { ...c, linkedFeatureId }
        if (linkedLineId !== undefined) next.linkedLineId = linkedLineId ?? undefined
        return next
      }),
    })
    if (linkedFeatureId === undefined) setLinkingCableId(null)
  }

  function linkCableLine(cableId: string, lineId: string | undefined) {
    update({
      ...card,
      cables: card.cables.map(c =>
        c.id !== cableId ? c : { ...c, linkedLineId: lineId }
      ),
    })
  }

  // One-shot: set both linkedLineId + linkedFeatureId in one click
  function linkCableToMap(cableId: string, lineId: string, featId?: string) {
    update({
      ...card,
      cables: card.cables.map(c =>
        c.id !== cableId ? c : { ...c, linkedLineId: lineId, linkedFeatureId: featId }
      ),
    })
    setLinkingCableId(null)
  }

  // Unlink both at once
  function unlinkCableFromMap(cableId: string) {
    update({
      ...card,
      cables: card.cables.map(c =>
        c.id !== cableId ? c : { ...c, linkedLineId: undefined, linkedFeatureId: undefined }
      ),
    })
  }

  // Auto-create cables for all detected lines not yet linked
  function syncCablesFromMap() {
    const linkedLineIds = new Set(card.cables.map(c => c.linkedLineId).filter(Boolean))
    const toAdd = [
      ...detectedEntrada.filter(d => !linkedLineIds.has(d.line.properties.id)),
      ...detectedSalida.filter(d => !linkedLineIds.has(d.line.properties.id)),
    ]
    if (toAdd.length === 0) return
    const newCables: FiberCable[] = toAdd.map(d => {
      const totalFibers    = d.line.properties.fiberCount ?? 12
      const fibersPerBuffer = Math.min(totalFibers, 12)
      return {
        id: uid(),
        name: d.line.properties.name || 'Cable',
        side: (d.direction === 'entrada' ? 'left' : 'right') as 'left' | 'right',
        fibers: makeFibers(totalFibers),
        fibersPerBuffer,
        linkedLineId: d.line.properties.id,
        linkedFeatureId: d.endpoint?.properties.id,
      }
    })
    update({ ...card, cables: [...card.cables, ...newCables] })
  }

  // Linkable endpoint features: nodes / splice_box / nap (not the current one)
  const linkableFeatures = allFeatures.filter(
    f => f.properties.id !== featureId &&
         ['splice_box', 'nap', 'node'].includes(f.properties.featureType)
  )

  // Box point coordinates (for proximity filtering of lines)
  const boxCoords = (() => {
    const feat = allFeatures.find(f => f.properties.id === featureId)
    if (feat?.geometry.type === 'Point') return (feat.geometry as GeoJSON.Point).coordinates as [number, number]
    return null
  })()

  // IDs of lines already linked to any cable (always show them regardless of distance)
  const linkedLineIds = new Set(card.cables.map(c => c.linkedLineId).filter(Boolean) as string[])

  // Proximity threshold: 5 m in degrees (5 / 111320 m/°)
  const PROX_SQ = (5 / 111320) ** 2

  function distSq(a: [number, number], b: [number, number]) {
    return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2
  }

  const FIBER_LINE_TYPES = new Set([
    'fiber_line', 'fiber_aerial', 'fiber_underground',
    'fiber_trunk_aerial', 'fiber_secondary_aerial', 'fiber_distribution_aerial',
    'fiber_trunk_underground', 'fiber_secondary_underground', 'fiber_distribution_underground',
  ])

  // Linkable line features: all fiber types whose geometry touches the box
  const linkableLines = allFeatures.filter(f => {
    if (!FIBER_LINE_TYPES.has(f.properties.featureType)) return false
    if (linkedLineIds.has(f.properties.id)) return true
    if (!boxCoords || f.geometry.type !== 'LineString') return true
    const coords = (f.geometry as GeoJSON.LineString).coordinates as [number, number][]
    return coords.some(c => distSq(c, boxCoords) <= PROX_SQ)
  })

  // Lines touching this box that aren't linked yet → suggest with direction
  const nodeFeatures       = allFeatures.filter(f => f.properties.featureType === 'node')
  const endpointCandidates = allFeatures.filter(f =>
    f.properties.id !== featureId &&
    ['node', 'splice_box', 'nap'].includes(f.properties.featureType)
  )
  const detectedLines = boxCoords
    ? linkableLines
        .filter(l => !linkedLineIds.has(l.properties.id))
        .map(line => ({
          line,
          direction: detectLineDirection(line, boxCoords, nodeFeatures),
          endpoint:  findEndpointFeature(line, boxCoords, endpointCandidates),
        }))
    : []
  const detectedEntrada = detectedLines.filter(d => d.direction === 'entrada')
  const detectedSalida  = detectedLines.filter(d => d.direction === 'salida' || d.direction === 'unknown')

  function addSplitter(name: string, ratio: number) {
    const lastSP = splitters[splitters.length - 1]
    const lastPos = lastSP ? getSplitterPos(lastSP, splitters, splitters.length - 1) : null
    const newY = lastPos ? lastPos.y + splitterBoxH(lastSP) + SPLITTER_GAP : 0
    const sp = makeSplitter(name, ratio, DEFAULT_SP_X, newY)
    update({ ...card, splitters: [...splitters, sp] })
    setAddingSplitter(false)
  }

  function deleteSplitter(splitterId: string) {
    if (!confirm('¿Eliminar este splitter y sus conexiones?')) return
    const sp = splitters.find(s => s.id === splitterId)
    if (!sp) return
    const portIds = new Set([sp.inputPortId, ...sp.outputPortIds])
    update({
      ...card,
      splitters: splitters.filter(s => s.id !== splitterId),
      connections: card.connections.filter(
        c =>
          !portIds.has(c.leftFiberId) && !portIds.has(c.rightFiberId)
      ),
    })
  }

  function handlePortClick(portId: string) {
    const existing = connOfPort(portId)
    if (existing) {
      setSelectedConnId(existing.id)
      setPendingPort(null)
      return
    }
    if (!pendingPort) {
      setPendingPort(portId)
      return
    }
    if (pendingPort === portId) {
      setPendingPort(null)
      return
    }
    const a = pendingPort
    const b = portId
    const busy = card.connections.some(
      c =>
        c.leftFiberId === a ||
        c.rightFiberId === a ||
        c.leftFiberId === b ||
        c.rightFiberId === b
    )
    if (busy) {
      setPendingPort(portId)
      return
    }
    const conn: SpliceConnection = {
      id: uid(),
      leftFiberId: a,
      rightFiberId: b,
      active: false,
    }
    update({ ...card, connections: [...card.connections, conn] })
    setPendingPort(null)
    setSelectedConnId(conn.id)
  }

  function toggleActive(id: string) {
    update({
      ...card,
      connections: card.connections.map(c =>
        c.id === id ? { ...c, active: !c.active } : c
      ),
    })
  }

  function deleteConn(id: string) {
    update({
      ...card,
      connections: card.connections.filter(c => c.id !== id),
    })
    setSelectedConnId(null)
  }

  function dismiss() {
    setPendingPort(null)
    setSelectedConnId(null)
  }

  async function svgToCanvas(svgMarkup: string, w: number, h: number): Promise<HTMLCanvasElement> {
    // Embed any external images as data URLs is handled by SpliceExportView directly
    const svgBlob = new Blob(
      [`<?xml version="1.0" encoding="UTF-8"?>`, svgMarkup],
      { type: 'image/svg+xml;charset=utf-8' }
    )
    const url = URL.createObjectURL(svgBlob)
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        const scale = 3
        canvas.width = w * scale
        canvas.height = h * scale
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

  async function handleExport(titleBlock: TitleBlockData, format: 'png' | 'pdf') {
    setShowTitleBlockForm(false)
    setExporting(true)
    try {
      const PAGE_W = 794
      const PAGE_H = 1123
      const safeName = `empalme-${featureName.replace(/\s+/g, '-')}`

      // ── Página 1: diagrama técnico SVG ────────────────────────────────────
      const svg1    = renderToStaticMarkup(<SpliceExportView card={card} titleBlock={titleBlock} />)
      const canvas1 = await svgToCanvas(svg1, PAGE_W, PAGE_H)

      if (format === 'png') {
        const link = document.createElement('a')
        link.download = `${safeName}.png`
        link.href = canvas1.toDataURL('image/png')
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        return
      }

      // ── PDF página 1: diagrama ────────────────────────────────────────────
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
      const pw  = pdf.internal.pageSize.getWidth()
      const ph  = pdf.internal.pageSize.getHeight()
      pdf.addImage(canvas1.toDataURL('image/png'), 'PNG', 0, 0, pw, ph)

      // ── PDF página 2: tabla descriptiva de empalmes ───────────────────────
      const svg2    = renderToStaticMarkup(
        <SpliceSummaryView card={card} titleBlock={titleBlock} featureName={featureName} />
      )
      const canvas2 = await svgToCanvas(svg2, PAGE_W, PAGE_H)
      pdf.addPage()
      pdf.addImage(canvas2.toDataURL('image/png'), 'PNG', 0, 0, pw, ph)

      pdf.save(`${safeName}.pdf`)

    } catch (err) {
      console.error('Export error:', err)
      alert('Error al exportar. Revisá la consola del navegador.')
    } finally {
      setExporting(false)
    }
  }

  function onSplitterMouseDown(e: React.MouseEvent, sp: Splitter, si: number) {
    e.stopPropagation()
    const svgEl = svgRef.current
    if (!svgEl) return
    const rect = svgEl.getBoundingClientRect()
    const pos = getSplitterPos(sp, splitters, si)
    dragRef.current = {
      splitterId: sp.id,
      offsetX: e.clientX - rect.left - pos.x,
      offsetY: e.clientY - rect.top - pos.y,
    }
    setDraggingId(sp.id)
  }

  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      if (dragRef.current && svgRef.current) {
        const rect = svgRef.current.getBoundingClientRect()
        const newX = Math.max(0, Math.min(SVG_W - SPLITTER_W, e.clientX - rect.left - dragRef.current.offsetX))
        const newY = Math.max(0, e.clientY - rect.top - dragRef.current.offsetY)
        const { splitterId } = dragRef.current
        setCard(prev => {
          const next = {
            ...prev,
            splitters: prev.splitters.map(s =>
              s.id === splitterId ? { ...s, posX: newX, posY: newY } : s
            ),
          }
          setTimeout(() => onChange(next), 0)
          return next
        })
      }
    }
    function onMouseUp() {
      dragRef.current = null
      setDraggingId(null)
    }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [onChange])

  useEffect(() => {
    if (!selectedConn || !svgRef.current || !bodyRef.current) return
    const from = getPortInfo(
      selectedConn.leftFiberId,
      leftCables, rightCables, bottomCables, splitters, portPos
    )
    const to = getPortInfo(
      selectedConn.rightFiberId,
      leftCables, rightCables, bottomCables, splitters, portPos
    )
    if (!from || !to) return
    const body = bodyRef.current
    const svgRect = svgRef.current.getBoundingClientRect()
    const bodyRect = body.getBoundingClientRect()
    const targetY = (from.y + to.y) / 2
    const targetX = (from.x + to.x) / 2
    const scrollTop = Math.max(
      0,
      body.scrollTop +
        (svgRect.top + targetY - bodyRect.top) -
        bodyRect.height / 2
    )
    const scrollLeft = Math.max(
      0,
      body.scrollLeft +
        (svgRect.left + targetX - bodyRect.left) -
        bodyRect.width / 2
    )
    window.requestAnimationFrame(() => {
      body.scrollTo({ top: scrollTop, left: scrollLeft, behavior: 'smooth' })
    })
  // portPos se omite a propósito: incluirlo genera un loop
  // scroll → measurePortPos → portPos cambia → re-scroll → loop infinito
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedConnId])

  const splitterMaxBottom = splitters.reduce((max, sp, i) => {
    const pos = getSplitterPos(sp, splitters, i)
    return Math.max(max, pos.y + splitterBoxH(sp) + 20)
  }, 0)
  const cableCanvasHeight = Math.max(
    totalCableH(leftCables),
    totalCableH(rightCables)
  )
  const svgH = Math.max(cableCanvasHeight + 200, splitterMaxBottom + 200, 800)
  const activeCount = card.connections.filter(c => c.active).length

  return (
    <>
    <div className="splice-overlay" onClick={dismiss}>
      <div className="splice-modal" onClick={e => e.stopPropagation()}>
        <div className="splice-header">
          <div>
            <h2>Carta de empalme</h2>
            <p className="splice-subtitle">{featureName}</p>
          </div>
          <div className="splice-header-actions">
            <button className="secondary small" onClick={() => setShowTemplatePicker(true)} title="Cargar una configuración pre-armada">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
                <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
              </svg>
              Plantillas
            </button>
            <button className="secondary small" onClick={() => setShowTitleBlockForm(true)} disabled={exporting} title="Exportar PNG o PDF">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
              {exporting ? 'Generando...' : 'Exportar'}
            </button>
            <button className="secondary" onClick={onClose}>
              Cerrar
            </button>
          </div>
        </div>

        <div className="splice-statusbar">
          {!pendingPort && !selectedConn && (
            <span className="splice-hint-text">
              Clic en fibra 1 → clic en fibra 2 para conectar
            </span>
          )}
          {pendingPort && (
            <span className="splice-hint-text selecting">
              Fibra seleccionada — clic en otra para conectar
              <button
                className="secondary small"
                onClick={dismiss}
                style={{ marginLeft: 10 }}
              >
                Cancelar
              </button>
            </span>
          )}
          {selectedConn && (
            <span className="splice-hint-text conn-selected">
              <button
                className="secondary small"
                onClick={() => toggleActive(selectedConn.id)}
              >
                {selectedConn.active ? '⏸ Desactivar' : '▶ Activar'}
              </button>
              <button
                className="danger small"
                onClick={() => deleteConn(selectedConn.id)}
              >
                Eliminar
              </button>
              <button className="secondary small" onClick={dismiss}>
                Deseleccionar
              </button>
            </span>
          )}
          <span className="splice-stats">
            {activeCount} activa(s) · {card.connections.length} total · {splitters.length} splitter(s)
          </span>
        </div>

        {card.cables.length === 0 && detectedEntrada.length === 0 && detectedSalida.length === 0 && (
          <div className="splice-empty-banner">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--fg3)', flexShrink: 0 }}>
              <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
              <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
            </svg>
            <div>
              <strong>Carta vacía</strong>
              <p>No se detectaron líneas de fibra conectadas a esta caja en el mapa. Podés comenzar desde una plantilla pre-armada o agregar cables manualmente.</p>
            </div>
            <button className="splice-autogen-btn-primary" onClick={() => setShowTemplatePicker(true)}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
                <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
              </svg>
              Elegir plantilla
            </button>
          </div>
        )}

        {card.cables.length === 0 && (detectedEntrada.length > 0 || detectedSalida.length > 0) && (
          <div className="splice-autogen-banner">
            <div className="splice-autogen-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><polyline points="8 12 12 16 16 12"/><line x1="12" y1="8" x2="12" y2="16"/>
              </svg>
            </div>
            <div className="splice-autogen-body">
              <strong>Topología detectada en el mapa</strong>
              <p>
                Se encontraron {detectedEntrada.length + detectedSalida.length} línea{detectedEntrada.length + detectedSalida.length !== 1 ? 's' : ''} conectadas geográficamente a esta caja:
                {[...detectedEntrada, ...detectedSalida].map(d => (
                  <span key={d.line.properties.id} className="splice-autogen-line-pill">
                    <span className={`det-dir-dot det-${d.direction}`} />
                    {d.line.properties.name || 'Sin nombre'}
                    {d.line.properties.fiberCount ? ` · ${d.line.properties.fiberCount}f` : ''}
                    {d.endpoint ? ` → ${d.endpoint.properties.name}` : ''}
                  </span>
                ))}
              </p>
              <p className="splice-autogen-sub">Los cables se crearán con el lado (entrada/salida) y la cantidad de fibras de cada línea. Solo restará hacer las fusiones.</p>
            </div>
            <div className="splice-autogen-actions">
              <button className="splice-autogen-btn-primary" onClick={syncCablesFromMap}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
                  <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
                </svg>
                Generar desde mapa
              </button>
              <button className="splice-autogen-btn-secondary" onClick={() => setShowTemplatePicker(true)}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
                  <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
                </svg>
                Usar plantilla
              </button>
            </div>
          </div>
        )}

        <div className="splice-body" ref={bodyRef}>
          <div className="splice-panel">
            <div className="splice-panel-hdr">
              <strong>Entrada</strong>
              <span className="splice-panel-hdr-actions">
                {(detectedEntrada.length > 0 || detectedSalida.length > 0) && (
                  <button
                    className="secondary small sync-btn"
                    title="Crear cables para todas las líneas detectadas en el mapa"
                    onClick={syncCablesFromMap}
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
                      <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
                    </svg>
                    Sincronizar desde mapa
                  </button>
                )}
                {addingCableSide !== 'left' ? (
                  <button className="secondary small" onClick={() => setAddingCableSide('left')}>+ Cable</button>
                ) : (
                  <AddCableForm onAdd={(n, c, fpb) => addCable('left', n, c, undefined, undefined, fpb)} onCancel={() => setAddingCableSide(null)} />
                )}
              </span>
            </div>
            <div className="splice-cables">
              {leftCables.length === 0 && detectedEntrada.length === 0 && (
                <p className="splice-empty">Sin cables</p>
              )}
              {detectedEntrada.length > 0 && (
                <div className="detected-lines-section">
                  <div className="detected-lines-hdr">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="8 12 12 16 16 12"/><line x1="12" y1="8" x2="12" y2="16"/></svg>
                    Líneas detectadas en el mapa — sin agregar aún
                  </div>
                  {detectedEntrada.map(d => (
                    <DetectedLineRow key={d.line.properties.id} line={d.line} direction={d.direction}
                      endpointFeature={d.endpoint}
                      onAdd={(count, side, fpb) => addCable(side, d.line.properties.name, count, d.line.properties.id, d.endpoint?.properties.id, fpb)}
                    />
                  ))}
                </div>
              )}
              {leftCables.map(cable => {
                const linkedLine = cable.linkedLineId ? allFeatures.find(f => f.properties.id === cable.linkedLineId) : undefined
                const linkedFeat = cable.linkedFeatureId ? allFeatures.find(f => f.properties.id === cable.linkedFeatureId) : undefined
                const isLinked = !!(cable.linkedLineId && cable.linkedFeatureId)
                const isPartial = !!(cable.linkedLineId || cable.linkedFeatureId) && !isLinked
                return (
                <div
                  key={cable.id}
                  className={`splice-cable${draggingCableId === cable.id ? ' cable-dragging' : ''}${dragOverCableId === cable.id && draggingCableId !== cable.id ? ' cable-drag-over' : ''}`}
                  draggable
                  onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; setDraggingCableId(cable.id) }}
                  onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOverCableId(cable.id) }}
                  onDrop={e => { e.preventDefault(); if (draggingCableId) reorderCable(draggingCableId, cable.id); setDragOverCableId(null) }}
                  onDragEnd={() => { setDraggingCableId(null); setDragOverCableId(null) }}
                >
                  <div className="splice-cable-hdr left">
                    <span className="cable-drag-handle" title="Arrastrar para reordenar">⠿</span>
                    <span className="cable-hdr-name">
                      {cable.name}
                      {cable.fibers.length > 1 && (
                        <small>
                          ({cable.fibers.length}f
                          {cable.fibersPerBuffer && cable.fibersPerBuffer < cable.fibers.length
                            ? ` · ${Math.ceil(cable.fibers.length / cable.fibersPerBuffer)}×${cable.fibersPerBuffer}f`
                            : ''})
                        </small>
                      )}
                    </span>
                    <span className="cable-hdr-actions">
                      {cable.fibers.filter(f => f.clientInfo?.onuPowerDbm).map(f => (
                        <span key={f.id} className={`fiber-power-badge ${getPowerClass(f.clientInfo!.onuPowerDbm)}`}
                          title={f.clientName || f.clientInfo?.name}>
                          {f.clientInfo!.onuPowerDbm}
                        </span>
                      ))}
                      <button
                        className={`secondary small link-status-btn ${isLinked ? 'link-ok' : isPartial ? 'link-partial' : 'link-missing'}`}
                        title={isLinked ? `Vinculado: ${linkedLine?.properties.name} → ${linkedFeat?.properties.name}` : 'Vincular al mapa (necesario para trazado óptico)'}
                        onClick={() => setLinkingCableId(linkingCableId === cable.id ? null : cable.id)}
                      >
                        {isLinked ? '✅' : isPartial ? '⚠️' : '🔗'}
                        <span className="link-status-label">
                          {isLinked ? (linkedFeat?.properties.name ?? 'Vinculado') : isPartial ? 'Incompleto' : 'Vincular'}
                        </span>
                      </button>
                      <button className="danger small" onClick={() => deleteCable(cable.id)}>✕</button>
                    </span>
                  </div>
                  {linkingCableId === cable.id && (
                    <CableLinkPicker
                      cable={cable}
                      linkableLines={linkableLines}
                      boxCoords={boxCoords}
                      endpointCandidates={endpointCandidates}
                      nodeFeatures={nodeFeatures}
                      onLink={(lineId, featId) => linkCableToMap(cable.id, lineId, featId)}
                      onUnlink={() => unlinkCableFromMap(cable.id)}
                    />
                  )}
                  {cable.fibers.length <= 12
                    ? cable.fibers.map(fiber => {
                        const conn = connOfPort(fiber.id)
                        return (
                          <FiberRow
                            key={fiber.id}
                            fiber={fiber}
                            side="left"
                            connected={!!conn}
                            selected={pendingPort === fiber.id}
                            connSelected={conn?.id === selectedConnId}
                            isClientCable={cable.fibers.length === 1}
                            onClick={() => handlePortClick(fiber.id)}
                            onLabelChange={label => updateFiberLabel(cable.id, fiber.id, label)}
                            onOpenClient={() => setClientModalTarget({ cableId: cable.id, fiberId: fiber.id })}
                            onTrace={onTraceClient ? () => onTraceClient(fiber.id) : undefined}
                          />
                        )
                      })
                    : chunkFibers(cable.fibers, cable.fibersPerBuffer ?? 12).map((bufFibers, bi) => (
                        <BufferGroup
                          key={bi}
                          bufferIndex={bi}
                          fibers={bufFibers}
                          side="left"
                          connections={card.connections}
                          pendingPort={pendingPort}
                          selectedConnId={selectedConnId}
                          isClientCable={cable.fibers.length === 1}
                          onPortClick={handlePortClick}
                          onLabelChange={(fid, lbl) => updateFiberLabel(cable.id, fid, lbl)}
                          onOpenClient={fid => setClientModalTarget({ cableId: cable.id, fiberId: fid })}
                          onTrace={onTraceClient ? fid => onTraceClient(fid) : undefined}
                        />
                      ))
                  }
                </div>
                )
              })}
            </div>
          </div>

          <div className="splice-svg-wrap">
            <svg
              ref={svgRef}
              width={SVG_W}
              height={svgH}
              className="splice-svg"
              style={{ display: 'block', overflow: 'visible' }}
              onClick={dismiss}
            >
              <defs>
                <filter id="glow">
                  <feGaussianBlur stdDeviation="3" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>

              {splitters.map((sp, si) => {
                const pos = getSplitterPos(sp, splitters, si)
                const boxH = splitterBoxH(sp)
                const inputY = pos.y + SPLITTER_HDR_H + SPLITTER_PORT_H / 2
                const isDragging = draggingId === sp.id
                const inputConn = connOfPort(sp.inputPortId)

                return (
                  <g key={sp.id}>
                    <rect
                      x={pos.x}
                      y={pos.y}
                      width={SPLITTER_W}
                      height={SPLITTER_HDR_H}
                      fill={isDragging ? '#1e4080' : '#0d2044'}
                      stroke="#3b82f6"
                      strokeWidth={isDragging ? 2 : 1.5}
                      rx={5}
                      ry={5}
                      style={{ cursor: 'grab' }}
                      onMouseDown={e => onSplitterMouseDown(e, sp, si)}
                      onClick={e => e.stopPropagation()}
                    />
                    <rect
                      x={pos.x}
                      y={pos.y + SPLITTER_HDR_H}
                      width={SPLITTER_W}
                      height={boxH - SPLITTER_HDR_H}
                      fill="#0a1628"
                      stroke="#3b82f6"
                      strokeWidth={1.5}
                      style={{ pointerEvents: 'none' }}
                    />
                    <text
                      x={pos.x + SPLITTER_W / 2}
                      y={pos.y + 17}
                      textAnchor="middle"
                      fill="#93c5fd"
                      fontSize={9}
                      fontWeight="bold"
                      style={{ pointerEvents: 'none', userSelect: 'none' }}
                    >
                      1×{sp.ratio} {sp.name}
                    </text>
                    <text
                      x={pos.x + SPLITTER_W - 4}
                      y={pos.y + 12}
                      textAnchor="end"
                      fill="#f87171"
                      fontSize={11}
                      style={{ cursor: 'pointer', userSelect: 'none' }}
                      onClick={e => {
                        e.stopPropagation()
                        deleteSplitter(sp.id)
                      }}
                    >
                      ✕
                    </text>
                    <circle
                      cx={pos.x}
                      cy={inputY}
                      r={5}
                      fill={
                        inputConn
                          ? '#059669'
                          : pendingPort === sp.inputPortId
                            ? '#f59e0b'
                            : '#3b82f6'
                      }
                      stroke="white"
                      strokeWidth={1}
                      style={{ cursor: 'pointer' }}
                      onClick={e => {
                        e.stopPropagation()
                        handlePortClick(sp.inputPortId)
                      }}
                    />
                    {sp.outputPortIds.map((portId, oi) => {
                      const outY =
                        pos.y +
                        SPLITTER_HDR_H +
                        (1 + oi) * SPLITTER_PORT_H +
                        SPLITTER_PORT_H / 2
                      const outConn = connOfPort(portId)
                      return (
                        <circle
                          key={portId}
                          cx={pos.x + SPLITTER_W}
                          cy={outY}
                          r={5}
                          fill={
                            outConn
                              ? '#059669'
                              : pendingPort === portId
                                ? '#f59e0b'
                                : '#34d399'
                          }
                          stroke="white"
                          strokeWidth={1}
                          style={{ cursor: 'pointer' }}
                          onClick={e => {
                            e.stopPropagation()
                            handlePortClick(portId)
                          }}
                        />
                      )
                    })}
                  </g>
                )
              })}

              {card.connections.map(conn => {
                const from = getPortInfo(
                  conn.leftFiberId,
                  leftCables, rightCables, bottomCables, splitters, portPos
                )
                const to = getPortInfo(
                  conn.rightFiberId,
                  leftCables, rightCables, bottomCables, splitters, portPos
                )
                if (!from || !to) return null
                const d = bezierPath(from.x, from.y, to.x, to.y)
                const isSel = conn.id === selectedConnId
                return (
                  <g key={conn.id}>
                    <path
                      d={d}
                      fill="none"
                      stroke="transparent"
                      strokeWidth={16}
                      style={{ cursor: 'pointer' }}
                      onClick={e => {
                        e.stopPropagation()
                        setSelectedConnId(conn.id)
                      }}
                    />
                    <path
                      d={d}
                      fill="none"
                      stroke={isSel ? '#f59e0b' : from.color}
                      strokeWidth={conn.active ? 8 : 3}
                      strokeOpacity={isSel ? 1 : conn.active ? 0.9 : 0.4}
                      strokeDasharray={conn.active ? undefined : '5 5'}
                      filter={isSel ? 'url(#glow)' : undefined}
                    />
                    {conn.active && (
                      <path
                        d={d}
                        fill="none"
                        stroke={from.color}
                        strokeWidth={8}
                        className="fiber-flow"
                        strokeDasharray="10 7"
                      />
                    )}
                    {conn.active && (
                      <path
                        d={d}
                        fill="none"
                        stroke="white"
                        strokeWidth={8}
                        strokeLinecap="round"
                        className="fiber-pulse"
                        strokeDasharray="5 600"
                        filter="url(#glow)"
                        style={{ pointerEvents: 'none' }}
                      />
                    )}
                  </g>
                )
              })}
            </svg>

            {/* ── Panel inferior: cables de salida en la parte baja ── */}
            {(bottomCables.length > 0 || addingCableSide === 'bottom') && (
              <div className="splice-bottom-panel">
                <div className="splice-bottom-panel-hdr">
                  <strong>Salida (inferior)</strong>
                  {addingCableSide !== 'bottom'
                    ? <button className="secondary small" onClick={() => setAddingCableSide('bottom')}>+ Cable</button>
                    : <AddCableForm onAdd={(n, c, fpb) => addCable('bottom', n, c, undefined, undefined, fpb)} onCancel={() => setAddingCableSide(null)} />
                  }
                </div>
                <div className="splice-bottom-cables">
                  {bottomCables.map(cable => {
                    const isLinked = !!(cable.linkedLineId && cable.linkedFeatureId)
                    const isPartial = !!(cable.linkedLineId || cable.linkedFeatureId) && !isLinked
                    return (
                    <div
                      key={cable.id}
                      className={`splice-cable splice-cable-bot${draggingCableId === cable.id ? ' cable-dragging' : ''}${dragOverCableId === cable.id && draggingCableId !== cable.id ? ' cable-drag-over' : ''}`}
                      draggable
                      onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; setDraggingCableId(cable.id) }}
                      onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOverCableId(cable.id) }}
                      onDrop={e => { e.preventDefault(); if (draggingCableId) reorderCable(draggingCableId, cable.id); setDragOverCableId(null) }}
                      onDragEnd={() => { setDraggingCableId(null); setDragOverCableId(null) }}
                    >
                      <div className="splice-cable-hdr bottom">
                        <span className="cable-drag-handle" title="Arrastrar para reordenar">⠿</span>
                        <span className="cable-hdr-name" title={cable.name}>
                          {cable.name}
                          {cable.fibers.length > 1 && (
                            <small>
                              ({cable.fibers.length}f
                              {cable.fibersPerBuffer && cable.fibersPerBuffer < cable.fibers.length
                                ? ` · ${Math.ceil(cable.fibers.length / cable.fibersPerBuffer)}×${cable.fibersPerBuffer}f`
                                : ''})
                            </small>
                          )}
                        </span>
                        <span className="cable-hdr-actions">
                          <button
                            className={`secondary small link-status-btn ${isLinked ? 'link-ok' : isPartial ? 'link-partial' : 'link-missing'}`}
                            onClick={() => setLinkingCableId(linkingCableId === cable.id ? null : cable.id)}
                          >
                            {isLinked ? '✅' : isPartial ? '⚠️' : '🔗'}
                          </button>
                          <button className="secondary small" title="Mover al panel derecho" onClick={() => moveCableToSide(cable.id, 'right')}>→</button>
                          <button className="danger small" onClick={() => deleteCable(cable.id)}>✕</button>
                        </span>
                      </div>
                      {linkingCableId === cable.id && (
                        <CableLinkPicker
                          cable={cable}
                          linkableLines={linkableLines}
                          boxCoords={boxCoords}
                          endpointCandidates={endpointCandidates}
                          nodeFeatures={nodeFeatures}
                          onLink={(lineId, featId) => linkCableToMap(cable.id, lineId, featId)}
                          onUnlink={() => unlinkCableFromMap(cable.id)}
                        />
                      )}
                      <div className="splice-bottom-fibers">
                        {chunkFibers(cable.fibers, cable.fibersPerBuffer ?? cable.fibers.length).map((bufFibers, bi) => (
                          <div
                            key={bi}
                            className="bottom-buffer-chunk"
                            style={{ borderLeftColor: FIBER_HEX[COLOR_SEQ[bi % 12]] }}
                          >
                            {bufFibers.map(fiber => {
                              const conn = connOfPort(fiber.id)
                              return (
                                <FiberRow
                                  key={fiber.id}
                                  fiber={fiber}
                                  side="bottom"
                                  connected={!!conn}
                                  selected={pendingPort === fiber.id}
                                  connSelected={conn?.id === selectedConnId}
                                  isClientCable={cable.fibers.length === 1}
                                  onClick={() => handlePortClick(fiber.id)}
                                  onLabelChange={label => updateFiberLabel(cable.id, fiber.id, label)}
                                  onOpenClient={() => setClientModalTarget({ cableId: cable.id, fiberId: fiber.id })}
                                  onTrace={onTraceClient ? () => onTraceClient(fiber.id) : undefined}
                                />
                              )
                            })}
                          </div>
                        ))}
                      </div>
                    </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          <div className="splice-panel">
            <div className="splice-panel-hdr">
              <strong>Salida</strong>
              <div className="splice-panel-actions">
                {addingCableSide !== 'right' ? (
                  <button className="secondary small" onClick={() => setAddingCableSide('right')}>+ Cable</button>
                ) : (
                  <AddCableForm onAdd={(n, c, fpb) => addCable('right', n, c, undefined, undefined, fpb)} onCancel={() => setAddingCableSide(null)} />
                )}
                {!addingSplitter && (
                  <button className="secondary small" onClick={() => setAddingSplitter(true)}>+ Splitter</button>
                )}
                <button
                  className="secondary small"
                  title="Agregar cable al panel inferior"
                  onClick={() => setAddingCableSide('bottom')}
                >+ ↓</button>
              </div>
            </div>
            {addingSplitter && (
              <div style={{ padding: '8px' }}>
                <AddSplitterForm onAdd={addSplitter} onCancel={() => setAddingSplitter(false)} />
              </div>
            )}
            <div className="splice-cables">
              {rightCables.length === 0 && detectedSalida.length === 0 && (
                <p className="splice-empty">Sin cables</p>
              )}
              {detectedSalida.length > 0 && (
                <div className="detected-lines-section">
                  <div className="detected-lines-hdr">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="8 12 12 16 16 12"/><line x1="12" y1="8" x2="12" y2="16"/></svg>
                    Líneas detectadas en el mapa — sin agregar aún
                  </div>
                  {detectedSalida.map(d => (
                    <DetectedLineRow key={d.line.properties.id} line={d.line} direction={d.direction}
                      endpointFeature={d.endpoint}
                      onAdd={(count, side, fpb) => addCable(side, d.line.properties.name, count, d.line.properties.id, d.endpoint?.properties.id, fpb)}
                    />
                  ))}
                </div>
              )}
              {rightCables.map(cable => {
                const linkedLine = cable.linkedLineId ? allFeatures.find(f => f.properties.id === cable.linkedLineId) : undefined
                const linkedFeat = cable.linkedFeatureId ? allFeatures.find(f => f.properties.id === cable.linkedFeatureId) : undefined
                const isLinked = !!(cable.linkedLineId && cable.linkedFeatureId)
                const isPartial = !!(cable.linkedLineId || cable.linkedFeatureId) && !isLinked
                return (
                <div
                  key={cable.id}
                  className={`splice-cable${draggingCableId === cable.id ? ' cable-dragging' : ''}${dragOverCableId === cable.id && draggingCableId !== cable.id ? ' cable-drag-over' : ''}`}
                  draggable
                  onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; setDraggingCableId(cable.id) }}
                  onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOverCableId(cable.id) }}
                  onDrop={e => { e.preventDefault(); if (draggingCableId) reorderCable(draggingCableId, cable.id); setDragOverCableId(null) }}
                  onDragEnd={() => { setDraggingCableId(null); setDragOverCableId(null) }}
                >
                  <div className="splice-cable-hdr right">
                    <span className="cable-hdr-actions">
                      <button className="danger small" onClick={() => deleteCable(cable.id)}>✕</button>
                      <button className="secondary small" title="Mover al panel inferior" onClick={() => moveCableToSide(cable.id, 'bottom')}>⬇</button>
                      <button
                        className={`secondary small link-status-btn ${isLinked ? 'link-ok' : isPartial ? 'link-partial' : 'link-missing'}`}
                        title={isLinked ? `Vinculado: ${linkedLine?.properties.name} → ${linkedFeat?.properties.name}` : 'Vincular al mapa (necesario para trazado óptico)'}
                        onClick={() => setLinkingCableId(linkingCableId === cable.id ? null : cable.id)}
                      >
                        <span className="link-status-label">
                          {isLinked ? (linkedFeat?.properties.name ?? 'Vinculado') : isPartial ? 'Incompleto' : 'Vincular'}
                        </span>
                        {isLinked ? '✅' : isPartial ? '⚠️' : '🔗'}
                      </button>
                      {cable.fibers.filter(f => f.clientInfo?.onuPowerDbm).map(f => (
                        <span key={f.id} className={`fiber-power-badge ${getPowerClass(f.clientInfo!.onuPowerDbm)}`}
                          title={f.clientName || f.clientInfo?.name}>
                          {f.clientInfo!.onuPowerDbm}
                        </span>
                      ))}
                    </span>
                    <span className="cable-hdr-name">
                      {cable.name}
                      {cable.fibers.length > 1 && (
                        <small>
                          ({cable.fibers.length}f
                          {cable.fibersPerBuffer && cable.fibersPerBuffer < cable.fibers.length
                            ? ` · ${Math.ceil(cable.fibers.length / cable.fibersPerBuffer)}×${cable.fibersPerBuffer}f`
                            : ''})
                        </small>
                      )}
                    </span>
                    <span className="cable-drag-handle" title="Arrastrar para reordenar">⠿</span>
                  </div>
                  {linkingCableId === cable.id && (
                    <CableLinkPicker
                      cable={cable}
                      linkableLines={linkableLines}
                      boxCoords={boxCoords}
                      endpointCandidates={endpointCandidates}
                      nodeFeatures={nodeFeatures}
                      onLink={(lineId, featId) => linkCableToMap(cable.id, lineId, featId)}
                      onUnlink={() => unlinkCableFromMap(cable.id)}
                    />
                  )}
                  {cable.fibers.length <= 12
                    ? cable.fibers.map(fiber => {
                        const conn = connOfPort(fiber.id)
                        return (
                          <FiberRow
                            key={fiber.id}
                            fiber={fiber}
                            side="right"
                            connected={!!conn}
                            selected={pendingPort === fiber.id}
                            connSelected={conn?.id === selectedConnId}
                            isClientCable={cable.fibers.length === 1}
                            onClick={() => handlePortClick(fiber.id)}
                            onLabelChange={label => updateFiberLabel(cable.id, fiber.id, label)}
                            onOpenClient={() => setClientModalTarget({ cableId: cable.id, fiberId: fiber.id })}
                            onTrace={onTraceClient ? () => onTraceClient(fiber.id) : undefined}
                          />
                        )
                      })
                    : chunkFibers(cable.fibers, cable.fibersPerBuffer ?? 12).map((bufFibers, bi) => (
                        <BufferGroup
                          key={bi}
                          bufferIndex={bi}
                          fibers={bufFibers}
                          side="right"
                          connections={card.connections}
                          pendingPort={pendingPort}
                          selectedConnId={selectedConnId}
                          isClientCable={cable.fibers.length === 1}
                          onPortClick={handlePortClick}
                          onLabelChange={(fid, lbl) => updateFiberLabel(cable.id, fid, lbl)}
                          onOpenClient={fid => setClientModalTarget({ cableId: cable.id, fiberId: fid })}
                          onTrace={onTraceClient ? fid => onTraceClient(fid) : undefined}
                        />
                      ))
                  }
                </div>
              )
              })}
            </div>
          </div>
        </div>

        <div className="splice-legend">
          <span className="leg-item">
            <span className="leg-line inactive" />
            Inactiva
          </span>
          <span className="leg-item">
            <span className="leg-line active" />
            Activa
          </span>
          <span className="leg-item">
            <span className="leg-dot sel" />
            Seleccionada
          </span>
        </div>
      </div>
    </div>

    {showTitleBlockForm && (
      <TitleBlockFormModal
        defaults={{ titulo: featureName, proyecto: projectName, subProyecto: subProjectName }}
        mapMeta={{ lat: -31.42, lng: -64.19, zoom: 15 }}
        onExport={handleExport}
        onClose={() => setShowTitleBlockForm(false)}
      />
    )}

    {showTemplatePicker && (
      <SpliceTemplatePicker
        hasExistingData={card.cables.length > 0}
        onApply={card => { update(card); setShowTemplatePicker(false) }}
        onClose={() => setShowTemplatePicker(false)}
      />
    )}

    {clientModalTarget && (() => {
      const cable = card.cables.find(c => c.id === clientModalTarget.cableId)
      const fiber = cable?.fibers.find(f => f.id === clientModalTarget.fiberId)
      if (!cable || !fiber) return null
      return (
        <ClientModal
          cableName={cable.name}
          fiberLabel={`F${fiber.index} ${fiber.color}`}
          clientInfo={fiber.clientInfo ?? { name: fiber.clientName ?? '' }}
          zabbixConfig={zabbixConfig}
          zabbixOltHosts={zabbixOltHosts}
          onSave={info => updateClientInfo(cable.id, fiber.id, info)}
          onClose={() => setClientModalTarget(null)}
        />
      )
    })()}
    </>
  )
})

export default SpliceCardModal
