import type { ReactNode } from 'react'
import type { RackPanel, RackPort, RackPortStatus } from './types'
import type { RackTemplate } from './rackTemplates'

// ── Viewport ───────────────────────────────────────────────────────────────
const W  = 440
const H  = 50
const EW = 18   // ear width
const BW = 32   // brand strip width
const CX = EW + BW + 4  // content start X = 54

// ── Brand palette ──────────────────────────────────────────────────────────
const BRAND: Record<string, { bg: string; hi: string; text: string }> = {
  Huawei:    { bg: '#a80018', hi: '#e0002a', text: '#fff' },
  ZTE:       { bg: '#c44a00', hi: '#ff6600', text: '#fff' },
  Fiberhome: { bg: '#004aaa', hi: '#1a6aff', text: '#fff' },
  Nokia:     { bg: '#0f3880', hi: '#1a55cc', text: '#fff' },
  Calix:     { bg: '#440088', hi: '#6600cc', text: '#fff' },
  'V-SOL':   { bg: '#005533', hi: '#008855', text: '#fff' },
  Parks:     { bg: '#663300', hi: '#995500', text: '#fff' },
  Mikrotik:  { bg: '#880000', hi: '#bb0000', text: '#fff' },
  Cisco:     { bg: '#1a4f8a', hi: '#1f66bb', text: '#fff' },
  'TP-Link': { bg: '#2d6600', hi: '#449900', text: '#fff' },
  Ubiquiti:  { bg: '#0040b0', hi: '#0055ff', text: '#fff' },
  Genérico:  { bg: '#253040', hi: '#3a4f66', text: '#ccc' },
}
function brd(b: string) { return BRAND[b] ?? BRAND['Genérico'] }

// ── Status ─────────────────────────────────────────────────────────────────
const SF: Record<RackPortStatus, string> = {
  free: '#091420', active: '#0d3d1e', reserved: '#4a2000',
}
const SL: Record<RackPortStatus, string> = {
  free: '#1e3a5f', active: '#4ade80', reserved: '#f59e0b',
}

// ── Shared SVG wrapper ─────────────────────────────────────────────────────
function RackSvg({ children, extra }: { children: ReactNode; extra?: ReactNode }) {
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%"
      preserveAspectRatio="xMidYMid meet"
      style={{ display: 'block', position: 'absolute', inset: 0 }}>
      <defs>
        <linearGradient id="rsvg-bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3d4a5c" />
          <stop offset="50%" stopColor="#252d3a" />
          <stop offset="100%" stopColor="#161d28" />
        </linearGradient>
        <linearGradient id="rsvg-ear" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#4a4a4a" />
          <stop offset="100%" stopColor="#1c1c1c" />
        </linearGradient>
        <filter id="rsvg-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="1.2" result="b"/>
          <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
        {extra}
      </defs>
      {/* Chassis */}
      <rect width={W} height={H} rx={2} fill="url(#rsvg-bg)" />
      <rect width={W} height={2} rx={1} fill="#555" opacity={0.5} />
      <rect y={H-1} width={W} height={1} rx={0} fill="#111" opacity={0.5} />
      {children}
    </svg>
  )
}

// ── Rack ears ──────────────────────────────────────────────────────────────
function Ears() {
  return <>
    <rect x={0} y={0} width={EW} height={H} rx={2} fill="url(#rsvg-ear)" />
    <circle cx={EW/2} cy={7}   r={3} fill="#0d0d0d" stroke="#444" strokeWidth={0.8} />
    <circle cx={EW/2} cy={7}   r={1.2} fill="#2a2a2a" />
    <circle cx={EW/2} cy={H-7} r={3} fill="#0d0d0d" stroke="#444" strokeWidth={0.8} />
    <circle cx={EW/2} cy={H-7} r={1.2} fill="#2a2a2a" />
    <rect x={W-EW} y={0} width={EW} height={H} rx={2} fill="url(#rsvg-ear)" />
    <circle cx={W-EW/2} cy={7}   r={3} fill="#0d0d0d" stroke="#444" strokeWidth={0.8} />
    <circle cx={W-EW/2} cy={7}   r={1.2} fill="#2a2a2a" />
    <circle cx={W-EW/2} cy={H-7} r={3} fill="#0d0d0d" stroke="#444" strokeWidth={0.8} />
    <circle cx={W-EW/2} cy={H-7} r={1.2} fill="#2a2a2a" />
  </>
}

