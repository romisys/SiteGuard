import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import { completedDetail, failedDetail, processingDetail } from '../test/fixtures'
import { renderWithProviders } from '../test/render'
import { server } from '../test/server'
import { ReportPage } from './ReportPage'

function renderReport(id: string) {
  return renderWithProviders(<ReportPage />, { route: `/analyses/${id}`, path: '/analyses/:id' })
}

describe('ReportPage', () => {
  it('renders the completed report', async () => {
    renderReport('a1')
    expect(await screen.findByRole('heading', { name: /tower a/i })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /risk score 88 out of 100, critical/i })).toBeInTheDocument()
    expect(screen.getByText(/reduce risk by 72 points/i)).toBeInTheDocument()
    expect(screen.getByText('Helmet')).toBeInTheDocument()
    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(3)
    expect(screen.getByText('Perimeter fencing present')).toBeInTheDocument()
    expect(screen.getByText(/gemini-2\.5-flash/)).toBeInTheDocument()
  })

  it('calls window.print for Download PDF', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => {})
    renderReport('a1')
    await userEvent.click(await screen.findByRole('button', { name: /download pdf/i }))
    expect(print).toHaveBeenCalled()
    print.mockRestore()
  })

  it('shows processing state', async () => {
    server.use(http.get('*/api/analyses/p1', () => HttpResponse.json(processingDetail)))
    renderReport('p1')
    expect(await screen.findByText(/analyzing/i)).toBeInTheDocument()
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('shows failure with retry', async () => {
    let retried = false
    server.use(
      http.get('*/api/analyses/f1', () => HttpResponse.json(retried ? processingDetail : failedDetail)),
      http.post('*/api/analyses/f1/retry', () => { retried = true; return HttpResponse.json({ id: 'f1', status: 'pending' }, { status: 202 }) }),
    )
    renderReport('f1')
    expect(await screen.findByRole('alert')).toHaveTextContent('Gemini quota exceeded')
    await userEvent.click(screen.getByRole('button', { name: /retry/i }))
    await waitFor(() => expect(screen.getByText(/analyzing/i)).toBeInTheDocument())
  })

  it('shows Report unavailable without Retry when a completed analysis has no result', async () => {
    server.use(http.get('*/api/analyses/c1', () => HttpResponse.json({ ...completedDetail, id: 'c1', result: null, scores: null })))
    renderReport('c1')
    expect(await screen.findByText(/report unavailable/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /retry/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument()
  })

  it('asks for confirmation before deleting a failed analysis', async () => {
    let deleted = false
    server.use(
      http.get('*/api/analyses/f1', () => HttpResponse.json(failedDetail)),
      http.delete('*/api/analyses/f1', () => { deleted = true; return new HttpResponse(null, { status: 204 }) }),
    )
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    renderReport('f1')
    await userEvent.click(await screen.findByRole('button', { name: /delete/i }))
    expect(confirm).toHaveBeenCalledWith('Delete this analysis and its media file?')
    expect(deleted).toBe(false)
    confirm.mockRestore()
  })

  it('shows not found', async () => {
    renderReport('missing')
    expect(await screen.findByText(/analysis not found/i)).toBeInTheDocument()
  })
})
