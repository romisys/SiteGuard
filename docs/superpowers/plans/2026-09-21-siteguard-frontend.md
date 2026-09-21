# SiteGuard Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A React + TypeScript single-page app with three routes — Dashboard, Upload, Report — that talks to the SiteGuard FastAPI backend, polls while Gemini analyses the upload, and renders the risk report (gauge, mitigation bars, workers & PPE panel, 5×5 risk matrix, category chart, findings list) with a print stylesheet for PDF export.

**Architecture:** Vite + React Router + TanStack Query. `api/` is the only module that knows about HTTP; `hooks/` wrap queries (including the polling rule); `components/` are presentational and take typed props; `pages/` compose them. Tailwind v4 with semantic color tokens defined once in `index.css` (light + dark). Tests run in Vitest/jsdom with MSW mocking the API.

**Tech Stack:** Node 22, Vite (latest template), React 19 (template default), TypeScript, Tailwind CSS v4 (`@tailwindcss/vite`), react-router-dom v6, @tanstack/react-query v5, recharts, lucide-react, Vitest, @testing-library/react, @testing-library/user-event, msw.

**Spec:** `docs/superpowers/specs/2026-09-21-siteguard-design.md` §8 (frontend), §7 (API shapes). **Prerequisite:** backend plan implemented (or at least its API shapes, which `src/api/types.ts` mirrors).

**Conventions for every task:**
- Run commands from `frontend/`: `cd "/Users/apple/Desktop/building site risk assesment/frontend"`
- Tests: `npx vitest run <path>`; type-check: `npx tsc -p tsconfig.app.json --noEmit`.
- Commit from the repo root; messages end with `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.
- No emoji icons — Lucide only. Every color comes from a token in `index.css`. Risk level is always shown as text + icon, never color alone.

---

## File structure

```
frontend/
├── index.html
├── package.json
├── vite.config.ts                 # react + tailwind plugins, /api proxy, vitest config
├── tsconfig.app.json
├── src/
│   ├── main.tsx                   # providers: QueryClient, Router
│   ├── App.tsx                    # routes
│   ├── index.css                  # tailwind import, tokens (light/dark), print rules
│   ├── api/
│   │   ├── types.ts               # mirrors backend schemas
│   │   └── client.ts              # fetch wrapper + endpoint functions
│   ├── lib/
│   │   ├── risk.ts                # level/category/subject/PPE metadata
│   │   └── format.ts              # dates, timestamps, percentages
│   ├── hooks/
│   │   ├── useAnalysis.ts         # detail + polling
│   │   ├── useAnalyses.ts
│   │   ├── useStats.ts
│   │   └── useHealth.ts
│   ├── components/
│   │   ├── ui/                    # Card, Button, Badge, Skeleton, EmptyState
│   │   ├── layout/AppShell.tsx
│   │   ├── upload/Dropzone.tsx
│   │   ├── report/                # RiskGauge, MitigationBars, WorkersPanel, RiskMatrix,
│   │   │                          # CategoryBar, FindingCard, FindingsList, PositiveList, ReportHeader
│   │   └── dashboard/             # KpiCard, TrendChart, AnalysesTable
│   ├── pages/                     # DashboardPage, UploadPage, ReportPage
│   └── test/
│       ├── setup.ts               # jest-dom, ResizeObserver stub, MSW lifecycle
│       ├── server.ts              # MSW server + default handlers
│       ├── fixtures.ts            # typed API fixtures
│       └── render.tsx             # renderWithProviders()
```

---

### Task 1: Scaffold Vite app, Tailwind, test tooling

**Files:**
- Create: `frontend/` (Vite template), modify `vite.config.ts`, `tsconfig.app.json`, `src/index.css`, `src/test/setup.ts`, `src/test/render.tsx`
- Delete: `src/App.css`, `src/assets/react.svg`

- [ ] **Step 1: Scaffold**

```bash
cd "/Users/apple/Desktop/building site risk assesment"
npm create vite@latest frontend -- --template react-ts
cd frontend
npm install
npm install react-router-dom @tanstack/react-query recharts lucide-react tailwindcss @tailwindcss/vite
npm install -D vitest jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event msw
rm -f src/App.css src/assets/react.svg
```

- [ ] **Step 2: Write `frontend/vite.config.ts`**

```ts
/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: { '/api': 'http://localhost:8000' },
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    css: false,
  },
})
```

- [ ] **Step 3: Add test types to `frontend/tsconfig.app.json`**

Inside `compilerOptions` add (jest-dom matcher types come from the `@testing-library/jest-dom/vitest` import in `src/test/setup.ts`, which is inside `src/` and therefore type-checked):
```json
"types": ["vite/client"]
```

- [ ] **Step 4: Write `frontend/src/index.css` (tokens, dark mode, print)**

```css
@import "tailwindcss";
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@500;600&display=swap');

@custom-variant dark (&:where(.dark, .dark *));

@theme {
  --font-sans: "Inter", ui-sans-serif, system-ui, sans-serif;
  --font-mono: "JetBrains Mono", ui-monospace, SFMono-Regular, monospace;

  /* surfaces + text (industrial slate) */
  --color-bg: #f8fafc;
  --color-surface: #ffffff;
  --color-muted: #ebf0f5;
  --color-border: #e2e8f0;
  --color-fg: #334155;
  --color-fg-strong: #0f172a;
  --color-fg-muted: #64748b;

  /* accent: safety orange */
  --color-accent: #ea580c;
  --color-accent-hover: #c2410c;
  --color-on-accent: #ffffff;

  /* risk levels — always paired with text + icon */
  --color-risk-low: #16a34a;
  --color-risk-moderate: #d97706;
  --color-risk-high: #ea580c;
  --color-risk-critical: #dc2626;

  --color-danger: #dc2626;
  --color-ring: #64748b;

  --shadow-card: 0 1px 2px 0 rgb(15 23 42 / 0.06), 0 1px 3px 0 rgb(15 23 42 / 0.08);
}

.dark {
  --color-bg: #0f172a;
  --color-surface: #1e293b;
  --color-muted: #273449;
  --color-border: #334155;
  --color-fg: #cbd5e1;
  --color-fg-strong: #f1f5f9;
  --color-fg-muted: #94a3b8;
  --color-accent: #f97316;
  --color-accent-hover: #fb923c;
  --color-risk-low: #4ade80;
  --color-risk-moderate: #fbbf24;
  --color-risk-high: #fb923c;
  --color-risk-critical: #f87171;
  --color-danger: #f87171;
  --shadow-card: 0 1px 2px 0 rgb(0 0 0 / 0.4);
}

html { color-scheme: light; }
html.dark { color-scheme: dark; }

body {
  @apply bg-bg text-fg font-sans antialiased;
  font-size: 16px;
  line-height: 1.5;
}

.tabular { font-variant-numeric: tabular-nums; }

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
}

@media print {
  @page { margin: 14mm; }
  body { background: #fff; color: #0f172a; }
  .print-break { break-before: page; }
  a[href]::after { content: none; }
}
```

- [ ] **Step 5: Write `frontend/src/test/setup.ts`**

```ts
import '@testing-library/jest-dom/vitest'
import { afterAll, afterEach, beforeAll } from 'vitest'
import { server } from './server'

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

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())
```

- [ ] **Step 6: Write `frontend/src/test/server.ts` (empty handler list for now)**

```ts
import { setupServer } from 'msw/node'
import type { RequestHandler } from 'msw'

export const handlers: RequestHandler[] = []
export const server = setupServer(...handlers)
```

- [ ] **Step 7: Write `frontend/src/test/render.tsx`**

```tsx
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
```

- [ ] **Step 8: Write a trivial smoke test and run it**

```ts
// frontend/src/test/smoke.test.ts
import { describe, expect, it } from 'vitest'

describe('tooling', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2)
  })
})
```

Run: `npx vitest run`
Expected: `1 passed`

- [ ] **Step 9: Replace template `App.tsx` and `main.tsx` with minimal versions so `tsc` passes**

```tsx
// frontend/src/App.tsx
export default function App() {
  return <div>SiteGuard</div>
}
```
```tsx
// frontend/src/main.tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

Run: `npx tsc -p tsconfig.app.json --noEmit && npm run build`
Expected: no type errors, `✓ built`

- [ ] **Step 10: Commit**

```bash
cd "/Users/apple/Desktop/building site risk assesment"
git add frontend
git commit -m "chore(frontend): scaffold Vite React app with Tailwind and Vitest

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: API types, client and test fixtures

**Files:**
- Create: `src/api/types.ts`, `src/api/client.ts`, `src/test/fixtures.ts`
- Modify: `src/test/server.ts`
- Test: `src/api/client.test.ts`

- [ ] **Step 1: Write `src/api/types.ts`**

```ts
export type AnalysisStatus = 'pending' | 'processing' | 'completed' | 'failed'
export type MediaType = 'image' | 'video'
export type RiskLevel = 'Low' | 'Moderate' | 'High' | 'Critical'
export type FindingSubject = 'worker' | 'site' | 'equipment'
export type RiskCategory =
  | 'fall_protection' | 'ppe' | 'scaffolding' | 'electrical' | 'excavation' | 'struck_by'
  | 'housekeeping' | 'machinery' | 'fire' | 'structural' | 'other'
export type PpeItem = 'helmet' | 'hi_vis_vest' | 'harness' | 'gloves' | 'safety_boots' | 'eye_protection'

export interface PpeCheck {
  item: PpeItem
  compliant: number
  non_compliant: number
  notes: string
}

export interface WorkerAssessment {
  workers_visible: number
  ppe: PpeCheck[]
  unsafe_behaviours: string[]
}

export interface Finding {
  subject: FindingSubject
  category: RiskCategory
  title: string
  description: string
  evidence: string
  timestamp_seconds: number | null
  severity: number
  likelihood: number
  recommendation: string
  required_equipment: string[]
  mitigation_effectiveness: number
}

export interface AnalysisResult {
  scene_summary: string
  workers: WorkerAssessment
  positive_observations: string[]
  findings: Finding[]
}

export interface FindingScore {
  index: number
  risk: number
  residual_risk: number
}

export interface ScoreSummary {
  risk_score: number
  residual_score: number
  reduction: number
  risk_level: RiskLevel
  residual_level: RiskLevel
  findings_by_category: Partial<Record<RiskCategory, number>>
  findings_by_subject: Partial<Record<FindingSubject, number>>
  ppe_compliance_rate: number | null
  per_finding: FindingScore[]
}

export interface AnalysisSummary {
  id: string
  created_at: string
  site_name: string | null
  filename: string
  media_type: MediaType
  status: AnalysisStatus
  risk_score: number | null
  risk_level: RiskLevel | null
  ppe_compliance_rate: number | null
}

