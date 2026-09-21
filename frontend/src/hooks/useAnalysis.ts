import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'
import type { AnalysisStatus } from '../api/types'

export const ACTIVE_STATUSES: AnalysisStatus[] = ['pending', 'processing']

export function isActive(status: AnalysisStatus | undefined): boolean {
  return status !== undefined && ACTIVE_STATUSES.includes(status)
}

export const analysisKey = (id: string) => ['analysis', id] as const

export function useAnalysis(id: string, { pollMs = 2000 }: { pollMs?: number } = {}) {
  return useQuery({
    queryKey: analysisKey(id),
    queryFn: () => api.getAnalysis(id),
    refetchInterval: (query) => (isActive(query.state.data?.status) ? pollMs : false),
  })
}
