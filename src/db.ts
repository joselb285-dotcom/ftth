import { api } from './api'
import type { Project } from './types'
import {
  localGetProjects, localSaveAllProjects, localSaveProject,
  localDeleteProject, localGetSyncQueue, localEnqueueSync, localDequeueSync,
} from './localDb'

function dispatchQueueUpdated() {
  window.dispatchEvent(new CustomEvent('sync-queue-updated'))
}

// ── Raw API calls (no local side-effects) ─────────────────────────────────────
// El backend filtra por tenant y rol vía el JWT; tenantId/ownerId solo se usan
// para el cache local (localDb) y la cola de sync.

async function remoteGetProjects(): Promise<Project[]> {
  return api<Project[]>('/api/projects')
}

async function remoteSaveProject(project: Project): Promise<void> {
  await api(`/api/projects/${project.id}`, { method: 'PUT', body: JSON.stringify(project) })
}

async function remoteDeleteProject(id: string): Promise<void> {
  await api(`/api/projects/${id}`, { method: 'DELETE' })
}

// ── Public offline-first API ──────────────────────────────────────────────────

export async function dbGetAllProjects(tenantId: string): Promise<Project[]> {
  if (navigator.onLine) {
    try {
      const [remote, pending] = await Promise.all([
        remoteGetProjects(),
        localGetSyncQueue(tenantId),
      ])
      // Si hay guardados locales sin sincronizar, priorizar el cache local para
      // no pisar dibujos que todavía no llegaron al servidor.
      if (pending.length === 0) {
        await localSaveAllProjects(remote, tenantId)
        return remote
      }
      return localGetProjects(tenantId)
    } catch { /* fall through */ }
  }
  return localGetProjects(tenantId)
}

export async function dbSaveProject(project: Project, tenantId: string, ownerId: string): Promise<void> {
  await localSaveProject(project, tenantId)
  if (navigator.onLine) {
    try {
      await remoteSaveProject(project)
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
  let flushed = 0
  let failed  = 0

  for (const op of queue) {
    try {
      if (op.type === 'save' && op.data) {
        await remoteSaveProject(op.data)
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
