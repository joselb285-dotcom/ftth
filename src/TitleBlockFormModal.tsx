import { useRef, useState, useMemo } from 'react'

export type PaperSize = 'a4' | 'a3' | 'a2' | 'a1' | 'a0'

// Dimensiones en mm landscape (ancho × alto)
export const PAPER_DIMS: Record<PaperSize, [number, number]> = {
  a4: [297, 210],
  a3: [420, 297],
  a2: [594, 420],
  a1: [841, 594],
  a0: [1189, 841],
}

const PAPER_OPTIONS: { value: PaperSize; label: string }[] = [
  { value: 'a4', label: 'A4  — 297 × 210 mm' },
  { value: 'a3', label: 'A3  — 420 × 297 mm' },
  { value: 'a2', label: 'A2  — 594 × 420 mm (plotter)' },
  { value: 'a1', label: 'A1  — 841 × 594 mm (plotter)' },
  { value: 'a0', label: 'A0  — 1189 × 841 mm (plotter)' },
]

const SCALE_STANDARDS = [100,200,500,1000,2000,2500,5000,10000,25000,50000,100000,500000,1000000]

function estimateScale(lat: number, zoom: number, paperW: number): string {
  const BORDER = 10
  const innerW = paperW - BORDER * 2
  const BASE_PX = 2800
  const mpx = 156543.03392 * Math.cos(lat * Math.PI / 180) / Math.pow(2, zoom)
  const mapWidthM = BASE_PX * mpx
  const scaleNum = Math.round(mapWidthM / (innerW / 1000))
  const nearest = SCALE_STANDARDS.reduce((a, b) =>
    Math.abs(b - scaleNum) < Math.abs(a - scaleNum) ? b : a)
  return `1:${nearest.toLocaleString('es-AR')}`
}

export type TitleBlockData = {
  empresa: string
  titulo: string
  proyecto: string
  subProyecto: string
  nroPlano: string
  escala: string
  fecha: string
  dibujo: string
  revision: string
  aprobo: string
  revNum: string
  hoja: string
  logoDataUrl: string | null
  paperSize: PaperSize
}

interface Props {
  defaults: Pick<TitleBlockData, 'proyecto' | 'subProyecto' | 'titulo'>
  mapMeta: { lat: number; lng: number; zoom: number }
  onExport: (data: TitleBlockData, format: 'png' | 'pdf') => void
  onClose: () => void
}

