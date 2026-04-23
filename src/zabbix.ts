import type { ZabbixConfig } from './types'

function normalizeUrl(raw: string): string {
  const s = raw.trim().replace(/\/$/, '')
  if (/^https?:\/\//i.test(s)) return s
  return `http://${s}`
}

// On localhost the Vite dev proxy avoids CORS. In production the request
// goes directly (Zabbix must have CORS headers configured server-side).
function resolvedBase(config: ZabbixConfig): { base: string; useProxy: boolean } {
  const isLocalDev = typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
  return isLocalDev
    ? { base: '/zabbix-proxy', useProxy: true }
    : { base: normalizeUrl(config.url), useProxy: false }
}

async function rpc(config: ZabbixConfig, method: string, params: unknown, auth: string | null): Promise<unknown> {
  const { base } = resolvedBase(config)
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }

  // Zabbix 6.4+: with token, auth field must be absent from body entirely
  if (auth) headers['Authorization'] = `Bearer ${auth}`
  const payload: Record<string, unknown> = { jsonrpc: '2.0', method, params, id: 1 }
  if (config.authMethod !== 'token') payload.auth = auth  // credentials: keep auth in body
  const body = JSON.stringify(payload)

  // If user specified a path, use it directly — no fallback
  if (config.apiPath?.trim()) {
    const path = config.apiPath.trim()
    const res = await fetch(`${base}${path}`, { method: 'POST', headers, body })
    if (!res.ok) throw new Error(`HTTP ${res.status} en ${path}`)
    const data = await res.json()
    if (data.error) throw new Error(data.error.data || data.error.message)
    return data.result
  }

  // Auto-detect: try common paths
  const paths = ['/api_jsonrpc.php', '/zabbix/api_jsonrpc.php', '/zabbix/']
  let lastErr  = ''
  for (const path of paths) {
    const res = await fetch(`${base}${path}`, { method: 'POST', headers, body })
    if (res.status === 404) { lastErr = path; continue }
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    if (data.error) throw new Error(data.error.data || data.error.message)
    return data.result
  }
  throw new Error(`API Zabbix no encontrada. Todos los paths devolvieron 404 (último: ${lastErr}). Configurá el path manualmente en ⚡ Zabbix.`)
}

export async function zabbixLogin(config: ZabbixConfig): Promise<string> {
  if (config.authMethod === 'token') {
    await rpc(config, 'apiinfo.version', {}, null)
    return config.apiToken!
  }
  const result = await rpc(config, 'user.login', {
    user: config.username,
    password: config.password,
  }, null)
  return result as string
}

export async function getOltPortPower(
  config: ZabbixConfig,
  auth: string,
  zabbixHost: string,
  portIndex: number,
  specificKey?: string,
): Promise<string | null> {
  const key = specificKey ?? config.ponPortItemKey.replace('{port}', String(portIndex))
  const items = await rpc(config, 'item.get', {
    host: zabbixHost,
    search: { key_: key },
    searchWildcardsEnabled: true,
    output: ['lastvalue', 'units'],
    limit: 1,
  }, auth) as Array<{ lastvalue: string; units: string }>
  if (!items[0]) return null
  const val = items[0].lastvalue
  const units = items[0].units
  return units ? `${val} ${units}` : val
}

async function findOnuHostId(config: ZabbixConfig, auth: string, serial: string): Promise<string | null> {
  let params: Record<string, unknown>
  if (config.onuSearchMethod === 'tag') {
    params = {
      tags: [{ tag: config.onuSerialTag || 'SN', value: serial, operator: '1' }],
      output: ['hostid'],
      limit: 1,
    }
  } else {
    const searchParam: Record<string, string> = {}
    searchParam[config.onuSearchMethod === 'host' ? 'host' : 'name'] = serial
    params = { search: searchParam, output: ['hostid'], limit: 1 }
  }
  const hosts = await rpc(config, 'host.get', params, auth) as Array<{ hostid: string }>
  return hosts[0]?.hostid ?? null
}

export async function getOnuPower(
  config: ZabbixConfig,
  auth: string,
  serial: string,
): Promise<string | null> {
  const hostid = await findOnuHostId(config, auth, serial)
  if (!hostid) return null

  const items = await rpc(config, 'item.get', {
    hostids: [hostid],
    search: { key_: config.onuItemKey },
    searchWildcardsEnabled: true,
    output: ['lastvalue', 'units'],
    limit: 1,
  }, auth) as Array<{ lastvalue: string; units: string }>
  if (!items[0]) return null
  const val = items[0].lastvalue
  const units = items[0].units
  return units ? `${val} ${units}` : val
}

export type HistoryPoint = { clock: number; value: number }

export async function getOnuBandwidthHistory(
  config: ZabbixConfig,
  auth: string,
  serial: string,
  hours: number,
): Promise<{ inData: HistoryPoint[]; outData: HistoryPoint[]; unit: string } | null> {
  const hostid = await findOnuHostId(config, auth, serial)
  if (!hostid) return null

  const now  = Math.floor(Date.now() / 1000)
  const from = now - hours * 3600

  async function fetchItem(key: string | undefined) {
    if (!key?.trim()) return null
    const items = await rpc(config, 'item.get', {
      hostids: [hostid],
      search: { key_: key },
      searchWildcardsEnabled: true,
      output: ['itemid', 'value_type', 'units'],
      limit: 1,
    }, auth) as Array<{ itemid: string; value_type: string; units: string }>
    return items[0] ?? null
  }

  async function fetchHistory(item: { itemid: string; value_type: string } | null): Promise<HistoryPoint[]> {
    if (!item) return []
    const histType = item.value_type === '3' ? 3 : 0
    const data = await rpc(config, 'history.get', {
      output: 'extend',
      history: histType,
      itemids: [item.itemid],
      time_from: from,
      time_till: now,
      sortfield: 'clock',
      sortorder: 'ASC',
      limit: 500,
    }, auth) as Array<{ clock: string; value: string }>
    return data.map(d => ({ clock: Number(d.clock), value: Number(d.value) }))
  }

  const [inItem, outItem] = await Promise.all([
    fetchItem(config.onuBandwidthInKey),
    fetchItem(config.onuBandwidthOutKey),
  ])

  const [inData, outData] = await Promise.all([
    fetchHistory(inItem),
    fetchHistory(outItem),
  ])

  const unit = inItem?.units || outItem?.units || 'bps'
  return { inData, outData, unit }
}

export function loadZabbixConfig(): ZabbixConfig | null {
  try {
    const raw = localStorage.getItem('ftth_zabbix_config')
    return raw ? (JSON.parse(raw) as ZabbixConfig) : null
  } catch { return null }
}

export function saveZabbixConfig(config: ZabbixConfig): void {
  localStorage.setItem('ftth_zabbix_config', JSON.stringify(config))
}
