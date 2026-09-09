import pg from 'pg'

const url = process.env.DATABASE_URL
if (!url) throw new Error('DATABASE_URL no configurada')

// SSL solo si la URL lo pide (sslmode=require) o PGSSL=true.
// La red interna de Railway (postgres.railway.internal) NO usa SSL.
const wantSSL = /sslmode=require/.test(url) || process.env.PGSSL === 'true'

export const pool = new pg.Pool({
  connectionString: url,
  ssl: wantSSL ? { rejectUnauthorized: false } : undefined,
  max: 10,
})

export function q(text, params) {
  return pool.query(text, params)
}

export async function tx(fn) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await fn(client)
    await client.query('COMMIT')
    return result
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}
