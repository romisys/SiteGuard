import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'

export const analysesKey = ['analyses'] as const

export function useAnalyses() {
  return useQuery({ queryKey: analysesKey, queryFn: api.listAnalyses })
}
