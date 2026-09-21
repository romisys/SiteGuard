import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { renderWithProviders } from '../../test/render'
import { AppShell } from './AppShell'

describe('AppShell', () => {
  it('renders nav links and children', () => {
    renderWithProviders(<AppShell><p>content</p></AppShell>)
    expect(screen.getByRole('link', { name: /dashboard/i })).toHaveAttribute('href', '/')
    expect(screen.getByRole('link', { name: /new analysis/i })).toHaveAttribute('href', '/new')
    expect(screen.getByText('content')).toBeInTheDocument()
  })

  it('toggles dark mode class on <html>', async () => {
    renderWithProviders(<AppShell><p /></AppShell>)
    const toggle = screen.getByRole('button', { name: /switch to dark mode/i })
    await userEvent.click(toggle)
    expect(document.documentElement).toHaveClass('dark')
    await userEvent.click(screen.getByRole('button', { name: /switch to light mode/i }))
    expect(document.documentElement).not.toHaveClass('dark')
  })
})
