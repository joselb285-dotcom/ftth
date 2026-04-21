import type { OdfConnectorType, RackPanelKind } from './types'

export type RackTemplate = {
  id: string
  brand: string
  model: string
  kind: RackPanelKind
  description?: string
  heightU: number
  // OLT
  ponPorts?: number
  uplinkPorts?: number
  // ODF
  portCount?: number
  connectorType?: OdfConnectorType | ''
  // Switch
  switchUplink?: number
  switchAccess?: number
  // Mikrotik
  mkWan?: number
  mkLan?: number
  // Splitter panel
  splitterCount?: number
  splitterRatio?: number
}

export const RACK_TEMPLATES: RackTemplate[] = [

  // ── OLT ───────────────────────────────────────────────────────────────────
  {
    id: 'huawei-ma5608t',
    brand: 'Huawei', model: 'MA5608T',
    kind: 'olt', heightU: 2,
    ponPorts: 8, uplinkPorts: 2,
    description: '8 puertos GPON, 2 uplink GE/10GE',
  },
  {
    id: 'huawei-ma5800-x2',
    brand: 'Huawei', model: 'MA5800-X2',
    kind: 'olt', heightU: 2,
    ponPorts: 16, uplinkPorts: 4,
    description: '16 puertos GPON/XGS-PON, 4 uplink 10GE',
  },
  {
    id: 'huawei-ma5800-x7',
    brand: 'Huawei', model: 'MA5800-X7',
    kind: 'olt', heightU: 4,
    ponPorts: 16, uplinkPorts: 4,
    description: 'Chasis 7 slots, hasta 128 puertos GPON',
  },
  {
    id: 'zte-c320',
    brand: 'ZTE', model: 'C320',
    kind: 'olt', heightU: 2,
    ponPorts: 8, uplinkPorts: 2,
    description: '8 puertos GPON, 2 uplink GE',
  },
  {
    id: 'zte-c300',
    brand: 'ZTE', model: 'C300',
    kind: 'olt', heightU: 4,
    ponPorts: 16, uplinkPorts: 4,
    description: 'Chasis modular, hasta 256 puertos GPON',
  },
  {
    id: 'zte-c600',
    brand: 'ZTE', model: 'C600',
    kind: 'olt', heightU: 4,
    ponPorts: 16, uplinkPorts: 4,
    description: 'Chasis modular XGS-PON, alta densidad',
  },
  {
    id: 'fiberhome-an5506-04',
    brand: 'Fiberhome', model: 'AN5506-04-F',
    kind: 'olt', heightU: 1,
    ponPorts: 4, uplinkPorts: 2,
    description: '4 puertos GPON, 2 uplink GE, 1U compacto',
  },
  {
    id: 'fiberhome-an5516-01',
    brand: 'Fiberhome', model: 'AN5516-01',
    kind: 'olt', heightU: 2,
    ponPorts: 16, uplinkPorts: 4,
    description: '16 puertos GPON, 4 uplink 10GE',
  },
  {
    id: 'nokia-7360-fx4',
    brand: 'Nokia', model: '7360 ISAM FX-4',
    kind: 'olt', heightU: 1,
    ponPorts: 4, uplinkPorts: 2,
    description: '4 puertos XGS-PON, 2 uplink 10GE, 1U',
  },
  {
    id: 'calix-820g',
    brand: 'Calix', model: '820G',
    kind: 'olt', heightU: 1,
    ponPorts: 4, uplinkPorts: 2,
    description: '4 puertos GPON, acceso residencial',
  },
  {
    id: 'vsol-v1600d',
    brand: 'V-SOL', model: 'V1600D',
    kind: 'olt', heightU: 1,
    ponPorts: 8, uplinkPorts: 2,
    description: '8 puertos EPON/GPON, 2 uplink, económica',
  },
  {
    id: 'vsol-v1600g2',
    brand: 'V-SOL', model: 'V1600G2',
    kind: 'olt', heightU: 1,
    ponPorts: 8, uplinkPorts: 2,
    description: '8 puertos GPON combo, 2 uplink 10GE',
  },
  {
    id: 'parks-olt8',
    brand: 'Parks', model: 'OLT-8',
    kind: 'olt', heightU: 1,
    ponPorts: 8, uplinkPorts: 2,
    description: '8 puertos GPON, solución ISP Latinoamérica',
  },

  // ── Switch ────────────────────────────────────────────────────────────────
  {
    id: 'mikrotik-crs326',
    brand: 'Mikrotik', model: 'CRS326-24G-2S+',
    kind: 'switch', heightU: 1,
    switchAccess: 24, switchUplink: 2,
    description: '24 puertos GE + 2 SFP+ 10G, L3',
  },
  {
    id: 'mikrotik-css326',
    brand: 'Mikrotik', model: 'CSS326-24G-2S+',
    kind: 'switch', heightU: 1,
    switchAccess: 24, switchUplink: 2,
    description: '24 puertos GE + 2 SFP+ 10G, SwOS',
  },
  {
    id: 'mikrotik-crs354',
    brand: 'Mikrotik', model: 'CRS354-48G-4S+2Q+',
    kind: 'switch', heightU: 1,
    switchAccess: 48, switchUplink: 4,
    description: '48 puertos GE + 4 SFP+ + 2 QSFP+',
  },
  {
    id: 'cisco-sg350-28',
    brand: 'Cisco', model: 'SG350-28',
    kind: 'switch', heightU: 1,
    switchAccess: 24, switchUplink: 4,
    description: '24 puertos GE + 4 combo GE/SFP',
  },
  {
    id: 'cisco-sg350-52',
    brand: 'Cisco', model: 'SG350-52',
    kind: 'switch', heightU: 1,
    switchAccess: 48, switchUplink: 4,
    description: '48 puertos GE + 4 combo GE/SFP',
  },
  {
    id: 'tplink-sg3428',
    brand: 'TP-Link', model: 'TL-SG3428',
    kind: 'switch', heightU: 1,
    switchAccess: 24, switchUplink: 4,
    description: '24 puertos GE + 4 SFP gestionable',
  },
  {
    id: 'tplink-sg3452',
    brand: 'TP-Link', model: 'TL-SG3452',
    kind: 'switch', heightU: 1,
    switchAccess: 48, switchUplink: 4,
    description: '48 puertos GE + 4 SFP gestionable',
  },
  {
    id: 'ubiquiti-us24',
    brand: 'Ubiquiti', model: 'UniFi US-24',
    kind: 'switch', heightU: 1,
    switchAccess: 24, switchUplink: 2,
    description: '24 puertos GE + 2 SFP, administrado',
  },
  {
    id: 'ubiquiti-us48',
    brand: 'Ubiquiti', model: 'UniFi US-48',
    kind: 'switch', heightU: 1,
    switchAccess: 48, switchUplink: 4,
    description: '48 puertos GE + 4 SFP, administrado',
  },
  {
    id: 'huawei-s5735',
    brand: 'Huawei', model: 'S5735-L24T4X',
    kind: 'switch', heightU: 1,
    switchAccess: 24, switchUplink: 4,
    description: '24 puertos GE + 4 SFP+ 10G gestionable',
  },

  // ── ODF ───────────────────────────────────────────────────────────────────
  {
    id: 'odf-12-scapc-1u',
    brand: 'Genérico', model: 'ODF 12p SC/APC',
    kind: 'odf', heightU: 1,
    portCount: 12, connectorType: 'SC/APC',
    description: '12 puertos SC/APC, 1U',
  },
  {
    id: 'odf-24-scapc-1u',
    brand: 'Genérico', model: 'ODF 24p SC/APC',
    kind: 'odf', heightU: 1,
    portCount: 24, connectorType: 'SC/APC',
    description: '24 puertos SC/APC, 1U',
  },
  {
    id: 'odf-48-scapc-2u',
    brand: 'Genérico', model: 'ODF 48p SC/APC',
    kind: 'odf', heightU: 2,
    portCount: 48, connectorType: 'SC/APC',
    description: '48 puertos SC/APC, 2U',
  },
  {
    id: 'odf-96-scapc-4u',
    brand: 'Genérico', model: 'ODF 96p SC/APC',
    kind: 'odf', heightU: 4,
    portCount: 96, connectorType: 'SC/APC',
    description: '96 puertos SC/APC, 4U',
  },
  {
    id: 'odf-12-scupc-1u',
    brand: 'Genérico', model: 'ODF 12p SC/UPC',
    kind: 'odf', heightU: 1,
    portCount: 12, connectorType: 'SC/UPC',
    description: '12 puertos SC/UPC, 1U',
  },
  {
    id: 'odf-24-scupc-1u',
    brand: 'Genérico', model: 'ODF 24p SC/UPC',
    kind: 'odf', heightU: 1,
    portCount: 24, connectorType: 'SC/UPC',
    description: '24 puertos SC/UPC, 1U',
  },
  {
    id: 'odf-12-lcapc-1u',
    brand: 'Genérico', model: 'ODF 12p LC/APC',
    kind: 'odf', heightU: 1,
    portCount: 12, connectorType: 'LC/APC',
    description: '12 puertos LC/APC, 1U',
  },
  {
    id: 'odf-24-lcapc-1u',
    brand: 'Genérico', model: 'ODF 24p LC/APC',
    kind: 'odf', heightU: 1,
    portCount: 24, connectorType: 'LC/APC',
    description: '24 puertos LC/APC, 1U',
  },
  {
    id: 'odf-24-lcupc-1u',
    brand: 'Genérico', model: 'ODF 24p LC/UPC',
    kind: 'odf', heightU: 1,
    portCount: 24, connectorType: 'LC/UPC',
    description: '24 puertos LC/UPC, 1U',
  },

  // ── Mikrotik (router) ─────────────────────────────────────────────────────
  {
    id: 'mikrotik-rb4011',
    brand: 'Mikrotik', model: 'RB4011iGS+',
    kind: 'mikrotik', heightU: 1,
    mkWan: 1, mkLan: 10,
    description: '1 SFP+ + 10 puertos GE, RouterOS L5',
  },
  {
    id: 'mikrotik-rb3011',
    brand: 'Mikrotik', model: 'RB3011UiAS',
    kind: 'mikrotik', heightU: 1,
    mkWan: 1, mkLan: 10,
    description: '10 puertos GE + 1 SFP, RouterOS L5',
  },
  {
    id: 'mikrotik-ccr1036',
    brand: 'Mikrotik', model: 'CCR1036-8G-2S+',
    kind: 'mikrotik', heightU: 1,
    mkWan: 2, mkLan: 8,
    description: '8 puertos GE + 2 SFP+ 10G, CCR',
  },
  {
    id: 'mikrotik-ccr2004',
    brand: 'Mikrotik', model: 'CCR2004-1G-12S+2XS',
    kind: 'mikrotik', heightU: 1,
    mkWan: 2, mkLan: 12,
    description: '12 SFP+ + 2 SFP28 25G, núcleo de red',
  },
  {
    id: 'mikrotik-rb1100',
    brand: 'Mikrotik', model: 'RB1100AHx4',
    kind: 'mikrotik', heightU: 1,
    mkWan: 2, mkLan: 11,
    description: '13 puertos GE, RouterOS L6',
  },
  {
    id: 'cisco-isr4321',
    brand: 'Cisco', model: 'ISR 4321',
    kind: 'mikrotik', heightU: 1,
    mkWan: 2, mkLan: 4,
    description: '2 WAN GE + módulos LAN, router empresarial',
  },

  // ── Splitter panels ───────────────────────────────────────────────────────
  {
    id: 'splitter-panel-4x8',
    brand: 'Genérico', model: 'Panel Splitter 4×1:8',
    kind: 'splitter', heightU: 1,
    splitterCount: 4, splitterRatio: 8,  // 1:8 = 8 outputs
    description: '4 splitters 1:8, 32 salidas totales, 1U',
  },
  {
    id: 'splitter-panel-8x4',
    brand: 'Genérico', model: 'Panel Splitter 8×1:4',
    kind: 'splitter', heightU: 1,
    splitterCount: 8, splitterRatio: 4,
    description: '8 splitters 1:4, 32 salidas totales, 1U',
  },
  {
    id: 'splitter-panel-16x2',
    brand: 'Genérico', model: 'Panel Splitter 16×1:2',
    kind: 'splitter', heightU: 1,
    splitterCount: 16, splitterRatio: 2,
    description: '16 splitters 1:2, 32 salidas totales, 1U',
  },
  {
    id: 'splitter-panel-2x8',
    brand: 'Genérico', model: 'Panel Splitter 2×1:8',
    kind: 'splitter', heightU: 1,
    splitterCount: 2, splitterRatio: 8,
    description: '2 splitters 1:8, 16 salidas totales, 1U',
  },
]

export function templatesByKind(kind: RackPanelKind): RackTemplate[] {
  return RACK_TEMPLATES.filter(t => t.kind === kind)
}

export const TEMPLATE_BRANDS: Record<RackPanelKind, string[]> = {
  olt:      ['Huawei', 'ZTE', 'Fiberhome', 'Nokia', 'Calix', 'V-SOL', 'Parks'],
  switch:   ['Mikrotik', 'Cisco', 'TP-Link', 'Ubiquiti', 'Huawei'],
  odf:      ['Genérico'],
  mikrotik: ['Mikrotik', 'Cisco'],
  splitter: ['Genérico'],
  blank:    [],
}
