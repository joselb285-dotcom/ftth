import { Router } from 'express'
import { q, tx } from '../db.js'
import { requireAuth, requireRole } from '../auth.js'
import { projectVisibility, canWriteProject, effectiveOwnerId } from '../rbac.js'

const router = Router()
router.use(requireAuth)

function rowToSubProject(sp, features) {
  return {
    id: sp.id,
    name: sp.name ?? '',
    description: sp.description ?? '',
    createdAt: sp.created_at ?? new Date().toISOString(),
    updatedAt: sp.updated_at ?? new Date().toISOString(),
    location: sp.location_lat != null
      ? { lat: sp.location_lat, lng: sp.location_lng ?? 0, displayName: sp.location_display ?? '' }
      : undefined,
    zabbixOltHosts: sp.zabbix_olt_hosts ?? undefined,
    changeLog: sp.change_log ?? [],
    features: (features ?? []).map(f => ({
      type: 'Feature',
      geometry: f.geometry,
      properties: f.properties,
    })),
  }
}

async function loadProjects(user, tenantId, projectId = null) {
  const vis = projectVisibility(user, 1) // $1 = tenantId
  const params = [tenantId, ...vis.params]
  let sql = `SELECT p.* FROM projects p WHERE p.tenant_id = $1 AND ${vis.sql}`
  if (projectId) { params.push(projectId); sql += ` AND p.id = $${params.length}` }
  sql += ' ORDER BY p.updated_at DESC NULLS LAST'
  const { rows: projects } = await q(sql, params)
  if (projects.length === 0) return []

  const ids = projects.map(p => p.id)
  const { rows: subs } = await q(
    'SELECT * FROM sub_projects WHERE project_id::text = ANY($1)', [ids],
  )
  const subIds = subs.map(s => s.id)
  const { rows: feats } = subIds.length
    ? await q('SELECT * FROM features WHERE sub_project_id::text = ANY($1)', [subIds])
    : { rows: [] }

  const featBySub = new Map()
  for (const f of feats) {
    if (!featBySub.has(f.sub_project_id)) featBySub.set(f.sub_project_id, [])
    featBySub.get(f.sub_project_id).push(f)
  }
  const subsByProject = new Map()
  for (const s of subs) {
    if (!subsByProject.has(s.project_id)) subsByProject.set(s.project_id, [])
    subsByProject.get(s.project_id).push(rowToSubProject(s, featBySub.get(s.id)))
  }

  return projects.map(p => ({
    id: p.id,
    name: p.name ?? '',
    description: p.description ?? '',
    createdAt: p.created_at ?? new Date().toISOString(),
    updatedAt: p.updated_at ?? new Date().toISOString(),
    subProjects: subsByProject.get(p.id) ?? [],
  }))
}

router.get('/', async (req, res) => {
  res.json(await loadProjects(req.user, req.tenant.id))
})

router.get('/:id', async (req, res) => {
  const [p] = await loadProjects(req.user, req.tenant.id, req.params.id)
  if (!p) return res.status(404).json({ error: 'Proyecto no encontrado' })
  res.json(p)
})

