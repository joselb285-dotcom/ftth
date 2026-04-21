import { useState } from 'react'
import type { Project, SubProject, ZabbixConfig } from './types'
import { zabbixLogin, getOnuBandwidthHistory } from './zabbix'
import type { HistoryPoint } from './zabbix'
import BandwidthChart from './BandwidthChart'

// ── Helpers ───────────────────────────────────────────────────────────────────

function spSerials(sp: SubProject): string[] {
  const out: string[] = []
  for (const f of sp.features) {
    const card = f.properties.spliceCard
    if (!card) continue
    for (const cable of card.cables)
      for (const fiber of cable.fibers) {
        const s = fiber.clientInfo?.onuSerial?.trim()
        if (s) out.push(s)
      }
  }
  return [...new Set(out)]
}

function projSerials(p: Project): string[] {
  return [...new Set(p.subProjects.flatMap(spSerials))]
}

function aggregate(series: HistoryPoint[][], hours: number, buckets = 80): HistoryPoint[] {
  const now = Math.floor(Date.now() / 1000)
  const from = now - hours * 3600
  const step = (hours * 3600) / buckets
  return Array.from({ length: buckets }, (_, i) => {
    const t = from + i * step + step / 2
    let sum = 0
    for (const s of series) {
      if (!s.length) continue
      const idx = s.findIndex(p => p.clock > t)
      if (idx === -1)      sum += s[s.length - 1].value
      else if (idx === 0)  sum += s[0].value
      else {
        const a = s[idx - 1], b = s[idx]
        sum += a.value + ((t - a.clock) / (b.clock - a.clock)) * (b.value - a.value)
      }
    }
    return { clock: Math.round(t), value: sum }
  })
}

function lastVal(series: HistoryPoint[]): number {
  return series.length ? series[series.length - 1].value : 0
}

function formatBw(val: number): string {
  if (val >= 1e9) return `${(val / 1e9).toFixed(2)} Gbps`
  if (val >= 1e6) return `${(val / 1e6).toFixed(2)} Mbps`
  if (val >= 1e3) return `${(val / 1e3).toFixed(1)} Kbps`
  return `${Math.round(val)} bps`
}

// ── Types ─────────────────────────────────────────────────────────────────────

type SerialData = { serial: string; inData: HistoryPoint[]; outData: HistoryPoint[]; unit: string }

type ProjectResult = {
  projectId: string
  name: string
  inData: HistoryPoint[]
  outData: HistoryPoint[]
  unit: string
  clientCount: number
  subProjects: SubProjResult[]
}

type SubProjResult = {
  spId: string
  name: string
  inData: HistoryPoint[]
  outData: HistoryPoint[]
  unit: string
  clientCount: number
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  projects: Project[]
  zabbixConfig: ZabbixConfig
}

const HOUR_OPTS = [1, 6, 24, 48] as const

// ── Component ─────────────────────────────────────────────────────────────────