export default function TitleBlockFormModal({ defaults, mapMeta, onExport, onClose }: Props) {
  const [data, setData] = useState<TitleBlockData>({
    empresa: '',
    titulo: defaults.titulo,
    proyecto: defaults.proyecto,
    subProyecto: defaults.subProyecto,
    nroPlano: '',
    escala: '',
    fecha: new Date().toLocaleDateString('es-AR'),
    dibujo: '',
    revision: '',
    aprobo: '',
    revNum: '0',
    hoja: '1/1',
    logoDataUrl: null,
    paperSize: 'a4',
  })

  const logoInputRef = useRef<HTMLInputElement>(null)

  function set<K extends keyof TitleBlockData>(key: K, value: TitleBlockData[K]) {
    setData(prev => ({ ...prev, [key]: value }))
  }

  function handleLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => set('logoDataUrl', ev.target?.result as string)
    reader.readAsDataURL(file)
  }

  const autoScale = useMemo(() =>
    estimateScale(mapMeta.lat, mapMeta.zoom, PAPER_DIMS[data.paperSize][0]),
    [mapMeta, data.paperSize]
  )

  const effectiveScale = autoScale

  return (
    <div className="client-modal-overlay" onClick={onClose}>
      <div className="client-modal" style={{ width: 'min(700px, 95vw)' }} onClick={e => e.stopPropagation()}>

        <div className="client-modal-header">
          <div>
            <h2>Configurar rótulo — IRAM 4508</h2>
            <p className="client-modal-sub">Completá los datos antes de exportar</p>
          </div>
          <button className="secondary" onClick={onClose}>✕</button>
        </div>

        <div className="client-modal-body">

          {/* Papel */}
          <div className="client-section-title">Tamaño de papel</div>
          <div className="client-form-grid">
            <label style={{ gridColumn: '1 / -1' }}>
              Formato
              <select value={data.paperSize} onChange={e => set('paperSize', e.target.value as PaperSize)}
                style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid #334155', background: 'var(--bg-surface)', color: 'var(--text-primary)' }}>
                {PAPER_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>
          </div>

          {/* Logo */}
          <div className="client-section-title">Logo de empresa</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            {data.logoDataUrl ? (
              <img src={data.logoDataUrl} alt="Logo"
                style={{ height: 60, maxWidth: 160, objectFit: 'contain', border: '1px solid #334155', borderRadius: 6, background: '#fff', padding: 4 }} />
            ) : (
              <div style={{ width: 160, height: 60, border: '1px dashed #334155', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#475569', fontSize: '0.75rem' }}>
                Sin logo
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <button className="secondary small" onClick={() => logoInputRef.current?.click()}>
                {data.logoDataUrl ? '🔄 Cambiar logo' : '📁 Cargar logo'}
              </button>
              {data.logoDataUrl && (
                <button className="secondary small" onClick={() => set('logoDataUrl', null)}>✕ Quitar</button>
              )}
            </div>
            <input ref={logoInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleLogo} />
          </div>

          {/* Identificación */}
          <div className="client-section-title">Identificación</div>
          <div className="client-form-grid">
            <label>
              Empresa / Organismo
              <input value={data.empresa} onChange={e => set('empresa', e.target.value)} placeholder="Ej: Telecom SA" />
            </label>
            <label>
              Título del plano
              <input value={data.titulo} onChange={e => set('titulo', e.target.value)} placeholder="Ej: Red FTTH" />
            </label>
            <label>
              Proyecto
              <input value={data.proyecto} onChange={e => set('proyecto', e.target.value)} />
            </label>
            <label>
              Sub-proyecto / Ubicación
              <input value={data.subProyecto} onChange={e => set('subProyecto', e.target.value)} />
            </label>
          </div>

          {/* Datos técnicos */}
          <div className="client-section-title">Datos técnicos</div>
          <div className="client-form-grid">
            <label>
              Número de plano
              <input value={data.nroPlano} onChange={e => set('nroPlano', e.target.value)} placeholder="Ej: E-001" />
            </label>
            <label>
              Escala (automática)
              <input value={autoScale} readOnly
                style={{ opacity: 0.6, cursor: 'default', background: 'var(--bg-base)' }} />
            </label>
            <label>
              Fecha
              <input value={data.fecha} onChange={e => set('fecha', e.target.value)} />
            </label>
            <label>
              Revisión N°
              <input value={data.revNum} onChange={e => set('revNum', e.target.value)} placeholder="0" />
            </label>
            <label>
              Hoja
              <input value={data.hoja} onChange={e => set('hoja', e.target.value)} placeholder="1/1" />
            </label>
          </div>

          {/* Responsables */}
          <div className="client-section-title">Responsables</div>
          <div className="client-form-grid">
            <label>
              Dibujó
              <input value={data.dibujo} onChange={e => set('dibujo', e.target.value)} placeholder="Nombre" />
            </label>
            <label>
              Revisó
              <input value={data.revision} onChange={e => set('revision', e.target.value)} placeholder="Nombre" />
            </label>
            <label>
              Aprobó
              <input value={data.aprobo} onChange={e => set('aprobo', e.target.value)} placeholder="Nombre" />
            </label>
          </div>

        </div>

        <div className="client-modal-footer">
          <button className="secondary" onClick={onClose}>Cancelar</button>
          <button className="secondary" onClick={() => onExport({ ...data, escala: effectiveScale }, 'png')}>🖼 Exportar PNG</button>
          <button onClick={() => onExport({ ...data, escala: effectiveScale }, 'pdf')}>📄 Exportar PDF</button>
        </div>

      </div>
    </div>
  )
}
