import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import FeatureList from '../FeatureList'
import { makePointFeature, fiberLineFeature } from './fixtures'

const features = [
  makePointFeature('n1', 'Nodo Central'),
  makePointFeature('n2', 'NAP Norte'),
  { ...fiberLineFeature, properties: { ...fiberLineFeature.properties, id: 'l1', name: 'Fibra Principal' } },
]

function renderList(overrides = {}) {
  const props = {
    features,
    selectedFeatureId: null,
    selectedFeatureIds: new Set<string>(),
    expanded: true,
    onToggle: vi.fn(),
    onSelect: vi.fn(),
    onToggleMulti: vi.fn(),
    onZoom: vi.fn(),
    ...overrides,
  }
  return { ...render(<FeatureList {...props} />), props }
}

describe('FeatureList', () => {
  it('muestra el conteo de elementos', () => {
    renderList()
    expect(screen.getByText(/Elementos \(3\)/)).toBeTruthy()
  })

  it('renderiza todos los features', () => {
    renderList()
    expect(screen.getByText('Nodo Central')).toBeTruthy()
    expect(screen.getByText('NAP Norte')).toBeTruthy()
    expect(screen.getByText('Fibra Principal')).toBeTruthy()
  })

  it('llama onSelect al hacer clic normal', () => {
    const { props } = renderList()
    fireEvent.click(screen.getByText('Nodo Central'))
    expect(props.onSelect).toHaveBeenCalledWith('n1')
    expect(props.onToggleMulti).not.toHaveBeenCalled()
  })

  it('llama onToggleMulti con Ctrl+Click', () => {
    const { props } = renderList()
    const row = screen.getByText('NAP Norte').closest('button')!
    fireEvent.click(row, { ctrlKey: true })
    expect(props.onToggleMulti).toHaveBeenCalledWith('n2')
    expect(props.onSelect).not.toHaveBeenCalled()
  })

  it('aplica clase selected al feature seleccionado', () => {
    renderList({ selectedFeatureId: 'n1' })
    const row = screen.getByText('Nodo Central').closest('button')!
    expect(row.className).toContain('selected')
  })

  it('aplica clase multi-selected a features en selección múltiple', () => {
    renderList({ selectedFeatureIds: new Set(['n2']) })
    const row = screen.getByText('NAP Norte').closest('button')!
    expect(row.className).toContain('multi-selected')
  })

  it('muestra buscador cuando hay más de 3 elementos', () => {
    const extra = [...features, makePointFeature('n4', 'Extra')]
    renderList({ features: extra })
    expect(screen.getByPlaceholderText(/Buscar nombre/)).toBeTruthy()
  })

  it('no muestra buscador con 3 o menos elementos', () => {
    renderList()
    expect(screen.queryByPlaceholderText(/Buscar nombre/)).toBeNull()
  })

  it('filtra por nombre', async () => {
    const extra = [...features, makePointFeature('n4', 'Extra')]
    renderList({ features: extra })
    const input = screen.getByPlaceholderText(/Buscar nombre/) as HTMLInputElement
    fireEvent.change(input, { target: { value: 'norte' } })
    expect(screen.getByText('NAP Norte')).toBeTruthy()
    expect(screen.queryByText('Nodo Central')).toBeNull()
  })

  it('muestra botón de zoom al hacer hover (existe en DOM)', () => {
    renderList()
    const zoomBtns = document.querySelectorAll('.feature-zoom-btn')
    expect(zoomBtns.length).toBe(features.length)
  })

  it('llama onZoom al clic en botón de zoom', () => {
    const { props } = renderList()
    const zoomBtns = document.querySelectorAll('.feature-zoom-btn')
    fireEvent.click(zoomBtns[0])
    expect(props.onZoom).toHaveBeenCalledWith('n1')
    expect(props.onSelect).not.toHaveBeenCalled()
  })

  it('colapsa contenido cuando expanded=false', () => {
    renderList({ expanded: false })
    expect(screen.queryByText('Nodo Central')).toBeNull()
  })
})
