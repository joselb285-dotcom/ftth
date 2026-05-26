import type { AppFeature, AppFeatureProperties, FeatureStatus, OdfConnectorType } from './types'
import { typeLabels, statusLabels } from './editorConstants'
import { computeLineLength } from './OpticalPath'

interface Props {
  feature: AppFeature | null
  fiberLines: AppFeature[]
  expanded: boolean
  onToggle: () => void
  onUpdate: <K extends keyof AppFeatureProperties>(key: K, value: AppFeatureProperties[K]) => void
  onRemove: () => void
  onOpenSpliceCard: () => void
  onOpenRack: () => void
}

export default function FeaturePanel({ feature, fiberLines, expanded, onToggle, onUpdate, onRemove, onOpenSpliceCard, onOpenRack }: Props) {
  return (
    <section className={`panel-block panel-section ${expanded ? 'expanded' : ''}`}>
      <button type="button" className="panel-toggle" onClick={onToggle}>
        <span>Propiedades{feature ? ` — ${feature.properties.name || typeLabels[feature.properties.featureType]}` : ''}</span>
        <svg className="panel-toggle-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 18l6-6-6-6"/>
        </svg>
      </button>
      {expanded && (
        <div className="panel-content">
          {!feature && <p className="empty-state">Seleccioná un elemento del mapa o de la lista.</p>}
          {feature && (
            <div className="props-form form-stack">
              <label>
                Tipo
                <input value={typeLabels[feature.properties.featureType]} readOnly />
              </label>
              <label>
                Nombre
                <input value={feature.properties.name}
                  onChange={e => onUpdate('name', e.target.value)} />
              </label>
              <label>
                Código
                <input value={feature.properties.code}
                  onChange={e => onUpdate('code', e.target.value)} />
              </label>
              <label>
                Estado
                <select value={feature.properties.status}
                  onChange={e => onUpdate('status', e.target.value as FeatureStatus)}>
                  {Object.entries(statusLabels).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </label>
              <label>
                Color
                <input type="color" value={feature.properties.color}
                  onChange={e => onUpdate('color', e.target.value)} />
              </label>
              <label>
                Observaciones
                <textarea rows={2} value={feature.properties.notes}
                  onChange={e => onUpdate('notes', e.target.value)} />
              </label>

              {feature.properties.featureType === 'node' && (
                <button className="secondary compact" onClick={onOpenRack}>
                  Ver rack
                </button>
              )}

              {feature.properties.featureType === 'node' && (
                <div className="node-extras compact-form">
                  <div className="node-extras-title">Nodo</div>
                  <label>
                    OLT
                    <input value={feature.properties.oltModel ?? ''}
                      onChange={e => onUpdate('oltModel', e.target.value || undefined)}
                      placeholder="Ej: Huawei..." />
                  </label>
                  <label>
                    Mikrotik
                    <input value={feature.properties.mikrotikModel ?? ''}
                      onChange={e => onUpdate('mikrotikModel', e.target.value || undefined)}
                      placeholder="Ej: CCR1036..." />
                  </label>
                  <label>
                    Conectores ODF
                    <select value={feature.properties.odfConnectorType ?? ''}
                      onChange={e => onUpdate('odfConnectorType', (e.target.value as OdfConnectorType) || undefined)}>
                      <option value="">Sin especificar</option>
                      <option value="SC/UPC">SC/UPC</option>
                      <option value="SC/APC">SC/APC</option>
                      <option value="LC/UPC">LC/UPC</option>
                      <option value="LC/APC">LC/APC</option>
                    </select>
                  </label>
                  <label>
                    ODF armados
                    <input type="number" min="0"
                      value={feature.properties.odfCount ?? ''}
                      onChange={e => onUpdate('odfCount', e.target.value ? Number(e.target.value) : undefined)}
                      placeholder="0" />
                  </label>
                  <label>
                    Baterías
                    <input type="number" min="0"
                      value={feature.properties.batteryCount ?? ''}
                      onChange={e => onUpdate('batteryCount', e.target.value ? Number(e.target.value) : undefined)}
                      placeholder="0" />
                  </label>
                </div>
              )}

              {feature.properties.featureType === 'fiber_line' && (() => {
                const geoLenM = feature.geometry.type === 'LineString'
                  ? computeLineLength((feature.geometry as GeoJSON.LineString).coordinates) * 1000
                  : null
                const extraM  = feature.properties.extraLengthM ?? 0
                const bypassM = feature.properties.bypassM ?? 0
                const totalM  = geoLenM !== null ? geoLenM + extraM + bypassM : null
                return (
                  <div className="node-extras compact-form">
                    <div className="node-extras-title">Fibra óptica</div>
                    <label>
                      Longitud trazada
                      <input readOnly value={geoLenM !== null ? `${geoLenM.toFixed(0)} m` : '—'} />
                    </label>
                    <label>
                      Rollos de ganancia (m)
                      <input
                        type="number" min="0" step="1"
                        value={feature.properties.extraLengthM ?? ''}
                        onChange={e => onUpdate('extraLengthM', e.target.value ? Number(e.target.value) : undefined)}
                        placeholder="0"
                      />
                    </label>
                    <label>
                      By-pass / Reparación (m)
                      <input
                        type="number" min="0" step="1"
                        value={feature.properties.bypassM ?? ''}
                        onChange={e => onUpdate('bypassM', e.target.value ? Number(e.target.value) : undefined)}
                        placeholder="0"
                      />
                    </label>
                    <label>
                      Longitud física total
                      <input readOnly value={totalM !== null ? `${totalM.toFixed(0)} m` : '—'} />
                    </label>
                    <label>
                      Atenuación (dB/km)
                      <input
                        type="number" min="0" step="0.01"
                        value={feature.properties.fiberAttenuationDbPerKm ?? ''}
                        onChange={e => onUpdate('fiberAttenuationDbPerKm', e.target.value ? Number(e.target.value) : undefined)}
                        placeholder="0.35"
                      />
                    </label>
                  </div>
                )
              })()}

              {(feature.properties.featureType === 'splice_box' ||
                feature.properties.featureType === 'nap') && (
                <>
                  <div className="node-extras compact-form">
                    <div className="node-extras-title">Reserva en caja</div>
                    <label>
                      Reserva de cable (m)
                      <input
                        type="number" min="0" step="1"
                        value={feature.properties.reserveM ?? ''}
                        onChange={e => onUpdate('reserveM', e.target.value ? Number(e.target.value) : undefined)}
                        placeholder="0"
                      />
                    </label>
                  </div>
                  <button className="secondary compact" onClick={onOpenSpliceCard}>
                    Ver carta de empalme
                  </button>
                </>
              )}

              {feature.properties.featureType === 'camera' && (
                <div className="node-extras compact-form">
                  <div className="node-extras-title">Cámara / Reserva</div>
                  <label>
                    Reserva de cable (m)
                    <input
                      type="number" min="0" step="1"
                      value={feature.properties.reserveM ?? ''}
                      onChange={e => onUpdate('reserveM', e.target.value ? Number(e.target.value) : undefined)}
                      placeholder="0"
                    />
                  </label>
                  <label>
                    By-pass / Reparación (m)
                    <input
                      type="number" min="0" step="1"
                      value={feature.properties.bypassM ?? ''}
                      onChange={e => onUpdate('bypassM', e.target.value ? Number(e.target.value) : undefined)}
                      placeholder="0"
                    />
                  </label>
                  <label>
                    Fibra vinculada
                    <select
                      value={feature.properties.linkedLineId ?? ''}
                      onChange={e => onUpdate('linkedLineId', e.target.value || undefined)}>
                      <option value="">— Sin vincular —</option>
                      {fiberLines.map(f => (
                        <option key={f.properties.id} value={f.properties.id}>
                          {f.properties.name || f.properties.code || f.properties.id.slice(0, 8)}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              )}

              <button className="danger compact" onClick={onRemove}>Eliminar</button>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