// ── Brand strip ────────────────────────────────────────────────────────────
function BrandStrip({ brand }: { brand: string }) {
  const c   = brd(brand)
  const bid = `bs-${brand.replace(/[^a-z]/gi, '')}`
  return <>
    <defs>
      <linearGradient id={bid} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={c.hi} />
        <stop offset="100%" stopColor={c.bg} />
      </linearGradient>
    </defs>
    <rect x={EW} y={0} width={BW} height={H} fill={`url(#${bid})`} />
    <rect x={EW+BW} y={0} width={2} height={H} fill="rgba(0,0,0,0.35)" />
    <text x={EW + BW/2} y={H/2 + 2.5} textAnchor="middle" fontSize={6.5}
      fontWeight="bold" fill={c.text}
      transform={`rotate(-90,${EW+BW/2},${H/2})`}
      style={{ letterSpacing: '0.08em', fontFamily: 'Arial,sans-serif', pointerEvents: 'none' }}>
      {brand.toUpperCase()}
    </text>
  </>
}

// ── Interactive port ────────────────────────────────────────────────────────
type Shape = 'sfp' | 'rj45' | 'sc' | 'lc' | 'dot'
interface IPortProps {
  port: RackPort; x: number; y: number; w: number; h: number; shape: Shape
  isPon?: boolean; pending: boolean; connSel: boolean
  onPortClick: (p: RackPort) => void
  onRightClick: (p: RackPort, cx: number, cy: number) => void
}
function IPort({ port, x, y, w, h, shape, isPon, pending, connSel, onPortClick, onRightClick }: IPortProps) {
  const fill   = SF[port.status]
  const led    = SL[port.status]
  const stroke = pending ? '#fbbf24' : connSel ? '#f59e0b' : '#1e3a5f'
  const sw     = pending || connSel ? 1.8 : 0.7
  const r      = h / 2  // for dot shape

  return (
    <g data-port-id={port.id} style={{ cursor: 'pointer' }}
      onClick={e => { e.stopPropagation(); onPortClick(port) }}
      onContextMenu={e => { e.preventDefault(); e.stopPropagation(); onRightClick(port, e.clientX, e.clientY) }}>

      {shape === 'dot'
        ? <>
            <circle cx={x+r} cy={y+r} r={r} fill={fill} stroke={stroke} strokeWidth={sw} />
            <circle cx={x+r} cy={y+r} r={r*0.5} fill={led} />
            {port.status !== 'free' && <circle cx={x+r} cy={y+r} r={r*0.5} fill={led} filter="url(#rsvg-glow)" opacity={0.7} />}
          </>
        : <>
            <rect x={x} y={y} width={w} height={h} rx={1.5} fill={fill} stroke={stroke} strokeWidth={sw} />
            {shape === 'sfp' && <>
              <rect x={x+1.5} y={y+1.5} width={w-3} height={h-3} rx={1} fill="#04080f" stroke="#0d1f35" strokeWidth={0.4} />
              <circle cx={x+w/2} cy={y+h/2} r={1.6} fill={led} />
              {port.status !== 'free' && <circle cx={x+w/2} cy={y+h/2} r={1.6} fill={led} filter="url(#rsvg-glow)" opacity={0.6} />}
            </>}
            {shape === 'rj45' && <>
              <rect x={x+1.5} y={y+1.5} width={w-3} height={h-3} rx={0.5} fill="#04080f" />
              {[0,1.2,2.4,3.6,4.8].map((dx, i) => (
                <line key={i} x1={x+2+dx} y1={y+1.5} x2={x+2+dx} y2={y+h-2}
                  stroke={port.status === 'active' ? '#4ade80' : '#1e3a5f'} strokeWidth={0.5} />
              ))}
            </>}
            {shape === 'sc' && <>
              <rect x={x+1.5} y={y+1.5} width={w-3} height={h*0.6} rx={0.8} fill="#04080f" stroke={stroke} strokeWidth={0.3} />
              <circle cx={x+w/2} cy={y+h*0.38} r={2} fill={led} />
              {port.status !== 'free' && <circle cx={x+w/2} cy={y+h*0.38} r={2} fill={led} filter="url(#rsvg-glow)" opacity={0.5} />}
            </>}
            {shape === 'lc' && <>
              <circle cx={x+w/2} cy={y+h*0.4} r={3} fill="#04080f" stroke={stroke} strokeWidth={0.3} />
              <circle cx={x+w/2} cy={y+h*0.4} r={1.5} fill={led} />
              {port.status !== 'free' && <circle cx={x+w/2} cy={y+h*0.4} r={1.5} fill={led} filter="url(#rsvg-glow)" opacity={0.5} />}
            </>}
            {/* Status LED */}
            <circle cx={x+w-2} cy={y+2} r={1.3} fill={led} />
            {isPon && !!port.zabbixItemKey && <circle cx={x+2} cy={y+2} r={1} fill="#60a5fa" />}
          </>
      }
      <text x={x+w/2} y={y+h+5} textAnchor="middle" fontSize={4} fill="#374151"
        style={{ fontFamily: 'monospace', pointerEvents: 'none' }}>{port.index}</text>
    </g>
  )
}

