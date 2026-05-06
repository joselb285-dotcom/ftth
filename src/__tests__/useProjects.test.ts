import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useProjects } from '../useProjects'
import type { Project } from '../types'

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('../db', () => ({
  dbGetAllProjects: vi.fn(),
  dbSaveProject:    vi.fn(),
  dbDeleteProject:  vi.fn(),
}))

// Mock geocodeLocation so network calls are never made in tests
vi.mock('../editorConstants', async importOriginal => {
  const actual = await importOriginal<typeof import('../editorConstants')>()
  return {
    ...actual,
    geocodeLocation: vi.fn().mockResolvedValue([
      { place_id: 1, display_name: 'Córdoba, Argentina', lat: '-31.42', lon: '-64.18' },
    ]),
  }
})

import { dbGetAllProjects, dbSaveProject, dbDeleteProject } from '../db'
const mockGetAll = vi.mocked(dbGetAllProjects)
const mockSave   = vi.mocked(dbSaveProject)
const mockDelete = vi.mocked(dbDeleteProject)

// ── Fixture ───────────────────────────────────────────────────────────────────

const sampleProject: Project = {
  id: 'proj1',
  name: 'Proyecto Test',
  description: '',
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
  subProjects: [
    {
      id: 'sp1', name: 'Sub 1', description: '',
      createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z',
      features: [],
    },
  ],
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetAll.mockResolvedValue([sampleProject])
  mockSave.mockResolvedValue(undefined)
  mockDelete.mockResolvedValue(undefined)
})

// ── Initial state ─────────────────────────────────────────────────────────────

describe('useProjects — initial state', () => {
  it('starts at home view with no projects loaded', () => {
    const { result } = renderHook(() => useProjects(null))
    expect(result.current.view).toBe('home')
    expect(result.current.projects).toEqual([])
    expect(result.current.dbLoaded).toBe(false)
  })

  it('does not call dbGetAllProjects when tenantId is null', () => {
    renderHook(() => useProjects(null))
    expect(mockGetAll).not.toHaveBeenCalled()
  })
})

// ── DB loading ────────────────────────────────────────────────────────────────

describe('useProjects — DB loading', () => {
  it('loads projects when tenantId is provided', async () => {
    const { result } = renderHook(() => useProjects('tenant1'))
    await waitFor(() => expect(result.current.dbLoaded).toBe(true))
    expect(mockGetAll).toHaveBeenCalledWith('tenant1')
    expect(result.current.projects).toHaveLength(1)
    expect(result.current.projects[0].id).toBe('proj1')
  })

  it('sets dbLoaded:true even if load throws', async () => {
    mockGetAll.mockRejectedValueOnce(new Error('DB down'))
    const { result } = renderHook(() => useProjects('tenant1'))
    await waitFor(() => expect(result.current.dbLoaded).toBe(true))
    expect(result.current.projects).toEqual([])
  })
})

// ── Navigation ────────────────────────────────────────────────────────────────

describe('useProjects — navigation', () => {
  it('openSubProjects sets view and projectId', async () => {
    const { result } = renderHook(() => useProjects('tenant1'))
    await waitFor(() => expect(result.current.dbLoaded).toBe(true))

    act(() => { result.current.openSubProjects('proj1') })

    expect(result.current.view).toBe('subprojects')
    expect(result.current.currentProjectId).toBe('proj1')
  })

  it('openEditor sets view and subProjectId', () => {
    const { result } = renderHook(() => useProjects('tenant1'))

    act(() => { result.current.openSubProjects('proj1') })
    act(() => { result.current.openEditor('sp1') })

    expect(result.current.view).toBe('editor')
    expect(result.current.currentSubProjectId).toBe('sp1')
  })

  it('goHome resets view and ids', () => {
    const { result } = renderHook(() => useProjects('tenant1'))

    act(() => { result.current.openSubProjects('proj1') })
    act(() => { result.current.openEditor('sp1') })
    act(() => { result.current.goHome() })

    expect(result.current.view).toBe('home')
    expect(result.current.currentProjectId).toBeNull()
    expect(result.current.currentSubProjectId).toBeNull()
  })

  it('goToSubProjects resets subProjectId and view', () => {
    const { result } = renderHook(() => useProjects('tenant1'))

    act(() => { result.current.openSubProjects('proj1') })
    act(() => { result.current.openEditor('sp1') })
    act(() => { result.current.goToSubProjects() })

    expect(result.current.view).toBe('subprojects')
    expect(result.current.currentSubProjectId).toBeNull()
  })
})

