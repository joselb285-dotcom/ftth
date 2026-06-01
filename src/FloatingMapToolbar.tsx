import type { FeatureKind } from './types'

export type ActiveTool = FeatureKind | 'measure' | null

interface Props {
  activeTool: ActiveTool
  hasMeasureLayer: boolean
  showDistanceLabels: boolean
  showValidation: boolean
  validationCount: number
  onDraw: (mode: FeatureKind) => void
  onStopDraw: () => void
  onStartMeasure: () => void
  onClearMeasure: () => void
  onImportFile: () => void
  onImportShapefile: () => void
  onToggleDistanceLabels: () => void
  onToggleValidation: () => void
}

const DRAW_TOOLS: { mode: FeatureKind; label: string; icon: React.ReactNode; cls: string }[] = [
  {
    mode: 'node', label: 'Nodo', cls: 'fmtb-node',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>
      </svg>
    ),
  },
  {
    mode: 'splice_box', label: 'Caja empalme', cls: 'fmtb-splice',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/>
      </svg>
    ),
  },
  {
    mode: 'nap', label: 'Caja NAP', cls: 'fmtb-nap',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
      </svg>
    ),
  },
  {
    mode: 'fiber_line', label: 'Línea de fibra', cls: 'fmtb-fiber',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 12h18M3 6l4 6-4 6M21 6l-4 6 4 6"/>
      </svg>
    ),
  },
  {
    mode: 'zone', label: 'Zona', cls: 'fmtb-zone',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="3 11 22 2 13 21 11 13 3 11"/>
      </svg>
    ),
  },
  {
    mode: 'camera', label: 'Reserva de cable', cls: 'fmtb-camera',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>
      </svg>
    ),
  },
]

function Divider() {
  return <div className="fmtb-divider" />
}

function ToolBtn({
  label, active, onClick, children, className = '', badge,
}: {
  label: string
  active?: boolean
  onClick: () => void
  children: React.ReactNode
  className?: string
  badge?: number
}) {
  return (
    <button
      className={`fmtb-btn ${active ? 'fmtb-active' : ''} ${className}`}
      onClick={onClick}
      title={label}
      aria-label={label}
    >
      {children}
      {badge != null && badge > 0 && <span className="fmtb-badge">{badge}</span>}
    </button>
  )
}

export default function FloatingMapToolbar({
  activeTool, hasMeasureLayer, showDistanceLabels, showValidation, validationCount,
  onDraw, onStopDraw, onStartMeasure, onClearMeasure,
  onImportFile, onImportShapefile,
  onToggleDistanceLabels, onToggleValidation,
}: Props) {
  return (
    <div className="floating-map-toolbar">

      {/* Import */}
      <ToolBtn label="Importar KML / KMZ / GeoJSON" onClick={onImportFile}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
          <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
        </svg>
        <span className="fmtb-label">KML</span>
      </ToolBtn>

      <ToolBtn label="Importar Shapefile (.zip)" onClick={onImportShapefile}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/>
        </svg>
        <span className="fmtb-label">SHP</span>
      </ToolBtn>

      <Divider />

      {/* Draw tools */}
      {DRAW_TOOLS.map(t => (
        <ToolBtn
          key={t.mode}
          label={t.label}
          active={activeTool === t.mode}
          className={t.cls}
          onClick={() => activeTool === t.mode ? onStopDraw() : onDraw(t.mode)}
        >
          {t.icon}
          <span className="fmtb-label">{t.mode === 'splice_box' ? 'Empalme' : t.mode === 'fiber_line' ? 'Fibra' : t.mode === 'camera' ? 'Reserva' : t.label}</span>
        </ToolBtn>
      ))}

      <Divider />

      {/* Measure */}
      <ToolBtn label="Medir distancia" active={activeTool === 'measure'} onClick={activeTool === 'measure' ? onStopDraw : onStartMeasure}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2 12h20M2 12l4-4M2 12l4 4M22 12l-4-4M22 12l-4 4"/>
          <line x1="8" y1="8" x2="8" y2="16"/><line x1="12" y1="6" x2="12" y2="18"/><line x1="16" y1="8" x2="16" y2="16"/>
        </svg>
        <span className="fmtb-label">Medir</span>
      </ToolBtn>

      {hasMeasureLayer && (
        <ToolBtn label="Limpiar medición" onClick={onClearMeasure}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
          <span className="fmtb-label">Limpiar</span>
        </ToolBtn>
      )}

      {activeTool != null && (
        <ToolBtn label="Detener modo dibujo" onClick={onStopDraw} className="fmtb-stop">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
            <rect x="4" y="4" width="16" height="16" rx="2"/>
          </svg>
          <span className="fmtb-label">Stop</span>
        </ToolBtn>
      )}

      <Divider />

      {/* Toggles */}
      <ToolBtn label={showDistanceLabels ? 'Ocultar longitudes y dirección' : 'Mostrar longitudes y dirección A→B'} active={showDistanceLabels} onClick={onToggleDistanceLabels}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 12h18M3 6l3 6-3 6M21 6l-3 6 3 6"/>
        </svg>
        <span className="fmtb-label">Dist.</span>
      </ToolBtn>

      <ToolBtn
        label={showValidation ? 'Ocultar advertencias' : 'Mostrar advertencias de validación'}
        active={showValidation}
        onClick={onToggleValidation}
        badge={validationCount}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
          <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
        <span className="fmtb-label">Validar</span>
      </ToolBtn>

    </div>
  )
}