export interface AnalysisDetail extends AnalysisSummary {
  mime_type: string
  error_message: string | null
  model: string | null
  input_tokens: number | null
  output_tokens: number | null
  result: AnalysisResult | null
  scores: ScoreSummary | null
}

export interface TrendPoint {
  date: string
  score: number
}

export interface Stats {
  total: number
  completed: number
  average_score: number | null
  critical_count: number
  average_ppe_compliance: number | null
  findings_by_category: Partial<Record<RiskCategory, number>>
  findings_by_subject: Partial<Record<FindingSubject, number>>
  trend: TrendPoint[]
}

export interface Health {
  status: string
  gemini_configured: boolean
}

export interface Created {
  id: string
  status: AnalysisStatus
}
```

- [ ] **Step 2: Write `src/test/fixtures.ts`**

```ts
import type { AnalysisDetail, AnalysisSummary, Finding, Health, Stats } from '../api/types'

export const findingHelmet: Finding = {
  subject: 'worker', category: 'ppe', title: 'Worker without helmet',
  description: 'One worker on the slab is not wearing a hard hat.',
  evidence: 'Left of frame, blue shirt', timestamp_seconds: 4,
  severity: 4, likelihood: 3, recommendation: 'Stop work until hard hats are worn.',
  required_equipment: ['hard hat'], mitigation_effectiveness: 0.8,
}

export const findingEdge: Finding = {
  subject: 'site', category: 'fall_protection', title: 'Unprotected slab edge',
  description: 'Open slab edge with no guardrail.', evidence: 'Right side, 2nd floor',
  timestamp_seconds: 7, severity: 5, likelihood: 4, recommendation: 'Install guardrails and toe boards.',
  required_equipment: ['guardrail system'], mitigation_effectiveness: 0.9,
}

export const findingCable: Finding = {
  subject: 'equipment', category: 'electrical', title: 'Extension cable in water',
  description: 'Power cable running through a puddle.', evidence: 'Ground floor entrance',
  timestamp_seconds: null, severity: 4, likelihood: 2, recommendation: 'Reroute cable overhead.',
  required_equipment: ['cable hooks'], mitigation_effectiveness: 0.7,
}

export const completedDetail: AnalysisDetail = {
  id: 'a1', created_at: '2026-09-21T10:00:00Z', site_name: 'Tower A', filename: 'clip.mov',
  media_type: 'video', mime_type: 'video/quicktime', status: 'completed',
  risk_score: 88, risk_level: 'Critical', ppe_compliance_rate: 0.75,
  error_message: null, model: 'gemini-2.5-flash', input_tokens: 3100, output_tokens: 800,
  result: {
    scene_summary: 'Two workers on a second-floor slab.',
    workers: {
      workers_visible: 2,
      ppe: [
        { item: 'helmet', compliant: 1, non_compliant: 1, notes: '' },
        { item: 'hi_vis_vest', compliant: 2, non_compliant: 0, notes: '' },
      ],
      unsafe_behaviours: ['Leaning over unprotected edge'],
    },
    positive_observations: ['Perimeter fencing present'],
    findings: [findingHelmet, findingEdge, findingCable],
  },
  scores: {
    risk_score: 88, residual_score: 16, reduction: 72, risk_level: 'Critical', residual_level: 'Low',
    findings_by_category: { ppe: 1, fall_protection: 1, electrical: 1 },
    findings_by_subject: { worker: 1, site: 1, equipment: 1 },
    ppe_compliance_rate: 0.75,
    per_finding: [
      { index: 0, risk: 12, residual_risk: 2.4 },
      { index: 1, risk: 20, residual_risk: 2 },
      { index: 2, risk: 8, residual_risk: 2.4 },
    ],
  },
}

export const processingDetail: AnalysisDetail = {
  ...completedDetail, id: 'p1', status: 'processing', risk_score: null, risk_level: null,
  ppe_compliance_rate: null, result: null, scores: null, model: null, input_tokens: null, output_tokens: null,
}

export const failedDetail: AnalysisDetail = {
  ...processingDetail, id: 'f1', status: 'failed', error_message: 'Gemini quota exceeded',
}

export const summaries: AnalysisSummary[] = [
  { id: 'a1', created_at: '2026-09-21T10:00:00Z', site_name: 'Tower A', filename: 'clip.mov',
    media_type: 'video', status: 'completed', risk_score: 88, risk_level: 'Critical', ppe_compliance_rate: 0.75 },
  { id: 'a2', created_at: '2026-09-20T10:00:00Z', site_name: null, filename: 'yard.png',
    media_type: 'image', status: 'completed', risk_score: 20, risk_level: 'Low', ppe_compliance_rate: 1 },
]

export const emptyStats: Stats = {
  total: 0, completed: 0, average_score: null, critical_count: 0, average_ppe_compliance: null,
  findings_by_category: {}, findings_by_subject: {}, trend: [],
}

export const stats: Stats = {
  total: 2, completed: 2, average_score: 54, critical_count: 1, average_ppe_compliance: 0.875,
  findings_by_category: { ppe: 2, fall_protection: 1 }, findings_by_subject: { worker: 2, site: 1 },
  trend: [{ date: '2026-09-20T10:00:00Z', score: 20 }, { date: '2026-09-21T10:00:00Z', score: 88 }],
}

export const healthOk: Health = { status: 'ok', gemini_configured: true }
```

- [ ] **Step 3: Write default MSW handlers in `src/test/server.ts`**

```ts
import { http, HttpResponse, type RequestHandler } from 'msw'
import { setupServer } from 'msw/node'
import { completedDetail, healthOk, stats, summaries } from './fixtures'

export const handlers: RequestHandler[] = [
  http.get('*/api/health', () => HttpResponse.json(healthOk)),
  http.get('*/api/stats', () => HttpResponse.json(stats)),
  http.get('*/api/analyses', () => HttpResponse.json(summaries)),
  http.get('*/api/analyses/:id', ({ params }) =>
    params.id === completedDetail.id
      ? HttpResponse.json(completedDetail)
      : HttpResponse.json({ detail: 'Analysis not found' }, { status: 404 }),
  ),
  http.post('*/api/analyses', () => HttpResponse.json({ id: 'new1', status: 'pending' }, { status: 202 })),
  http.post('*/api/analyses/:id/retry', ({ params }) =>
    HttpResponse.json({ id: params.id, status: 'pending' }, { status: 202 }),
  ),
  http.delete('*/api/analyses/:id', () => new HttpResponse(null, { status: 204 })),
]

export const server = setupServer(...handlers)
```

- [ ] **Step 4: Write the failing client test**

```ts
// frontend/src/api/client.test.ts
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { server } from '../test/server'
import { ApiError, api } from './client'

describe('api client', () => {
  it('parses JSON responses', async () => {
    const h = await api.health()
    expect(h.gemini_configured).toBe(true)
  })

  it('throws ApiError with backend detail on non-2xx', async () => {
    await expect(api.getAnalysis('missing')).rejects.toMatchObject({ status: 404, message: 'Analysis not found' })
    await expect(api.getAnalysis('missing')).rejects.toBeInstanceOf(ApiError)
  })

  it('posts multipart form with file and site_name', async () => {
    let received: FormData | null = null
    server.use(
      http.post('*/api/analyses', async ({ request }) => {
        received = await request.formData()
        return HttpResponse.json({ id: 'x', status: 'pending' }, { status: 202 })
      }),
    )
    const file = new File(['abc'], 'site.png', { type: 'image/png' })
    const created = await api.createAnalysis(file, 'Tower A')
    expect(created.id).toBe('x')
    expect((received!.get('file') as File).name).toBe('site.png')
    expect(received!.get('site_name')).toBe('Tower A')
  })

  it('resolves 204 delete to undefined', async () => {
    await expect(api.deleteAnalysis('a1')).resolves.toBeUndefined()
  })

  it('builds media url', () => {
    expect(api.mediaUrl('a1')).toMatch(/\/api\/analyses\/a1\/media$/)
  })
})
```

- [ ] **Step 5: Run test to verify it fails**

Run: `npx vitest run src/api/client.test.ts`
Expected: fails — `Failed to resolve import "./client"`

- [ ] **Step 6: Implement `src/api/client.ts`**

```ts
import type { AnalysisDetail, AnalysisSummary, Created, Health, Stats } from './types'

export class ApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message)
    this.name = 'ApiError'
  }
}