// ── currentProject / currentSubProject derived values ─────────────────────────

describe('useProjects — derived values', () => {
  it('currentProject is null when no project is open', async () => {
    const { result } = renderHook(() => useProjects('tenant1'))
    await waitFor(() => expect(result.current.dbLoaded).toBe(true))
    expect(result.current.currentProject).toBeNull()
  })

  it('currentProject resolves after openSubProjects', async () => {
    const { result } = renderHook(() => useProjects('tenant1'))
    await waitFor(() => expect(result.current.dbLoaded).toBe(true))
    act(() => { result.current.openSubProjects('proj1') })
    expect(result.current.currentProject?.id).toBe('proj1')
  })

  it('currentSubProject resolves after openEditor', async () => {
    const { result } = renderHook(() => useProjects('tenant1'))
    await waitFor(() => expect(result.current.dbLoaded).toBe(true))
    act(() => { result.current.openSubProjects('proj1') })
    act(() => { result.current.openEditor('sp1') })
    expect(result.current.currentSubProject?.id).toBe('sp1')
  })
})

// ── Modal ─────────────────────────────────────────────────────────────────────

describe('useProjects — modal', () => {
  it('openCreateModal(project) opens modal in project mode', () => {
    const { result } = renderHook(() => useProjects('tenant1'))
    act(() => { result.current.openCreateModal('project') })
    expect(result.current.modalOpen).toBe(true)
    expect(result.current.modalMode).toBe('project')
    expect(result.current.modalName).toBe('')
  })

  it('openCreateModal(subproject) opens modal in subproject mode', () => {
    const { result } = renderHook(() => useProjects('tenant1'))
    act(() => { result.current.openCreateModal('subproject') })
    expect(result.current.modalOpen).toBe(true)
    expect(result.current.modalMode).toBe('subproject')
  })

  it('closeModal closes modal', () => {
    const { result } = renderHook(() => useProjects('tenant1'))
    act(() => { result.current.openCreateModal('project') })
    act(() => { result.current.closeModal() })
    expect(result.current.modalOpen).toBe(false)
  })

  it('submitModal creates project and adds it to list', async () => {
    const { result } = renderHook(() => useProjects('tenant1'))

    act(() => { result.current.openCreateModal('project') })
    act(() => { result.current.setModalName('Proyecto Nuevo') })

    await act(async () => { await result.current.submitModal() })

    expect(mockSave).toHaveBeenCalledTimes(1)
    expect(result.current.projects.some(p => p.name === 'Proyecto Nuevo')).toBe(true)
    expect(result.current.modalOpen).toBe(false)
  })

  it('submitModal does nothing when name is empty', async () => {
    const { result } = renderHook(() => useProjects('tenant1'))
    act(() => { result.current.openCreateModal('project') })
    // modalName stays ''
    await act(async () => { await result.current.submitModal() })
    expect(mockSave).not.toHaveBeenCalled()
  })
})

// ── deleteProject ─────────────────────────────────────────────────────────────

describe('useProjects — deleteProject', () => {
  it('removes project from list after delete', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const { result } = renderHook(() => useProjects('tenant1'))
    await waitFor(() => expect(result.current.dbLoaded).toBe(true))

    await act(async () => { await result.current.deleteProject('proj1') })

    expect(mockDelete).toHaveBeenCalledWith('proj1', 'tenant1')
    expect(result.current.projects).toHaveLength(0)
  })

  it('does not delete when confirm is cancelled', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    const { result } = renderHook(() => useProjects('tenant1'))
    await waitFor(() => expect(result.current.dbLoaded).toBe(true))

    await act(async () => { await result.current.deleteProject('proj1') })

    expect(mockDelete).not.toHaveBeenCalled()
    expect(result.current.projects).toHaveLength(1)
  })
})

// ── handleSearchLocation ──────────────────────────────────────────────────────

describe('useProjects — handleSearchLocation', () => {
  it('populates locationResults on success', async () => {
    const { result } = renderHook(() => useProjects('tenant1'))

    act(() => { result.current.setLocationQuery('Córdoba') })
    await act(async () => { await result.current.handleSearchLocation() })

    await waitFor(() => expect(result.current.locationResults).toHaveLength(1))
    expect(result.current.locationResults[0].display_name).toBe('Córdoba, Argentina')
  })

  it('does nothing when query is blank', async () => {
    const { result } = renderHook(() => useProjects('tenant1'))
    // locationQuery starts as ''
    await act(async () => { await result.current.handleSearchLocation() })
    expect(result.current.locationResults).toHaveLength(0)
  })
})
