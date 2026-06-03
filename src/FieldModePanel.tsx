import { useState, useEffect } from 'react'
import type { AppFeature } from './types'
import { typeLabels, statusLabels, featureTypeClass, FeatureIcons } from './editorConstants'
import { computeLineLength } from './OpticalPath'

interface Props {
  feature: AppFeature | null
  onUpdateNotes: (notes: string) => void
  onOpenSpliceCard: () => void
  onOpenRack: () => void
  onClose: () => void
}

const STATUS_COLOR: Record<string, string> = {
  active: '#10b981', planned: '#64748b', maintenance: '#f59e0b', damaged: '#ef4444',
}

export default function FieldModePanel({ feature, onUpdateNotes, onOpenSpliceCard, onOpenRack, onClose }: Props) {
  const [notes, setNotes] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    setNotes(feature?.properties.notes ?? '')
    setSaved(false)
  }, [feature?.properties.id])

  if (!feature) return null

  const p = feature.properties
  const statusColor = STATUS_COLOR[p.status] ?? '#94a3b8'

  let lengthM: number | null = null
  if (feature.geometry.type === 'LineString') {
    const geo = computeLineLength((feature.geometry as GeoJSON.LineString).coordinates) * 1000
    const extra = (p.extraLengthM ?? 0) + (p.bypassM ?? 0)
    lengthM = Math.round(geo + extra)
  }

  function saveNotes() {
    onUpdateNotes(notes)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const hasCard = p.featureType === 'splice_box' || p.featureType === 'nap'
  const hasRack = p.featureType === 'node'
  const hasClients = hasCard && (p.spliceCard?.cables.flatMap(c => c.fibers).some(f => f.clientName || f.clientInfo?.name) ?? false)

  return (
    <div className="fm-panel">
      {/* Drag handle */}
      <div className="fm-handle" />

      {/* Header */}
      <div className="fm-header">
        <span className={`fm-type-icon ${featureTypeClass[p.featureType] ?? ''}`}>
          {FeatureIcons[p.featureType]}
        </span>
        <div className="fm-header-text">
          <div className="fm-feature-name">{p.name || typeLabels[p.featureType]}</div>
          <div className="fm-feature-sub">
            {p.code && <span className="fm-code">{p.code}</span>}
            <span className="fm-type-label">{typeLabels[p.featureType]}</span>
          </div>
        </div>
        <button className="fm-close" onClick={onClose}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      {/* Status + meta */}
      <div className="fm-meta">
        <div className="fm-status-row">
          <span className="fm-status-dot" style={{ background: statusColor }} />
          <span className="fm-status-label">{statusLabels[p.status]}</span>
        </div>
        {lengthM !== null && (
          <div className="fm-stat">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12h18M3 6l3 6-3 6M21 6l-3 6 3 6"/>
            </svg>
            {lengthM.toLocaleString('es-AR')} m
            {p.fiberCount && ` · ${p.fiberCount} fibras`}
          </div>
        )}
        {hasClients && (() => {
          const clientCount = p.spliceCard!.cables.flatMap(c => c.fibers).filter(f => f.clientName || f.clientInfo?.name).length
          return (
            <div className="fm-stat">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/>
              </svg>
              {clientCount} cliente{clientCount !== 1 ? 's' : ''}
            </div>
          )
        })()}
      </div>

      {/* Quick actions */}
      <div className="fm-actions">
        {hasCard && (
          <button className="fm-action-btn" onClick={onOpenSpliceCard}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/>
            </svg>
            Carta de empalme
          </button>
        )}
        {hasRack && (
          <button className="fm-action-btn" onClick={onOpenRack}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>
            </svg>
            Ver rack
          </button>
        )}
      </div>

      {/* Notes */}
      <div className="fm-notes-section">
        <label className="fm-notes-label">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
          </svg>
          Notas / Observaciones de campo
        </label>
        <textarea
          className="fm-notes-input"
          placeholder="Agregar observación, condición del cable, acceso al poste…"
          value={notes}
          onChange={e => { setNotes(e.target.value); setSaved(false) }}
          rows={4}
        />
        <button
          className={`fm-save-btn${saved ? ' fm-saved' : ''}`}
          onClick={saveNotes}
          disabled={notes === (feature.properties.notes ?? '')}
        >
          {saved ? (
            <>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
              Guardado
            </>
          ) : (
            <>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/>
                <polyline points="17 21 17 13 7 13 7 21"/>
              </svg>
              Guardar nota
            </>
          )}
        </button>
      </div>
    </div>
  )
}
