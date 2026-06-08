import React from 'react'

// ── FTTH Passive Element Icons — ITU-T G.671 / G.984 / ANSI/TIA-568 ────────────
// Normalized to viewBox="0 0 24 24" for consistent rendering at any size.

export interface FtthIconDef {
  label: string
  code: string
  norm: string
  category: 'cable' | 'connector' | 'enclosure' | 'splitter' | 'filter' | 'civil'
  svg: React.ReactElement
}

const ic = (content: React.ReactElement, vb = '0 0 24 24') => (
  <svg viewBox={vb} fill="none" stroke="currentColor" strokeWidth="1.5"
    strokeLinecap="round" strokeLinejoin="round" style={{ width: '100%', height: '100%' }}>
    {content}
  </svg>
)

// ── Cables ────────────────────────────────────────────────────────────────────
const CableSMF = ic(<>
  <line x1="1" y1="12" x2="23" y2="12" />
  <text x="12" y="8" textAnchor="middle" fontSize="4" stroke="none" fill="currentColor" fontFamily="monospace">SMF·OS2</text>
</>)

const CableMMF = ic(<>
  <line x1="1" y1="12" x2="23" y2="12" strokeWidth="2" />
  <text x="12" y="8" textAnchor="middle" fontSize="4" stroke="none" fill="currentColor" fontFamily="monospace">MMF·OM4</text>
</>)

const CableUnderground = ic(<>
  <line x1="1" y1="10" x2="23" y2="10" strokeDasharray="4,2" />
  <path d="M1 16 Q4 12 7 16 Q10 20 13 16 Q16 12 19 16 Q22 20 23 16" strokeWidth="1" />
</>)

const CableAerial = ic(<>
  <line x1="1" y1="16" x2="23" y2="16" />
  <path d="M2 16 Q5 10 8 16" strokeWidth="1" />
  <path d="M10 16 Q13 10 16 16" strokeWidth="1" />
  <path d="M18 16 Q21 10 24 16" strokeWidth="1" />
  <text x="12" y="8" textAnchor="middle" fontSize="4" stroke="none" fill="currentColor" fontFamily="monospace">ADSS</text>
</>)

// ── Connectors & Splices ──────────────────────────────────────────────────────
const ConnectorSC = ic(<>
  <line x1="1" y1="12" x2="7" y2="12" />
  <rect x="7" y="8" width="4" height="8" rx="1" />
  <rect x="13" y="8" width="4" height="8" rx="1" />
  <line x1="11" y1="12" x2="13" y2="12" strokeDasharray="1.5,1.5" />
  <line x1="17" y1="12" x2="23" y2="12" />
</>)

const ConnectorLC = ic(<>
  <line x1="1" y1="12" x2="8" y2="12" />
  <rect x="8" y="9" width="3" height="6" rx="1" />
  <rect x="13" y="9" width="3" height="6" rx="1" />
  <line x1="11" y1="12" x2="13" y2="12" strokeDasharray="1.5,1.5" />
  <line x1="16" y1="12" x2="23" y2="12" />
</>)

const SpliceFusion = ic(<>
  <line x1="1" y1="12" x2="8" y2="12" />
  <line x1="16" y1="12" x2="23" y2="12" />
  <circle cx="12" cy="12" r="4" />
  <line x1="9" y1="9" x2="15" y2="15" />
  <line x1="15" y1="9" x2="9" y2="15" />
</>)

const SpliceMechanical = ic(<>
  <line x1="1" y1="12" x2="8" y2="12" />
  <line x1="16" y1="12" x2="23" y2="12" />
  <polygon points="12,7 16,12 12,17 8,12" />
</>)

const ConnectorFC = ic(<>
  <line x1="1" y1="12" x2="7" y2="12" />
  <rect x="7" y="7" width="12" height="10" rx="2" />
  <circle cx="15" cy="12" r="3" />
  <text x="10" y="14" textAnchor="middle" fontSize="5" stroke="none" fill="currentColor" fontFamily="monospace">FC</text>
</>)

