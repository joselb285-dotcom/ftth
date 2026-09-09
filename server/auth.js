import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import { q } from './db.js'

const SECRET = process.env.JWT_SECRET
if (!SECRET) throw new Error('JWT_SECRET no configurada')

const TENANT_SLUG = process.env.TENANT_SLUG ?? 'ftth'

export function hashPassword(plain) {
  return bcrypt.hash(plain, 10)
}

export function signToken(user) {
  return jwt.sign({ sub: user.id, email: user.email, role: user.role }, SECRET, { expiresIn: '30d' })
}

export async function getTenant() {
  const { rows } = await q('SELECT id, slug, name FROM tenants WHERE slug = $1', [TENANT_SLUG])
  return rows[0] ?? null
}

export async function loadUser(id) {
  const { rows } = await q(
    'SELECT id, email, full_name, role, admin_id FROM users WHERE id = $1',
    [id],
  )
  return rows[0] ?? null
}

export function publicUser(u) {
  return { id: u.id, email: u.email, fullName: u.full_name ?? null, role: u.role, adminId: u.admin_id ?? null }
}

// Middleware: exige token válido, adjunta req.user (fila cruda de users)
export async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || ''
    const token = header.startsWith('Bearer ') ? header.slice(7) : null
    if (!token) return res.status(401).json({ error: 'Sin autorización' })
    const payload = jwt.verify(token, SECRET)
    const user = await loadUser(payload.sub)
    if (!user) return res.status(401).json({ error: 'Usuario no encontrado' })
    req.user = user
    next()
  } catch {
    return res.status(401).json({ error: 'Token inválido' })
  }
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'Prohibido' })
    next()
  }
}

export async function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash)
}
