export type FeatureKind =
  | 'node' | 'splice_box' | 'nap' | 'fiber_line' | 'zone' | 'camera' | 'poste'
  | 'fiber_aerial' | 'fiber_underground' | 'manhole' | 'fdh' | 'ont'
  | 'fiber_trunk_aerial'        | 'fiber_secondary_aerial'        | 'fiber_distribution_aerial'
  | 'fiber_trunk_underground'   | 'fiber_secondary_underground'   | 'fiber_distribution_underground'

export type CableSubtype = 'adss' | 'oval'

// ── Pole / survey types ───────────────────────────────────────────────────────
export type PoleType      = 'hormigon' | 'metalico' | 'madera' | 'otro'
export type PoleCondition = 'bueno' | 'regular' | 'malo'
export type PoleAttachment = 'retencion' | 'suspension' | 'ambas'
export type PoleElement   = 'nap' | 'empalme' | 'reserva' | 'ninguno'

export type FiberColor =
  | 'blue' | 'orange' | 'green' | 'brown' | 'slate' | 'white'
  | 'red'  | 'black'  | 'yellow'| 'violet'| 'rose'  | 'aqua'

export type ClientInfo = {
  name: string
  address?: string
  phone?: string
  email?: string
  onuModel?: string
  onuSerial?: string
  onuPowerDbm?: string
  opticalDistanceM?: number  // distancia óptica OTDR/GPON desde la OLT (metros)
  oltHost?: string    // hostname Zabbix de la OLT a la que está conectado este cliente
  notes?: string
}

export type Fiber = { id: string; index: number; color: FiberColor; clientName?: string; clientInfo?: ClientInfo }

export type NapClient = {
  fiberId: string
  fiberIndex: number
  fiberColor: FiberColor
  clientName: string
  clientInfo: ClientInfo
  powerStatus: 'ok' | 'warn' | 'crit' | 'unknown'
}

export type FiberCable = {
  id: string
  name: string
  side: 'left' | 'right'
  fibers: Fiber[]
  fibersPerBuffer?: number   // fibras por tubo/buffer (default 12)
  linkedFeatureId?: string   // ID del nodo/caja/NAP en el otro extremo
  linkedLineId?: string      // ID de la fiber_line del mapa que representa este cable
}

export type SpliceConnection = {
  id: string
  leftFiberId: string
  rightFiberId: string
  active: boolean
  bendX?: number
  bendY?: number
}

export type Splitter = {
  id: string
  name: string
  ratio: number          // N in 1xN
  inputPortId: string
  outputPortIds: string[]
  posX?: number
  posY?: number
}

export type SpliceCard = {
  cables: FiberCable[]
  connections: SpliceConnection[]
  splitters: Splitter[]
}
export type FeatureStatus = 'planned' | 'active' | 'maintenance' | 'damaged'
export type OdfConnectorType = 'SC/UPC' | 'SC/APC' | 'LC/UPC' | 'LC/APC'

export type AppFeatureProperties = {
  id: string
  featureType: FeatureKind
  name: string
  code: string
  notes: string
  status: FeatureStatus
  color: string
  // Elementos activos (solo Nodo)
  oltModel?: string
  mikrotikModel?: string
  odfConnectorType?: OdfConnectorType | ''
  odfCount?: number
  batteryCount?: number
  // Carta de empalme (splice_box y nap)
  spliceCard?: SpliceCard
  // Rack (solo Nodo)
  rack?: Rack
  // Parámetros ópticos (fiber_line)
  fiberCount?: number                // cantidad de fibras del cable
  cableSubtype?: CableSubtype        // 'adss' | 'oval' para secundario y distribución
  fiberAttenuationDbPerKm?: number  // e.g. 0.35 dB/km SMF G.652
  extraLengthM?: number             // rollos de ganancia en metros
  extraLengthPositionFraction?: number  // posición del rollo a lo largo de la línea, 0=inicio 1=fin (default 0.5)
  bypassM?: number                  // cable extra por reparación/by-pass
  bypassPositionFraction?: number   // posición del bypass, 0=inicio 1=fin (default 0.5)
  // Reservas en cajas y cámaras (splice_box, nap, camera)
  reserveM?: number
  // Cámara de reserva (camera)
  linkedLineId?: string
  // Poste / relevamiento (tecnico)
  poleType?:      PoleType
  poleCondition?: PoleCondition
  poleAttachment?: PoleAttachment
  poleElement?:   PoleElement
  poleGainM?:     number           // ganancia de cable en este poste (metros)
  surveyedBy?:    string           // email del técnico que relevó
  surveyedAt?:    string           // ISO date del relevamiento
}

// ── Rack types ────────────────────────────────────────────────────────────────
export type RackPortStatus = 'free' | 'active' | 'reserved'

export type RackPort = {
  id: string
  index: number
  label: string
  status: RackPortStatus
  clientName?: string
  zabbixItemKey?: string  // item key específico de Zabbix para este puerto PON
}

export type RackPanelKind = 'odf' | 'switch' | 'olt' | 'mikrotik' | 'splitter' | 'blank'

export type RackPortGroup = {
  id: string
  label: string
  ports: RackPort[]
}