// ── Static port (visual-only for template picker) ──────────────────────────
function SPort({ x, y, w, h, shape, lit = false, color = '#22c55e' }: {
  x: number; y: number; w: number; h: number; shape: Shape; lit?: boolean; color?: string
}) {
  const r = h / 2
  if (shape === 'dot') return <>
    <circle cx={x+r} cy={y+r} r={r} fill="#091420" stroke="#1e3a5f" strokeWidth={0.7} />
    <circle cx={x+r} cy={y+r} r={r*0.5} fill={lit ? color : '#1e3a5f'} />
  </>
  return <>
    <rect x={x} y={y} width={w} height={h} rx={1.5} fill="#091420" stroke="#1e3a5f" strokeWidth={0.7} />
    {shape === 'sfp' && <>
      <rect x={x+1.5} y={y+1.5} width={w-3} height={h-3} rx={1} fill="#04080f" />
      <circle cx={x+w/2} cy={y+h/2} r={1.6} fill={lit ? color : '#1e3a5f'} />
    </>}
    {shape === 'rj45' && <>
      <rect x={x+1.5} y={y+1.5} width={w-3} height={h-3} rx={0.5} fill="#04080f" />
      {[0,1.2,2.4,3.6,4.8].map((dx, i) => (
        <line key={i} x1={x+2+dx} y1={y+1.5} x2={x+2+dx} y2={y+h-2}
          stroke={lit ? color : '#1e3a5f'} strokeWidth={0.5} />
      ))}
    </>}
    {shape === 'sc' && <>
      <rect x={x+1.5} y={y+1.5} width={w-3} height={h*0.6} rx={0.8} fill="#04080f" />
      <circle cx={x+w/2} cy={y+h*0.38} r={2} fill={lit ? color : '#1e3a5f'} />
    </>}
    {shape === 'lc' && <>
      <circle cx={x+w/2} cy={y+h*0.4} r={3} fill="#04080f" />
      <circle cx={x+w/2} cy={y+h*0.4} r={1.5} fill={lit ? color : '#1e3a5f'} />
    </>}
  </>
}