const Pigtail = ic(<>
  <line x1="1" y1="12" x2="8" y2="12" />
  <line x1="8" y1="7" x2="8" y2="17" />
  <line x1="8" y1="7" x2="17" y2="12" />
  <line x1="8" y1="17" x2="17" y2="12" />
  <line x1="17" y1="12" x2="23" y2="12" />
</>)

// ── Enclosures ────────────────────────────────────────────────────────────────
const ODF = ic(<>
  <rect x="2" y="5" width="20" height="14" rx="2" />
  <rect x="4" y="7" width="16" height="10" rx="1" />
  <text x="12" y="15" textAnchor="middle" fontSize="5.5" stroke="none" fill="currentColor" fontFamily="monospace" fontWeight="bold">ODF</text>
  <circle cx="6" cy="9" r="1" fill="currentColor" opacity=".7" />
  <circle cx="9" cy="9" r="1" fill="currentColor" opacity=".7" />
  <circle cx="12" cy="9" r="1" fill="currentColor" opacity=".7" />
</>)

const FDH = ic(<>
  <rect x="2" y="6" width="18" height="12" rx="2" />
  <text x="11" y="14.5" textAnchor="middle" fontSize="5" stroke="none" fill="currentColor" fontFamily="monospace" fontWeight="bold">FDH</text>
  <line x1="0" y1="10" x2="2" y2="10" />
  <line x1="20" y1="9"  x2="24" y2="9"  strokeWidth="1" />
  <line x1="20" y1="12" x2="24" y2="12" strokeWidth="1" />
  <line x1="20" y1="15" x2="24" y2="15" strokeWidth="1" />
</>)

const SpliceClosure = ic(<>
  <ellipse cx="12" cy="12" rx="10" ry="6" />
  <line x1="2" y1="12" x2="0" y2="12" />
  <line x1="22" y1="12" x2="24" y2="12" />
  <text x="12" y="10" textAnchor="middle" fontSize="3.5" stroke="none" fill="currentColor" fontFamily="monospace">MANGA</text>
  <text x="12" y="14.5" textAnchor="middle" fontSize="3.5" stroke="none" fill="currentColor" fontFamily="monospace">Closure</text>
</>)

const NapFat = ic(<>
  <rect x="4" y="6" width="16" height="12" rx="2" />
  <text x="12" y="12" textAnchor="middle" fontSize="4" stroke="none" fill="currentColor" fontFamily="monospace">NAP</text>
  <text x="12" y="16" textAnchor="middle" fontSize="3.5" stroke="none" fill="currentColor" fontFamily="monospace">FAT</text>
  <line x1="20" y1="9"  x2="24" y2="9"  strokeWidth="1" />
  <line x1="20" y1="12" x2="24" y2="12" strokeWidth="1" />
  <line x1="20" y1="15" x2="24" y2="15" strokeWidth="1" />
</>)

// ── Splitters ─────────────────────────────────────────────────────────────────
const Splitter1x2 = ic(<>
  <line x1="1" y1="12" x2="7" y2="12" />
  <polygon points="7,5 17,12 7,19" />
  <line x1="17" y1="9"  x2="23" y2="9" />
  <line x1="17" y1="15" x2="23" y2="15" />
  <text x="19" y="5" textAnchor="middle" fontSize="4" stroke="none" fill="currentColor" fontFamily="monospace">1:2</text>
</>)

const Splitter1x4 = ic(<>
  <line x1="1" y1="12" x2="7" y2="12" />
  <polygon points="7,4 17,12 7,20" />
  <line x1="17" y1="6"  x2="23" y2="6" />
  <line x1="17" y1="10" x2="23" y2="10" />
  <line x1="17" y1="14" x2="23" y2="14" />
  <line x1="17" y1="18" x2="23" y2="18" />
  <text x="19" y="3" textAnchor="middle" fontSize="4" stroke="none" fill="currentColor" fontFamily="monospace">1:4</text>
</>)

const Splitter1x8 = ic(<>
  <line x1="1" y1="12" x2="7" y2="12" />
  <polygon points="7,3 17,12 7,21" />
  {[4,6,8,10,12,14,16,18].map(y => (
    <line key={y} x1="17" y1={y} x2="23" y2={y} strokeWidth="0.8" />
  ))}
  <text x="20" y="2.5" textAnchor="middle" fontSize="3.5" stroke="none" fill="currentColor" fontFamily="monospace">1:8</text>
</>)

