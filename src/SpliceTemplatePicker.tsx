import { useState } from 'react'
import type { SpliceCard } from './types'
import { SPLICE_TEMPLATES, CATEGORY_LABELS, type SpliceTemplate, type TemplateCategory } from './spliceTemplates'

interface Props {
  hasExistingData: boolean
  onApply: (card: SpliceCard) => void
  onClose: () => void
}

const CATEGORIES: TemplateCategory[] = ['paso', 'nap', 'distribucion']

function PreviewDiagram({ preview }: { preview: SpliceTemplate['preview'] }) {
  return (
    <div className="stp-preview">
      <div className="stp-preview-col">
        {preview.left.map((l, i) => (
          <span key={i} className="stp-pill stp-pill-left">{l}</span>
        ))}
      </div>
      <div className="stp-preview-arrow">
        <svg width="20" height="14" viewBox="0 0 20 14" fill="none">
          <line x1="0" y1="7" x2="14" y2="7" stroke="currentColor" strokeWidth="1.5"/>
          <polyline points="9,2 15,7 9,12" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>
      {preview.center && (
        <>
          <div className="stp-preview-col">
            {preview.center.map((l, i) => (
              <span key={i} className="stp-pill stp-pill-center">{l}</span>
            ))}
          </div>
          <div className="stp-preview-arrow">
            <svg width="20" height="14" viewBox="0 0 20 14" fill="none">
              <line x1="0" y1="7" x2="14" y2="7" stroke="currentColor" strokeWidth="1.5"/>
              <polyline points="9,2 15,7 9,12" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
        </>
      )}
      <div className="stp-preview-col">
        {preview.right.map((l, i) => (
          <span key={i} className="stp-pill stp-pill-right">{l}</span>
        ))}
      </div>
    </div>
  )
}

export default function SpliceTemplatePicker({ hasExistingData, onApply, onClose }: Props) {
  const [activeCategory, setActiveCategory] = useState<TemplateCategory>('paso')

  const visible = SPLICE_TEMPLATES.filter(t => t.category === activeCategory)

  function apply(t: SpliceTemplate) {
    if (hasExistingData) {
      if (!window.confirm(`¿Reemplazar la carta actual con la plantilla "${t.name}"?\nSe perderán todos los cables, fusiones y splitters existentes.`)) return
    }
    onApply(t.generate())
    onClose()
  }

  return (
    <div className="stp-overlay" onClick={onClose}>
      <div className="stp-panel" onClick={e => e.stopPropagation()}>

        <div className="stp-header">
          <div>
            <h3 className="stp-title">Plantillas de carta de empalme</h3>
            <p className="stp-subtitle">Seleccioná una configuración pre-armada para comenzar rápido.</p>
          </div>
          <button className="stp-close" onClick={onClose} aria-label="Cerrar">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <div className="stp-tabs">
          {CATEGORIES.map(cat => (
            <button
              key={cat}
              className={`stp-tab${activeCategory === cat ? ' stp-tab-active' : ''}`}
              onClick={() => setActiveCategory(cat)}
            >
              {CATEGORY_LABELS[cat]}
              <span className="stp-tab-count">
                {SPLICE_TEMPLATES.filter(t => t.category === cat).length}
              </span>
            </button>
          ))}
        </div>

        <div className="stp-grid">
          {visible.map(t => (
            <div key={t.id} className="stp-card">
              <div className="stp-card-body">
                <div className="stp-card-name">{t.name}</div>
                <div className="stp-card-desc">{t.description}</div>
                <PreviewDiagram preview={t.preview} />
              </div>
              <button className="stp-apply-btn" onClick={() => apply(t)}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
                Aplicar plantilla
              </button>
            </div>
          ))}
        </div>

        {hasExistingData && (
          <p className="stp-warning">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            Aplicar una plantilla reemplazará el contenido actual de la carta.
          </p>
        )}
      </div>
    </div>
  )
}
