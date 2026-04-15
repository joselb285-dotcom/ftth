import { useState } from 'react'
import type { ClientInfo } from './types'

interface Props {
  fiberLabel: string
  cableName: string
  clientInfo: ClientInfo
  onSave: (info: ClientInfo) => void
  onClose: () => void
}

export default function ClientModal({ fiberLabel, cableName, clientInfo, onSave, onClose }: Props) {
  const [form, setForm] = useState<ClientInfo>({ ...clientInfo })

  function set<K extends keyof ClientInfo>(key: K, value: ClientInfo[K]) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  function handleSave() {
    // Clean empty strings to undefined
    const cleaned: ClientInfo = {
      name: form.name,
      address: form.address || undefined,
      phone: form.phone || undefined,
      email: form.email || undefined,
      onuModel: form.onuModel || undefined,
      onuSerial: form.onuSerial || undefined,
      onuPowerDbm: form.onuPowerDbm || undefined,
      notes: form.notes || undefined,
    }
    onSave(cleaned)
    onClose()
  }

  return (
    <div className="client-modal-overlay" onClick={onClose}>
      <div className="client-modal" onClick={e => e.stopPropagation()}>
        <div className="client-modal-header">
          <div>
            <h2>Datos del cliente</h2>
            <p className="client-modal-sub">{cableName} · {fiberLabel}</p>
          </div>
          <button className="secondary" onClick={onClose}>✕</button>
        </div>

        <div className="client-modal-body">
          <div className="client-section-title">Identificación</div>
          <div className="client-form-grid">
            <label>
              Nombre del cliente
              <input
                value={form.name}
                onChange={e => set('name', e.target.value)}
                placeholder="Ej: Juan García"
                autoFocus
              />
            </label>
            <label>
              Dirección
              <input
                value={form.address ?? ''}
                onChange={e => set('address', e.target.value)}
                placeholder="Ej: Av. Colón 1234, Córdoba"
              />
            </label>
            <label>
              Teléfono
              <input
                value={form.phone ?? ''}
                onChange={e => set('phone', e.target.value)}
                placeholder="Ej: +54 351 000-0000"
              />
            </label>
            <label>
              Email
              <input
                type="email"
                value={form.email ?? ''}
                onChange={e => set('email', e.target.value)}
                placeholder="Ej: cliente@email.com"
              />
            </label>
          </div>

          <div className="client-section-title">ONU / ONT</div>
          <div className="client-form-grid">
            <label>
              Modelo ONU
              <input
                value={form.onuModel ?? ''}
                onChange={e => set('onuModel', e.target.value)}
                placeholder="Ej: Huawei HG8310M"
              />
            </label>
            <label>
              Número de serie
              <input
                value={form.onuSerial ?? ''}
                onChange={e => set('onuSerial', e.target.value)}
                placeholder="Ej: HWTC1A2B3C4D"
              />
            </label>
            <label className="client-power-label">
              Potencia óptica recibida (dBm)
              <div className="client-power-row">
                <input
                  type="number"
                  step="0.1"
                  value={form.onuPowerDbm ?? ''}
                  onChange={e => set('onuPowerDbm', e.target.value)}
                  placeholder="Ej: -22.5"
                  className="client-power-input"
                />
                <span className={`client-power-badge ${getPowerClass(form.onuPowerDbm)}`}>
                  {getPowerLabel(form.onuPowerDbm)}
                </span>
              </div>
              <span className="client-power-hint">
                Rango óptimo: −8 dBm a −27 dBm · Crítico: &lt; −30 dBm
              </span>
            </label>
          </div>

          <div className="client-section-title">Observaciones</div>
          <textarea
            rows={3}
            value={form.notes ?? ''}
            onChange={e => set('notes', e.target.value)}
            placeholder="Notas adicionales..."
            style={{ width: '100%' }}
          />
        </div>

        <div className="client-modal-footer">
          <button className="secondary" onClick={onClose}>Cancelar</button>
          <button onClick={handleSave}>Guardar</button>
        </div>
      </div>
    </div>
  )
}

function getPowerClass(dbm: string | undefined): string {
  if (!dbm) return ''
  const v = parseFloat(dbm)
  if (isNaN(v)) return ''
  if (v >= -8) return 'power-high'
  if (v >= -27) return 'power-ok'
  if (v >= -30) return 'power-warn'
  return 'power-crit'
}

function getPowerLabel(dbm: string | undefined): string {
  if (!dbm) return '—'
  const v = parseFloat(dbm)
  if (isNaN(v)) return '—'
  if (v >= -8) return 'Alta'
  if (v >= -27) return 'OK'
  if (v >= -30) return 'Baja'
  return 'Crítica'
}