// Absolute base so fetch works both in the browser (Vite proxies /api) and in jsdom tests.
const BASE = typeof window !== 'undefined' ? window.location.origin : ''

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(BASE + path, init)
  } catch {
    throw new ApiError(0, 'Cannot reach the SiteGuard API. Is the backend running?')
  }
  if (!res.ok) {
    let detail = res.statusText || `Request failed (${res.status})`
    try {
      const body = (await res.json()) as { detail?: unknown }
      if (typeof body.detail === 'string') detail = body.detail
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, detail)
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

export const api = {
  health: () => request<Health>('/api/health'),
  stats: () => request<Stats>('/api/stats'),
  listAnalyses: () => request<AnalysisSummary[]>('/api/analyses'),
  getAnalysis: (id: string) => request<AnalysisDetail>(`/api/analyses/${id}`),
  createAnalysis: (file: File, siteName?: string) => {
    const body = new FormData()
    body.append('file', file)
    if (siteName?.trim()) body.append('site_name', siteName.trim())
    return request<Created>('/api/analyses', { method: 'POST', body })
  },
  retryAnalysis: (id: string) => request<Created>(`/api/analyses/${id}/retry`, { method: 'POST' }),
  deleteAnalysis: (id: string) => request<void>(`/api/analyses/${id}`, { method: 'DELETE' }),
  mediaUrl: (id: string) => `${BASE}/api/analyses/${id}/media`,
}
```

- [ ] **Step 7: Run test to verify it passes**

Run: `npx vitest run src/api/client.test.ts`
Expected: `5 passed`

- [ ] **Step 8: Commit**

```bash
git add frontend/src/api frontend/src/test
git commit -m "feat(frontend): add API types, client and test fixtures

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Risk metadata and formatters

**Files:**
- Create: `src/lib/risk.ts`, `src/lib/format.ts`
- Test: `src/lib/risk.test.ts`, `src/lib/format.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// frontend/src/lib/risk.test.ts
import { describe, expect, it } from 'vitest'
import type { RiskCategory, PpeItem } from '../api/types'
import { CATEGORY_LABELS, LEVELS, PPE_LABELS, SUBJECT_META, levelFor, riskBand } from './risk'

describe('levelFor', () => {
  it.each([
    [0, 'Low'], [24, 'Low'], [25, 'Moderate'], [49, 'Moderate'],
    [50, 'High'], [74, 'High'], [75, 'Critical'], [100, 'Critical'],
  ])('%i -> %s', (score, level) => {
    expect(levelFor(score)).toBe(level)
  })
})

describe('metadata tables', () => {
  it('every level has label, icon and classes', () => {
    for (const meta of Object.values(LEVELS)) {
      expect(meta.label).toBeTruthy()
      expect(meta.icon).toBeTruthy()
      expect(meta.text).toMatch(/^text-risk-/)
    }
  })

  it('labels exist for all categories, subjects and PPE items', () => {
    const categories: RiskCategory[] = ['fall_protection', 'ppe', 'scaffolding', 'electrical', 'excavation',
      'struck_by', 'housekeeping', 'machinery', 'fire', 'structural', 'other']
    categories.forEach((c) => expect(CATEGORY_LABELS[c]).toBeTruthy())
    expect(Object.keys(SUBJECT_META)).toEqual(['worker', 'site', 'equipment'])
    const ppe: PpeItem[] = ['helmet', 'hi_vis_vest', 'harness', 'gloves', 'safety_boots', 'eye_protection']
    ppe.forEach((p) => expect(PPE_LABELS[p]).toBeTruthy())
  })
})

describe('riskBand', () => {
  it('maps severity x likelihood product to a level', () => {
    expect(riskBand(1)).toBe('Low')
    expect(riskBand(6)).toBe('Low')
    expect(riskBand(8)).toBe('Moderate')
    expect(riskBand(12)).toBe('Moderate')
    expect(riskBand(15)).toBe('High')
    expect(riskBand(16)).toBe('High')
    expect(riskBand(20)).toBe('Critical')
    expect(riskBand(25)).toBe('Critical')
  })
})
```

```ts
// frontend/src/lib/format.test.ts
import { describe, expect, it } from 'vitest'
import { formatPercent, formatTimestamp } from './format'

describe('formatTimestamp', () => {
  it('formats seconds as m:ss', () => {
    expect(formatTimestamp(4)).toBe('0:04')
    expect(formatTimestamp(65.4)).toBe('1:05')
  })
})

describe('formatPercent', () => {
  it('formats fractions', () => {
    expect(formatPercent(0.75)).toBe('75%')
    expect(formatPercent(null)).toBe('—')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib`
Expected: import failures

- [ ] **Step 3: Implement `src/lib/risk.ts`**

```ts
import {
  AlertTriangle, Building2, HardHat, OctagonAlert, ShieldAlert, ShieldCheck, Wrench, type LucideIcon,
} from 'lucide-react'
import type { FindingSubject, PpeItem, RiskCategory, RiskLevel } from '../api/types'

export interface LevelMeta {
  label: RiskLevel
  icon: LucideIcon
  /** text color utility */
  text: string
  /** soft background utility */
  bg: string
  /** solid fill utility (bars, gauge) */
  fill: string
  /** raw CSS var for SVG/recharts */
  cssVar: string
}

export const LEVELS: Record<RiskLevel, LevelMeta> = {
  Low: { label: 'Low', icon: ShieldCheck, text: 'text-risk-low', bg: 'bg-risk-low/10', fill: 'bg-risk-low', cssVar: 'var(--color-risk-low)' },
  Moderate: { label: 'Moderate', icon: AlertTriangle, text: 'text-risk-moderate', bg: 'bg-risk-moderate/10', fill: 'bg-risk-moderate', cssVar: 'var(--color-risk-moderate)' },
  High: { label: 'High', icon: ShieldAlert, text: 'text-risk-high', bg: 'bg-risk-high/10', fill: 'bg-risk-high', cssVar: 'var(--color-risk-high)' },
  Critical: { label: 'Critical', icon: OctagonAlert, text: 'text-risk-critical', bg: 'bg-risk-critical/10', fill: 'bg-risk-critical', cssVar: 'var(--color-risk-critical)' },
}

/** Same thresholds as backend scoring.level_for. */
export function levelFor(score: number): RiskLevel {
  if (score >= 75) return 'Critical'
  if (score >= 50) return 'High'
  if (score >= 25) return 'Moderate'
  return 'Low'
}

/** Band for a single finding's severity x likelihood (1..25). Used by the matrix and cards. */
export function riskBand(product: number): RiskLevel {
  if (product >= 20) return 'Critical'
  if (product >= 15) return 'High'
  if (product >= 8) return 'Moderate'
  return 'Low'
}

export const CATEGORY_LABELS: Record<RiskCategory, string> = {
  fall_protection: 'Fall protection',
  ppe: 'PPE',
  scaffolding: 'Scaffolding',
  electrical: 'Electrical',
  excavation: 'Excavation',
  struck_by: 'Struck-by',
  housekeeping: 'Housekeeping',
  machinery: 'Machinery',
  fire: 'Fire',
  structural: 'Structural',
  other: 'Other',
}

export const SUBJECT_META: Record<FindingSubject, { label: string; icon: LucideIcon }> = {
  worker: { label: 'Worker', icon: HardHat },
  site: { label: 'Site', icon: Building2 },
  equipment: { label: 'Equipment', icon: Wrench },
}

export const PPE_LABELS: Record<PpeItem, string> = {
  helmet: 'Helmet',
  hi_vis_vest: 'Hi-vis vest',
  harness: 'Harness',
  gloves: 'Gloves',
  safety_boots: 'Safety boots',
  eye_protection: 'Eye protection',
}
```

- [ ] **Step 4: Implement `src/lib/format.ts`**

```ts
const dateFmt = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })
const shortDateFmt = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' })

export function formatDate(iso: string): string {
  return dateFmt.format(new Date(iso))
}

export function formatShortDate(iso: string): string {
  return shortDateFmt.format(new Date(iso))
}

export function formatTimestamp(seconds: number): string {
  const total = Math.floor(seconds)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function formatPercent(fraction: number | null | undefined): string {
  if (fraction === null || fraction === undefined) return '—'
  return `${Math.round(fraction * 100)}%`
}

export function formatTokens(n: number | null): string {
  return n === null ? '—' : n.toLocaleString()
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/lib`
Expected: `13 passed`

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib
git commit -m "feat(frontend): add risk metadata and formatters

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Query hooks (with polling)

**Files:**
- Create: `src/hooks/useAnalysis.ts`, `src/hooks/useAnalyses.ts`, `src/hooks/useStats.ts`, `src/hooks/useHealth.ts`
- Test: `src/hooks/useAnalysis.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/src/hooks/useAnalysis.test.tsx
import { QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import type { ReactNode } from 'react'
import { describe, expect, it } from 'vitest'
import { completedDetail, processingDetail } from '../test/fixtures'
import { createTestQueryClient } from '../test/render'
import { server } from '../test/server'
import { useAnalysis } from './useAnalysis'

function wrapper() {
  const client = createTestQueryClient()
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

describe('useAnalysis', () => {
  it('polls while processing and stops once completed', async () => {
    let calls = 0
    server.use(
      http.get('*/api/analyses/p1', () => {
        calls += 1
        return HttpResponse.json(calls < 3 ? processingDetail : { ...completedDetail, id: 'p1' })
      }),
    )
    const { result } = renderHook(() => useAnalysis('p1', { pollMs: 20 }), { wrapper: wrapper() })
    await waitFor(() => expect(result.current.data?.status).toBe('completed'))
    const settled = calls
    await new Promise((r) => setTimeout(r, 100))
    expect(calls).toBe(settled) // no more polling after completion
    expect(calls).toBeGreaterThanOrEqual(3)
  })

  it('exposes ApiError for 404', async () => {
    const { result } = renderHook(() => useAnalysis('missing'), { wrapper: wrapper() })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error?.message).toBe('Analysis not found')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/hooks`
Expected: import failure

- [ ] **Step 3: Implement the hooks**

```ts
// frontend/src/hooks/useAnalysis.ts
import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'
import type { AnalysisStatus } from '../api/types'

export const ACTIVE_STATUSES: AnalysisStatus[] = ['pending', 'processing']

export function isActive(status: AnalysisStatus | undefined): boolean {
  return status !== undefined && ACTIVE_STATUSES.includes(status)
}

export const analysisKey = (id: string) => ['analysis', id] as const

export function useAnalysis(id: string, { pollMs = 2000 }: { pollMs?: number } = {}) {
  return useQuery({
    queryKey: analysisKey(id),
    queryFn: () => api.getAnalysis(id),
    refetchInterval: (query) => (isActive(query.state.data?.status) ? pollMs : false),
  })
}
```

```ts
// frontend/src/hooks/useAnalyses.ts
import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'

export const analysesKey = ['analyses'] as const

export function useAnalyses() {
  return useQuery({ queryKey: analysesKey, queryFn: api.listAnalyses })
}
```

```ts
// frontend/src/hooks/useStats.ts
import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'

export const statsKey = ['stats'] as const

export function useStats() {
  return useQuery({ queryKey: statsKey, queryFn: api.stats })
}
```

```ts
// frontend/src/hooks/useHealth.ts
import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'

export function useHealth() {
  return useQuery({ queryKey: ['health'], queryFn: api.health, staleTime: 30_000 })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/hooks`
Expected: `2 passed`

- [ ] **Step 5: Commit**

```bash
git add frontend/src/hooks
git commit -m "feat(frontend): add query hooks with status polling

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: UI primitives and AppShell with routing

**Files:**
- Create: `src/components/ui/Card.tsx`, `Button.tsx`, `Badge.tsx`, `Skeleton.tsx`, `EmptyState.tsx`, `src/components/layout/AppShell.tsx`
- Modify: `src/App.tsx`, `src/main.tsx`
- Test: `src/components/layout/AppShell.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/src/components/layout/AppShell.test.tsx
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/layout`
Expected: import failure

- [ ] **Step 3: Implement UI primitives**

```tsx
// frontend/src/components/ui/Card.tsx
import type { HTMLAttributes, ReactNode } from 'react'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  title?: string
  action?: ReactNode
}

export function Card({ title, action, children, className = '', ...rest }: CardProps) {
  return (
    <section
      className={`rounded-lg border border-border bg-surface shadow-card ${className}`}
      aria-label={title}
      {...rest}
    >
      {(title || action) && (
        <header className="flex items-center justify-between gap-4 border-b border-border px-4 py-3">
          {title && <h2 className="text-sm font-semibold text-fg-strong">{title}</h2>}
          {action}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  )
}
```

```tsx
// frontend/src/components/ui/Button.tsx
import { Loader2 } from 'lucide-react'
import type { ButtonHTMLAttributes } from 'react'

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  loading?: boolean
}

const styles: Record<Variant, string> = {
  primary: 'bg-accent text-on-accent hover:bg-accent-hover',
  secondary: 'border border-border bg-surface text-fg-strong hover:bg-muted',
  danger: 'border border-danger/40 bg-surface text-danger hover:bg-danger/10',
  ghost: 'text-fg hover:bg-muted',
}

export function Button({ variant = 'primary', loading = false, disabled, children, className = '', ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-md px-4 text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:cursor-not-allowed disabled:opacity-50 ${styles[variant]} ${className}`}
      {...rest}
    >
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  )
}
```

```tsx
// frontend/src/components/ui/Badge.tsx
import type { ReactNode } from 'react'
import type { RiskLevel } from '../../api/types'
import { LEVELS } from '../../lib/risk'

export function LevelBadge({ level, size = 'sm' }: { level: RiskLevel; size?: 'sm' | 'lg' }) {
  const meta = LEVELS[level]
  const Icon = meta.icon
  const sizing = size === 'lg' ? 'px-3 py-1.5 text-base' : 'px-2 py-0.5 text-xs'
  return (
    <span className={`inline-flex items-center gap-1 rounded-full font-semibold ${meta.bg} ${meta.text} ${sizing}`}>
      <Icon className={size === 'lg' ? 'size-5' : 'size-3.5'} aria-hidden />
      {meta.label}
    </span>
  )
}

export function Chip({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-fg ${className}`}>
      {children}
    </span>
  )
}
```

```tsx
// frontend/src/components/ui/Skeleton.tsx
export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-muted ${className}`} aria-hidden />
}
```

