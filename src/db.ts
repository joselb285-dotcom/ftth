import { supabase } from './supabase'
import type { AppFeatureProperties, Project } from './types'
import {
  localGetProjects, localSaveAllProjects, localSaveProject,
  localDeleteProject, localGetSyncQueue, localEnqueueSync, localDequeueSync,
} from './localDb'

function dispatchQueueUpdated() {
  window.dispatchEvent(new CustomEvent('sync-queue-updated'))
}

// ── Raw Supabase calls (no local side-effects) ────────────────────────────────

async function remoteGetProjects(tenantId: string): Promise<Project[]> {
  // RLS se encarga del filtrado por rol automáticamente
  const { data, error } = await supabase
    .from('projects')
    .select(`
      id, name, description, created_at, updated_at,
      sub_projects (
        id, name, description, created_at, updated_at,
        location_lat, location_lng, location_display, zabbix_olt_hosts,
        features ( id, geometry, properties )
      )
    `)
    .eq('tenant_id', tenantId)
    .order('updated_at', { ascending: false })

  if (error) throw error

  return (data ?? []).map(row => ({
    id: row.id,
    name: row.name ?? '',
    description: row.description ?? '',
    createdAt: row.created_at ?? new Date().toISOString(),
    updatedAt: row.updated_at ?? new Date().toISOString(),
    subProjects: ((row.sub_projects ?? []) as any[]).map((sp: any) => ({
      id: sp.id,
      name: sp.name ?? '',
      description: sp.description ?? '',
      createdAt: sp.created_at ?? new Date().toISOString(),
      updatedAt: sp.updated_at ?? new Date().toISOString(),
      location: sp.location_lat != null
        ? { lat: sp.location_lat, lng: sp.location_lng ?? 0, displayName: sp.location_display ?? '' }
        : undefined,
      zabbixOltHosts: sp.zabbix_olt_hosts ?? undefined,
      features: ((sp.features ?? []) as any[]).map((f: any) => ({
        type: 'Feature' as const,
        geometry: f.geometry,
        properties: f.properties as AppFeatureProperties,
      })),
    })),
  }))
}

async function remoteSaveProject(project: Project, tenantId: string, ownerId: string): Promise<void> {
  // 1. Upsert proyecto
  const { error: projErr } = await supabase.from('projects').upsert({
    id: project.id,
    tenant_id: tenantId,
    owner_id: ownerId,
    name: project.name,
    description: project.description ?? '',
    created_at: project.createdAt,
    updated_at: project.updatedAt,
  })
  if (projErr) throw projErr

  // 2. Eliminar sub_projects removidos (cascade elimina sus features)
  const spIds = project.subProjects.map(sp => sp.id)
  if (spIds.length > 0) {
    await supabase
      .from('sub_projects')
      .delete()
      .eq('project_id', project.id)
      .not('id', 'in', `(${spIds.map(id => `'${id}'`).join(',')})`)
  } else {
    await supabase.from('sub_projects').delete().eq('project_id', project.id)
  }

  if (project.subProjects.length === 0) return

  // 3. Upsert sub_projects
  const { error: spErr } = await supabase.from('sub_projects').upsert(
    project.subProjects.map(sp => ({
      id: sp.id,
      project_id: project.id,
      name: sp.name,
      description: sp.description ?? '',
      created_at: sp.createdAt,
      updated_at: sp.updatedAt,
      location_lat: sp.location?.lat ?? null,
      location_lng: sp.location?.lng ?? null,
      location_display: sp.location?.displayName ?? null,
      zabbix_olt_hosts: sp.zabbixOltHosts ?? null,
    }))
  )
  if (spErr) throw spErr

  // 4. Features por sub_project
  for (const sp of project.subProjects) {
    const featIds = sp.features.map(f => f.properties.id)
    if (featIds.length > 0) {
      await supabase
        .from('features')
        .delete()
        .eq('sub_project_id', sp.id)
        .not('id', 'in', `(${featIds.map(id => `'${id}'`).join(',')})`)

      const { error: featErr } = await supabase.from('features').upsert(
        sp.features.map(f => ({
          id: f.properties.id,
          sub_project_id: sp.id,
          geometry: f.geometry,
          properties: f.properties,
        }))
      )
      if (featErr) throw featErr
    } else {
      await supabase.from('features').delete().eq('sub_project_id', sp.id)
    }
  }
}

async function remoteDeleteProject(id: string): Promise<void> {
  // CASCADE en sub_projects y features maneja la limpieza automáticamente
  const { error } = await supabase.from('projects').delete().eq('id', id)
  if (error) throw error
}

// ── Public offline-first API ──────────────────────────────────────────────────

export async function dbGetAllProjects(tenantId: string): Promise<Project[]> {
  if (navigator.onLine) {
    try {
      const remote = await remoteGetProjects(tenantId)
      await localSaveAllProjects(remote, tenantId)
      return remote
    } catch { /* fall through */ }
  }
  return localGetProjects(tenantId)
}

export async function dbSaveProject(project: Project, tenantId: string, ownerId: string): Promise<void> {
  await localSaveProject(project, tenantId)
  if (navigator.onLine) {
    try {
      await remoteSaveProject(project, tenantId, ownerId)
      return
    } catch { /* fall through to queue */ }
  }
  await localEnqueueSync({ type: 'save', tenantId, projectId: project.id, ownerId, data: project }, tenantId)
  dispatchQueueUpdated()
}

export async function dbDeleteProject(id: string, tenantId: string): Promise<void> {
  await localDeleteProject(id, tenantId)
  if (navigator.onLine) {
    try {
      await remoteDeleteProject(id)
      return
    } catch { /* fall through to queue */ }
  }
  await localEnqueueSync({ type: 'delete', tenantId, projectId: id }, tenantId)
  dispatchQueueUpdated()
}

// ── Sync helpers (consumed by useSyncManager) ─────────────────────────────────

export async function dbGetSyncQueueLength(tenantId: string): Promise<number> {
  return (await localGetSyncQueue(tenantId)).length
}

export async function dbFlushSyncQueue(
  tenantId: string,
): Promise<{ flushed: number; failed: number }> {
  const queue = await localGetSyncQueue(tenantId)
  const { data: { user } } = await supabase.auth.getUser()
  let flushed = 0
  let failed  = 0

  for (const op of queue) {
    try {
      if (op.type === 'save' && op.data) {
        await remoteSaveProject(op.data, op.tenantId, op.ownerId ?? user!.id)
      } else if (op.type === 'delete') {
        await remoteDeleteProject(op.projectId)
      }
      await localDequeueSync(op.id, tenantId)
      flushed++
    } catch {
      failed++
    }
  }

  return { flushed, failed }
}
