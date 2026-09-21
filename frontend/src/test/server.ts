import { setupServer } from 'msw/node'
import type { RequestHandler } from 'msw'

export const handlers: RequestHandler[] = []
export const server = setupServer(...handlers)
