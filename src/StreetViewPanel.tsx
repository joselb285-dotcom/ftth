import { useState } from 'react'
import type { AppFeature } from './types'

// ── Coordinate extraction ─────────────────────────────────────────────────────
export function getFeatureLatLng(feature: AppFeature): [number, number] | null {
  const g = feature.geometry
  if (g.type === 'Point') {
    const [lng, lat] = (g as GeoJSON.Point).coordinates
    return [lat, lng]
  }
  if (g.type === 'LineString') {
    const coords = (g as GeoJSON.LineString).coordinates
    const mid = coords[Math.floor(coords.length / 2)]
    return [mid[1], mid[0]]
  }
  if (g.type === 'Polygon') {
    const coords = (g as GeoJSON.Polygon).coordinates[0]
    const lat = coords.reduce((s, c) => s + c[1], 0) / coords.length
    const lng = coords.reduce((s, c) => s + c[0], 0) / coords.length
    return [lat, lng]
  }
  return null
}

// URL to open Google Street View in a new tab (works on mobile app too)
export function streetViewLink(lat: number, lng: number) {
  return `https://www.google.com/maps/@${lat},${lng},3a,90y/data=!3m4!1e1!3m2!1s0x0:0x0!2e0`
}

// Embed URL (no API key required — uses legacy embed format)
function embedUrl(lat: number, lng: number) {
  return `https://www.google.com/maps?q=&layer=c&cbll=${lat},${lng}&cbp=12,0,0,0,0&z=18&output=svembed`
}

// ── Component ─────────────────────────────────────────────────────────────────
interface Props {
  feature: AppFeature
  onClose: () => void
}

export default function StreetViewPanel({ feature, onClose }: Props) {
  const [mode, setMode] = useState<'embed' | 'link'>('embed')
  const coords = getFeatureLatLng(feature)

  if (!coords) return null
  const [lat, lng] = coords
  const name = feature.properties.name || feature.properties.featureType

  return (
    <div className="sv-panel">
      <div className="sv-header">
        <div className="sv-header-left">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="10" r="3"/>
            <path d="M12 2a8 8 0 00-8 8c0 5.4 7.05 11.5 7.73 12.11a.75.75 0 001.54 0C13.95 21.5 20 15.4 20 10a8 8 0 00-8-8z"/>
          </svg>
          <span className="sv-title">Street View</span>
          <span className="sv-feature-name">{name}</span>
        </div>
        <div className="sv-header-actions">
          <a
            href={streetViewLink(lat, lng)}
            target="_blank"
            rel="noopener noreferrer"
            className="sv-open-btn"
            title="Abrir en Google Maps"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/>
              <polyline points="15 3 21 3 21 9"/>
              <line x1="10" y1="14" x2="21" y2="3"/>
            </svg>
            Abrir en Maps
          </a>
          <button className="sv-close" onClick={onClose}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      </div>

      <div className="sv-coords">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="10" r="3"/>
          <path d="M12 2a8 8 0 00-8 8c0 5.4 7.05 11.5 7.73 12.11a.75.75 0 001.54 0C13.95 21.5 20 15.4 20 10a8 8 0 00-8-8z"/>
        </svg>
        {lat.toFixed(6)}, {lng.toFixed(6)}
      </div>

      {mode === 'embed' ? (
        <div className="sv-frame-wrap">
          <iframe
            className="sv-frame"
            src={embedUrl(lat, lng)}
            allowFullScreen
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            title={`Street View — ${name}`}
            onError={() => setMode('link')}
          />
          <div className="sv-frame-overlay-hint">
            <span>Si no carga, usá "Abrir en Maps" ↗</span>
          </div>
        </div>
      ) : (
        <div className="sv-fallback">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="10" r="3"/>
            <path d="M12 2a8 8 0 00-8 8c0 5.4 7.05 11.5 7.73 12.11a.75.75 0 001.54 0C13.95 21.5 20 15.4 20 10a8 8 0 00-8-8z"/>
          </svg>
          <p>Street View no está disponible integrado en este navegador.</p>
          <a href={streetViewLink(lat, lng)} target="_blank" rel="noopener noreferrer" className="sv-fallback-link">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/>
              <polyline points="15 3 21 3 21 9"/>
              <line x1="10" y1="14" x2="21" y2="3"/>
            </svg>
            Abrir Street View en Google Maps
          </a>
        </div>
      )}
    </div>
  )
}
