import { Router } from 'express'
import { q } from '../db.js'
import { requireAuth } from '../auth.js'

const router = Router()
router.use(requireAuth)

const DEVICE_COLS = [
  'name', 'type', 'vendor', 'model', 'ip_address', 'snmp_community', 'snmp_version',
  'api_url', 'api_username', 'api_password', 'api_token', 'poll_interval_s', 'protocol',
  'alert_rules', 'status', 'last_seen_at', 'feature_id', 'notes',
]

function pickDevice(body) {
  const out = {}
  for (const c of DEVICE_COLS) if (c in body) {
    out[c] = c === 'alert_rules' ? JSON.stringify(body[c] ?? []) : (body[c] === '' ? null : body[c])
  }
  return out
}

// ── Devices ─────────────────────────────────────────────────────────────────
router.get('/devices', async (req, res) => {
  const { rows } = await q(
    'SELECT * FROM monitoring_devices WHERE tenant_id = $1 ORDER BY name', [req.tenant.id],
  )
  res.json(rows)
})

router.post('/devices', async (req, res) => {
  const data = pickDevice(req.body ?? {})
  const keys = Object.keys(data)
  const cols = ['tenant_id', ...keys]
  const vals = [req.tenant.id, ...keys.map(k => data[k])]
  const ph = vals.map((_, i) => `$${i + 1}`)
  const { rows } = await q(
    `INSERT INTO monitoring_devices (${cols.join(',')}) VALUES (${ph.join(',')}) RETURNING *`, vals,
  )
  res.json(rows[0])
})

router.put('/devices/:id', patchDevice)
router.patch('/devices/:id', patchDevice)
async function patchDevice(req, res) {
  const data = pickDevice(req.body ?? {})
  const keys = Object.keys(data)
  if (!keys.length) return res.status(400).json({ error: 'Nada para actualizar' })
  const set = keys.map((k, i) => `${k} = $${i + 1}`)
  const vals = keys.map(k => data[k])
  vals.push(req.params.id, req.tenant.id)
  const { rows } = await q(
    `UPDATE monitoring_devices SET ${set.join(',')}, updated_at = now()
     WHERE id = $${vals.length - 1} AND tenant_id = $${vals.length} RETURNING *`, vals,
  )
  if (!rows.length) return res.status(404).json({ error: 'No encontrado' })
  res.json(rows[0])
}

router.delete('/devices/:id', async (req, res) => {
  await q('DELETE FROM monitoring_devices WHERE id = $1 AND tenant_id = $2', [req.params.id, req.tenant.id])
  res.status(204).end()
})

// ── Metrics ─────────────────────────────────────────────────────────────────
router.get('/devices/:id/metrics', async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 100, 1000)
  const params = [req.params.id, req.tenant.id]
  let sql = 'SELECT * FROM monitoring_metrics WHERE device_id = $1 AND tenant_id = $2'
  if (req.query.key) { params.push(req.query.key); sql += ` AND metric_key = $${params.length}` }
  params.push(limit)
  sql += ` ORDER BY ts DESC LIMIT $${params.length}`
  const { rows } = await q(sql, params)
  res.json(rows)
})

router.post('/metrics', async (req, res) => {
  const b = req.body ?? {}
  await q(
    `INSERT INTO monitoring_metrics (device_id, tenant_id, metric_key, metric_value, metric_unit, label, source)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [b.device_id, req.tenant.id, b.metric_key, b.metric_value ?? null,
     b.metric_unit ?? null, b.label ?? null, b.source ?? 'manual'],
  )
  res.status(204).end()
})

// ── Alerts ──────────────────────────────────────────────────────────────────
router.get('/alerts', async (req, res) => {
  const params = [req.tenant.id]
  let sql = 'SELECT * FROM monitoring_alerts WHERE tenant_id = $1'
  if (req.query.status && req.query.status !== 'all') {
    params.push(req.query.status); sql += ` AND status = $${params.length}`
  }
  sql += ' ORDER BY created_at DESC LIMIT 200'
  const { rows } = await q(sql, params)
  res.json(rows)
})

router.post('/alerts', async (req, res) => {
  const b = req.body ?? {}
  await q(
    `INSERT INTO monitoring_alerts (tenant_id, device_id, customer_id, severity, metric_key, message, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [req.tenant.id, b.device_id ?? null, b.customer_id ?? null, b.severity,
     b.metric_key ?? null, b.message, b.status ?? 'open'],
  )
  res.status(204).end()
})

router.patch('/alerts/:id', async (req, res) => {
  const b = req.body ?? {}
  const fields = {}
  if (b.status) fields.status = b.status
  if ('acknowledged_by' in b) fields.acknowledged_by = b.acknowledged_by
  if (b.status === 'resolved') fields.resolved_at = new Date().toISOString()
  const keys = Object.keys(fields)
  if (!keys.length) return res.status(400).json({ error: 'Nada para actualizar' })
  const set = keys.map((k, i) => `${k} = $${i + 1}`)
  const vals = keys.map(k => fields[k])
  vals.push(req.params.id, req.tenant.id)
  await q(
    `UPDATE monitoring_alerts SET ${set.join(',')} WHERE id = $${vals.length - 1} AND tenant_id = $${vals.length}`,
    vals,
  )
  res.status(204).end()
})

export default router
