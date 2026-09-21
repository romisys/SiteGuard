import { screen, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { emptyStats } from '../test/fixtures'
import { renderWithProviders } from '../test/render'
import { server } from '../test/server'
import { DashboardPage } from './DashboardPage'

describe('DashboardPage', () => {
  it('shows KPIs and the analyses table', async () => {
    renderWithProviders(<DashboardPage />)
    expect(await screen.findByText('Analyses')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()            // total
    expect(screen.getByText('54')).toBeInTheDocument()           // average score
    expect(screen.getByText('88%')).toBeInTheDocument()          // avg PPE compliance (0.875)
    const table = screen.getByRole('table', { name: /past analyses/i })
    const rows = within(table).getAllByRole('row')
    expect(rows).toHaveLength(3) // header + 2
    expect(within(rows[1]).getByRole('link', { name: /tower a/i })).toHaveAttribute('href', '/analyses/a1')
    expect(within(rows[1]).getByText('Critical')).toBeInTheDocument()
  })

  it('shows empty state with CTA when there is nothing yet', async () => {
    server.use(
      http.get('*/api/stats', () => HttpResponse.json(emptyStats)),
      http.get('*/api/analyses', () => HttpResponse.json([])),
    )
    renderWithProviders(<DashboardPage />)
    expect(await screen.findByText(/no analyses yet/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /run your first analysis/i })).toHaveAttribute('href', '/new')
  })
})
