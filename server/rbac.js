import { q } from './db.js'

// owner_id con el que se guardan los proyectos de este usuario:
//  - admin/superadmin: su propio id
//  - user/tecnico: el id de su admin (o el propio si no tiene)
export function effectiveOwnerId(user) {
  if (user.role === 'user' || user.role === 'tecnico') return user.admin_id ?? user.id
  return user.id
}

// Fragmento WHERE (+ params) para filtrar `projects p` por visibilidad de rol.
// `offset` = cantidad de parámetros que ya van antes en la query ($1..$offset).
export function projectVisibility(user, offset = 0) {
  if (user.role === 'superadmin') return { sql: 'TRUE', params: [] }
  const p = offset + 1
  if (user.role === 'admin') {
    return {
      sql: `(p.owner_id = $${p} OR p.owner_id IN (SELECT id FROM users WHERE admin_id = $${p}))`,
      params: [user.id],
    }
  }
  return { sql: `p.owner_id = $${p}`, params: [effectiveOwnerId(user)] }
}

// ¿Puede este usuario escribir/borrar un proyecto cuyo owner_id es `ownerId`?
export async function canWriteProject(user, ownerId) {
  if (user.role === 'superadmin') return true
  if (user.role === 'admin') {
    if (ownerId === user.id) return true
    const { rows } = await q('SELECT 1 FROM users WHERE id = $1 AND admin_id = $2', [ownerId, user.id])
    return rows.length > 0
  }
  return ownerId === effectiveOwnerId(user)
}
