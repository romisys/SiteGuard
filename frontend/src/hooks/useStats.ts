import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'

export const statsKey = ['stats'] as const

export function useStats() {
  return useQuery({ queryKey: statsKey, queryFn: api.stats })
}
