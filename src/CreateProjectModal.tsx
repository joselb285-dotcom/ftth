import { useEffect, useRef } from 'react'
import L from 'leaflet'
import type { NominatimResult, SubProjectLocation } from './types'
import { reverseGeocode } from './editorConstants'

const defaultCenter: L.LatLngExpression = [-31.4201, -64.1888]

interface Props {
  mode: 'project' | 'subproject'
  name: string
  desc: string
  saving: boolean
  error: string
  locationQuery: string
  locationError: string
  locationSearching: boolean
  locationResults: NominatimResult[]
  selectedLocation: SubProjectLocation | null
  onName: (v: string) => void
  onDesc: (v: string) => void
  onLocationQuery: (v: string) => void
  onClearLocationError: () => void
  onSearchLocation: () => void
  onSelectLocation: (r: NominatimResult) => void
  onClearLocation: () => void
  onSetLocation: (loc: SubProjectLocation) => void
  onSubmit: () => void
  onClose: () => void
}

export default function CreateProjectModal({
  mode, name, desc, saving, error,
  locationQuery, locationError, locationSearching, locationResults, selectedLocation,
  onName, onDesc, onLocationQuery, onClearLocationError, onSearchLocation,
  onSelectLocation, onClearLocation, onSetLocation,
  onSubmit, onClose,
}: Props) {
  const mapElRef = useRef<HTMLDivElement | null>(null)
  const mapRef   = useRef<L.Map | null>(null)
  const markerRef = useRef<L.Marker | null>(null)

  useEffect(() => {
    if (mode !== 'subproject' || !mapElRef.current || mapRef.current) return
    const map = L.map(mapElRef.current, { center: defaultCenter, zoom: 6 })
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 20, attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map)
    map.on('click', async (e: L.LeafletMouseEvent) => {
      const { lat, lng } = e.latlng
      if (markerRef.current) markerRef.current.setLatLng([lat, lng])
      else markerRef.current = L.marker([lat, lng]).addTo(map)
      const { displayName, city } = await reverseGeocode(lat, lng)
      onSetLocation({ lat, lng, displayName, city })
      onLocationQuery('')
    })
    mapRef.current = map
    return () => {
      map.remove()
      mapRef.current = null
      markerRef.current = null
    }
  }, [mode]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const map = mapRef.current
    if (!map || !selectedLocation) return
    const { lat, lng } = selectedLocation
    if (markerRef.current) markerRef.current.setLatLng([lat, lng])
    else markerRef.current = L.marker([lat, lng]).addTo(map)
    map.setView([lat, lng], 13)
  }, [selectedLocation])

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{mode === 'project' ? 'Nuevo proyecto' : 'Nuevo sub-proyecto'}</h2>
        </div>
        <div className="modal-body">
          <div className="form-stack">
            <label>
              Nombre
              <input
                value={name}
                onChange={e => onName(e.target.value)}
                placeholder={mode === 'project' ? 'Ej: Telecom Argentina SA' : 'Ej: Córdoba Capital'}
                autoFocus
                onKeyDown={e => { if (e.key === 'Enter' && mode === 'project') onSubmit() }}
              />
            </label>
            <label>
              Descripción (opcional)
              <input value={desc} onChange={e => onDesc(e.target.value)} placeholder="Descripción breve..." />
            </label>
            {mode === 'subproject' && (
              <>
                <label>
                  Buscar localidad / ciudad
                  <div className="location-search">
                    <input
                      value={locationQuery}
                      onChange={e => { onLocationQuery(e.target.value); onClearLocationError() }}
                      placeholder="Ej: Córdoba, Argentina"
                      onKeyDown={e => e.key === 'Enter' && onSearchLocation()}
                    />
                    <button type="button" className="secondary" onClick={onSearchLocation}
                      disabled={locationSearching || !locationQuery.trim()}>
                      {locationSearching ? 'Buscando...' : 'Buscar'}
                    </button>
                  </div>
                </label>
                {locationError && <p className="location-error">{locationError}</p>}
                {locationResults.length > 0 && !selectedLocation && (
                  <div className="location-results">
                    {locationResults.map(result => (
                      <button key={result.place_id} type="button" className="location-result-item"
                        onClick={() => onSelectLocation(result)}>
                        {result.display_name}
                      </button>
                    ))}
                  </div>
                )}
                <div className="modal-map-label">O hacé clic directamente en el mapa:</div>
                <div ref={mapElRef} className="modal-map" />
                {selectedLocation && (
                  <div className="location-selected">
                    <span>📍 {selectedLocation.displayName}</span>
                    <button type="button" className="secondary small" onClick={onClearLocation}>Quitar</button>
                  </div>
                )}
              </>
            )}
          </div>
          {error && <div className="modal-error">{error}</div>}
        </div>
        <div className="modal-footer">
          <button className="secondary" onClick={onClose} disabled={saving}>Cancelar</button>
          <button onClick={onSubmit} disabled={!name.trim() || saving}>
            {saving ? 'Guardando...' : 'Crear'}
          </button>
        </div>
      </div>
    </div>
  )
}
