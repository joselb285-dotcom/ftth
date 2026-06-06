import { useState } from 'react'
import type { MonitoringDevice, DeviceType, DeviceProtocol, AlertRule, AlertSeverity } from './types'

interface Props {
  device?: MonitoringDevice | null
  tenantId: string
  onSave: (d: Omit<MonitoringDevice, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => Promise<void>
  onClose: () => void
}

const TYPE_LABELS: Record<DeviceType, string> = {
  olt:      'OLT',
  switch:   'Switch',
  router:   'Router',
  onu:      'ONU/ONT',
  mikrotik: 'Mikrotik',
  other:    'Otro',
}

const PROTO_LABELS: Record<DeviceProtocol, string> = {
  snmp:   'SNMP',
  http:   'HTTP / REST API',
  manual: 'Manual (solo entrada de datos)',
}

const VENDORS = ['Huawei','ZTE','VSOL','Mikrotik','Cisco','FiberHome','Nokia','Calix','Otro']

const BLANK_RULE: AlertRule = {
  metricKey:  'pon.power_dbm',
  operator:   '<',
  threshold:  -30,
  severity:   'critical',
  message:    'Potencia ONU {device} crítica: {value} dBm',
}

export default function MonitoringDeviceModal({ device, tenantId, onSave, onClose }: Props) {
  const isNew = !device
  const [form, setForm] = useState<Omit<MonitoringDevice, 'id' | 'createdAt' | 'updatedAt'>>({
    tenantId,
    name: '',
    type: 'olt',
    protocol: 'manual',
    status: 'unknown',
    alertRules: [],
    ...device,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')
  const [tab, setTab]       = useState<'basic' | 'connection' | 'alerts'>('basic')

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  function addRule() {
    set('alertRules', [...(form.alertRules ?? []), { ...BLANK_RULE }])
  }

  function updateRule(i: number, patch: Partial<AlertRule>) {
    const rules = [...(form.alertRules ?? [])]
    rules[i] = { ...rules[i], ...patch }
    set('alertRules', rules)
  }

  function removeRule(i: number) {
    set('alertRules', (form.alertRules ?? []).filter((_, j) => j !== i))
  }

  async function handleSave() {
    if (!form.name.trim()) { setError('El nombre es obligatorio'); return }
    if (!form.ipAddress?.trim() && form.protocol !== 'manual') {
      setError('La IP es obligatoria para protocolos SNMP/HTTP')
      return
    }
    setSaving(true)
    setError('')
    try {
      await onSave({ ...form, id: device?.id })
      onClose()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box modal-wide" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{isNew ? 'Agregar dispositivo' : 'Editar dispositivo'}</h3>
          <button className="secondary" onClick={onClose}>✕</button>
        </div>

        {/* Tabs */}
        <div className="modal-tabs">
          {(['basic','connection','alerts'] as const).map(t => (
            <button key={t} className={`modal-tab${tab === t ? ' modal-tab-active' : ''}`} onClick={() => setTab(t)}>
              {t === 'basic' ? 'General' : t === 'connection' ? 'Conexión' : 'Alertas'}
            </button>
          ))}
        </div>

        <div className="modal-body">
          {/* ── General ── */}
          {tab === 'basic' && (
            <div className="form-grid-2">
              <label style={{ gridColumn: '1 / -1' }}>
                Nombre del dispositivo <span className="required">*</span>
                <input autoFocus value={form.name} onChange={e => set('name', e.target.value)} placeholder="Ej: OLT-NORTE-01" />
              </label>
              <label>
                Tipo
                <select value={form.type} onChange={e => set('type', e.target.value as DeviceType)}>
                  {(Object.keys(TYPE_LABELS) as DeviceType[]).map(t => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
                </select>
              </label>
              <label>
                Fabricante
                <select value={form.vendor ?? ''} onChange={e => set('vendor', e.target.value || undefined)}>
                  <option value="">— Sin especificar —</option>
                  {VENDORS.map(v => <option key={v} value={v.toLowerCase()}>{v}</option>)}
                </select>
              </label>
              <label style={{ gridColumn: '1 / -1' }}>
                Modelo
                <input value={form.model ?? ''} onChange={e => set('model', e.target.value || undefined)} placeholder="Ej: MA5800-X7" />
              </label>
              <label style={{ gridColumn: '1 / -1' }}>
                Protocolo de monitoreo
                <select value={form.protocol} onChange={e => set('protocol', e.target.value as DeviceProtocol)}>
                  {(Object.keys(PROTO_LABELS) as DeviceProtocol[]).map(p => <option key={p} value={p}>{PROTO_LABELS[p]}</option>)}
                </select>
              </label>
              <label style={{ gridColumn: '1 / -1' }}>
                Notas
                <textarea rows={2} value={form.notes ?? ''} onChange={e => set('notes', e.target.value || undefined)} placeholder="Descripción, ubicación, etc." style={{ resize: 'vertical' }} />
              </label>
            </div>
          )}

          {/* ── Conexión ── */}
          {tab === 'connection' && (
            <div className="form-grid-2">
              <label style={{ gridColumn: '1 / -1' }}>
                Dirección IP
                <input value={form.ipAddress ?? ''} onChange={e => set('ipAddress', e.target.value || undefined)} placeholder="192.168.1.1" />
              </label>

              {form.protocol === 'snmp' && (
                <>
                  <label>
                    Comunidad SNMP
                    <input value={form.snmpCommunity ?? 'public'} onChange={e => set('snmpCommunity', e.target.value)} placeholder="public" />
                  </label>
                  <label>
                    Versión SNMP
                    <select value={form.snmpVersion ?? '2c'} onChange={e => set('snmpVersion', e.target.value)}>
                      <option value="1">SNMPv1</option>
                      <option value="2c">SNMPv2c</option>
                      <option value="3">SNMPv3</option>
                    </select>
                  </label>
                </>
              )}

              {form.protocol === 'http' && (
                <>
                  <label style={{ gridColumn: '1 / -1' }}>
                    URL base de la API
                    <input value={form.apiUrl ?? ''} onChange={e => set('apiUrl', e.target.value || undefined)} placeholder="http://192.168.1.1:8080" />
                  </label>
                  <label>
                    Usuario API
                    <input value={form.apiUsername ?? ''} onChange={e => set('apiUsername', e.target.value || undefined)} placeholder="admin" />
                  </label>
                  <label>
                    Contraseña / Token
                    <input type="password" value={form.apiPassword ?? ''} onChange={e => set('apiPassword', e.target.value || undefined)} placeholder="••••••••" />
                  </label>
                  <label style={{ gridColumn: '1 / -1' }}>
                    Bearer Token (alternativo)
                    <input value={form.apiToken ?? ''} onChange={e => set('apiToken', e.target.value || undefined)} placeholder="eyJ..." />
                  </label>
                </>
              )}

              <label style={{ gridColumn: '1 / -1' }}>
                Intervalo de polling (segundos)
                <input type="number" min="30" step="30" value={form.pollIntervalS ?? 300} onChange={e => set('pollIntervalS', Number(e.target.value))} />
              </label>

              {form.protocol !== 'manual' && (
                <div style={{ gridColumn: '1 / -1', padding: '10px 12px', background: '#0d1e3a', borderRadius: 6, border: '1px solid #1e3a5f', fontSize: '0.8rem', color: '#94a3b8' }}>
                  💡 Para SNMP el polling requiere el <strong style={{ color: '#60a5fa' }}>agente Node.js</strong> corriendo en la red.
                  Descargarlo desde el panel de Monitoreo.
                </div>
              )}
            </div>
          )}

          {/* ── Alertas ── */}
          {tab === 'alerts' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <span style={{ color: '#94a3b8', fontSize: '0.85rem' }}>
                  Reglas que disparan alertas automáticas cuando llegan métricas.
                </span>
                <button className="secondary" onClick={addRule}>+ Agregar regla</button>
              </div>

              {(!form.alertRules || form.alertRules.length === 0) && (
                <p className="empty-state" style={{ fontSize: '0.85rem' }}>Sin reglas de alerta configuradas</p>
              )}

              {(form.alertRules ?? []).map((rule, i) => (
                <div key={i} className="alert-rule-row">
                  <input
                    value={rule.metricKey}
                    onChange={e => updateRule(i, { metricKey: e.target.value })}
                    placeholder="metric_key (ej: pon.power_dbm)"
                    style={{ flex: 2 }}
                  />
                  <select value={rule.operator} onChange={e => updateRule(i, { operator: e.target.value as AlertRule['operator'] })}>
                    {(['>', '<', '>=', '<=', '=='] as AlertRule['operator'][]).map(op => <option key={op} value={op}>{op}</option>)}
                  </select>
                  <input
                    type="number"
                    value={rule.threshold}
                    onChange={e => updateRule(i, { threshold: Number(e.target.value) })}
                    style={{ width: 80 }}
                  />
                  <select value={rule.severity} onChange={e => updateRule(i, { severity: e.target.value as AlertSeverity })}>
                    <option value="critical">Crítica</option>
                    <option value="warning">Advertencia</option>
                    <option value="info">Info</option>
                  </select>
                  <input
                    value={rule.message}
                    onChange={e => updateRule(i, { message: e.target.value })}
                    placeholder="Mensaje (usa {device} y {value})"
                    style={{ flex: 3 }}
                  />
                  <button className="secondary" onClick={() => removeRule(i)} style={{ padding: '4px 8px' }}>✕</button>
                </div>
              ))}
            </div>
          )}

          {error && <p className="form-error">{error}</p>}
        </div>

        <div className="modal-footer">
          <button className="secondary" onClick={onClose} disabled={saving}>Cancelar</button>
          <button onClick={handleSave} disabled={saving}>
            {saving ? 'Guardando...' : isNew ? 'Agregar' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}
