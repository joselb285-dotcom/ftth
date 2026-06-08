import { useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import type { AppFeature, FeatureKind, NapClient, SubProject, Project } from './types'
import { traceOpticalPath, type OpticalPath } from './OpticalPath'
import NapSheet from './NapSheet'
import SpliceSheet from './SpliceSheet'
import StatsSheet from './StatsSheet'
import { useTheme } from './useTheme'
import { FIBER_COLORS } from './fiberColors'

const defaultColors: Record<FeatureKind, string> = {
  node:       '#2563eb',
  splice_box: '#f97316',
  nap:        '#16a34a',
  fiber_line: '#dc2626'
}

const statusOpacity: Record<string, number> = {
  planned: 0.6, active: 1, maintenance: 0.8, damaged: 0.5
}

function makeIcon(featureType: FeatureKind, color: string, selected: boolean): L.DivIcon {
  const ring = selected
    ? `<circle cx="16" cy="16" r="19" fill="none" stroke="${color}" stroke-width="2.5" opacity="0.7" stroke-dasharray="4 3"/>`
    : ''

  let body = ''
  if (featureType === 'node') {
    body = `
      <rect x="4" y="5" width="24" height="22" rx="2" fill="${color}" stroke="#fff" stroke-width="1.5" opacity="0.92"/>
      <rect x="7" y="8" width="18" height="3" rx="1" fill="#fff" opacity="0.18"/>
      <rect x="7" y="13" width="18" height="3" rx="1" fill="#fff" opacity="0.18"/>
      <rect x="7" y="18" width="18" height="3" rx="1" fill="#fff" opacity="0.18"/>
      <circle cx="22" cy="9.5" r="1.2" fill="#4ade80"/>
      <circle cx="22" cy="14.5" r="1.2" fill="#4ade80"/>
      <circle cx="22" cy="19.5" r="1.2" fill="#facc15"/>`
  } else if (featureType === 'splice_box') {
    body = `
      <rect x="3" y="11" width="26" height="10" rx="5" fill="${color}" stroke="#fff" stroke-width="1.3" opacity="0.93"/>
      <rect x="12" y="11" width="3" height="10" fill="#000" opacity="0.12"/>
      <rect x="17" y="11" width="3" height="10" fill="#000" opacity="0.12"/>
      <rect x="1" y="14" width="5" height="4" rx="1.5" fill="${color}" stroke="#fff" stroke-width="1" opacity="0.9"/>
      <rect x="26" y="14" width="5" height="4" rx="1.5" fill="${color}" stroke="#fff" stroke-width="1" opacity="0.9"/>`
  } else {
    body = `
      <rect x="4" y="3" width="24" height="26" rx="3" fill="${color}" stroke="#fff" stroke-width="1.5" opacity="0.95"/>
      <rect x="4" y="3" width="24" height="8" rx="3" fill="#000" opacity="0.14"/>
      <line x1="4" y1="11" x2="28" y2="11" stroke="#fff" stroke-width="0.8" opacity="0.25"/>
      <rect x="7"  y="14" width="5" height="5" rx="1.2" fill="#fff" opacity="0.6"/>
      <rect x="14" y="14" width="5" height="5" rx="1.2" fill="#fff" opacity="0.6"/>
      <rect x="21" y="14" width="4" height="5" rx="1.2" fill="#fff" opacity="0.6"/>
      <rect x="7"  y="21" width="5" height="5" rx="1.2" fill="#fff" opacity="0.6"/>
      <rect x="14" y="21" width="5" height="5" rx="1.2" fill="#fff" opacity="0.6"/>
      <rect x="21" y="21" width="4" height="5" rx="1.2" fill="#fff" opacity="0.6"/>`
  }

  const size = featureType === 'nap' ? 36 : 32
  const anchor = size / 2
  return L.divIcon({
    className: '',
    html: `<svg width="${size}" height="${size}" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">${ring}${body}</svg>`,
    iconSize: [size, size],
    iconAnchor: [anchor, anchor],
    popupAnchor: [0, -anchor],
  })
}

export function extractNapClients(feature: AppFeature): NapClient[] {
  const sc = feature.properties.spliceCard
  if (!sc) return []
  const clients: NapClient[] = []
  for (const cable of sc.cables) {
    for (const fiber of cable.fibers) {
      if (!fiber.clientInfo && !fiber.clientName) continue
      const info = fiber.clientInfo ?? { name: fiber.clientName ?? 'Sin nombre' }
      const dbm = info.onuPowerDbm ? parseFloat(info.onuPowerDbm) : NaN
      let powerStatus: NapClient['powerStatus'] = 'unknown'
      if (!isNaN(dbm)) {
        if (dbm >= -27) powerStatus = 'ok'
        else if (dbm >= -30) powerStatus = 'warn'
        else powerStatus = 'crit'
      }
      clients.push({
        fiberId: fiber.id,
        fiberIndex: fiber.index,
        fiberColor: fiber.color,
        clientName: fiber.clientName ?? info.name,
        clientInfo: info,
        powerStatus
      })
    }
  }
  return clients
}

type ActiveNap = { feature: AppFeature; clients: NapClient[]; initialSearch?: string }

type SearchEntry = {
  napId: string
  napName: string
  napCoords: [number, number]
  feature: AppFeature
  client: NapClient
}

const POWER_LABELS: Record<NapClient['powerStatus'], string> = {
  ok: 'OK', warn: 'Bajo', crit: 'Crítico', unknown: 'Sin dato',
}

const MAPTILER_KEY = import.meta.env.VITE_MAPTILER_KEY as string | undefined

type LayerDef = { label: string; url: string; attr: string; maxZoom?: number; requiresKey: boolean }

const LAYERS: LayerDef[] = [
  {
    label: 'OSM',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attr: '&copy; OpenStreetMap contributors',
    requiresKey: false,
  },
  {
    label: 'Satélite',
    url: MAPTILER_KEY ? `https://api.maptiler.com/tiles/satellite-v2/{z}/{x}/{y}.jpg?key=${MAPTILER_KEY}` : '',
    attr: '&copy; MapTiler &copy; OpenStreetMap contributors',
    maxZoom: 20,
    requiresKey: true,
  },
  {
    label: 'Híbrido',
    url: MAPTILER_KEY ? `https://api.maptiler.com/maps/hybrid/{z}/{x}/{y}.jpg?key=${MAPTILER_KEY}` : '',
    attr: '&copy; MapTiler &copy; OpenStreetMap contributors',
    maxZoom: 20,
    requiresKey: true,
  },
]

const featureTypeIcon: Record<string, string> = {
  node:       '🖥',
  splice_box: '⬛',
  nap:        '📡',
}

export default function FieldMapView({
  project,
  subProject,
  onBack
}: {
  project: Project
  subProject: SubProject
  onBack: () => void
}) {
  const mapElRef   = useRef<HTMLDivElement | null>(null)
  const mapRef     = useRef<L.Map | null>(null)
  const baseRef    = useRef<L.TileLayer | null>(null)
  const layerGroup = useRef<L.FeatureGroup | null>(null)
  const pathGroup  = useRef<L.LayerGroup | null>(null)
  // Map feature ID → layer (for optical path highlighting)
  const layerIndex = useRef<Map<string, L.Layer>>(new Map())

  const [activeNap, setActiveNap]         = useState<ActiveNap | null>(null)
  const [activeSplice, setActiveSplice]   = useState<AppFeature | null>(null)
  const [opticalPath, setOpticalPath]     = useState<OpticalPath | null>(null)
  const [activeLayer, setActiveLayer] = useState(0)
  const [showLayers, setShowLayers]   = useState(false)
  const [locating, setLocating]       = useState(false)
  const [showPathPanel, setShowPathPanel] = useState(false)
  const [showStats, setShowStats]           = useState(false)
  const { theme, toggle: toggleTheme }      = useTheme()
  const [showSearch, setShowSearch]         = useState(false)
  const [searchQuery, setSearchQuery]       = useState('')
  const locMarkerRef = useRef<L.CircleMarker | null>(null)

  const searchIndex = useMemo<SearchEntry[]>(() => {
    const entries: SearchEntry[] = []
    for (const feat of subProject.features) {
      if (feat.properties.featureType !== 'nap') continue
      if (feat.geometry.type !== 'Point') continue
      const [lng, lat] = feat.geometry.coordinates as [number, number]
      for (const client of extractNapClients(feat)) {
        entries.push({ napId: feat.properties.id, napName: feat.properties.name, napCoords: [lat, lng], feature: feat, client })
      }
    }
    return entries
  }, [subProject.features])

  const searchResults = useMemo<SearchEntry[]>(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return []
    return searchIndex.filter(e =>
      e.client.clientName.toLowerCase().includes(q) ||
      e.client.clientInfo.address?.toLowerCase().includes(q) ||
      e.client.clientInfo.onuSerial?.toLowerCase().includes(q)
    ).slice(0, 40)
  }, [searchIndex, searchQuery])

  function handleSelectSearchResult(entry: SearchEntry) {
    setShowSearch(false)
    setSearchQuery('')
    mapRef.current?.flyTo(entry.napCoords, 18, { animate: true, duration: 0.8 })
    setActiveNap({ feature: entry.feature, clients: extractNapClients(entry.feature), initialSearch: entry.client.clientName })
  }

  // ── Map init ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (mapRef.current || !mapElRef.current) return

    const center: L.LatLngExpression = subProject.location
      ? [subProject.location.lat, subProject.location.lng]
      : [-31.4201, -64.1888]

    const map = L.map(mapElRef.current, { center, zoom: 15, zoomControl: false })

    const base = L.tileLayer(LAYERS[0].url, { maxZoom: 20, attribution: LAYERS[0].attr }).addTo(map)
    baseRef.current = base

    const group = L.featureGroup().addTo(map)
    layerGroup.current = group
    pathGroup.current  = L.layerGroup().addTo(map)

    for (const feat of subProject.features) {
      if (feat.geometry.type === 'LineString') {
        const coords = feat.geometry.coordinates.map(([lng, lat]) => [lat, lng]) as L.LatLngExpression[]
        const line = L.polyline(coords, {
          color: feat.properties.color || defaultColors[feat.properties.featureType] || '#888',
          weight: 4,
          opacity: statusOpacity[feat.properties.status] ?? 0.9,
          dashArray: feat.properties.status === 'planned' ? '8 6' : undefined
        })
        line.addTo(group)
        layerIndex.current.set(feat.properties.id, line)
        continue
      }
      if (feat.geometry.type !== 'Point') continue
      const [lng, lat] = feat.geometry.coordinates
      const icon   = makeIcon(feat.properties.featureType, feat.properties.color || defaultColors[feat.properties.featureType], false)
      const marker = L.marker([lat, lng], { icon })
      marker.on('click', () => {
        if (feat.properties.featureType === 'nap') {
          setActiveNap({ feature: feat, clients: extractNapClients(feat) })
        } else if (feat.properties.featureType === 'splice_box') {
          setActiveSplice(feat)
        }
      })
      if (feat.properties.featureType !== 'nap' && feat.properties.featureType !== 'splice_box') {
        marker.bindPopup(`
          <div style="font-family:system-ui;font-size:13px;min-width:140px">
            <strong>${feat.properties.name}</strong>
            ${feat.properties.code ? `<br/><span style="color:#64748b;font-size:11px">${feat.properties.code}</span>` : ''}
            ${feat.properties.notes ? `<br/><span style="font-size:11px;margin-top:4px;display:block">${feat.properties.notes}</span>` : ''}
          </div>
        `, { maxWidth: 220 })
      }
      marker.addTo(group)
      layerIndex.current.set(feat.properties.id, marker)
    }

    if (group.getLayers().length > 0) {
      const bounds = group.getBounds()
      if (bounds.isValid()) map.fitBounds(bounds.pad(0.15))
    }

    mapRef.current = map
    return () => {
      map.remove()
      mapRef.current = null
      layerGroup.current = null
      pathGroup.current  = null
      baseRef.current    = null
      layerIndex.current.clear()
    }
  }, [])

  // ── Optical path highlighting ───────────────────────────────────────────────
  useEffect(() => {
    const pg = pathGroup.current
    if (!pg) return
    pg.clearLayers()

    if (!opticalPath) return

    // Highlight fiber lines
    opticalPath.lineFeatureIds.forEach(lineId => {
      const layer = layerIndex.current.get(lineId)
      if (!layer) return
      const el = (layer as any)._path as SVGElement | undefined
      if (el) {
        el.style.stroke = '#f59e0b'
        el.style.strokeWidth = '6'
        el.style.strokeDasharray = '14 7'
        el.style.filter = 'drop-shadow(0 0 4px #f59e0b)'
      }
    })

    // Pulse rings + step badges on point features
    opticalPath.allFeatureIds.forEach((fid, idx) => {
      const layer = layerIndex.current.get(fid)
      if (!layer) return
      let latlng: L.LatLng | null = null
      if ((layer as any).getLatLng) latlng = (layer as any).getLatLng()
      if (!latlng) return

      const feat    = subProject.features.find(f => f.properties.id === fid)
      const isNode  = feat?.properties.featureType === 'node'
      const isLast  = idx === opticalPath.allFeatureIds.length - 1
      const ringColor = isNode ? '#3b82f6' : isLast ? '#22c55e' : '#f59e0b'

      L.circleMarker(latlng, {
        radius: 22, color: ringColor, weight: 2, opacity: 0.7,
        fillOpacity: 0, className: `path-pulse-${idx % 3}`
      }).addTo(pg)

      const icon = L.divIcon({
        className: '',
        html: `<div class="path-step-badge" style="background:${ringColor}">${isNode ? '🖥' : isLast ? '🔌' : idx + 1}</div>`,
        iconSize: [26, 26], iconAnchor: [13, 13],
      })
      L.marker(latlng, { icon, interactive: false }).addTo(pg)
    })

    // Fit map to path
    const pathPoints = opticalPath.allFeatureIds
      .map(fid => subProject.features.find(f => f.properties.id === fid))
      .filter(f => f?.geometry.type === 'Point')
      .map(f => { const [lng, lat] = (f!.geometry as GeoJSON.Point).coordinates; return L.latLng(lat, lng) })

    if (pathPoints.length >= 2) {
      mapRef.current?.fitBounds(L.latLngBounds(pathPoints).pad(0.3), { animate: true, duration: 0.8 })
    }

    return () => {
      // Restore line styles
      opticalPath.lineFeatureIds.forEach(lineId => {
        const layer = layerIndex.current.get(lineId)
        const el = (layer as any)?._path as SVGElement | undefined
        if (el) { el.style.stroke = ''; el.style.strokeWidth = ''; el.style.strokeDasharray = ''; el.style.filter = '' }
      })
    }
  }, [opticalPath])

  function handleTraceClient(fiberId: string) {
    const path = traceOpticalPath(fiberId, subProject.features)
    setOpticalPath(path)
    setShowPathPanel(true)
  }

  function clearPath() {
    setOpticalPath(null)
    setShowPathPanel(false)
  }

  function switchLayer(idx: number) {
    const map = mapRef.current
    if (!map) return
    const l = LAYERS[idx]
    if (l.requiresKey && !MAPTILER_KEY) return
    if (baseRef.current) map.removeLayer(baseRef.current)
    baseRef.current = L.tileLayer(l.url, {
      maxZoom: l.maxZoom ?? 20,
      attribution: l.attr,
    }).addTo(map)
    setActiveLayer(idx)
    setShowLayers(false)
  }

  function locateMe() {
    const map = mapRef.current
    if (!map) return
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      pos => {
        const { latitude: lat, longitude: lng } = pos.coords
        if (locMarkerRef.current) {
          locMarkerRef.current.setLatLng([lat, lng])
        } else {
          locMarkerRef.current = L.circleMarker([lat, lng], {
            radius: 8, color: '#3b82f6', fillColor: '#3b82f6', fillOpacity: 0.8, weight: 2
          }).addTo(map)
        }
        map.setView([lat, lng], 17, { animate: true })
        setLocating(false)
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  const napCount    = subProject.features.filter(f => f.properties.featureType === 'nap').length
  const clientCount = subProject.features.reduce((acc, f) => {
    if (f.properties.featureType !== 'nap' || !f.properties.spliceCard) return acc
    return acc + extractNapClients(f).length
  }, 0)

  return (
    <div className="map-screen">
      {/* Top bar */}
      <div className="map-topbar">
        <button className="btn-icon btn-icon-white" onClick={onBack}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6"/>
          </svg>
        </button>
        <div className="map-topbar-title">
          <div className="map-topbar-name">{subProject.name}</div>
          <div className="map-topbar-meta">{project.name} · {napCount} NAP · {clientCount} clientes</div>
        </div>
        {opticalPath && (
          <button className="btn-icon btn-icon-white btn-path-active" onClick={() => setShowPathPanel(v => !v)} title="Camino óptico">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="2"/>
              <path d="M4.93 4.93a10 10 0 000 14.14M19.07 4.93a10 10 0 010 14.14"/>
              <path d="M7.76 7.76a6 6 0 000 8.48M16.24 7.76a6 6 0 010 8.48"/>
            </svg>
          </button>
        )}
        <button className="btn-icon btn-icon-white" onClick={toggleTheme} title={theme === 'dark' ? 'Tema claro' : 'Tema oscuro'}>
          {theme === 'dark' ? (
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="5"/>
              <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
              <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
            </svg>
          ) : (
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
            </svg>
          )}
        </button>
        <button className="btn-icon btn-icon-white" onClick={() => setShowSearch(true)} title="Buscar cliente">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
        </button>
        <button className="btn-icon btn-icon-white" onClick={() => setShowStats(true)} title="Estadísticas">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="20" x2="18" y2="10"/>
            <line x1="12" y1="20" x2="12" y2="4"/>
            <line x1="6"  y1="20" x2="6"  y2="14"/>
          </svg>
        </button>
        <div style={{ position: 'relative' }}>
          <button className="btn-icon btn-icon-white" onClick={() => setShowLayers(v => !v)}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="12 2 2 7 12 12 22 7 12 2"/>
              <polyline points="2 17 12 22 22 17"/>
              <polyline points="2 12 12 17 22 12"/>
            </svg>
          </button>
          {showLayers && (
            <div className="layer-picker">
              {LAYERS.map((l, i) => {
                const noKey = l.requiresKey && !MAPTILER_KEY
                return (
                  <button
                    key={l.label}
                    className={`layer-option ${activeLayer === i ? 'active' : ''} ${noKey ? 'disabled' : ''}`}
                    disabled={noKey}
                    title={noKey ? 'Requiere VITE_MAPTILER_KEY' : undefined}
                    onClick={() => switchLayer(i)}
                  >
                    {l.label}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Map */}
      <div ref={mapElRef} className="map-container" />

      {/* Zoom + locate */}
      <div className="map-controls">
        <button className="map-ctrl-btn" onClick={() => mapRef.current?.zoomIn()}>+</button>
        <button className="map-ctrl-btn" onClick={() => mapRef.current?.zoomOut()}>−</button>
        <button className={`map-ctrl-btn ${locating ? 'locating' : ''}`} onClick={locateMe}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3"/>
            <path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>
          </svg>
        </button>
      </div>

      {/* Legend */}
      <div className="map-legend">
        <span className="legend-dot" style={{ background: defaultColors.nap }} /> NAP
        <span className="legend-dot" style={{ background: defaultColors.splice_box, marginLeft: 8 }} /> Empalme
        <span className="legend-dot" style={{ background: defaultColors.node, marginLeft: 8 }} /> Nodo
      </div>

      {/* Optical path panel */}
      {opticalPath && showPathPanel && (
        <div className="path-panel">
          <div className="path-panel-header">
            <div className="path-panel-title">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="2"/>
                <path d="M4.93 4.93a10 10 0 000 14.14M19.07 4.93a10 10 0 010 14.14"/>
              </svg>
              Camino óptico
              {opticalPath.clientName && <span className="path-client-name"> — {opticalPath.clientName}</span>}
            </div>
            <button className="path-panel-close" onClick={clearPath}>✕</button>
          </div>

          {opticalPath.error && (
            <div className="path-error">{opticalPath.error}</div>
          )}

          <div className="path-hops">
            {opticalPath.hops.map((hop, i) => (
              <div key={hop.featureId + i} className="path-hop">
                <div className="path-hop-icon">
                  {featureTypeIcon[hop.featureType] ?? '●'}
                </div>
                <div className="path-hop-body">
                  <div className="path-hop-name">{hop.featureName}</div>
                  {hop.inCable && (
                    <div className="path-hop-cable">
                      <span
                        className="path-fiber-dot"
                        style={{ background: FIBER_COLORS[hop.inCable.fiberColor] ?? '#94a3b8' }}
                      />
                      {hop.inCable.name} · F{hop.inCable.fiberIndex + 1}
                      {hop.outCable && hop.outCable.id !== hop.inCable.id && (
                        <> → {hop.outCable.name} · F{hop.outCable.fiberIndex + 1}</>
                      )}
                    </div>
                  )}
                  {hop.splitterName && (
                    <div className="path-hop-splitter">via {hop.splitterName}</div>
                  )}
                </div>
                <div className="path-hop-step">{i + 1}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Global client search */}
      {showSearch && (
        <div className="client-search-overlay">
          <div className="client-search-bar">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="client-search-icon">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              autoFocus
              type="search"
              className="client-search-input"
              placeholder="Buscar cliente, dirección, serial..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
            <button className="client-search-close" onClick={() => { setShowSearch(false); setSearchQuery('') }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>

          <div className="client-search-results">
            {!searchQuery.trim() && (
              <div className="state-msg">Escribí para buscar entre {searchIndex.length} cliente{searchIndex.length !== 1 ? 's' : ''}.</div>
            )}
            {searchQuery.trim() && searchResults.length === 0 && (
              <div className="state-msg">Sin resultados para "{searchQuery}".</div>
            )}
            {searchResults.map((entry, i) => (
              <button key={i} className="client-search-item" onClick={() => handleSelectSearchResult(entry)}>
                <div className="client-search-item-main">
                  <span className="client-search-item-name">{entry.client.clientName}</span>
                  <span className={`pwr-badge pwr-${entry.client.powerStatus}`}>{POWER_LABELS[entry.client.powerStatus]}</span>
                </div>
                <div className="client-search-item-meta">
                  {entry.client.clientInfo.address && <span>{entry.client.clientInfo.address} · </span>}
                  <span>{entry.napName}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* NAP Bottom Sheet */}
      {activeNap && (
        <NapSheet
          feature={activeNap.feature}
          clients={activeNap.clients}
          initialSearch={activeNap.initialSearch}
          onClose={() => setActiveNap(null)}
          onTraceClient={handleTraceClient}
          onViewSpliceCard={() => {
            const feat = activeNap.feature
            setActiveNap(null)
            setActiveSplice(feat)
          }}
        />
      )}

      {/* Splice card sheet (splice_box and nap) */}
      {activeSplice && (
        <SpliceSheet
          feature={activeSplice}
          onClose={() => setActiveSplice(null)}
          onTraceClient={fid => { setActiveSplice(null); handleTraceClient(fid) }}
        />
      )}

      {/* Stats sheet */}
      {showStats && (
        <StatsSheet subProject={subProject} onClose={() => setShowStats(false)} />
      )}
    </div>
  )
}
