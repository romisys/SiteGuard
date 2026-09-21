import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, type RenderOptions } from '@testing-library/react'
import type { ReactElement, ReactNode } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

interface Options extends Omit<RenderOptions, 'wrapper'> {
  route?: string
  path?: string
}

export function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  })
}

export function renderWithProviders(ui: ReactElement, { route = '/', path, ...options }: Options = {}) {
  const client = createTestQueryClient()
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[route]}>
        {path ? <Routes><Route path={path} element={children} /></Routes> : children}
      </MemoryRouter>
    </QueryClientProvider>
  )
  return { client, ...render(ui, { wrapper: Wrapper, ...options }) }
}
