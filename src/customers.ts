import { api } from './api'
import type { Customer } from './types'

function rowToCustomer(r: Record<string, unknown>): Customer {
  return {
    id:               r.id as string,
    tenantId:         r.tenant_id as string,
    projectId:        r.project_id as string | undefined,
    subProjectId:     r.sub_project_id as string | undefined,
    featureId:        r.feature_id as string | undefined,
    name:             r.name as string,
    documentType:     r.document_type as Customer['documentType'],
    documentNumber:   r.document_number as string | undefined,
    address:          r.address as string | undefined,
    phone:            r.phone as string | undefined,
    email:            r.email as string | undefined,
    status:           (r.status as Customer['status']) ?? 'active',
    serviceType:      r.service_type as Customer['serviceType'],
    planName:         r.plan_name as string | undefined,
    planDownMbps:     r.plan_down_mbps as number | undefined,
    planUpMbps:       r.plan_up_mbps as number | undefined,
    monthlyFee:       r.monthly_fee != null ? Number(r.monthly_fee) : undefined,
    installDate:      r.install_date as string | undefined,
    cancelDate:       r.cancel_date as string | undefined,
    cancelReason:     r.cancel_reason as string | undefined,
    onuModel:         r.onu_model as string | undefined,
    onuSerial:        r.onu_serial as string | undefined,
    onuMac:           r.onu_mac as string | undefined,
    oltHost:          r.olt_host as string | undefined,
    ponPort:          r.pon_port as number | undefined,
    opticalDistanceM: r.optical_distance_m as number | undefined,
    notes:            r.notes as string | undefined,
    createdAt:        r.created_at as string,
    updatedAt:        r.updated_at as string,
  }
}

function customerToRow(c: Omit<Customer, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) {
  return {
    id:                  c.id,
    tenant_id:           c.tenantId,
    project_id:          c.projectId ?? null,
    sub_project_id:      c.subProjectId ?? null,
    feature_id:          c.featureId ?? null,
    name:                c.name,
    document_type:       c.documentType ?? null,
    document_number:     c.documentNumber ?? null,
    address:             c.address ?? null,
    phone:               c.phone ?? null,
    email:               c.email ?? null,
    status:              c.status,
    service_type:        c.serviceType ?? null,
    plan_name:           c.planName ?? null,
    plan_down_mbps:      c.planDownMbps ?? null,
    plan_up_mbps:        c.planUpMbps ?? null,
    monthly_fee:         c.monthlyFee ?? null,
    install_date:        c.installDate ?? null,
    cancel_date:         c.cancelDate ?? null,
    cancel_reason:       c.cancelReason ?? null,
    onu_model:           c.onuModel ?? null,
    onu_serial:          c.onuSerial ?? null,
    onu_mac:             c.onuMac ?? null,
    olt_host:            c.oltHost ?? null,
    pon_port:            c.ponPort ?? null,
    optical_distance_m:  c.opticalDistanceM ?? null,
    notes:               c.notes ?? null,
    updated_at:          new Date().toISOString(),
  }
}

export async function getCustomers(_tenantId: string): Promise<Customer[]> {
  const rows = await api<Record<string, unknown>[]>('/api/customers')
  return rows.map(rowToCustomer)
}

export async function createCustomer(c: Omit<Customer, 'id' | 'createdAt' | 'updatedAt'>): Promise<Customer> {
  const data = await api<Record<string, unknown>>('/api/customers', {
    method: 'POST', body: JSON.stringify(customerToRow(c)),
  })
  return rowToCustomer(data)
}

export async function updateCustomer(c: Customer): Promise<Customer> {
  const data = await api<Record<string, unknown>>(`/api/customers/${c.id}`, {
    method: 'PUT', body: JSON.stringify(customerToRow(c)),
  })
  return rowToCustomer(data)
}

export async function deleteCustomer(id: string): Promise<void> {
  await api(`/api/customers/${id}`, { method: 'DELETE' })
}

async function patchCustomer(id: string, patch: Record<string, unknown>): Promise<void> {
  await api(`/api/customers/${id}`, { method: 'PATCH', body: JSON.stringify(patch) })
}

export async function suspendCustomer(id: string, reason?: string): Promise<void> {
  await patchCustomer(id, { status: 'suspended', cancel_reason: reason ?? null })
}

export async function cancelCustomer(id: string, reason?: string): Promise<void> {
  await patchCustomer(id, {
    status: 'cancelled',
    cancel_date: new Date().toISOString().split('T')[0],
    cancel_reason: reason ?? null,
  })
}

export async function reactivateCustomer(id: string): Promise<void> {
  await patchCustomer(id, { status: 'active', cancel_date: null, cancel_reason: null })
}
