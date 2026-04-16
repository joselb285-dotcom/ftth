import { collection, doc, getDocs, setDoc, deleteDoc } from 'firebase/firestore'
import { db } from './firebase'
import type { Project } from './types'

const COLLECTION = 'projects'

export async function dbGetAllProjects(): Promise<Project[]> {
  const snapshot = await getDocs(collection(db, COLLECTION))
  return snapshot.docs.map(d => d.data() as Project)
}

export async function dbSaveProject(project: Project): Promise<void> {
  await setDoc(doc(db, COLLECTION, project.id), project)
}

export async function dbDeleteProject(id: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTION, id))
}