export type RackPanel = {
  id: string
  unit: number
  heightU: number
  kind: RackPanelKind
  name: string
  brand?: string               // marca del equipo (para ilustración)
  connectorType?: OdfConnectorType | ''
  portCount?: number
  ports: RackPort[]           // ODF / patch
  portGroups?: RackPortGroup[] // OLT / switch / mikrotik
  zabbixHost?: string          // hostname en Zabbix para este panel OLT
}

export type RackConnection = {
  id: string
  fromPortId: string
  toPortId: string
  active: boolean
  bendX?: number
  bendY?: number
}

export type Rack = {
  totalUnits: number
  panels: RackPanel[]
  connections: RackConnection[]
}

export type AppFeature = GeoJSON.Feature<GeoJSON.Geometry, AppFeatureProperties>
export type AppFeatureCollection = GeoJSON.FeatureCollection<GeoJSON.Geometry, AppFeatureProperties>

export type SubProjectLocation = {
  lat: number
  lng: number
  displayName: string
  city?: string
}

export type SubProject = {
  id: string
  name: string
  description: string
  createdAt: string
  updatedAt: string
  location?: SubProjectLocation
  features: AppFeature[]
  zabbixOltHosts?: string[]
  changeLog?: ChangeLogEntry[]
}

export type Project = {
  id: string
  name: string
  description: string
  createdAt: string
  updatedAt: string
  subProjects: SubProject[]
}

// ── Change log ────────────────────────────────────────────────────────────────
export type ChangeLogAction =
  | 'created' | 'updated' | 'deleted' | 'duplicated'
  | 'imported' | 'bulk_deleted' | 'cleared' | 'note_added'

export type ChangeLogEntry = {
  id: string
  ts: string            // ISO date
  userEmail: string
  action: ChangeLogAction
  featureId: string
  featureName: string
  featureType: string
  changedField?: string
  changedLabel?: string  // human-readable field name
  previousValue?: string
  newValue?: string
  // For deleted entries (enables rollback)
  snapshot?: { properties: AppFeatureProperties; geometry: GeoJSON.Geometry }
}

export type AppView = 'home' | 'subprojects' | 'editor' | 'customers' | 'monitoring'

// ── Customer Management ───────────────────────────────────────────────────────
export type CustomerStatus  = 'active' | 'suspended' | 'cancelled'
export type ServiceType     = 'residential' | 'business' | 'enterprise'
export type DocumentType    = 'DNI' | 'CUIT' | 'CUIL' | 'passport' | 'other'

export type Customer = {
  id: string
  tenantId: string
  projectId?: string
  subProjectId?: string
  featureId?: string
  name: string
  documentType?: DocumentType
  documentNumber?: string
  address?: string
  phone?: string
  email?: string
  status: CustomerStatus
  serviceType?: ServiceType
  planName?: string
  planDownMbps?: number
  planUpMbps?: number
  monthlyFee?: number
  installDate?: string
  cancelDate?: string
  cancelReason?: string
  onuModel?: string
  onuSerial?: string
  onuMac?: string
  oltHost?: string
  ponPort?: number
  opticalDistanceM?: number
  notes?: string
  createdAt: string
  updatedAt: string
}

// ── Monitoring / NMS ──────────────────────────────────────────────────────────
export type DeviceType    = 'olt' | 'switch' | 'router' | 'onu' | 'mikrotik' | 'other'
export type DeviceStatus  = 'online' | 'offline' | 'degraded' | 'unknown'
export type DeviceProtocol = 'snmp' | 'http' | 'manual'
export type AlertSeverity = 'critical' | 'warning' | 'info'
export type AlertStatus   = 'open' | 'acknowledged' | 'resolved'

export type AlertRule = {
  metricKey: string
  operator: '>' | '<' | '>=' | '<=' | '=='
  threshold: number
  severity: AlertSeverity
  message: string
}

export type MonitoringDevice = {
  id: string
  tenantId: string
  name: string
  type: DeviceType
  vendor?: string
  model?: string
  ipAddress?: string
  snmpCommunity?: string
  snmpVersion?: string
  apiUrl?: string
  apiUsername?: string
  apiPassword?: string
  apiToken?: string
  pollIntervalS?: number
  protocol: DeviceProtocol
  alertRules?: AlertRule[]
  status: DeviceStatus
  lastSeenAt?: string
  featureId?: string
  notes?: string
  createdAt: string
  updatedAt: string
}

export type MonitoringMetric = {
  id: string
  deviceId: string
  tenantId: string
  metricKey: string
  metricValue: number | null
  metricUnit?: string
  label?: string
  source: 'manual' | 'agent' | 'api'
  ts: string
}

export type MonitoringAlert = {
  id: string
  tenantId: string
  deviceId?: string
  customerId?: string
  severity: AlertSeverity
  metricKey?: string
  message: string
  status: AlertStatus
  acknowledgedBy?: string
  createdAt: string
  resolvedAt?: string
}

export type ZabbixAuthMethod = 'token' | 'credentials'

export type ZabbixConfig = {
  url: string
  apiPath?: string
  authMethod: ZabbixAuthMethod
  apiToken?: string
  username?: string
  password?: string
  ponPortItemKey: string
  onuItemKey: string
  onuSearchMethod: 'tag' | 'name' | 'host'
  onuSerialTag: string         // nombre del tag que contiene el serial, ej: "SN"
  onuBandwidthInKey?: string
  onuBandwidthOutKey?: string
}

export type NominatimResult = {
  place_id: number
  display_name: string
  lat: string
  lon: string
  type: string
}
