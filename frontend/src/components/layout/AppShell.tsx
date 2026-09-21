import { HardHat, LayoutDashboard, Moon, Plus, Sun } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { NavLink } from 'react-router-dom'

const THEME_KEY = 'siteguard-theme'

function readTheme(): 'light' | 'dark' {
  try {
    const stored = localStorage.getItem(THEME_KEY)
    if (stored === 'light' || stored === 'dark') return stored
  } catch { /* storage unavailable */ }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function AppShell({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<'light' | 'dark'>(readTheme)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark'
    try { localStorage.setItem(THEME_KEY, next) } catch { /* ignore */ }
    setTheme(next)
  }

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `inline-flex min-h-11 items-center gap-2 rounded-md px-3 text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg ${
      isActive ? 'bg-muted text-fg-strong' : 'text-fg hover:bg-muted'
    }`

  return (
    <div className="min-h-dvh">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2 focus:ring-2 focus:ring-ring focus:shadow-card">
        Skip to content
      </a>
      <header className="sticky top-0 z-20 border-b border-border bg-surface/95 backdrop-blur print:hidden">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-2">
          <NavLink to="/" className="flex items-center gap-2 rounded-md text-fg-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg">
            <span className="grid size-8 place-items-center rounded-md bg-accent text-on-accent">
              <HardHat className="size-5" aria-hidden />
            </span>
            <span className="text-base font-semibold">SiteGuard</span>
          </NavLink>
          <nav aria-label="Primary" className="flex items-center gap-1">
            <NavLink to="/" end className={linkClass}>
              <LayoutDashboard className="size-4" aria-hidden /> <span>Dashboard</span>
            </NavLink>
            <NavLink to="/new" className={linkClass}>
              <Plus className="size-4" aria-hidden /> <span>New analysis</span>
            </NavLink>
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              className="ml-1 grid size-11 cursor-pointer place-items-center rounded-md text-fg transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
            >
              {theme === 'dark' ? <Sun className="size-5" aria-hidden /> : <Moon className="size-5" aria-hidden />}
            </button>
          </nav>
        </div>
      </header>
      <main id="main" className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  )
}
