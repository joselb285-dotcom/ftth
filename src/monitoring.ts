import { api } from './api'
import type { MonitoringDevice, MonitoringMetric, MonitoringAlert, AlertRule } from './types'

// ── Row mappers ──────────────────────────────────────────────────────────────

function rowToDevice(r: Record<string, unknown>): MonitoringDevice {
  return {
    id:             r.id as string,
    tenantId:       r.tenant_id as string,
    name:           r.name as string,
    type:           r.type as MonitoringDevice['type'],
    vendor:         r.vendor as string | undefined,
    model:          r.model as string | undefined,
    ipAddress:      r.ip_address as string | undefined,
    snmpCommunity:  r.snmp_community as string | undefined,
    snmpVersion:    r.snmp_version as string | undefined,
    apiUrl:         r.api_url as string | undefined,
    apiUsername:    r.api_username as string | undefined,
    apiPassword:    r.api_password as string | undefined,
    apiToken:       r.api_token as string | undefined,
    pollIntervalS:  r.poll_interval_s as number | undefined,
    protocol:       (r.protocol as MonitoringDevice['protocol']) ?? 'manual',
    alertRules:     (r.alert_rules as AlertRule[]) ?? [],
    status:         (r.status as MonitoringDevice['status']) ?? 'unknown',
    lastSeenAt:     r.last_seen_at as string | undefined,
    featureId:      r.feature_id as string | undefined,
    notes:          r.notes as string | undefined,
    createdAt:      r.created_at as string,
    updatedAt:      r.updated_at as string,
  }
}

function deviceToRow(d: Partial<MonitoringDevice> & { tenantId: string; name: string; type: MonitoringDevice['type']; protocol: MonitoringDevice['protocol'] }) {
  return {
    name:           d.name,
    type:           d.type,
    vendor:         d.vendor ?? null,
    model:          d.model ?? null,
    ip_address:     d.ipAddress ?? null,
    snmp_community: d.snmpCommunity ?? 'public',
    snmp_version:   d.snmpVersion ?? '2c',
    api_url:        d.apiUrl ?? null,
    api_username:   d.apiUsername ?? null,
    api_password:   d.apiPassword ?? null,
    api_token:      d.apiToken ?? null,
    poll_interval_s: d.pollIntervalS ?? 300,
    protocol:       d.protocol,
    alert_rules:    d.alertRules ?? [],
    status:         d.status ?? 'unknown',
    last_seen_at:   d.lastSeenAt ?? null,
    feature_id:     d.featureId ?? null,
    notes:          d.notes ?? null,
  }
}

function rowToMetric(r: Record<string, unknown>): MonitoringMetric {
  return {
    id:          r.id as string,
    deviceId:    r.device_id as string,
    tenantId:    r.tenant_id as string,
    metricKey:   r.metric_key as string,
    metricValue: r.metric_value != null ? Number(r.metric_value) : null,
    metricUnit:  r.metric_unit as string | undefined,
    label:       r.label as string | undefined,
    source:      (r.source as MonitoringMetric['source']) ?? 'manual',
    ts:          r.ts as string,
  }
}

function rowToAlert(r: Record<string, unknown>): MonitoringAlert {
  return {
    id:              r.id as string,
    tenantId:        r.tenant_id as string,
    deviceId:        r.device_id as string | undefined,
    customerId:      r.customer_id as string | undefined,
    severity:        r.severity as MonitoringAlert['severity'],
    metricKey:       r.metric_key as string | undefined,
    message:         r.message as string,
    status:          (r.status as MonitoringAlert['status']) ?? 'open',
    acknowledgedBy:  r.acknowledged_by as string | undefined,
    createdAt:       r.created_at as string,
    resolvedAt:      r.resolved_at as string | undefined,
  }
}

// ── Devices ──────────────────────────────────────────────────────────────────

export async function getDevices(_tenantId: string): Promise<MonitoringDevice[]> {
  const rows = await api<Record<string, unknown>[]>('/api/monitoring/devices')
  return rows.map(rowToDevice)
}