const Splitter1x16 = ic(<>
  <line x1="1" y1="12" x2="7" y2="12" />
  <polygon points="7,2 17,12 7,22" />
  {[3,4.5,6,7.5,9,10.5,12,13.5,15,16.5,18,19.5,21].map(y => (
    <line key={y} x1="17" y1={y} x2="23" y2={y} strokeWidth="0.6" />
  ))}
  <text x="20" y="2" textAnchor="middle" fontSize="3.5" stroke="none" fill="currentColor" fontFamily="monospace">1:16</text>
</>)

const Splitter1x32 = ic(<>
  <line x1="1" y1="12" x2="7" y2="12" />
  <polygon points="7,2 17,12 7,22" />
  {[2.5,3.5,4.5,5.5,6.5,7.5,8.5,9.5,10.5,11.5,12.5,13.5,14.5,15.5,16.5,17.5,18.5,19.5,20.5,21.5].map(y => (
    <line key={y} x1="17" y1={y} x2="23" y2={y} strokeWidth="0.5" />
  ))}
  <text x="20" y="2" textAnchor="middle" fontSize="3" stroke="none" fill="currentColor" fontFamily="monospace">1:32</text>
</>)

// ── Filters & Couplers ────────────────────────────────────────────────────────
const WDM = ic(<>
  <line x1="1" y1="12" x2="7" y2="12" />
  <line x1="17" y1="12" x2="23" y2="12" />
  <polygon points="12,6 17,12 12,18 7,12" />
  <text x="12" y="13.5" textAnchor="middle" fontSize="4" stroke="none" fill="currentColor" fontFamily="monospace">WDM</text>
  <line x1="12" y1="18" x2="12" y2="22" strokeDasharray="2,1.5" />
</>)

const Attenuator = ic(<>
  <line x1="1" y1="12" x2="7" y2="12" />
  <line x1="17" y1="12" x2="23" y2="12" />
  <circle cx="12" cy="12" r="5" />
  <text x="12" y="11" textAnchor="middle" fontSize="4" stroke="none" fill="currentColor" fontFamily="monospace">ATT</text>
  <text x="12" y="15" textAnchor="middle" fontSize="3.5" stroke="none" fill="currentColor" fontFamily="monospace">-dB</text>
</>)

const OpticalFilter = ic(<>
  <line x1="1" y1="12" x2="7" y2="12" />
  <line x1="17" y1="12" x2="23" y2="12" />
  <rect x="7" y="7" width="10" height="10" rx="2" />
  <text x="12" y="11.5" textAnchor="middle" fontSize="4" stroke="none" fill="currentColor" fontFamily="monospace">FLT</text>
  <text x="12" y="15.5" textAnchor="middle" fontSize="3" stroke="none" fill="currentColor" fontFamily="monospace">λ sel.</text>
</>)

const Circulator = ic(<>
  <line x1="1" y1="12" x2="6" y2="12" />
  <line x1="18" y1="12" x2="23" y2="12" />
  <circle cx="12" cy="12" r="6" />
  <path d="M 7 7 A 7 7 0 1 1 7 17" />
  <path d="M 7 17 L 5 14 M 7 17 L 10 17" strokeWidth="1.2" />
</>)

const Coupler2x2 = ic(<>
  <line x1="1" y1="9"  x2="7" y2="9" />
  <line x1="1" y1="15" x2="7" y2="15" />
  <circle cx="12" cy="12" r="5" />
  <text x="12" y="13.5" textAnchor="middle" fontSize="4" stroke="none" fill="currentColor" fontFamily="monospace">2×2</text>
  <line x1="17" y1="9"  x2="23" y2="9" />
  <line x1="17" y1="15" x2="23" y2="15" />
</>)

// ── Civil & User ──────────────────────────────────────────────────────────────
const Pole = ic(<>
  <line x1="12" y1="2" x2="12" y2="22" strokeWidth="2" />
  <line x1="5" y1="6" x2="19" y2="6" />
  <path d="M5 6 Q9 10 12 8" strokeWidth="1" strokeDasharray="2,1.5" />
  <path d="M19 6 Q15 10 12 8" strokeWidth="1" strokeDasharray="2,1.5" />
</>)

