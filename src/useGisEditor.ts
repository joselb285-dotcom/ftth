import { useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import type { AppFeature, AppFeatureProperties, FeatureKind, SubProject } from './types'
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
}

export function useGisEditor({ mapRef, editableLayerGroupRef, currentSubProject }: Params) {
  // ── Features core ─────────────────────────────────────────────────────────
  const [features, setFeatures]   = useState<AppFeature[]>([])
  const featuresRef               = useRef<AppFeature[]>([])
  useEffect(() => { featuresRef.current = features }, [features])

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
  function initialize(initialFeatures: AppFeature[]) {
    history.resetHistory()
    setValidationIssues([])
    setValidationOpen(false)
    setSelectedFeatureId(null)
    setSelectedFeatureIds(new Set())
    setOpticalPath(null)
    setMessage('Listo para dibujar o importar KML/KMZ.')
    setFeatures(initialFeatures)
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
    if (mode === 'fiber_line') {
      ;(map as any).pm.enableDraw('Line', { snappable: true, templineStyle: { color: defaultColors.fiber_line }, pathOptions: { color: defaultColors.fiber_line, weight: 4 } })
      setMessage('Modo dibujo de línea de fibra activado.')
      return
    }
    if (mode === 'zone') {
      ;(map as any).pm.enableDraw('Polygon', { snappable: true, pathOptions: { color: defaultColors.zone, fillColor: defaultColors.zone, fillOpacity: 0.18, weight: 2 } })
      setMessage('Modo dibujo de zona activado.')
      return
    }
    ;(map as any).pm.enableDraw('Marker', { snappable: true })
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
    const resolved: FeatureKind = geoJson.geometry?.type === 'LineString' ? 'fiber_line'
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
