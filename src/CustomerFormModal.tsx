import { useState } from 'react'
import type { Customer, CustomerStatus, ServiceType, DocumentType } from './types'

interface Props {
  customer?: Customer | null
  tenantId: string
  onSave: (c: Omit<Customer, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => Promise<void>
  onClose: () => void
  mode?: 'create' | 'edit' | 'cancel' | 'suspend'
}

const SERVICE_LABELS: Record<ServiceType, string> = {
  residential: 'Residencial',
  business:    'Empresarial',
  enterprise:  'Corporativo',
}

const DOC_LABELS: Record<DocumentType, string> = {
  DNI:      'DNI',
  CUIT:     'CUIT',
  CUIL:     'CUIL',
  passport: 'Pasaporte',
  other:    'Otro',
}

const STATUS_LABELS: Record<CustomerStatus, string> = {
  active:    'Activo',
  suspended: 'Suspendido',
  cancelled: 'Baja',
}

const blank: Omit<Customer, 'id' | 'createdAt' | 'updatedAt'> = {
  tenantId: '',
  name: '',
  status: 'active',
}

export default function CustomerFormModal({ customer, tenantId, onSave, onClose, mode = 'edit' }: Props) {
  const isNew    = !customer
  const [form, setForm]     = useState<Omit<Customer, 'id' | 'createdAt' | 'updatedAt'>>({
    ...blank,
    ...customer,
    tenantId,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')
  const [reason, setReason] = useState('')

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  async function handleSave() {
    if (!form.name.trim()) { setError('El nombre es obligatorio'); return }
    setSaving(true)
    setError('')
    try {
      await onSave({ ...form, id: customer?.id })
      onClose()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  // ── Cancel / Suspend mode ────────────────────────────────────────────────────
  if (mode === 'cancel' || mode === 'suspend') {
    const label = mode === 'cancel' ? 'dar de baja' : 'suspender'
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-box" style={{ maxWidth: 460 }} onClick={e => e.stopPropagation()}>
          <div className="modal-header">
            <h3>{mode === 'cancel' ? 'Dar de baja' : 'Suspender'} cliente</h3>
            <button className="secondary" onClick={onClose}>✕</button>
          </div>
          <div style={{ padding: '16px 20px' }}>
            <p style={{ marginBottom: 12, color: '#94a3b8' }}>
              ¿Seguro que desea {label} a <strong style={{ color: '#e2e8f0' }}>{customer?.name}</strong>?
            </p>
            <label>
              Motivo {mode === 'cancel' ? '(obligatorio)' : '(opcional)'}
              <input
                autoFocus
                value={reason}
                onChange={e => setReason(e.target.value)}
                placeholder={mode === 'cancel' ? 'Motivo de baja...' : 'Motivo de suspensión...'}
              />
            </label>
            {error && <p className="form-error">{error}</p>}
          </div>
          <div className="modal-footer">
            <button className="secondary" onClick={onClose}>Cancelar</button>
            <button
              className={mode === 'cancel' ? 'danger' : 'warning'}
              disabled={saving || (mode === 'cancel' && !reason.trim())}
              onClick={async () => {
                if (mode === 'cancel' && !reason.trim()) { setError('El motivo es obligatorio para dar de baja'); return }
                setSaving(true)
                try {
                  await onSave({
                    ...customer!,
                    status: mode === 'cancel' ? 'cancelled' : 'suspended',
                    cancelReason: reason || undefined,
                    cancelDate: mode === 'cancel' ? new Date().toISOString().split('T')[0] : undefined,
                  })
                  onClose()
                } catch (e: unknown) {
                  setError(e instanceof Error ? e.message : 'Error')
                } finally { setSaving(false) }
              }}
            >
              {saving ? 'Guardando...' : mode === 'cancel' ? 'Dar de baja' : 'Suspender'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box modal-wide" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{isNew ? 'Alta de cliente' : 'Editar cliente'}</h3>
          <button className="secondary" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          {/* ── Identificación ── */}
          <div className="form-section-title">Identificación</div>
          <div className="form-grid-2">
            <label style={{ gridColumn: '1 / -1' }}>
              Nombre / Razón social <span className="required">*</span>
              <input autoFocus value={form.name} onChange={e => set('name', e.target.value)} placeholder="Ej: Juan García" />
            </label>
            <label>
              Tipo de documento
              <select value={form.documentType ?? ''} onChange={e => set('documentType', (e.target.value as DocumentType) || undefined)}>
                <option value="">— Sin especificar —</option>
                {(Object.keys(DOC_LABELS) as DocumentType[]).map(d => <option key={d} value={d}>{DOC_LABELS[d]}</option>)}
              </select>
            </label>
            <label>
              Número de documento
              <input value={form.documentNumber ?? ''} onChange={e => set('documentNumber', e.target.value || undefined)} placeholder="Ej: 30123456" />
            </label>
            <label style={{ gridColumn: '1 / -1' }}>
              Dirección
              <input value={form.address ?? ''} onChange={e => set('address', e.target.value || undefined)} placeholder="Ej: Av. Colón 1234, Córdoba" />
            </label>
            <label>
              Teléfono
              <input value={form.phone ?? ''} onChange={e => set('phone', e.target.value || undefined)} placeholder="+54 351 000-0000" />
            </label>
            <label>
              Email
              <input type="email" value={form.email ?? ''} onChange={e => set('email', e.target.value || undefined)} placeholder="cliente@email.com" />
            </label>
          </div>

          {/* ── Servicio ── */}
          <div className="form-section-title">Servicio</div>
          <div className="form-grid-2">
            <label>
              Estado
              <select value={form.status} onChange={e => set('status', e.target.value as CustomerStatus)}>
                {(Object.keys(STATUS_LABELS) as CustomerStatus[]).map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
              </select>
            </label>
            <label>
              Tipo de servicio
              <select value={form.serviceType ?? ''} onChange={e => set('serviceType', (e.target.value as ServiceType) || undefined)}>
                <option value="">— Sin especificar —</option>
                {(Object.keys(SERVICE_LABELS) as ServiceType[]).map(s => <option key={s} value={s}>{SERVICE_LABELS[s]}</option>)}
              </select>
            </label>
            <label style={{ gridColumn: '1 / -1' }}>
              Plan
              <input value={form.planName ?? ''} onChange={e => set('planName', e.target.value || undefined)} placeholder="Ej: Plan Hogar 100M" />
            </label>
            <label>
              Velocidad bajada (Mbps)
              <input type="number" min="0" value={form.planDownMbps ?? ''} onChange={e => set('planDownMbps', e.target.value ? Number(e.target.value) : undefined)} placeholder="100" />
            </label>
            <label>
              Velocidad subida (Mbps)
              <input type="number" min="0" value={form.planUpMbps ?? ''} onChange={e => set('planUpMbps', e.target.value ? Number(e.target.value) : undefined)} placeholder="50" />
            </label>
            <label>
              Cuota mensual ($)
              <input type="number" min="0" step="0.01" value={form.monthlyFee ?? ''} onChange={e => set('monthlyFee', e.target.value ? Number(e.target.value) : undefined)} placeholder="0.00" />
            </label>
            <label>
              Fecha de alta
              <input type="date" value={form.installDate ?? ''} onChange={e => set('installDate', e.target.value || undefined)} />
            </label>
          </div>

          {/* ── GPON / ONU ── */}
          <div className="form-section-title">Equipamiento GPON</div>
          <div className="form-grid-2">
            <label>
              Modelo ONU
              <input value={form.onuModel ?? ''} onChange={e => set('onuModel', e.target.value || undefined)} placeholder="Ej: Huawei HG8310M" />
            </label>
            <label>
              Número de serie ONU
              <input value={form.onuSerial ?? ''} onChange={e => set('onuSerial', e.target.value || undefined)} placeholder="Ej: HWTC1A2B3C4D" />
            </label>
            <label>
              MAC ONU
              <input value={form.onuMac ?? ''} onChange={e => set('onuMac', e.target.value || undefined)} placeholder="Ej: A8:DE:29:01:23:45" />
            </label>
            <label>
              OLT host
              <input value={form.oltHost ?? ''} onChange={e => set('oltHost', e.target.value || undefined)} placeholder="Ej: OLT-NORTE-01" />
            </label>
            <label>
              Puerto PON
              <input type="number" min="0" value={form.ponPort ?? ''} onChange={e => set('ponPort', e.target.value ? Number(e.target.value) : undefined)} placeholder="1" />
            </label>
            <label>
              Distancia óptica OTDR (m)
              <input type="number" min="0" value={form.opticalDistanceM ?? ''} onChange={e => set('opticalDistanceM', e.target.value ? Number(e.target.value) : undefined)} placeholder="1850" />
            </label>
          </div>

          {/* ── Baja (si aplica) ── */}
          {form.status === 'cancelled' && (
            <>
              <div className="form-section-title">Datos de baja</div>
              <div className="form-grid-2">
                <label>
                  Fecha de baja
                  <input type="date" value={form.cancelDate ?? ''} onChange={e => set('cancelDate', e.target.value || undefined)} />
                </label>
                <label style={{ gridColumn: '1 / -1' }}>
                  Motivo de baja
                  <input value={form.cancelReason ?? ''} onChange={e => set('cancelReason', e.target.value || undefined)} placeholder="Motivo de baja..." />
                </label>
              </div>
            </>
          )}

          {/* ── Observaciones ── */}
          <div className="form-section-title">Observaciones</div>
          <textarea rows={3} value={form.notes ?? ''} onChange={e => set('notes', e.target.value || undefined)}
            placeholder="Notas adicionales..." style={{ width: '100%', resize: 'vertical' }} />

          {error && <p className="form-error">{error}</p>}
        </div>

        <div className="modal-footer">
          <button className="secondary" onClick={onClose} disabled={saving}>Cancelar</button>
          <button onClick={handleSave} disabled={saving}>
            {saving ? 'Guardando...' : isNew ? 'Dar de alta' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}