```tsx
// frontend/src/components/ui/EmptyState.tsx
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

export function EmptyState({ icon: Icon, title, body, action }: { icon: LucideIcon; title: string; body: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border px-6 py-12 text-center">
      <Icon className="size-8 text-fg-muted" aria-hidden />
      <h2 className="text-base font-semibold text-fg-strong">{title}</h2>
      <p className="max-w-sm text-sm text-fg-muted">{body}</p>
      {action}
    </div>
  )
}
```

- [ ] **Step 4: Implement `src/components/layout/AppShell.tsx`**

```tsx
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
    try { localStorage.setItem(THEME_KEY, theme) } catch { /* ignore */ }
  }, [theme])

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `inline-flex min-h-11 items-center gap-2 rounded-md px-3 text-sm font-medium transition-colors duration-150 ${
      isActive ? 'bg-muted text-fg-strong' : 'text-fg hover:bg-muted'
    }`

  return (
    <div className="min-h-dvh">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2">
        Skip to content
      </a>
      <header className="sticky top-0 z-20 border-b border-border bg-surface/95 backdrop-blur print:hidden">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-2">
          <NavLink to="/" className="flex items-center gap-2 text-fg-strong">
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
              onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              className="ml-1 grid size-11 cursor-pointer place-items-center rounded-md text-fg transition-colors hover:bg-muted"
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
```

- [ ] **Step 5: Wire routes in `src/App.tsx` and providers in `src/main.tsx`** (pages are placeholders until later tasks)

```tsx
// frontend/src/App.tsx
import { Route, Routes } from 'react-router-dom'
import { AppShell } from './components/layout/AppShell'

function Placeholder({ name }: { name: string }) {
  return <p className="text-fg-muted">{name}</p>
}

export default function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<Placeholder name="Dashboard" />} />
        <Route path="/new" element={<Placeholder name="Upload" />} />
        <Route path="/analyses/:id" element={<Placeholder name="Report" />} />
      </Routes>
    </AppShell>
  )
}
```

```tsx
// frontend/src/main.tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)
```

Also set the tab title in `frontend/index.html`: `<title>SiteGuard</title>`.

- [ ] **Step 6: Run tests and type-check**

Run: `npx vitest run src/components/layout && npx tsc -p tsconfig.app.json --noEmit`
Expected: `2 passed`, no type errors

- [ ] **Step 7: Commit**

```bash
git add frontend/src frontend/index.html
git commit -m "feat(frontend): add UI primitives, AppShell and routing

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Dropzone and Upload page

**Files:**
- Create: `src/components/upload/Dropzone.tsx`, `src/pages/UploadPage.tsx`
- Modify: `src/App.tsx`
- Test: `src/components/upload/Dropzone.test.tsx`, `src/pages/UploadPage.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
// frontend/src/components/upload/Dropzone.test.tsx
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { renderWithProviders } from '../../test/render'
import { Dropzone } from './Dropzone'

describe('Dropzone', () => {
  it('accepts a valid image and reports it', async () => {
    const onChange = vi.fn()
    renderWithProviders(<Dropzone file={null} onChange={onChange} />)
    const input = screen.getByLabelText(/upload a photo or video/i)
    const file = new File(['x'], 'site.png', { type: 'image/png' })
    await userEvent.upload(input, file)
    expect(onChange).toHaveBeenCalledWith(file)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('rejects an unsupported type with a visible error', async () => {
    const onChange = vi.fn()
    renderWithProviders(<Dropzone file={null} onChange={onChange} />)
    const input = screen.getByLabelText(/upload a photo or video/i)
    await userEvent.upload(input, new File(['x'], 'doc.pdf', { type: 'application/pdf' }), { applyAccept: false })
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent(/unsupported file type/i)
  })

  it('rejects oversize files', async () => {
    const onChange = vi.fn()
    renderWithProviders(<Dropzone file={null} onChange={onChange} maxBytes={10} />)
    const input = screen.getByLabelText(/upload a photo or video/i)
    await userEvent.upload(input, new File(['0123456789ab'], 'big.png', { type: 'image/png' }))
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent(/too large/i)
  })

  it('shows selected file name and a clear button', async () => {
    const onChange = vi.fn()
    const file = new File(['x'], 'clip.mov', { type: 'video/quicktime' })
    renderWithProviders(<Dropzone file={file} onChange={onChange} />)
    expect(screen.getByText('clip.mov')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /remove file/i }))
    expect(onChange).toHaveBeenCalledWith(null)
  })
})
```

```tsx
// frontend/src/pages/UploadPage.test.tsx
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

  it('shows backend error under the form', async () => {
    server.use(http.post('*/api/analyses', () => HttpResponse.json({ detail: 'Unsupported file type' }, { status: 400 })))
    renderPage()
    await userEvent.upload(screen.getByLabelText(/upload a photo or video/i), new File(['x'], 'a.png', { type: 'image/png' }))
    await userEvent.click(screen.getByRole('button', { name: /analyze/i }))
    await waitFor(() => expect(screen.getAllByRole('alert').at(-1)).toHaveTextContent('Unsupported file type'))
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/upload src/pages/UploadPage.test.tsx`
Expected: import failures

- [ ] **Step 3: Implement `src/components/upload/Dropzone.tsx`**

```tsx
import { FileVideo, Image as ImageIcon, Upload, X } from 'lucide-react'
import { useEffect, useId, useMemo, useState, type DragEvent } from 'react'

export const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime', 'video/webm']
export const DEFAULT_MAX_BYTES = 100 * 1024 * 1024

interface DropzoneProps {
  file: File | null
  onChange: (file: File | null) => void
  maxBytes?: number
}

export function validateFile(file: File, maxBytes: number): string | null {
  if (!ACCEPTED_TYPES.includes(file.type)) {
    return `Unsupported file type. Use JPG, PNG, WebP, MP4, MOV or WebM.`
  }
  if (file.size > maxBytes) {
    return `File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Limit is ${Math.round(maxBytes / 1024 / 1024)} MB.`
  }
  return null
}

export function Dropzone({ file, onChange, maxBytes = DEFAULT_MAX_BYTES }: DropzoneProps) {
  const inputId = useId()
  const errorId = useId()
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)

  const previewUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file])
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl) }, [previewUrl])

  function handle(candidate: File | undefined) {
    if (!candidate) return
    const problem = validateFile(candidate, maxBytes)
    setError(problem)
    if (!problem) onChange(candidate)
  }

  function onDrop(e: DragEvent<HTMLLabelElement>) {
    e.preventDefault()
    setDragging(false)
    handle(e.dataTransfer.files?.[0])
  }

  if (file) {
    const isVideo = file.type.startsWith('video/')
    return (
      <div className="rounded-lg border border-border bg-surface p-4">
        <div className="flex items-start gap-4">
          <div className="w-40 shrink-0 overflow-hidden rounded-md bg-muted" style={{ aspectRatio: '16 / 10' }}>
            {previewUrl && (isVideo
              ? <video src={previewUrl} className="size-full object-cover" muted playsInline aria-label={`Preview of ${file.name}`} />
              : <img src={previewUrl} alt={`Preview of ${file.name}`} className="size-full object-cover" />)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 truncate text-sm font-medium text-fg-strong">
              {isVideo ? <FileVideo className="size-4 shrink-0" aria-hidden /> : <ImageIcon className="size-4 shrink-0" aria-hidden />}
              <span className="truncate">{file.name}</span>
            </p>
            <p className="mt-1 text-xs text-fg-muted">{(file.size / 1024 / 1024).toFixed(1)} MB · {file.type}</p>
          </div>
          <button
            type="button"
            onClick={() => { setError(null); onChange(null) }}
            aria-label="Remove file"
            className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-md text-fg-muted hover:bg-muted"
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div>
      <label
        htmlFor={inputId}
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-6 py-10 text-center transition-colors duration-150 ${
          dragging ? 'border-accent bg-accent/5' : 'border-border bg-surface hover:border-fg-muted'
        }`}
      >
        <Upload className="size-8 text-fg-muted" aria-hidden />
        <span className="text-sm font-medium text-fg-strong">Upload a photo or video of the site</span>
        <span className="text-xs text-fg-muted">Drag and drop, or click to browse · JPG, PNG, WebP, MP4, MOV, WebM · up to {Math.round(maxBytes / 1024 / 1024)} MB</span>
      </label>
      <input
        id={inputId}
        type="file"
        accept={ACCEPTED_TYPES.join(',')}
        className="sr-only"
        aria-describedby={error ? errorId : undefined}
        aria-invalid={error ? true : undefined}
        onChange={(e) => handle(e.target.files?.[0])}
      />
      {error && (
        <p id={errorId} role="alert" className="mt-2 text-sm text-danger">{error}</p>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Implement `src/pages/UploadPage.tsx`**

```tsx
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, ApiError } from '../api/client'
import { Dropzone } from '../components/upload/Dropzone'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { useHealth } from '../hooks/useHealth'
import { analysesKey } from '../hooks/useAnalyses'

export function UploadPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const health = useHealth()
  const [file, setFile] = useState<File | null>(null)
  const [siteName, setSiteName] = useState('')

  const geminiMissing = health.data?.gemini_configured === false

  const create = useMutation({
    mutationFn: () => api.createAnalysis(file!, siteName),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: analysesKey })
      navigate(`/analyses/${created.id}`)
    },
  })

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <header>
        <h1 className="text-xl font-semibold text-fg-strong">New analysis</h1>
        <p className="text-sm text-fg-muted">Upload one photo or a short video. Gemini checks workers, PPE and site hazards.</p>
      </header>

      {geminiMissing && (
        <div role="alert" className="flex items-start gap-2 rounded-md border border-risk-moderate/40 bg-risk-moderate/10 p-3 text-sm text-fg-strong">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-risk-moderate" aria-hidden />
          <span>The backend has no <code className="font-mono">GEMINI_API_KEY</code> configured. Add it to <code className="font-mono">backend/.env</code> and restart the API.</span>
        </div>
      )}

      <Card>
        <form
          className="space-y-5"
          onSubmit={(e) => { e.preventDefault(); if (file) create.mutate() }}
        >
          <div>
            <label htmlFor="site-name" className="block text-sm font-medium text-fg-strong">Site name <span className="font-normal text-fg-muted">(optional)</span></label>
            <input
              id="site-name"
              value={siteName}
              onChange={(e) => setSiteName(e.target.value)}
              maxLength={200}
              placeholder="e.g. Tower A — 2nd floor slab"
              className="mt-1 block min-h-11 w-full rounded-md border border-border bg-surface px-3 text-base text-fg-strong placeholder:text-fg-muted focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <p className="mt-1 text-xs text-fg-muted">Shown on the report and dashboard so you can tell analyses apart.</p>
          </div>

          <Dropzone file={file} onChange={setFile} />

          {create.error && (
            <p role="alert" className="text-sm text-danger">
              {create.error instanceof ApiError ? create.error.message : 'Upload failed. Please try again.'}
            </p>
          )}

          <div className="flex justify-end">
            <Button type="submit" disabled={!file || geminiMissing} loading={create.isPending}>
              {create.isPending ? 'Uploading…' : 'Analyze'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  )
}
```

- [ ] **Step 5: Route it in `src/App.tsx`**

Replace the `/new` placeholder:
```tsx
import { UploadPage } from './pages/UploadPage'
// ...
<Route path="/new" element={<UploadPage />} />
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run src/components/upload src/pages/UploadPage.test.tsx && npx tsc -p tsconfig.app.json --noEmit`
Expected: `7 passed`, no type errors

- [ ] **Step 7: Commit**

```bash
git add frontend/src
git commit -m "feat(frontend): add Dropzone and Upload page

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Report widgets — RiskGauge, MitigationBars, WorkersPanel