// ── LED indicator ──────────────────────────────────────────────────────────
function Led({ cx, cy, color, label }: { cx: number; cy: number; color: string; label?: string }) {
  return <>
    <circle cx={cx} cy={cy} r={2.5} fill={color} filter="url(#rsvg-glow)" />
    <circle cx={cx} cy={cy} r={1.5} fill={color} />
    {label && <text x={cx} y={cy+8} textAnchor="middle" fontSize={4} fill="#475569"
      style={{ pointerEvents: 'none' }}>{label}</text>}
  </>
}

// ── Callback helpers ───────────────────────────────────────────────────────
interface CBs {
  pendingPortId: string | null
  connectedPortIds: Set<string>
  onPortClick: (p: RackPort) => void
  onRightClick: (p: RackPort, cx: number, cy: number) => void
}
function cb(cbs: CBs, port: RackPort) {
  return {
    pending: cbs.pendingPortId === port.id,
    connSel: cbs.connectedPortIds.has(port.id),
    onPortClick: cbs.onPortClick,
    onRightClick: cbs.onRightClick,
  }
}

// ── OLT ───────────────────────────────────────────────────────────────────
const OLT_PW = 11; const OLT_PH = 9; const OLT_GAP = 13
function OltContent({ brand, model, heightU, pon, uplinks, interactive, cbs, ponPorts, ulPorts }: {
  brand: string; model: string; heightU: number; pon: number; uplinks: number
  interactive?: boolean; cbs?: CBs; ponPorts?: RackPort[]; ulPorts?: RackPort[]
}) {
  const cols = Math.min(pon, 8)
  const rows = Math.ceil(pon / 8)
  const PY   = rows > 1 ? 10 : 18
  const ulX  = W - EW - uplinks * OLT_GAP - 4

  return (
    <RackSvg>
      <Ears /><BrandStrip brand={brand} />

      {/* Model */}
      <text x={CX} y={9} fontSize={6.5} fontWeight="bold" fill="#94a3b8"
        style={{ fontFamily: 'Arial,sans-serif', pointerEvents: 'none' }}>{model}</text>

      {/* LCD */}
      <rect x={CX} y={11} width={36} height={12} rx={1.5} fill="#0a1a0a" stroke="#1a3a1a" strokeWidth={0.6} />
      <rect x={CX+1.5} y={12.5} width={33} height={9} rx={1} fill="#0d2010" />
      <text x={CX+18} y={19.5} textAnchor="middle" fontSize={5.5} fill="#4ade80"
        style={{ fontFamily: 'monospace', pointerEvents: 'none' }}>GPON ✓</text>

      {/* LEDs */}
      <Led cx={CX+44} cy={15} color="#22c55e" label="PWR" />
      <Led cx={CX+54} cy={15} color="#f59e0b" label="ALM" />

      {/* PON label + ports */}
      <text x={CX+65} y={11} fontSize={5} fill="#60a5fa"
        style={{ fontFamily: 'Arial,sans-serif', pointerEvents: 'none' }}>GPON</text>
      {Array.from({ length: pon }, (_, i) => {
        const col = i % cols; const row = Math.floor(i / cols)
        const px = CX + 65 + col * OLT_GAP
        const py = PY + row * (OLT_PH + 3)
        return interactive && ponPorts?.[i] && cbs
          ? <IPort key={i} port={ponPorts[i]} x={px} y={py} w={OLT_PW} h={OLT_PH} shape="sfp" isPon {...cb(cbs, ponPorts[i])} />
          : <SPort key={i} x={px} y={py} w={OLT_PW} h={OLT_PH} shape="sfp" lit={i%3!==2} />
      })}

      {/* Uplink label + ports */}
      <text x={ulX} y={11} fontSize={5} fill="#60a5fa"
        style={{ fontFamily: 'Arial,sans-serif', pointerEvents: 'none' }}>UPL</text>
      {Array.from({ length: uplinks }, (_, i) => {
        const px = ulX + i * OLT_GAP
        return interactive && ulPorts?.[i] && cbs
          ? <IPort key={i} port={ulPorts[i]} x={px} y={14} w={OLT_PW} h={OLT_PH} shape="sfp" {...cb(cbs, ulPorts[i])} />
          : <SPort key={i} x={px} y={14} w={OLT_PW} h={OLT_PH} shape="sfp" lit color="#60a5fa" />
      })}

      {/* U badge */}
      <rect x={CX} y={H-11} width={14} height={8} rx={1.5} fill="#1e3a5f" />
      <text x={CX+7} y={H-5} textAnchor="middle" fontSize={5.5} fill="#60a5fa" fontWeight="bold"
        style={{ pointerEvents: 'none' }}>{heightU}U</text>
    </RackSvg>
  )
}

