import type {
  AppFeature, AppFeatureCollection, AppFeatureProperties,
  FeatureKind, FeatureStatus, NominatimResult, OdfConnectorType, SpliceCard,
} from './types'

// ── History ───────────────────────────────────────────────────────────────────
export const HISTORY_LIMIT = 50

// ── Feature type metadata ─────────────────────────────────────────────────────
export const typeLabels: Record<FeatureKind, string> = {
  node: 'Nodo', splice_box: 'Caja de empalme', nap: 'Caja NAP',
  fiber_line: 'Línea de fibra', zone: 'Zona', camera: 'Reserva de cable',
}

export const defaultColors: Record<FeatureKind, string> = {
  node: '#2563eb', splice_box: '#f97316', nap: '#16a34a',
  fiber_line: '#dc2626', zone: '#8b5cf6', camera: '#0891b2',
}

export const statusLabels: Record<FeatureStatus, string> = {
  planned: 'Planificado', active: 'Activo',
  maintenance: 'Mantenimiento', damaged: 'Dañado',
}

export const featureTypeClass: Record<string, string> = {
  node: 'ft-node', splice_box: 'ft-splice', nap: 'ft-nap',
  fiber_line: 'ft-fiber', zone: 'ft-zone', camera: 'ft-camera',
}

export const statusClass: Record<string, string> = {
  planned: 'st-planned', active: 'st-active',
  maintenance: 'st-maintenance', damaged: 'st-damaged',
}

// ── Map layers ────────────────────────────────────────────────────────────────
export const LAYER_NAMES = [
  'OSM', 'Topográfico',
  'Google Calles', 'Google Satélite', 'Google Híbrido',
  'Esri Satélite', 'CartoDB Oscuro',
] as const
export type LayerName = typeof LAYER_NAMES[number]

// ── SVG icons ─────────────────────────────────────────────────────────────────
export const FeatureIcons: Record<string, React.ReactNode> = {
  node: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="14" rx="2"/>
      <path d="M8 21h8M12 17v4"/>
    </svg>
  ),
  splice_box: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 3v12"/><path d="M18 9a3 3 0 000-6H6"/>
      <path d="M6 15a6 6 0 0012 0"/>
    </svg>
  ),
  nap: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="2"/>
      <path d="M4.93 4.93a10 10 0 000 14.14M19.07 4.93a10 10 0 010 14.14"/>
      <path d="M7.76 7.76a6 6 0 000 8.48M16.24 7.76a6 6 0 010 8.48"/>
    </svg>
  ),
  fiber_line: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12h2M20 12h2"/>
      <path d="M6 8c0 2 2 4 6 4s6-2 6-4"/>
      <path d="M6 16c0-2 2-4 6-4s6 2 6 4"/>
    </svg>
  ),
  zone: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" fillOpacity="0.3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="3,12 8,4 16,4 21,12 16,20 8,20"/>
    </svg>
  ),
  camera: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="10" r="8"/>
      <circle cx="12" cy="10" r="5"/>
      <circle cx="12" cy="10" r="2"/>
      <line x1="12" y1="18" x2="12" y2="22"/>
    </svg>
  ),
}

// ── Utilities ─────────────────────────────────────────────────────────────────
export function makeId(): string {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export function now(): string { return new Date().toISOString() }

export function makeProperties(featureType: FeatureKind): AppFeatureProperties {
  return {
    id: makeId(),
    featureType,
    name: `${typeLabels[featureType]} ${new Date().toLocaleTimeString('es-AR')}`,
    code: '',
    notes: '',
    status: 'planned',
    color: defaultColors[featureType],
  }
}

export function normalizeFeature(feature: GeoJSON.Feature): AppFeature {
  const geometryType = feature.geometry?.type
  const featureType: FeatureKind =
    geometryType === 'LineString' ? 'fiber_line' :
    geometryType === 'Polygon'    ? 'zone'        : 'node'
  const props = feature.properties ?? {}
  return {
    type: 'Feature',
    geometry: feature.geometry as GeoJSON.Geometry,
    properties: {
      id:              String(props.id ?? makeId()),
      featureType:     (props.featureType as FeatureKind) ?? featureType,
      name:            String(props.name ?? typeLabels[featureType]),
      code:            String(props.code ?? ''),
      notes:           String(props.notes ?? ''),
      status:          (props.status as FeatureStatus) ?? 'planned',
      color:           String(props.color ?? defaultColors[featureType]),
      oltModel:        props.oltModel        ? String(props.oltModel)        : undefined,
      mikrotikModel:   props.mikrotikModel   ? String(props.mikrotikModel)   : undefined,
      odfConnectorType: props.odfConnectorType ? (props.odfConnectorType as OdfConnectorType) : undefined,
      odfCount:        props.odfCount    != null ? Number(props.odfCount)    : undefined,
      batteryCount:    props.batteryCount!= null ? Number(props.batteryCount): undefined,
      spliceCard:      props.spliceCard as SpliceCard | undefined,
      fiberAttenuationDbPerKm: props.fiberAttenuationDbPerKm != null ? Number(props.fiberAttenuationDbPerKm) : undefined,
    },
  }
}

export function featureCollection(features: AppFeature[]): AppFeatureCollection {
  return { type: 'FeatureCollection', features }
}

// ── Power alarms ──────────────────────────────────────────────────────────────
export type PowerAlarm = {
  fiberId: string
  clientName: string
  powerDbm: number
  featureId: string
  featureName: string
  severity: 'warn' | 'crit'
}

export function collectPowerAlarms(feats: AppFeature[]): PowerAlarm[] {
  const alarms: PowerAlarm[] = []
  for (const feature of feats) {
    const sc = feature.properties.spliceCard
    if (!sc) continue
    for (const cable of sc.cables) {
      for (const fiber of cable.fibers) {
        if (!fiber.clientInfo?.onuPowerDbm) continue
        const dbm = parseFloat(fiber.clientInfo.onuPowerDbm)
        if (isNaN(dbm) || dbm >= -27) continue
        alarms.push({
          fiberId: fiber.id,
          clientName: fiber.clientName || fiber.clientInfo.name || 'Cliente',
          powerDbm: dbm,
          featureId: feature.properties.id,
          featureName: feature.properties.name,
          severity: dbm < -30 ? 'crit' : 'warn',
        })
      }
    }
  }
  return alarms
}

// ── File / geo utilities ──────────────────────────────────────────────────────
export function downloadTextFile(filename: string, contents: string, mimeType: string) {
  const blob = new Blob([contents], { type: mimeType })
  const url  = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url; link.download = filename; link.click()
  URL.revokeObjectURL(url)
}

export async function geocodeLocation(query: string): Promise<NominatimResult[]> {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=6&addressdetails=0`
  const res = await fetch(url, { headers: { 'Accept-Language': 'es', 'User-Agent': 'ftth-gis-editor/1.0' } })
  if (!res.ok) throw new Error('Error al consultar el servicio de geocodificación.')
  return res.json()
}

export async function reverseGeocode(lat: number, lng: number): Promise<string> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`
    const res = await fetch(url, { headers: { 'Accept-Language': 'es', 'User-Agent': 'ftth-gis-editor/1.0' } })
    if (!res.ok) return `${lat.toFixed(5)}, ${lng.toFixed(5)}`
    const data = await res.json()
    return data.display_name ?? `${lat.toFixed(5)}, ${lng.toFixed(5)}`
  } catch { return `${lat.toFixed(5)}, ${lng.toFixed(5)}` }
}