const HandholeManhole = ic(<>
  <rect x="2" y="8" width="20" height="14" rx="2" strokeDasharray="4,2" />
  <text x="12" y="17" textAnchor="middle" fontSize="5" stroke="none" fill="currentColor" fontFamily="monospace">CM</text>
  <rect x="7" y="4" width="10" height="5" rx="1" />
</>)

const ONT = ic(<>
  <rect x="2" y="6" width="20" height="12" rx="2" />
  <rect x="4" y="8" width="16" height="8" rx="1" />
  <text x="12" y="14.5" textAnchor="middle" fontSize="5.5" stroke="none" fill="currentColor" fontFamily="monospace" fontWeight="bold">ONT</text>
  <circle cx="5" cy="10" r="1" fill="#00ff88" stroke="none" />
  <circle cx="8" cy="10" r="1" fill="#ffcc00" stroke="none" />
  <circle cx="11" cy="10" r="1" fill="#00ff88" stroke="none" />
</>)

const OpticalRosette = ic(<>
  <rect x="5" y="5" width="14" height="14" rx="4" />
  <circle cx="12" cy="12" r="4" />
  <circle cx="12" cy="12" r="1.5" fill="currentColor" />
  <line x1="1" y1="12" x2="5" y2="12" />
</>)

const IndoorDistributionBox = ic(<>
  <rect x="1" y="7" width="12" height="10" rx="2" />
  <text x="7" y="13.5" textAnchor="middle" fontSize="4" stroke="none" fill="currentColor" fontFamily="monospace">ODF</text>
  <rect x="15" y="7" width="8" height="10" rx="2" />
  <text x="19" y="13.5" textAnchor="middle" fontSize="3.5" stroke="none" fill="currentColor" fontFamily="monospace">FDC</text>
  <line x1="13" y1="12" x2="15" y2="12" />
</>)