// ── Switch ─────────────────────────────────────────────────────────────────
const SW_PW = 10; const SW_PH = 8; const SW_GAP = 12
function SwitchContent({ brand, model, access, uplinks, interactive, cbs, accPorts, ulPorts }: {
  brand: string; model: string; access: number; uplinks: number
  interactive?: boolean; cbs?: CBs; accPorts?: RackPort[]; ulPorts?: RackPort[]
}) {
  const cols = Math.min(access, 24)
  const rows = Math.ceil(access / 24)
  const PY   = rows > 1 ? 10 : 18
  const ulX  = W - EW - uplinks * SW_GAP - 4

  return (
    <RackSvg>
      <Ears /><BrandStrip brand={brand} />
      <text x={CX} y={9} fontSize={6.5} fontWeight="bold" fill="#94a3b8"
        style={{ fontFamily: 'Arial,sans-serif', pointerEvents: 'none' }}>{model}</text>
      <Led cx={CX+60} cy={8} color="#22c55e" label="PWR" />
      <Led cx={CX+70} cy={8} color="#22c55e" label="SYS" />

      <text x={CX} y={rows > 1 ? 9 : 14} fontSize={4.5} fill="#475569"
        style={{ pointerEvents: 'none' }}>GbE ({access})</text>
      {Array.from({ length: access }, (_, i) => {
        const col = i % cols; const row = Math.floor(i / cols)
        const px = CX + col * SW_GAP
        const py = PY + row * (SW_PH + 3)
        return interactive && accPorts?.[i] && cbs
          ? <IPort key={i} port={accPorts[i]} x={px} y={py} w={SW_PW} h={SW_PH} shape="rj45" {...cb(cbs, accPorts[i])} />
          : <SPort key={i} x={px} y={py} w={SW_PW} h={SW_PH} shape="rj45" lit={i%4!==3} />
      })}

      <text x={ulX} y={rows > 1 ? 9 : 14} fontSize={4.5} fill="#60a5fa"
        style={{ pointerEvents: 'none' }}>SFP+</text>
      {Array.from({ length: uplinks }, (_, i) => {
        const px = ulX + i * SW_GAP
        return interactive && ulPorts?.[i] && cbs
          ? <IPort key={i} port={ulPorts[i]} x={px} y={PY} w={SW_PW} h={SW_PH} shape="sfp" {...cb(cbs, ulPorts[i])} />
          : <SPort key={i} x={px} y={PY} w={SW_PW} h={SW_PH} shape="sfp" lit color="#60a5fa" />
      })}
    </RackSvg>
  )
}

