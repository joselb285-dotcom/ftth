import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useGisEditor } from '../useGisEditor'
import { makePointFeature, twoHopTopology } from './fixtures'
import type { AppFeature } from '../types'

// ── Module mocks (hoisted before imports) ─────────────────────────────────────

vi.mock('leaflet', () => ({
  default: {
    geoJSON: vi.fn(() => ({
      getBounds: vi.fn(() => ({ isValid: vi.fn(() => false) })),
    })),
  },
}))

vi.mock('jszip')
vi.mock('@tmcw/togeojson', () => ({ kml: vi.fn() }))
vi.mock('shpjs', () => ({ default: vi.fn() }))

// ── Helpers ───────────────────────────────────────────────────────────────────

function renderEditor(currentSubProject = null) {
  const mapRef              = { current: null } as any
  const editableLayerGroupRef = { current: null } as any
  return renderHook(() =>
    useGisEditor({ mapRef, editableLayerGroupRef, currentSubProject })
  )
}

const featureA = makePointFeature('a', 'Caja A')
const featureB = makePointFeature('b', 'Caja B')
const featureC = makePointFeature('c', 'Caja C')

// ── Initial state ─────────────────────────────────────────────────────────────

describe('useGisEditor — initial state', () => {
  it('starts with empty features', () => {
    const { result } = renderEditor()
    expect(result.current.features).toEqual([])
  })

  it('starts with no selection', () => {
    const { result } = renderEditor()
    expect(result.current.selectedFeatureId).toBeNull()
    expect(result.current.selectedFeature).toBeNull()
  })

  it('starts with undo/redo disabled', () => {
    const { result } = renderEditor()
    expect(result.current.canUndo).toBe(false)
    expect(result.current.canRedo).toBe(false)
  })

  it('starts with the default message', () => {
    const { result } = renderEditor()
    expect(result.current.message).toMatch(/Listo/)
  })
})

// ── commitFeatures ────────────────────────────────────────────────────────────

describe('useGisEditor — commitFeatures', () => {
  it('adds features to state', async () => {
    const { result } = renderEditor()
    act(() => { result.current.commitFeatures([featureA, featureB]) })
    await waitFor(() => expect(result.current.features).toHaveLength(2))
  })

  it('enables undo after first commit', async () => {
    const { result } = renderEditor()
    act(() => { result.current.commitFeatures([featureA]) })
    await waitFor(() => expect(result.current.canUndo).toBe(true))
  })

  it('clears redo history on new commit', async () => {
    const { result } = renderEditor()
    // commit → undo → commit again
    act(() => { result.current.commitFeatures([featureA]) })
    await waitFor(() => expect(result.current.canUndo).toBe(true))

    act(() => { result.current.undo() })
    await waitFor(() => expect(result.current.canRedo).toBe(true))

    act(() => { result.current.commitFeatures([featureB]) })
    await waitFor(() => expect(result.current.canRedo).toBe(false))
  })

  it('supports updater function form', async () => {
    const { result } = renderEditor()
    act(() => { result.current.commitFeatures([featureA]) })
    act(() => { result.current.commitFeatures(prev => [...prev, featureB]) })
    await waitFor(() => expect(result.current.features).toHaveLength(2))
  })
})

// ── undo / redo ───────────────────────────────────────────────────────────────

describe('useGisEditor — undo', () => {
  it('restores previous features', async () => {
    const { result } = renderEditor()
    act(() => { result.current.commitFeatures([featureA]) })
    act(() => { result.current.commitFeatures(prev => [...prev, featureB]) })
    await waitFor(() => expect(result.current.features).toHaveLength(2))

    act(() => { result.current.undo() })
    await waitFor(() => expect(result.current.features).toHaveLength(1))
    expect(result.current.features[0].properties.id).toBe('a')
  })

  it('enables redo after undo', async () => {
    const { result } = renderEditor()
    act(() => { result.current.commitFeatures([featureA]) })
    act(() => { result.current.undo() })
    await waitFor(() => expect(result.current.canRedo).toBe(true))
  })

  it('sets message when nothing to undo', async () => {
    const { result } = renderEditor()
    act(() => { result.current.undo() })
    await waitFor(() => expect(result.current.message).toMatch(/Nada que deshacer/))
  })

  it('disables canUndo when history is exhausted', async () => {
    const { result } = renderEditor()
    act(() => { result.current.commitFeatures([featureA]) })
    await waitFor(() => expect(result.current.canUndo).toBe(true))
    act(() => { result.current.undo() })
    await waitFor(() => expect(result.current.canUndo).toBe(false))
  })
})

describe('useGisEditor — redo', () => {
  it('restores undone features', async () => {
    const { result } = renderEditor()
    act(() => { result.current.commitFeatures([featureA, featureB]) })
    act(() => { result.current.undo() })
    await waitFor(() => expect(result.current.features).toHaveLength(0))

    act(() => { result.current.redo() })
    await waitFor(() => expect(result.current.features).toHaveLength(2))
  })

  it('sets message when nothing to redo', async () => {
    const { result } = renderEditor()
    act(() => { result.current.redo() })
    await waitFor(() => expect(result.current.message).toMatch(/Nada que rehacer/))
  })
})

// ── updateSelectedFeature ─────────────────────────────────────────────────────

