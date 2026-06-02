import type { FeatureKind } from './types'

// Mini-icons (12x12 area, offset to bottom-right of the 32x32 cursor canvas)
const ICONS: Record<string, string> = {
  node: `<rect x='21' y='21' width='10' height='7' rx='1.5' fill='currentColor' stroke='#000' stroke-width='0.5'/>
         <line x1='25' y1='28' x2='25' y2='31' stroke='currentColor' stroke-width='1.5' stroke-linecap='round'/>`,

  splice_box: `<path d='M26 21 L31 23.5 L31 28.5 L26 31 L21 28.5 L21 23.5 Z' fill='none' stroke='currentColor' stroke-width='1.5'/>`,

  nap: `<path d='M26 21 L31 23 L31 29 C31 31 26 31 26 31 C26 31 21 31 21 29 L21 23 Z' fill='none' stroke='currentColor' stroke-width='1.5'/>`,

  fiber_line: `<line x1='20' y1='31' x2='31' y2='20' stroke='currentColor' stroke-width='2' stroke-linecap='round'/>
               <line x1='20' y1='26' x2='25' y2='21' stroke='currentColor' stroke-width='1' stroke-dasharray='2 1.5' stroke-linecap='round'/>`,

  zone: `<polygon points='26,21 31,29 21,29' fill='none' stroke='currentColor' stroke-width='1.5' stroke-linejoin='round'/>`,

  camera: `<circle cx='26' cy='26' r='5' fill='none' stroke='currentColor' stroke-width='1.5'/>
           <circle cx='26' cy='26' r='2.5' fill='none' stroke='currentColor' stroke-width='1'/>
           <circle cx='26' cy='26' r='1' fill='currentColor'/>`,

  measure: `<line x1='20' y1='31' x2='31' y2='20' stroke='currentColor' stroke-width='2' stroke-linecap='round'/>
            <line x1='20' y1='28' x2='23' y2='31' stroke='currentColor' stroke-width='1.5' stroke-linecap='round'/>
            <line x1='23' y1='25' x2='26' y2='28' stroke='currentColor' stroke-width='1.5' stroke-linecap='round'/>
            <line x1='28' y1='22' x2='31' y2='25' stroke='currentColor' stroke-width='1.5' stroke-linecap='round'/>`,
}

const COLORS: Record<string, string> = {
  node:       '#3b82f6',
  splice_box: '#f97316',
  nap:        '#10b981',
  fiber_line: '#c084fc',
  zone:       '#8b5cf6',
  camera:     '#0ea5e9',
  measure:    '#f59e0b',
}

function makeCursor(kind: string): string {
  const color = COLORS[kind] ?? '#60a5fa'
  const icon  = (ICONS[kind] ?? '').replace(/currentColor/g, color)

  const shadow = `<filter id='sh' x='-20%' y='-20%' width='140%' height='140%'>
    <feDropShadow dx='0' dy='0' stdDeviation='0.8' flood-color='#000' flood-opacity='0.7'/>
  </filter>`

  const crosshair = `
    <g filter='url(#sh)'>
      <line x1='16' y1='2'  x2='16' y2='12' stroke='${color}' stroke-width='2'   stroke-linecap='round'/>
      <line x1='16' y1='20' x2='16' y2='30' stroke='${color}' stroke-width='2'   stroke-linecap='round'/>
      <line x1='2'  y1='16' x2='12' y2='16' stroke='${color}' stroke-width='2'   stroke-linecap='round'/>
      <line x1='20' y1='16' x2='30' y2='16' stroke='${color}' stroke-width='2'   stroke-linecap='round'/>
      <circle cx='16' cy='16' r='2.5' fill='${color}'/>
      <circle cx='16' cy='16' r='2.5' fill='none' stroke='#fff' stroke-width='0.8' opacity='0.5'/>
    </g>`

  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'>
    <defs>${shadow}</defs>
    ${crosshair}
    ${icon}
  </svg>`

  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 16 16, crosshair`
}

// Pre-build all cursors
const CURSOR_CACHE: Partial<Record<string, string>> = {}

export function getDrawCursor(tool: FeatureKind | 'measure' | null): string {
  if (!tool) return ''
  if (!CURSOR_CACHE[tool]) CURSOR_CACHE[tool] = makeCursor(tool)
  return CURSOR_CACHE[tool]!
}