// ── ODF ────────────────────────────────────────────────────────────────────
function OdfContent({ portCount, conn, interactive, cbs, ports }: {
  portCount: number; conn: string; interactive?: boolean; cbs?: CBs; ports?: RackPort[]
}) {
  const isApc = conn.includes('APC'); const isLc = conn.includes('LC')
  const color = isApc ? '#22c55e' : '#60a5fa'
  const PW = isLc ? 10 : 12; const PH = isLc ? 13 : 13
  const GAP = isLc ? 13 : 14; const shape: Shape = isLc ? 'lc' : 'sc'
  const cols = Math.min(portCount, 16)
  const rows = Math.ceil(portCount / 16)
  const PY   = rows > 1 ? 7 : 16

  return (
    <RackSvg>
      <defs>
        <linearGradient id="odf-bg2" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#162035"/><stop offset="100%" stopColor="#0a1428"/>
        </linearGradient>
      </defs>
      <rect width={W} height={H} rx={2} fill="url(#odf-bg2)" />
      <rect width={W} height={2} rx={1} fill="#334" opacity={0.5} />
      <Ears />
      {/* Label panel */}
      <rect x={EW} y={0} width={BW} height={H} fill="#0a1428" />
      <text x={EW+BW/2} y={H/2+2.5} textAnchor="middle" fontSize={7} fontWeight="bold"
        fill={color} transform={`rotate(-90,${EW+BW/2},${H/2})`}
        style={{ fontFamily: 'Arial,sans-serif', pointerEvents: 'none' }}>ODF</text>
      <rect x={EW+BW} y={0} width={2} height={H} fill="rgba(0,0,0,0.3)" />

      {/* Connector badge */}
      <rect x={CX} y={4} width={38} height={11} rx={2} fill={color+'22'} stroke={color} strokeWidth={0.7} />
      <text x={CX+19} y={12} textAnchor="middle" fontSize={6} fontWeight="bold"
        fill={color} style={{ fontFamily: 'Arial,sans-serif', pointerEvents: 'none' }}>{conn}</text>

      {/* Ports */}
      {Array.from({ length: Math.min(portCount, cols*rows) }, (_, i) => {
        const col = i % cols; const row = Math.floor(i / cols)
        const px = CX + 42 + col * GAP
        const py = PY + row * (PH + 2)
        return interactive && ports?.[i] && cbs
          ? <IPort key={i} port={ports[i]} x={px} y={py} w={PW} h={PH} shape={shape} {...cb(cbs, ports[i])} />
          : <SPort key={i} x={px} y={py} w={PW} h={PH} shape={shape} lit color={color} />
      })}

      <text x={W-EW-4} y={H-5} textAnchor="end" fontSize={5.5} fill="#475569"
        style={{ fontFamily: 'Arial,sans-serif', pointerEvents: 'none' }}>{portCount}p</text>
    </RackSvg>
  )
}

// ── Router / Mikrotik ──────────────────────────────────────────────────────
const MK_PW = 10; const MK_PH = 8; const MK_GAP = 12
function MikrotikContent({ brand, model, wan, lan, interactive, cbs, wanPorts, lanPorts }: {
  brand: string; model: string; wan: number; lan: number
  interactive?: boolean; cbs?: CBs; wanPorts?: RackPort[]; lanPorts?: RackPort[]
}) {
  const wanEnd = CX + wan * MK_GAP + 6
  return (
    <RackSvg>
      <Ears /><BrandStrip brand={brand} />
      <text x={CX} y={9} fontSize={6.5} fontWeight="bold" fill="#94a3b8"
        style={{ fontFamily: 'Arial,sans-serif', pointerEvents: 'none' }}>{model}</text>
      <Led cx={CX+62} cy={8} color="#22c55e" label="PWR" />

      <text x={CX} y={17} fontSize={4.5} fill="#f87171"
        style={{ pointerEvents: 'none' }}>WAN ({wan})</text>
      {Array.from({ length: wan }, (_, i) => {
        const px = CX + i * MK_GAP
        return interactive && wanPorts?.[i] && cbs
          ? <IPort key={i} port={wanPorts[i]} x={px} y={19} w={MK_PW} h={MK_PH} shape="rj45" {...cb(cbs, wanPorts[i])} />
          : <SPort key={i} x={px} y={19} w={MK_PW} h={MK_PH} shape="rj45" lit color="#f87171" />
      })}

      <text x={wanEnd} y={17} fontSize={4.5} fill="#4ade80"
        style={{ pointerEvents: 'none' }}>LAN ({lan})</text>
      {Array.from({ length: lan }, (_, i) => {
        const px = wanEnd + i * MK_GAP
        return interactive && lanPorts?.[i] && cbs
          ? <IPort key={i} port={lanPorts[i]} x={px} y={19} w={MK_PW} h={MK_PH} shape="rj45" {...cb(cbs, lanPorts[i])} />
          : <SPort key={i} x={px} y={19} w={MK_PW} h={MK_PH} shape="rj45" lit color="#4ade80" />
      })}
    </RackSvg>
  )
}

