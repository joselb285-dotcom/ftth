import { Router } from 'express'
import { q } from '../db.js'
import {
  signToken, verifyPassword, requireAuth, getTenant, publicUser,
} from '../auth.js'

const router = Router()

// Rate limit en memoria: 10 intentos fallidos / 15 min por IP+email
const FAILS = new Map()
const WINDOW = 15 * 60 * 1000
const MAX_FAILS = 10
const failKey = (req) => `${req.ip}|${String(req.body?.email ?? '').toLowerCase()}`
function tooMany(key) {
  const e = FAILS.get(key)
  if (!e) return false
  if (Date.now() - e.first > WINDOW) { FAILS.delete(key); return false }
  return e.n >= MAX_FAILS
}
function recordFail(key) {
  const e = FAILS.get(key)
  if (!e || Date.now() - e.first > WINDOW) FAILS.set(key, { n: 1, first: Date.now() })
  else e.n++
}

router.post('/login', async (req, res) => {
  const { email, password } = req.body ?? {}
  if (!email || !password) return res.status(400).json({ error: 'Email y contraseña requeridos' })

  const key = failKey(req)
  if (tooMany(key)) return res.status(429).json({ error: 'Demasiados intentos, espera 15 minutos' })

  const { rows } = await q(
    'SELECT id, email, password_hash, full_name, role, admin_id FROM users WHERE lower(email) = lower($1)',
    [email],
  )
  const user = rows[0]
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    recordFail(key)
    return res.status(401).json({ error: 'Credenciales inválidas' })
  }
  FAILS.delete(key)

  const tenant = await getTenant()
  res.json({ token: signToken(user), user: publicUser(user), tenant })
})

router.get('/session', requireAuth, async (req, res) => {
  const tenant = await getTenant()
  res.json({ user: publicUser(req.user), tenant })
})

export default router
