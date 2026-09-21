import { http, HttpResponse, type RequestHandler } from 'msw'
import { setupServer } from 'msw/node'
import { completedDetail, healthOk, stats, summaries } from './fixtures'

export const handlers: RequestHandler[] = [
  http.get('*/api/health', () => HttpResponse.json(healthOk)),
  http.get('*/api/stats', () => HttpResponse.json(stats)),
  http.get('*/api/analyses', () => HttpResponse.json(summaries)),
  http.get('*/api/analyses/:id', ({ params }) =>
    params.id === completedDetail.id
      ? HttpResponse.json(completedDetail)
      : HttpResponse.json({ detail: 'Analysis not found' }, { status: 404 }),
  ),
  http.post('*/api/analyses', () => HttpResponse.json({ id: 'new1', status: 'pending' }, { status: 202 })),
  http.post('*/api/analyses/:id/retry', ({ params }) =>
    HttpResponse.json({ id: params.id, status: 'pending' }, { status: 202 }),
  ),
  http.delete('*/api/analyses/:id', () => new HttpResponse(null, { status: 204 })),
]

export const server = setupServer(...handlers)
