import { useCallback, useEffect, useRef, useState } from 'react'
import { dbFlushSyncQueue, dbGetSyncQueueLength } from './db'

export type SyncStatus = 'synced' | 'pending' | 'syncing' | 'error'

export interface SyncManager {
  isOnline:     boolean
  pendingCount: number
  status:       SyncStatus
  flush:        () => Promise<void>
}

export function useSyncManager(tenantId: string | null): SyncManager {
  const [isOnline,     setIsOnline]     = useState(() => navigator.onLine)
  const [pendingCount, setPendingCount] = useState(0)
  const [status,       setStatus]       = useState<SyncStatus>('synced')
  const isSyncingRef                    = useRef(false)

  const refresh = useCallback(async () => {
    if (!tenantId) { setPendingCount(0); setStatus('synced'); return }
    const n = await dbGetSyncQueueLength(tenantId)
    setPendingCount(n)
    setStatus(n > 0 ? 'pending' : 'synced')
  }, [tenantId])

  const flush = useCallback(async () => {
    if (!tenantId || isSyncingRef.current || !navigator.onLine) return
    isSyncingRef.current = true
    setStatus('syncing')
    const { failed } = await dbFlushSyncQueue(tenantId)
    isSyncingRef.current = false
    if (failed > 0) {
      setStatus('error')
      await refresh()
    } else {
      await refresh()
    }
  }, [tenantId, refresh])

  useEffect(() => {
    refresh()

    function onOnline()  { setIsOnline(true);  flush() }
    function onOffline() { setIsOnline(false); setStatus(s => s === 'synced' ? s : 'pending') }
    function onQueueUpdated() { refresh() }

    window.addEventListener('online',             onOnline)
    window.addEventListener('offline',            onOffline)
    window.addEventListener('sync-queue-updated', onQueueUpdated)
    return () => {
      window.removeEventListener('online',             onOnline)
      window.removeEventListener('offline',            onOffline)
      window.removeEventListener('sync-queue-updated', onQueueUpdated)
    }
  }, [tenantId, refresh, flush])

  return { isOnline, pendingCount, status, flush }
}