// ── Exported library ──────────────────────────────────────────────────────────
export const FTTH_ICONS: Record<string, FtthIconDef> = {
  // Cables
  cable_smf:         { label: 'Cable Monomodo',         code: 'SMF / OS2',       norm: 'Color convencional: Amarillo', category: 'cable',     svg: CableSMF },
  cable_mmf:         { label: 'Cable Multimodo',         code: 'MMF / OM3·OM4',   norm: 'Color: Naranja / Aqua',        category: 'cable',     svg: CableMMF },
  cable_underground: { label: 'Cable Subterráneo',       code: 'Underground',     norm: 'Línea punteada + tierra',      category: 'cable',     svg: CableUnderground },
  cable_aerial:      { label: 'Cable Aéreo',             code: 'ADSS · Figure-8', norm: 'Arcos sobre la línea',         category: 'cable',     svg: CableAerial },
  // Connectors & splices
  conn_sc:           { label: 'Conector SC',             code: '[ SC ]—[ SC ]',   norm: 'Más usado en FTTH',            category: 'connector', svg: ConnectorSC },
  conn_lc:           { label: 'Conector LC',             code: '[ LC ]—[ LC ]',   norm: 'Equipos activos',              category: 'connector', svg: ConnectorLC },
  splice_fusion:     { label: 'Empalme por Fusión',      code: '—⊗—',             norm: 'Splicing point',               category: 'connector', svg: SpliceFusion },
  splice_mechanical: { label: 'Empalme Mecánico',        code: '—◇—',             norm: 'Mechanical splice',            category: 'connector', svg: SpliceMechanical },
  conn_fc:           { label: 'Conector FC',             code: '[ FC ]',          norm: 'Instrumentos de medición',     category: 'connector', svg: ConnectorFC },
  pigtail:           { label: 'Pigtail',                 code: '──[ conector',    norm: 'Cola de cerdo',                category: 'connector', svg: Pigtail },
  // Enclosures
  odf:               { label: 'ODF',                     code: 'Optical Dist. Frame', norm: 'Nodo central',             category: 'enclosure', svg: ODF },
  fdh:               { label: 'FDH / Hub',               code: 'Fiber Dist. Hub', norm: 'Distribución secundaria',      category: 'enclosure', svg: FDH },
  splice_closure:    { label: 'Caja de Empalme',         code: '( Manga / Mufa )',norm: 'Exterior / subterráneo',       category: 'enclosure', svg: SpliceClosure },
  nap_fat:           { label: 'Caja Terminal',           code: 'NAP / FAT',       norm: 'Punto de acceso usuario',      category: 'enclosure', svg: NapFat },
  // Splitters
  splitter_1x2:      { label: 'Splitter 1:2',            code: '▷ 2 salidas',     norm: 'Ratio 50% · -3dB',            category: 'splitter',  svg: Splitter1x2 },
  splitter_1x4:      { label: 'Splitter 1:4',            code: '▷ 4 salidas',     norm: 'Ratio 25% · -6dB',            category: 'splitter',  svg: Splitter1x4 },
  splitter_1x8:      { label: 'Splitter 1:8',            code: '▷ 8 salidas',     norm: 'Ratio 12.5% · -9dB',          category: 'splitter',  svg: Splitter1x8 },
  splitter_1x16:     { label: 'Splitter 1:16',           code: '▷ 16 salidas',    norm: 'Ratio 6.25% · -12dB',         category: 'splitter',  svg: Splitter1x16 },
  splitter_1x32:     { label: 'Splitter 1:32',           code: '▷ 32 salidas',    norm: 'GPON estándar · -15dB',       category: 'splitter',  svg: Splitter1x32 },
  // Filters
  wdm:               { label: 'WDM / Multiplexor',       code: '◇ WDM',           norm: 'Combina longitudes λ',         category: 'filter',    svg: WDM },
  attenuator:        { label: 'Atenuador',               code: '—[ATT]—',         norm: 'Reduce potencia óptica',       category: 'filter',    svg: Attenuator },
  optical_filter:    { label: 'Filtro Óptico',           code: '—[F]—',           norm: 'Selectivo por λ',             category: 'filter',    svg: OpticalFilter },
  circulator:        { label: 'Circulador Óptico',       code: '↻ 3 puertos',     norm: 'Direccional',                  category: 'filter',    svg: Circulator },
  coupler_2x2:       { label: 'Acoplador Óptico',        code: '—○— 2×2',         norm: 'Passive coupler',              category: 'filter',    svg: Coupler2x2 },
  // Civil & user
  pole:              { label: 'Poste / Soporte Aéreo',   code: '╤ poste',         norm: 'Red aérea ADSS',               category: 'civil',     svg: Pole },
  manhole:           { label: 'Cámara Subterránea',      code: '[ CM ] - - -',    norm: 'Acceso mantenimiento',         category: 'civil',     svg: HandholeManhole },
  ont:               { label: 'ONT / ONU',               code: 'Terminal de Usuario', norm: 'Extremo de red FTTH',      category: 'civil',     svg: ONT },
  optical_rosette:   { label: 'Roseta Óptica',           code: '◉ RO',            norm: 'Punto de entrega usuario',     category: 'civil',     svg: OpticalRosette },
  indoor_fdc:        { label: 'Caja de Distribución',    code: 'FDC / ODF Int.',  norm: 'Indoor building',              category: 'civil',     svg: IndoorDistributionBox },
}

export const FTTH_ICON_CATEGORIES = {
  cable:     'Cables de Fibra Óptica',
  connector: 'Conectores y Empalmes',
  enclosure: 'Cajas, Distribuidores y Nodos',
  splitter:  'Splitters Ópticos (Divisores PON)',
  filter:    'Filtros, Acopladores y Atenuadores',
  civil:     'Infraestructura Civil y Extremo de Usuario',
} as const

// Render an icon at a given pixel size (default 24×24)
export function FtthIcon({ id, size = 24, className, style }: {
  id: string
  size?: number
  className?: string
  style?: React.CSSProperties
}) {
  const def = FTTH_ICONS[id]
  if (!def) return null
  return (
    <span style={{ display: 'inline-flex', width: size, height: size, flexShrink: 0, ...style }} className={className}>
      {def.svg}
    </span>
  )
}
