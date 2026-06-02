import { useEffect, useState } from 'react'
import type { AppFeature, AppFeatureProperties, FeatureStatus, OdfConnectorType } from './types'
import { typeLabels, statusLabels, featureTypeClass, statusClass } from './editorConstants'
import { computeLineLength } from './OpticalPath'

interface Props {
  feature: AppFeature | null
  fiberLines: AppFeature[]
  expanded: boolean
  onToggle: () => void
  onUpdate: <K extends keyof AppFeatureProperties>(key: K, value: AppFeatureProperties[K]) => void
  onRemove: () => void
  onDuplicate: () => void
  onOpenSpliceCard: () => void
  onOpenRack: () => void
}

type Tab = 'general' | 'details' | 'notes'

const STATUS_COLORS: Record<FeatureStatus, string> = {
  planned: '#64748b', active: '#10b981', maintenance: '#f59e0b', damaged: '#ef4444',
}

export default function FeaturePanel({ feature, fiberLines, expanded, onToggle, onUpdate, onRemove, onDuplicate, onOpenSpliceCard, onOpenRack }: Props) {
  const [tab, setTab] = useState<Tab>('general')

  // Reset to general tab when the selected feature changes
  useEffect(() => {
    setTab('general')
  }, [feature?.properties.id])

  const ftype = feature?.properties.featureType
  const hasDetails = ftype === 'fiber_line' || ftype === 'node' || ftype === 'splice_box' || ftype === 'nap' || ftype === 'camera'

  return (
    <section className={`panel-block panel-section fp-panel ${expanded ? 'expanded' : ''}`}>
      <button type="button" className="panel-toggle" onClick={onToggle}>
        <span className="fp-toggle-label">
          {feature ? (
            <>
              <span className={`fp-type-dot ${featureTypeClass[feature.properties.featureType] ?? ''}`} />
              {feature.properties.name || typeLabels[feature.properties.featureType]}
            </>
          ) : 'Propiedades'}
        </span>
        <svg className="panel-toggle-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 18l6-6-6-6"/>
        </svg>
      </button>

      {expanded && (
        <div className="fp-body">
          {!feature && <p className="empty-state">Seleccioná un elemento del mapa o de la lista.</p>}

          {feature && (
            <>
              {/* Feature header */}
              <div className="fp-header">
                <div className="fp-header-left">
                  <span className={`fp-feature-type-badge ${featureTypeClass[feature.properties.featureType] ?? ''}`}>
                    {typeLabels[feature.properties.featureType]}
                  </span>
                  <span
                    className={`fp-status-badge ${statusClass[feature.properties.status] ?? ''}`}
                    style={{ background: STATUS_COLORS[feature.properties.status] + '22', color: STATUS_COLORS[feature.properties.status], borderColor: STATUS_COLORS[feature.properties.status] + '44' }}
                  >
                    ● {statusLabels[feature.properties.status]}
                  </span>
                </div>
                <span className="fp-id-badge" title={feature.properties.id}>{feature.properties.id.slice(0, 6)}</span>
              </div>

              {/* Tabs */}
              <div className="fp-tabs">
                <button className={`fp-tab ${tab === 'general' ? 'fp-tab-active' : ''}`} onClick={() => setTab('general')}>General</button>
                {hasDetails && <button className={`fp-tab ${tab === 'details' ? 'fp-tab-active' : ''}`} onClick={() => setTab('details')}>Detalles</button>}
                <button className={`fp-tab ${tab === 'notes' ? 'fp-tab-active' : ''}`} onClick={() => setTab('notes')}>Notas</button>
              </div>

              {/* Tab: General */}
              {tab === 'general' && (
                <div className="fp-tab-content form-stack">
                  <label className="fp-field">
                    <span className="fp-field-label">Nombre</span>
                    <input
                      className="fp-input"
                      value={feature.properties.name}
                      onChange={e => onUpdate('name', e.target.value)}
                      placeholder={`Ej: ${typeLabels[feature.properties.featureType]} 01`}
                    />
                  </label>

                  <label className="fp-field">
                    <span className="fp-field-label">Código</span>
                    <input
                      className="fp-input"
                      value={feature.properties.code}
                      onChange={e => onUpdate('code', e.target.value)}
                      placeholder="Ej: NAP-001"
                    />
                  </label>

                  <div className="fp-row">
                    <label className="fp-field fp-field-grow">
                      <span className="fp-field-label">Estado</span>
                      <select
                        className="fp-input"
                        value={feature.properties.status}
                        onChange={e => onUpdate('status', e.target.value as FeatureStatus)}
                      >
                        {Object.entries(statusLabels).map(([v, l]) => (
                          <option key={v} value={v}>{l}</option>
                        ))}
                      </select>
                    </label>

                    <label className="fp-field fp-field-color">
                      <span className="fp-field-label">Color</span>
                      <input
                        type="color"
                        className="fp-color-input"
                        value={feature.properties.color}
                        onChange={e => onUpdate('color', e.target.value)}
                      />
                    </label>
                  </div>

                  {/* Quick actions */}
                  {feature.properties.featureType === 'node' && (
                    <button className="fp-action-btn" onClick={onOpenRack}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>
                      </svg>
                      Ver rack 19"
                    </button>
                  )}

                  {(feature.properties.featureType === 'splice_box' || feature.properties.featureType === 'nap') && (
                    <button className="fp-action-btn" onClick={onOpenSpliceCard}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/>
                      </svg>
                      Ver carta de empalme
                    </button>
                  )}

                  <div className="fp-actions-row">
                    <button className="fp-dupe-btn" onClick={onDuplicate} title="Duplicar con todas sus propiedades">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
                      </svg>
                      Duplicar
                    </button>
                    <button className="fp-delete-btn" onClick={onRemove}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
                      </svg>
                      Eliminar
                    </button>
                  </div>
                </div>
              )}

              {/* Tab: Detalles */}
              {tab === 'details' && hasDetails && (
                <div className="fp-tab-content form-stack">
                  {ftype === 'fiber_line' && (() => {
                    const geoLenM = feature.geometry.type === 'LineString'
                      ? computeLineLength((feature.geometry as GeoJSON.LineString).coordinates) * 1000
                      : null
                    const extraM  = feature.properties.extraLengthM ?? 0
                    const bypassM = feature.properties.bypassM ?? 0
                    const totalM  = geoLenM !== null ? geoLenM + extraM + bypassM : null
                    return (
                      <>
                        <div className="fp-stat-row">
                          <div className="fp-stat">
                            <span className="fp-stat-label">Trazada</span>
                            <strong className="fp-stat-value">{geoLenM !== null ? `${geoLenM.toFixed(0)} m` : '—'}</strong>
                          </div>
                          <div className="fp-stat">
                            <span className="fp-stat-label">Total física</span>
                            <strong className="fp-stat-value fp-stat-highlight">{totalM !== null ? `${totalM.toFixed(0)} m` : '—'}</strong>
                          </div>
                        </div>

                        <label className="fp-field">
                          <span className="fp-field-label">Rollos de ganancia (m)</span>
                          <input type="number" min="0" step="1" className="fp-input"
                            value={feature.properties.extraLengthM ?? ''}
                            onChange={e => onUpdate('extraLengthM', e.target.value ? Number(e.target.value) : undefined)}
                            placeholder="0" />
                        </label>
                        {extraM > 0 && geoLenM !== null && (
                          <label className="fp-field">
                            <span className="fp-field-label">Posición de ganancia (m desde A)</span>
                            <input type="number" min="0" step="1" max={geoLenM} className="fp-input"
                              value={Math.round((feature.properties.extraLengthPositionFraction ?? 0.5) * geoLenM)}
                              onChange={e => {
                                const posM = e.target.value ? Number(e.target.value) : geoLenM / 2
                                onUpdate('extraLengthPositionFraction', Math.min(1, Math.max(0, posM / geoLenM)))
                              }}
                              placeholder={String(Math.round(geoLenM / 2))} />
                          </label>
                        )}

                        <label className="fp-field">
                          <span className="fp-field-label">By-pass / Reparación (m)</span>
                          <input type="number" min="0" step="1" className="fp-input"
                            value={feature.properties.bypassM ?? ''}
                            onChange={e => onUpdate('bypassM', e.target.value ? Number(e.target.value) : undefined)}
                            placeholder="0" />
                        </label>
                        {bypassM > 0 && geoLenM !== null && (
                          <label className="fp-field">
                            <span className="fp-field-label">Posición de bypass (m desde A)</span>
                            <input type="number" min="0" step="1" max={geoLenM} className="fp-input"
                              value={Math.round((feature.properties.bypassPositionFraction ?? 0.5) * geoLenM)}
                              onChange={e => {
                                const posM = e.target.value ? Number(e.target.value) : geoLenM / 2
                                onUpdate('bypassPositionFraction', Math.min(1, Math.max(0, posM / geoLenM)))
                              }}
                              placeholder={String(Math.round(geoLenM / 2))} />
                          </label>
                        )}

                        <label className="fp-field">
                          <span className="fp-field-label">Atenuación (dB/km)</span>
                          <input type="number" min="0" step="0.01" className="fp-input"
                            value={feature.properties.fiberAttenuationDbPerKm ?? ''}
                            onChange={e => onUpdate('fiberAttenuationDbPerKm', e.target.value ? Number(e.target.value) : undefined)}
                            placeholder="0.35" />
                        </label>
                      </>
                    )
                  })()}

                  {ftype === 'node' && (
                    <>
                      <label className="fp-field">
                        <span className="fp-field-label">Modelo OLT</span>
                        <input className="fp-input" value={feature.properties.oltModel ?? ''}
                          onChange={e => onUpdate('oltModel', e.target.value || undefined)}
                          placeholder="Ej: Huawei MA5800" />
                      </label>
                      <label className="fp-field">
                        <span className="fp-field-label">Modelo Mikrotik</span>
                        <input className="fp-input" value={feature.properties.mikrotikModel ?? ''}
                          onChange={e => onUpdate('mikrotikModel', e.target.value || undefined)}
                          placeholder="Ej: CCR1036" />
                      </label>
                      <div className="fp-row">
                        <label className="fp-field fp-field-grow">
                          <span className="fp-field-label">Conectores ODF</span>
                          <select className="fp-input" value={feature.properties.odfConnectorType ?? ''}
                            onChange={e => onUpdate('odfConnectorType', (e.target.value as OdfConnectorType) || undefined)}>
                            <option value="">Sin especificar</option>
                            <option value="SC/UPC">SC/UPC</option>
                            <option value="SC/APC">SC/APC</option>
                            <option value="LC/UPC">LC/UPC</option>
                            <option value="LC/APC">LC/APC</option>
                          </select>
                        </label>
                        <label className="fp-field">
                          <span className="fp-field-label">ODF</span>
                          <input type="number" min="0" className="fp-input" style={{ width: 60 }}
                            value={feature.properties.odfCount ?? ''}
                            onChange={e => onUpdate('odfCount', e.target.value ? Number(e.target.value) : undefined)}
                            placeholder="0" />
                        </label>
                        <label className="fp-field">
                          <span className="fp-field-label">Baterías</span>
                          <input type="number" min="0" className="fp-input" style={{ width: 60 }}
                            value={feature.properties.batteryCount ?? ''}
                            onChange={e => onUpdate('batteryCount', e.target.value ? Number(e.target.value) : undefined)}
                            placeholder="0" />
                        </label>
                      </div>
                    </>
                  )}

                  {(ftype === 'splice_box' || ftype === 'nap') && (
                    <label className="fp-field">
                      <span className="fp-field-label">Reserva de cable (m)</span>
                      <input type="number" min="0" step="1" className="fp-input"
                        value={feature.properties.reserveM ?? ''}
                        onChange={e => onUpdate('reserveM', e.target.value ? Number(e.target.value) : undefined)}
                        placeholder="0" />
                    </label>
                  )}

                  {ftype === 'camera' && (
                    <>
                      <label className="fp-field">
                        <span className="fp-field-label">Reserva de cable (m)</span>
                        <input type="number" min="0" step="1" className="fp-input"
                          value={feature.properties.reserveM ?? ''}
                          onChange={e => onUpdate('reserveM', e.target.value ? Number(e.target.value) : undefined)}
                          placeholder="0" />
                      </label>
                      <label className="fp-field">
                        <span className="fp-field-label">By-pass / Reparación (m)</span>
                        <input type="number" min="0" step="1" className="fp-input"
                          value={feature.properties.bypassM ?? ''}
                          onChange={e => onUpdate('bypassM', e.target.value ? Number(e.target.value) : undefined)}
                          placeholder="0" />
                      </label>
                      <label className="fp-field">
                        <span className="fp-field-label">Fibra vinculada</span>
                        <select className="fp-input" value={feature.properties.linkedLineId ?? ''}
                          onChange={e => onUpdate('linkedLineId', e.target.value || undefined)}>
                          <option value="">— Sin vincular —</option>
                          {fiberLines.map(f => (
                            <option key={f.properties.id} value={f.properties.id}>
                              {f.properties.name || f.properties.code || f.properties.id.slice(0, 8)}
                            </option>
                          ))}
                        </select>
                      </label>
                    </>
                  )}
                </div>
              )}

              {/* Tab: Notas */}
              {tab === 'notes' && (
                <div className="fp-tab-content">
                  <textarea
                    className="fp-notes-input"
                    rows={8}
                    placeholder="Observaciones, referencias técnicas, estado del tendido..."
                    value={feature.properties.notes}
                    onChange={e => onUpdate('notes', e.target.value)}
                  />
                </div>
              )}
            </>
          )}
        </div>
      )}
    </section>
  )
}
