import { supabase } from './supabase'
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
    tenant_id:      d.tenantId,
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
    updated_at:     new Date().toISOString(),
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

export async function getDevices(tenantId: string): Promise<MonitoringDevice[]> {
  const { data, error } = await supabase
    .from('monitoring_devices')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('name')
  if (error) throw error
  return (data ?? []).map(r => rowToDevice(r as Record<string, unknown>))
}

export async function upsertDevice(d: MonitoringDevice | Omit<MonitoringDevice, 'id' | 'createdAt' | 'updatedAt'>): Promise<MonitoringDevice> {
  const row = deviceToRow(d as MonitoringDevice)
  const hasId = 'id' in d && d.id
  const q = hasId
    ? supabase.from('monitoring_devices').update(row).eq('id', (d as MonitoringDevice).id).select().single()
    : supabase.from('monitoring_devices').insert(row).select().single()
  const { data, error } = await q
  if (error) throw error
  return rowToDevice(data as Record<string, unknown>)
}

export async function deleteDevice(id: string): Promise<void> {
  const { error } = await supabase.from('monitoring_devices').delete().eq('id', id)
  if (error) throw error
}

export async function updateDeviceStatus(id: string, status: MonitoringDevice['status']): Promise<void> {
  const { error } = await supabase
    .from('monitoring_devices')
    .update({ status, last_seen_at: status === 'online' ? new Date().toISOString() : undefined, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

// ── Metrics ──────────────────────────────────────────────────────────────────

export async function getMetrics(deviceId: string, metricKey?: string, limit = 100): Promise<MonitoringMetric[]> {
  let q = supabase
    .from('monitoring_metrics')
    .select('*')
    .eq('device_id', deviceId)
    .order('ts', { ascending: false })
    .limit(limit)
  if (metricKey) q = q.eq('metric_key', metricKey)
  const { data, error } = await q
  if (error) throw error
  return (data ?? []).map(r => rowToMetric(r as Record<string, unknown>))
}

export async function getLatestMetrics(deviceId: string): Promise<MonitoringMetric[]> {
  // Last metric per key for this device
  const { data, error } = await supabase
    .from('monitoring_metrics')
    .select('*')
    .eq('device_id', deviceId)
    .order('ts', { ascending: false })
    .limit(200)
  if (error) throw error
  const all = (data ?? []).map(r => rowToMetric(r as Record<string, unknown>))
  const seen = new Set<string>()
  return all.filter(m => { if (seen.has(m.metricKey)) return false; seen.add(m.metricKey); return true })
}

export async function pushMetric(m: Omit<MonitoringMetric, 'id' | 'ts'>): Promise<void> {
  const { error } = await supabase.from('monitoring_metrics').insert({
    device_id:    m.deviceId,
    tenant_id:    m.tenantId,
    metric_key:   m.metricKey,
    metric_value: m.metricValue,
    metric_unit:  m.metricUnit ?? null,
    label:        m.label ?? null,
    source:       m.source,
  })
  if (error) throw error
}

// ── Alerts ───────────────────────────────────────────────────────────────────

export async function getAlerts(tenantId: string, statusFilter: MonitoringAlert['status'] | 'all' = 'open'): Promise<MonitoringAlert[]> {
  let q = supabase
    .from('monitoring_alerts')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(200)
  if (statusFilter !== 'all') q = q.eq('status', statusFilter)
  const { data, error } = await q
  if (error) throw error
  return (data ?? []).map(r => rowToAlert(r as Record<string, unknown>))
}

export async function createAlert(a: Omit<MonitoringAlert, 'id' | 'createdAt'>): Promise<void> {
  const { error } = await supabase.from('monitoring_alerts').insert({
    tenant_id:   a.tenantId,
    device_id:   a.deviceId ?? null,
    customer_id: a.customerId ?? null,
    severity:    a.severity,
    metric_key:  a.metricKey ?? null,
    message:     a.message,
    status:      a.status ?? 'open',
  })
  if (error) throw error
}

export async function acknowledgeAlert(id: string, userEmail: string): Promise<void> {
  const { error } = await supabase
    .from('monitoring_alerts')
    .update({ status: 'acknowledged', acknowledged_by: userEmail })
    .eq('id', id)
  if (error) throw error
}

export async function resolveAlert(id: string): Promise<void> {
  const { error } = await supabase
    .from('monitoring_alerts')
    .update({ status: 'resolved', resolved_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
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
// Generates a standalone Node.js polling agent script (runs on any PC in the network)

export function generateAgentScript(tenantId: string, supabaseUrl: string, supabaseKey: string): string {
  return `#!/usr/bin/env node
// FTTH GIS — Agente de monitoreo SNMP/HTTP
// Requiere: npm install @supabase/supabase-js net-snmp node-fetch
// Ejecutar: node ftth-agent.js

const { createClient } = require('@supabase/supabase-js')
const snmp = require('net-snmp')

const SUPABASE_URL = '${supabaseUrl}'
const SUPABASE_KEY = '${supabaseKey}'
const TENANT_ID    = '${tenantId}'

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

async function getDevices() {
  const { data } = await supabase
    .from('monitoring_devices')
    .select('*')
    .eq('tenant_id', TENANT_ID)
    .in('protocol', ['snmp', 'http'])
  return data ?? []
}

async function pushMetric(deviceId, key, value, unit, label) {
  await supabase.from('monitoring_metrics').insert({
    device_id: deviceId, tenant_id: TENANT_ID,
    metric_key: key, metric_value: value,
    metric_unit: unit ?? null, label: label ?? null,
    source: 'agent',
  })
}

async function pollSnmp(device) {
  const session = snmp.createSession(device.ip_address, device.snmp_community ?? 'public')
  // OID ejemplo para potencia PON Huawei: ajustar según equipo
  const oids = ['1.3.6.1.4.1.2011.6.128.1.1.2.51.1.4']
  session.get(oids, async (err, varbinds) => {
    if (err) { console.error('SNMP error', device.name, err.message); return }
    for (const vb of varbinds) {
      if (snmp.isVarbindError(vb)) continue
      await pushMetric(device.id, 'pon.power_raw', vb.value, '', 'SNMP OID ' + vb.oid)
    }
    session.close()
    await supabase.from('monitoring_devices').update({ status: 'online', last_seen_at: new Date().toISOString() }).eq('id', device.id)
  })
}

async function pollHttp(device) {
  try {
    const fetch = (await import('node-fetch')).default
    const headers = device.api_token ? { Authorization: 'Bearer ' + device.api_token } : {}
    const res = await fetch(device.api_url + '/api/v1/status', { headers, timeout: 5000 })
    if (!res.ok) throw new Error('HTTP ' + res.status)
    const json = await res.json()
    // Ajustar según la API del equipo — esto es un ejemplo genérico
    if (json.cpu_usage != null) await pushMetric(device.id, 'system.cpu_pct', json.cpu_usage, '%', 'CPU')
    if (json.memory_usage != null) await pushMetric(device.id, 'system.mem_pct', json.memory_usage, '%', 'Memory')
    await supabase.from('monitoring_devices').update({ status: 'online', last_seen_at: new Date().toISOString() }).eq('id', device.id)
  } catch (e) {
    console.error('HTTP poll error', device.name, e.message)
    await supabase.from('monitoring_devices').update({ status: 'offline' }).eq('id', device.id)
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
setInterval(poll, 60_000)  // cada 60 segundos
`
}
