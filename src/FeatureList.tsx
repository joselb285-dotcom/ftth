import type { AppFeature } from './types'
import { typeLabels, statusLabels, FeatureIcons, featureTypeClass, statusClass } from './editorConstants'

interface Props {
  features: AppFeature[]
  selectedFeatureId: string | null
  expanded: boolean
  onToggle: () => void
  onSelect: (id: string) => void
}

export default function FeatureList({ features, selectedFeatureId, expanded, onToggle, onSelect }: Props) {
  return (
    <section className={`panel-block panel-section ${expanded ? 'expanded' : ''}`}>
      <button type="button" className="panel-toggle" onClick={onToggle}>
        <span>Elementos ({features.length})</span>
        <svg className="panel-toggle-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 18l6-6-6-6"/>
        </svg>
      </button>
      {expanded && (
        <div className="panel-content feature-list">
          {features.length === 0 && <p className="empty-state">Todavía no hay elementos.</p>}
          {features.map(feature => (
            <button key={feature.properties.id}
              className={`feature-row ${selectedFeatureId === feature.properties.id ? 'selected' : ''}`}
              onClick={() => onSelect(feature.properties.id)}>
              <span className={`feature-type-icon ${featureTypeClass[feature.properties.featureType] ?? ''}`}>
                {FeatureIcons[feature.properties.featureType]}
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <strong>{feature.properties.name || typeLabels[feature.properties.featureType]}</strong>
                <small>{typeLabels[feature.properties.featureType]}</small>
              </span>
              <span className={`status-dot ${statusClass[feature.properties.status] ?? ''}`} title={statusLabels[feature.properties.status]} />
            </button>
          ))}
        </div>
      )}
    </section>
  )
}
