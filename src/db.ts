import { supabase } from './supabase'
import type { Project } from './types'
import {
  localGetProjects, localSaveAllProjects, localSaveProject,
  localDeleteProject, localGetSyncQueue, localEnqueueSync, localDequeueSync,
} from './localDb'

// ── Internal event: notifies useSyncManager that the queue changed ─────────────
function dispatchQueueUpdated() {
  window.dispatchEvent(new CustomEvent('sync-queue-updated'))
}

// ── Raw Supabase calls (no local side-effects) ────────────────────────────────

async function remoteGetProjects(tenantId: string): Promise<Project[]> {
  const { data, error } = await supabase.from('projects').select('data').eq('tenant_id', tenantId)
  if (error) throw error
  return (data ?? []).map(row => row.data as Project)
}

async function remoteSaveProject(project: Project, tenantId: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser()
  const { error } = await supabase.from('projects').upsert({
    id: project.id, tenant_id: tenantId, owner_id: user!.id, data: project,
  })
  if (error) throw error
}

async function remoteDeleteProject(id: string): Promise<void> {
  const { error } = await supabase.from('projects').delete().eq('id', id)
  if (error) throw error
}

// ── Public offline-first API ──────────────────────────────────────────────────

/**
 * Load projects: remote first, fall back to IndexedDB when offline or on error.
 * Remote data is written to IDB so subsequent offline reads are fresh.
 */
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

/**
 * Save project: always persists to IDB immediately.
 * If online, also pushes to Supabase; if offline (or remote fails), enqueues for later.
 */
export async function dbSaveProject(project: Project, tenantId: string): Promise<void> {
  await localSaveProject(project, tenantId)
  if (navigator.onLine) {
    try {
      await remoteSaveProject(project, tenantId)
      return
    } catch { /* fall through to queue */ }
  }
  await localEnqueueSync({ type: 'save', tenantId, projectId: project.id, data: project }, tenantId)
  dispatchQueueUpdated()
}

/**
 * Delete project: removes from IDB immediately.
 * If online, also deletes from Supabase; if offline, enqueues for later.
 */
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
  let flushed = 0
  let failed  = 0

  for (const op of queue) {
    try {
      if (op.type === 'save' && op.data) {
        await remoteSaveProject(op.data, op.tenantId)
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
