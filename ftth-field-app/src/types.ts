// Subset of types from the main editor app (read-only usage)

export type FeatureKind = 'node' | 'splice_box' | 'nap' | 'fiber_line'
export type FeatureStatus = 'planned' | 'active' | 'maintenance' | 'damaged'
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
  oltHost?: string
  notes?: string
}

export type Fiber = {
  id: string
  index: number
  color: FiberColor
  clientName?: string
  clientInfo?: ClientInfo
}

export type FiberCable = {
  id: string
  name: string
  side: 'left' | 'right'
  fibers: Fiber[]
  linkedFeatureId?: string
  linkedLineId?: string
}

export type SpliceConnection = {
  id: string
  leftFiberId: string
  rightFiberId: string
  active: boolean
}

export type Splitter = {
  id: string
  name: string
  ratio: number
  inputPortId: string
  outputPortIds: string[]
}

export type SpliceCard = {
  cables: FiberCable[]
  connections: SpliceConnection[]
  splitters: Splitter[]
}

export type AppFeatureProperties = {
  id: string
  featureType: FeatureKind
  name: string
  code: string
  notes: string
  status: FeatureStatus
  color: string
  oltModel?: string
  mikrotikModel?: string
  spliceCard?: SpliceCard
}

export type AppFeature = GeoJSON.Feature<GeoJSON.Geometry, AppFeatureProperties>

export type SubProjectLocation = {
  lat: number
  lng: number
  displayName: string
}

export type SubProject = {
  id: string
  name: string
  description: string
  createdAt: string
  updatedAt: string
  location?: SubProjectLocation
  features: AppFeature[]
}

export type Project = {
  id: string
  name: string
  description: string
  createdAt: string
  updatedAt: string
  subProjects: SubProject[]
}

// Client extracted from a fiber for display
export type NapClient = {
  fiberId: string
  fiberIndex: number
  fiberColor: FiberColor
  clientName: string
  clientInfo: ClientInfo
  powerStatus: 'ok' | 'warn' | 'crit' | 'unknown'
}
