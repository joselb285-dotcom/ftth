import { useAuth } from './AuthContext'
import LoginPage from './LoginPage'
import ProjectListView from './ProjectListView'
import SubProjectListView from './SubProjectListView'
import FieldMapView from './FieldMapView'
import { useEffect, useRef, useState } from 'react'
import type { Project, SubProject } from './types'
import { getAllCachedSubProjects } from './cache'

export type FieldView = 'projects' | 'subprojects' | 'map'

const NAV_KEY = 'ftth-nav'

type SavedNav = { view: FieldView; projectId: string | null; subProjectId: string | null }

function readNav(): SavedNav | null {
  try {
    const raw = sessionStorage.getItem(NAV_KEY)
    return raw ? (JSON.parse(raw) as SavedNav) : null
  } catch { return null }
}

export default function App() {
  const { user, loading } = useAuth()
  const [view, setView]                           = useState<FieldView>('projects')
  const [selectedProject, setSelectedProject]     = useState<Project | null>(null)
  const [selectedSubProject, setSelectedSubProject] = useState<SubProject | null>(null)

  // Capture saved nav before any effect overwrites it
  const savedNav = useRef<SavedNav | null>(readNav())

  // Persist nav on every change (only while logged in)
  useEffect(() => {
    if (!user) return
    sessionStorage.setItem(NAV_KEY, JSON.stringify({
      view,
      projectId: selectedProject?.id ?? null,
      subProjectId: selectedSubProject?.id ?? null,
    }))
  }, [view, selectedProject, selectedSubProject, user])

  // Restore nav once after auth resolves
  useEffect(() => {
    if (!user) return
    const saved = savedNav.current
    if (!saved || saved.view === 'projects') return

    getAllCachedSubProjects().then(cached => {
      if (saved.view === 'subprojects' && saved.projectId) {
        const entries = cached.filter(c => c.projectId === saved.projectId)
        if (entries.length === 0) return
        setSelectedProject({
          id: entries[0].projectId,
          name: entries[0].projectName,
          description: '', createdAt: '', updatedAt: '',
          subProjects: entries.map(e => e.subProject),
        })
        setView('subprojects')
      } else if (saved.view === 'map' && saved.projectId && saved.subProjectId) {
        const spEntry = cached.find(
          c => c.projectId === saved.projectId && c.subProject.id === saved.subProjectId
        )
        if (!spEntry) return
        setSelectedProject({
          id: spEntry.projectId,
          name: spEntry.projectName,
          description: '', createdAt: '', updatedAt: '',
          subProjects: cached.filter(c => c.projectId === saved.projectId).map(e => e.subProject),
        })
        setSelectedSubProject(spEntry.subProject)
        setView('map')
      }
    })
  }, [user])

  if (loading) {
    return (
      <div className="splash">
        <div className="splash-spinner" />
      </div>
    )
  }

  if (!user) return <LoginPage />

  if (view === 'map' && selectedProject && selectedSubProject) {
    return (
      <FieldMapView
        project={selectedProject}
        subProject={selectedSubProject}
        onBack={() => setView('subprojects')}
      />
    )
  }

  if (view === 'subprojects' && selectedProject) {
    return (
      <SubProjectListView
        project={selectedProject}
        onBack={() => { setView('projects'); setSelectedProject(null) }}
        onOpenSubProject={sp => {
          setSelectedSubProject(sp)
          setView('map')
        }}
      />
    )
  }

  return (
    <ProjectListView
      onOpenProject={p => {
        setSelectedProject(p)
        setView('subprojects')
      }}
    />
  )
}
