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
import ZabbixConfigModal from './ZabbixConfigModal'
import { loadZabbixConfig } from './zabbix'
import ShapefileMapper from './ShapefileMapper'
import DropdownMenu from './DropdownMenu'
import FeaturePanel from './FeaturePanel'
import FeatureList from './FeatureList'
import MapToolbar from './MapToolbar'
import { useSyncManager } from './useSyncManager'
import {
  defaultColors, typeLabels, featureCollection, normalizeFeature, makeProperties,
  LAYER_NAMES, type LayerName, reverseGeocode, now, collectPowerAlarms,
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

  // ── Modal map refs ────────────────────────────────────────────────────────
  const modalMapElementRef = useRef<HTMLDivElement | null>(null)
  const modalMapRef        = useRef<L.Map | null>(null)
  const modalMarkerRef     = useRef<L.Marker | null>(null)

  // ── File input refs ───────────────────────────────────────────────────────
  const importFileRef = useRef<HTMLInputElement>(null)
  const importShpRef  = useRef<HTMLInputElement>(null)

  // ── Auth ──────────────────────────────────────────────────────────────────
  const { currentTenantId, isSuperadmin, isAdmin, logout } = useAuth()

  // ── Hooks ─────────────────────────────────────────────────────────────────
  const proj = useProjects(currentTenantId)
  const gis  = useGisEditor({ mapRef, editableLayerGroupRef, currentSubProject: proj.currentSubProject })
  const sync = useSyncManager(currentTenantId)

  // ── Local UI state ────────────────────────────────────────────────────────
  const [activeLayer,      setActiveLayer]      = useState<LayerName>('OSM')
  const [zabbixConfig,     setZabbixConfig]     = useState<ZabbixConfig | null>(() => loadZabbixConfig())
  const [showZabbixConfig, setShowZabbixConfig] = useState(false)
  const [showOltManager,   setShowOltManager]   = useState(false)
  const [showValidation,   setShowValidation]   = useState(false)
  const [newOltHost,       setNewOltHost]       = useState('')
  const [showSuperAdmin,   setShowSuperAdmin]   = useState(false)

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
    gis.initialize(subProject?.features ?? [])
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

  // ── Manual save ───────────────────────────────────────────────────────────
  async function handleSaveNow() {
    if (!proj.currentProject) return
    const ok = await proj.saveNow(proj.currentProject)
    gis.setMessage(ok ? 'Proyecto guardado.' : 'Error al guardar.')
  }

  // ── OLT helpers ───────────────────────────────────────────────────────────
  function addOltHost() {
    const h = newOltHost.trim()
    if (!h) return
    const current = proj.currentSubProject?.zabbixOltHosts ?? []
    if (!current.includes(h)) proj.patchSubProjectOlts([...current, h])
    setNewOltHost('')
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

    const center: L.LatLngExpression = initialCenterRef.current
      ? [initialCenterRef.current.lat, initialCenterRef.current.lng]
      : defaultCenter

    const map = L.map(mapElementRef.current, { center, zoom: defaultZoom, zoomControl: true })

    const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 20, attribution: '&copy; OpenStreetMap',
    }).addTo(map)

    baseLayersRef.current = {
      'OSM': osm,
      'Topográfico': L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', { maxZoom: 17, attribution: '&copy; OpenTopoMap' }),
      'Google Calles': L.tileLayer('https://mt{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', { maxZoom: 22, subdomains: '0123', attribution: '&copy; Google Maps' }),
      'Google Satélite': L.tileLayer('https://mt{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', { maxZoom: 22, subdomains: '0123', attribution: '&copy; Google Maps' }),
      'Google Híbrido': L.tileLayer('https://mt{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', { maxZoom: 22, subdomains: '0123', attribution: '&copy; Google Maps' }),
      'Esri Satélite': L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: '&copy; Esri' }),
      'CartoDB Oscuro': L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { maxZoom: 20, attribution: '&copy; CartoDB' }),
    }

    editableLayerGroupRef.current  = L.featureGroup().addTo(map)
    validationGroupRef.current     = L.layerGroup().addTo(map)
    pathHighlightGroupRef.current  = L.layerGroup().addTo(map)

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
          const lenStr = lenKm >= 1 ? `${lenKm.toFixed(3)} km` : `${(lenKm * 1000).toFixed(1)} m`
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
          const lenStr = lenKm >= 1 ? `${lenKm.toFixed(3)} km` : `${(lenKm * 1000).toFixed(1)} m`
          gis.setMessage(`Midiendo: ${lenStr} — doble clic para finalizar`)
        }
      } catch { /* workingLayer may not be ready */ }
    })

    mapRef.current = map

    const feats = gis.featuresRef.current
    if (feats.length > 0) {
      const bounds = L.geoJSON(featureCollection(feats) as any).getBounds()
      if (bounds.isValid()) { map.fitBounds(bounds.pad(0.2)); return }
    }
    if (initialCenterRef.current) {
      map.setView([initialCenterRef.current.lat, initialCenterRef.current.lng], 15)
    }

    return () => {
      map.remove()
      mapRef.current = null
      editableLayerGroupRef.current = null
      validationGroupRef.current = null
      pathHighlightGroupRef.current = null
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

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    if (proj.view !== 'editor') return
    function onKeyDown(e: KeyboardEvent) {
      if (!e.ctrlKey && !e.metaKey) return
      if (e.key === 'z' && !e.shiftKey) { e.preventDefault(); gis.undo() }
      if ((e.key === 'z' && e.shiftKey) || e.key === 'y') { e.preventDefault(); gis.redo() }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [proj.view, gis.undo, gis.redo])

  // ── Modal map ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!proj.modalOpen || proj.modalMode !== 'subproject') return
    if (!modalMapElementRef.current || modalMapRef.current) return
    const map = L.map(modalMapElementRef.current, { center: defaultCenter, zoom: 6 })
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 20, attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map)
    map.on('click', async (e: L.LeafletMouseEvent) => {
      const { lat, lng } = e.latlng
      if (modalMarkerRef.current) modalMarkerRef.current.setLatLng([lat, lng])
      else modalMarkerRef.current = L.marker([lat, lng]).addTo(map)
      const displayName = await reverseGeocode(lat, lng)
      proj.setSelectedLocation({ lat, lng, displayName })
      proj.setLocationQuery('')
    })
    modalMapRef.current = map
    return () => {
      map.remove()
      modalMapRef.current = null
      modalMarkerRef.current = null
    }
  }, [proj.modalOpen, proj.modalMode]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const map = modalMapRef.current
    if (!map || !proj.selectedLocation) return
    const { lat, lng } = proj.selectedLocation
    if (modalMarkerRef.current) modalMarkerRef.current.setLatLng([lat, lng])
    else modalMarkerRef.current = L.marker([lat, lng]).addTo(map)
    map.setView([lat, lng], 13)
  }, [proj.selectedLocation])

  // ── Save status labels ────────────────────────────────────────────────────
  const saveLabel = { saved: '✓ Guardado', unsaved: '● Sin guardar', saving: '↑ Guardando...', error: '✕ Error al guardar' }
  const saveClass = { saved: 'save-badge saved', unsaved: 'save-badge unsaved', saving: 'save-badge saving', error: 'save-badge error' }

  // ── Modal JSX ─────────────────────────────────────────────────────────────
  const modalJsx = proj.modalOpen ? (
    <div className="modal-overlay" onClick={proj.closeModal}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{proj.modalMode === 'project' ? 'Nuevo proyecto' : 'Nuevo sub-proyecto'}</h2>
        </div>
        <div className="modal-body">
          <div className="form-stack">
            <label>
              Nombre
              <input
                value={proj.modalName}
                onChange={e => proj.setModalName(e.target.value)}
                placeholder={proj.modalMode === 'project' ? 'Ej: Telecom Argentina SA' : 'Ej: Córdoba Capital'}
                autoFocus
                onKeyDown={e => { if (e.key === 'Enter' && proj.modalMode === 'project') proj.submitModal() }}
              />
            </label>
            <label>
              Descripción (opcional)
              <input value={proj.modalDesc} onChange={e => proj.setModalDesc(e.target.value)} placeholder="Descripción breve..." />
            </label>
            {proj.modalMode === 'subproject' && (
              <>
                <label>
                  Buscar localidad / ciudad
                  <div className="location-search">
                    <input
                      value={proj.locationQuery}
                      onChange={e => { proj.setLocationQuery(e.target.value); proj.setLocationError('') }}
                      placeholder="Ej: Córdoba, Argentina"
                      onKeyDown={e => e.key === 'Enter' && proj.handleSearchLocation()}
                    />
                    <button type="button" className="secondary" onClick={proj.handleSearchLocation}
                      disabled={proj.locationSearching || !proj.locationQuery.trim()}>
                      {proj.locationSearching ? 'Buscando...' : 'Buscar'}
                    </button>
                  </div>
                </label>
                {proj.locationError && <p className="location-error">{proj.locationError}</p>}
                {proj.locationResults.length > 0 && !proj.selectedLocation && (
                  <div className="location-results">
                    {proj.locationResults.map(result => (
                      <button key={result.place_id} type="button" className="location-result-item"
                        onClick={() => proj.selectLocation(result)}>
                        {result.display_name}
                      </button>
                    ))}
                  </div>
                )}
                <div className="modal-map-label">O hacé clic directamente en el mapa:</div>
                <div ref={modalMapElementRef} className="modal-map" />
                {proj.selectedLocation && (
                  <div className="location-selected">
                    <span>📍 {proj.selectedLocation.displayName}</span>
                    <button type="button" className="secondary small" onClick={proj.clearSelectedLocation}>Quitar</button>
                  </div>
                )}
              </>
            )}
          </div>
          {proj.modalError && <div className="modal-error">{proj.modalError}</div>}
        </div>
        <div className="modal-footer">
          <button className="secondary" onClick={proj.closeModal} disabled={proj.modalSaving}>Cancelar</button>
          <button onClick={() => proj.submitModal(proj.selectedLocation)} disabled={!proj.modalName.trim() || proj.modalSaving}>
            {proj.modalSaving ? 'Guardando...' : 'Crear'}
          </button>
        </div>
      </div>
    </div>
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
          onAdminClick={() => setShowSuperAdmin(true)}
          onLogout={logout}
        />
        {modalJsx}
        {showSuperAdmin && <SuperAdminPage onClose={() => setShowSuperAdmin(false)} />}
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
    <div className="app-shell">
      <aside className="sidebar">
        <div style={{ paddingBottom: 12, borderBottom: '1px solid var(--border-subtle)' }}>
          <button className="back-btn" onClick={handleGoToSubProjects}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
            {proj.currentProject?.name}
          </button>
          <h1 style={{ fontSize: 'var(--text-base)', fontWeight: 700, margin: '4px 0 2px', letterSpacing: '-0.01em' }}>{proj.currentSubProject?.name}</h1>
          {proj.currentSubProject?.location && (
            <p className="subtitle" style={{ fontSize: 'var(--text-xs)' }}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
              {proj.currentSubProject.location.displayName.split(',').slice(0, 2).join(',')}
            </p>
          )}
        </div>

        <input ref={importFileRef} type="file" accept=".kml,.kmz,.geojson,.json" style={{ display: 'none' }}
          onChange={e => { const f = e.target.files?.[0]; if (f) gis.importFile(f); e.currentTarget.value = '' }} />
        <input ref={importShpRef} type="file" accept=".zip" style={{ display: 'none' }}
          onChange={e => { const f = e.target.files?.[0]; if (f) gis.importShapefile(f); e.currentTarget.value = '' }} />

        <MapToolbar
          hasMeasureLayer={gis.hasMeasureLayer}
          showValidation={showValidation}
          validationCount={gis.validationIssues.length}
          onToggleValidation={() => setShowValidation(v => !v)}
          onImportFile={() => importFileRef.current?.click()}
          onImportShapefile={() => importShpRef.current?.click()}
          onDraw={gis.activateDrawMode}
          onStartMeasure={gis.startMeasure}
          onClearMeasure={gis.clearMeasure}
          onStopDraw={gis.stopDrawing}
        />

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
                  <span className="power-alarm-icon">{alarm.severity === 'crit' ? '🔴' : '🟡'}</span>
                  <span className="power-alarm-info">
                    <strong>{alarm.clientName}</strong>
                    <small>{alarm.featureName} · {alarm.powerDbm.toFixed(1)} dBm</small>
                  </span>
                  <span className="power-alarm-trace" title="Ver camino óptico">📍</span>
                </button>
              ))}
            </div>
          </section>
        )}

        <FeaturePanel
          feature={gis.selectedFeature}
          expanded={gis.expandedSections.properties}
          onToggle={() => gis.togglePanelSection('properties')}
          onUpdate={gis.updateSelectedFeature}
          onRemove={gis.removeSelectedFeature}
          onOpenSpliceCard={() => gis.setShowSpliceCard(true)}
          onOpenRack={() => gis.setShowRack(true)}
        />

        <FeatureList
          features={gis.features}
          selectedFeatureId={gis.selectedFeatureId}
          expanded={gis.expandedSections.elements}
          onToggle={() => gis.togglePanelSection('elements')}
          onSelect={gis.setSelectedFeatureId}
        />
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumb">
            <span className="breadcrumb-link" onClick={handleGoHome}>Proyectos</span>
            <svg className="breadcrumb-sep" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6"/></svg>
            <span className="breadcrumb-link" onClick={handleGoToSubProjects}>{proj.currentProject?.name}</span>
            <svg className="breadcrumb-sep" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6"/></svg>
            <span className="breadcrumb-current">{proj.currentSubProject?.name}</span>
          </div>
          <div className="topbar-right">
            <button
              className={`secondary${zabbixConfig ? ' zabbix-configured' : ''}`}
              title={zabbixConfig ? 'Zabbix configurado — clic para editar' : 'Configurar Zabbix'}
              onClick={() => setShowZabbixConfig(true)}
              style={{ fontSize: '0.78rem', gap: 5, display: 'inline-flex', alignItems: 'center' }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
              Zabbix{zabbixConfig ? ' ✓' : ''}
            </button>
            {zabbixConfig && (
              <div style={{ position: 'relative' }}>
                <button className="secondary" onClick={() => setShowOltManager(v => !v)}
                  title="Gestionar OLTs de este subproyecto" style={{ fontSize: '0.78rem' }}>
                  🔌 OLTs ({proj.currentSubProject?.zabbixOltHosts?.length ?? 0})
                </button>
                {showOltManager && (
                  <div style={{
                    position: 'absolute', top: '110%', right: 0, zIndex: 9999,
                    background: '#0d1a2e', border: '1px solid #1e3a5f', borderRadius: 6,
                    padding: 12, minWidth: 280, boxShadow: '0 4px 20px rgba(0,0,0,0.6)',
                  }} onClick={e => e.stopPropagation()}>
                    <div style={{ fontSize: '0.78rem', color: '#60a5fa', marginBottom: 8, fontWeight: 600 }}>
                      OLTs — {proj.currentSubProject?.name}
                    </div>
                    {(proj.currentSubProject?.zabbixOltHosts ?? []).map(h => (
                      <div key={h} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                        <span style={{ flex: 1, fontSize: '0.78rem', color: '#94a3b8', fontFamily: 'monospace', background: '#060e1a', borderRadius: 3, padding: '2px 6px' }}>{h}</span>
                        <button className="danger compact" style={{ fontSize: '0.7rem', padding: '2px 6px' }} onClick={() => removeOltHost(h)}>✕</button>
                      </div>
                    ))}
                    {(proj.currentSubProject?.zabbixOltHosts?.length ?? 0) === 0 && (
                      <div style={{ fontSize: '0.75rem', color: '#475569', marginBottom: 8 }}>Sin OLTs configuradas</div>
                    )}
                    {oltHostsFromRack.filter(h => !(proj.currentSubProject?.zabbixOltHosts ?? []).includes(h)).map(h => (
                      <div key={h} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                        <span style={{ flex: 1, fontSize: '0.75rem', color: '#475569', fontFamily: 'monospace', background: '#060e1a', borderRadius: 3, padding: '2px 6px' }}>
                          {h} <span style={{ color: '#334155' }}>(rack)</span>
                        </span>
                        <button className="secondary" style={{ fontSize: '0.7rem', padding: '2px 6px' }}
                          onClick={() => { const cur = proj.currentSubProject?.zabbixOltHosts ?? []; proj.patchSubProjectOlts([...cur, h]) }}>+ Agregar</button>
                      </div>
                    ))}
                    <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
                      <input value={newOltHost} onChange={e => setNewOltHost(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && addOltHost()}
                        placeholder="Hostname OLT en Zabbix"
                        style={{ flex: 1, fontSize: '0.75rem', background: '#060e1a', border: '1px solid #1e3a5f', borderRadius: 4, padding: '3px 6px', color: '#e2e8f0' }} />
                      <button className="secondary" style={{ fontSize: '0.75rem' }} onClick={addOltHost}>+</button>
                    </div>
                    <button className="secondary" style={{ marginTop: 8, fontSize: '0.72rem', width: '100%' }} onClick={() => setShowOltManager(false)}>Cerrar</button>
                  </div>
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
              <button className="dropdown-item" onClick={gis.undo} disabled={!gis.canUndo}>↩ Deshacer Ctrl+Z</button>
              <button className="dropdown-item" onClick={gis.redo} disabled={!gis.canRedo}>↪ Rehacer Ctrl⇧Z</button>
              <div className="dropdown-divider" />
              <button className="dropdown-item" onClick={handleSaveNow} disabled={proj.saveStatus === 'saving'}>💾 Guardar ahora</button>
              <button className="dropdown-item" onClick={() => gis.exportGeoJSON(proj.currentSubProject?.name ?? '')}>⬇ Exportar GeoJSON</button>
              <button className="dropdown-item danger" onClick={gis.clearSubProject}>🗑 Limpiar todo</button>
            </DropdownMenu>
            <span className={saveClass[proj.saveStatus]}>{saveLabel[proj.saveStatus]}</span>
            {!sync.isOnline && <span className="save-badge error">● Sin conexión</span>}
            {sync.isOnline && sync.pendingCount > 0 && (
              <span className="save-badge unsaved">
                {sync.status === 'syncing' ? '↑ Sincronizando...' : `⏳ ${sync.pendingCount} pendiente${sync.pendingCount !== 1 ? 's' : ''}`}
              </span>
            )}
            <span className="topbar-status">{gis.message}</span>
            <ThemePicker />
            {(isSuperadmin || isAdmin) && (
              <button className="secondary" style={{ fontSize: '0.75rem' }} onClick={() => setShowSuperAdmin(true)} title="Gestión de usuarios">
                {isSuperadmin ? '★ Superadmin' : '◆ Admin'}
              </button>
            )}
            <button className="secondary" style={{ fontSize: '0.75rem' }} onClick={logout} title="Cerrar sesión">⎋ Salir</button>
          </div>
        </header>

        <div ref={mapElementRef} className="map-container" />

        {gis.validationIssues.length > 0 && gis.validationOpen && (
          <div className="validation-toast">
            <div className="validation-toast-header">
              <button className="validation-toast-title" onClick={() => gis.setValidationExpanded(v => !v)}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                  <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
                {gis.validationIssues.length} advertencia{gis.validationIssues.length !== 1 ? 's' : ''}
                <svg className={`vt-caret${gis.validationExpanded ? ' expanded' : ''}`} width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 9l6 6 6-6"/>
                </svg>
              </button>
              <button className="validation-toast-close" title="Cerrar" onClick={() => gis.setValidationOpen(false)}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            {gis.validationExpanded && (
              <div className="validation-toast-list">
                {gis.validationIssues.map((issue, i) => (
                  <button key={i} className={`validation-issue-row vi-${issue.severity}`}
                    onClick={() => gis.setSelectedFeatureId(issue.featureId)}
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
        )}
      </main>

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
