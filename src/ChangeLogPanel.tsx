import { useMemo, useState } from 'react'
import type { ChangeLogEntry, ChangeLogAction } from './types'

interface Props {
  entries: ChangeLogEntry[]
  onClose: () => void
  onRollback: (entry: ChangeLogEntry) => void
}

const ACTION_LABEL: Record<ChangeLogAction, string> = {
  created:      'Creado',
  updated:      'Actualizado',
  deleted:      'Eliminado',
  duplicated:   'Duplicado',
  imported:     'Importado',
  bulk_deleted: 'Eliminación masiva',
  cleared:      'Limpiado',
  note_added:   'Nota agregada',
}

const ACTION_COLOR: Record<ChangeLogAction, string> = {
  created:      'chlog-created',
  updated:      'chlog-updated',
  deleted:      'chlog-deleted',
  duplicated:   'chlog-duplicated',
  imported:     'chlog-imported',
  bulk_deleted: 'chlog-deleted',
  cleared:      'chlog-deleted',
  note_added:   'chlog-updated',
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
}

function formatDate(iso: string) {
  const d = new Date(iso)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  if (d.toDateString() === today.toDateString()) return 'Hoy'
  if (d.toDateString() === yesterday.toDateString()) return 'Ayer'
  return d.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })
}

function getDateKey(iso: string) {
  return new Date(iso).toDateString()
}

function initials(email: string) {
  if (!email) return '?'
  const [local] = email.split('@')
  const parts = local.split(/[._-]/)
  return parts.slice(0, 2).map(p => p[0]?.toUpperCase() ?? '').join('') || email[0].toUpperCase()
}

function exportToCSV(entries: ChangeLogEntry[]) {
  const lines = [
    'Fecha,Hora,Usuario,Acción,Elemento,Tipo,Campo,Valor anterior,Valor nuevo',
    ...entries.map(e => [
      new Date(e.ts).toLocaleDateString('es-AR'),
      formatTime(e.ts),
      e.userEmail,
      ACTION_LABEL[e.action] ?? e.action,
      e.featureName,
      e.featureType,
      e.changedLabel ?? '',
      e.previousValue ?? '',
      e.newValue ?? '',
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
  ]
  const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `historial-${new Date().toISOString().slice(0,10)}.csv`
  document.body.appendChild(a); a.click(); document.body.removeChild(a)
}

export default function ChangeLogPanel({ entries, onClose, onRollback }: Props) {
  const [filterAction, setFilterAction] = useState<ChangeLogAction | 'all'>('all')
  const [filterUser,   setFilterUser]   = useState<string>('all')
  const [search,       setSearch]       = useState('')

  // Unique users
  const users = useMemo(() => {
    const set = new Set(entries.map(e => e.userEmail).filter(Boolean))
    return [...set]
  }, [entries])

  // Filtered entries
  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return entries.filter(e => {
      if (filterAction !== 'all' && e.action !== filterAction) return false
      if (filterUser !== 'all' && e.userEmail !== filterUser) return false
      if (q && !e.featureName.toLowerCase().includes(q) &&
          !e.userEmail.toLowerCase().includes(q) &&
          !(e.changedLabel ?? '').toLowerCase().includes(q)) return false
      return true
    })
  }, [entries, filterAction, filterUser, search])

  // Group by date
  const grouped = useMemo(() => {
    const map = new Map<string, ChangeLogEntry[]>()
    for (const e of filtered) {
      const key = getDateKey(e.ts)
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(e)
    }
    return [...map.entries()]
  }, [filtered])

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal changelog-modal" onClick={e => e.stopPropagation()}>

        <div className="modal-header">
          <div>
            <h2>Historial de cambios</h2>
            <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--fg3)' }}>
              {entries.length} registro{entries.length !== 1 ? 's' : ''} · persiste entre sesiones
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="secondary small" onClick={() => exportToCSV(filtered)} title="Exportar historial como CSV">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              CSV
            </button>
            <button className="secondary small" onClick={onClose}>✕</button>
          </div>
        </div>

        {/* Filters */}
        <div className="chlog-filters">
          <div className="chlog-search-wrap">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
            </svg>
            <input className="chlog-search" placeholder="Buscar elemento…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <select className="chlog-select" value={filterAction} onChange={e => setFilterAction(e.target.value as any)}>
            <option value="all">Todas las acciones</option>
            {Object.entries(ACTION_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          {users.length > 1 && (
            <select className="chlog-select" value={filterUser} onChange={e => setFilterUser(e.target.value)}>
              <option value="all">Todos los usuarios</option>
              {users.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          )}
        </div>

        <div className="modal-body changelog-body">
          {filtered.length === 0 && (
            <p className="empty-state">{entries.length === 0 ? 'Sin cambios registrados aún.' : 'Sin resultados para los filtros aplicados.'}</p>
          )}

          {grouped.map(([dateKey, dayEntries]) => (
            <div key={dateKey} className="chlog-day-group">
              <div className="chlog-day-header">
                <span>{formatDate(dayEntries[0].ts)}</span>
                <span className="chlog-day-count">{dayEntries.length} cambio{dayEntries.length !== 1 ? 's' : ''}</span>
              </div>

              {dayEntries.map(entry => (
                <div key={entry.id} className={`chlog-entry ${ACTION_COLOR[entry.action] ?? ''}`}>
                  {/* User avatar */}
                  <div className="chlog-avatar" title={entry.userEmail}>
                    {initials(entry.userEmail)}
                  </div>

                  <div className="chlog-entry-body">
                    <div className="chlog-entry-top">
                      <span className={`chlog-action-badge ${ACTION_COLOR[entry.action] ?? ''}`}>
                        {ACTION_LABEL[entry.action] ?? entry.action}
                      </span>
                      <span className="chlog-feature-name">
                        {entry.featureName || entry.featureType || '—'}
                      </span>
                      {entry.changedLabel && (
                        <span className="chlog-field-badge">
                          {entry.changedLabel}
                        </span>
                      )}
                    </div>

                    {(entry.previousValue || entry.newValue) && (
                      <div className="chlog-value-change">
                        {entry.previousValue && <span className="chlog-prev">"{entry.previousValue}"</span>}
                        {entry.previousValue && entry.newValue && (
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M5 12h14M12 5l7 7-7 7"/>
                          </svg>
                        )}
                        {entry.newValue && <span className="chlog-next">"{entry.newValue}"</span>}
                      </div>
                    )}

                    <div className="chlog-entry-meta">
                      <span className="chlog-time">{formatTime(entry.ts)}</span>
                      {entry.userEmail && <span className="chlog-user">{entry.userEmail}</span>}
                    </div>
                  </div>

                  {/* Rollback button for deleted entries with snapshot */}
                  {entry.action === 'deleted' && entry.snapshot && (
                    <button
                      className="chlog-rollback-btn"
                      title="Restaurar este elemento"
                      onClick={() => {
                        if (window.confirm(`¿Restaurar "${entry.featureName}"?`)) onRollback(entry)
                      }}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="1 4 1 10 7 10"/>
                        <path d="M3.51 15a9 9 0 102.13-9.36L1 10"/>
                      </svg>
                      Restaurar
                    </button>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
