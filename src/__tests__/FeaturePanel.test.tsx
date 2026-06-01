import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import FeaturePanel from '../FeaturePanel'
import { makePointFeature, fiberLineFeature, nodeFeature } from './fixtures'

function renderPanel(feature = null as any, overrides = {}) {
  const props = {
    feature,
    fiberLines: [],
    expanded: true,
    onToggle: vi.fn(),
    onUpdate: vi.fn(),
    onRemove: vi.fn(),
    onDuplicate: vi.fn(),
    onOpenSpliceCard: vi.fn(),
    onOpenRack: vi.fn(),
    ...overrides,
  }
  return { ...render(<FeaturePanel {...props} />), props }
}

describe('FeaturePanel — sin feature', () => {
  it('muestra mensaje vacío cuando no hay feature', () => {
    renderPanel(null)
    expect(screen.getByText(/Seleccioná un elemento/)).toBeTruthy()
  })
})

describe('FeaturePanel — feature genérico (NAP)', () => {
  const feature = makePointFeature('p1', 'NAP 01')

  it('muestra el nombre del feature en el panel toggle', () => {
    renderPanel(feature)
    expect(screen.getByText(/NAP 01/)).toBeTruthy()
  })

  it('llama onUpdate al cambiar nombre', () => {
    const { props } = renderPanel(feature)
    const input = screen.getByDisplayValue('NAP 01')
    fireEvent.change(input, { target: { value: 'NAP 02' } })
    expect(props.onUpdate).toHaveBeenCalledWith('name', 'NAP 02')
  })

  it('llama onRemove al clic en Eliminar', () => {
    const { props } = renderPanel(feature)
    fireEvent.click(screen.getByText('Eliminar'))
    expect(props.onRemove).toHaveBeenCalled()
  })

  it('llama onDuplicate al clic en Duplicar', () => {
    const { props } = renderPanel(feature)
    fireEvent.click(screen.getByText(/Duplicar/))
    expect(props.onDuplicate).toHaveBeenCalled()
  })
})

describe('FeaturePanel — nodo', () => {
  it('muestra botón Ver rack para nodos', () => {
    renderPanel(nodeFeature)
    expect(screen.getByText('Ver rack')).toBeTruthy()
  })

  it('llama onOpenRack al clic en Ver rack', () => {
    const { props } = renderPanel(nodeFeature)
    fireEvent.click(screen.getByText('Ver rack'))
    expect(props.onOpenRack).toHaveBeenCalled()
  })

  it('muestra campos OLT y Mikrotik', () => {
    renderPanel(nodeFeature)
    expect(screen.getByText('OLT')).toBeTruthy()
    expect(screen.getByText('Mikrotik')).toBeTruthy()
  })
})

describe('FeaturePanel — fibra óptica', () => {
  it('muestra sección Fibra óptica', () => {
    renderPanel(fiberLineFeature)
    expect(screen.getByText('Fibra óptica')).toBeTruthy()
  })

  it('muestra campo Longitud trazada', () => {
    renderPanel(fiberLineFeature)
    expect(screen.getByText('Longitud trazada')).toBeTruthy()
  })

  it('llama onUpdate al cambiar atenuación', () => {
    const { props } = renderPanel(fiberLineFeature)
    const inputs = screen.getAllByRole('spinbutton')
    const attInput = inputs.find(i => (i as HTMLInputElement).placeholder === '0.35')
    if (attInput) {
      fireEvent.change(attInput, { target: { value: '0.4' } })
      expect(props.onUpdate).toHaveBeenCalledWith('fiberAttenuationDbPerKm', 0.4)
    }
  })

  it('muestra campo posición de ganancia cuando extraLengthM > 0', () => {
    const withExtra = {
      ...fiberLineFeature,
      properties: { ...fiberLineFeature.properties, extraLengthM: 10 },
    }
    renderPanel(withExtra)
    expect(screen.getByText(/Posición de ganancia/)).toBeTruthy()
  })

  it('no muestra campo posición de ganancia cuando extraLengthM es 0', () => {
    renderPanel(fiberLineFeature)
    expect(screen.queryByText(/Posición de ganancia/)).toBeNull()
  })
})

describe('FeaturePanel — colapso', () => {
  it('no muestra contenido cuando expanded=false', () => {
    renderPanel(nodeFeature, { expanded: false })
    expect(screen.queryByText('Ver rack')).toBeNull()
  })
})
