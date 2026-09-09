import { Router } from 'express'
import { q } from '../db.js'
import {
  signToken, verifyPassword, requireAuth, getTenant, publicUser,
} from '../auth.js'

const router = Router()

router.post('/login', async (req, res) => {
  const { email, password } = req.body ?? {}
  if (!email || !password) return res.status(400).json({ error: 'Email y contraseña requeridos' })

  const { rows } = await q(
    'SELECT id, email, password_hash, full_name, role, admin_id FROM users WHERE lower(email) = lower($1)',
    [email],
  )
  const user = rows[0]
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    return res.status(401).json({ error: 'Credenciales inválidas' })
  }

  const tenant = await getTenant()
  res.json({ token: signToken(user), user: publicUser(user), tenant })
})

router.get('/session', requireAuth, async (req, res) => {
  const tenant = await getTenant()
  res.json({ user: publicUser(req.user), tenant })
})

export default router
