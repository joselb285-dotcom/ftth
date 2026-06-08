// IndexedDB cache for offline-capable subproject data
import type { SubProject, Project } from './types'
import { supabase } from './supabase'

const DB_NAME = 'ftth-field-cache'
const DB_VERSION = 1
const STORE_SUBPROJECTS = 'subprojects'
const STORE_META = 'meta'

export type CachedSubProject = {
  key: string   // `${tenantId}::${projectId}::${subProjectId}`
  subProject: SubProject
  projectId: string
  projectName: string
  tenantId: string
  cachedAt: string
  fromCache?: boolean
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_SUBPROJECTS)) {
        db.createObjectStore(STORE_SUBPROJECTS, { keyPath: 'key' })
      }
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META, { keyPath: 'k' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function tx<T>(
  db: IDBDatabase,
  store: string,
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode)
    const req = fn(t.objectStore(store))
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function saveSubProjectToCache(data: CachedSubProject): Promise<void> {
  const db = await openDB()
  await tx(db, STORE_SUBPROJECTS, 'readwrite', s => s.put(data))
}

export async function getCachedSubProject(key: string): Promise<CachedSubProject | null> {
  const db = await openDB()
  const result = await tx<CachedSubProject | undefined>(db, STORE_SUBPROJECTS, 'readonly', s => s.get(key))
  return result ?? null
}

export async function getAllCachedSubProjects(): Promise<CachedSubProject[]> {
  const db = await openDB()
  return tx<CachedSubProject[]>(db, STORE_SUBPROJECTS, 'readonly', s => s.getAll())
}

export async function deleteCachedSubProject(key: string): Promise<void> {
  const db = await openDB()
  await tx<undefined>(db, STORE_SUBPROJECTS, 'readwrite', s => s.delete(key))
}

export function makeKey(tenantId: string, projectId: string, subProjectId: string): string {
  return `${tenantId}::${projectId}::${subProjectId}`
}

// Fetch from Supabase and persist to IndexedDB, skipping full download if unchanged
export async function syncSubProject(
  tenantId: string,
  project: Project,
  subProjectId: string
): Promise<CachedSubProject> {
  const key = makeKey(tenantId, project.id, subProjectId)

  // Check remote updatedAt before downloading
  const { data: meta, error: metaError } = await supabase
    .from('projects')
    .select('updatedAt')
    .eq('tenant_id', tenantId)
    .eq('id', project.id)
    .single()

  if (metaError) throw metaError

  const existing = await getCachedSubProject(key)
  if (existing && meta.updatedAt <= existing.cachedAt) {
    return { ...existing, fromCache: true }
  }

  const { data, error } = await supabase
    .from('projects')
    .select('data')
    .eq('tenant_id', tenantId)
    .eq('id', project.id)
    .single()

  if (error) throw error

  const freshProject = data.data as Project
  const subProject = freshProject.subProjects.find(sp => sp.id === subProjectId)
  if (!subProject) throw new Error('Sub-proyecto no encontrado')

  const cached: CachedSubProject = {
    key,
    subProject,
    projectId: project.id,
    projectName: project.name,
    tenantId,
    cachedAt: new Date().toISOString(),
    fromCache: false,
  }
  await saveSubProjectToCache(cached)
  return cached
}
