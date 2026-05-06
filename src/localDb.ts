import { createStore, get, set, del } from 'idb-keyval'
import type { Project } from './types'

const projectStore = createStore('ftth-projects-db', 'projects')
const syncStore    = createStore('ftth-sync-db', 'sync-queue')

// ── SyncOp type ───────────────────────────────────────────────────────────────

export type SyncOp = {
  id: string
  type: 'save' | 'delete'
  tenantId: string
  projectId: string
  data?: Project
  timestamp: string
}

// ── Projects ──────────────────────────────────────────────────────────────────

export async function localGetProjects(tenantId: string): Promise<Project[]> {
  return (await get<Project[]>(tenantId, projectStore)) ?? []
}

export async function localSaveAllProjects(projects: Project[], tenantId: string): Promise<void> {
  await set(tenantId, projects, projectStore)
}

export async function localSaveProject(project: Project, tenantId: string): Promise<void> {
  const current = await localGetProjects(tenantId)
  const updated = current.some(p => p.id === project.id)
    ? current.map(p => (p.id === project.id ? project : p))
    : [...current, project]
  await set(tenantId, updated, projectStore)
}

export async function localDeleteProject(projectId: string, tenantId: string): Promise<void> {
  const current = await localGetProjects(tenantId)
  await set(tenantId, current.filter(p => p.id !== projectId), projectStore)
}

// ── Sync queue ────────────────────────────────────────────────────────────────

export async function localGetSyncQueue(tenantId: string): Promise<SyncOp[]> {
  return (await get<SyncOp[]>(tenantId, syncStore)) ?? []
}

export async function localEnqueueSync(
  op: Omit<SyncOp, 'id' | 'timestamp'>,
  tenantId: string,
): Promise<void> {
  const queue = await localGetSyncQueue(tenantId)
  // Deduplicate: replace existing op for the same project+type
  const deduped = queue.filter(o => !(o.projectId === op.projectId && o.type === op.type))
  const newOp: SyncOp = {
    ...op,
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
  }
  await set(tenantId, [...deduped, newOp], syncStore)
}

export async function localDequeueSync(opId: string, tenantId: string): Promise<void> {
  const queue = await localGetSyncQueue(tenantId)
  await set(tenantId, queue.filter(o => o.id !== opId), syncStore)
}

export async function localClearSyncQueue(tenantId: string): Promise<void> {
  await del(tenantId, syncStore)
}
