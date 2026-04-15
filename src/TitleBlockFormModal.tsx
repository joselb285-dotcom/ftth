import { useRef, useState } from 'react'

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
}

interface Props {
  defaults: Pick<TitleBlockData, 'proyecto' | 'subProyecto' | 'titulo'>
  onExport: (data: TitleBlockData, format: 'png' | 'pdf') => void
  onClose: () => void
}

export default function TitleBlockFormModal({ defaults, onExport, onClose }: Props) {
  const [data, setData] = useState<TitleBlockData>({
    empresa: '',
    titulo: defaults.titulo,
    proyecto: defaults.proyecto,
    subProyecto: defaults.subProyecto,
    nroPlano: '',
    escala: 'S/E',
    fecha: new Date().toLocaleDateString('es-AR'),
    dibujo: '',
    revision: '',
    aprobo: '',
    revNum: '0',
    hoja: '1/1',
    logoDataUrl: null,
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

  return (
    <div className="client-modal-overlay" onClick={onClose}>
      <div className="client-modal" style={{ width: 'min(680px, 95vw)' }} onClick={e => e.stopPropagation()}>

        <div className="client-modal-header">
          <div>
            <h2>Configurar rótulo — IRAM 4508</h2>
            <p className="client-modal-sub">Completá los datos antes de exportar</p>
          </div>
          <button className="secondary" onClick={onClose}>✕</button>
        </div>

        <div className="client-modal-body">

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

          {/* Empresa y título */}
          <div className="client-section-title">Identificación</div>
          <div className="client-form-grid">
            <label>
              Empresa / Organismo
              <input value={data.empresa} onChange={e => set('empresa', e.target.value)} placeholder="Ej: Telecom SA" />
            </label>
            <label>
              Título del plano
              <input value={data.titulo} onChange={e => set('titulo', e.target.value)} placeholder="Ej: Carta de empalme" />
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
              Escala
              <input value={data.escala} onChange={e => set('escala', e.target.value)} placeholder="S/E" />
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

          {/* Firmas */}
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
          <button className="secondary" onClick={() => onExport(data, 'png')}>🖼 Exportar PNG</button>
          <button onClick={() => onExport(data, 'pdf')}>📄 Exportar PDF</button>
        </div>

      </div>
    </div>
  )
}
