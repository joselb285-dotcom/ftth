import { useState } from 'react'
import type { AppFeature, FiberCable, SpliceCard } from './types'
import { typeLabels, statusLabels, featureTypeClass, FeatureIcons } from './editorConstants'
import { computeLineLength } from './OpticalPath'
import StreetViewPanel, { getFeatureLatLng, streetViewLink } from './StreetViewPanel'

// ── Colores de fibra ──────────────────────────────────────────────────────────
const FIBER_HEX: Record<string, string> = {
  blue: '#2979ff', orange: '#ff6d00', green: '#00c853', brown: '#8d6e63',
  slate: '#90a4ae', white: '#dddddd', red: '#f44336', black: '#757575',
  yellow: '#ffd600', violet: '#ab47bc', rose: '#f06292', aqua: '#00e5ff',
}

function powerBadge(dbm: string | undefined) {
  if (!dbm) return null
  const v = parseFloat(dbm)
  if (isNaN(v)) return null
  const cls = v >= -8 ? 'pwr-high' : v >= -27 ? 'pwr-ok' : v >= -30 ? 'pwr-warn' : 'pwr-crit'
  return <span className={`fv-pwr-badge ${cls}`}>{v.toFixed(1)} dBm</span>
}

// ── Vista de campo inline de la carta de empalme ─────────────────────────────
function SpliceFieldDetail({ card }: { card: SpliceCard }) {
  const connMap = new Map<string, { toFiberId: string; toCableId: string; active: boolean }>()
  for (const conn of card.connections) {
    connMap.set(conn.leftFiberId,  { toFiberId: conn.rightFiberId, toCableId: '', active: conn.active })
    connMap.set(conn.rightFiberId, { toFiberId: conn.leftFiberId,  toCableId: '', active: conn.active })
  }
  // Enriquecer con cableId destino
  for (const [fid, info] of connMap) {
    for (const cable of card.cables) {
      if (cable.fibers.some(f => f.id === info.toFiberId)) {
        connMap.set(fid, { ...info, toCableId: cable.id })
        break
      }
    }
  }

  function fiberOfId(id: string) {
    for (const c of card.cables)
      for (const f of c.fibers)
        if (f.id === id) return { fiber: f, cable: c }
    return null
  }

  const sides: Array<'left' | 'right'> = ['left', 'right']
  return (
    <div className="fv-splice-detail">
      {sides.map(side => {
        const sideCables = card.cables.filter(c => c.side === side)
        if (sideCables.length === 0) return null
        return (
          <div key={side} className="fv-splice-side">
            <div className="fv-splice-side-label">{side === 'left' ? '⬅ Entrada' : '➡ Salida'}</div>
            {sideCables.map(cable => (
              <div key={cable.id} className="fv-splice-cable">
                <div className="fv-splice-cable-name">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12h18"/></svg>
                  {cable.name || 'Cable'} <span className="fv-splice-fcount">({cable.fibers.length}f)</span>
                </div>
                <div className="fv-splice-fibers">
                  {cable.fibers.map(fiber => {
                    const conn = connMap.get(fiber.id)
                    const dest = conn ? fiberOfId(conn.toFiberId) : null
                    const clientName = fiber.clientName || fiber.clientInfo?.name
                    const power = fiber.clientInfo?.onuPowerDbm
                    const fused = !!conn
                    return (
                      <div key={fiber.id} className={`fv-fiber-row${fused ? (conn!.active ? ' fused-active' : ' fused-inactive') : ' fused-none'}`}>
                        {/* Color dot + número */}
                        <span className="fv-fiber-dot" style={{ background: FIBER_HEX[fiber.color] ?? '#94a3b8' }} />
                        <span className="fv-fiber-num">F{fiber.index}</span>
                        {/* Destino de la fusión */}
                        {dest ? (
                          <span className="fv-fiber-dest">
                            <span className="fv-fiber-dest-dot" style={{ background: FIBER_HEX[dest.fiber.color] ?? '#94a3b8' }} />
                            {dest.cable.name || 'Cable'} F{dest.fiber.index}
                          </span>
                        ) : (
                          <span className="fv-fiber-no-conn">sin fusión</span>
                        )}
                        {/* Cliente */}
                        {clientName && <span className="fv-fiber-client">{clientName}</span>}
                        {/* Potencia */}
                        {powerBadge(power)}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )
      })}
      {(card.splitters ?? []).length > 0 && (
        <div className="fv-splice-side">
          <div className="fv-splice-side-label">◉ Splitters</div>
          {(card.splitters ?? []).map(sp => (
            <div key={sp.id} className="fv-splice-cable">
              <div className="fv-splice-cable-name">{sp.name || 'Splitter'} 1×{sp.ratio}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

interface Props {
  features: AppFeature[]
  selectedFeature: AppFeature | null
  powerAlarms: { fiberId: string; featureName: string; clientName: string; powerDbm: number; severity: 'crit' | 'warn' }[]
  surveyMode: boolean
  userEmail: string
  onSelectFeature: (id: string) => void
  onTraceOpticalPath: (fiberId: string) => void
  onOpenSpliceCard: () => void
  onOpenRack: () => void
  onUpdateNotes: (notes: string) => void
  onToggleSurveyMode: () => void
  onStartAddPole: () => void
  onSearch: () => void
  onGoBack: () => void
}

const STATUS_COLOR: Record<string, string> = {
  active: '#10b981', planned: '#64748b', maintenance: '#f59e0b', damaged: '#ef4444',
}

const POLE_TYPE_LABEL: Record<string, string> = {
  hormigon: 'Hormigón', metalico: 'Metálico', madera: 'Madera', otro: 'Otro',
}
const POLE_COND_COLOR: Record<string, string> = {
  bueno: '#10b981', regular: '#f59e0b', malo: '#ef4444',
}
const POLE_ATT_LABEL: Record<string, string> = {
  retencion: 'Retención', suspension: 'Suspensión', ambas: 'Retención + Suspensión',
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return <div className="fv-section-header">{children}</div>
}

function StatRow({ icon, label, value, highlight }: { icon: React.ReactNode; label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`fv-stat-row${highlight ? ' fv-stat-highlight' : ''}`}>
      <span className="fv-stat-icon">{icon}</span>
      <span className="fv-stat-label">{label}</span>
      <span className="fv-stat-value">{value}</span>
    </div>
  )
}

export default function FieldView({
  features, selectedFeature, powerAlarms, surveyMode, userEmail,
  onSelectFeature, onTraceOpticalPath, onOpenSpliceCard, onOpenRack,
  onUpdateNotes, onToggleSurveyMode, onStartAddPole, onSearch, onGoBack,
}: Props) {
  const [notes, setNotes] = useState('')
  const [notesSaved, setNotesSaved] = useState(false)
  const [featureIdForNotes, setFeatureIdForNotes] = useState<string | null>(null)
  const [showStreetView, setShowStreetView] = useState(false)
  const [showSpliceDetail, setShowSpliceDetail] = useState(false)

  // Reset notes when feature changes
  if (selectedFeature?.properties.id !== featureIdForNotes) {
    setNotes(selectedFeature?.properties.notes ?? '')
    setNotesSaved(false)
    setFeatureIdForNotes(selectedFeature?.properties.id ?? null)
  }

  function saveNotes() {
    onUpdateNotes(notes)
    setNotesSaved(true)
    setTimeout(() => setNotesSaved(false), 2000)
  }

  const p = selectedFeature?.properties
  const statusColor = p ? (STATUS_COLOR[p.status] ?? '#94a3b8') : '#94a3b8'

  // Cable length calculation
  let geoLenM: number | null = null
  let totalM: number | null = null
  if (selectedFeature?.geometry.type === 'LineString' && p) {
    geoLenM = Math.round(computeLineLength((selectedFeature.geometry as GeoJSON.LineString).coordinates) * 1000)
    const extra = (p.extraLengthM ?? 0) + (p.bypassM ?? 0)
    totalM = geoLenM + extra
  }

  // Splice card summary
  const cables = p?.spliceCard?.cables ?? []
  const connections = p?.spliceCard?.connections ?? []
  const splitters = p?.spliceCard?.splitters ?? []
  const clients = cables.flatMap(c => c.fibers.filter(f => f.clientName || f.clientInfo?.name))
  const activeConns = connections.filter(c => c.active).length

  // Power readings for splice card clients (from this feature's clients)
  const powerReadings = clients
    .filter(f => f.clientInfo?.onuPowerDbm)
    .map(f => ({
      name: f.clientInfo?.name || f.clientName || '',
      dbm: parseFloat(f.clientInfo!.onuPowerDbm!),
      serial: f.clientInfo?.onuSerial || '',
      model: f.clientInfo?.onuModel || '',
    }))
    .sort((a, b) => a.dbm - b.dbm)

  function powerClass(dbm: number): string {
    if (dbm >= -8)  return 'pwr-high'
    if (dbm >= -27) return 'pwr-ok'
    if (dbm >= -30) return 'pwr-warn'
    return 'pwr-crit'
  }

  // Count survey poles
  const polesCount = features.filter(f => f.properties.featureType === 'poste').length
  const badPolesCount = features.filter(f => f.properties.featureType === 'poste' && f.properties.poleCondition === 'malo').length

  return (
    <aside className="fv-sidebar">

      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <div className="fv-topbar">
        <button className="fv-back-btn" onClick={onGoBack} title="Volver">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6"/>
          </svg>
        </button>
        <div className="fv-topbar-title">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/>
          </svg>
          Modo técnico
        </div>
        <button className="fv-search-btn" onClick={onSearch} title="Buscar elemento (Ctrl+K)">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
          </svg>
        </button>
      </div>

      {/* ── Power alarms ─────────────────────────────────────────────────── */}
      {powerAlarms.length > 0 && (
        <div className="fv-alarms">
          <SectionHeader>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            Alarmas de potencia ({powerAlarms.length})
          </SectionHeader>
          {powerAlarms.map(a => (
            <button key={a.fiberId} className={`fv-alarm-row fv-alarm-${a.severity}`}
              onClick={() => onTraceOpticalPath(a.fiberId)}>
              <span className={`fv-alarm-dot fv-alarm-${a.severity}`} />
              <span className="fv-alarm-info">
                <strong>{a.clientName}</strong>
                <small>{a.featureName} · {a.powerDbm.toFixed(1)} dBm</small>
              </span>
              <span className="fv-alarm-trace" title="Trazar camino óptico">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                </svg>
              </span>
            </button>
          ))}
        </div>
      )}

      {/* ── Selected feature ──────────────────────────────────────────────── */}
      {selectedFeature && p ? (
        <div className="fv-feature">
          {/* Header */}
          <div className="fv-feature-header">
            <span className={`fv-feature-icon ${featureTypeClass[p.featureType] ?? ''}`}>
              {FeatureIcons[p.featureType]}
            </span>
            <div className="fv-feature-info">
              <div className="fv-feature-name">{p.name || typeLabels[p.featureType]}</div>
              <div className="fv-feature-meta">
                {p.code && <span className="fv-code">{p.code}</span>}
                <span className="fv-type">{typeLabels[p.featureType]}</span>
                <span className="fv-status-dot" style={{ background: statusColor }} />
                <span className="fv-status-text">{statusLabels[p.status]}</span>
              </div>
            </div>
          </div>

          {/* Street View button */}
          {(() => {
            const coords = getFeatureLatLng(selectedFeature)
            if (!coords) return null
            const [lat, lng] = coords
            return (
              <div className="fv-sv-row">
                <button
                  className={`fv-sv-btn${showStreetView ? ' active' : ''}`}
                  onClick={() => setShowStreetView(v => !v)}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="10" r="3"/>
                    <path d="M12 2a8 8 0 00-8 8c0 5.4 7.05 11.5 7.73 12.11a.75.75 0 001.54 0C13.95 21.5 20 15.4 20 10a8 8 0 00-8-8z"/>
                  </svg>
                  Street View
                </button>
                <a href={streetViewLink(lat, lng)} target="_blank" rel="noopener noreferrer" className="fv-sv-open-link" title="Abrir en Maps">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/>
                    <polyline points="15 3 21 3 21 9"/>
                    <line x1="10" y1="14" x2="21" y2="3"/>
                  </svg>
                </a>
              </div>
            )
          })()}

          {/* Street View embedded panel */}
          {showStreetView && (
            <StreetViewPanel feature={selectedFeature} onClose={() => setShowStreetView(false)} />
          )}

          {/* ── FIBER LINE info ──────────────────────────────────────────── */}
          {p.featureType === 'fiber_line' && geoLenM !== null && (
            <>
              <SectionHeader>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 12h18M3 6l3 6-3 6M21 6l-3 6 3 6"/>
                </svg>
                Longitud del cable
              </SectionHeader>
              <StatRow icon={
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 12h18M3 6l3 6-3 6M21 6l-3 6 3 6"/>
                </svg>
              } label="Trazada en mapa" value={`${geoLenM.toLocaleString('es-AR')} m`} />
              {(p.extraLengthM ?? 0) > 0 && (
                <StatRow icon="↩" label={`Ganancia (pos. ${Math.round((p.extraLengthPositionFraction ?? 0.5) * geoLenM!)} m)`}
                  value={`+${p.extraLengthM} m`} />
              )}
              {(p.bypassM ?? 0) > 0 && (
                <StatRow icon="🔧" label="By-pass / reparación" value={`+${p.bypassM} m`} />
              )}
              {totalM !== null && totalM !== geoLenM && (
                <StatRow icon="📏" label="Longitud física total" value={`${totalM!.toLocaleString('es-AR')} m`} highlight />
              )}
              {p.fiberCount && (
                <StatRow icon="🔴" label="Cantidad de fibras" value={`${p.fiberCount} fibras`} />
              )}
              {p.fiberAttenuationDbPerKm && (
                <StatRow icon="📉" label="Atenuación" value={`${p.fiberAttenuationDbPerKm} dB/km`} />
              )}
              <button className="fv-action-btn fv-trace-btn" onClick={() => onTraceOpticalPath(selectedFeature.properties.id)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 17H7A5 5 0 017 7h2M15 7h2a5 5 0 010 10h-2M8 12h8"/>
                </svg>
                Trazar camino óptico
              </button>
            </>
          )}

          {/* ── SPLICE BOX / NAP info ────────────────────────────────────── */}
          {(p.featureType === 'splice_box' || p.featureType === 'nap') && (
            <>
              {cables.length > 0 && (
                <>
                  <SectionHeader>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/>
                    </svg>
                    Carta de empalme
                  </SectionHeader>
                  <StatRow icon="〰" label="Cables" value={`${cables.length} (${cables.filter(c=>c.side==='left').length}E + ${cables.filter(c=>c.side==='right').length}S)`} />
                  <StatRow icon="⚡" label="Fusiones activas" value={`${activeConns} / ${connections.length}`} />
                  {splitters.length > 0 && (
                    <StatRow icon="◉" label="Splitters" value={splitters.map(s => `1×${s.ratio}`).join(', ')} />
                  )}
                  {clients.length > 0 && (
                    <StatRow icon="👤" label="Clientes" value={`${clients.length}`} highlight />
                  )}

                  {/* Toggle de detalle inline */}
                  <button
                    className={`fv-splice-toggle${showSpliceDetail ? ' open' : ''}`}
                    onClick={() => setShowSpliceDetail(v => !v)}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      {showSpliceDetail
                        ? <path d="M18 15l-6-6-6 6"/>
                        : <path d="M6 9l6 6 6-6"/>}
                    </svg>
                    {showSpliceDetail ? 'Ocultar fibras' : 'Ver fibras y clientes'}
                  </button>
                  {showSpliceDetail && p.spliceCard && (
                    <SpliceFieldDetail card={p.spliceCard} />
                  )}
                </>
              )}

              {/* Power readings */}
              {powerReadings.length > 0 && (
                <>
                  <SectionHeader>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="22,12 18,12 15,21 9,3 6,12 2,12"/>
                    </svg>
                    Potencias ópticas
                  </SectionHeader>
                  {powerReadings.map((r, i) => (
                    <div key={i} className={`fv-power-row ${powerClass(r.dbm)}`}>
                      <span className="fv-power-dot" />
                      <span className="fv-power-name">{r.name}</span>
                      <span className="fv-power-dbm">{r.dbm.toFixed(1)} dBm</span>
                      {r.serial && <span className="fv-power-serial">{r.serial}</span>}
                    </div>
                  ))}
                </>
              )}

              <button className="fv-action-btn" onClick={onOpenSpliceCard}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/>
                </svg>
                {cables.length > 0 ? 'Editar carta de empalme' : 'Carta de empalme (vacía)'}
              </button>
            </>
          )}

          {/* ── NODE info ────────────────────────────────────────────────── */}
          {p.featureType === 'node' && (
            <>
              <SectionHeader>Equipamiento activo</SectionHeader>
              {p.oltModel && <StatRow icon="🖥" label="OLT" value={p.oltModel} />}
              {p.mikrotikModel && <StatRow icon="📡" label="Mikrotik" value={p.mikrotikModel} />}
              {p.odfConnectorType && <StatRow icon="🔌" label="Conectores ODF" value={p.odfConnectorType} />}
              {p.odfCount && <StatRow icon="🗂" label="Bandejas ODF" value={String(p.odfCount)} />}
              {p.batteryCount && <StatRow icon="🔋" label="Baterías" value={String(p.batteryCount)} />}
              <button className="fv-action-btn" onClick={onOpenRack}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>
                </svg>
                Ver rack 19"
              </button>
            </>
          )}

          {/* ── POSTE info ───────────────────────────────────────────────── */}
          {p.featureType === 'poste' && (
            <>
              <SectionHeader>Datos del relevamiento</SectionHeader>
              {p.poleType && <StatRow icon="🏗" label="Tipo" value={POLE_TYPE_LABEL[p.poleType] ?? p.poleType} />}
              {p.poleCondition && (
                <StatRow icon={<span className="fv-cond-dot" style={{ background: POLE_COND_COLOR[p.poleCondition] }} />}
                  label="Condición"
                  value={p.poleCondition.charAt(0).toUpperCase() + p.poleCondition.slice(1)}
                  highlight={p.poleCondition === 'malo'} />
              )}
              {p.poleAttachment && <StatRow icon="🔗" label="Fijación" value={POLE_ATT_LABEL[p.poleAttachment] ?? p.poleAttachment} />}
              {p.poleElement && p.poleElement !== 'ninguno' && (
                <StatRow icon="📦" label="Elemento instalado"
                  value={{ nap: 'Caja NAP', empalme: 'Caja de empalme', reserva: 'Reserva de cable' }[p.poleElement] ?? ''} />
              )}
              {(p.poleGainM ?? 0) > 0 && (
                <StatRow icon="↩" label="Ganancia de cable" value={`${p.poleGainM} m`} highlight />
              )}
              {p.surveyedBy && <StatRow icon="👤" label="Relevado por" value={p.surveyedBy} />}
              {p.surveyedAt && <StatRow icon="🕐" label="Fecha" value={new Date(p.surveyedAt).toLocaleDateString('es-AR')} />}
            </>
          )}

          {/* ── Notes ───────────────────────────────────────────────────── */}
          <div className="fv-notes-section">
            <SectionHeader>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
              </svg>
              Notas de campo
            </SectionHeader>
            <textarea className="fv-notes-input"
              placeholder="Observaciones, condiciones del tendido, acceso..."
              value={notes}
              onChange={e => { setNotes(e.target.value); setNotesSaved(false) }}
              rows={3}
            />
            <button className={`fv-notes-save-btn${notesSaved ? ' saved' : ''}`}
              onClick={saveNotes}
              disabled={notes === (p.notes ?? '')}>
              {notesSaved ? '✓ Guardado' : 'Guardar nota'}
            </button>
          </div>
        </div>
      ) : (
        /* ── Empty state ──────────────────────────────────────────────── */
        <div className="fv-empty">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
          </svg>
          <p>Tocá un elemento en el mapa para ver su información</p>
          <button className="fv-search-cta" onClick={onSearch}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
            </svg>
            Buscar por nombre, cliente, serial...
          </button>
        </div>
      )}

      {/* ── Survey section ────────────────────────────────────────────────── */}
      <div className="fv-survey-section">
        <div className={`fv-survey-header${surveyMode ? ' active' : ''}`}>
          <div>
            <div className="fv-survey-title">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="2" x2="12" y2="22"/>
                <line x1="6" y1="6" x2="18" y2="6"/>
                <line x1="8" y1="10" x2="16" y2="10"/>
              </svg>
              Relevamiento de postes
            </div>
            {polesCount > 0 && (
              <div className="fv-survey-count">
                {polesCount} relevado{polesCount !== 1 ? 's' : ''}
                {badPolesCount > 0 && <span className="fv-survey-bad"> · {badPolesCount} en mal estado</span>}
              </div>
            )}
          </div>
          <button
            className={`fv-survey-toggle${surveyMode ? ' on' : ''}`}
            onClick={onToggleSurveyMode}
            title={surveyMode ? 'Desactivar modo relevamiento' : 'Activar modo relevamiento'}>
            {surveyMode ? 'ON' : 'OFF'}
          </button>
        </div>
        {surveyMode && (
          <button className="fv-add-pole-btn" onClick={onStartAddPole}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Colocar poste en mapa
          </button>
        )}
        {surveyMode && (
          <p className="fv-survey-hint">
            {surveyMode
              ? '▸ Activá "Colocar poste" y hacé clic en el mapa para geolocalizar'
              : 'Activá para agregar postes y materiales al relevamiento'}
          </p>
        )}
      </div>
    </aside>
  )
}