export default function DashTraffic({ projects, zabbixConfig }: Props) {
  const [hours, setHours]               = useState<number>(24)
  const [loading, setLoading]           = useState(false)
  const [error, setError]               = useState<string | null>(null)
  const [results, setResults]           = useState<ProjectResult[]>([])
  const [totalIn, setTotalIn]           = useState<HistoryPoint[]>([])
  const [totalOut, setTotalOut]         = useState<HistoryPoint[]>([])
  const [totalUnit, setTotalUnit]       = useState('bps')
  const [expandedId, setExpandedId]     = useState<string | null>(null)
  const [fetched, setFetched]           = useState(false)

  async function loadTraffic(h: number) {
    setLoading(true)
    setError(null)
    setFetched(false)
    try {
      const auth = await zabbixLogin(zabbixConfig)

      // Collect all unique serials across all projects
      const allSerials = [...new Set(projects.flatMap(projSerials))]
      if (!allSerials.length) {
        setError('No hay clientes con número de serie ONU registrado en los proyectos.')
        return
      }

      // Fetch bandwidth for all serials in parallel
      const fetches = await Promise.allSettled(
        allSerials.map(serial =>
          getOnuBandwidthHistory(zabbixConfig, auth, serial, h)
            .then(r => r ? { serial, ...r } as SerialData : null)
        )
      )
      const serialMap = new Map<string, SerialData>()
      for (const r of fetches) {
        if (r.status === 'fulfilled' && r.value) serialMap.set(r.value.serial, r.value)
      }

      let globalUnit = 'bps'
      const allInSeries: HistoryPoint[]  = []
      const allOutSeries: HistoryPoint[] = []

      const projResults: ProjectResult[] = projects.map(proj => {
        const pSerials = projSerials(proj)

        const spResults: SubProjResult[] = proj.subProjects.map(sp => {
          const serials = spSerials(sp)
          const data    = serials.map(s => serialMap.get(s)).filter(Boolean) as SerialData[]
          if (data[0]) globalUnit = data[0].unit
          const inAgg  = aggregate(data.map(d => d.inData), h)
          const outAgg = aggregate(data.map(d => d.outData), h)
          return {
            spId: sp.id, name: sp.name,
            inData: inAgg, outData: outAgg,
            unit: data[0]?.unit ?? 'bps',
            clientCount: data.length,
          }
        })

        const data    = pSerials.map(s => serialMap.get(s)).filter(Boolean) as SerialData[]
        const inAgg   = aggregate(data.map(d => d.inData), h)
        const outAgg  = aggregate(data.map(d => d.outData), h)

        return {
          projectId: proj.id, name: proj.name,
          inData: inAgg, outData: outAgg,
          unit: data[0]?.unit ?? 'bps',
          clientCount: data.length,
          subProjects: spResults,
        }
      })

      // Global aggregation
      const allIn  = projResults.flatMap(pr => pr.inData)
      const allOut = projResults.flatMap(pr => pr.outData)
      const gInAgg  = aggregate(projResults.map(pr => pr.inData), h)
      const gOutAgg = aggregate(projResults.map(pr => pr.outData), h)
      void allIn; void allOut; void allInSeries; void allOutSeries

      setResults(projResults)
      setTotalIn(gInAgg)
      setTotalOut(gOutAgg)
      setTotalUnit(globalUnit)
      setFetched(true)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al consultar Zabbix')
    } finally {
      setLoading(false)
    }
  }

  function toggle(id: string) {
    setExpandedId(prev => prev === id ? null : id)
  }

  const hasBwKeys = !!(zabbixConfig.onuBandwidthInKey || zabbixConfig.onuBandwidthOutKey)

  if (!hasBwKeys) {
    return (
      <div className="dash-panel dash-panel-full" style={{ marginTop: 0 }}>
        <div className="dash-panel-head">
          <div>
            <h3 className="dash-panel-title">⚡ Tráfico de red — Zabbix</h3>
            <p className="dash-panel-sub">
              Configurá los item keys de ancho de banda en ⚡ Zabbix (barra superior del editor) para activar esta sección.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="dash-panel dash-panel-full" style={{ marginTop: 0 }}>
      {/* Header */}
      <div className="dash-panel-head">
        <div>
          <h3 className="dash-panel-title">⚡ Tráfico de red — Zabbix</h3>
          <p className="dash-panel-sub">Consumo agregado por proyecto y sub-proyecto</p>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          {HOUR_OPTS.map(h => (
            <button
              key={h}
              className={`secondary small${hours === h && fetched ? ' bw-hours-active' : ''}`}
              onClick={() => { setHours(h); if (fetched) loadTraffic(h) }}
            >
              {h < 24 ? `${h}h` : `${h / 24}d`}
            </button>
          ))}
          <button
            className="dash-primary-btn"
            style={{ fontSize: '0.78rem', padding: '5px 12px' }}
            disabled={loading}
            onClick={() => loadTraffic(hours)}
          >
            {loading ? 'Consultando...' : '⚡ Consultar Zabbix'}
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div style={{ padding: '10px 16px', color: '#f87171', fontSize: '0.82rem' }}>✗ {error}</div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="dash-traffic-loading">
          <div className="dash-traffic-skeleton" />
          <p style={{ color: '#475569', fontSize: '0.8rem', marginTop: 8 }}>
            Consultando {projects.flatMap(projSerials).length} cliente(s) en Zabbix...
          </p>
        </div>
      )}

      {/* Results */}
      {fetched && !loading && (
        <>
          {/* Total traffic chart */}
          <div className="dash-traffic-section-title">Tráfico total (todos los proyectos)</div>
          <div className="dash-traffic-total-chart">
            <BandwidthChart inData={totalIn} outData={totalOut} unit={totalUnit} hours={hours} />
          </div>

          {/* Per-project grid */}
          <div className="dash-traffic-section-title" style={{ marginTop: 18 }}>
            Desglose por proyecto
          </div>
          <div className="dash-traffic-proj-grid">
            {results.map(pr => {
              const curIn  = lastVal(pr.inData)
              const curOut = lastVal(pr.outData)
              const isExp  = expandedId === pr.projectId
              return (
                <div key={pr.projectId} className={`dash-traffic-proj-card${isExp ? ' dash-proj-expanded' : ''}`}>
                  {/* Card header */}
                  <div className="dash-traffic-proj-head" onClick={() => toggle(pr.projectId)}>
                    <div className="dash-traffic-proj-name">
                      <span className="dash-traffic-expand-icon">{isExp ? '▾' : '▸'}</span>
                      {pr.name}
                    </div>
                    <div className="dash-traffic-proj-vals">
                      <span style={{ color: '#34d399' }}>↓ {formatBw(curIn)}</span>
                      <span style={{ color: '#fb923c' }}>↑ {formatBw(curOut)}</span>
                      <span style={{ color: '#475569', fontSize: '0.72rem' }}>{pr.clientCount} cliente(s)</span>
                    </div>
                  </div>

                  {/* Mini chart */}
                  <div className="dash-traffic-mini-chart">
                    <BandwidthChart inData={pr.inData} outData={pr.outData} unit={pr.unit} hours={hours} />
                  </div>

                  {/* Subproject breakdown (expandable) */}
                  {isExp && pr.subProjects.length > 0 && (
                    <div className="dash-traffic-subproj-list">
                      <div className="dash-traffic-section-title" style={{ padding: '8px 12px 4px', fontSize: '0.72rem' }}>
                        Sub-proyectos
                      </div>
                      {pr.subProjects.map(sp => {
                        const spIn  = lastVal(sp.inData)
                        const spOut = lastVal(sp.outData)
                        return (
                          <div key={sp.spId} className="dash-traffic-sp-item">
                            <div className="dash-traffic-sp-head">
                              <span className="dash-traffic-sp-name">{sp.name}</span>
                              <span style={{ color: '#34d399', fontSize: '0.75rem' }}>↓ {formatBw(spIn)}</span>
                              <span style={{ color: '#fb923c', fontSize: '0.75rem' }}>↑ {formatBw(spOut)}</span>
                              <span style={{ color: '#475569', fontSize: '0.7rem' }}>{sp.clientCount} cli.</span>
                            </div>
                            {sp.clientCount > 0 && (
                              <div className="dash-traffic-sp-chart">
                                <BandwidthChart inData={sp.inData} outData={sp.outData} unit={sp.unit} hours={hours} />
                              </div>
                            )}
                            {sp.clientCount === 0 && (
                              <p style={{ color: '#475569', fontSize: '0.75rem', padding: '4px 0' }}>
                                Sin clientes con serial registrado
                              </p>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* Idle state */}
      {!fetched && !loading && !error && (
        <div className="dash-empty-state" style={{ minHeight: 80 }}>
          Clic en "⚡ Consultar Zabbix" para cargar el tráfico de todos los proyectos
        </div>
      )}
    </div>
  )
}
