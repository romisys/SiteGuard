import type { AnalysisDetail, AnalysisSummary, Created, Health, Stats } from './types'

export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

// Absolute base so fetch works both in the browser (Vite proxies /api) and in jsdom tests.
const BASE = typeof window !== 'undefined' ? window.location.origin : ''

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(BASE + path, init)
  } catch {
    throw new ApiError(0, 'Cannot reach the SiteGuard API. Is the backend running?')
  }
  if (!res.ok) {
    let detail = res.statusText || `Request failed (${res.status})`
    try {
      const body = (await res.json()) as { detail?: unknown }
      if (typeof body.detail === 'string') detail = body.detail
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, detail)
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

export const api = {
  health: () => request<Health>('/api/health'),
  stats: () => request<Stats>('/api/stats'),
  listAnalyses: () => request<AnalysisSummary[]>('/api/analyses'),
  getAnalysis: (id: string) => request<AnalysisDetail>(`/api/analyses/${id}`),
  createAnalysis: (file: File, siteName?: string) => {
    const body = new FormData()
    body.append('file', file)
    if (siteName?.trim()) body.append('site_name', siteName.trim())
    return request<Created>('/api/analyses', { method: 'POST', body })
  },
  retryAnalysis: (id: string) => request<Created>(`/api/analyses/${id}/retry`, { method: 'POST' }),
  deleteAnalysis: (id: string) => request<void>(`/api/analyses/${id}`, { method: 'DELETE' }),
  mediaUrl: (id: string) => `${BASE}/api/analyses/${id}/media`,
}
