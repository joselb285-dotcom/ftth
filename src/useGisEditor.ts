import { useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import type { AppFeature, AppFeatureProperties, ChangeLogEntry, ChangeLogAction, FeatureKind, SubProject } from './types'
import type { OpticalPath } from './OpticalPath'
import { traceOpticalPath } from './OpticalPath'
import { validateFeatures } from './validation'
import type { ValidationIssue } from './validation'
import { useFeatureHistory } from './useFeatureHistory'
import { useGisImportExport } from './useGisImportExport'
import {
  typeLabels, defaultColors, normalizeFeature,
  collectPowerAlarms, makeProperties,
} from './editorConstants'

interface Params {
  mapRef:                React.RefObject<L.Map | null>
  editableLayerGroupRef: React.RefObject<L.FeatureGroup | null>
  currentSubProject:     SubProject | null
  userEmail?:            string
}

const FIELD_LABELS: Partial<Record<keyof AppFeatureProperties, string>> = {
  name: 'nombre', code: 'código', status: 'estado',
  color: 'color', notes: 'notas', fiberCount: 'cant. fibras',
  oltModel: 'modelo OLT', mikrotikModel: 'modelo Mikrotik',
}

export function useGisEditor({ mapRef, editableLayerGroupRef, currentSubProject, userEmail = '' }: Params) {
  // ── Features core ─────────────────────────────────────────────────────────
  const [features, setFeatures]   = useState<AppFeature[]>([])
  const featuresRef               = useRef<AppFeature[]>([])
  useEffect(() => { featuresRef.current = features }, [features])

  // ── Change history log ───────────────────────────────────────────────────
  const [changeLog, setChangeLog] = useState<ChangeLogEntry[]>([])
  // Debounce ref: avoid logging every keystroke for the same feature+field
  const lastLogRef = useRef<{ featureId: string; field: string; ts: number } | null>(null)

  function logChange(
    action: ChangeLogAction,
    featureName: string,
    extra?: {
      featureId?: string
      featureType?: string
      changedField?: keyof AppFeatureProperties
      previousValue?: unknown
      newValue?: unknown
      snapshot?: ChangeLogEntry['snapshot']
    }
  ) {
    // Debounce: skip if same feature+field was logged < 2s ago
    if (action === 'updated' && extra?.featureId && extra?.changedField) {
      const now = Date.now()
      const last = lastLogRef.current
      if (last && last.featureId === extra.featureId && last.field === extra.changedField && now - last.ts < 2000) {
        // Update the last entry's newValue instead of adding a new one
        setChangeLog(prev => prev.map((e, i) => i === 0 ? { ...e, newValue: String(extra.newValue ?? '') } : e))
        lastLogRef.current = { featureId: extra.featureId!, field: extra.changedField!, ts: now }
        return
      }
      lastLogRef.current = { featureId: extra.featureId!, field: extra.changedField!, ts: now }
    } else {
      lastLogRef.current = null
    }

    const entry: ChangeLogEntry = {
      id: crypto.randomUUID(),
      ts: new Date().toISOString(),
      userEmail,
      action,
      featureId: extra?.featureId ?? '',
      featureName,
      featureType: extra?.featureType ?? '',
      changedField: extra?.changedField,
      changedLabel: extra?.changedField ? (FIELD_LABELS[extra.changedField] ?? extra.changedField) : undefined,
      previousValue: extra?.previousValue !== undefined ? String(extra.previousValue) : undefined,
      newValue: extra?.newValue !== undefined ? String(extra.newValue) : undefined,
      snapshot: extra?.snapshot,
    }
    setChangeLog(prev => [entry, ...prev].slice(0, 300))
  }

  // ── Rollback a deleted feature ────────────────────────────────────────────
  function rollbackEntry(entry: ChangeLogEntry) {
    if (entry.action !== 'deleted' || !entry.snapshot) return
    const restored: AppFeature = {
      type: 'Feature',
      geometry: entry.snapshot.geometry,
      properties: entry.snapshot.properties,
    }
    history.commitFeatures(current => {
      if (current.some(f => f.properties.id === restored.properties.id)) return current
      return [...current, restored]
    })
    setChangeLog(prev => prev.filter(e => e.id !== entry.id))
    setMessage(`Elemento "${entry.featureName}" restaurado.`)
  }

  // ── UI / selection ────────────────────────────────────────────────────────
  const [selectedFeatureId,  setSelectedFeatureId]  = useState<string | null>(null)
  const [selectedFeatureIds, setSelectedFeatureIds] = useState<Set<string>>(new Set())
  const [opticalPath,   setOpticalPath]   = useState<OpticalPath | null>(null)
  const [showSpliceCard, setShowSpliceCard] = useState(false)
  const [showRack,       setShowRack]      = useState(false)
  const [message, setMessage]             = useState('Listo para dibujar o importar KML/KMZ.')
  const [expandedSections, setExpandedSections] = useState({
    import: true, draw: true, export: false, elements: true, properties: true,
  })

  // ── Draw / measure ────────────────────────────────────────────────────────
  const drawModeTypeRef                  = useRef<FeatureKind>('node')
  const measureModeRef                   = useRef(false)
  const measureLayerRef                  = useRef<L.Layer | null>(null)
  const [hasMeasureLayer, setHasMeasureLayer] = useState(false)

  // ── Validation ────────────────────────────────────────────────────────────
  const [validationIssues,   setValidationIssues]   = useState<ValidationIssue[]>([])
  const [validationOpen,     setValidationOpen]     = useState(false)
  const [validationExpanded, setValidationExpanded] = useState(false)

  // ── Pending optical trace (from alarm click) ──────────────────────────────
  const [pendingTraceFiberId, setPendingTraceFiberId] = useState<string | null>(null)

  // ── Sub-hooks ─────────────────────────────────────────────────────────────
  const history = useFeatureHistory(featuresRef, setFeatures, setMessage)
  const io = useGisImportExport(mapRef, history.commitFeatures, featuresRef, setMessage)

  // ── Derived ───────────────────────────────────────────────────────────────
  const selectedFeature = useMemo(
    () => features.find(f => f.properties.id === selectedFeatureId) ?? null,
    [features, selectedFeatureId]
  )
  const powerAlarms = useMemo(() => collectPowerAlarms(features), [features])

  // ── Auto-trace when arriving from alarm ───────────────────────────────────
  useEffect(() => {
    if (!pendingTraceFiberId || features.length === 0) return
    setOpticalPath(traceOpticalPath(pendingTraceFiberId, features))
    setPendingTraceFiberId(null)
  }, [pendingTraceFiberId, features])

  // ── Auto-expand properties on selection ───────────────────────────────────
  useEffect(() => {
    if (selectedFeature) setExpandedSections(s => ({ ...s, properties: true }))
  }, [selectedFeature])

  // ── Validation on feature change ──────────────────────────────────────────
  useEffect(() => {
    setValidationIssues(validateFeatures(features))
  }, [features])

  // ── Initialize (called when opening a subproject) ─────────────────────────
  function initialize(initialFeatures: AppFeature[], initialChangeLog?: ChangeLogEntry[]) {
    history.resetHistory()
    setValidationIssues([])
    setValidationOpen(false)
    setSelectedFeatureId(null)
    setSelectedFeatureIds(new Set())
    setOpticalPath(null)
    setMessage('Listo para dibujar o importar KML/KMZ.')
    setFeatures(initialFeatures)
    setChangeLog(initialChangeLog ?? [])
  }

  // ── Multi-select ─────────────────────────────────────────────────────────
  function toggleSelectFeature(id: string) {
    setSelectedFeatureIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function clearMultiSelection() {
    setSelectedFeatureIds(new Set())
  }

  function bulkSetColor(color: string) {
    if (selectedFeatureIds.size === 0) return
    history.commitFeatures(current =>
      current.map(f =>
        selectedFeatureIds.has(f.properties.id)
          ? { ...f, properties: { ...f.properties, color } }
          : f
      )
    )
    setMessage(`Color actualizado en ${selectedFeatureIds.size} elemento(s).`)
  }

  function bulkSetStatus(status: import('./types').FeatureStatus) {
    if (selectedFeatureIds.size === 0) return
    history.commitFeatures(current =>
      current.map(f =>
        selectedFeatureIds.has(f.properties.id)
          ? { ...f, properties: { ...f.properties, status } }
          : f
      )
    )
    setMessage(`Estado actualizado en ${selectedFeatureIds.size} elemento(s).`)
  }

  function bulkDelete() {
    if (selectedFeatureIds.size === 0) return
    if (!confirm(`¿Eliminar ${selectedFeatureIds.size} elemento(s)?`)) return
    history.commitFeatures(current => current.filter(f => !selectedFeatureIds.has(f.properties.id)))
    setSelectedFeatureId(null)
    setSelectedFeatureIds(new Set())
    setMessage(`${selectedFeatureIds.size} elemento(s) eliminados.`)
  }

  // ── Feature helpers ───────────────────────────────────────────────────────
  function togglePanelSection(section: keyof typeof expandedSections) {
    setExpandedSections(s => ({ ...s, [section]: !s[section] }))
  }

  function updateSelectedFeature<K extends keyof AppFeatureProperties>(
    key: K, value: AppFeatureProperties[K]
  ) {
    if (!selectedFeature) return
    const prev = selectedFeature.properties[key]
    // Log only meaningful field changes
    if (key in FIELD_LABELS) {
      logChange('updated', selectedFeature.properties.name || selectedFeature.properties.featureType, {
        featureId: selectedFeature.properties.id,
        featureType: selectedFeature.properties.featureType,
        changedField: key as keyof AppFeatureProperties,
        previousValue: prev,
        newValue: value,
      })
    }
    history.commitFeatures(current =>
      current.map(item =>
        item.properties.id === selectedFeature.properties.id
          ? { ...item, properties: { ...item.properties, [key]: value } }
          : item
      )
    )
  }

  function removeSelectedFeature() {
    if (!selectedFeature) return
    logChange('deleted', selectedFeature.properties.name || selectedFeature.properties.featureType, {
      featureId: selectedFeature.properties.id,
      featureType: selectedFeature.properties.featureType,
      snapshot: { properties: selectedFeature.properties, geometry: selectedFeature.geometry },
    })
    history.commitFeatures(current => current.filter(f => f.properties.id !== selectedFeature.properties.id))
    setSelectedFeatureId(null)
    setMessage('Elemento eliminado.')
  }

  function clearSubProject() {
    if (!confirm('¿Borrar todos los elementos de este sub-proyecto?')) return
    history.commitFeatures([])
    setSelectedFeatureId(null)
    setMessage('Elementos borrados.')
  }

  function duplicateSelectedFeature() {
    if (!selectedFeature) return
    const newId   = crypto.randomUUID()
    const duplicate: typeof selectedFeature = {
      ...selectedFeature,
      properties: { ...selectedFeature.properties, id: newId, name: `${selectedFeature.properties.name} (copia)` },
    }
    logChange('duplicated', selectedFeature.properties.name || selectedFeature.properties.featureType, {
      featureId: selectedFeature.properties.id, featureType: selectedFeature.properties.featureType,
    })
    history.commitFeatures(current => [...current, duplicate])
    setSelectedFeatureId(newId)
    setMessage('Elemento duplicado.')
  }

  // ── Draw / map controls ───────────────────────────────────────────────────
  function activateDrawMode(mode: FeatureKind) {
    const map = mapRef.current
    if (!map) return
    ;(map as any).pm.disableDraw()
    drawModeTypeRef.current = mode
    const LINE_TYPES: FeatureKind[] = ['fiber_line', 'fiber_aerial', 'fiber_underground']
    if (LINE_TYPES.includes(mode)) {
      const c = defaultColors[mode]
      const dash = mode === 'fiber_underground' ? '8 5' : undefined
      ;(map as any).pm.enableDraw('Line', { snappable: true, templineStyle: { color: c, dashArray: dash }, pathOptions: { color: c, weight: 4, dashArray: dash } })
      setMessage(`Modo dibujo de ${typeLabels[mode].toLowerCase()} activado.`)
      return
    }
    if (mode === 'zone') {
      ;(map as any).pm.enableDraw('Polygon', { snappable: true, pathOptions: { color: defaultColors.zone, fillColor: defaultColors.zone, fillOpacity: 0.18, weight: 2 } })
      setMessage('Modo dibujo de zona activado.')
      return
    }
    ;(map as any).pm.enableDraw('Marker', {
      snappable: true,
      // Hide the ghost hint marker — we use our own custom cursor
      markerStyle: { opacity: 0, icon: L.divIcon({ className: '', html: '', iconSize: [1, 1], iconAnchor: [0, 0] }) },
    })
    setMessage(`Modo creación de ${typeLabels[mode].toLowerCase()} activado.`)
  }

  function stopDrawing() {
    ;(mapRef.current as any)?.pm.disableDraw()
    measureModeRef.current = false
    setMessage('Modo dibujo desactivado.')
  }

  function startMeasure() {
    const map = mapRef.current
    if (!map) return
    ;(map as any).pm.disableDraw()
    measureModeRef.current = true
    ;(map as any).pm.enableDraw('Line', {
      snappable: true,
      templineStyle: { color: '#f59e0b', dashArray: '6 4', weight: 2 },
      pathOptions:   { color: '#f59e0b', dashArray: '6 4', weight: 2 },
    })
    setMessage('Clic para agregar puntos · doble clic para finalizar medición.')
  }

  function clearMeasure() {
    if (measureLayerRef.current) {
      editableLayerGroupRef.current?.removeLayer(measureLayerRef.current)
      measureLayerRef.current = null
      setHasMeasureLayer(false)
    }
    measureModeRef.current = false
    ;(mapRef.current as any)?.pm.disableDraw()
    setMessage('Medición eliminada.')
  }

  function layerToFeature(layer: L.Layer, featureType: FeatureKind): AppFeature {
    const geoJson = (layer as any).toGeoJSON() as GeoJSON.Feature
    const LINE_KINDS: FeatureKind[] = ['fiber_line', 'fiber_aerial', 'fiber_underground']
    const resolved: FeatureKind = geoJson.geometry?.type === 'LineString'
      ? (LINE_KINDS.includes(drawModeTypeRef.current) ? drawModeTypeRef.current : 'fiber_line')
      : geoJson.geometry?.type === 'Polygon' ? 'zone'
      : featureType
    return normalizeFeature({ ...geoJson, properties: { ...geoJson.properties, ...makeProperties(resolved), featureType: resolved } })
  }

  return {
    // State
    features, setFeatures,
    selectedFeatureId, setSelectedFeatureId,
    selectedFeatureIds, setSelectedFeatureIds,
    selectedFeature, powerAlarms,
    canUndo: history.canUndo,
    canRedo: history.canRedo,
    message, setMessage,
    hasMeasureLayer, setHasMeasureLayer,
    validationIssues, setValidationIssues,
    validationOpen, setValidationOpen,
    validationExpanded, setValidationExpanded,
    pendingTraceFiberId, setPendingTraceFiberId,
    showSpliceCard, setShowSpliceCard,
    showRack, setShowRack,
    opticalPath, setOpticalPath,
    expandedSections, togglePanelSection,
    // Shapefile
    pendingShapefile: io.pendingShapefile,
    setPendingShapefile: io.setPendingShapefile,
    // Refs
    featuresRef, drawModeTypeRef, measureModeRef, measureLayerRef,
    // Actions — history
    commitFeatures: history.commitFeatures,
    undo: history.undo,
    redo: history.redo,
    // Change log
    changeLog, setChangeLog, logChange, rollbackEntry,
    // Actions — features
    initialize,
    updateSelectedFeature, removeSelectedFeature, clearSubProject, duplicateSelectedFeature,
    // Multi-select
    toggleSelectFeature, clearMultiSelection, bulkSetColor, bulkSetStatus, bulkDelete,
    // Actions — import/export
    importFile: io.importFile,
    importShapefile: io.importShapefile,
    applyShapefileImport: io.applyShapefileImport,
    exportGeoJSON: io.exportGeoJSON,
    // Actions — draw
    activateDrawMode, stopDrawing, startMeasure, clearMeasure,
    layerToFeature,
  }
}