**Files:**
- Create: `src/components/report/RiskGauge.tsx`, `MitigationBars.tsx`, `WorkersPanel.tsx`
- Test: `src/components/report/widgets.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
// frontend/src/components/report/widgets.test.tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { completedDetail } from '../../test/fixtures'
import { MitigationBars } from './MitigationBars'
import { RiskGauge } from './RiskGauge'
import { WorkersPanel } from './WorkersPanel'

describe('RiskGauge', () => {
  it('shows score and level as text', () => {
    render(<RiskGauge score={88} level="Critical" />)
    expect(screen.getByText('88')).toBeInTheDocument()
    expect(screen.getByText('Critical')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /risk score 88 out of 100, critical/i })).toBeInTheDocument()
  })
})

describe('MitigationBars', () => {
  it('shows current, residual and reduction', () => {
    render(<MitigationBars scores={completedDetail.scores!} />)
    expect(screen.getByText(/current risk/i)).toBeInTheDocument()
    expect(screen.getByText(/after mitigation/i)).toBeInTheDocument()
    expect(screen.getByText(/reduce risk by 72 points/i)).toBeInTheDocument()
    expect(screen.getByText(/88% → 16%/)).toBeInTheDocument()
  })
})

describe('WorkersPanel', () => {
  it('lists workers, PPE chips and unsafe behaviours', () => {
    render(<WorkersPanel workers={completedDetail.result!.workers} complianceRate={0.75} />)
    expect(screen.getByText(/2 workers visible/i)).toBeInTheDocument()
    expect(screen.getByText('Helmet')).toBeInTheDocument()
    expect(screen.getByText('1/2')).toBeInTheDocument()
    expect(screen.getByText('Hi-vis vest')).toBeInTheDocument()
    expect(screen.getByText('2/2')).toBeInTheDocument()
    expect(screen.getByText(/75%/)).toBeInTheDocument()
    expect(screen.getByText('Leaning over unprotected edge')).toBeInTheDocument()
  })

  it('handles no workers', () => {
    render(<WorkersPanel workers={{ workers_visible: 0, ppe: [], unsafe_behaviours: [] }} complianceRate={null} />)
    expect(screen.getByText(/no workers visible/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/report`
Expected: import failures

- [ ] **Step 3: Implement `RiskGauge.tsx`**

```tsx
import type { RiskLevel } from '../../api/types'
import { LEVELS } from '../../lib/risk'

interface Props {
  score: number
  level: RiskLevel
  caption?: string
}

/** Semi-circular gauge. Score is always rendered as text; the arc is decoration. */
export function RiskGauge({ score, level, caption = 'Overall risk' }: Props) {
  const meta = LEVELS[level]
  const Icon = meta.icon
  const r = 80
  const circumference = Math.PI * r // half circle
  const filled = (Math.max(0, Math.min(100, score)) / 100) * circumference

  return (
    <div className="flex flex-col items-center">
      <svg
        viewBox="0 0 200 120"
        className="w-full max-w-[260px]"
        role="img"
        aria-label={`Risk score ${score} out of 100, ${meta.label}`}
      >
        <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke="var(--color-muted)" strokeWidth="16" strokeLinecap="round" />
        <path
          d="M 20 100 A 80 80 0 0 1 180 100"
          fill="none"
          stroke={meta.cssVar}
          strokeWidth="16"
          strokeLinecap="round"
          strokeDasharray={`${filled} ${circumference}`}
          style={{ transition: 'stroke-dasharray 300ms ease-out' }}
        />
        <text x="100" y="92" textAnchor="middle" className="fill-fg-strong font-mono" style={{ fontSize: 44, fontWeight: 600 }}>
          {score}
        </text>
        <text x="100" y="112" textAnchor="middle" className="fill-fg-muted" style={{ fontSize: 12 }}>
          {caption} · 0–100
        </text>
      </svg>
      <p className={`mt-1 inline-flex items-center gap-1.5 text-base font-semibold ${meta.text}`}>
        <Icon className="size-5" aria-hidden />
        {meta.label}
      </p>
    </div>
  )
}
```

- [ ] **Step 4: Implement `MitigationBars.tsx`**

```tsx
import { ArrowDownRight } from 'lucide-react'
import type { ScoreSummary } from '../../api/types'
import { LEVELS } from '../../lib/risk'

function Bar({ label, value, fill }: { label: string; value: number; fill: string }) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-sm">
        <span className="font-medium text-fg-strong">{label}</span>
        <span className="tabular font-mono font-semibold text-fg-strong">{value}%</span>
      </div>
      <div className="h-3 w-full overflow-hidden rounded-full bg-muted" role="presentation">
        <div className={`h-full rounded-full ${fill} transition-[width] duration-300 ease-out`} style={{ width: `${value}%` }} />
      </div>
    </div>
  )
}

export function MitigationBars({ scores }: { scores: ScoreSummary }) {
  const current = LEVELS[scores.risk_level]
  const residual = LEVELS[scores.residual_level]
  return (
    <div className="space-y-4">
      <Bar label="Current risk" value={scores.risk_score} fill={current.fill} />
      <Bar label="After mitigation" value={scores.residual_score} fill={residual.fill} />
      <p className="flex items-start gap-2 rounded-md bg-muted p-3 text-sm text-fg-strong">
        <ArrowDownRight className="mt-0.5 size-4 shrink-0 text-risk-low" aria-hidden />
        <span>
          Applying every recommendation would <strong>reduce risk by {scores.reduction} points</strong>{' '}
          <span className="tabular font-mono">({scores.risk_score}% → {scores.residual_score}%)</span>, from{' '}
          <span className={current.text}>{current.label}</span> to <span className={residual.text}>{residual.label}</span>.
        </span>
      </p>
    </div>
  )
}
```

- [ ] **Step 5: Implement `WorkersPanel.tsx`**

