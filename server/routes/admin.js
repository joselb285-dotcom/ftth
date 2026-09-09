import { Router } from 'express'
import { q } from '../db.js'
import { requireAuth, requireRole, hashPassword } from '../auth.js'

const router = Router()
router.use(requireAuth, requireRole('superadmin', 'admin'))

const isSuper = (req) => req.user.role === 'superadmin'

// ── Listados ────────────────────────────────────────────────────────────────
router.get('/users', async (req, res) => {
  const { rows } = isSuper(req)
    ? await q('SELECT id, email, full_name, role, admin_id FROM users ORDER BY role, email')
    : await q(
      `SELECT id, email, full_name, role, admin_id FROM users
       WHERE id = $1 OR admin_id = $1 ORDER BY role, email`, [req.user.id],
    )
  res.json(rows)
})

router.get('/tenants', async (req, res) => {
  const { rows } = isSuper(req)
    ? await q('SELECT id, slug, name FROM tenants ORDER BY slug')
    : await q(
      `SELECT t.id, t.slug, t.name FROM tenants t
       JOIN user_tenants ut ON ut.tenant_id = t.id WHERE ut.user_id = $1 ORDER BY t.slug`,
      [req.user.id],
    )
  res.json(rows)
})

router.get('/user-tenants', async (req, res) => {
  const { rows } = isSuper(req)
    ? await q('SELECT user_id, tenant_id FROM user_tenants')
    : await q(
      `SELECT ut.user_id, ut.tenant_id FROM user_tenants ut
       WHERE ut.user_id = $1
          OR ut.user_id IN (SELECT id FROM users WHERE admin_id = $1)`, [req.user.id],
    )
  res.json(rows)
})

// ── Crear usuario ───────────────────────────────────────────────────────────
router.post('/users', async (req, res) => {
  const { email, password, full_name, role, admin_id } = req.body ?? {}
  if (!email || !password || password.length < 6) {
    return res.status(400).json({ error: 'email y password (mín. 6) requeridos' })
  }
  const newRole = isSuper(req) ? (role ?? 'user') : 'user'
  const newAdminId = isSuper(req) ? (admin_id ?? null) : req.user.id

  const { rows: dup } = await q('SELECT 1 FROM users WHERE lower(email) = lower($1)', [email])
  if (dup.length) return res.status(409).json({ error: 'Ese email ya existe' })

  const { rows } = await q(
    `INSERT INTO users (email, password_hash, full_name, role, admin_id)
     VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    [email, await hashPassword(password), full_name ?? null, newRole, newAdminId],
  )
  res.json({ user_id: rows[0].id })
})

// ── Guard: admin solo toca sus propios usuarios ─────────────────────────────
async function assertManages(req, targetId) {
  if (isSuper(req)) return true
  const { rows } = await q('SELECT admin_id, role FROM users WHERE id = $1', [targetId])
  return rows[0] && rows[0].admin_id === req.user.id
}

router.post('/users/:id/password', async (req, res) => {
  const { new_password } = req.body ?? {}
  if (!new_password || new_password.length < 6) return res.status(400).json({ error: 'Mín. 6 caracteres' })
  if (!(await assertManages(req, req.params.id))) return res.status(403).json({ error: 'Fuera de tu gestión' })
  await q('UPDATE users SET password_hash = $1 WHERE id = $2', [await hashPassword(new_password), req.params.id])
  res.status(204).end()
})

router.patch('/users/:id', async (req, res) => {
  const { role, full_name } = req.body ?? {}
  if (role !== undefined && !isSuper(req)) return res.status(403).json({ error: 'Solo superadmin cambia roles' })
  if (!(await assertManages(req, req.params.id))) return res.status(403).json({ error: 'Fuera de tu gestión' })
  const fields = {}
  if (role !== undefined) fields.role = role
  if (full_name !== undefined) fields.full_name = full_name || null
  const keys = Object.keys(fields)
  if (!keys.length) return res.status(400).json({ error: 'Nada para actualizar' })
  const set = keys.map((k, i) => `${k} = $${i + 1}`)
  const vals = [...keys.map(k => fields[k]), req.params.id]
  await q(`UPDATE users SET ${set.join(',')} WHERE id = $${vals.length}`, vals)
  res.status(204).end()
})

router.delete('/users/:id', async (req, res) => {
  if (req.params.id === req.user.id) return res.status(400).json({ error: 'No podés eliminarte a vos mismo' })
  if (!isSuper(req)) {
    const { rows } = await q('SELECT admin_id, role FROM users WHERE id = $1', [req.params.id])
    if (!rows[0] || rows[0].admin_id !== req.user.id || rows[0].role !== 'user') {
      return res.status(403).json({ error: 'Fuera de tu gestión' })
    }
  }
  await q('DELETE FROM users WHERE id = $1', [req.params.id])
  res.status(204).end()
})

// ── user_tenants ────────────────────────────────────────────────────────────
router.post('/user-tenants', async (req, res) => {
  const { user_id, tenant_id, role } = req.body ?? {}
  if (!(await assertManages(req, user_id))) return res.status(403).json({ error: 'Fuera de tu gestión' })
  await q(
    `INSERT INTO user_tenants (user_id, tenant_id, role) VALUES ($1,$2,$3)
     ON CONFLICT (user_id, tenant_id) DO NOTHING`,
    [user_id, tenant_id, role ?? 'user'],
  )
  res.status(204).end()
})

router.delete('/user-tenants/:userId/:tenantId', async (req, res) => {
  if (!(await assertManages(req, req.params.userId))) return res.status(403).json({ error: 'Fuera de tu gestión' })
  await q('DELETE FROM user_tenants WHERE user_id = $1 AND tenant_id = $2', [req.params.userId, req.params.tenantId])
  res.status(204).end()
})

export default router
