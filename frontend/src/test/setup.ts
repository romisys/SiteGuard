import '@testing-library/jest-dom/vitest'
import { afterAll, afterEach, beforeAll } from 'vitest'
import { server } from './server'

// jsdom's File/Blob/FormData are not interoperable with Node's fetch (undici). Vitest's jsdom
// environment bridges them by converting jsdom Files to Node Blobs, but that drops file names, so
// multipart uploads reach MSW as filename="blob". Replace the globals with Node's classes so bodies
// pass through untouched. defineProperty (not assignment) keeps the jsdom window's own classes, so
// vitest's bridge no longer matches and stays out of the way. Node's classes are taken from a parsed
// Response body rather than node:buffer, which keeps @types/node out of the app tsconfig.
async function useNodeBodyClasses() {
  const body = '--b\r\nContent-Disposition: form-data; name="f"; filename="f"\r\n\r\n\r\n--b--\r\n'
  const parsed = await new Response(body, { headers: { 'content-type': 'multipart/form-data; boundary=b' } }).formData()
  const NodeFile = (parsed.get('f') as File).constructor
  const classes = { FormData: parsed.constructor, File: NodeFile, Blob: Object.getPrototypeOf(NodeFile) }
  for (const [key, value] of Object.entries(classes)) {
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true })
  }
}

// Recharts ResponsiveContainer needs ResizeObserver; jsdom has none.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = globalThis.ResizeObserver ?? (ResizeObserverStub as unknown as typeof ResizeObserver)

// jsdom has no scrollTo / matchMedia
window.scrollTo = window.scrollTo ?? (() => {})
window.matchMedia =
  window.matchMedia ??
  ((query: string) => ({
    matches: false, media: query, onchange: null,
    addListener: () => {}, removeListener: () => {},
    addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
  }))

beforeAll(async () => {
  await useNodeBodyClasses()
  server.listen({ onUnhandledRequest: 'error' })
})
afterEach(() => server.resetHandlers())
afterAll(() => server.close())