```tsx
import { AlertTriangle, Check, Users } from 'lucide-react'
import type { WorkerAssessment } from '../../api/types'
import { formatPercent } from '../../lib/format'
import { PPE_LABELS } from '../../lib/risk'

export function WorkersPanel({ workers, complianceRate }: { workers: WorkerAssessment; complianceRate: number | null }) {
  if (workers.workers_visible === 0 && workers.ppe.length === 0) {
    return (
      <p className="flex items-center gap-2 text-sm text-fg-muted">
        <Users className="size-4" aria-hidden /> No workers visible in this footage.
      </p>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-medium text-fg-strong">
          <Users className="size-4" aria-hidden />
          {workers.workers_visible} worker{workers.workers_visible === 1 ? '' : 's'} visible
        </p>
        <p className="text-sm text-fg-muted">
          PPE compliance <span className="tabular font-mono font-semibold text-fg-strong">{formatPercent(complianceRate)}</span>
        </p>
      </div>

      {workers.ppe.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="PPE compliance by item">
          {workers.ppe.map((check) => {
            const total = check.compliant + check.non_compliant
            const ok = check.non_compliant === 0
            return (
              <li
                key={check.item}
                title={check.notes || undefined}
                className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium ${
                  ok ? 'border-risk-low/40 bg-risk-low/10 text-fg-strong' : 'border-risk-critical/40 bg-risk-critical/10 text-fg-strong'
                }`}
              >
                {ok ? <Check className="size-3.5 text-risk-low" aria-hidden /> : <AlertTriangle className="size-3.5 text-risk-critical" aria-hidden />}
                <span>{PPE_LABELS[check.item]}</span>
                <span className="tabular font-mono">{check.compliant}/{total}</span>
                <span className="sr-only">{ok ? 'all compliant' : `${check.non_compliant} missing`}</span>
              </li>
            )
          })}
        </ul>
      )}

      {workers.unsafe_behaviours.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-fg-muted">Unsafe behaviours</p>
          <ul className="list-disc space-y-1 pl-5 text-sm text-fg">
            {workers.unsafe_behaviours.map((b) => <li key={b}>{b}</li>)}
          </ul>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run src/components/report`
Expected: `4 passed`

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/report
git commit -m "feat(frontend): add RiskGauge, MitigationBars and WorkersPanel

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Report widgets — RiskMatrix, CategoryBar, FindingCard, FindingsList, PositiveList

**Files:**
- Create: `src/components/report/RiskMatrix.tsx`, `CategoryBar.tsx`, `FindingCard.tsx`, `FindingsList.tsx`, `PositiveList.tsx`
- Test: `src/components/report/findings.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
// frontend/src/components/report/findings.test.tsx
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { completedDetail, findingEdge, findingHelmet } from '../../test/fixtures'
import { CategoryBar } from './CategoryBar'
import { FindingCard } from './FindingCard'
import { FindingsList } from './FindingsList'
import { RiskMatrix } from './RiskMatrix'

describe('RiskMatrix', () => {
  it('places findings in the right cells', () => {
    render(<RiskMatrix findings={[findingHelmet, findingEdge]} />)
    // helmet: severity 4, likelihood 3; edge: severity 5, likelihood 4
    expect(screen.getByLabelText('Severity 4, likelihood 3: 1 finding')).toBeInTheDocument()
    expect(screen.getByLabelText('Severity 5, likelihood 4: 1 finding')).toBeInTheDocument()
    expect(screen.getByLabelText('Severity 1, likelihood 1: 0 findings')).toBeInTheDocument()
  })
})

describe('CategoryBar', () => {
  it('renders an accessible list of counts', () => {
    render(<CategoryBar counts={{ ppe: 2, fall_protection: 1 }} />)
    const list = screen.getByRole('list', { name: /findings by category/i })
    expect(within(list).getByText(/PPE: 2/)).toBeInTheDocument()
    expect(within(list).getByText(/Fall protection: 1/)).toBeInTheDocument()
  })

  it('shows empty state', () => {
    render(<CategoryBar counts={{}} />)
    expect(screen.getByText(/no findings/i)).toBeInTheDocument()
  })
})

describe('FindingCard', () => {
  it('shows all fields', () => {
    render(<FindingCard finding={findingHelmet} risk={12} residualRisk={2.4} />)
    expect(screen.getByRole('heading', { name: 'Worker without helmet' })).toBeInTheDocument()
    expect(screen.getByText('Worker')).toBeInTheDocument()
    expect(screen.getByText('PPE')).toBeInTheDocument()
    expect(screen.getByText(/severity 4/i)).toBeInTheDocument()
    expect(screen.getByText(/likelihood 3/i)).toBeInTheDocument()
    expect(screen.getByText(/risk 12/i)).toBeInTheDocument()
    expect(screen.getByText(/0:04/)).toBeInTheDocument()
    expect(screen.getByText('hard hat')).toBeInTheDocument()
    expect(screen.getByText(/−80% after fix/)).toBeInTheDocument()
  })
})

describe('FindingsList', () => {
  it('sorts by risk desc and filters by subject', async () => {
    render(<FindingsList result={completedDetail.result!} scores={completedDetail.scores!} />)
    const headings = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)
    expect(headings).toEqual(['Unprotected slab edge', 'Worker without helmet', 'Extension cable in water'])

    await userEvent.click(screen.getByRole('button', { name: /workers \(1\)/i }))
    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(1)
    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('Worker without helmet')

    await userEvent.click(screen.getByRole('button', { name: /all \(3\)/i }))
    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(3)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/report/findings.test.tsx`
Expected: import failures

- [ ] **Step 3: Implement `RiskMatrix.tsx`**

```tsx
import type { Finding } from '../../api/types'
import { LEVELS, riskBand } from '../../lib/risk'

const SCALE = [1, 2, 3, 4, 5]

export function RiskMatrix({ findings }: { findings: Finding[] }) {
  const counts = new Map<string, number>()
  for (const f of findings) {
    const key = `${f.severity}-${f.likelihood}`
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  return (
    <div>
      <div className="grid gap-1" style={{ gridTemplateColumns: 'auto repeat(5, minmax(0, 1fr))' }} role="table" aria-label="Severity by likelihood matrix">
        <div role="row" className="contents">
          <div role="columnheader" className="pr-2 text-right text-[11px] font-medium text-fg-muted">Sev ↓ / Lik →</div>
          {SCALE.map((l) => <div key={l} role="columnheader" className="pb-1 text-center text-xs font-medium text-fg-muted">{l}</div>)}
        </div>
        {[...SCALE].reverse().map((severity) => (
          <div role="row" className="contents" key={severity}>
            <div role="rowheader" className="pr-2 text-right text-xs font-medium text-fg-muted">{severity}</div>
            {SCALE.map((likelihood) => {
              const n = counts.get(`${severity}-${likelihood}`) ?? 0
              const meta = LEVELS[riskBand(severity * likelihood)]
              return (
                <div
                  key={likelihood}
                  role="cell"
                  aria-label={`Severity ${severity}, likelihood ${likelihood}: ${n} finding${n === 1 ? '' : 's'}`}
                  className={`grid aspect-square place-items-center rounded-md text-sm font-semibold ${meta.bg} ${n > 0 ? meta.text : 'text-transparent'} ${n > 0 ? 'ring-2 ring-inset ring-current' : ''}`}
                >
                  {n > 0 ? n : '·'}
                </div>
              )
            })}
          </div>
        ))}
      </div>
      <ul className="mt-3 flex flex-wrap gap-3 text-xs text-fg-muted" aria-label="Legend">
        {(['Low', 'Moderate', 'High', 'Critical'] as const).map((lvl) => (
          <li key={lvl} className="flex items-center gap-1">
            <span className={`inline-block size-3 rounded-sm ${LEVELS[lvl].fill}`} aria-hidden /> {lvl}
          </li>
        ))}
      </ul>
    </div>
  )
}
```

- [ ] **Step 4: Implement `CategoryBar.tsx`**

```tsx
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { RiskCategory } from '../../api/types'
import { CATEGORY_LABELS } from '../../lib/risk'

export function CategoryBar({ counts }: { counts: Partial<Record<RiskCategory, number>> }) {
  const data = (Object.entries(counts) as [RiskCategory, number][])
    .map(([category, count]) => ({ name: CATEGORY_LABELS[category], count }))
    .sort((a, b) => b.count - a.count)

  if (data.length === 0) {
    return <p className="text-sm text-fg-muted">No findings to chart.</p>
  }

  return (
    <div>
      <div style={{ height: Math.max(160, data.length * 32) }} aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ left: 8, right: 24, top: 4, bottom: 4 }}>
            <CartesianGrid horizontal={false} stroke="var(--color-border)" />
            <XAxis type="number" allowDecimals={false} tick={{ fill: 'var(--color-fg-muted)', fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="name" width={110} tick={{ fill: 'var(--color-fg)', fontSize: 12 }} axisLine={false} tickLine={false} />
            <Tooltip cursor={{ fill: 'var(--color-muted)' }} contentStyle={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 6, color: 'var(--color-fg-strong)' }} />
            <Bar dataKey="count" fill="var(--color-accent)" radius={[0, 4, 4, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <ul className="sr-only" aria-label="Findings by category">
        {data.map((d) => <li key={d.name}>{d.name}: {d.count}</li>)}
      </ul>
    </div>
  )
}
```

- [ ] **Step 5: Implement `FindingCard.tsx`**

```tsx
import { Clock, MapPin, Wrench } from 'lucide-react'
import type { Finding } from '../../api/types'
import { formatTimestamp } from '../../lib/format'
import { CATEGORY_LABELS, LEVELS, SUBJECT_META, riskBand } from '../../lib/risk'
import { Chip } from '../ui/Badge'

interface Props {
  finding: Finding
  risk: number
  residualRisk: number
}

export function FindingCard({ finding, risk }: Props) {
  const subject = SUBJECT_META[finding.subject]
  const SubjectIcon = subject.icon
  const band = LEVELS[riskBand(risk)]
  const reduction = Math.round(finding.mitigation_effectiveness * 100)

  return (
    <article className="rounded-lg border border-border bg-surface p-4 shadow-card">
      <div className="flex flex-wrap items-center gap-2">
        <Chip><SubjectIcon className="size-3.5" aria-hidden />{subject.label}</Chip>
        <Chip>{CATEGORY_LABELS[finding.category]}</Chip>
        <span className={`ml-auto inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold ${band.bg} ${band.text}`}>
          <span className="tabular font-mono">Risk {risk}</span>
          <span aria-hidden>·</span>
          <span>{band.label}</span>
        </span>
      </div>

      <h3 className="mt-2 text-base font-semibold text-fg-strong">{finding.title}</h3>
      <p className="mt-1 text-sm text-fg">{finding.description}</p>

      <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        <div className="flex gap-2">
          <dt className="sr-only">Severity and likelihood</dt>
          <dd className="flex flex-wrap gap-2">
            <Chip>Severity {finding.severity}/5</Chip>
            <Chip>Likelihood {finding.likelihood}/5</Chip>
          </dd>
        </div>
        <div className="flex items-start gap-2 text-fg-muted">
          <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />
          <dt className="sr-only">Evidence</dt>
          <dd>
            {finding.evidence}
            {finding.timestamp_seconds !== null && (
              <span className="ml-2 inline-flex items-center gap-1 tabular font-mono text-xs">
                <Clock className="size-3" aria-hidden />{formatTimestamp(finding.timestamp_seconds)}
              </span>
            )}
          </dd>
        </div>
      </dl>

      <div className="mt-3 rounded-md border-l-4 border-accent bg-muted p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-fg-muted">Recommendation</p>
        <p className="mt-1 text-sm text-fg-strong">{finding.recommendation}</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {finding.required_equipment.map((item) => (
            <Chip key={item} className="bg-surface"><Wrench className="size-3" aria-hidden />{item}</Chip>
          ))}
          <span className="ml-auto text-xs font-semibold text-risk-low">−{reduction}% after fix</span>
        </div>
      </div>
    </article>
  )
}
```

- [ ] **Step 6: Implement `FindingsList.tsx` and `PositiveList.tsx`**

```tsx
// frontend/src/components/report/FindingsList.tsx
import { useMemo, useState } from 'react'
import type { AnalysisResult, FindingSubject, ScoreSummary } from '../../api/types'
import { SUBJECT_META } from '../../lib/risk'
import { FindingCard } from './FindingCard'

type Filter = 'all' | FindingSubject

export function FindingsList({ result, scores }: { result: AnalysisResult; scores: ScoreSummary }) {
  const [filter, setFilter] = useState<Filter>('all')

  const rows = useMemo(() => {
    const scored = result.findings.map((finding, index) => ({
      finding,
      index,
      risk: scores.per_finding[index]?.risk ?? finding.severity * finding.likelihood,
      residualRisk: scores.per_finding[index]?.residual_risk ?? 0,
    }))
    return scored.sort((a, b) => b.risk - a.risk)
  }, [result.findings, scores.per_finding])

  const visible = filter === 'all' ? rows : rows.filter((r) => r.finding.subject === filter)
  const counts: Record<Filter, number> = {
    all: rows.length,
    worker: scores.findings_by_subject.worker ?? 0,
    site: scores.findings_by_subject.site ?? 0,
    equipment: scores.findings_by_subject.equipment ?? 0,
  }
  const filters: { key: Filter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'worker', label: 'Workers' },
    { key: 'site', label: 'Site' },
    { key: 'equipment', label: 'Equipment' },
  ]

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 print:hidden" role="group" aria-label="Filter findings by subject">
        {filters.map(({ key, label }) => {
          const active = filter === key
          const Icon = key === 'all' ? null : SUBJECT_META[key].icon
          return (
            <button
              key={key}
              type="button"
              aria-pressed={active}
              onClick={() => setFilter(key)}
              className={`inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-md border px-3 text-sm font-medium transition-colors duration-150 ${
                active ? 'border-accent bg-accent text-on-accent' : 'border-border bg-surface text-fg hover:bg-muted'
              }`}
            >
              {Icon && <Icon className="size-4" aria-hidden />}
              {label} ({counts[key]})
            </button>
          )
        })}
      </div>
      {visible.length === 0 ? (
        <p className="text-sm text-fg-muted">No findings for this filter.</p>
      ) : (
        <div className="space-y-3">
          {visible.map((row) => (
            <FindingCard key={row.index} finding={row.finding} risk={row.risk} residualRisk={row.residualRisk} />
          ))}
        </div>
      )}
    </div>
  )
}
```

```tsx
// frontend/src/components/report/PositiveList.tsx
import { CheckCircle2 } from 'lucide-react'

export function PositiveList({ items }: { items: string[] }) {
  if (items.length === 0) return <p className="text-sm text-fg-muted">No positive observations recorded.</p>
  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li key={item} className="flex items-start gap-2 text-sm text-fg">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-risk-low" aria-hidden />
          {item}
        </li>
      ))}
    </ul>
  )
}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npx vitest run src/components/report && npx tsc -p tsconfig.app.json --noEmit`
Expected: `9 passed`, no type errors

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/report
git commit -m "feat(frontend): add RiskMatrix, CategoryBar, FindingCard, FindingsList, PositiveList

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Report page (processing, failed, completed, print)

**Files:**
- Create: `src/components/report/ReportHeader.tsx`, `src/pages/ReportPage.tsx`
- Modify: `src/App.tsx`
- Test: `src/pages/ReportPage.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
// frontend/src/pages/ReportPage.test.tsx
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import { failedDetail, processingDetail } from '../test/fixtures'
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

  it('shows not found', async () => {
    renderReport('missing')
    expect(await screen.findByText(/analysis not found/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/pages/ReportPage.test.tsx`
Expected: import failure

- [ ] **Step 3: Implement `ReportHeader.tsx`**

```tsx
import { Printer, Trash2 } from 'lucide-react'
import { api } from '../../api/client'
import type { AnalysisDetail } from '../../api/types'
import { formatDate, formatTokens } from '../../lib/format'
import { LevelBadge } from '../ui/Badge'
import { Button } from '../ui/Button'

interface Props {
  analysis: AnalysisDetail
  onDelete: () => void
  deleting: boolean
}

export function ReportHeader({ analysis, onDelete, deleting }: Props) {
  const mediaUrl = api.mediaUrl(analysis.id)
  return (
    <header className="grid gap-4 rounded-lg border border-border bg-surface p-4 shadow-card md:grid-cols-[240px_1fr]">
      <div className="overflow-hidden rounded-md bg-muted" style={{ aspectRatio: '16 / 10' }}>
        {analysis.media_type === 'video' ? (
          <video src={mediaUrl} controls muted playsInline className="size-full object-cover" aria-label={`Video ${analysis.filename}`} />
        ) : (
          <img src={mediaUrl} alt={`Site photo ${analysis.filename}`} className="size-full object-cover" />
        )}
      </div>
      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold text-fg-strong">{analysis.site_name ?? 'Site analysis'}</h1>
            <p className="text-sm text-fg-muted">{analysis.filename} · {formatDate(analysis.created_at)}</p>
          </div>
          {analysis.risk_level && <LevelBadge level={analysis.risk_level} size="lg" />}
        </div>
        {analysis.result && <p className="text-sm text-fg">{analysis.result.scene_summary}</p>}
        <dl className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-fg-muted">
          <div><dt className="inline">Model: </dt><dd className="inline font-mono">{analysis.model ?? '—'}</dd></div>
          <div><dt className="inline">Tokens in/out: </dt><dd className="inline tabular font-mono">{formatTokens(analysis.input_tokens)} / {formatTokens(analysis.output_tokens)}</dd></div>
        </dl>
        <div className="mt-auto flex flex-wrap gap-2 print:hidden">
          <Button variant="secondary" onClick={() => window.print()}>
            <Printer className="size-4" aria-hidden /> Download PDF
          </Button>
          <Button variant="danger" onClick={onDelete} loading={deleting}>
            <Trash2 className="size-4" aria-hidden /> Delete
          </Button>
        </div>
      </div>
    </header>
  )
}
```

- [ ] **Step 4: Implement `src/pages/ReportPage.tsx`**

```tsx
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Loader2, RefreshCw } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import { api, ApiError } from '../api/client'
import { CategoryBar } from '../components/report/CategoryBar'
import { FindingsList } from '../components/report/FindingsList'
import { MitigationBars } from '../components/report/MitigationBars'
import { PositiveList } from '../components/report/PositiveList'
import { ReportHeader } from '../components/report/ReportHeader'
import { RiskGauge } from '../components/report/RiskGauge'
import { RiskMatrix } from '../components/report/RiskMatrix'
import { WorkersPanel } from '../components/report/WorkersPanel'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Skeleton } from '../components/ui/Skeleton'
import { analysesKey } from '../hooks/useAnalyses'
import { analysisKey, isActive, useAnalysis } from '../hooks/useAnalysis'
import { statsKey } from '../hooks/useStats'

export function ReportPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const query = useAnalysis(id)

  const retry = useMutation({
    mutationFn: () => api.retryAnalysis(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: analysisKey(id) }),
  })

  const remove = useMutation({
    mutationFn: () => api.deleteAnalysis(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: analysesKey })
      queryClient.invalidateQueries({ queryKey: statsKey })
      navigate('/')
    },
  })

  if (query.isPending) {
    return <ReportSkeleton />
  }

  if (query.isError) {
    const message = query.error instanceof ApiError && query.error.status === 404
      ? 'Analysis not found.'
      : query.error.message
    return (
      <Card>
        <p className="text-sm text-fg-strong">{message}</p>
        <Button variant="secondary" className="mt-3" onClick={() => navigate('/')}>Back to dashboard</Button>
      </Card>
    )
  }

  const analysis = query.data

  if (isActive(analysis.status)) {
    return (
      <div className="space-y-4">
        <div role="status" className="flex items-center gap-3 rounded-lg border border-border bg-surface p-4 shadow-card">
          <Loader2 className="size-5 animate-spin text-accent" aria-hidden />
          <div>
            <p className="text-sm font-semibold text-fg-strong">Analyzing {analysis.media_type}…</p>
            <p className="text-xs text-fg-muted">
              {analysis.media_type === 'video' ? 'Video usually takes 20–60 seconds.' : 'Images usually take under 15 seconds.'} This page updates automatically.
            </p>
          </div>
        </div>
        <ReportSkeleton />
      </div>
    )
  }

  if (analysis.status === 'failed' || !analysis.result || !analysis.scores) {
    return (
      <Card title="Analysis failed">
        <div role="alert" className="flex items-start gap-2 text-sm text-fg-strong">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-risk-critical" aria-hidden />
          <span>{analysis.error_message ?? 'The analysis did not produce a result.'}</span>
        </div>
        <div className="mt-4 flex gap-2">
          <Button onClick={() => retry.mutate()} loading={retry.isPending}>
            <RefreshCw className="size-4" aria-hidden /> Retry
          </Button>
          <Button variant="danger" onClick={() => remove.mutate()} loading={remove.isPending}>Delete</Button>
        </div>
        {retry.error && <p role="alert" className="mt-2 text-sm text-danger">{retry.error.message}</p>}
      </Card>
    )
  }

  const { result, scores } = analysis

  return (
    <div className="space-y-4">
      <ReportHeader
        analysis={analysis}
        deleting={remove.isPending}
        onDelete={() => { if (window.confirm('Delete this analysis and its media file?')) remove.mutate() }}
      />

      <div className="grid gap-4 md:grid-cols-3">
        <Card title="Risk score"><RiskGauge score={scores.risk_score} level={scores.risk_level} /></Card>
        <Card title="Current vs after mitigation"><MitigationBars scores={scores} /></Card>
        <Card title="Workers & PPE"><WorkersPanel workers={result.workers} complianceRate={scores.ppe_compliance_rate} /></Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 print-break">
        <Card title="Severity × likelihood"><RiskMatrix findings={result.findings} /></Card>
        <Card title="Findings by category"><CategoryBar counts={scores.findings_by_category} /></Card>
      </div>

      <Card title={`Findings (${result.findings.length})`} className="print-break">
        <FindingsList result={result} scores={scores} />
      </Card>

      <Card title="Positive observations">
        <PositiveList items={result.positive_observations} />
      </Card>
    </div>
  )
}

