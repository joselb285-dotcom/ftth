import { useEffect, useRef, useState } from 'react'
import type { Project } from './types'
import { FeatureIcons, typeLabels } from './editorConstants'
import { useGlobalSearch, type SearchResult } from './useGlobalSearch'

interface Props {
  projects: Project[]
  currentSubProjectId?: string | null
  onNavigate: (projectId: string, subProjectId: string, featureId: string, geometry: GeoJSON.Geometry) => void
  onClose: () => void
}

const KIND_ICON = {
  feature: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
    </svg>
  ),
  client: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/>
    </svg>
  ),
}

export default function GlobalSearch({ projects, currentSubProjectId, onNavigate, onClose }: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [activeIdx, setActiveIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const { search } = useGlobalSearch(projects)

  // Auto-focus
  useEffect(() => { inputRef.current?.focus() }, [])

  // Search on query change (debounced)
  useEffect(() => {
    const t = setTimeout(() => {
      setResults(search(query))
      setActiveIdx(0)
    }, 140)
    return () => clearTimeout(t)
  }, [query, search])

  // Scroll active item into view
  useEffect(() => {
    const el = listRef.current?.querySelectorAll('.gs-result')[activeIdx] as HTMLElement | undefined
    el?.scrollIntoView({ block: 'nearest' })
  }, [activeIdx])

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, results.length - 1)) }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)) }
    if (e.key === 'Enter' && results[activeIdx]) select(results[activeIdx])
    if (e.key === 'Escape') onClose()
  }

  function select(r: SearchResult) {
    onNavigate(r.projectId, r.subProjectId, r.featureId, r.geometry)
    onClose()
  }

  const grouped = results.reduce<Record<string, { spName: string; projName: string; items: SearchResult[] }>>((acc, r) => {
    const key = `${r.projectId}:${r.subProjectId}`
    if (!acc[key]) acc[key] = { spName: r.subProjectName, projName: r.projectName, items: [] }
    acc[key].items.push(r)
    return acc
  }, {})

  const totalFeatures = projects.reduce((s, p) => s + p.subProjects.reduce((ss, sp) => ss + sp.features.length, 0), 0)

  return (
    <div className="gs-overlay" onClick={onClose}>
      <div className="gs-modal" onClick={e => e.stopPropagation()}>

        <div className="gs-search-row">
          <svg className="gs-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
          </svg>
          <input
            ref={inputRef}
            className="gs-input"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Buscar elemento, cliente, código, serie ONU, dirección…"
          />
          {query && (
            <button className="gs-clear" onClick={() => setQuery('')}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          )}
          <kbd className="gs-esc-hint">Esc</kbd>
        </div>

        <div className="gs-body" ref={listRef}>
          {query.length < 2 && (
            <div className="gs-hint">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
              </svg>
              <p>Buscá en <strong>{totalFeatures.toLocaleString('es-AR')}</strong> elementos de <strong>{projects.length}</strong> proyecto{projects.length !== 1 ? 's' : ''}</p>
              <small>Nombre · Código · Cliente · Serie ONU · Dirección</small>
            </div>
          )}

          {query.length >= 2 && results.length === 0 && (
            <div className="gs-hint">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
              <p>Sin resultados para <strong>"{query}"</strong></p>
            </div>
          )}

          {Object.entries(grouped).map(([key, group]) => {
            const flatIdx0 = results.findIndex(r => `${r.projectId}:${r.subProjectId}` === key)
            const isCurrent = group.items[0]?.subProjectId === currentSubProjectId
            return (
              <div key={key} className="gs-group">
                <div className="gs-group-header">
                  <span className="gs-group-path">
                    {group.projName}
                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9 18l6-6-6-6"/>
                    </svg>
                    {group.spName}
                  </span>
                  {isCurrent && <span className="gs-current-badge">subproyecto actual</span>}
                </div>
                {group.items.map((r, i) => {
                  const absIdx = flatIdx0 + i
                  const isActive = absIdx === activeIdx
                  return (
                    <button
                      key={r.id}
                      className={`gs-result ${isActive ? 'gs-active' : ''} gs-result-${r.kind}`}
                      onClick={() => select(r)}
                      onMouseEnter={() => setActiveIdx(absIdx)}
                    >
                      <span className={`gs-result-icon gs-icon-${r.featureType}`}>
                        {FeatureIcons[r.featureType]}
                      </span>
                      <span className="gs-result-body">
                        <span className="gs-result-main">
                          {r.kind === 'client' ? (
                            <>
                              <span className="gs-client-name">{r.clientName || '(sin nombre)'}</span>
                              <span className="gs-client-via">en {r.featureName || typeLabels[r.featureType]}</span>
                            </>
                          ) : (
                            <>
                              <span className="gs-feature-name">{r.featureName || typeLabels[r.featureType]}</span>
                              {r.featureCode && <span className="gs-feature-code">{r.featureCode}</span>}
                            </>
                          )}
                        </span>
                        <span className="gs-result-meta">
                          <span className="gs-match-badge">
                            {KIND_ICON[r.kind]}
                            {r.matchField}: {r.matchValue}
                          </span>
                          {r.kind === 'client' && (
                            <>
                              {r.cable && <span>{r.cable} · {r.fiber}</span>}
                              {r.onuSerial && <span>SN: {r.onuSerial}</span>}
                              {r.powerDbm && <span>{r.powerDbm} dBm</span>}
                            </>
                          )}
                          <span className="gs-type-badge">{r.featureTypeLabel}</span>
                        </span>
                      </span>
                      <span className="gs-result-arrow">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M9 18l6-6-6-6"/>
                        </svg>
                      </span>
                    </button>
                  )
                })}
              </div>
            )
          })}
        </div>

        {results.length > 0 && (
          <div className="gs-footer">
            <span>{results.length} resultado{results.length !== 1 ? 's' : ''}</span>
            <span className="gs-footer-hint">
              <kbd>↑↓</kbd> navegar · <kbd>↵</kbd> ir al elemento · <kbd>Esc</kbd> cerrar
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
