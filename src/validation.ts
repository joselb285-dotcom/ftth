import type { AppFeature, FeatureKind } from './types'

export type ValidationSeverity = 'warn' | 'error'

export type ValidationIssue = {
  featureId: string
  featureName: string
  featureType: FeatureKind
  rule: string
  message: string
  severity: ValidationSeverity
}

export function validateFeatures(features: AppFeature[]): ValidationIssue[] {
  const issues: ValidationIssue[] = []

  // Pre-compute duplicate codes
  const codeCount = new Map<string, number>()
  for (const f of features) {
    const code = f.properties.code.trim()
    if (code) codeCount.set(code, (codeCount.get(code) ?? 0) + 1)
  }

  for (const f of features) {
    const { id, name, code, featureType, status, notes, oltModel, spliceCard } = f.properties
    const displayName = name.trim() || `(${featureType} sin nombre)`

    if (!name.trim()) {
      issues.push({
        featureId: id, featureName: displayName, featureType,
        rule: 'no-name', message: 'Sin nombre asignado', severity: 'warn',
      })
    }

    if (!code.trim()) {
      issues.push({
        featureId: id, featureName: displayName, featureType,
        rule: 'no-code', message: 'Sin código de identificación', severity: 'warn',
      })
    } else if ((codeCount.get(code.trim()) ?? 0) > 1) {
      issues.push({
        featureId: id, featureName: displayName, featureType,
        rule: 'dup-code', message: `Código "${code.trim()}" duplicado`, severity: 'error',
      })
    }

    if (status === 'damaged' && !notes.trim()) {
      issues.push({
        featureId: id, featureName: displayName, featureType,
        rule: 'damaged-no-notes', message: 'Elemento dañado sin observaciones', severity: 'warn',
      })
    }

    if (featureType === 'node' && !oltModel?.trim()) {
      issues.push({
        featureId: id, featureName: displayName, featureType,
        rule: 'node-no-olt', message: 'Nodo sin modelo de OLT registrado', severity: 'warn',
      })
    }

    if ((featureType === 'splice_box' || featureType === 'nap') &&
        (!spliceCard || spliceCard.cables.length === 0)) {
      issues.push({
        featureId: id, featureName: displayName, featureType,
        rule: 'no-splice-card', message: 'Sin carta de empalme configurada', severity: 'warn',
      })
    }
  }

  return issues
}