// ── Splitter ───────────────────────────────────────────────────────────────
function SplitterContent({ count, ratio, interactive, cbs, groups }: {
  count: number; ratio: number; interactive?: boolean; cbs?: CBs
  groups?: { input: RackPort; outputs: RackPort[] }[]
}) {
  const visible = Math.min(count, 8)
  const cw      = (W - EW*2 - BW - 4 - 6) / visible

  return (
    <RackSvg>
      <defs>
        <linearGradient id="sp-bg2" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1a0d38"/><stop offset="100%" stopColor="#0e0820"/>
        </linearGradient>
      </defs>
      <rect width={W} height={H} rx={2} fill="url(#sp-bg2)" />
      <rect width={W} height={2} rx={1} fill="#443" opacity={0.5} />
      <Ears />
      {/* Label panel */}
      <rect x={EW} y={0} width={BW} height={H} fill="#15082a" />
      <text x={EW+BW/2} y={H/2+2.5} textAnchor="middle" fontSize={7} fontWeight="bold"
        fill="#a855f7" transform={`rotate(-90,${EW+BW/2},${H/2})`}
        style={{ fontFamily: 'Arial,sans-serif', pointerEvents: 'none' }}>SPLIT</text>
      <rect x={EW+BW} y={0} width={2} height={H} fill="rgba(0,0,0,0.3)" />

      {Array.from({ length: visible }, (_, i) => {
        const cx  = CX + 4 + i * cw + cw / 2
        const grp = groups?.[i]
        const outCount = Math.min(ratio, 4)
        const D = 7   // port dot size (diameter)

        return (
          <g key={i}>
            {/* Splitter box */}
            <rect x={cx-8} y={H/2-5} width={16} height={9} rx={2}
              fill="#22094a" stroke="#a855f7" strokeWidth={0.8} />
            <text x={cx} y={H/2+1} textAnchor="middle" fontSize={5} fontWeight="bold"
              fill="#a855f7" style={{ fontFamily: 'Arial,sans-serif', pointerEvents: 'none' }}>
              1:{ratio}
            </text>

            {/* Input line + port */}
            <line x1={cx} y1={5+D} x2={cx} y2={H/2-5} stroke="#a855f7" strokeWidth={0.8} />
            {interactive && grp?.input && cbs
              ? <IPort port={grp.input} x={cx-D/2} y={3} w={D} h={D} shape="dot" {...cb(cbs, grp.input)} />
              : <><circle cx={cx} cy={3+D/2} r={D/2} fill="#091420" stroke="#a855f7" strokeWidth={0.7}/><circle cx={cx} cy={3+D/2} r={2} fill="#a855f7" opacity={0.6}/></>
            }

            {/* Output lines + ports */}
            {Array.from({ length: outCount }, (_, j) => {
              const ox = cx + (j - (outCount-1)/2) * (cw * 0.25)
              const oy = H - 3 - D
              return (
                <g key={j}>
                  <line x1={cx} y1={H/2+4} x2={ox} y2={oy} stroke="#7c3aed" strokeWidth={0.7} />
                  {interactive && grp?.outputs[j] && cbs
                    ? <IPort port={grp.outputs[j]} x={ox-D/2} y={oy} w={D} h={D} shape="dot" {...cb(cbs, grp.outputs[j])} />
                    : <><circle cx={ox} cy={oy+D/2} r={D/2} fill="#091420" stroke="#7c3aed" strokeWidth={0.7}/><circle cx={ox} cy={oy+D/2} r={2} fill="#7c3aed" opacity={0.6}/></>
                  }
                </g>
              )
            })}
            {ratio > 4 && (
              <text x={cx} y={H-1} textAnchor="middle" fontSize={4} fill="#7c3aed"
                style={{ pointerEvents: 'none' }}>+{ratio-4}</text>
            )}
          </g>
        )
      })}

      <text x={W-EW-4} y={H-4} textAnchor="end" fontSize={5} fill="#6b7280"
        style={{ pointerEvents: 'none' }}>{count}×1:{ratio}</text>
    </RackSvg>
  )
}

