import { useState } from 'react'
import type { PoleType, PoleCondition, PoleAttachment, PoleElement } from './types'

export interface PoleData {
  poleType: PoleType
  poleCondition: PoleCondition
  poleAttachment: PoleAttachment
  poleElement: PoleElement
  poleGainM: number
  name: string
  notes: string
}

interface Props {
  onSave: (data: PoleData) => void
  onCancel: () => void
}

const POLE_TYPES: { value: PoleType; label: string }[] = [
  { value: 'hormigon', label: 'Hormigón' },
  { value: 'metalico', label: 'Metálico' },
  { value: 'madera',   label: 'Madera' },
  { value: 'otro',     label: 'Otro' },
]

const CONDITIONS: { value: PoleCondition; label: string; color: string }[] = [
  { value: 'bueno',   label: 'Bueno',   color: '#10b981' },
  { value: 'regular', label: 'Regular', color: '#f59e0b' },
  { value: 'malo',    label: 'Malo',    color: '#ef4444' },
]

const ATTACHMENTS: { value: PoleAttachment; label: string; icon: string }[] = [
  { value: 'retencion',  label: 'Retención',  icon: '⬛' },
  { value: 'suspension', label: 'Suspensión', icon: '〰' },
  { value: 'ambas',      label: 'Ambas',      icon: '🔄' },
]

const ELEMENTS: { value: PoleElement; label: string }[] = [
  { value: 'nap',      label: 'Caja NAP' },
  { value: 'empalme',  label: 'Caja de empalme' },
  { value: 'reserva',  label: 'Reserva de cable' },
  { value: 'ninguno',  label: 'Sin elemento' },
]

export default function PoleForm({ onSave, onCancel }: Props) {
  const [data, setData] = useState<PoleData>({
    poleType:       'hormigon',
    poleCondition:  'bueno',
    poleAttachment: 'suspension',
    poleElement:    'ninguno',
    poleGainM:      0,
    name:           '',
    notes:          '',
  })

  function set<K extends keyof PoleData>(k: K, v: PoleData[K]) {
    setData(d => ({ ...d, [k]: v }))
  }

  return (
    <div className="pole-form-overlay" onClick={e => e.stopPropagation()}>
      <div className="pole-form">
        <div className="pole-form-header">
          <div className="pole-form-title-row">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="2" x2="12" y2="22"/>
              <line x1="6" y1="6" x2="18" y2="6"/>
              <line x1="8" y1="10" x2="16" y2="10"/>
            </svg>
            <h3>Relevamiento de poste</h3>
          </div>
          <p className="pole-form-sub">Completá los datos del poste geolocalizado</p>
        </div>

        <div className="pole-form-body">
          {/* Name */}
          <div className="pf-field">
            <label className="pf-label">Identificación / Número</label>
            <input className="pf-input" placeholder="Ej: P-045, Esquina Rivadavia y San Martín"
              value={data.name} onChange={e => set('name', e.target.value)} />
          </div>

          {/* Type */}
          <div className="pf-field">
            <label className="pf-label">Tipo de poste</label>
            <div className="pf-btn-group">
              {POLE_TYPES.map(t => (
                <button key={t.value}
                  className={`pf-option-btn${data.poleType === t.value ? ' active' : ''}`}
                  onClick={() => set('poleType', t.value)}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Condition */}
          <div className="pf-field">
            <label className="pf-label">Condición estructural</label>
            <div className="pf-btn-group">
              {CONDITIONS.map(c => (
                <button key={c.value}
                  className={`pf-option-btn${data.poleCondition === c.value ? ' active' : ''}`}
                  style={data.poleCondition === c.value ? { borderColor: c.color, color: c.color, background: c.color + '18' } : {}}
                  onClick={() => set('poleCondition', c.value)}>
                  <span className="pf-cond-dot" style={{ background: c.color }} />
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          {/* Attachment */}
          <div className="pf-field">
            <label className="pf-label">Tipo de fijación del cable</label>
            <div className="pf-btn-group">
              {ATTACHMENTS.map(a => (
                <button key={a.value}
                  className={`pf-option-btn${data.poleAttachment === a.value ? ' active' : ''}`}
                  onClick={() => set('poleAttachment', a.value)}>
                  {a.label}
                </button>
              ))}
            </div>
          </div>

          {/* Gain */}
          <div className="pf-field">
            <label className="pf-label">Ganancia de cable en este poste (m)</label>
            <div className="pf-number-row">
              <input type="number" min="0" step="0.5" className="pf-input pf-number"
                value={data.poleGainM || ''}
                onChange={e => set('poleGainM', parseFloat(e.target.value) || 0)}
                placeholder="0" />
              <span className="pf-unit">metros</span>
            </div>
          </div>

          {/* Element at pole */}
          <div className="pf-field">
            <label className="pf-label">Elemento instalado en este poste</label>
            <div className="pf-btn-group pf-btn-group-2">
              {ELEMENTS.map(el => (
                <button key={el.value}
                  className={`pf-option-btn${data.poleElement === el.value ? ' active' : ''}`}
                  onClick={() => set('poleElement', el.value)}>
                  {el.label}
                </button>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div className="pf-field">
            <label className="pf-label">Observaciones</label>
            <textarea className="pf-input pf-textarea"
              placeholder="Condición del tendido, accesibilidad, daños, etc."
              value={data.notes}
              onChange={e => set('notes', e.target.value)}
              rows={3}
            />
          </div>
        </div>

        <div className="pole-form-footer">
          <button className="secondary" onClick={onCancel}>Cancelar</button>
          <button className="pf-save-btn" onClick={() => onSave(data)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 10H3M16 3l5 7-5 7"/>
            </svg>
            Guardar poste
          </button>
        </div>
      </div>
    </div>
  )
}
