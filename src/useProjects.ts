import { useCallback, useEffect, useRef, useState } from 'react'
import type { AppView, NominatimResult, Project, SubProject, SubProjectLocation } from './types'
import type { UserRole } from './AuthContext'
import { dbGetAllProjects, dbSaveProject, dbDeleteProject } from './db'
import { makeId, now, geocodeLocation } from './editorConstants'

export type SaveStatus = 'saved' | 'unsaved' | 'saving' | 'error'

export function useProjects(
  tenantId: string | null,
  userId: string | null = null,
  role: UserRole = 'admin',
  adminId: string | null = null,
) {
  // ownerId: admin usa su propio ID; user usa el ID de su admin
  const ownerIdRef = useRef<string | null>(null)
  useEffect(() => {
    ownerIdRef.current = role === 'user' ? adminId : userId
  }, [role, userId, adminId])
  // ── Navigation ──────────────────────────────────────────────────────────────
  const [view, setView]                         = useState<AppView>('home')
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null)
  const [currentSubProjectId, setCurrentSubProjectId] = useState<string | null>(null)

  // ── Data ────────────────────────────────────────────────────────────────────
  const [projects, setProjects] = useState<Project[]>([])
  const [dbLoaded, setDbLoaded] = useState(false)

  // ── Save ────────────────────────────────────────────────────────────────────
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved')
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const tenantIdRef  = useRef<string | null>(null)
  useEffect(() => { tenantIdRef.current = tenantId }, [tenantId])

  // ── Modal (project / subproject creation) ───────────────────────────────────
  const [modalOpen,    setModalOpen]    = useState(false)
  const [modalMode,    setModalMode]    = useState<'project' | 'subproject'>('project')
  const [modalName,    setModalName]    = useState('')
  const [modalDesc,    setModalDesc]    = useState('')
  const [modalError,   setModalError]   = useState('')
  const [modalSaving,  setModalSaving]  = useState(false)

  // ── Location search (subproject modal) ──────────────────────────────────────
  const [locationQuery,     setLocationQuery]     = useState('')
  const [locationResults,   setLocationResults]   = useState<NominatimResult[]>([])
  const [locationSearching, setLocationSearching] = useState(false)
  const [locationError,     setLocationError]     = useState('')
  const [selectedLocation,  setSelectedLocation]  = useState<SubProjectLocation | null>(null)

  // ── Derived ─────────────────────────────────────────────────────────────────
  const currentProject    = projects.find(p => p.id === currentProjectId) ?? null
  const currentSubProject = currentProject?.subProjects.find(sp => sp.id === currentSubProjectId) ?? null

  // ── Load from DB ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!tenantId || !userId) return
    dbGetAllProjects(tenantId)
      .then(loaded => { setProjects(loaded); setDbLoaded(true) })
      .catch(() => setDbLoaded(true))
  }, [tenantId, userId])

  // ── Save helpers ─────────────────────────────────────────────────────────────
  const scheduleSave = useCallback((project: Project) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    setSaveStatus('unsaved')
    saveTimerRef.current = setTimeout(async () => {
      if (!ownerIdRef.current) { setSaveStatus('error'); return }
      setSaveStatus('saving')
      try {
        await dbSaveProject(project, tenantIdRef.current!, ownerIdRef.current)
        setSaveStatus('saved')
      } catch { setSaveStatus('error') }
    }, 800)
  }, [])

  const saveNow = useCallback(async (project: Project): Promise<boolean> => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    if (!ownerIdRef.current) { setSaveStatus('error'); return false }
    setSaveStatus('saving')
    try {
      await dbSaveProject(project, tenantIdRef.current!, ownerIdRef.current)
      setSaveStatus('saved')
      return true
    } catch {
      setSaveStatus('error')
      return false
    }
  }, [])

  // ── Navigation ───────────────────────────────────────────────────────────────
  function openSubProjects(projectId: string) {
    setCurrentProjectId(projectId)
    setView('subprojects')
  }

  function openEditor(subProjectId: string) {
    setCurrentSubProjectId(subProjectId)
    setView('editor')
  }

  function goHome() {
    setCurrentProjectId(null)
    setCurrentSubProjectId(null)
    setView('home')
  }

  function goToSubProjects() {
    setCurrentSubProjectId(null)
    setView('subprojects')
  }

  function openCustomers() { setView('customers') }
  function openMonitoring() { setView('monitoring') }

  // ── Project CRUD ─────────────────────────────────────────────────────────────
  async function deleteProject(id: string) {
    if (!confirm('¿Eliminar este proyecto y todos sus sub-proyectos?')) return
    await dbDeleteProject(id, tenantIdRef.current!)
    setProjects(prev => prev.filter(p => p.id !== id))
  }

  async function deleteSubProject(id: string) {
    if (!confirm('¿Eliminar este sub-proyecto y todos sus elementos?')) return
    const proj = projects.find(p => p.id === currentProjectId)
    if (!proj || !ownerIdRef.current) return
    const saved = { ...proj, updatedAt: now(), subProjects: proj.subProjects.filter(sp => sp.id !== id) }
    await dbSaveProject(saved, tenantIdRef.current!, ownerIdRef.current)
    setProjects(prev => prev.map(p => p.id === currentProjectId ? saved : p))
  }

  // ── OLT management ────────────────────────────────────────────────────────────
  function patchSubProjectOlts(hosts: string[]) {
    if (!currentProjectId || !currentSubProjectId) return
    setProjects(prev => {
      const updated = prev.map(p =>
        p.id !== currentProjectId ? p : {
          ...p,
          subProjects: p.subProjects.map(sp =>
            sp.id !== currentSubProjectId ? sp
              : { ...sp, zabbixOltHosts: hosts.length ? hosts : undefined }
          ),
        }
      )
      const up = updated.find(p => p.id === currentProjectId)
      if (up) scheduleSave(up)
      return updated
    })
  }

  // ── Modal ─────────────────────────────────────────────────────────────────────
  function openCreateModal(mode: 'project' | 'subproject') {
    setModalMode(mode)
    setModalName('')
    setModalDesc('')
    setModalError('')
    setModalSaving(false)
    setLocationQuery('')
    setLocationResults([])
    setLocationError('')
    setSelectedLocation(null)
    setModalOpen(true)
  }

  function closeModal() {
    setModalOpen(false)
    setModalError('')
    setModalSaving(false)
  }

  async function submitModal(extraLocation?: SubProjectLocation | null) {
    if (!modalName.trim()) return
    setModalError('')
    setModalSaving(true)
    try {
      if (!ownerIdRef.current) throw new Error('Sin permisos para guardar')
      if (modalMode === 'project') {
        const newProject: Project = {
          id: makeId(), name: modalName.trim(), description: modalDesc.trim(),
          createdAt: now(), updatedAt: now(), subProjects: [],
        }
        await dbSaveProject(newProject, tenantIdRef.current!, ownerIdRef.current)
        setProjects(prev => [...prev, newProject])
      } else {
        if (!currentProjectId) return
        const newSP: SubProject = {
          id: makeId(), name: modalName.trim(), description: modalDesc.trim(),
          createdAt: now(), updatedAt: now(),
          location: extraLocation ?? undefined, features: [],
        }
        const proj = projects.find(p => p.id === currentProjectId)
        if (!proj) return
        const saved = { ...proj, updatedAt: now(), subProjects: [...proj.subProjects, newSP] }
        await dbSaveProject(saved, tenantIdRef.current!, ownerIdRef.current)
        setProjects(prev => prev.map(p => p.id === currentProjectId ? saved : p))
      }
      closeModal()
    } catch (err) {
      setModalError('Error al guardar: ' + String(err))
      setModalSaving(false)
    }
  }

  // ── Location search ───────────────────────────────────────────────────────────
  async function handleSearchLocation() {
    if (!locationQuery.trim()) return
    setLocationSearching(true)
    setLocationError('')
    setLocationResults([])
    try {
      const results = await geocodeLocation(locationQuery)
      if (results.length === 0) setLocationError('No se encontraron resultados. Probá con otro nombre.')
      else setLocationResults(results)
    } catch { setLocationError('No se pudo conectar al servicio de geocodificación.') }
    finally { setLocationSearching(false) }
  }

  function selectLocation(result: NominatimResult) {
    setSelectedLocation({ lat: parseFloat(result.lat), lng: parseFloat(result.lon), displayName: result.display_name })
    setLocationResults([])
  }

  function clearSelectedLocation() {
    setSelectedLocation(null)
    setLocationResults([])
    setLocationQuery('')
  }

  return {
    // State
    view, setView,
    projects, setProjects,
    dbLoaded,
    currentProjectId, setCurrentProjectId,
    currentSubProjectId, setCurrentSubProjectId,
    currentProject, currentSubProject,
    saveStatus, setSaveStatus,
    tenantIdRef,
    // Save
    scheduleSave, saveNow,
    // Navigation
    openSubProjects, openEditor, goHome, goToSubProjects, openCustomers, openMonitoring,
    // CRUD
    deleteProject, deleteSubProject, patchSubProjectOlts,
    // Modal
    modalOpen, modalMode,
    modalName, setModalName,
    modalDesc, setModalDesc,
    modalError, modalSaving,
    openCreateModal, closeModal, submitModal,
    // Location
    locationQuery, setLocationQuery,
    locationResults, locationSearching, locationError, setLocationError,
    selectedLocation, setSelectedLocation,
    handleSearchLocation, selectLocation, clearSelectedLocation,
  }
}
