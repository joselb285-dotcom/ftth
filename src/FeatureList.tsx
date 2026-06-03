import { useState } from 'react'
import type { AppFeature } from './types'
import { typeLabels, statusLabels, FeatureIcons, featureTypeClass, statusClass } from './editorConstants'

interface Props {
  features: AppFeature[]
  selectedFeatureId: string | null
  selectedFeatureIds: Set<string>
  expanded: boolean
  onToggle: () => void
  onSelect: (id: string) => void
  onToggleMulti: (id: string) => void
  onZoom: (id: string) => void
}

export default function FeatureList({ features, selectedFeatureId, selectedFeatureIds, expanded, onToggle, onSelect, onToggleMulti, onZoom }: Props) {
  const [query, setQuery] = useState('')

  const filtered = query.trim()
    ? features.filter(f => {
        const q = query.toLowerCase()
        return (
          f.properties.name.toLowerCase().includes(q) ||
          f.properties.code.toLowerCase().includes(q) ||
          typeLabels[f.properties.featureType].toLowerCase().includes(q)
        )
      })
    : features

  return (
    <section className={`panel-block panel-section ${expanded ? 'expanded' : ''}`}>
      <button type="button" className="panel-toggle" onClick={onToggle}>
        <span>Elementos ({features.length}{query && filtered.length !== features.length ? ` · ${filtered.length} resultado${filtered.length !== 1 ? 's' : ''}` : ''})</span>
        <svg className="panel-toggle-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 18l6-6-6-6"/>
        </svg>
      </button>
      {expanded && (
        <div className="panel-content feature-list">
          {selectedFeatureIds.size > 0 && (
            <p className="feature-list-multiselect-hint">
              {selectedFeatureIds.size} seleccionado{selectedFeatureIds.size !== 1 ? 's' : ''} · Ctrl+clic para agregar más
            </p>
          )}
          {features.length > 0 && (
            <div className="feature-list-search">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input
                className="feature-list-search-input"
                placeholder="Buscar nombre, código o tipo..."
                value={query}
                onChange={e => setQuery(e.target.value)}
              />
              {query && <button className="feature-list-search-clear" onClick={() => setQuery('')}>✕</button>}
            </div>
          )}
          {features.length === 0
            ? <p className="empty-state">Todavía no hay elementos. Usá las herramientas del mapa para agregar.</p>
            : filtered.length === 0
              ? <p className="empty-state">Sin resultados para "{query}".</p>
              : null}
          {filtered.map(feature => {
            const isSelected = selectedFeatureId === feature.properties.id
            const isMulti    = selectedFeatureIds.has(feature.properties.id)
            return (
            <button key={feature.properties.id}
              className={`feature-row ${isSelected ? 'selected' : ''} ${isMulti ? 'multi-selected' : ''}`}
              onClick={e => {
                if (e.ctrlKey || e.metaKey) onToggleMulti(feature.properties.id)
                else onSelect(feature.properties.id)
              }}>
              <span className={`feature-type-icon ${featureTypeClass[feature.properties.featureType] ?? ''}`}>
                {FeatureIcons[feature.properties.featureType]}
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <strong>{feature.properties.name || typeLabels[feature.properties.featureType]}</strong>
                <small>{typeLabels[feature.properties.featureType]}</small>
              </span>
              <span className={`status-dot ${statusClass[feature.properties.status] ?? ''}`} title={statusLabels[feature.properties.status]} />
              <button
                className="feature-zoom-btn"
                title="Centrar en mapa"
                onClick={e => { e.stopPropagation(); onZoom(feature.properties.id) }}
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                  <line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/>
                </svg>
              </button>
            </button>
            )
          })}
        </div>
      )}
    </section>
  )
}
