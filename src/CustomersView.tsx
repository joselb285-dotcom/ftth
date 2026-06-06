import { useEffect, useState, useMemo } from 'react'
import type { Customer, CustomerStatus, ServiceType } from './types'
import {
  getCustomers, createCustomer, updateCustomer, deleteCustomer,
} from './customers'
import CustomerFormModal from './CustomerFormModal'

interface Props {
  tenantId: string
  userEmail: string
  isReadOnly?: boolean
  onBack: () => void
}

const STATUS_LABEL: Record<CustomerStatus, string> = {
  active:    'Activo',
  suspended: 'Suspendido',
  cancelled: 'Baja',
}
const STATUS_CLASS: Record<CustomerStatus, string> = {
  active:    'badge-active',
  suspended: 'badge-warn',
  cancelled: 'badge-off',
}
const SERVICE_LABEL: Record<ServiceType, string> = {
  residential: 'Residencial',
  business:    'Empresarial',
  enterprise:  'Corporativo',
}

type ModalMode = 'create' | 'edit' | 'cancel' | 'suspend'

export default function CustomersView({ tenantId, userEmail, isReadOnly, onBack }: Props) {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState('')

  // Filters
  const [search, setSearch]           = useState('')
  const [statusFilter, setStatusFilter] = useState<CustomerStatus | 'all'>('all')
  const [serviceFilter, setServiceFilter] = useState<ServiceType | 'all'>('all')

  // Modal
  const [modalMode, setModalMode]   = useState<ModalMode>('create')
  const [selected, setSelected]     = useState<Customer | null>(null)
  const [showModal, setShowModal]   = useState(false)
  const [detail, setDetail]         = useState<Customer | null>(null)

  useEffect(() => { load() }, [tenantId])

  async function load() {
    setLoading(true)
    setError('')
    try {
      const data = await getCustomers(tenantId)
      setCustomers(data)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al cargar clientes')
    } finally {
      setLoading(false)
    }
  }

  async function handleSave(c: Omit<Customer, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) {
    if (c.id) {
      const updated = await updateCustomer({ ...c, id: c.id, createdAt: selected!.createdAt, updatedAt: new Date().toISOString() })
      setCustomers(prev => prev.map(x => x.id === updated.id ? updated : x))
      if (detail?.id === updated.id) setDetail(updated)
    } else {
      const created = await createCustomer(c)
      setCustomers(prev => [created, ...prev])
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Eliminar este cliente permanentemente? Esta acción no se puede deshacer.')) return
    await deleteCustomer(id)
    setCustomers(prev => prev.filter(c => c.id !== id))
    if (detail?.id === id) setDetail(null)
  }

  function openModal(mode: ModalMode, c?: Customer) {
    setModalMode(mode)
    setSelected(c ?? null)
    setShowModal(true)
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return customers.filter(c => {
      if (statusFilter !== 'all' && c.status !== statusFilter) return false
      if (serviceFilter !== 'all' && c.serviceType !== serviceFilter) return false
      if (q && !c.name.toLowerCase().includes(q) &&
          !(c.address?.toLowerCase().includes(q)) &&
          !(c.onuSerial?.toLowerCase().includes(q)) &&
          !(c.email?.toLowerCase().includes(q)) &&
          !(c.phone?.includes(q))) return false
      return true
    })
  }, [customers, search, statusFilter, serviceFilter])

  const stats = useMemo(() => ({
    total:     customers.length,
    active:    customers.filter(c => c.status === 'active').length,
    suspended: customers.filter(c => c.status === 'suspended').length,
    cancelled: customers.filter(c => c.status === 'cancelled').length,
  }), [customers])

  return (
    <div className="crm-shell">
      {/* ── Header ── */}
      <header className="crm-header">
        <div className="crm-header-left">
          <button className="secondary" onClick={onBack}>← Volver</button>
          <div>
            <h1 className="crm-title">Gestión de Clientes</h1>
            <p className="crm-subtitle">Alta, baja y administración de abonados FTTH</p>
          </div>
        </div>
        {!isReadOnly && (
          <button onClick={() => openModal('create')}>+ Alta de cliente</button>
        )}
      </header>

      {/* ── Stats strip ── */}
      <div className="crm-stats">
        <div className="crm-stat">
          <span className="crm-stat-val">{stats.total}</span>
          <span className="crm-stat-lbl">Total</span>
        </div>
        <div className="crm-stat crm-stat-active">
          <span className="crm-stat-val">{stats.active}</span>
          <span className="crm-stat-lbl">Activos</span>
        </div>
        <div className="crm-stat crm-stat-warn">
          <span className="crm-stat-val">{stats.suspended}</span>
          <span className="crm-stat-lbl">Suspendidos</span>
        </div>
        <div className="crm-stat crm-stat-off">
          <span className="crm-stat-val">{stats.cancelled}</span>
          <span className="crm-stat-lbl">Bajas</span>
        </div>
      </div>

      {/* ── Filters ── */}
      <div className="crm-filters">
        <input
          className="crm-search"
          placeholder="Buscar por nombre, dirección, serial ONU, email..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as CustomerStatus | 'all')}>
          <option value="all">Todos los estados</option>
          <option value="active">Activo</option>
          <option value="suspended">Suspendido</option>
          <option value="cancelled">Baja</option>
        </select>
        <select value={serviceFilter} onChange={e => setServiceFilter(e.target.value as ServiceType | 'all')}>
          <option value="all">Todos los servicios</option>
          <option value="residential">Residencial</option>
          <option value="business">Empresarial</option>
          <option value="enterprise">Corporativo</option>
        </select>
        <button className="secondary" onClick={load} title="Recargar">↻</button>
      </div>

      {/* ── Content ── */}
      <div className="crm-body">
        {/* ── List ── */}
        <div className="crm-list-col">
          {loading && <p className="empty-state">Cargando...</p>}
          {error   && <p className="empty-state" style={{ color: '#f87171' }}>✗ {error}</p>}
          {!loading && !error && filtered.length === 0 && (
            <p className="empty-state">No se encontraron clientes{search ? ` para "${search}"` : ''}</p>
          )}
          {filtered.map(c => (
            <div
              key={c.id}
              className={`crm-card${detail?.id === c.id ? ' crm-card-active' : ''}`}
              onClick={() => setDetail(detail?.id === c.id ? null : c)}
            >
              <div className="crm-card-top">
                <span className="crm-card-name">{c.name}</span>
                <span className={`badge ${STATUS_CLASS[c.status]}`}>{STATUS_LABEL[c.status]}</span>
              </div>
              <div className="crm-card-meta">
                {c.address && <span>📍 {c.address}</span>}
                {c.planName && <span>📋 {c.planName}</span>}
                {c.onuSerial && <span>🔑 {c.onuSerial}</span>}
                {c.serviceType && <span className="crm-service-tag">{SERVICE_LABEL[c.serviceType]}</span>}
              </div>
              {c.planDownMbps && (
                <div className="crm-card-speed">
                  ↓ {c.planDownMbps} Mbps / ↑ {c.planUpMbps ?? '?'} Mbps
                </div>
              )}
            </div>
          ))}
        </div>

        {/* ── Detail panel ── */}
        {detail && (
          <div className="crm-detail">
            <div className="crm-detail-header">
              <div>
                <h2 className="crm-detail-name">{detail.name}</h2>
                <span className={`badge ${STATUS_CLASS[detail.status]}`}>{STATUS_LABEL[detail.status]}</span>
              </div>
              <button className="secondary" onClick={() => setDetail(null)}>✕</button>
            </div>

            <div className="crm-detail-section">Contacto</div>
            <div className="crm-detail-grid">
              {detail.address        && <><span className="crm-dl">Dirección</span><span>{detail.address}</span></>}
              {detail.phone          && <><span className="crm-dl">Teléfono</span><span>{detail.phone}</span></>}
              {detail.email          && <><span className="crm-dl">Email</span><span>{detail.email}</span></>}
              {detail.documentType   && <><span className="crm-dl">{detail.documentType}</span><span>{detail.documentNumber ?? '—'}</span></>}
            </div>

            <div className="crm-detail-section">Servicio</div>
            <div className="crm-detail-grid">
              {detail.serviceType  && <><span className="crm-dl">Tipo</span><span>{SERVICE_LABEL[detail.serviceType]}</span></>}
              {detail.planName     && <><span className="crm-dl">Plan</span><span>{detail.planName}</span></>}
              {detail.planDownMbps && <><span className="crm-dl">Velocidad</span><span>↓ {detail.planDownMbps} / ↑ {detail.planUpMbps ?? '?'} Mbps</span></>}
              {detail.monthlyFee   && <><span className="crm-dl">Cuota</span><span>${detail.monthlyFee.toFixed(2)}/mes</span></>}
              {detail.installDate  && <><span className="crm-dl">Alta</span><span>{detail.installDate}</span></>}
            </div>

            <div className="crm-detail-section">GPON / ONU</div>
            <div className="crm-detail-grid">
              {detail.onuModel         && <><span className="crm-dl">Modelo</span><span>{detail.onuModel}</span></>}
              {detail.onuSerial        && <><span className="crm-dl">Serial</span><span><code>{detail.onuSerial}</code></span></>}
              {detail.onuMac           && <><span className="crm-dl">MAC</span><span><code>{detail.onuMac}</code></span></>}
              {detail.oltHost          && <><span className="crm-dl">OLT</span><span>{detail.oltHost}</span></>}
              {detail.ponPort != null  && <><span className="crm-dl">Puerto PON</span><span>{detail.ponPort}</span></>}
              {detail.opticalDistanceM && <><span className="crm-dl">Distancia OTDR</span><span>{detail.opticalDistanceM} m</span></>}
            </div>

            {detail.status === 'cancelled' && (
              <>
                <div className="crm-detail-section" style={{ color: '#f87171' }}>Baja</div>
                <div className="crm-detail-grid">
                  {detail.cancelDate   && <><span className="crm-dl">Fecha</span><span>{detail.cancelDate}</span></>}
                  {detail.cancelReason && <><span className="crm-dl">Motivo</span><span>{detail.cancelReason}</span></>}
                </div>
              </>
            )}

            {detail.notes && (
              <>
                <div className="crm-detail-section">Observaciones</div>
                <p className="crm-notes">{detail.notes}</p>
              </>
            )}

            {!isReadOnly && (
              <div className="crm-detail-actions">
                <button onClick={() => openModal('edit', detail)}>✎ Editar</button>
                {detail.status !== 'suspended' && detail.status !== 'cancelled' && (
                  <button className="warning" onClick={() => openModal('suspend', detail)}>⏸ Suspender</button>
                )}
                {detail.status !== 'cancelled' && (
                  <button className="danger" onClick={() => openModal('cancel', detail)}>✖ Dar de baja</button>
                )}
                {(detail.status === 'suspended' || detail.status === 'cancelled') && (
                  <button onClick={async () => {
                    await handleSave({ ...detail, status: 'active', cancelDate: undefined, cancelReason: undefined })
                    setDetail(prev => prev ? { ...prev, status: 'active', cancelDate: undefined, cancelReason: undefined } : null)
                  }}>✓ Reactivar</button>
                )}
                <button className="secondary" onClick={() => handleDelete(detail.id)}>🗑 Eliminar</button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Modal ── */}
      {showModal && (
        <CustomerFormModal
          customer={selected}
          tenantId={tenantId}
          mode={modalMode}
          onSave={handleSave}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  )
}
