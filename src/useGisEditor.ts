import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import JSZip from 'jszip'
import { kml as kmlToGeoJSON } from '@tmcw/togeojson'
import shp from 'shpjs'
import type { AppFeature, AppFeatureProperties, FeatureKind, SubProject } from './types'
import type { OpticalPath } from './OpticalPath'
import { traceOpticalPath, computeLineLength } from './OpticalPath'
import { validateFeatures } from './validation'
import type { ValidationIssue } from './validation'
import type { ShapefileMapping } from './ShapefileMapper'
import {
  HISTORY_LIMIT, typeLabels, defaultColors, normalizeFeature, featureCollection,
  collectPowerAlarms, downloadTextFile, makeProperties,
} from './editorConstants'

type PendingShapefile = {
  features: GeoJSON.Feature[]
  columns: string[]
  samples: Record<string, unknown>[]
}

interface Params {
  mapRef:                React.RefObject<L.Map | null>
  editableLayerGroupRef: React.RefObject<L.FeatureGroup | null>
  currentSubProject:     SubProject | null
}

export function useGisEditor({ mapRef, editableLayerGroupRef, currentSubProject }: Params) {
  // ── Features + history ──────────────────────────────────────────────────────
  const [features, setFeatures]               = useState<AppFeature[]>([])
  const [canUndo, setCanUndo]                 = useState(false)
  const [canRedo, setCanRedo]                 = useState(false)
  const historyRef  = useRef<AppFeature[][]>([])
  const futureRef   = useRef<AppFeature[][]>([])
  const featuresRef = useRef<AppFeature[]>([])
  useEffect(() => { featuresRef.current = features }, [features])

  // ── Selection + UI ──────────────────────────────────────────────────────────
  const [selectedFeatureId, setSelectedFeatureId] = useState<string | null>(null)
  const [opticalPath,   setOpticalPath]   = useState<OpticalPath | null>(null)
  const [showSpliceCard, setShowSpliceCard] = useState(false)
  const [showRack,       setShowRack]      = useState(false)
  const [message, setMessage]             = useState('Listo para dibujar o importar KML/KMZ.')
  const [expandedSections, setExpandedSections] = useState({
    import: true, draw: true, export: false, elements: true, properties: true,
  })

  // ── Draw / measure ──────────────────────────────────────────────────────────
  const [drawModeType, setDrawModeType]  = useState<FeatureKind>('node')
  const drawModeTypeRef                  = useRef<FeatureKind>('node')
  const measureModeRef                   = useRef(false)
  const measureLayerRef                  = useRef<L.Layer | null>(null)
  const [hasMeasureLayer, setHasMeasureLayer] = useState(false)

  // ── Validation ──────────────────────────────────────────────────────────────
  const [validationIssues,   setValidationIssues]   = useState<ValidationIssue[]>([])
  const [validationOpen,     setValidationOpen]     = useState(false)
  const [validationExpanded, setValidationExpanded] = useState(false)

  // ── Shapefile ───────────────────────────────────────────────────────────────
  const [pendingShapefile, setPendingShapefile] = useState<PendingShapefile | null>(null)

  // ── Pending optical trace (from alarm click) ────────────────────────────────
  const [pendingTraceFiberId, setPendingTraceFiberId] = useState<string | null>(null)

  // ── Derived ─────────────────────────────────────────────────────────────────
  const selectedFeature = useMemo(
    () => features.find(f => f.properties.id === selectedFeatureId) ?? null,
    [features, selectedFeatureId]
  )
  const powerAlarms = useMemo(() => collectPowerAlarms(features), [features])

  // ── Auto-trace when arriving from alarm ──────────────────────────────────────
  useEffect(() => {
    if (!pendingTraceFiberId || features.length === 0) return
    setOpticalPath(traceOpticalPath(pendingTraceFiberId, features))
    setPendingTraceFiberId(null)
  }, [pendingTraceFiberId, features])

  // ── Auto-expand properties on selection ──────────────────────────────────────
  useEffect(() => {
    if (selectedFeature) setExpandedSections(s => ({ ...s, properties: true }))
  }, [selectedFeature])

  // ── Validation on feature change ─────────────────────────────────────────────
  useEffect(() => {
    setValidationIssues(validateFeatures(features))
  }, [features])

  // ── Initialize (called when opening a subproject) ────────────────────────────
  function initialize(initialFeatures: AppFeature[]) {
    historyRef.current  = []
    futureRef.current   = []
    setCanUndo(false)
    setCanRedo(false)
    setValidationIssues([])
    setValidationOpen(false)
    setSelectedFeatureId(null)
    setOpticalPath(null)
    setMessage('Listo para dibujar o importar KML/KMZ.')
    setFeatures(initialFeatures)
  }

  // ── History ───────────────────────────────────────────────────────────────────
  const commitFeatures = useCallback(
    (updater: AppFeature[] | ((prev: AppFeature[]) => AppFeature[])) => {
      historyRef.current = [...historyRef.current, featuresRef.current].slice(-HISTORY_LIMIT)
      futureRef.current  = []
      setCanUndo(true)
      setCanRedo(false)
      setFeatures(updater)
    },
    []
  )

  const undo = useCallback(() => {
    const past = historyRef.current
    if (past.length === 0) { setMessage('Nada que deshacer.'); return }
    futureRef.current  = [featuresRef.current, ...futureRef.current].slice(0, HISTORY_LIMIT)
    historyRef.current = past.slice(0, -1)
    setCanUndo(past.length - 1 > 0)
    setCanRedo(true)
    setFeatures(past[past.length - 1])
    setMessage('Deshacer.')
  }, [])

  const redo = useCallback(() => {
    const future = futureRef.current
    if (future.length === 0) { setMessage('Nada que rehacer.'); return }
    historyRef.current = [...historyRef.current, featuresRef.current].slice(-HISTORY_LIMIT)
    futureRef.current  = future.slice(1)
    setCanUndo(true)
    setCanRedo(future.length - 1 > 0)
    setFeatures(future[0])
    setMessage('Rehacer.')
  }, [])

  // ── Feature helpers ───────────────────────────────────────────────────────────
  function togglePanelSection(section: keyof typeof expandedSections) {
    setExpandedSections(s => ({ ...s, [section]: !s[section] }))
  }

  function handleDrawModeChange(value: FeatureKind) {
    setDrawModeType(value)
    drawModeTypeRef.current = value
  }

  function updateSelectedFeature<K extends keyof AppFeatureProperties>(
    key: K, value: AppFeatureProperties[K]
  ) {
    if (!selectedFeature) return
    commitFeatures(current =>
      current.map(item =>
        item.properties.id === selectedFeature.properties.id
          ? { ...item, properties: { ...item.properties, [key]: value } }
          : item
      )
    )
  }

  function removeSelectedFeature() {
    if (!selectedFeature) return
    commitFeatures(current => current.filter(f => f.properties.id !== selectedFeature.properties.id))
    setSelectedFeatureId(null)
    setMessage('Elemento eliminado.')
  }

  function exportGeoJSON(subProjectName: string) {
    const safeName = (subProjectName || 'sub-proyecto').replace(/\s+/g, '-').toLowerCase()
    downloadTextFile(
      `${safeName}-${new Date().toISOString().slice(0, 10)}.geojson`,
      JSON.stringify(featureCollection(featuresRef.current), null, 2),
      'application/geo+json'
    )
    setMessage('Exportado a GeoJSON.')
  }

  function clearSubProject() {
    if (!confirm('¿Borrar todos los elementos de este sub-proyecto?')) return
    commitFeatures([])
    setSelectedFeatureId(null)
    setMessage('Elementos borrados.')
  }

  // ── Import ────────────────────────────────────────────────────────────────────
  async function importFile(file: File) {
    try {
      let imported: GeoJSON.FeatureCollection
      if (file.name.toLowerCase().endsWith('.kml')) {
        const dom = new DOMParser().parseFromString(await file.text(), 'text/xml')
        imported = kmlToGeoJSON(dom) as GeoJSON.FeatureCollection
      } else if (file.name.toLowerCase().endsWith('.kmz')) {
        const zip = await JSZip.loadAsync(await file.arrayBuffer())
        const kmlEntry = Object.values(zip.files).find(e => e.name.toLowerCase().endsWith('.kml'))
        if (!kmlEntry) throw new Error('El archivo KMZ no contiene un KML legible.')
        const dom = new DOMParser().parseFromString(await kmlEntry.async('string'), 'text/xml')
        imported = kmlToGeoJSON(dom) as GeoJSON.FeatureCollection
      } else if (file.name.toLowerCase().endsWith('.geojson') || file.name.toLowerCase().endsWith('.json')) {
        imported = JSON.parse(await file.text()) as GeoJSON.FeatureCollection
      } else {
        throw new Error('Formato no soportado. Usá KML, KMZ o GeoJSON.')
      }
      const normalized = imported.features
        .filter(f => f.geometry && ['Point', 'LineString', 'Polygon'].includes(f.geometry.type))
        .map(normalizeFeature)
      if (normalized.length === 0) throw new Error('No se encontraron puntos o líneas importables.')
      commitFeatures(current => [...current, ...normalized])
      const bounds = L.geoJSON(imported as any).getBounds()
      if (bounds.isValid()) mapRef.current?.fitBounds(bounds.pad(0.15))
      setMessage(`${normalized.length} elemento(s) importado(s) desde ${file.name}.`)
    } catch (error) {
      setMessage(`No se pudo importar: ${error instanceof Error ? error.message : 'Error desconocido'}`)
    }
  }

  async function importShapefile(file: File) {
    try {
      const result = await shp(await file.arrayBuffer())
      const collection = Array.isArray(result) ? result[0] : result
      const feats = collection.features.filter(
        f => f.geometry && ['Point', 'LineString', 'Polygon'].includes(f.geometry.type)
      )
      if (feats.length === 0) throw new Error('No se encontraron geometrías importables.')
      const columns = Object.keys(feats[0]?.properties ?? {})
      if (columns.length === 0) throw new Error('El archivo DBF no contiene columnas.')
      setPendingShapefile({ features: feats, columns, samples: feats.slice(0, 3).map(f => f.properties as Record<string, unknown>) })
    } catch (error) {
      setMessage(`No se pudo importar Shapefile: ${error instanceof Error ? error.message : 'Error desconocido'}`)
    }
  }

  function applyShapefileImport(mapping: ShapefileMapping) {
    if (!pendingShapefile) return
    const normalized = pendingShapefile.features.map(f => {
      const props = (f.properties ?? {}) as Record<string, unknown>
      return normalizeFeature({
        ...f,
        properties: {
          featureType: mapping.featureType,
          name:  String(props[mapping.nameCol]  ?? ''),
          code:  mapping.codeCol  ? String(props[mapping.codeCol]  ?? '') : '',
          notes: mapping.notesCol ? String(props[mapping.notesCol] ?? '') : '',
        },
      })
    })
    commitFeatures(current => [...current, ...normalized])
    const bounds = L.geoJSON({ type: 'FeatureCollection', features: pendingShapefile.features } as any).getBounds()
    if (bounds.isValid()) mapRef.current?.fitBounds(bounds.pad(0.15))
    setMessage(`${normalized.length} elemento(s) importado(s) desde Shapefile.`)
    setPendingShapefile(null)
  }

  // ── Draw / map controls ───────────────────────────────────────────────────────
  function activateDrawMode(mode: FeatureKind) {
    const map = mapRef.current
    if (!map) return
    ;(map as any).pm.disableDraw()
    handleDrawModeChange(mode)
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

  // ── Layer-to-feature helper (used by map pm:create handler in App) ────────────
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
    selectedFeature, powerAlarms,
    canUndo, canRedo,
    message, setMessage,
    drawModeType,
    hasMeasureLayer, setHasMeasureLayer,
    validationIssues, setValidationIssues,
    validationOpen, setValidationOpen,
    validationExpanded, setValidationExpanded,
    pendingShapefile, setPendingShapefile,
    pendingTraceFiberId, setPendingTraceFiberId,
    showSpliceCard, setShowSpliceCard,
    showRack, setShowRack,
    opticalPath, setOpticalPath,
    expandedSections, togglePanelSection,
    // Refs
    featuresRef, drawModeTypeRef, measureModeRef, measureLayerRef,
    // Actions
    initialize,
    commitFeatures, undo, redo,
    updateSelectedFeature, removeSelectedFeature,
    exportGeoJSON, clearSubProject,
    importFile, importShapefile, applyShapefileImport,
    activateDrawMode, stopDrawing, startMeasure, clearMeasure,
    layerToFeature,
  }
}
