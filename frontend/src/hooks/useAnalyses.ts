import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'
import { isActive } from './useAnalysis'

export const analysesKey = ['analyses'] as const

export function useAnalyses() {
  return useQuery({
    queryKey: analysesKey,
    queryFn: api.listAnalyses,
    refetchInterval: (q) => (q.state.data?.some((r) => isActive(r.status)) ? 5000 : false),
  })
}