function ReportSkeleton() {
  return (
    <div className="space-y-4" aria-hidden>
      <Skeleton className="h-40" />
      <div className="grid gap-4 md:grid-cols-3">
        <Skeleton className="h-56" /><Skeleton className="h-56" /><Skeleton className="h-56" />
      </div>
      <Skeleton className="h-64" />
    </div>
  )
}
```

- [ ] **Step 5: Route it in `src/App.tsx`**

```tsx
import { ReportPage } from './pages/ReportPage'
// ...
<Route path="/analyses/:id" element={<ReportPage />} />
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run src/pages/ReportPage.test.tsx && npx tsc -p tsconfig.app.json --noEmit`
Expected: `5 passed`, no type errors

- [ ] **Step 7: Commit**

```bash
git add frontend/src
git commit -m "feat(frontend): add Report page with processing, failed and print states

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Dashboard page

**Files:**
- Create: `src/components/dashboard/KpiCard.tsx`, `TrendChart.tsx`, `AnalysesTable.tsx`, `src/pages/DashboardPage.tsx`
- Modify: `src/App.tsx`
- Test: `src/pages/DashboardPage.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
// frontend/src/pages/DashboardPage.test.tsx
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/pages/DashboardPage.test.tsx`
Expected: import failure

- [ ] **Step 3: Implement dashboard components**

```tsx
// frontend/src/components/dashboard/KpiCard.tsx
import type { LucideIcon } from 'lucide-react'

interface Props {
  label: string
  value: string
  icon: LucideIcon
  hint?: string
  tone?: 'default' | 'critical'
}

export function KpiCard({ label, value, icon: Icon, hint, tone = 'default' }: Props) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4 shadow-card">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-fg-muted">{label}</p>
        <Icon className={`size-4 ${tone === 'critical' ? 'text-risk-critical' : 'text-fg-muted'}`} aria-hidden />
      </div>
      <p className={`tabular mt-2 font-mono text-3xl font-semibold ${tone === 'critical' ? 'text-risk-critical' : 'text-fg-strong'}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-fg-muted">{hint}</p>}
    </div>
  )
}
```

```tsx
// frontend/src/components/dashboard/TrendChart.tsx
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { TrendPoint } from '../../api/types'
import { formatShortDate } from '../../lib/format'

