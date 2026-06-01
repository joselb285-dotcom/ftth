import type { ValidationIssue } from './validation'

interface Props {
  issues: ValidationIssue[]
  expanded: boolean
  onToggleExpanded: (v: (prev: boolean) => boolean) => void
  onClose: () => void
  onSelectFeature: (id: string) => void
}

export default function ValidationToast({ issues, expanded, onToggleExpanded, onClose, onSelectFeature }: Props) {
  if (issues.length === 0) return null

  return (
    <div className="validation-toast">
      <div className="validation-toast-header">
        <button className="validation-toast-title" onClick={() => onToggleExpanded(v => !v)}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          {issues.length} advertencia{issues.length !== 1 ? 's' : ''}
          <svg className={`vt-caret${expanded ? ' expanded' : ''}`} width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 9l6 6 6-6"/>
          </svg>
        </button>
        <button className="validation-toast-close" title="Cerrar" onClick={onClose}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      {expanded && (
        <div className="validation-toast-list">
          {issues.map((issue, i) => (
            <button key={i} className={`validation-issue-row vi-${issue.severity}`}
              onClick={() => onSelectFeature(issue.featureId)}
              title={`Seleccionar: ${issue.featureName}`}>
              <span className="vi-sev-dot" />
              <span className="vi-body">
                <strong>{issue.featureName}</strong>
                <small>{issue.message}</small>
              </span>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0,opacity:0.4}}>
                <path d="M9 18l6-6-6-6"/>
              </svg>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
