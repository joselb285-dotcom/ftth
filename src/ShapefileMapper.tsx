import { useState } from 'react'
import type { FeatureKind } from './types'

export type ShapefileMapping = {
  featureType: FeatureKind
  nameCol: string
  codeCol: string
  notesCol: string
}

interface Props {
  columns: string[]
  samples: Record<string, unknown>[]
  onApply: (mapping: ShapefileMapping) => void
  onCancel: () => void
}

const TYPE_OPTIONS: { value: FeatureKind; label: string }[] = [
  { value: 'node',       label: 'Nodo' },
  { value: 'splice_box', label: 'Caja de empalme' },
  { value: 'nap',        label: 'Caja NAP' },
  { value: 'fiber_line', label: 'Línea de fibra' },
  { value: 'zone',       label: 'Zona' },
]

export default function ShapefileMapper({ columns, samples, onApply, onCancel }: Props) {
  const [featureType, setFeatureType] = useState<FeatureKind>('node')
  const [nameCol,  setNameCol]  = useState(columns[0] ?? '')
  const [codeCol,  setCodeCol]  = useState('')
  const [notesCol, setNotesCol] = useState('')

  const FIELD_ROWS = [
    { label: 'Nombre', required: true,  val: nameCol,  set: setNameCol },
    { label: 'Código', required: false, val: codeCol,  set: setCodeCol },
    { label: 'Notas',  required: false, val: notesCol, set: setNotesCol },
  ]

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="shp-mapper-modal" onClick={e => e.stopPropagation()}>

        <div className="shp-header">
          <span className="shp-title">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/>
            </svg>
            Importar Shapefile
          </span>
          <button className="shp-close" onClick={onCancel}>✕</button>
        </div>

        <div className="shp-body">
          <p className="shp-hint">
            Se detectaron <strong>{columns.length}</strong> columnas DBF. Asigná cada campo a una propiedad del proyecto.
          </p>

          {/* Feature type */}
          <div className="shp-mapping-row">
            <span className="shp-field-label">Tipo de elemento</span>
            <select
              className="shp-select"
              value={featureType}
              onChange={e => setFeatureType(e.target.value as FeatureKind)}
            >
              {TYPE_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <span className="shp-sample shp-sample-fixed">para todos los importados</span>
          </div>

          <div className="shp-divider" />

          {/* Column mappers */}
          {FIELD_ROWS.map(({ label, required, val, set }) => (
            <div key={label} className="shp-mapping-row">
              <span className="shp-field-label">
                {label}
                {required && <span className="shp-req"> *</span>}
              </span>
              <select
                className="shp-select"
                value={val}
                onChange={e => set(e.target.value)}
              >
                {!required && <option value="">(ninguna)</option>}
                {columns.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <span className="shp-sample">
                {val && samples[0] ? String(samples[0][val] ?? '') : ''}
              </span>
            </div>
          ))}

          {/* Preview table */}
          {samples.length > 0 && (
            <div className="shp-preview">
              <div className="shp-preview-title">Vista previa · primeras {samples.length} filas</div>
              <div className="shp-preview-scroll">
                <table className="shp-preview-table">
                  <thead>
                    <tr>{columns.map(c => <th key={c}>{c}</th>)}</tr>
                  </thead>
                  <tbody>
                    {samples.map((row, i) => (
                      <tr key={i}>
                        {columns.map(c => <td key={c}>{String(row[c] ?? '')}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <div className="shp-footer">
          <button className="btn-outline" onClick={onCancel}>Cancelar</button>
          <button
            className="btn-primary"
            disabled={!nameCol}
            onClick={() => onApply({ featureType, nameCol, codeCol, notesCol })}
          >
            Importar {samples.length > 0 ? `(${samples.length}+ elementos)` : ''}
          </button>
        </div>

      </div>
    </div>
  )
}
