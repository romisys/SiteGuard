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

  it('collapses nav link labels to icons below the sm breakpoint so the header fits 375px', () => {
    renderWithProviders(<AppShell><p /></AppShell>)
    for (const name of [/dashboard/i, /new analysis/i]) {
      const link = screen.getByRole('link', { name })
      const label = link.querySelector('span')
      expect(label).not.toBeNull()
      // Text stays in the accessible name but is visually hidden on narrow screens.
      expect(label).toHaveClass('sr-only', 'sm:not-sr-only')
      expect(label).toHaveClass('whitespace-nowrap')
    }
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
