import type { FeatureKind } from './types'
import { FeatureIcons } from './editorConstants'
import DropdownMenu from './DropdownMenu'

interface Props {
  hasMeasureLayer: boolean
  showValidation: boolean
  validationCount: number
  onToggleValidation: () => void
  onImportFile: () => void
  onImportShapefile: () => void
  onDraw: (mode: FeatureKind) => void
  onStartMeasure: () => void
  onClearMeasure: () => void
  onStopDraw: () => void
}

export default function MapToolbar({
  hasMeasureLayer, showValidation, validationCount, onToggleValidation,
  onImportFile, onImportShapefile,
  onDraw, onStartMeasure, onClearMeasure, onStopDraw,
}: Props) {
  return (
    <div className="sidebar-toolbar">
      <DropdownMenu label={
        <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg> Importar</>
      } align="left">
        <button className="dropdown-item" onClick={onImportFile}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14,2 14,8 20,8"/></svg>
          KML / KMZ / GeoJSON
        </button>
        <button className="dropdown-item" onClick={onImportShapefile}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/></svg>
          Shapefile (.zip)
        </button>
      </DropdownMenu>

      <DropdownMenu label={
        <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg> Dibujar</>
      } align="left">
        <button className="dropdown-item" onClick={() => onDraw('node')}>
          <span className="feature-type-icon ft-node" style={{width:16,height:16}}>{FeatureIcons.node}</span>
          Nodo
        </button>
        <button className="dropdown-item" onClick={() => onDraw('splice_box')}>
          <span className="feature-type-icon ft-splice" style={{width:16,height:16}}>{FeatureIcons.splice_box}</span>
          Caja empalme
        </button>
        <button className="dropdown-item" onClick={() => onDraw('nap')}>
          <span className="feature-type-icon ft-nap" style={{width:16,height:16}}>{FeatureIcons.nap}</span>
          Caja NAP
        </button>
        <button className="dropdown-item" onClick={() => onDraw('fiber_line')}>
          <span className="feature-type-icon ft-fiber" style={{width:16,height:16}}>{FeatureIcons.fiber_line}</span>
          Línea de fibra
        </button>
        <button className="dropdown-item" onClick={() => onDraw('zone')}>
          <span className="feature-type-icon ft-zone" style={{width:16,height:16}}>{FeatureIcons.zone}</span>
          Zona
        </button>
        <div className="dropdown-divider" />
        <button className="dropdown-item" onClick={onStartMeasure}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 12h20M2 12l4-4M2 12l4 4M22 12l-4-4M22 12l-4 4"/>
            <line x1="8" y1="8" x2="8" y2="16"/><line x1="12" y1="6" x2="12" y2="18"/><line x1="16" y1="8" x2="16" y2="16"/>
          </svg>
          Medir distancia
        </button>
        {hasMeasureLayer && (
          <button className="dropdown-item" onClick={onClearMeasure}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            Limpiar medición
          </button>
        )}
        <div className="dropdown-divider" />
        <button className="dropdown-item" onClick={onStopDraw}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>
          Detener dibujo
        </button>
      </DropdownMenu>

      <button
        className={showValidation ? 'secondary active' : 'secondary'}
        onClick={onToggleValidation}
        title={showValidation ? 'Ocultar advertencias' : 'Mostrar advertencias de validación'}
        style={{ position: 'relative' }}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
          <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
        {validationCount > 0 && (
          <span style={{
            position: 'absolute', top: -5, right: -5,
            background: '#fbbf24', color: '#000',
            borderRadius: '999px', fontSize: '0.6rem',
            fontWeight: 700, minWidth: 16, height: 16,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '0 3px', lineHeight: 1,
          }}>{validationCount}</span>
        )}
      </button>
    </div>
  )
}
