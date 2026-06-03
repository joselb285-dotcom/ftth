import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import '@geoman-io/leaflet-geoman-free'
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css'
import type { AppFeature, FeatureKind, ZabbixConfig } from './types'
import { useAuth } from './AuthContext'
import { useProjects } from './useProjects'
import { useGisEditor } from './useGisEditor'
import SuperAdminPage from './SuperAdminPage'
import Dashboard from './Dashboard'
import SubProjectsView from './SubProjectsView'
import SpliceCardModal from './SpliceCardModal'
import RackModal from './RackModal'
import OpticalPathPanel from './OpticalPathPanel'
import { traceOpticalPath, computeLineLength } from './OpticalPath'
import ThemePicker from './ThemePicker'
import UserMenu from './UserMenu'
import ReportModal from './ReportModal'
import GlobalSearch from './GlobalSearch'
import FieldModePanel from './FieldModePanel'
import FieldView from './FieldView'
import PoleForm, { type PoleData } from './PoleForm'
import ZabbixConfigModal from './ZabbixConfigModal'
import { loadZabbixConfig } from './zabbix'
import ShapefileMapper from './ShapefileMapper'
import DropdownMenu from './DropdownMenu'
import FeaturePanel from './FeaturePanel'
import FeatureList from './FeatureList'
import FloatingMapToolbar from './FloatingMapToolbar'
import { useSyncManager } from './useSyncManager'
import FiberHoverTooltip from './FiberHoverTooltip'
import OltManagerDropdown from './OltManagerDropdown'
import CreateProjectModal from './CreateProjectModal'
import ValidationToast from './ValidationToast'
import TitleBlockFormModal, { type TitleBlockData } from './TitleBlockFormModal'
import ChangeLogPanel from './ChangeLogPanel'
import { formatDistance } from './format'
import { drawNorthArrow, drawRotulo, drawPdfLegend, renderMapToCanvas } from './mapExport'
import { getDrawCursor } from './mapCursors'
import {
  defaultColors, typeLabels, featureCollection, normalizeFeature, makeProperties,
  LAYER_NAMES, type LayerName, now, collectPowerAlarms,
} from './editorConstants'

const defaultCenter: L.LatLngExpression = [-31.4201, -64.1888]
const defaultZoom = 13

