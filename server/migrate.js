// Corre el schema (idempotente) y siembra tenant + superadmin.
// Uso:  node server/migrate.js
// Vars: DATABASE_URL, TENANT_SLUG (def "ftth"), SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { q, pool } from './db.js'
import { hashPassword } from './auth.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

async function main() {
  const sql = await readFile(path.join(__dirname, 'schema.sql'), 'utf8')
  await q(sql)
  console.log('✓ schema aplicado')

  const slug = process.env.TENANT_SLUG ?? 'ftth'
  const { rows: t } = await q(
    `INSERT INTO tenants (slug, name) VALUES ($1, $2)
     ON CONFLICT (slug) DO UPDATE SET slug = EXCLUDED.slug RETURNING id`,
    [slug, slug.toUpperCase()],
  )
  console.log(`✓ tenant "${slug}" (${t[0].id})`)

  const email = process.env.SEED_ADMIN_EMAIL
  const pass = process.env.SEED_ADMIN_PASSWORD
  if (email && pass) {
    const { rows } = await q(
      `INSERT INTO users (email, password_hash, full_name, role)
       VALUES ($1, $2, 'Superadmin', 'superadmin')
       ON CONFLICT (email) DO NOTHING
       RETURNING id`,
      [email, await hashPassword(pass)],
    )
    if (rows.length) {
      await q(
        `INSERT INTO user_tenants (user_id, tenant_id, role) VALUES ($1, $2, 'admin')
         ON CONFLICT DO NOTHING`,
        [rows[0].id, t[0].id],
      )
      console.log(`✓ superadmin creado: ${email}`)
    } else {
      console.log(`· superadmin ${email} ya existe — sin cambios`)
    }
  } else {
    console.log('· sin SEED_ADMIN_EMAIL/PASSWORD — omito seed de usuario')
  }

  await pool.end()
}

main().catch((err) => { console.error(err); process.exit(1) })
