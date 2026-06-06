import { useCallback, useEffect, useRef, useState } from 'react'
import type { MonitoringDevice, MonitoringMetric, MonitoringAlert } from './types'
import {
  getDevices, upsertDevice, deleteDevice, updateDeviceStatus,
  getLatestMetrics, getMetrics, pushMetric, getAlerts,
  acknowledgeAlert, resolveAlert, createAlert, evaluateAlertRules, generateAgentScript,
} from './monitoring'
import MonitoringDeviceModal from './MonitoringDeviceModal'
import BandwidthChart from './BandwidthChart'
import { supabase } from './supabase'

interface Props {
  tenantId: string
  userEmail: string
  isReadOnly?: boolean
  onBack: () => void
}

const SEV_CLASS: Record<MonitoringAlert['severity'], string> = {
  critical: 'badge-crit',
  warning:  'badge-warn',
  info:     'badge-info',
}
const SEV_LABEL: Record<MonitoringAlert['severity'], string> = {
  critical: 'Crítica',
  warning:  'Advertencia',
  info:     'Info',
}
const STATUS_ICON: Record<MonitoringDevice['status'], string> = {
  online:   '🟢',
  offline:  '🔴',
  degraded: '🟡',
  unknown:  '⚪',
}
const TYPE_LABEL: Record<MonitoringDevice['type'], string> = {
  olt:      'OLT',
  switch:   'Switch',
  router:   'Router',
  onu:      'ONU',
  mikrotik: 'Mikrotik',
  other:    'Otro',
}

type MainTab = 'devices' | 'alerts' | 'metrics'