export default function App() {
  // ── Map refs ──────────────────────────────────────────────────────────────
  const mapElementRef       = useRef<HTMLDivElement | null>(null)
  const mapRef              = useRef<L.Map | null>(null)
  const editableLayerGroupRef = useRef<L.FeatureGroup | null>(null)
  const layerIndexRef       = useRef<Map<string, L.Layer>>(new Map())
  const baseLayersRef       = useRef<Record<string, L.TileLayer>>({})
  const pathHighlightGroupRef = useRef<L.LayerGroup | null>(null)
  const highlightedLineLayers = useRef<L.Layer[]>([])
  const prevSelectedRef     = useRef<string | null>(null)
  const initialCenterRef    = useRef<{ lat: number; lng: number } | null>(null)
  const validationGroupRef  = useRef<L.LayerGroup | null>(null)

  // ── File input refs ───────────────────────────────────────────────────────
  const importFileRef = useRef<HTMLInputElement>(null)
  const importShpRef  = useRef<HTMLInputElement>(null)

  // ── Auth ──────────────────────────────────────────────────────────────────
  const { user, currentTenantId, isSuperadmin, isAdmin, isTecnico, role, adminId, logout } = useAuth()
  const isReadOnly = role === 'user' || role === 'tecnico'

  // ── Hooks ─────────────────────────────────────────────────────────────────
  const proj = useProjects(currentTenantId, user?.id ?? null, role, adminId)
  const gis  = useGisEditor({ mapRef, editableLayerGroupRef, currentSubProject: proj.currentSubProject, userEmail: user?.email ?? '' })
  const sync = useSyncManager(currentTenantId)

  // ── Local UI state ────────────────────────────────────────────────────────
  const [activeLayer,      setActiveLayer]      = useState<LayerName>('OSM')
  const [zabbixConfig,     setZabbixConfig]     = useState<ZabbixConfig | null>(() => loadZabbixConfig())
  const [showZabbixConfig, setShowZabbixConfig] = useState(false)
  const [showOltManager,   setShowOltManager]   = useState(false)
  const [showValidation,        setShowValidation]        = useState(false)
  const [showDistanceLabels,    setShowDistanceLabels]    = useState(false)
  const [showMapExport,         setShowMapExport]         = useState(false)
  const [showChangeLog,         setShowChangeLog]         = useState(false)
  const [showReport,            setShowReport]            = useState(false)
  const [showGlobalSearch,      setShowGlobalSearch]      = useState(false)
  // ── Multi-subproject view ──────────────────────────────────────────────────
  const [multiViewEnabled,   setMultiViewEnabled]   = useState(false)
  const [hiddenSPs,          setHiddenSPs]          = useState<Set<string>>(new Set())
  const multiViewGroupsRef = useRef<Map<string, L.LayerGroup>>(new Map())
  const [fieldMode, setFieldMode] = useState(isTecnico)  // técnico auto-entra en campo
  const [surveyMode, setSurveyMode] = useState(false)
  const [addingPole, setAddingPole] = useState(false)     // cursor crosshair para agregar poste
  const [pendingPoleCoords, setPendingPoleCoords] = useState<[number,number] | null>(null)
  const [showPoleForm, setShowPoleForm] = useState(false)
  const distanceLabelLayerRef = useRef<L.LayerGroup | null>(null)
  const [showSuperAdmin,   setShowSuperAdmin]   = useState(false)
  const [fiberHover, setFiberHover] = useState<{ x: number; y: number; fromA: number; fromB: number } | null>(null)

  // ── Split panel resize + collapse ─────────────────────────────────────────
  const [panelWidth, setPanelWidth] = useState(() => {
    const s = localStorage.getItem('editor-panel-width')
    return s ? Math.max(240, Math.min(600, Number(s))) : 320
  })
  const [panelCollapsed, setPanelCollapsed] = useState(() =>
    localStorage.getItem('editor-panel-collapsed') === 'true'
  )
  const resizingRef = useRef(false)

  function startResize(e: React.MouseEvent) {
    if (panelCollapsed) return
    resizingRef.current = true
    const startX = e.clientX
    const startW = panelWidth
    function onMove(ev: MouseEvent) {
      if (!resizingRef.current) return
      const newW = Math.max(240, Math.min(600, startW + (startX - ev.clientX)))
      setPanelWidth(newW)
    }
    function onUp() {
      resizingRef.current = false
      setPanelWidth(w => { localStorage.setItem('editor-panel-width', String(w)); return w })
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  function togglePanel() {
    setPanelCollapsed(v => {
      const next = !v
      localStorage.setItem('editor-panel-collapsed', String(next))
      setTimeout(() => mapRef.current?.invalidateSize(), 200)
      return next
    })
  }

  // ── Active draw tool (for FloatingMapToolbar highlight) ───────────────────
  const [activeTool, setActiveTool] = useState<import('./FloatingMapToolbar').ActiveTool>(null)

  function handleDraw(mode: FeatureKind) {
    setActiveTool(mode)
    gis.activateDrawMode(mode)
  }
  function handleStartMeasure() {
    setActiveTool('measure')
    gis.startMeasure()
  }
  function handleStopDraw() {
    setActiveTool(null)
    gis.stopDrawing()
  }

  // ── OLT hosts detected from rack panels ───────────────────────────────────
  const oltHostsFromRack = useMemo(() => {
    if (!proj.currentSubProject || !zabbixConfig) return []
    const hosts = new Set<string>()
    for (const f of proj.currentSubProject.features) {
      if (f.properties.featureType === 'node' && f.properties.rack) {
        for (const panel of f.properties.rack.panels) {
          if (panel.kind === 'olt' && panel.zabbixHost) hosts.add(panel.zabbixHost)
        }
      }
    }
    return [...hosts]
  }, [proj.currentSubProject, zabbixConfig])

  // ── Navigation wrappers (init/reset gis alongside proj navigation) ─────────
  function handleOpenEditor(subProjectId: string) {
    const subProject = proj.currentProject?.subProjects.find(sp => sp.id === subProjectId)
    initialCenterRef.current = subProject?.location ?? null
    gis.initialize(subProject?.features ?? [], subProject?.changeLog)
    proj.openEditor(subProjectId)
  }

  function handleGoHome() {
    gis.initialize([])
    proj.goHome()
  }

  function handleGoToSubProjects() {
    gis.initialize([])
    proj.goToSubProjects()
  }

  // ── Global search navigation ──────────────────────────────────────────────
  const [pendingSearchNav, setPendingSearchNav] = useState<{ featureId: string; geometry: GeoJSON.Geometry } | null>(null)

  function handleSearchNavigate(projectId: string, subProjectId: string, featureId: string, geometry: GeoJSON.Geometry) {
    if (subProjectId === proj.currentSubProjectId) {
      // Already in the right subproject → just zoom
      handleZoomToFeature(featureId)
      return
    }
    // Navigate to the right subproject, then zoom
    setPendingSearchNav({ featureId, geometry })
    const targetProject = proj.projects.find(p => p.id === projectId)
    const subProject = targetProject?.subProjects.find(sp => sp.id === subProjectId)
    if (!subProject) return
    // Switch project context first
    if (projectId !== proj.currentProjectId) proj.openSubProjects(projectId)
    initialCenterRef.current = subProject.location ?? null
    gis.initialize(subProject.features)
    proj.openEditor(subProjectId)
  }

  // Execute pending navigation after editor loads
  useEffect(() => {
    if (!pendingSearchNav || proj.view !== 'editor' || !proj.dbLoaded) return
    const { featureId, geometry } = pendingSearchNav
    setPendingSearchNav(null)
    // Small delay to let layers render
    setTimeout(() => {
      gis.setSelectedFeatureId(featureId)
      const map = mapRef.current
      if (!map) return
      if (geometry.type === 'Point') {
        const [lng, lat] = (geometry as GeoJSON.Point).coordinates
        map.setView([lat, lng], Math.max(map.getZoom(), 17), { animate: true })
      } else if (geometry.type === 'LineString') {
        const coords = (geometry as GeoJSON.LineString).coordinates
        const bounds = L.latLngBounds(coords.map(([lng, lat]) => L.latLng(lat, lng)))
        if (bounds.isValid()) map.fitBounds(bounds.pad(0.3), { animate: true })
      }
    }, 300)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingSearchNav, proj.view, proj.dbLoaded])

  function handleZoomToFeature(id: string) {
    const feature = gis.features.find(f => f.properties.id === id)
    const layer   = layerIndexRef.current.get(id)
    const map     = mapRef.current
    if (!feature || !map) return
    if (feature.geometry.type === 'Point') {
      const [lng, lat] = (feature.geometry as GeoJSON.Point).coordinates
      map.setView([lat, lng], Math.max(map.getZoom(), 17), { animate: true })
    } else if (layer) {
      try {
        const bounds = (layer as any).getBounds?.()
        if (bounds?.isValid()) map.fitBounds(bounds.pad(0.25), { animate: true })
      } catch { /* layer may not have bounds */ }
    }
    gis.setSelectedFeatureId(id)
  }

  // ── Auto-save when features change ────────────────────────────────────────
  useEffect(() => {
    if (!proj.currentProjectId || !proj.currentSubProjectId || !proj.dbLoaded) return
    proj.setProjects(prev => {
      const updated = prev.map(p =>
        p.id !== proj.currentProjectId ? p : {
          ...p, updatedAt: now(),
          subProjects: p.subProjects.map(sp =>
            sp.id !== proj.currentSubProjectId ? sp : { ...sp, updatedAt: now(), features: gis.features }
          ),
        }
      )
      const up = updated.find(p => p.id === proj.currentProjectId)
      if (up) proj.scheduleSave(up)
      return updated
    })
  }, [gis.features]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Sync changeLog to subproject (debounced via the same save cycle) ──────
  useEffect(() => {
    if (!proj.currentProjectId || !proj.currentSubProjectId || !proj.dbLoaded) return
    proj.setProjects(prev => prev.map(p =>
      p.id !== proj.currentProjectId ? p : {
        ...p,
        subProjects: p.subProjects.map(sp =>
          sp.id !== proj.currentSubProjectId ? sp : { ...sp, changeLog: gis.changeLog }
        ),
      }
    ))
  }, [gis.changeLog]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Manual save ───────────────────────────────────────────────────────────
  async function handleSaveNow() {
    if (!proj.currentProject) return
    const ok = await proj.saveNow(proj.currentProject)
    gis.setMessage(ok ? 'Proyecto guardado.' : 'Error al guardar.')
  }

  async function handleMapExport(titleBlock: TitleBlockData, format: 'png' | 'pdf') {
    setShowMapExport(false)
    const mapEl = mapElementRef.current
    const map   = mapRef.current
    if (!mapEl || !map) return

    // Deshabilitar interacción durante la captura para evitar movimientos accidentales
    map.dragging.disable()
    map.scrollWheelZoom.disable()
    ;(map as any).touchZoom?.disable()
    ;(map as any).doubleClickZoom?.disable()

    try {
      gis.setMessage('📸 Renderizando mapa…')

      const center  = map.getCenter()
      const zoom    = map.getZoom()
      const canvasW = mapEl.clientWidth
      const canvasH = mapEl.clientHeight

      // Render tiles + features directo en canvas — sin html2canvas, sin desfase
      const rawCanvas = await renderMapToCanvas(
        { lat: center.lat, lng: center.lng },
        zoom,
        canvasW,
        canvasH,
        gis.features,
      )

      drawNorthArrow(rawCanvas, 1)

      if (format === 'png') {
        const a = document.createElement('a')
        a.href     = rawCanvas.toDataURL('image/png')
        a.download = `${(titleBlock.titulo || 'mapa').replace(/\s+/g, '-')}.png`
        document.body.appendChild(a); a.click(); document.body.removeChild(a)
        gis.setMessage('✓ PNG exportado.')
        return
      }

      gis.setMessage('📄 Generando PDF…')
      const { default: jsPDF } = await import('jspdf')

      const pdf     = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
      const PW      = pdf.internal.pageSize.getWidth()
      const PH      = pdf.internal.pageSize.getHeight()
      const BORDER  = 10
      const ROTULO  = 35
      const INNER_W = PW - BORDER * 2
      const INNER_H = PH - BORDER * 2

      // Mapa ocupa toda la superficie interior
      pdf.addImage(rawCanvas.toDataURL('image/png'), 'PNG', BORDER, BORDER, INNER_W, INNER_H)

      // Marco exterior
      pdf.setDrawColor(0)
      pdf.setLineWidth(0.6)
      pdf.rect(BORDER, BORDER, INNER_W, INNER_H, 'S')

      // Rótulo superpuesto sobre el mapa, esquina inferior derecha
      const ROT_W = INNER_W / 2
      const ROT_X = BORDER + INNER_W - ROT_W
      const ROT_Y = BORDER + INNER_H - ROTULO
      drawRotulo(pdf, titleBlock, ROT_X, ROT_Y, ROT_W, ROTULO)

      // Leyenda en borde inferior izquierdo, superpuesta al mapa
      drawPdfLegend(pdf, BORDER + 2, BORDER + INNER_H - 2)

      pdf.save(`${(titleBlock.titulo || 'mapa').replace(/\s+/g, '-')}.pdf`)
      gis.setMessage('✓ PDF exportado.')

    } catch (err) {
      console.error('[mapExport]', err)
      gis.setMessage('✕ Error al exportar.')
    } finally {
      map.dragging.enable()
      map.scrollWheelZoom.enable()
      ;(map as any).touchZoom?.enable()
      ;(map as any).doubleClickZoom?.enable()
    }
  }

  // ── OLT helpers ───────────────────────────────────────────────────────────
  function addOltHost(host: string) {
    const current = proj.currentSubProject?.zabbixOltHosts ?? []
    if (!current.includes(host)) proj.patchSubProjectOlts([...current, host])
  }

  function removeOltHost(host: string) {
    const current = proj.currentSubProject?.zabbixOltHosts ?? []
    proj.patchSubProjectOlts(current.filter(h => h !== host))
  }

  // ── Leaflet layer rendering ───────────────────────────────────────────────
  function makePointIcon(featureType: FeatureKind, color: string, selected: boolean): L.DivIcon {
    const c = color
    const ring = selected
      ? `<rect x="1" y="1" width="30" height="30" rx="4" fill="none" stroke="${c}" stroke-width="2" opacity="0.7" stroke-dasharray="5 3"/>`
      : ''

    let body = ''
    if (featureType === 'node') {
      body = `
        <ellipse cx="14" cy="30" rx="12" ry="1.8" fill="#000" opacity="0.18"/>
        <path d="M19 17 L25 13 L25 23 L19 27 Z" fill="${c}" opacity="0.95"/>
        <path d="M19 17 L25 13 L25 23 L19 27 Z" fill="#000" opacity="0.3"/>
        <rect x="3" y="17" width="16" height="10" fill="${c}" opacity="0.95"/>
        <rect x="10" y="21" width="4" height="6" rx="0.8" fill="#000" opacity="0.28"/>
        <rect x="4" y="18.5" width="4" height="3" rx="0.8" fill="#fff" opacity="0.18"/>
        <rect x="14.5" y="18.5" width="2.5" height="3" rx="0.5" fill="#fff" opacity="0.18"/>
        <path d="M19 17 L25 13 L17 4 L11 8 Z" fill="${c}" opacity="0.72"/>
        <path d="M19 17 L25 13 L17 4 L11 8 Z" fill="#000" opacity="0.15"/>
        <path d="M3 17 L19 17 L11 8 Z" fill="${c}" opacity="0.88"/>
        <path d="M3 17 L19 17 L11 8 Z" fill="#fff" opacity="0.14"/>
        <line x1="11" y1="8" x2="17" y2="4" stroke="#fff" stroke-width="0.9" opacity="0.3"/>
        <rect x="15" y="4" width="2.5" height="5" rx="0.5" fill="${c}" stroke="#fff" stroke-width="0.5" opacity="0.65"/>
        <line x1="3" y1="17" x2="3" y2="27" stroke="#fff" stroke-width="0.8" opacity="0.3"/>
        <line x1="3" y1="17" x2="19" y2="17" stroke="#fff" stroke-width="0.8" opacity="0.25"/>
        <line x1="3" y1="17" x2="11" y2="8" stroke="#fff" stroke-width="0.8" opacity="0.25"/>`
    } else if (featureType === 'splice_box') {
      body = `
        <ellipse cx="16" cy="28" rx="9" ry="1.8" fill="#000" opacity="0.15"/>
        <rect x="9" y="8" width="14" height="16" fill="${c}" opacity="0.93"/>
        <rect x="19" y="8" width="4" height="16" fill="#000" opacity="0.1"/>
        <rect x="9" y="8" width="3" height="16" fill="#fff" opacity="0.06"/>
        <ellipse cx="16" cy="13.5" rx="7" ry="1.8" fill="none" stroke="#fff" stroke-width="1" opacity="0.2"/>
        <rect x="9" y="12.5" width="14" height="2" fill="#000" opacity="0.07"/>
        <ellipse cx="16" cy="19" rx="7" ry="1.8" fill="none" stroke="#fff" stroke-width="1" opacity="0.2"/>
        <rect x="9" y="18" width="14" height="2" fill="#000" opacity="0.07"/>
        <ellipse cx="16" cy="24" rx="7" ry="2" fill="${c}" opacity="0.88"/>
        <ellipse cx="16" cy="24" rx="7" ry="2" fill="#000" opacity="0.18"/>
        <ellipse cx="16" cy="8" rx="7" ry="2" fill="${c}" stroke="#fff" stroke-width="0.9" opacity="0.97"/>
        <ellipse cx="16" cy="8" rx="7" ry="2" fill="#fff" opacity="0.2"/>
        <rect x="13" y="1" width="6" height="8" rx="3" fill="${c}" stroke="#fff" stroke-width="0.9" opacity="0.9"/>
        <rect x="13" y="23" width="6" height="8" rx="3" fill="${c}" stroke="#fff" stroke-width="0.9" opacity="0.9"/>`
    } else if (featureType === 'camera') {
      // Cable reserve/coil icon
      body = `
        <ellipse cx="16" cy="29" rx="9" ry="1.5" fill="#000" opacity="0.15"/>
        <circle cx="16" cy="14" r="10" fill="none" stroke="${c}" stroke-width="3.5" opacity="0.25"/>
        <circle cx="16" cy="14" r="7" fill="none" stroke="${c}" stroke-width="3" opacity="0.5"/>
        <circle cx="16" cy="14" r="4" fill="none" stroke="${c}" stroke-width="2.5" opacity="0.8"/>
        <circle cx="16" cy="14" r="1.8" fill="${c}" opacity="0.95"/>
        <line x1="16" y1="24" x2="16" y2="29" stroke="${c}" stroke-width="2.5" stroke-linecap="round" opacity="0.7"/>
        <circle cx="16" cy="14" r="10" fill="none" stroke="#fff" stroke-width="0.6" opacity="0.15"/>`
    } else if (featureType === 'poste') {
      body = `
        <ellipse cx="16" cy="30" rx="5" ry="1.2" fill="#000" opacity="0.18"/>
        <line x1="16" y1="4" x2="16" y2="30" stroke="${c}" stroke-width="3" stroke-linecap="round" opacity="0.9"/>
        <line x1="9" y1="9" x2="23" y2="9" stroke="${c}" stroke-width="2.5" stroke-linecap="round" opacity="0.9"/>
        <line x1="11" y1="14" x2="21" y2="14" stroke="${c}" stroke-width="2" stroke-linecap="round" opacity="0.75"/>
        <circle cx="16" cy="4" r="2.5" fill="${c}" stroke="#fff" stroke-width="0.8" opacity="0.95"/>`
    } else {
      body = `
        <ellipse cx="16" cy="28" rx="11" ry="1.9" fill="#000" opacity="0.15"/>
        <rect x="6" y="10" width="20" height="12" fill="${c}" opacity="0.93"/>
        <rect x="22" y="10" width="4" height="12" fill="#000" opacity="0.1"/>
        <rect x="6" y="10" width="3" height="12" fill="#fff" opacity="0.06"/>
        <circle cx="10" cy="16" r="1.6" fill="#000" opacity="0.28"/>
        <circle cx="14" cy="16" r="1.6" fill="#000" opacity="0.28"/>
        <circle cx="18" cy="16" r="1.6" fill="#000" opacity="0.28"/>
        <circle cx="22" cy="16" r="1.6" fill="#000" opacity="0.28"/>
        <ellipse cx="16" cy="22" rx="10" ry="2.2" fill="${c}" opacity="0.88"/>
        <ellipse cx="16" cy="22" rx="10" ry="2.2" fill="#000" opacity="0.18"/>
        <ellipse cx="16" cy="10" rx="10" ry="2.2" fill="${c}" stroke="#fff" stroke-width="0.9" opacity="0.97"/>
        <ellipse cx="16" cy="10" rx="10" ry="2.2" fill="#fff" opacity="0.2"/>
        <rect x="13" y="22" width="6" height="7" rx="3" fill="${c}" stroke="#fff" stroke-width="0.9" opacity="0.9"/>`
    }

    return L.divIcon({
      className: '',
      html: `<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">${ring}${body}</svg>`,
      iconSize:  [32, 32],
      iconAnchor: [16, 16],
      popupAnchor: [0, -16],
    })
  }

  function getLayerSVGPath(layer: L.Layer): SVGElement | undefined {
    if ((layer as any)._path) return (layer as any)._path
    if (layer instanceof L.FeatureGroup) {
      const base = layer.getLayers()[0]
      return base ? (base as any)._path : undefined
    }
    return undefined
  }

  function featureToLayer(feature: AppFeature, isSelected = false): L.Layer {
    if (feature.geometry.type === 'Point') {
      const [lng, lat] = feature.geometry.coordinates
      const icon = makePointIcon(feature.properties.featureType, feature.properties.color, isSelected)
      return L.marker([lat, lng], { icon })
    }
    if (feature.geometry.type === 'LineString') {
      const latLngs = feature.geometry.coordinates.map(([lng, lat]) => [lat, lng]) as L.LatLngExpression[]
      const isDamaged = feature.properties.status === 'damaged'
      const isPlanned = feature.properties.status === 'planned'
      const dash = isPlanned ? '10 7' : undefined
      const base = L.polyline(latLngs, {
        color: feature.properties.color, weight: 6,
        opacity: isDamaged ? 0.5 : 0.88, dashArray: dash,
        lineCap: 'round' as any, lineJoin: 'round' as any,
      })
      const highlight = L.polyline(latLngs, {
        color: '#ffffff', weight: 2,
        opacity: isDamaged ? 0.12 : 0.28, dashArray: dash,
        lineCap: 'round' as any, lineJoin: 'round' as any, interactive: false,
      })
      return L.featureGroup([base, highlight])
    }
    if (feature.geometry.type === 'Polygon') {
      const latLngs = feature.geometry.coordinates[0].map(([lng, lat]) => [lat, lng]) as L.LatLngExpression[]
      return L.polygon(latLngs, {
        color: feature.properties.color, weight: 2, opacity: 0.8,
        fillColor: feature.properties.color, fillOpacity: 0.18,
        dashArray: feature.properties.status === 'planned' ? '8 5' : undefined,
      })
    }
    throw new Error('Geometría no soportada.')
  }

  // ── Distancia a lo largo de una polilínea (GeoJSON [lng,lat][]) ──────────────
  function distAlongLine(coords: number[][], mouse: L.LatLng): { fromA: number; geoTotal: number } {
    function hav(lat1: number, lng1: number, lat2: number, lng2: number) {
      const R = 6371000
      const p1 = lat1 * Math.PI / 180, p2 = lat2 * Math.PI / 180
      const dp = (lat2 - lat1) * Math.PI / 180, dl = (lng2 - lng1) * Math.PI / 180
      const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2
      return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    }
    let minDist = Infinity, fromA = 0, acc = 0
    for (let i = 0; i < coords.length - 1; i++) {
      const [ax, ay] = coords[i], [bx, by] = coords[i + 1]
      const segLen = hav(ay, ax, by, bx)
      const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy
      const t = len2 > 0 ? Math.max(0, Math.min(1, ((mouse.lng - ax) * dx + (mouse.lat - ay) * dy) / len2)) : 0
      const dist = hav(mouse.lat, mouse.lng, ay + t * dy, ax + t * dx)
      if (dist < minDist) { minDist = dist; fromA = acc + t * segLen }
      acc += segLen
    }
    return { fromA, geoTotal: acc }
  }

  function bindFeatureLayer(layer: L.Layer, feature: AppFeature) {
    layerIndexRef.current.set(feature.properties.id, layer)
    layer.on('click', () => gis.setSelectedFeatureId(feature.properties.id))
    const baseLayer = (layer instanceof L.FeatureGroup) ? layer.getLayers()[0] : layer
    if (baseLayer) {
      baseLayer.on('pm:edit', () => {
        const layerGeoJson = (baseLayer as any).toGeoJSON() as GeoJSON.Feature
        gis.commitFeatures(current =>
          current.map(item =>
            item.properties.id === feature.properties.id
              ? normalizeFeature({ ...layerGeoJson, properties: item.properties })
              : item
          )
        )
        gis.setMessage('Geometría actualizada.')
      })
    }
  }

  function syncMapLayers(currentFeatures: AppFeature[], currentSelectionId: string | null) {
    const group = editableLayerGroupRef.current
    if (!group) return
    const validIds = new Set(currentFeatures.map(f => f.properties.id))
    for (const [id, layer] of layerIndexRef.current.entries()) {
      if (!validIds.has(id)) { group.removeLayer(layer); layerIndexRef.current.delete(id) }
    }
    for (const feature of currentFeatures) {
      const existing = layerIndexRef.current.get(feature.properties.id)
      if (existing) { group.removeLayer(existing); layerIndexRef.current.delete(feature.properties.id) }
      const isSelected = currentSelectionId === feature.properties.id
      const layer = featureToLayer(feature, isSelected)
      bindFeatureLayer(layer, feature)
      group.addLayer(layer)
      if (isSelected) {
        if (layer instanceof L.FeatureGroup) layer.getLayers().forEach(l => { if ('bringToFront' in l) (l as any).bringToFront() })
        else if ('bringToFront' in layer) (layer as any).bringToFront()
      }
    }
  }

  function switchLayer(name: LayerName) {
    const map = mapRef.current
    if (!map) return
    Object.values(baseLayersRef.current).forEach(l => { if (map.hasLayer(l)) map.removeLayer(l) })
    baseLayersRef.current[name]?.addTo(map)
    setActiveLayer(name)
  }

  // ── Map initialization ────────────────────────────────────────────────────
  useEffect(() => {
    if (mapRef.current || !mapElementRef.current) return
    const el = mapElementRef.current
    // ro vive en el scope externo para que el cleanup pueda disconnectarlo
    let ro: ResizeObserver | null = null

    // Defer init to next frame so the flex layout has computed real dimensions.
    // Without this, Leaflet reads 0×0 and never requests tiles.
    const rafId = requestAnimationFrame(() => {
      if (mapRef.current || !el.isConnected) return

      const center: L.LatLngExpression = initialCenterRef.current
        ? [initialCenterRef.current.lat, initialCenterRef.current.lng]
        : defaultCenter

      const map = L.map(el, { center, zoom: defaultZoom, zoomControl: true })

      // Sin crossOrigin en las capas del mapa en vivo: el Service Worker cacheaba
      // las tiles como respuestas opacas (status 0), y cuando Leaflet las pedía
      // con crossOrigin='anonymous', el browser las rechazaba por falta de
      // cabecera CORS → mapa en blanco. El export ya no usa html2canvas así que
      // crossOrigin no es necesario aquí.
      const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 20, attribution: '&copy; OpenStreetMap',
      }).addTo(map)

      baseLayersRef.current = {
        'OSM':             osm,
        'Topográfico':     L.tileLayer(
          'https://services.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
          { maxZoom: 19, attribution: '&copy; Esri, HERE, Garmin, FAO, USGS' }
        ),
        'Google Calles':   L.tileLayer('https://mt{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', { maxZoom: 22, subdomains: '0123', attribution: '&copy; Google Maps' }),
        'Google Satélite': L.tileLayer('https://mt{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', { maxZoom: 22, subdomains: '0123', attribution: '&copy; Google Maps' }),
        'Google Híbrido':  L.tileLayer('https://mt{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', { maxZoom: 22, subdomains: '0123', attribution: '&copy; Google Maps' }),
        'Esri Satélite':   L.tileLayer(
          'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
          { maxZoom: 19, attribution: '&copy; Esri, Maxar, Earthstar Geographics' }
        ),
        'CartoDB Oscuro':  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { maxZoom: 20, attribution: '&copy; CartoDB' }),
      }

      editableLayerGroupRef.current = L.featureGroup().addTo(map)
      validationGroupRef.current    = L.layerGroup().addTo(map)
      distanceLabelLayerRef.current = L.layerGroup().addTo(map)
      pathHighlightGroupRef.current = L.layerGroup().addTo(map)

      ;(map as any).pm.addControls({
        position: 'topleft',
        drawCircle: false, drawCircleMarker: false, drawRectangle: false,
        drawPolygon: false, drawText: false, cutPolygon: false,
        rotateMode: false, oneBlock: true,
      })

      map.on('pm:create', (event: any) => {
        const layer = event.layer as L.Layer

        if (gis.measureModeRef.current) {
          gis.measureModeRef.current = false
          const geoJson = (layer as any).toGeoJSON() as GeoJSON.Feature
          if (geoJson.geometry.type === 'LineString') {
            const lenKm = computeLineLength((geoJson.geometry as GeoJSON.LineString).coordinates)
            const lenStr = formatDistance(lenKm)
            ;(layer as any).setStyle?.({ color: '#f59e0b', weight: 2, dashArray: '6 4' })
            ;(layer as any).bindTooltip(lenStr, { permanent: true, className: 'measure-tooltip', direction: 'center' }).openTooltip()
            if (gis.measureLayerRef.current) editableLayerGroupRef.current?.removeLayer(gis.measureLayerRef.current)
            editableLayerGroupRef.current?.addLayer(layer)
            gis.measureLayerRef.current = layer
            gis.setHasMeasureLayer(true)
            gis.setMessage(`Medición: ${lenStr}`)
          }
          return
        }

        editableLayerGroupRef.current?.addLayer(layer)
        const geoJson = (layer as any).toGeoJSON() as GeoJSON.Feature
        const featureType = gis.drawModeTypeRef.current
        const resolved: FeatureKind = geoJson.geometry?.type === 'LineString' ? 'fiber_line'
          : geoJson.geometry?.type === 'Polygon' ? 'zone' : featureType
        const feature = normalizeFeature({
          ...geoJson,
          properties: { ...geoJson.properties, ...makeProperties(resolved), featureType: resolved },
        })
        bindFeatureLayer(layer, feature)
        gis.commitFeatures(current => [...current, feature])
        gis.setSelectedFeatureId(feature.properties.id)
        gis.logChange('created', typeLabels[feature.properties.featureType], { featureId: feature.properties.id, featureType: feature.properties.featureType })
        gis.setMessage(`${typeLabels[feature.properties.featureType]} creado.`)
      })

      map.on('pm:snapdrag', (e: any) => {
        if (!gis.measureModeRef.current) return
        try {
          const wl = e.workingLayer ?? (e as any).layer
          const gj = wl?.toGeoJSON?.() as GeoJSON.Feature | undefined
          if (gj?.geometry?.type === 'LineString') {
            const coords = (gj.geometry as GeoJSON.LineString).coordinates
            if (coords.length < 2) return
            const lenKm = computeLineLength(coords)
            gis.setMessage(`Midiendo: ${formatDistance(lenKm)} — doble clic para finalizar`)
          }
        } catch { /* workingLayer may not be ready */ }
      })

      mapRef.current = map

      // Pintar las features que ya cargaron mientras esperábamos el RAF
      syncMapLayers(gis.featuresRef.current, null)

      // Initial fitBounds / center
      const feats = gis.featuresRef.current
      if (feats.length > 0) {
        const bounds = L.geoJSON(featureCollection(feats) as any).getBounds()
        if (bounds.isValid()) map.fitBounds(bounds.pad(0.2))
      } else if (initialCenterRef.current) {
        map.setView([initialCenterRef.current.lat, initialCenterRef.current.lng], 15)
      }

      map.invalidateSize()
      setTimeout(() => map.invalidateSize(), 300)

      if (typeof ResizeObserver !== 'undefined') {
        ro = new ResizeObserver(() => { map.invalidateSize() })
        ro.observe(el)
      }
    })

    return () => {
      cancelAnimationFrame(rafId)
      ro?.disconnect()
      const m = mapRef.current
      if (m) { m.remove(); mapRef.current = null }
      editableLayerGroupRef.current = null
      validationGroupRef.current    = null
      pathHighlightGroupRef.current = null
      distanceLabelLayerRef.current = null
      layerIndexRef.current.clear()
    }
  }, [proj.view]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Sync map layers when features change ──────────────────────────────────
  useEffect(() => {
    syncMapLayers(gis.features, gis.selectedFeatureId)
    prevSelectedRef.current = gis.selectedFeatureId
  }, [gis.features]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Efficient selection icon update ──────────────────────────────────────
  useEffect(() => {
    const prev = prevSelectedRef.current
    prevSelectedRef.current = gis.selectedFeatureId
    if (prev === gis.selectedFeatureId) return

    if (prev) {
      const feat = gis.features.find(f => f.properties.id === prev)
      const layer = layerIndexRef.current.get(prev)
      if (feat && layer instanceof L.Marker && feat.geometry.type === 'Point') {
        layer.setIcon(makePointIcon(feat.properties.featureType, feat.properties.color, false))
      }
    }
    if (gis.selectedFeatureId) {
      const feat = gis.features.find(f => f.properties.id === gis.selectedFeatureId)
      const layer = layerIndexRef.current.get(gis.selectedFeatureId)
      if (feat && layer instanceof L.Marker && feat.geometry.type === 'Point') {
        layer.setIcon(makePointIcon(feat.properties.featureType, feat.properties.color, true))
        if ('bringToFront' in layer) (layer as any).bringToFront()
      }
    }
  }, [gis.selectedFeatureId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Fiber hover: distancia física desde A y B ────────────────────────────
  useEffect(() => {
    const feat = gis.selectedFeature
    if (
      !feat || feat.properties.featureType !== 'fiber_line' ||
      feat.geometry.type !== 'LineString'
    ) {
      setFiberHover(null)
      return
    }
    const layer = layerIndexRef.current.get(feat.properties.id)
    if (!layer) return

    const coords = (feat.geometry as GeoJSON.LineString).coordinates
    const extraM          = feat.properties.extraLengthM ?? 0
    const bypassM         = feat.properties.bypassM ?? 0
    const extraFraction   = feat.properties.extraLengthPositionFraction ?? 0.5
    const bypassFraction  = feat.properties.bypassPositionFraction ?? 0.5

    function onMove(e: L.LeafletMouseEvent) {
      if (!mapElementRef.current || !mapRef.current) return
      const { fromA, geoTotal } = distAlongLine(coords, e.latlng)

      // Cámaras vinculadas a esta línea
      const cameras = gis.features.filter(f =>
        (f.properties.featureType === 'camera') &&
        f.properties.linkedLineId === feat!.properties.id &&
        f.geometry.type === 'Point'
      )

      // Suma reservas de cámaras que están entre A y el cursor
      let camBonus = 0
      for (const cam of cameras) {
        const [clng, clat] = (cam.geometry as GeoJSON.Point).coordinates
        const { fromA: camFromA } = distAlongLine(coords, L.latLng(clat, clng))
        if (camFromA <= fromA) {
          camBonus += (cam.properties.reserveM ?? 0) + (cam.properties.bypassM ?? 0)
        }
      }

      // Total de extras de cámaras (todas)
      const totalCamExtras = cameras.reduce(
        (s, c) => s + (c.properties.reserveM ?? 0) + (c.properties.bypassM ?? 0), 0
      )

      // extraM y bypassM: step function en la posición configurada
      const extraGeoPos  = geoTotal * extraFraction
      const bypassGeoPos = geoTotal * bypassFraction
      const extraBeforeCursor  = fromA >= extraGeoPos  ? extraM  : 0
      const bypassBeforeCursor = fromA >= bypassGeoPos ? bypassM : 0

      const realFromA = fromA + camBonus + extraBeforeCursor + bypassBeforeCursor
      const realTotal = geoTotal + extraM + bypassM + totalCamExtras
      const realFromB = realTotal - realFromA

      const pt   = mapRef.current!.latLngToContainerPoint(e.latlng)
      const rect = mapElementRef.current!.getBoundingClientRect()
      setFiberHover({ x: rect.left + pt.x, y: rect.top + pt.y, fromA: realFromA, fromB: realFromB })
    }

    function onOut() { setFiberHover(null) }

    layer.on('mousemove', onMove)
    layer.on('mouseout', onOut)
    return () => {
      layer.off('mousemove', onMove)
      layer.off('mouseout', onOut)
      setFiberHover(null)
    }
  }, [gis.selectedFeature, gis.features]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Validation rings ──────────────────────────────────────────────────────
  useEffect(() => {
    const group = validationGroupRef.current
    if (!group) return
    group.clearLayers()
    if (!showValidation) return

    // Group issues by featureId
    const byFeature = new Map<string, typeof gis.validationIssues>()
    for (const issue of gis.validationIssues) {
      const list = byFeature.get(issue.featureId) ?? []
      list.push(issue)
      byFeature.set(issue.featureId, list)
    }

    for (const [id, issues] of byFeature) {
      const layer = layerIndexRef.current.get(id)
      if (!layer) continue
      let latlng: L.LatLng | null = null
      if ((layer as any).getLatLng) latlng = (layer as any).getLatLng()
      else if ((layer as any).getBounds) latlng = (layer as any).getBounds().getCenter()
      if (!latlng) continue

      const name = issues[0].featureName
      const rows = issues.map(i =>
        `<div class="val-tooltip-row ${i.severity}">
          <span class="val-tooltip-icon">${i.severity === 'error' ? '✕' : '⚠'}</span>
          ${i.message}
        </div>`
      ).join('')
      const tooltipHtml = `<div class="val-tooltip"><strong>${name}</strong>${rows}</div>`

      L.circleMarker(latlng, {
        radius: 18, color: '#fbbf24', weight: 2.5,
        opacity: 0.85, fillOpacity: 0,
        className: 'validation-warn-ring',
      } as any)
        .bindTooltip(tooltipHtml, { className: 'val-tooltip-container', direction: 'top', offset: [0, -20] })
        .addTo(group)
    }
  }, [gis.validationIssues, showValidation])

  // ── Distance labels on fiber lines ────────────────────────────────────────
  useEffect(() => {
    const group = distanceLabelLayerRef.current
    if (!group) return
    group.clearLayers()
    if (!showDistanceLabels) return

    for (const feat of gis.features) {
      if (feat.properties.featureType !== 'fiber_line') continue
      if (feat.geometry.type !== 'LineString') continue
      const coords = (feat.geometry as GeoJSON.LineString).coordinates
      if (coords.length < 2) continue

      const geoKm   = computeLineLength(coords)
      const extraM  = feat.properties.extraLengthM ?? 0
      const bypassM = feat.properties.bypassM ?? 0
      const totalM  = geoKm * 1000 + extraM + bypassM
      const label   = totalM >= 1000
        ? `${(totalM / 1000).toFixed(2)} km`
        : `${totalM.toFixed(0)} m`
      const name    = feat.properties.name || feat.properties.code || ''

      // midpoint of the line
      const mid = Math.floor(coords.length / 2)
      const [lng, lat] = coords[mid]

      L.marker([lat, lng], {
        icon: L.divIcon({
          className: '',
          html: `<div class="dist-label">${name ? `<span class="dist-label-name">${name}</span>` : ''}${label}</div>`,
          iconAnchor: [0, 0],
        }),
        interactive: false,
        zIndexOffset: -100,
      }).addTo(group)

      // Arrow at 75% of the line indicating A→B direction
      const arrowIdx = Math.floor(coords.length * 0.75)
      if (arrowIdx > 0 && arrowIdx < coords.length) {
        const [ax, ay] = coords[arrowIdx - 1]
        const [bx, by] = coords[arrowIdx]
        const angleDeg = Math.atan2(by - ay, bx - ax) * 180 / Math.PI
        const [alng, alat] = coords[arrowIdx]
        L.marker([alat, alng], {
          icon: L.divIcon({
            className: '',
            html: `<div class="fiber-arrow" style="transform:rotate(${angleDeg}deg)">→</div>`,
            iconAnchor: [7, 9],
          }),
          interactive: false,
          zIndexOffset: -99,
        }).addTo(group)
      }
    }
  }, [gis.features, showDistanceLabels]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Optical path highlighting ─────────────────────────────────────────────
  useEffect(() => {
    const group = pathHighlightGroupRef.current
    if (!group) return
    group.clearLayers()
    highlightedLineLayers.current.forEach(layer => {
      const el = getLayerSVGPath(layer)
      if (el) { el.classList.remove('optical-path-line'); el.removeAttribute('data-op-idx') }
    })
    highlightedLineLayers.current = []

    if (!gis.opticalPath) return

    gis.opticalPath.lineFeatureIds.forEach(lineId => {
      const layer = layerIndexRef.current.get(lineId)
      if (!layer) return
      const el = getLayerSVGPath(layer)
      if (!el) return
      el.classList.add('optical-path-line')
      el.style.animationDelay = '0s'
      highlightedLineLayers.current.push(layer)
    })

    gis.opticalPath.allFeatureIds.forEach((fid, idx) => {
      const layer = layerIndexRef.current.get(fid)
      if (!layer) return
      let latlng: L.LatLng | null = null
      if ((layer as any).getLatLng) latlng = (layer as any).getLatLng()
      else if ((layer as any).getBounds) latlng = (layer as any).getBounds().getCenter()
      if (!latlng) return

      const feat = gis.features.find(f => f.properties.id === fid)
      const isNode = feat?.properties.featureType === 'node'
      const isLast = idx === gis.opticalPath!.allFeatureIds.length - 1

      L.circleMarker(latlng, {
        radius: 20, color: isNode ? '#3b82f6' : isLast ? '#22c55e' : '#f59e0b',
        weight: 2.5, opacity: 0, fillOpacity: 0,
        className: `path-pulse-ring path-pulse-ring-${idx % 3}`,
      }).addTo(group)

      const icon = L.divIcon({
        className: '',
        html: `<div class="path-step-badge ${isNode ? 'path-step-node' : isLast ? 'path-step-client' : ''}">${isNode ? '🖥' : isLast ? '🔌' : idx + 1}</div>`,
        iconSize: [26, 26], iconAnchor: [13, 13],
      })
      L.marker(latlng, { icon, interactive: false }).addTo(group)
    })

    const pathPoints = gis.opticalPath.allFeatureIds.reduce<{ lat: number; lng: number }[]>((acc, fid) => {
      const feat = gis.features.find(f => f.properties.id === fid)
      if (feat?.geometry.type === 'Point') {
        const [lng, lat] = (feat.geometry as GeoJSON.Point).coordinates
        acc.push({ lat, lng })
      }
      return acc
    }, [])
    if (pathPoints.length >= 2) {
      const bounds = L.latLngBounds(pathPoints.map(p => L.latLng(p.lat, p.lng)))
      mapRef.current?.fitBounds(bounds.pad(0.25), { animate: true, duration: 0.8 })
    }
  }, [gis.opticalPath, gis.features]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Survey: add pole on map click ─────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    const container = mapElementRef.current?.querySelector('.leaflet-container') as HTMLElement | null
    if (!map || !container) return
    if (!addingPole) { container.style.cursor = ''; return }
    container.style.cursor = 'crosshair'
    function onClick(e: L.LeafletMouseEvent) {
      setPendingPoleCoords([e.latlng.lng, e.latlng.lat])
      setShowPoleForm(true)
      setAddingPole(false)
      container!.style.cursor = ''
    }
    map.once('click', onClick)
    return () => { map.off('click', onClick); container.style.cursor = '' }
  }, [addingPole]) // eslint-disable-line react-hooks/exhaustive-deps

  function handlePoleFormSave(data: PoleData) {
    if (!pendingPoleCoords) return
    const [lng, lat] = pendingPoleCoords
    const feature: import('./types').AppFeature = {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [lng, lat] },
      properties: {
        ...makeProperties('poste'),
        name: data.name || `Poste ${now().slice(11,16)}`,
        notes: data.notes,
        poleType: data.poleType,
        poleCondition: data.poleCondition,
        poleAttachment: data.poleAttachment,
        poleElement: data.poleElement,
        poleGainM: data.poleGainM || undefined,
        surveyedBy: user?.email,
        surveyedAt: new Date().toISOString(),
      },
    }
    gis.commitFeatures(current => [...current, feature])
    gis.logChange('created', feature.properties.name, { featureId: feature.properties.id, featureType: 'poste' })
    gis.setSelectedFeatureId(feature.properties.id)
    setShowPoleForm(false)
    setPendingPoleCoords(null)
  }

  // ── Custom cursor while drawing ───────────────────────────────────────────
  useEffect(() => {
    const container = mapElementRef.current?.querySelector('.leaflet-container') as HTMLElement | null
      ?? mapElementRef.current
    if (!container) return
    const cursor = getDrawCursor(activeTool)
    container.style.cursor = cursor || ''
    return () => { container.style.cursor = '' }
  }, [activeTool])

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    if (proj.view !== 'editor') return
    function onKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName
      const isInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
      if (e.key === 'Escape') {
        if (activeTool) { e.preventDefault(); handleStopDraw() }
        return
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && !isInput && gis.selectedFeature) {
        e.preventDefault()
        const name = gis.selectedFeature.properties.name || typeLabels[gis.selectedFeature.properties.featureType]
        if (window.confirm(`¿Eliminar "${name}"? Esta acción no se puede deshacer.`)) gis.removeSelectedFeature()
        return
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); setShowGlobalSearch(true); return }
      if (!e.ctrlKey && !e.metaKey) return
      if (e.key === 'z' && !e.shiftKey) { e.preventDefault(); gis.undo() }
      if ((e.key === 'z' && e.shiftKey) || e.key === 'y') { e.preventDefault(); gis.redo() }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [proj.view, activeTool, gis.undo, gis.redo, gis.selectedFeature, gis.removeSelectedFeature]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Multi-subproject view layers ─────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    // Remove all existing multi-view layers
    for (const lg of multiViewGroupsRef.current.values()) map.removeLayer(lg)
    multiViewGroupsRef.current.clear()

    if (!multiViewEnabled || !proj.currentProject) return

    const siblings = proj.currentProject.subProjects.filter(
      sp => sp.id !== proj.currentSubProjectId
    )
    const PALETTE = ['#6366f1','#f59e0b','#10b981','#ec4899','#8b5cf6','#14b8a6','#f97316','#06b6d4']

    siblings.forEach((sp, idx) => {
      if (hiddenSPs.has(sp.id)) return
      const lg = L.layerGroup().addTo(map)
      multiViewGroupsRef.current.set(sp.id, lg)
      const accentColor = PALETTE[idx % PALETTE.length]

      for (const feature of sp.features) {
        let layer: L.Layer | null = null
        const color = feature.properties.color

        if (feature.geometry.type === 'Point') {
          const [lng, lat] = (feature.geometry as GeoJSON.Point).coordinates
          layer = L.circleMarker([lat, lng], {
            radius: 7, fillColor: color, color: accentColor,
            weight: 2, opacity: 0.8, fillOpacity: 0.45,
          })
        } else if (feature.geometry.type === 'LineString') {
          const lls = (feature.geometry as GeoJSON.LineString).coordinates.map(
            ([lng, lat]) => [lat, lng] as L.LatLngExpression
          )
          layer = L.polyline(lls, { color, weight: 4, opacity: 0.4, dashArray: '8 5' })
        } else if (feature.geometry.type === 'Polygon') {
          const lls = (feature.geometry as GeoJSON.Polygon).coordinates[0].map(
            ([lng, lat]) => [lat, lng] as L.LatLngExpression
          )
          layer = L.polygon(lls, { color, weight: 2, opacity: 0.5, fillOpacity: 0.08, dashArray: '6 4' })
        }

        if (!layer) continue
        const fName = feature.properties.name || typeLabels[feature.properties.featureType]
        layer.bindTooltip(
          `<strong>${fName}</strong><br/><span style="color:#94a3b8;font-size:11px">${sp.name}</span>`,
          { sticky: true, className: 'mv-tooltip' }
        )
        lg.addLayer(layer)
      }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [multiViewEnabled, hiddenSPs, proj.currentSubProjectId, proj.currentProject])

  // ── Save status labels ────────────────────────────────────────────────────
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null)
  useEffect(() => {
    if (proj.saveStatus === 'saved') setLastSavedAt(new Date())
  }, [proj.saveStatus])

  const saveLabel = { saved: '✓ Guardado', unsaved: '● Sin guardar', saving: '↑ Guardando...', error: '✕ Error al guardar' }
  const saveClass = { saved: 'save-badge saved', unsaved: 'save-badge unsaved', saving: 'save-badge saving', error: 'save-badge error' }

  function formatSaveTime(d: Date | null) {
    if (!d) return ''
    return d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  }

  const modalJsx = proj.modalOpen ? (
    <CreateProjectModal
      mode={proj.modalMode}
      name={proj.modalName}
      desc={proj.modalDesc}
      saving={proj.modalSaving}
      error={proj.modalError}
      locationQuery={proj.locationQuery}
      locationError={proj.locationError}
      locationSearching={proj.locationSearching}
      locationResults={proj.locationResults}
      selectedLocation={proj.selectedLocation}
      onName={proj.setModalName}
      onDesc={proj.setModalDesc}
      onLocationQuery={proj.setLocationQuery}
      onClearLocationError={() => proj.setLocationError('')}
      onSearchLocation={proj.handleSearchLocation}
      onSelectLocation={proj.selectLocation}
      onClearLocation={proj.clearSelectedLocation}
      onSetLocation={proj.setSelectedLocation}
      onSubmit={() => proj.submitModal(proj.selectedLocation)}
      onClose={proj.closeModal}
    />
  ) : null

  // ── Loading ───────────────────────────────────────────────────────────────
  if (!proj.dbLoaded) {
    return <div className="screen"><p className="empty-state">Cargando base de datos...</p></div>
  }

  // ── Home ──────────────────────────────────────────────────────────────────
  if (proj.view === 'home') {
    return (
      <>
        <Dashboard
          projects={proj.projects}
          zabbixConfig={zabbixConfig}
          onOpenProject={proj.openSubProjects}
          onCreateProject={() => proj.openCreateModal('project')}
          onDeleteProject={proj.deleteProject}
          isSuperadmin={isSuperadmin}
          isAdmin={isAdmin}
          isReadOnly={isReadOnly}
          userEmail={user?.email ?? ''}
          onAdminClick={() => setShowSuperAdmin(true)}
          onLogout={logout}
        />
        {modalJsx}
        {showSuperAdmin && (isSuperadmin || isAdmin) && <SuperAdminPage onClose={() => setShowSuperAdmin(false)} />}
        {showGlobalSearch && (
          <GlobalSearch projects={proj.projects} onNavigate={handleSearchNavigate} onClose={() => setShowGlobalSearch(false)} />
        )}
      </>
    )
  }

  // ── Sub-projects ──────────────────────────────────────────────────────────
  if (proj.view === 'subprojects' && proj.currentProject) {
    return (
      <>
        <SubProjectsView
          project={proj.currentProject}
          onBack={handleGoHome}
          onOpenSubProject={handleOpenEditor}
          onCreateSubProject={() => proj.openCreateModal('subproject')}
          onDeleteSubProject={proj.deleteSubProject}
          collectPowerAlarms={collectPowerAlarms}
          onTraceAlarm={(fiberId, spId) => { gis.setPendingTraceFiberId(fiberId); handleOpenEditor(spId) }}
        />
        {modalJsx}
      </>
    )
  }

  // ── Editor ────────────────────────────────────────────────────────────────
  const powerAlarms = collectPowerAlarms(gis.features)

  return (
    <div className={`app-shell${fieldMode ? ' field-mode' : ''}`}>

      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <header className="topbar">
        <div className="breadcrumb">
          <span className="breadcrumb-link" onClick={handleGoHome}>Proyectos</span>
          <svg className="breadcrumb-sep" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6"/></svg>
          <span className="breadcrumb-link" onClick={handleGoToSubProjects}>{proj.currentProject?.name}</span>
          <svg className="breadcrumb-sep" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6"/></svg>
          <span className="breadcrumb-current">{proj.currentSubProject?.name}</span>
        </div>
        <div className="topbar-right">
          <button className="secondary topbar-btn-sm topbar-search-btn" onClick={() => setShowGlobalSearch(true)} title="Búsqueda global (Ctrl+K)">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
            </svg>
            <kbd className="topbar-kbd">Ctrl K</kbd>
          </button>
          <button
            className={`secondary topbar-btn-sm${fieldMode ? ' topbar-btn-active' : ''}`}
            title="Modo campo — vista simplificada para tablet/celular"
            onClick={() => setFieldMode(v => !v)}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/>
            </svg>
            Campo
          </button>
          {proj.currentProject && proj.currentProject.subProjects.length > 1 && (
            <button
              className={`secondary topbar-btn-sm${multiViewEnabled ? ' topbar-btn-active' : ''}`}
              title="Vista multi-subproyecto"
              onClick={() => { setMultiViewEnabled(v => !v); if (multiViewEnabled) setHiddenSPs(new Set()) }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="3" width="9" height="9" rx="1"/><rect x="13" y="3" width="9" height="9" rx="1"/>
                <rect x="2" y="14" width="9" height="9" rx="1"/><rect x="13" y="14" width="9" height="9" rx="1"/>
              </svg>
              Multi-vista
            </button>
          )}
          <button
            className={`secondary topbar-btn-zabbix${zabbixConfig ? ' zabbix-configured' : ''}`}
            title={zabbixConfig ? 'Zabbix configurado — clic para editar' : 'Configurar Zabbix'}
            onClick={() => setShowZabbixConfig(true)}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
            Zabbix{zabbixConfig ? ' ✓' : ''}
          </button>
          {zabbixConfig && (
            <div className="olt-manager-wrap">
              <button className="secondary topbar-btn-sm" onClick={() => setShowOltManager(v => !v)}
                title="Gestionar OLTs de este subproyecto">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16"/></svg>
                OLTs ({proj.currentSubProject?.zabbixOltHosts?.length ?? 0})
              </button>
              {showOltManager && (
                <OltManagerDropdown
                  subProjectName={proj.currentSubProject?.name ?? ''}
                  oltHosts={proj.currentSubProject?.zabbixOltHosts ?? []}
                  rackHosts={oltHostsFromRack}
                  onAdd={addOltHost}
                  onRemove={removeOltHost}
                  onClose={() => setShowOltManager(false)}
                />
              )}
            </div>
          )}
          <DropdownMenu label="🗺 Capas">
            {LAYER_NAMES.map(name => (
              <button key={name} className={`dropdown-item${activeLayer === name ? ' dd-active' : ''}`}
                onClick={() => switchLayer(name)}>{name}</button>
            ))}
          </DropdownMenu>
          <DropdownMenu label="Acciones">
            <button className="dropdown-item" onClick={gis.undo} disabled={!gis.canUndo}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 00-4-4H4"/></svg>
              Deshacer <span className="dropdown-kbd">Ctrl+Z</span>
            </button>
            <button className="dropdown-item" onClick={gis.redo} disabled={!gis.canRedo}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 14 20 9 15 4"/><path d="M4 20v-7a4 4 0 014-4h12"/></svg>
              Rehacer <span className="dropdown-kbd">Ctrl+Y</span>
            </button>
            <div className="dropdown-divider" />
            <button className="dropdown-item" onClick={handleSaveNow} disabled={proj.saveStatus === 'saving'}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
              Guardar ahora
            </button>
            <button className="dropdown-item" onClick={() => gis.exportGeoJSON(proj.currentSubProject?.name ?? '')}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Exportar GeoJSON
            </button>
            <button className="dropdown-item" onClick={() => setShowMapExport(true)}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              Exportar PDF del mapa
            </button>
            <button className="dropdown-item danger" onClick={() => { if (window.confirm('¿Limpiar todos los elementos del subproyecto? Esta acción no se puede deshacer.')) gis.clearSubProject() }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>
              Limpiar todo
            </button>
            <div className="dropdown-divider" />
            <button className="dropdown-item" onClick={() => setShowChangeLog(true)}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              Historial de cambios ({gis.changeLog.length})
            </button>
            <div className="dropdown-divider" />
            <button className="dropdown-item" onClick={() => setShowReport(true)}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="16" y1="13" x2="8" y2="13"/>
                <line x1="16" y1="17" x2="8" y2="17"/>
              </svg>
              Generar reporte PDF / planilla
            </button>
          </DropdownMenu>
          <span className={saveClass[proj.saveStatus]} title={proj.saveStatus === 'saved' && lastSavedAt ? `Último guardado: ${formatSaveTime(lastSavedAt)}` : undefined}>
            {saveLabel[proj.saveStatus]}
            {proj.saveStatus === 'saved' && lastSavedAt && (
              <span className="save-time">{formatSaveTime(lastSavedAt)}</span>
            )}
          </span>
          {!sync.isOnline && <span className="save-badge error">● Sin conexión</span>}
          {sync.isOnline && sync.pendingCount > 0 && (
            <span className="save-badge unsaved">
              {sync.status === 'syncing' ? '↑ Sincronizando...' : `⏳ ${sync.pendingCount} pendiente${sync.pendingCount !== 1 ? 's' : ''}`}
            </span>
          )}
          {gis.message && <span className="topbar-status">{gis.message}</span>}
          <UserMenu
            email={user?.email ?? ''}
            isSuperadmin={isSuperadmin}
            isAdmin={isAdmin}
            onAdminClick={() => setShowSuperAdmin(true)}
            onLogout={logout}
          />
        </div>
      </header>

      {/* ── Editor split ─────────────────────────────────────────────────── */}
      <div className="editor-split">

        {/* ── Map area ─────────────────────────────────────────────────── */}
        <div className="map-wrap">
          <input ref={importFileRef} type="file" accept=".kml,.kmz,.geojson,.json" style={{ display: 'none' }}
            onChange={e => { const f = e.target.files?.[0]; if (f) gis.importFile(f); e.currentTarget.value = '' }} />
          <input ref={importShpRef} type="file" accept=".zip" style={{ display: 'none' }}
            onChange={e => { const f = e.target.files?.[0]; if (f) gis.importShapefile(f); e.currentTarget.value = '' }} />

          <div ref={mapElementRef} className="map-container" />

          <FloatingMapToolbar
            activeTool={activeTool}
            hasMeasureLayer={gis.hasMeasureLayer}
            showDistanceLabels={showDistanceLabels}
            showValidation={showValidation}
            validationCount={gis.validationIssues.length}
            onDraw={handleDraw}
            onStopDraw={handleStopDraw}
            onStartMeasure={handleStartMeasure}
            onClearMeasure={gis.clearMeasure}
            onImportFile={() => importFileRef.current?.click()}
            onImportShapefile={() => importShpRef.current?.click()}
            onToggleDistanceLabels={() => setShowDistanceLabels(v => !v)}
            onToggleValidation={() => setShowValidation(v => !v)}
          />

          {fieldMode && (
            <FieldModePanel
              feature={gis.selectedFeature}
              onUpdateNotes={notes => gis.updateSelectedFeature('notes', notes)}
              onOpenSpliceCard={() => gis.setShowSpliceCard(true)}
              onOpenRack={() => gis.setShowRack(true)}
              onClose={() => gis.setSelectedFeatureId(null)}
            />
          )}

          {multiViewEnabled && proj.currentProject && (() => {
            const siblings = proj.currentProject.subProjects.filter(sp => sp.id !== proj.currentSubProjectId)
            const PALETTE = ['#6366f1','#f59e0b','#10b981','#ec4899','#8b5cf6','#14b8a6','#f97316','#06b6d4']
            return (
              <div className="mv-panel">
                <div className="mv-panel-hdr">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="3" width="9" height="9" rx="1"/><rect x="13" y="3" width="9" height="9" rx="1"/>
                    <rect x="2" y="14" width="9" height="9" rx="1"/><rect x="13" y="14" width="9" height="9" rx="1"/>
                  </svg>
                  Multi-subproyecto
                  <button className="mv-close" onClick={() => { setMultiViewEnabled(false); setHiddenSPs(new Set()) }}>✕</button>
                </div>
                <div className="mv-current-row">
                  <span className="mv-dot" style={{ background: '#3b82f6' }} />
                  <span className="mv-sp-name">{proj.currentSubProject?.name}</span>
                  <span className="mv-badge">actual</span>
                </div>
                {siblings.map((sp, idx) => {
                  const hidden = hiddenSPs.has(sp.id)
                  const color = PALETTE[idx % PALETTE.length]
                  return (
                    <label key={sp.id} className={`mv-sp-row${hidden ? ' mv-hidden' : ''}`}>
                      <input type="checkbox" checked={!hidden}
                        onChange={() => setHiddenSPs(prev => {
                          const next = new Set(prev)
                          if (hidden) next.delete(sp.id); else next.add(sp.id)
                          return next
                        })} />
                      <span className="mv-dot" style={{ background: color }} />
                      <span className="mv-sp-name">{sp.name}</span>
                      <span className="mv-count">{sp.features.length}</span>
                    </label>
                  )
                })}
              </div>
            )
          })()}

          {fiberHover && (
            <FiberHoverTooltip x={fiberHover.x} y={fiberHover.y} fromA={fiberHover.fromA} fromB={fiberHover.fromB} />
          )}

          {gis.validationOpen && (
            <ValidationToast
              issues={gis.validationIssues}
              expanded={gis.validationExpanded}
              onToggleExpanded={gis.setValidationExpanded}
              onClose={() => gis.setValidationOpen(false)}
              onSelectFeature={gis.setSelectedFeatureId}
            />
          )}
        </div>

        {/* ── Field view sidebar (tecnico / field mode) ─────────────────── */}
        {fieldMode && (
          <FieldView
            features={gis.features}
            selectedFeature={gis.selectedFeature}
            powerAlarms={powerAlarms}
            surveyMode={surveyMode}
            userEmail={user?.email ?? ''}
            onSelectFeature={gis.setSelectedFeatureId}
            onTraceOpticalPath={fiberId => gis.setOpticalPath(traceOpticalPath(fiberId, gis.features))}
            onOpenSpliceCard={() => gis.setShowSpliceCard(true)}
            onOpenRack={() => gis.setShowRack(true)}
            onUpdateNotes={notes => gis.updateSelectedFeature('notes', notes)}
            onToggleSurveyMode={() => setSurveyMode(v => !v)}
            onStartAddPole={() => setAddingPole(true)}
            onSearch={() => setShowGlobalSearch(true)}
            onGoBack={handleGoToSubProjects}
          />
        )}

        {/* ── Resize handle + collapse toggle ──────────────────────────── */}
        <div
          className={`resize-handle ${panelCollapsed ? 'resize-handle--collapsed' : ''}`}
          onMouseDown={startResize}
          title={panelCollapsed ? 'Expandir panel' : 'Arrastrar para redimensionar'}
        >
          <button
            className="panel-collapse-btn"
            onClick={togglePanel}
            title={panelCollapsed ? 'Expandir panel' : 'Colapsar panel'}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              {panelCollapsed
                ? <path d="M15 18l-6-6 6-6"/>
                : <path d="M9 18l6-6-6-6"/>}
            </svg>
          </button>
        </div>

        {/* ── Right panel ───────────────────────────────────────────────── */}
        <aside
          className={`sidebar ${panelCollapsed ? 'sidebar--collapsed' : ''}`}
          style={{ width: panelCollapsed ? 0 : panelWidth, flexShrink: 0 }}
        >
          <div className="sidebar-project-header">
            <button className="back-btn" onClick={handleGoToSubProjects}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
              {proj.currentProject?.name}
            </button>
            <h1 className="sidebar-subproject-name">{proj.currentSubProject?.name}</h1>
            {proj.currentSubProject?.location && (
              <p className="subtitle sidebar-location">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
                {proj.currentSubProject.location.displayName.split(',').slice(0, 2).join(',')}
              </p>
            )}
          </div>

          {powerAlarms.length > 0 && (
            <section className="panel-block panel-section expanded">
              <div className="panel-toggle power-alarm-header">
                <span>⚠ Alarmas de potencia ({powerAlarms.length})</span>
              </div>
              <div className="panel-content power-alarm-list">
                {powerAlarms.map(alarm => (
                  <button key={alarm.fiberId} className={`power-alarm-row ${alarm.severity}`}
                    title={`${alarm.featureName} — clic para trazar camino óptico`}
                    onClick={() => gis.setOpticalPath(traceOpticalPath(alarm.fiberId, gis.features))}>
                    <span className="power-alarm-icon">
                      {alarm.severity === 'crit'
                        ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                        : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                      }
                    </span>
                    <span className="power-alarm-info">
                      <strong>{alarm.clientName}</strong>
                      <small>{alarm.featureName} · {alarm.powerDbm.toFixed(1)} dBm</small>
                    </span>
                    <span className="power-alarm-trace" title="Ver camino óptico">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
                    </span>
                  </button>
                ))}
              </div>
            </section>
          )}

          <FeaturePanel
            feature={gis.selectedFeature}
            fiberLines={gis.features.filter(f => f.properties.featureType === 'fiber_line')}
            expanded={gis.expandedSections.properties}
            onToggle={() => gis.togglePanelSection('properties')}
            onUpdate={gis.updateSelectedFeature}
            onRemove={gis.removeSelectedFeature}
            onDuplicate={gis.duplicateSelectedFeature}
            onOpenSpliceCard={() => gis.setShowSpliceCard(true)}
            onOpenRack={() => gis.setShowRack(true)}
          />

          {gis.selectedFeatureIds.size > 0 && (
            <div className="bulk-action-bar">
              <span className="bulk-action-bar-label">{gis.selectedFeatureIds.size} seleccionados</span>
              <input type="color" defaultValue="#3b82f6" title="Cambiar color"
                onChange={e => gis.bulkSetColor(e.target.value)} />
              <select style={{ fontSize: '0.72rem', padding: '2px 4px' }}
                onChange={e => { if (e.target.value) gis.bulkSetStatus(e.target.value as any) }}
                defaultValue="">
                <option value="" disabled>Estado...</option>
                <option value="planned">Planificado</option>
                <option value="active">Activo</option>
                <option value="maintenance">Mantenimiento</option>
                <option value="damaged">Dañado</option>
              </select>
              <button className="danger compact" style={{ fontSize: '0.7rem' }} onClick={() => { if (window.confirm(`¿Eliminar ${gis.selectedFeatureIds.size} elemento${gis.selectedFeatureIds.size !== 1 ? 's' : ''}? Esta acción no se puede deshacer.`)) gis.bulkDelete() }}>Eliminar</button>
              <button className="secondary compact" style={{ fontSize: '0.7rem' }} onClick={gis.clearMultiSelection}>✕</button>
            </div>
          )}

          <FeatureList
            features={gis.features}
            selectedFeatureId={gis.selectedFeatureId}
            selectedFeatureIds={gis.selectedFeatureIds}
            expanded={gis.expandedSections.elements}
            onToggle={() => gis.togglePanelSection('elements')}
            onSelect={gis.setSelectedFeatureId}
            onToggleMulti={gis.toggleSelectFeature}
            onZoom={handleZoomToFeature}
          />
        </aside>
      </div>

      {gis.showRack && gis.selectedFeature && gis.selectedFeature.properties.featureType === 'node' && (
        <RackModal
          featureName={gis.selectedFeature.properties.name}
          rack={gis.selectedFeature.properties.rack ?? { totalUnits: 12, panels: [], connections: [] }}
          zabbixConfig={zabbixConfig}
          onChange={rack => gis.updateSelectedFeature('rack', rack)}
          onClose={() => gis.setShowRack(false)}
        />
      )}

      {gis.showSpliceCard && gis.selectedFeature &&
        (gis.selectedFeature.properties.featureType === 'splice_box' ||
         gis.selectedFeature.properties.featureType === 'nap') && (
        <SpliceCardModal
          featureId={gis.selectedFeature.properties.id}
          featureName={gis.selectedFeature.properties.name}
          projectName={proj.currentProject?.name ?? ''}
          subProjectName={proj.currentSubProject?.name ?? ''}
          spliceCard={gis.selectedFeature.properties.spliceCard ?? { cables: [], connections: [], splitters: [] }}
          allFeatures={gis.features}
          zabbixConfig={zabbixConfig}
          zabbixOltHosts={proj.currentSubProject?.zabbixOltHosts ?? []}
          onChange={card => gis.updateSelectedFeature('spliceCard', card)}
          onClose={() => gis.setShowSpliceCard(false)}
          onTraceClient={fiberId => gis.setOpticalPath(traceOpticalPath(fiberId, gis.features))}
        />
      )}

      {gis.opticalPath && (
        <OpticalPathPanel path={gis.opticalPath} onClose={() => gis.setOpticalPath(null)} />
      )}

      {showZabbixConfig && (
        <ZabbixConfigModal
          initial={zabbixConfig}
          onSaved={cfg => setZabbixConfig(cfg)}
          onClose={() => setShowZabbixConfig(false)}
        />
      )}

      {showSuperAdmin && <SuperAdminPage onClose={() => setShowSuperAdmin(false)} />}

      {showChangeLog && (
        <ChangeLogPanel entries={gis.changeLog} onClose={() => setShowChangeLog(false)} onRollback={gis.rollbackEntry} />
      )}

      {showMapExport && (
        <TitleBlockFormModal
          defaults={{
            titulo: 'Mapa de red',
            proyecto: proj.currentProject?.name ?? '',
            subProyecto: proj.currentSubProject?.name ?? '',
          }}
          onExport={handleMapExport}
          onClose={() => setShowMapExport(false)}
        />
      )}

      {showPoleForm && (
        <PoleForm
          onSave={handlePoleFormSave}
          onCancel={() => { setShowPoleForm(false); setPendingPoleCoords(null) }}
        />
      )}

      {showGlobalSearch && (
        <GlobalSearch
          projects={proj.projects}
          currentSubProjectId={proj.currentSubProjectId}
          onNavigate={handleSearchNavigate}
          onClose={() => setShowGlobalSearch(false)}
        />
      )}

      {showReport && (
        <ReportModal
          features={gis.features}
          projectName={proj.currentProject?.name ?? ''}
          subProjectName={proj.currentSubProject?.name ?? ''}
          mapElementRef={mapElementRef}
          onClose={() => setShowReport(false)}
        />
      )}

      {gis.pendingShapefile && (
        <ShapefileMapper
          columns={gis.pendingShapefile.columns}
          samples={gis.pendingShapefile.samples}
          onApply={gis.applyShapefileImport}
          onCancel={() => gis.setPendingShapefile(null)}
        />
      )}
    </div>
  )
}
