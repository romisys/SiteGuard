import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { Blob as NodeBlob, File as NodeFile } from 'node:buffer'
import { afterAll, afterEach, beforeAll, vi } from 'vitest'
import { server } from './server'

// jsdom's File/Blob/FormData are not interoperable with Node's fetch (undici), which stays Node's in
// the jsdom environment. vitest 5 + jsdom 29 bridge the gap by converting jsdom Files into Node Blobs
// before `new Request()`, but the bridge corrupts multipart bodies: the file name becomes "blob" and
// the bytes become "undefined", so uploads never reach MSW intact. Replace the globals with Node's
// classes so bodies pass through untouched. defineProperty (not assignment) leaves the jsdom window's
// own classes in place, so the bridge's instanceof checks no longer match and it stays out of the way.
// This runs at module scope (top-level await) so test modules never capture jsdom's classes.
// Consequence: jsdom's FileReader rejects Node Files, so previews must use URL.createObjectURL.
// Remove once fixed upstream: https://github.com/vitest-dev/vitest/issues/9260 and
// https://github.com/vitest-dev/vitest/issues/11294
const NodeFormData = (await new Response(new URLSearchParams('a=b')).formData()).constructor
for (const [k, v] of Object.entries({ FormData: NodeFormData, File: NodeFile, Blob: NodeBlob }))
  Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true })

// Recharts ResponsiveContainer needs ResizeObserver; jsdom has none.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = globalThis.ResizeObserver ?? (ResizeObserverStub as unknown as typeof ResizeObserver)

// jsdom defines scrollTo as a "not implemented" function that logs errors, so replace it outright.
window.scrollTo = vi.fn()
// jsdom has no matchMedia
window.matchMedia =
  window.matchMedia ??
  ((query: string) => ({
    matches: false, media: query, onchange: null,
    addListener: () => {}, removeListener: () => {},
    addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
  }))

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
// No `globals: true`, so Testing Library cannot register its own afterEach cleanup.
afterEach(() => {
  cleanup()
  server.resetHandlers()
})
afterAll(() => server.close())
