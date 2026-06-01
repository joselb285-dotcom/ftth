import { useState } from 'react'

interface Props {
  subProjectName: string
  oltHosts: string[]
  rackHosts: string[]
  onAdd: (host: string) => void
  onRemove: (host: string) => void
  onClose: () => void
}

export default function OltManagerDropdown({
  subProjectName,
  oltHosts,
  rackHosts,
  onAdd,
  onRemove,
  onClose,
}: Props) {
  const [newHost, setNewHost] = useState('')

  function handleAdd() {
    const h = newHost.trim()
    if (!h) return
    onAdd(h)
    setNewHost('')
  }

  const rackOnlyHosts = rackHosts.filter(h => !oltHosts.includes(h))

  return (
    <div className="olt-manager-panel" onClick={e => e.stopPropagation()}>
      <div className="olt-manager-title">OLTs — {subProjectName}</div>

      {oltHosts.map(h => (
        <div key={h} className="olt-manager-host-row">
          <span className="olt-manager-host-badge">{h}</span>
          <button className="danger compact" style={{ fontSize: '0.7rem', padding: '2px 6px' }} onClick={() => onRemove(h)}>✕</button>
        </div>
      ))}

      {oltHosts.length === 0 && (
        <div className="olt-manager-empty">Sin OLTs configuradas</div>
      )}

      {rackOnlyHosts.map(h => (
        <div key={h} className="olt-manager-host-row">
          <span className="olt-manager-host-badge olt-manager-host-badge--rack">
            {h} <span className="olt-manager-host-badge--rack-label">(rack)</span>
          </span>
          <button className="secondary" style={{ fontSize: '0.7rem', padding: '2px 6px' }} onClick={() => onAdd(h)}>+ Agregar</button>
        </div>
      ))}

      <div className="olt-manager-input-row">
        <input
          className="olt-manager-input"
          value={newHost}
          onChange={e => setNewHost(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAdd()}
          placeholder="Hostname OLT en Zabbix"
        />
        <button className="secondary" style={{ fontSize: '0.75rem' }} onClick={handleAdd}>+</button>
      </div>

      <button className="secondary" style={{ marginTop: 8, fontSize: '0.72rem', width: '100%' }} onClick={onClose}>Cerrar</button>
    </div>
  )
}
