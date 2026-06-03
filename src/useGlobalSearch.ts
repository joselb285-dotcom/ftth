import { useMemo } from 'react'
import type { FeatureKind } from './types'
import type { Project } from './types'
import { typeLabels } from './editorConstants'

export interface SearchResult {
  id: string           // unique key for React
  kind: 'feature' | 'client'
  // Location
  projectId: string
  projectName: string
  subProjectId: string
  subProjectName: string
  // Feature
  featureId: string
  featureName: string
  featureType: FeatureKind
  featureCode: string
  featureTypeLabel: string
  // Geometry (for zooming)
  geometry: GeoJSON.Geometry
  // Client-specific
  clientName?: string
  clientAddress?: string
  clientPhone?: string
  onuSerial?: string
  onuModel?: string
  cable?: string
  fiber?: string
  powerDbm?: string
  // Which field matched
  matchField: string
  matchValue: string
}

export interface SearchIndex {
  search: (query: string) => SearchResult[]
}

function normalize(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')
}

export function useGlobalSearch(projects: Project[]): SearchIndex {
  return useMemo(() => {
    // Build flat list of searchable items
    const items: SearchResult[] = []

    for (const project of projects) {
      for (const sp of project.subProjects) {
        for (const feature of sp.features) {
          const p = feature.properties
          const base = {
            projectId: project.id,
            projectName: project.name,
            subProjectId: sp.id,
            subProjectName: sp.name,
            featureId: p.id,
            featureName: p.name,
            featureType: p.featureType,
            featureCode: p.code,
            featureTypeLabel: typeLabels[p.featureType],
            geometry: feature.geometry,
          }

          // Index by name
          if (p.name) items.push({ ...base, id: `n-${p.id}`, kind: 'feature', matchField: 'nombre', matchValue: p.name })
          // Index by code
          if (p.code) items.push({ ...base, id: `c-${p.id}`, kind: 'feature', matchField: 'código', matchValue: p.code })

          // Index clients from splice cards
          if (p.spliceCard) {
            for (const cable of p.spliceCard.cables) {
              for (const fiber of cable.fibers) {
                const clientName = fiber.clientInfo?.name || fiber.clientName
                if (!clientName && !fiber.clientInfo?.onuSerial && !fiber.clientInfo?.address) continue

                const clientBase: SearchResult = {
                  ...base,
                  id: `cl-${p.id}-${fiber.id}`,
                  kind: 'client',
                  matchField: 'cliente',
                  matchValue: clientName || '',
                  clientName: clientName || '',
                  clientAddress: fiber.clientInfo?.address,
                  clientPhone: fiber.clientInfo?.phone,
                  onuSerial: fiber.clientInfo?.onuSerial,
                  onuModel: fiber.clientInfo?.onuModel,
                  cable: cable.name,
                  fiber: `F${fiber.index}`,
                  powerDbm: fiber.clientInfo?.onuPowerDbm,
                }

                if (clientName) items.push({ ...clientBase, id: `cl-n-${p.id}-${fiber.id}`, matchField: 'cliente', matchValue: clientName })
                if (fiber.clientInfo?.onuSerial) items.push({ ...clientBase, id: `cl-s-${p.id}-${fiber.id}`, matchField: 'serie ONU', matchValue: fiber.clientInfo.onuSerial })
                if (fiber.clientInfo?.address) items.push({ ...clientBase, id: `cl-a-${p.id}-${fiber.id}`, matchField: 'dirección', matchValue: fiber.clientInfo.address })
              }
            }
          }
        }
      }
    }

    function search(query: string): SearchResult[] {
      const q = normalize(query.trim())
      if (q.length < 2) return []

      const seen = new Set<string>()
      const results: SearchResult[] = []

      for (const item of items) {
        const norm = normalize(item.matchValue)
        if (!norm.includes(q)) continue

        // Deduplicate by (subProjectId + featureId + kind + fiber)
        const dedupeKey = `${item.subProjectId}:${item.featureId}:${item.kind}:${item.cable ?? ''}:${item.fiber ?? ''}`
        if (seen.has(dedupeKey)) continue
        seen.add(dedupeKey)

        results.push(item)
        if (results.length >= 60) break
      }

      // Sort: exact match first, then by subproject proximity
      results.sort((a, b) => {
        const qa = normalize(a.matchValue).startsWith(q) ? 0 : 1
        const qb = normalize(b.matchValue).startsWith(q) ? 0 : 1
        return qa - qb || a.projectName.localeCompare(b.projectName)
      })

      return results.slice(0, 40)
    }

    return { search }
  }, [projects])
}