router.put('/:id', async (req, res) => {
  const project = req.body
  if (!project || project.id !== req.params.id) {
    return res.status(400).json({ error: 'Payload inválido' })
  }

  const { rows: existing } = await q('SELECT owner_id, tenant_id FROM projects WHERE id = $1', [project.id])
  if (existing[0] && existing[0].tenant_id !== req.tenant.id) {
    return res.status(403).json({ error: 'Sin permisos sobre este proyecto' })
  }
  const ownerId = existing[0]?.owner_id ?? effectiveOwnerId(req.user)
  if (!(await canWriteProject(req.user, ownerId))) {
    return res.status(403).json({ error: 'Sin permisos sobre este proyecto' })
  }

  // sub-proyectos / features no pueden pertenecer a otro proyecto
  const allSubs = project.subProjects ?? []
  if (allSubs.length) {
    const { rows } = await q(
      'SELECT 1 FROM sub_projects WHERE id::text = ANY($1) AND project_id <> $2',
      [allSubs.map(s => s.id), project.id],
    )
    if (rows.length) return res.status(403).json({ error: 'Sub-proyecto pertenece a otro proyecto' })
  }
  const allFeatIds = allSubs.flatMap(s => (s.features ?? []).map(f => f.properties.id))
  if (allFeatIds.length) {
    const { rows } = await q(
      `SELECT 1 FROM features f JOIN sub_projects s ON s.id = f.sub_project_id
       WHERE f.id::text = ANY($1) AND s.project_id <> $2`,
      [allFeatIds, project.id],
    )
    if (rows.length) return res.status(403).json({ error: 'Feature pertenece a otro proyecto' })
  }

  await tx(async (c) => {
    await c.query(
      `INSERT INTO projects (id, tenant_id, owner_id, name, description, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name, description = EXCLUDED.description,
         updated_at = EXCLUDED.updated_at`,
      [project.id, req.tenant.id, ownerId, project.name ?? '', project.description ?? '',
       project.createdAt ?? new Date().toISOString(), project.updatedAt ?? new Date().toISOString()],
    )

    const subs = project.subProjects ?? []
    const spIds = subs.map(s => s.id)
    if (spIds.length)
      await c.query('DELETE FROM sub_projects WHERE project_id = $1 AND NOT (id::text = ANY($2))', [project.id, spIds])
    else
      await c.query('DELETE FROM sub_projects WHERE project_id = $1', [project.id])

    for (const sp of subs) {
      await c.query(
        `INSERT INTO sub_projects (id, project_id, name, description, created_at, updated_at,
           location_lat, location_lng, location_display, zabbix_olt_hosts, change_log)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name, description = EXCLUDED.description, updated_at = EXCLUDED.updated_at,
           location_lat = EXCLUDED.location_lat, location_lng = EXCLUDED.location_lng,
           location_display = EXCLUDED.location_display, zabbix_olt_hosts = EXCLUDED.zabbix_olt_hosts,
           change_log = EXCLUDED.change_log`,
        [sp.id, project.id, sp.name ?? '', sp.description ?? '',
         sp.createdAt ?? new Date().toISOString(), sp.updatedAt ?? new Date().toISOString(),
         sp.location?.lat ?? null, sp.location?.lng ?? null, sp.location?.displayName ?? null,
         sp.zabbixOltHosts ?? null, JSON.stringify(sp.changeLog ?? [])],
      )

      const featIds = (sp.features ?? []).map(f => f.properties.id)
      if (featIds.length)
        await c.query('DELETE FROM features WHERE sub_project_id = $1 AND NOT (id::text = ANY($2))', [sp.id, featIds])
      else
        await c.query('DELETE FROM features WHERE sub_project_id = $1', [sp.id])

      for (const f of sp.features ?? []) {
        await c.query(
          `INSERT INTO features (id, sub_project_id, geometry, properties)
           VALUES ($1,$2,$3,$4)
           ON CONFLICT (id) DO UPDATE SET
             sub_project_id = EXCLUDED.sub_project_id, geometry = EXCLUDED.geometry, properties = EXCLUDED.properties`,
          [f.properties.id, sp.id, JSON.stringify(f.geometry), JSON.stringify(f.properties)],
        )
      }
    }
  })

  res.status(204).end()
})

router.delete('/:id', requireRole('superadmin', 'admin', 'user'), async (req, res) => {
  const { rows } = await q('SELECT owner_id FROM projects WHERE id = $1', [req.params.id])
  if (!rows.length) return res.status(204).end()
  if (!(await canWriteProject(req.user, rows[0].owner_id))) {
    return res.status(403).json({ error: 'Sin permisos sobre este proyecto' })
  }
  await q('DELETE FROM projects WHERE id = $1', [req.params.id])
  res.status(204).end()
})

export default router