export function TrendChart({ trend }: { trend: TrendPoint[] }) {
  if (trend.length === 0) return <p className="text-sm text-fg-muted">No completed analyses yet.</p>
  const data = trend.map((p) => ({ date: formatShortDate(p.date), score: p.score }))
  return (
    <div>
      <div style={{ height: 220 }} aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ left: 0, right: 16, top: 8, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--color-border)" />
            <XAxis dataKey="date" tick={{ fill: 'var(--color-fg-muted)', fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} width={32} tick={{ fill: 'var(--color-fg-muted)', fontSize: 12 }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 6, color: 'var(--color-fg-strong)' }} />
            <Line type="monotone" dataKey="score" stroke="var(--color-accent)" strokeWidth={2} dot={{ r: 3, fill: 'var(--color-accent)' }} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <ul className="sr-only" aria-label="Risk score trend">
        {data.map((d, i) => <li key={i}>{d.date}: {d.score}</li>)}
      </ul>
    </div>
  )
}
```

```tsx
// frontend/src/components/dashboard/AnalysesTable.tsx
import { FileVideo, Image as ImageIcon, Loader2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { AnalysisSummary } from '../../api/types'
import { formatDate, formatPercent } from '../../lib/format'
import { LevelBadge } from '../ui/Badge'

export function AnalysesTable({ rows }: { rows: AnalysisSummary[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm" aria-label="Past analyses">
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-fg-muted">
            <th scope="col" className="py-2 pr-4 font-medium">Site</th>
            <th scope="col" className="py-2 pr-4 font-medium">Date</th>
            <th scope="col" className="py-2 pr-4 font-medium">Level</th>
            <th scope="col" className="py-2 pr-4 text-right font-medium">Score</th>
            <th scope="col" className="py-2 text-right font-medium">PPE</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-border last:border-0 hover:bg-muted">
              <td className="py-2 pr-4">
                <Link to={`/analyses/${row.id}`} className="flex min-h-11 items-center gap-2 font-medium text-fg-strong hover:underline">
                  {row.media_type === 'video' ? <FileVideo className="size-4 shrink-0 text-fg-muted" aria-hidden /> : <ImageIcon className="size-4 shrink-0 text-fg-muted" aria-hidden />}
                  <span>
                    {row.site_name ?? 'Untitled site'}
                    <span className="block text-xs font-normal text-fg-muted">{row.filename}</span>
                  </span>
                </Link>
              </td>
              <td className="py-2 pr-4 whitespace-nowrap text-fg">{formatDate(row.created_at)}</td>
              <td className="py-2 pr-4">
                {row.risk_level ? <LevelBadge level={row.risk_level} /> : (
                  <span className="inline-flex items-center gap-1 text-xs text-fg-muted">
                    {row.status === 'failed' ? 'Failed' : <><Loader2 className="size-3 animate-spin" aria-hidden /> Processing</>}
                  </span>
                )}
              </td>
              <td className="tabular py-2 pr-4 text-right font-mono font-semibold text-fg-strong">{row.risk_score ?? '—'}</td>
              <td className="tabular py-2 text-right font-mono text-fg">{formatPercent(row.ppe_compliance_rate)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 4: Implement `src/pages/DashboardPage.tsx`**

```tsx
import { Activity, ClipboardList, HardHat, OctagonAlert, Plus } from 'lucide-react'
import { Link } from 'react-router-dom'
import { AnalysesTable } from '../components/dashboard/AnalysesTable'
import { KpiCard } from '../components/dashboard/KpiCard'
import { TrendChart } from '../components/dashboard/TrendChart'
import { CategoryBar } from '../components/report/CategoryBar'
import { Card } from '../components/ui/Card'
import { EmptyState } from '../components/ui/EmptyState'
import { Skeleton } from '../components/ui/Skeleton'
import { useAnalyses } from '../hooks/useAnalyses'
import { useStats } from '../hooks/useStats'
import { formatPercent } from '../lib/format'

export function DashboardPage() {
  const stats = useStats()
  const analyses = useAnalyses()

  if (stats.isPending || analyses.isPending) {
    return (
      <div className="space-y-4" aria-busy>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Skeleton className="h-24" /><Skeleton className="h-24" /><Skeleton className="h-24" /><Skeleton className="h-24" />
        </div>
        <Skeleton className="h-64" />
      </div>
    )
  }

  if (stats.isError || analyses.isError) {
    return (
      <Card>
        <p role="alert" className="text-sm text-fg-strong">{(stats.error ?? analyses.error)?.message}</p>
      </Card>
    )
  }

  const s = stats.data
  const rows = analyses.data

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={ClipboardList}
        title="No analyses yet"
        body="Upload a photo or short video of a site and SiteGuard will score the risk, flag PPE gaps and suggest fixes."
        action={
          <Link to="/new" className="inline-flex min-h-11 items-center gap-2 rounded-md bg-accent px-4 text-sm font-medium text-on-accent hover:bg-accent-hover">
            <Plus className="size-4" aria-hidden /> Run your first analysis
          </Link>
        }
      />
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-fg-strong">Dashboard</h1>
        <Link to="/new" className="inline-flex min-h-11 items-center gap-2 rounded-md bg-accent px-4 text-sm font-medium text-on-accent hover:bg-accent-hover">
          <Plus className="size-4" aria-hidden /> New analysis
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Analyses" value={String(s.total)} icon={ClipboardList} hint={`${s.completed} completed`} />
        <KpiCard label="Average risk" value={s.average_score === null ? '—' : String(Math.round(s.average_score))} icon={Activity} hint="0–100 across completed" />
        <KpiCard label="Critical sites" value={String(s.critical_count)} icon={OctagonAlert} tone={s.critical_count > 0 ? 'critical' : 'default'} hint="score ≥ 75" />
        <KpiCard label="PPE compliance" value={formatPercent(s.average_ppe_compliance)} icon={HardHat} hint="average across analyses" />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Risk score trend"><TrendChart trend={s.trend} /></Card>
        <Card title="Findings by category"><CategoryBar counts={s.findings_by_category} /></Card>
      </div>

      <Card title="Past analyses"><AnalysesTable rows={rows} /></Card>
    </div>
  )
}
```

- [ ] **Step 5: Route it in `src/App.tsx`** (final version, no placeholders left)

```tsx
import { Route, Routes } from 'react-router-dom'
import { AppShell } from './components/layout/AppShell'
import { DashboardPage } from './pages/DashboardPage'
import { ReportPage } from './pages/ReportPage'
import { UploadPage } from './pages/UploadPage'

export default function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/new" element={<UploadPage />} />
        <Route path="/analyses/:id" element={<ReportPage />} />
      </Routes>
    </AppShell>
  )
}
```

- [ ] **Step 6: Run the whole suite and type-check**

Run: `npx vitest run && npx tsc -p tsconfig.app.json --noEmit && npm run build`
Expected: all tests pass, no type errors, `✓ built`

- [ ] **Step 7: Commit**

```bash
git add frontend/src
git commit -m "feat(frontend): add Dashboard page with KPIs, trend and analyses table

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: End-to-end check against the real backend, README, cleanup

**Files:**
- Create: `frontend/README.md`
- Modify: `README.md` (root), delete `frontend/src/test/smoke.test.ts`

- [ ] **Step 1: Run both servers and exercise the flow in a browser**

Terminal 1:
```bash
cd "/Users/apple/Desktop/building site risk assesment/backend" && source .venv/bin/activate && uvicorn app.main:create_app --factory --port 8000
```
Terminal 2:
```bash
cd "/Users/apple/Desktop/building site risk assesment/frontend" && npm run dev
```
Open http://localhost:5173 and verify:
1. Dashboard shows the empty state (or history from the smoke script) → "Run your first analysis".
2. Upload `samples/Video_1.mov` with site name "Test site" → report page shows the processing banner, then the full report within ~60 s.
3. Gauge value equals `risk_score`; Workers & PPE chips render; filter "Workers" narrows the list; timestamps show `m:ss`.
4. "Download PDF" opens the print dialog with nav hidden and charts visible.
5. Toggle dark mode — check text contrast on cards and chips.
6. Resize to 375 px wide — no horizontal scroll, buttons ≥ 44 px tall.
7. Delete the analysis → back on dashboard, row gone.

Fix anything broken; add a test for any bug found before fixing it.

- [ ] **Step 2: Remove the scaffold smoke test**

```bash
rm frontend/src/test/smoke.test.ts
```

- [ ] **Step 3: Write `frontend/README.md`**

```markdown
# SiteGuard frontend

React + Vite + TypeScript + Tailwind v4. Talks to the backend at `/api` (proxied to `http://localhost:8000` in dev).

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # vitest (jsdom + msw)
npx tsc -p tsconfig.app.json --noEmit
npm run build
```

Routes: `/` dashboard · `/new` upload · `/analyses/:id` report (auto-polls while processing; "Download PDF" uses the browser print dialog with a print stylesheet).

Design tokens live in `src/index.css` (`@theme` block + `.dark` overrides). Risk levels are always rendered as text + icon, never color alone.
```

Add `"test": "vitest run"` to `frontend/package.json` scripts.

- [ ] **Step 4: Update the root README "Frontend" section**

Replace `See \`frontend/README.md\` (added with the frontend plan).` with:

```markdown
```bash
cd frontend && npm install && npm run dev     # http://localhost:5173 (backend must be on :8000)
npm test
```
```

- [ ] **Step 5: Final verification and commit**

```bash
cd frontend && npx vitest run && npx tsc -p tsconfig.app.json --noEmit && npm run build
cd .. && git add -A frontend README.md
git commit -m "docs(frontend): add README, remove scaffold smoke test

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Spec coverage check

| Spec §8 requirement | Task |
|---|---|
| Stack (Vite, Router, TanStack Query, Tailwind, Recharts, Lucide) | 1, 2, 4 |
| `/` dashboard: KPI row incl. PPE, trend line, category bar, table, empty state | 10 |
| `/new` upload: drag-drop, visible label, site name, preview, inline errors, single CTA, health banner | 6 |
| `/analyses/:id` processing skeleton + message, failed + Retry | 9 |
| Gauge with numeric + level text/icon | 7 |
| Current vs after mitigation + reduction callout | 7 |
| Workers & PPE panel with "Helmet 1/2" chips + unsafe behaviours | 7 |
| 5×5 severity × likelihood matrix | 8 |
| Findings by category chart (+ text alternative) | 8 |
| Findings list sorted by risk, subject filter, card fields, "−X% after fix" | 8 |
| Positive observations | 8 |
| Download PDF via print stylesheet | 1 (CSS), 9 (button) |
| Tokens: slate + safety orange, level colors + label + icon, Inter / JetBrains Mono, dark mode, reduced motion, 44 px targets, focus rings | 1, 5, and every component |
| Tests: risk util, polling hook, Dropzone, ReportPage fixture, subject filter, Dashboard empty state | 3, 4, 6, 8, 9, 10 |