// ── Visual-only export (template picker) ──────────────────────────────────
export default function EquipmentPanel({ t }: { t: RackTemplate }) {
  switch (t.kind) {
    case 'olt':
      return <OltContent brand={t.brand} model={t.model} heightU={t.heightU}
        pon={t.ponPorts ?? 8} uplinks={t.uplinkPorts ?? 2} />
    case 'switch':
      return <SwitchContent brand={t.brand} model={t.model}
        access={t.switchAccess ?? 24} uplinks={t.switchUplink ?? 2} />
    case 'odf':
      return <OdfContent portCount={t.portCount ?? 24} conn={t.connectorType ?? 'SC/APC'} />
    case 'mikrotik':
      return <MikrotikContent brand={t.brand} model={t.model}
        wan={t.mkWan ?? 2} lan={t.mkLan ?? 8} />
    case 'splitter':
      return <SplitterContent count={t.splitterCount ?? 4} ratio={t.splitterRatio ?? 8} />
    default: return null
  }
}

// ── Interactive export (rack slots) ───────────────────────────────────────
export function InteractiveEquipmentPanel({ panel, pendingPortId, connectedPortIds, onPortClick, onPortRightClick }: {
  panel: RackPanel
  pendingPortId: string | null
  connectedPortIds: Set<string>
  onPortClick: (p: RackPort) => void
  onPortRightClick: (p: RackPort, clientX: number, clientY: number) => void
}) {
  const cbs: CBs = { pendingPortId, connectedPortIds, onPortClick, onRightClick: onPortRightClick }
  const pg = panel.portGroups ?? []
  const b  = panel.brand ?? 'Genérico'

  switch (panel.kind) {
    case 'olt': {
      const ponG = pg.find(g => g.label.toLowerCase().includes('pon'))
      const ulG  = pg.find(g => g.label.toLowerCase().includes('uplink'))
      return <OltContent brand={b} model={panel.name} heightU={panel.heightU}
        pon={ponG?.ports.length ?? 8} uplinks={ulG?.ports.length ?? 2}
        interactive cbs={cbs} ponPorts={ponG?.ports} ulPorts={ulG?.ports} />
    }
    case 'switch': {
      const accG = pg.find(g => g.label.toLowerCase().includes('access'))
      const ulG  = pg.find(g => g.label.toLowerCase().includes('uplink'))
      return <SwitchContent brand={b} model={panel.name}
        access={accG?.ports.length ?? 24} uplinks={ulG?.ports.length ?? 2}
        interactive cbs={cbs} accPorts={accG?.ports} ulPorts={ulG?.ports} />
    }
    case 'odf':
      return <OdfContent portCount={panel.portCount ?? panel.ports.length}
        conn={panel.connectorType ?? 'SC/APC'}
        interactive cbs={cbs} ports={panel.ports} />
    case 'mikrotik': {
      const wG = pg.find(g => g.label.toLowerCase().includes('wan'))
      const lG = pg.find(g => g.label.toLowerCase().includes('lan'))
      return <MikrotikContent brand={b} model={panel.name}
        wan={wG?.ports.length ?? 2} lan={lG?.ports.length ?? 8}
        interactive cbs={cbs} wanPorts={wG?.ports} lanPorts={lG?.ports} />
    }
    case 'splitter': {
      const grps = pg.map(g => ({ input: g.ports[0], outputs: g.ports.slice(1) }))
      return <SplitterContent count={pg.length}
        ratio={Math.max(1, (pg[0]?.ports.length ?? 3) - 1)}
        interactive cbs={cbs} groups={grps} />
    }
    default: return null
  }
}
