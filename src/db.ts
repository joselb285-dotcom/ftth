import { createClient } from '@supabase/supabase-js'
import type { Project } from './types'

const supabase = createClient(
  'https://idjcfiegpzxwuesjgtoe.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlkamNmaWVncHp4d3Vlc2pndG9lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYzMTQ5MjAsImV4cCI6MjA5MTg5MDkyMH0.fi8_1ODrgn-egst4Zbj0ZEuTeBUlC5LULkTSLlTXFnc'
)

export async function dbGetAllProjects(): Promise<Project[]> {
  const { data, error } = await supabase.from('projects').select('data')
  if (error) throw error
  return (data ?? []).map(row => row.data as Project)
}

export async function dbSaveProject(project: Project): Promise<void> {
  const { error } = await supabase
    .from('projects')
    .upsert({ id: project.id, data: project })
  if (error) throw error
}

export async function dbDeleteProject(id: string): Promise<void> {
  const { error } = await supabase.from('projects').delete().eq('id', id)
  if (error) throw error
}
