import type { Project } from './types'

const KEY = 'ftth_projects'

function load(): Project[] {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function save(projects: Project[]): void {
  localStorage.setItem(KEY, JSON.stringify(projects))
}

export async function dbGetAllProjects(): Promise<Project[]> {
  return load()
}

export async function dbSaveProject(project: Project): Promise<void> {
  const projects = load()
  const idx = projects.findIndex(p => p.id === project.id)
  if (idx >= 0) projects[idx] = project
  else projects.push(project)
  save(projects)
}

export async function dbDeleteProject(id: string): Promise<void> {
  save(load().filter(p => p.id !== id))
}
