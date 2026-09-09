import express from 'express'
import cors from 'cors'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getTenant } from './auth.js'
import authRoutes from './routes/auth.js'
import projectRoutes from './routes/projects.js'
import customerRoutes from './routes/customers.js'
import monitoringRoutes from './routes/monitoring.js'
import adminRoutes from './routes/admin.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DIST = path.join(__dirname, '..', 'dist')
const app = express()

app.use(cors())               // apps servidas desde otro origen (field app) usan el API
app.use(express.json({ limit: '25mb' }))

app.get('/api/health', (_req, res) => res.json({ ok: true }))

// Tenant único cacheado — lo necesitan projects/customers/monitoring
let cachedTenant = null
async function attachTenant(req, res, next) {
  try {
    if (!cachedTenant) cachedTenant = await getTenant()
    if (!cachedTenant) return res.status(500).json({ error: 'Tenant no inicializado (correr migración/seed)' })
    req.tenant = cachedTenant
    next()
  } catch (err) { next(err) }
}

app.use('/api/auth', authRoutes)
app.use('/api/projects', attachTenant, projectRoutes)
app.use('/api/customers', attachTenant, customerRoutes)
app.use('/api/monitoring', attachTenant, monitoringRoutes)
app.use('/api/admin', adminRoutes)

app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' })
  next()
})

// Frontend estático + fallback SPA
app.use(express.static(DIST))
app.get('*', (_req, res) => res.sendFile(path.join(DIST, 'index.html')))

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error(err)
  res.status(500).json({ error: err.message || 'Error interno' })
})

const port = process.env.PORT || 8080
app.listen(port, '0.0.0.0', () => console.log(`API + frontend en :${port}`))
