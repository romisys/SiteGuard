import { QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import type { ReactNode } from 'react'
import { describe, expect, it } from 'vitest'
import { completedDetail, processingDetail } from '../test/fixtures'
import { createTestQueryClient } from '../test/render'
import { server } from '../test/server'
import { useAnalysis } from './useAnalysis'

function wrapper() {
  const client = createTestQueryClient()
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

describe('useAnalysis', () => {
  it('polls while processing and stops once completed', async () => {
    let calls = 0
    server.use(
      http.get('*/api/analyses/p1', () => {
        calls += 1
        return HttpResponse.json(calls < 3 ? processingDetail : { ...completedDetail, id: 'p1' })
      }),
    )
    const { result } = renderHook(() => useAnalysis('p1', { pollMs: 20 }), { wrapper: wrapper() })
    await waitFor(() => expect(result.current.data?.status).toBe('completed'))
    const settled = calls
    await new Promise((r) => setTimeout(r, 100))
    expect(calls).toBe(settled) // no more polling after completion
    expect(calls).toBeGreaterThanOrEqual(3)
  })

  it('exposes ApiError for 404', async () => {
    const { result } = renderHook(() => useAnalysis('missing'), { wrapper: wrapper() })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error?.message).toBe('Analysis not found')
  })
})