export async function upsertDevice(d: MonitoringDevice | Omit<MonitoringDevice, 'id' | 'createdAt' | 'updatedAt'>): Promise<MonitoringDevice> {
  const row = deviceToRow(d as MonitoringDevice)
  const hasId = 'id' in d && d.id
  const data = hasId
    ? await api<Record<string, unknown>>(`/api/monitoring/devices/${(d as MonitoringDevice).id}`, { method: 'PUT', body: JSON.stringify(row) })
    : await api<Record<string, unknown>>('/api/monitoring/devices', { method: 'POST', body: JSON.stringify(row) })
  return rowToDevice(data)
}

export async function deleteDevice(id: string): Promise<void> {
  await api(`/api/monitoring/devices/${id}`, { method: 'DELETE' })
}

export async function updateDeviceStatus(id: string, status: MonitoringDevice['status']): Promise<void> {
  await api(`/api/monitoring/devices/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ status, last_seen_at: status === 'online' ? new Date().toISOString() : null }),
  })
}

// ── Metrics ──────────────────────────────────────────────────────────────────

export async function getMetrics(deviceId: string, metricKey?: string, limit = 100): Promise<MonitoringMetric[]> {
  const qs = new URLSearchParams({ limit: String(limit) })
  if (metricKey) qs.set('key', metricKey)
  const rows = await api<Record<string, unknown>[]>(`/api/monitoring/devices/${deviceId}/metrics?${qs}`)
  return rows.map(rowToMetric)
}

export async function getLatestMetrics(deviceId: string): Promise<MonitoringMetric[]> {
  const rows = await api<Record<string, unknown>[]>(`/api/monitoring/devices/${deviceId}/metrics?limit=200`)
  const all = rows.map(rowToMetric)
  const seen = new Set<string>()
  return all.filter(m => { if (seen.has(m.metricKey)) return false; seen.add(m.metricKey); return true })
}

export async function pushMetric(m: Omit<MonitoringMetric, 'id' | 'ts'>): Promise<void> {
  await api('/api/monitoring/metrics', {
    method: 'POST',
    body: JSON.stringify({
      device_id:    m.deviceId,
      metric_key:   m.metricKey,
      metric_value: m.metricValue,
      metric_unit:  m.metricUnit ?? null,
      label:        m.label ?? null,
      source:       m.source,
    }),
  })
}

// ── Alerts ───────────────────────────────────────────────────────────────────

export async function getAlerts(_tenantId: string, statusFilter: MonitoringAlert['status'] | 'all' = 'open'): Promise<MonitoringAlert[]> {
  const rows = await api<Record<string, unknown>[]>(`/api/monitoring/alerts?status=${statusFilter}`)
  return rows.map(rowToAlert)
}

export async function createAlert(a: Omit<MonitoringAlert, 'id' | 'createdAt'>): Promise<void> {
  await api('/api/monitoring/alerts', {
    method: 'POST',
    body: JSON.stringify({
      device_id:   a.deviceId ?? null,
      customer_id: a.customerId ?? null,
      severity:    a.severity,
      metric_key:  a.metricKey ?? null,
      message:     a.message,
      status:      a.status ?? 'open',
    }),
  })
}

export async function acknowledgeAlert(id: string, userEmail: string): Promise<void> {
  await api(`/api/monitoring/alerts/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'acknowledged', acknowledged_by: userEmail }),
  })
}