export default function MonitoringView({ tenantId, userEmail, isReadOnly, onBack }: Props) {
  const [devices, setDevices]         = useState<MonitoringDevice[]>([])
  const [alerts, setAlerts]           = useState<MonitoringAlert[]>([])
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState('')
  const [tab, setTab]                 = useState<MainTab>('devices')
  const [alertFilter, setAlertFilter] = useState<MonitoringAlert['status'] | 'all'>('open')
  const [selectedDevice, setSelectedDevice] = useState<MonitoringDevice | null>(null)
  const [deviceMetrics, setDeviceMetrics]   = useState<MonitoringMetric[]>([])
  const [metricsHistory, setMetricsHistory] = useState<MonitoringMetric[]>([])
  const [showDeviceModal, setShowDeviceModal] = useState(false)
  const [editingDevice, setEditingDevice]     = useState<MonitoringDevice | null>(null)
  const [showManualMetric, setShowManualMetric] = useState(false)
  const [manualForm, setManualForm] = useState({ metricKey: 'pon.power_dbm', value: '', unit: 'dBm', label: '' })
  const [manualSaving, setManualSaving] = useState(false)
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const supabaseUrl = (supabase as unknown as { supabaseUrl: string }).supabaseUrl ?? ''
  const supabaseKey = (supabase as unknown as { supabaseKey: string }).supabaseKey ?? ''

  const load = useCallback(async () => {
    try {
      const [devs, als] = await Promise.all([
        getDevices(tenantId),
        getAlerts(tenantId, alertFilter),
      ])
      setDevices(devs)
      setAlerts(als)
      setError('')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al cargar')
    } finally {
      setLoading(false)
    }
  }, [tenantId, alertFilter])

  useEffect(() => { setLoading(true); load() }, [load])

  // Auto-refresh cada 30 s mientras la pestaña está abierta
  useEffect(() => {
    pollTimerRef.current = setInterval(load, 30_000)
    return () => { if (pollTimerRef.current) clearInterval(pollTimerRef.current) }
  }, [load])

  async function selectDevice(d: MonitoringDevice) {
    setSelectedDevice(d)
    const [latest, history] = await Promise.all([
      getLatestMetrics(d.id),
      getMetrics(d.id, undefined, 200),
    ])
    setDeviceMetrics(latest)
    setMetricsHistory(history)
    setTab('metrics')
  }

  async function handleSaveDevice(d: Omit<MonitoringDevice, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) {
    const saved = await upsertDevice(d as MonitoringDevice)
    setDevices(prev => {
      const exists = prev.find(x => x.id === saved.id)
      return exists ? prev.map(x => x.id === saved.id ? saved : x) : [saved, ...prev]
    })
    setShowDeviceModal(false)
  }

  async function handleDeleteDevice(id: string) {
    if (!confirm('¿Eliminar este dispositivo y todas sus métricas?')) return
    await deleteDevice(id)
    setDevices(prev => prev.filter(d => d.id !== id))
    if (selectedDevice?.id === id) { setSelectedDevice(null); setTab('devices') }
  }

  async function handleManualMetric() {
    if (!selectedDevice || !manualForm.value) return
    setManualSaving(true)
    try {
      const metric: Omit<MonitoringMetric, 'id' | 'ts'> = {
        deviceId:    selectedDevice.id,
        tenantId,
        metricKey:   manualForm.metricKey,
        metricValue: Number(manualForm.value),
        metricUnit:  manualForm.unit || undefined,
        label:       manualForm.label || undefined,
        source:      'manual',
      }
      await pushMetric(metric)
      // Evaluate alert rules
      const newMetrics = [{ ...metric, id: '', ts: new Date().toISOString() } as MonitoringMetric, ...deviceMetrics]
      const triggered = evaluateAlertRules(selectedDevice, newMetrics)
      for (const a of triggered) await createAlert(a)
      // Refresh metrics
      const [latest, history] = await Promise.all([
        getLatestMetrics(selectedDevice.id),
        getMetrics(selectedDevice.id, undefined, 200),
      ])
      setDeviceMetrics(latest)
      setMetricsHistory(history)
      setManualForm(prev => ({ ...prev, value: '' }))
      setShowManualMetric(false)
      if (triggered.length) await load()
    } finally { setManualSaving(false) }
  }

  async function handleAcknowledge(id: string) {
    await acknowledgeAlert(id, userEmail)
    setAlerts(prev => prev.map(a => a.id === id ? { ...a, status: 'acknowledged', acknowledgedBy: userEmail } : a))
  }

  async function handleResolve(id: string) {
    await resolveAlert(id)
    setAlerts(prev => prev.map(a => a.id === id ? { ...a, status: 'resolved', resolvedAt: new Date().toISOString() } : a))
  }

  function downloadAgentScript() {
    const script = generateAgentScript(tenantId, supabaseUrl, supabaseKey)
    const blob = new Blob([script], { type: 'text/javascript' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = 'ftth-agent.js'
    a.click()
    URL.revokeObjectURL(url)
  }

  const openAlerts = alerts.filter(a => a.status === 'open').length
  const criticalAlerts = alerts.filter(a => a.status === 'open' && a.severity === 'critical').length
  const onlineCount  = devices.filter(d => d.status === 'online').length
  const offlineCount = devices.filter(d => d.status === 'offline').length

  // Build chart data from metrics history (bandwidth-like for series)
  const chartInData  = metricsHistory.filter(m => m.metricKey === 'interface.rx_bps').map(m => ({ clock: new Date(m.ts).getTime() / 1000, value: m.metricValue ?? 0 }))
  const chartOutData = metricsHistory.filter(m => m.metricKey === 'interface.tx_bps').map(m => ({ clock: new Date(m.ts).getTime() / 1000, value: m.metricValue ?? 0 }))

  return (
    <div className="nms-shell">
      {/* ── Header ── */}
      <header className="nms-header">
        <div className="nms-header-left">
          <button className="secondary" onClick={onBack}>← Volver</button>
          <div>
            <h1 className="nms-title">Monitoreo de Red</h1>
            <p className="nms-subtitle">NMS propio — dispositivos, métricas y alertas</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="secondary" onClick={downloadAgentScript} title="Descarga el script Node.js para polling SNMP/HTTP en la red">
            ⬇ Agente Node.js
          </button>
          {!isReadOnly && (
            <button onClick={() => { setEditingDevice(null); setShowDeviceModal(true) }}>+ Agregar dispositivo</button>
          )}
        </div>
      </header>

      {/* ── Stats ── */}
      <div className="nms-stats">
        <div className="nms-stat">
          <span className="nms-stat-val">{devices.length}</span>
          <span className="nms-stat-lbl">Dispositivos</span>
        </div>
        <div className={`nms-stat${onlineCount > 0 ? ' nms-stat-ok' : ''}`}>
          <span className="nms-stat-val">🟢 {onlineCount}</span>
          <span className="nms-stat-lbl">En línea</span>
        </div>
        <div className={`nms-stat${offlineCount > 0 ? ' nms-stat-crit' : ''}`}>
          <span className="nms-stat-val">🔴 {offlineCount}</span>
          <span className="nms-stat-lbl">Fuera de línea</span>
        </div>
        <div className={`nms-stat${criticalAlerts > 0 ? ' nms-stat-crit' : openAlerts > 0 ? ' nms-stat-warn' : ''}`}>
          <span className="nms-stat-val">{openAlerts}</span>
          <span className="nms-stat-lbl">Alertas abiertas</span>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="nms-tabs">
        <button className={`nms-tab${tab === 'devices' ? ' nms-tab-active' : ''}`} onClick={() => setTab('devices')}>
          Dispositivos
        </button>
        <button className={`nms-tab${tab === 'alerts' ? ' nms-tab-active' : ''}`} onClick={() => setTab('alerts')}>
          Alertas {openAlerts > 0 && <span className={`nms-badge ${criticalAlerts > 0 ? 'nms-badge-crit' : 'nms-badge-warn'}`}>{openAlerts}</span>}
        </button>
        {selectedDevice && (
          <button className={`nms-tab${tab === 'metrics' ? ' nms-tab-active' : ''}`} onClick={() => setTab('metrics')}>
            {selectedDevice.name} — Métricas
          </button>
        )}
      </div>

      {error && <p className="empty-state" style={{ color: '#f87171' }}>✗ {error}</p>}

      {/* ══ Devices tab ══ */}
      {tab === 'devices' && (
        <div className="nms-devices-grid">
          {loading && <p className="empty-state">Cargando dispositivos...</p>}
          {!loading && devices.length === 0 && (
            <div className="nms-empty">
              <p>Sin dispositivos registrados.</p>
              {!isReadOnly && <button onClick={() => { setEditingDevice(null); setShowDeviceModal(true) }}>+ Agregar primer dispositivo</button>}
            </div>
          )}
          {devices.map(d => (
            <div key={d.id} className="nms-device-card" onClick={() => selectDevice(d)}>
              <div className="nms-device-top">
                <span className="nms-device-icon">{STATUS_ICON[d.status]}</span>
                <div>
                  <div className="nms-device-name">{d.name}</div>
                  <div className="nms-device-type">{TYPE_LABEL[d.type]}{d.vendor ? ` · ${d.vendor}` : ''}{d.model ? ` ${d.model}` : ''}</div>
                </div>
                {!isReadOnly && (
                  <div className="nms-device-actions" onClick={e => e.stopPropagation()}>
                    <button className="secondary" style={{ padding: '3px 8px', fontSize: '0.75rem' }}
                      onClick={() => { setEditingDevice(d); setShowDeviceModal(true) }}>✎</button>
                    <button className="secondary" style={{ padding: '3px 8px', fontSize: '0.75rem' }}
                      onClick={() => handleDeleteDevice(d.id)}>🗑</button>
                  </div>
                )}
              </div>
              {d.ipAddress && <div className="nms-device-ip">{d.protocol.toUpperCase()} · {d.ipAddress}</div>}
              {d.lastSeenAt && (
                <div className="nms-device-lastseen">
                  Última vez: {new Date(d.lastSeenAt).toLocaleString('es-AR')}
                </div>
              )}
              {d.notes && <div className="nms-device-notes">{d.notes}</div>}
              {/* Latest metrics summary */}
              <DeviceMetricsSummary deviceId={d.id} tenantId={tenantId} />
            </div>
          ))}
        </div>
      )}

      {/* ══ Alerts tab ══ */}
      {tab === 'alerts' && (
        <div className="nms-alerts-panel">
          <div className="nms-alerts-bar">
            {(['open','acknowledged','resolved','all'] as const).map(s => (
              <button key={s} className={`secondary${alertFilter === s ? ' active' : ''}`}
                onClick={() => setAlertFilter(s)}>
                {s === 'open' ? 'Abiertas' : s === 'acknowledged' ? 'Reconocidas' : s === 'resolved' ? 'Resueltas' : 'Todas'}
              </button>
            ))}
            <button className="secondary" style={{ marginLeft: 'auto' }} onClick={load}>↻ Actualizar</button>
          </div>

          {alerts.length === 0 && <p className="empty-state">Sin alertas {alertFilter !== 'all' ? alertFilter : ''}</p>}

          {alerts.map(a => {
            const dev = devices.find(d => d.id === a.deviceId)
            return (
              <div key={a.id} className={`nms-alert-row nms-alert-${a.severity}`}>
                <span className={`badge ${SEV_CLASS[a.severity]}`}>{SEV_LABEL[a.severity]}</span>
                <div className="nms-alert-body">
                  <div className="nms-alert-msg">{a.message}</div>
                  <div className="nms-alert-meta">
                    {dev && <span>📡 {dev.name}</span>}
                    {a.metricKey && <span>· {a.metricKey}</span>}
                    <span>· {new Date(a.createdAt).toLocaleString('es-AR')}</span>
                    {a.acknowledgedBy && <span>· ✓ {a.acknowledgedBy}</span>}
                  </div>
                </div>
                {!isReadOnly && a.status === 'open' && (
                  <button className="secondary" style={{ fontSize: '0.78rem' }} onClick={() => handleAcknowledge(a.id)}>
                    Reconocer
                  </button>
                )}
                {!isReadOnly && a.status !== 'resolved' && (
                  <button className="secondary" style={{ fontSize: '0.78rem' }} onClick={() => handleResolve(a.id)}>
                    Resolver
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ══ Metrics tab ══ */}
      {tab === 'metrics' && selectedDevice && (
        <div className="nms-metrics-panel">
          <div className="nms-metrics-header">
            <h3>{selectedDevice.name}</h3>
            <div style={{ display: 'flex', gap: 8 }}>
              {!isReadOnly && (
                <button className="secondary" onClick={() => setShowManualMetric(true)}>+ Ingresar métrica</button>
              )}
              <button className="secondary" onClick={() => selectDevice(selectedDevice)}>↻</button>
            </div>
          </div>

          {/* Latest metrics table */}
          <div className="nms-metrics-table">
            <div className="nms-metrics-thead">
              <span>Métrica</span><span>Valor</span><span>Unidad</span><span>Etiqueta</span><span>Fuente</span><span>Hora</span>
            </div>
            {deviceMetrics.length === 0 && <p className="empty-state">Sin métricas para este dispositivo</p>}
            {deviceMetrics.map(m => (
              <div key={m.id} className="nms-metrics-row">
                <span><code>{m.metricKey}</code></span>
                <span style={{ fontWeight: 600, color: getPowerColor(m.metricKey, m.metricValue) }}>
                  {m.metricValue != null ? m.metricValue : '—'}
                </span>
                <span>{m.metricUnit ?? ''}</span>
                <span>{m.label ?? '—'}</span>
                <span className={`nms-source-badge nms-source-${m.source}`}>{m.source}</span>
                <span>{new Date(m.ts).toLocaleTimeString('es-AR')}</span>
              </div>
            ))}
          </div>

          {/* Bandwidth chart (if rx/tx data available) */}
          {(chartInData.length > 0 || chartOutData.length > 0) && (
            <div style={{ marginTop: 16 }}>
              <div className="nms-metrics-section-title">Tráfico de interfaz</div>
              <div className="bw-chart-container">
                <BandwidthChart inData={chartInData} outData={chartOutData} unit="bps" hours={24} />
              </div>
            </div>
          )}

          {/* Manual metric entry panel */}
          {showManualMetric && (
            <div className="nms-manual-metric">
              <h4>Ingresar métrica manual</h4>
              <div className="form-grid-2">
                <label>
                  Clave de métrica
                  <select value={manualForm.metricKey} onChange={e => setManualForm(p => ({ ...p, metricKey: e.target.value }))}>
                    <option value="pon.power_dbm">pon.power_dbm — Potencia ONU (dBm)</option>
                    <option value="pon.rx_bytes">pon.rx_bytes — Bytes recibidos</option>
                    <option value="pon.tx_bytes">pon.tx_bytes — Bytes enviados</option>
                    <option value="interface.rx_bps">interface.rx_bps — RX bps</option>
                    <option value="interface.tx_bps">interface.tx_bps — TX bps</option>
                    <option value="system.cpu_pct">system.cpu_pct — CPU %</option>
                    <option value="system.mem_pct">system.mem_pct — RAM %</option>
                    <option value="system.uptime_s">system.uptime_s — Uptime (s)</option>
                    <option value="custom">custom — Personalizada</option>
                  </select>
                </label>
                {manualForm.metricKey === 'custom' && (
                  <label>
                    Nombre personalizado
                    <input value={manualForm.metricKey} onChange={e => setManualForm(p => ({ ...p, metricKey: e.target.value }))} placeholder="custom.mi_metrica" />
                  </label>
                )}
                <label>
                  Valor
                  <input type="number" step="any" value={manualForm.value} onChange={e => setManualForm(p => ({ ...p, value: e.target.value }))} placeholder="-25.5" />
                </label>
                <label>
                  Unidad
                  <input value={manualForm.unit} onChange={e => setManualForm(p => ({ ...p, unit: e.target.value }))} placeholder="dBm" />
                </label>
                <label style={{ gridColumn: '1 / -1' }}>
                  Etiqueta (contexto)
                  <input value={manualForm.label} onChange={e => setManualForm(p => ({ ...p, label: e.target.value }))} placeholder="Ej: PON Puerto 1, ONU HWTC123" />
                </label>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button onClick={handleManualMetric} disabled={manualSaving || !manualForm.value}>
                  {manualSaving ? 'Guardando...' : 'Registrar'}
                </button>
                <button className="secondary" onClick={() => setShowManualMetric(false)}>Cancelar</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Device Modal ── */}
      {showDeviceModal && (
        <MonitoringDeviceModal
          device={editingDevice}
          tenantId={tenantId}
          onSave={handleSaveDevice}
          onClose={() => setShowDeviceModal(false)}
        />
      )}
    </div>
  )
}

// Lazy metrics summary inside device card
function DeviceMetricsSummary({ deviceId, tenantId }: { deviceId: string; tenantId: string }) {
  const [metrics, setMetrics] = useState<MonitoringMetric[]>([])

  useEffect(() => {
    getLatestMetrics(deviceId).then(setMetrics).catch(() => {})
  }, [deviceId])

  const powerMetric = metrics.find(m => m.metricKey === 'pon.power_dbm')
  const cpuMetric   = metrics.find(m => m.metricKey === 'system.cpu_pct')

  if (!powerMetric && !cpuMetric) return null

  return (
    <div className="nms-device-metrics-strip">
      {powerMetric && powerMetric.metricValue != null && (
        <span style={{ color: getPowerColor('pon.power_dbm', powerMetric.metricValue) }}>
          ⚡ {powerMetric.metricValue} dBm
        </span>
      )}
      {cpuMetric && cpuMetric.metricValue != null && (
        <span>CPU: {cpuMetric.metricValue}%</span>
      )}
    </div>
  )
}

function getPowerColor(key: string, val: number | null): string {
  if (!key.includes('power') || val == null) return '#e2e8f0'
  if (val >= -8)  return '#f87171'
  if (val >= -27) return '#4ade80'
  if (val >= -30) return '#facc15'
  return '#f87171'
}
