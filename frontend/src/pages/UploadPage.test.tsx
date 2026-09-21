import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { renderWithProviders } from '../test/render'
import { server } from '../test/server'
import { UploadPage } from './UploadPage'

function renderPage() {
  return renderWithProviders(
    <Routes>
      <Route path="/new" element={<UploadPage />} />
      <Route path="/analyses/:id" element={<p>report page</p>} />
    </Routes>,
    { route: '/new' },
  )
}

describe('UploadPage', () => {
  it('disables Analyze until a file is chosen, then navigates to the report', async () => {
    renderPage()
    const button = screen.getByRole('button', { name: /analyze/i })
    expect(button).toBeDisabled()
    await userEvent.type(screen.getByLabelText(/site name/i), 'Tower A')
    await userEvent.upload(screen.getByLabelText(/upload a photo or video/i), new File(['x'], 'a.png', { type: 'image/png' }))
    expect(button).toBeEnabled()
    await userEvent.click(button)
    await waitFor(() => expect(screen.getByText('report page')).toBeInTheDocument())
  })

  it('shows a warning and disables Analyze when Gemini is not configured', async () => {
    server.use(http.get('*/api/health', () => HttpResponse.json({ status: 'ok', gemini_configured: false })))
    renderPage()
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/GEMINI_API_KEY/))
    await userEvent.upload(screen.getByLabelText(/upload a photo or video/i), new File(['x'], 'a.png', { type: 'image/png' }))
    expect(screen.getByRole('button', { name: /analyze/i })).toBeDisabled()
  })

  it('shows a warning and disables Analyze when the backend is unreachable', async () => {
    server.use(http.get('*/api/health', () => HttpResponse.error()))
    renderPage()
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/cannot reach/i))
    await userEvent.upload(screen.getByLabelText(/upload a photo or video/i), new File(['x'], 'a.png', { type: 'image/png' }))
    expect(screen.getByRole('button', { name: /analyze/i })).toBeDisabled()
  })

  it('shows backend error under the form', async () => {
    server.use(http.post('*/api/analyses', () => HttpResponse.json({ detail: 'Unsupported file type' }, { status: 400 })))
    renderPage()
    await userEvent.upload(screen.getByLabelText(/upload a photo or video/i), new File(['x'], 'a.png', { type: 'image/png' }))
    await userEvent.click(screen.getByRole('button', { name: /analyze/i }))
    await waitFor(() => expect(screen.getAllByRole('alert').at(-1)).toHaveTextContent('Unsupported file type'))
  })
})
