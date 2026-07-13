import { useState } from 'react'
import L from 'leaflet'
import JSZip from 'jszip'
import { kml as kmlToGeoJSON } from '@tmcw/togeojson'
import shp from 'shpjs'
import type { AppFeature } from './types'
import type { ShapefileMapping } from './ShapefileMapper'
import { normalizeFeature, featureCollection, downloadTextFile } from './editorConstants'
import { logger } from './logger'

type PendingShapefile = {
  features: GeoJSON.Feature[]
  columns: string[]
  samples: Record<string, unknown>[]
}

export function useGisImportExport(
  mapRef: React.RefObject<L.Map | null>,
  commitFeatures: (updater: AppFeature[] | ((prev: AppFeature[]) => AppFeature[])) => void,
  featuresRef: React.RefObject<AppFeature[]>,
  setMessage: (msg: string) => void,
) {
  const [pendingShapefile, setPendingShapefile] = useState<PendingShapefile | null>(null)

  async function importFile(file: File) {
    try {
      let imported: GeoJSON.FeatureCollection
      if (file.name.toLowerCase().endsWith('.kml')) {
        const dom = new DOMParser().parseFromString(await file.text(), 'text/xml')
        imported = kmlToGeoJSON(dom) as GeoJSON.FeatureCollection
      } else if (file.name.toLowerCase().endsWith('.kmz')) {
        const zip = await JSZip.loadAsync(await file.arrayBuffer())
        const kmlEntry = Object.values(zip.files).find(e => e.name.toLowerCase().endsWith('.kml'))
        if (!kmlEntry) throw new Error('El archivo KMZ no contiene un KML legible.')
        const dom = new DOMParser().parseFromString(await kmlEntry.async('string'), 'text/xml')
        imported = kmlToGeoJSON(dom) as GeoJSON.FeatureCollection
      } else if (file.name.toLowerCase().endsWith('.geojson') || file.name.toLowerCase().endsWith('.json')) {
        imported = JSON.parse(await file.text()) as GeoJSON.FeatureCollection
      } else {
        throw new Error('Formato no soportado. Usá KML, KMZ o GeoJSON.')
      }
      const totalRaw = imported.features.length
      const flatFeatures = imported.features.flatMap(f => {
        if (!f.geometry) return []
        const g = f.geometry
        if (g.type === 'MultiPoint') return (g.coordinates as number[][]).map(c => ({ ...f, geometry: { type: 'Point' as const, coordinates: c } }))
        if (g.type === 'MultiLineString') return (g.coordinates as number[][][]).map(c => ({ ...f, geometry: { type: 'LineString' as const, coordinates: c } }))
        if (g.type === 'MultiPolygon') return (g.coordinates as number[][][][]).map(c => ({ ...f, geometry: { type: 'Polygon' as const, coordinates: c } }))
        if (g.type === 'GeometryCollection') return (g as GeoJSON.GeometryCollection).geometries.flatMap(subG => {
          if (['Point','LineString','Polygon'].includes(subG.type)) return [{ ...f, geometry: subG }]
          return []
        })
        return [f]
      })
      const normalized = flatFeatures
        .filter(f => f.geometry && ['Point', 'LineString', 'Polygon'].includes(f.geometry.type))
        .map(normalizeFeature)
      if (normalized.length === 0) {
        const types = [...new Set(imported.features.map(f => f.geometry?.type ?? 'sin geometría'))]
        throw new Error(`No se encontraron elementos importables. El archivo tiene ${totalRaw} elemento(s) con tipos: ${types.join(', ')}.`)
      }
      commitFeatures(current => [...current, ...normalized])
      const bounds = L.geoJSON(imported as any).getBounds()
      if (bounds.isValid()) mapRef.current?.fitBounds(bounds.pad(0.15))
      setMessage(`${normalized.length} elemento(s) importado(s) desde ${file.name}.`)
    } catch (error) {
      logger.error('importFile failed', error)
      setMessage(`No se pudo importar: ${error instanceof Error ? error.message : 'Error desconocido'}`)
    }
  }

  async function importShapefile(file: File) {
    try {
      const result = await shp(await file.arrayBuffer())
      const collection = Array.isArray(result) ? result[0] : result
      const feats = collection.features.filter(
        f => f.geometry && ['Point', 'LineString', 'Polygon'].includes(f.geometry.type)
      )
      if (feats.length === 0) throw new Error('No se encontraron geometrías importables.')
      const columns = Object.keys(feats[0]?.properties ?? {})
      if (columns.length === 0) throw new Error('El archivo DBF no contiene columnas.')
      setPendingShapefile({ features: feats, columns, samples: feats.slice(0, 3).map(f => f.properties as Record<string, unknown>) })
    } catch (error) {
      logger.error('importShapefile failed', error)
      setMessage(`No se pudo importar Shapefile: ${error instanceof Error ? error.message : 'Error desconocido'}`)
    }
  }

  function applyShapefileImport(mapping: ShapefileMapping) {
    if (!pendingShapefile) return
    const normalized = pendingShapefile.features.map(f => {
      const props = (f.properties ?? {}) as Record<string, unknown>
      return normalizeFeature({
        ...f,
        properties: {
          featureType: mapping.featureType,
          name:  String(props[mapping.nameCol]  ?? ''),
          code:  mapping.codeCol  ? String(props[mapping.codeCol]  ?? '') : '',
          notes: mapping.notesCol ? String(props[mapping.notesCol] ?? '') : '',
        },
      })
    })
    commitFeatures(current => [...current, ...normalized])
    const bounds = L.geoJSON({ type: 'FeatureCollection', features: pendingShapefile.features } as any).getBounds()
    if (bounds.isValid()) mapRef.current?.fitBounds(bounds.pad(0.15))
    setMessage(`${normalized.length} elemento(s) importado(s) desde Shapefile.`)
    setPendingShapefile(null)
  }

  function exportGeoJSON(subProjectName: string) {
    const safeName = (subProjectName || 'sub-proyecto').replace(/\s+/g, '-').toLowerCase()
    downloadTextFile(
      `${safeName}-${new Date().toISOString().slice(0, 10)}.geojson`,
      JSON.stringify(featureCollection(featuresRef.current), null, 2),
      'application/geo+json'
    )
    setMessage('Exportado a GeoJSON.')
  }

  return { pendingShapefile, setPendingShapefile, importFile, importShapefile, applyShapefileImport, exportGeoJSON }
}
