import { Router } from 'express'
import { q } from '../db.js'
import { requireAuth, requireRole } from '../auth.js'

const router = Router()
router.use(requireAuth)

const COLS = [
  'project_id', 'sub_project_id', 'feature_id', 'name', 'document_type', 'document_number',
  'address', 'phone', 'email', 'status', 'service_type', 'plan_name', 'plan_down_mbps',
  'plan_up_mbps', 'monthly_fee', 'install_date', 'cancel_date', 'cancel_reason',
  'onu_model', 'onu_serial', 'onu_mac', 'olt_host', 'pon_port', 'optical_distance_m', 'notes',
]

function pick(body) {
  const out = {}
  for (const c of COLS) if (c in body) out[c] = body[c] === '' ? null : body[c]
  return out
}

router.get('/', async (req, res) => {
  const { rows } = await q(
    'SELECT * FROM customers WHERE tenant_id = $1 ORDER BY created_at DESC',
    [req.tenant.id],
  )
  res.json(rows)
})

router.post('/', async (req, res) => {
  const data = pick(req.body ?? {})
  const keys = Object.keys(data)
  const cols = ['tenant_id', ...keys]
  const vals = [req.tenant.id, ...keys.map(k => data[k])]
  const ph = vals.map((_, i) => `$${i + 1}`)
  const { rows } = await q(
    `INSERT INTO customers (${cols.join(',')}) VALUES (${ph.join(',')}) RETURNING *`,
    vals,
  )
  res.json(rows[0])
})

async function update(req, res) {
  const data = pick(req.body ?? {})
  const keys = Object.keys(data)
  if (!keys.length) {
    const { rows } = await q('SELECT * FROM customers WHERE id = $1 AND tenant_id = $2', [req.params.id, req.tenant.id])
    return rows[0] ? res.json(rows[0]) : res.status(404).json({ error: 'No encontrado' })
  }
  const set = keys.map((k, i) => `${k} = $${i + 1}`)
  const vals = keys.map(k => data[k])
  vals.push(req.params.id, req.tenant.id)
  const { rows } = await q(
    `UPDATE customers SET ${set.join(',')}, updated_at = now()
     WHERE id = $${vals.length - 1} AND tenant_id = $${vals.length} RETURNING *`,
    vals,
  )
  if (!rows.length) return res.status(404).json({ error: 'No encontrado' })
  res.json(rows[0])
}
router.put('/:id', update)
router.patch('/:id', update)

router.delete('/:id', requireRole('superadmin', 'admin', 'user'), async (req, res) => {
  await q('DELETE FROM customers WHERE id = $1 AND tenant_id = $2', [req.params.id, req.tenant.id])
  res.status(204).end()
})

export default router