export async function resolveAlert(id: string): Promise<void> {
  await api(`/api/monitoring/alerts/${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'resolved' }) })
}

// ── Alert rule evaluation ─────────────────────────────────────────────────────

export function evaluateAlertRules(device: MonitoringDevice, metrics: MonitoringMetric[]): Omit<MonitoringAlert, 'id' | 'createdAt'>[] {
  if (!device.alertRules?.length) return []
  const latestByKey = new Map(metrics.map(m => [m.metricKey, m]))
  const triggered: Omit<MonitoringAlert, 'id' | 'createdAt'>[] = []

  for (const rule of device.alertRules) {
    const metric = latestByKey.get(rule.metricKey)
    if (!metric || metric.metricValue == null) continue
    const v = metric.metricValue
    const hit =
      rule.operator === '>'  ? v >  rule.threshold :
      rule.operator === '<'  ? v <  rule.threshold :
      rule.operator === '>=' ? v >= rule.threshold :
      rule.operator === '<=' ? v <= rule.threshold :
      rule.operator === '==' ? v === rule.threshold : false
    if (hit) {
      triggered.push({
        tenantId:  device.tenantId,
        deviceId:  device.id,
        severity:  rule.severity,
        metricKey: rule.metricKey,
        message:   rule.message.replace('{value}', String(v)).replace('{device}', device.name),
        status:    'open',
      })
    }
  }
  return triggered
}

// ── Agent script generator ────────────────────────────────────────────────────
// Genera un agente Node.js standalone que consulta equipos por SNMP/HTTP y
// empuja métricas al backend propio vía la API REST.

export function generateAgentScript(apiBase: string, token: string): string {
  const base = apiBase.replace(/\/$/, '')
  return `#!/usr/bin/env node
// FTTH GIS — Agente de monitoreo SNMP/HTTP
// Requiere: npm install net-snmp
// Ejecutar: node ftth-agent.js

const snmp = require('net-snmp')

const API_BASE = '${base}'
const TOKEN    = '${token}'

const headers = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + TOKEN }

async function getDevices() {
  const res = await fetch(API_BASE + '/api/monitoring/devices', { headers })
  if (!res.ok) throw new Error('devices HTTP ' + res.status)
  const all = await res.json()
  return all.filter(d => d.protocol === 'snmp' || d.protocol === 'http')
}

async function pushMetric(deviceId, key, value, unit, label) {
  await fetch(API_BASE + '/api/monitoring/metrics', {
    method: 'POST', headers,
    body: JSON.stringify({ device_id: deviceId, metric_key: key, metric_value: value, metric_unit: unit ?? null, label: label ?? null, source: 'agent' }),
  })
}

async function setStatus(deviceId, status) {
  await fetch(API_BASE + '/api/monitoring/devices/' + deviceId, {
    method: 'PATCH', headers, body: JSON.stringify({ status }),
  })
}

async function pollSnmp(device) {
  const session = snmp.createSession(device.ip_address, device.snmp_community ?? 'public')
  const oids = ['1.3.6.1.4.1.2011.6.128.1.1.2.51.1.4']  // ajustar según equipo
  session.get(oids, async (err, varbinds) => {
    if (err) { console.error('SNMP error', device.name, err.message); return }
    for (const vb of varbinds) {
      if (snmp.isVarbindError(vb)) continue
      await pushMetric(device.id, 'pon.power_raw', vb.value, '', 'SNMP OID ' + vb.oid)
    }
    session.close()
    await setStatus(device.id, 'online')
  })
}

async function pollHttp(device) {
  try {
    const h = device.api_token ? { Authorization: 'Bearer ' + device.api_token } : {}
    const res = await fetch(device.api_url + '/api/v1/status', { headers: h })
    if (!res.ok) throw new Error('HTTP ' + res.status)
    const json = await res.json()
    if (json.cpu_usage != null) await pushMetric(device.id, 'system.cpu_pct', json.cpu_usage, '%', 'CPU')
    if (json.memory_usage != null) await pushMetric(device.id, 'system.mem_pct', json.memory_usage, '%', 'Memory')
    await setStatus(device.id, 'online')
  } catch (e) {
    console.error('HTTP poll error', device.name, e.message)
    await setStatus(device.id, 'offline')
  }
}

async function poll() {
  const devices = await getDevices()
  console.log('[' + new Date().toISOString() + '] Polling', devices.length, 'devices...')
  for (const d of devices) {
    if (d.protocol === 'snmp') await pollSnmp(d)
    else if (d.protocol === 'http') await pollHttp(d)
  }
}

poll()
setInterval(poll, 60_000)
`
}
