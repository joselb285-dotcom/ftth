import type {
  AppFeature, AppFeatureCollection, AppFeatureProperties,
  FeatureKind, FeatureStatus, NominatimResult, OdfConnectorType, SpliceCard, NapClient,
} from './types'
import { FtthIcon } from './FtthIcons'

// ── History ───────────────────────────────────────────────────────────────────
export const HISTORY_LIMIT = 50

// ── Feature type metadata ─────────────────────────────────────────────────────
export const typeLabels: Record<FeatureKind, string> = {
  node: 'Nodo / ODF', splice_box: 'Caja de empalme', nap: 'Caja NAP/FAT',
  fiber_line: 'Fibra SMF', zone: 'Zona', camera: 'Reserva de cable',
  poste: 'Poste ADSS',
  fiber_aerial: 'Fibra aérea', fiber_underground: 'Fibra subterránea',
  manhole: 'Cámara subterránea', fdh: 'FDH / Hub', ont: 'ONT / Terminal',
}

export const defaultColors: Record<FeatureKind, string> = {
  node: '#2563eb', splice_box: '#f97316', nap: '#16a34a',
  fiber_line: '#1d4ed8', zone: '#8b5cf6', camera: '#0891b2',
  poste: '#d97706',
  fiber_aerial: '#15803d', fiber_underground: '#92400e',
  manhole: '#7c3aed', fdh: '#0e7490', ont: '#be185d',
}

export const statusLabels: Record<FeatureStatus, string> = {
  planned: 'Planificado', active: 'Activo',
  maintenance: 'Mantenimiento', damaged: 'Dañado',
}

export const featureTypeClass: Record<string, string> = {
  node: 'ft-node', splice_box: 'ft-splice', nap: 'ft-nap',
  fiber_line: 'ft-fiber', zone: 'ft-zone', camera: 'ft-camera',
  poste: 'ft-poste',
  fiber_aerial: 'ft-fiber-aerial', fiber_underground: 'ft-fiber-underground',
  manhole: 'ft-manhole', fdh: 'ft-fdh', ont: 'ft-ont',
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

// ── SVG icons — FTTH passive element symbols (ITU-T G.671 / G.984) ────────────
export const FeatureIcons: Record<string, React.ReactNode> = {
  node:               <FtthIcon id="odf"              size={13} />,
  splice_box:         <FtthIcon id="splice_closure"   size={13} />,
  nap:                <FtthIcon id="nap_fat"           size={13} />,
  fiber_line:         <FtthIcon id="cable_smf"         size={13} />,
  fiber_aerial:       <FtthIcon id="cable_aerial"      size={13} />,
  fiber_underground:  <FtthIcon id="cable_underground" size={13} />,
  manhole:            <FtthIcon id="manhole"           size={13} />,
  fdh:                <FtthIcon id="fdh"               size={13} />,
  ont:                <FtthIcon id="ont"               size={13} />,
  camera:             <FtthIcon id="cable_smf"         size={13} />,
  poste:              <FtthIcon id="pole"              size={13} />,
  zone: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" fillOpacity="0.3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="3,12 8,4 16,4 21,12 16,20 8,20"/>
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

// ── Extrae clientes de una NAP/empalme para uso en NapSheet / StatsSheet ──────
export function extractNapClients(feature: AppFeature): NapClient[] {
  const sc = feature.properties.spliceCard
  if (!sc) return []
  const clients: NapClient[] = []
  for (const cable of sc.cables) {
    for (const fiber of cable.fibers) {
      if (!fiber.clientInfo && !fiber.clientName) continue
      const info = fiber.clientInfo ?? { name: fiber.clientName ?? 'Sin nombre' }
      const dbm  = info.onuPowerDbm ? parseFloat(info.onuPowerDbm) : NaN
      let powerStatus: NapClient['powerStatus'] = 'unknown'
      if (!isNaN(dbm)) {
        if (dbm >= -27) powerStatus = 'ok'
        else if (dbm >= -30) powerStatus = 'warn'
        else powerStatus = 'crit'
      }
      clients.push({
        fiberId:    fiber.id,
        fiberIndex: fiber.index,
        fiberColor: fiber.color,
        clientName: fiber.clientName ?? info.name,
        clientInfo: info,
        powerStatus,
      })
    }
  }
  return clients
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

export async function reverseGeocode(lat: number, lng: number): Promise<{ displayName: string; city: string }> {
  const fallback = { displayName: `${lat.toFixed(5)}, ${lng.toFixed(5)}`, city: '' }
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1`
    const res = await fetch(url, { headers: { 'Accept-Language': 'es', 'User-Agent': 'ftth-gis-editor/1.0' } })
    if (!res.ok) return fallback
    const data = await res.json()
    const addr = data.address ?? {}
    const city = addr.city ?? addr.town ?? addr.village ?? addr.municipality ?? addr.suburb ?? ''
    return { displayName: data.display_name ?? fallback.displayName, city }
  } catch { return fallback }
}
