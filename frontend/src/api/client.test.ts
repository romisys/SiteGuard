import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { server } from '../test/server'
import { ApiError, api } from './client'

describe('api client', () => {
  it('parses JSON responses', async () => {
    const h = await api.health()
    expect(h.gemini_configured).toBe(true)
  })

  it('throws ApiError with backend detail on non-2xx', async () => {
    await expect(api.getAnalysis('missing')).rejects.toMatchObject({ status: 404, message: 'Analysis not found' })
    await expect(api.getAnalysis('missing')).rejects.toBeInstanceOf(ApiError)
  })

  it('posts multipart form with file and site_name', async () => {
    let received: FormData | null = null
    server.use(
      http.post('*/api/analyses', async ({ request }) => {
        received = await request.formData()
        return HttpResponse.json({ id: 'x', status: 'pending' }, { status: 202 })
      }),
    )
    const file = new File(['abc'], 'site.png', { type: 'image/png' })
    const created = await api.createAnalysis(file, 'Tower A')
    expect(created.id).toBe('x')
    expect((received!.get('file') as File).name).toBe('site.png')
    expect(received!.get('site_name')).toBe('Tower A')
  })

  it('resolves 204 delete to undefined', async () => {
    await expect(api.deleteAnalysis('a1')).resolves.toBeUndefined()
  })

  it('builds media url', () => {
    expect(api.mediaUrl('a1')).toMatch(/\/api\/analyses\/a1\/media$/)
  })
})