describe('useGisEditor — updateSelectedFeature', () => {
  it('updates a property on the selected feature', async () => {
    const { result } = renderEditor()
    act(() => { result.current.commitFeatures([featureA]) })
    act(() => { result.current.setSelectedFeatureId('a') })

    act(() => { result.current.updateSelectedFeature('name', 'Nuevo nombre') })

    await waitFor(() => {
      const f = result.current.features.find(x => x.properties.id === 'a')
      expect(f?.properties.name).toBe('Nuevo nombre')
    })
  })

  it('does nothing when no feature is selected', () => {
    const { result } = renderEditor()
    act(() => { result.current.commitFeatures([featureA]) })
    // no setSelectedFeatureId
    act(() => { result.current.updateSelectedFeature('name', 'X') })
    // features unchanged
    expect(result.current.features[0]?.properties.name).toBe('Caja A')
  })
})

// ── removeSelectedFeature ─────────────────────────────────────────────────────

describe('useGisEditor — removeSelectedFeature', () => {
  it('removes the selected feature from the list', async () => {
    const { result } = renderEditor()
    act(() => { result.current.commitFeatures([featureA, featureB]) })
    act(() => { result.current.setSelectedFeatureId('a') })

    act(() => { result.current.removeSelectedFeature() })

    await waitFor(() => {
      expect(result.current.features).toHaveLength(1)
      expect(result.current.features[0].properties.id).toBe('b')
    })
  })

  it('clears selectedFeatureId after removal', async () => {
    const { result } = renderEditor()
    act(() => { result.current.commitFeatures([featureA]) })
    act(() => { result.current.setSelectedFeatureId('a') })
    act(() => { result.current.removeSelectedFeature() })
    await waitFor(() => expect(result.current.selectedFeatureId).toBeNull())
  })
})

// ── initialize ────────────────────────────────────────────────────────────────

describe('useGisEditor — initialize', () => {
  it('resets features to the given list', async () => {
    const { result } = renderEditor()
    act(() => { result.current.commitFeatures([featureA, featureB]) })
    act(() => { result.current.initialize([featureC]) })
    await waitFor(() => {
      expect(result.current.features).toHaveLength(1)
      expect(result.current.features[0].properties.id).toBe('c')
    })
  })

  it('clears undo/redo history', async () => {
    const { result } = renderEditor()
    act(() => { result.current.commitFeatures([featureA]) })
    await waitFor(() => expect(result.current.canUndo).toBe(true))
    act(() => { result.current.initialize([]) })
    await waitFor(() => {
      expect(result.current.canUndo).toBe(false)
      expect(result.current.canRedo).toBe(false)
    })
  })

  it('clears selectedFeatureId', async () => {
    const { result } = renderEditor()
    act(() => { result.current.commitFeatures([featureA]) })
    act(() => { result.current.setSelectedFeatureId('a') })
    act(() => { result.current.initialize([]) })
    await waitFor(() => expect(result.current.selectedFeatureId).toBeNull())
  })
})

// ── importFile — GeoJSON ──────────────────────────────────────────────────────

describe('useGisEditor — importFile (GeoJSON)', () => {
  it('adds imported features to the list', async () => {
    const { result } = renderEditor()
    const geojson = JSON.stringify({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [-64.18, -31.42] },
          properties: { name: 'Importado', featureType: 'nap' },
        },
      ],
    })
    const file = new File([geojson], 'data.geojson', { type: 'application/json' })

    await act(async () => { await result.current.importFile(file) })

    await waitFor(() => expect(result.current.features).toHaveLength(1))
    expect(result.current.features[0].properties.featureType).toBe('nap')
  })

  it('sets error message for invalid JSON', async () => {
    const { result } = renderEditor()
    const file = new File(['not json at all'], 'bad.geojson', { type: 'application/json' })

    await act(async () => { await result.current.importFile(file) })

    await waitFor(() => expect(result.current.message).toMatch(/No se pudo importar/))
  })

  it('sets error message for unsupported file format', async () => {
    const { result } = renderEditor()
    const file = new File(['data'], 'file.csv', { type: 'text/csv' })

    await act(async () => { await result.current.importFile(file) })

    await waitFor(() => expect(result.current.message).toMatch(/No se pudo importar/))
  })
})

// ── powerAlarms derived state ─────────────────────────────────────────────────

describe('useGisEditor — powerAlarms', () => {
  it('returns empty alarms with no features', () => {
    const { result } = renderEditor()
    expect(result.current.powerAlarms).toHaveLength(0)
  })

  it('detects power alarm from splice card fiber', async () => {
    const featureWithAlarm: AppFeature = {
      ...twoHopTopology[1], // spliceBoxFeature
      properties: {
        ...twoHopTopology[1].properties,
        spliceCard: {
          ...twoHopTopology[1].properties.spliceCard!,
          cables: [{
            id: 'cin', name: 'Entrada', side: 'left',
            fibers: [{
              id: 'f_alarm', index: 0, color: 'blue', clientName: 'Cliente Crítico',
              clientInfo: { name: 'Cliente Crítico', onuPowerDbm: '-32' },
            }],
          }],
        },
      },
    }
    const { result } = renderEditor()
    act(() => { result.current.commitFeatures([featureWithAlarm]) })

    await waitFor(() => {
      expect(result.current.powerAlarms).toHaveLength(1)
      expect(result.current.powerAlarms[0].severity).toBe('crit')
    })
  })
})
