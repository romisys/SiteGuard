# Visual Annotations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show *where* each hazard is, not just describe it. Every finding gets an annotated still — the exact frame with a coloured box around the hazard — and the report's video player draws the same boxes over the footage as it plays, with a timeline strip marking every hazard.

**Architecture:** Gemini returns a normalised bounding box per finding (`box_2d`, `[y_min, x_min, y_max, x_max]` scaled 0–1000, the documented Gemini format). The backend stores it verbatim. All rendering happens **in the browser**: one off-screen `<video>` seeks through the finding timestamps and paints each frame to a `<canvas>`; the player overlays absolutely-positioned boxes on the live `<video>`. No ffmpeg, no server-side image processing, no new backend dependencies — which is what makes this work on Vercel's serverless functions.

**Tech Stack:** unchanged. Pydantic + FastAPI on the backend; React + TypeScript + Tailwind on the frontend; the Canvas and HTMLMediaElement APIs for capture and overlay.

**Spec:** extends `docs/superpowers/specs/2026-09-21-siteguard-design.md` §4 (Gemini contract) and §8 (Report page).

---

## Two gotchas this plan exists to get right

**1. `object-contain` letterboxing.** `ReportHeader` renders the video with `object-contain`, so the painted video rarely fills its box — there are bars at the sides or top. Box coordinates are relative to the *video frame*, not the element. Overlaying with naive percentages puts every box in the wrong place on any clip whose aspect ratio differs from its container. Every overlay must be positioned against the computed content rect (from `videoWidth`/`videoHeight` vs the element's client size), not the element.

**2. One shared video element, sequential seeks.** A report with eight findings must not create eight `<video>` elements all downloading the same file. One off-screen element seeks to each timestamp in turn and paints to a canvas. Seeking is also asynchronous and, on some builds, lands on the nearest decodable frame — so each capture waits for the `seeked` event (plus `requestVideoFrameCallback` when available) and the UI never blocks on it.

---

## File structure

```
backend/
  app/domain/models.py            # + box_2d, timestamp_end_seconds on Finding
  app/prompts/inspector.md        # ask for the box and the visible-until time
  tests/unit/test_models.py       # box validation
  tests/factories.py              # boxes in the fixtures

frontend/src/
  lib/geometry.ts                 # NEW: box → percentages, letterbox content rect
  hooks/useFrameCaptures.ts       # NEW: one video, sequential seeks, blob URLs
  components/report/
    AnnotatedFrame.tsx            # NEW: one finding's still + box
    AnnotatedPlayer.tsx           # NEW: video + live overlay + hazard timeline
    FindingCard.tsx               # + the still
    ReportHeader.tsx              # uses AnnotatedPlayer for video analyses
  test/fixtures.ts                # boxes on the fixture findings
```

---

### Task 1: Backend — the bounding box in the contract

**Files:**
- Modify: `backend/app/domain/models.py`, `backend/app/prompts/inspector.md`, `backend/tests/factories.py`
- Test: `backend/tests/unit/test_models.py`

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/unit/test_models.py`:

```python
def test_box_2d_accepts_a_normalised_box():
    f = make_finding(box_2d=[100, 200, 400, 600])
    assert f.box_2d == [100, 200, 400, 600]


def test_box_2d_is_optional():
    assert make_finding(box_2d=None).box_2d is None


@pytest.mark.parametrize(
    "box",
    [
        [1, 2, 3],                 # too few
        [1, 2, 3, 4, 5],           # too many
        [-1, 0, 100, 100],         # below range
        [0, 0, 1001, 100],         # above range
        [400, 0, 100, 100],        # y_min >= y_max
        [0, 600, 100, 200],        # x_min >= x_max
    ],
)
def test_malformed_box_is_dropped_not_fatal(box):
    """A bad box must cost the thumbnail, never the whole report."""
    assert make_finding(box_2d=box).box_2d is None


def test_timestamp_end_defaults_to_none():
    assert make_finding().timestamp_end_seconds is None
```

- [ ] **Step 2: Run, confirm red**

`cd backend && source .venv/bin/activate && pytest tests/unit/test_models.py -q`
Expected: failures on the unknown `box_2d` keyword.

- [ ] **Step 3: Add the fields to `Finding`**

In `backend/app/domain/models.py`, add to `Finding` (after `timestamp_seconds`):

```python
    timestamp_end_seconds: float | None = Field(
        default=None, description="Video only: when the hazard stops being visible"
    )
    box_2d: list[int] | None = Field(
        default=None,
        description=(
            "Bounding box around the hazard at timestamp_seconds, as "
            "[y_min, x_min, y_max, x_max] normalised to 0-1000"
        ),
    )
```

and a validator that discards a malformed box instead of failing the analysis:

```python
    @field_validator("box_2d", mode="after")
    @classmethod
    def _drop_malformed_box(cls, value: list[int] | None) -> list[int] | None:
        """A box we cannot draw is worth losing; the finding itself is not."""
        if value is None:
            return None
        if len(value) != 4 or not all(0 <= v <= 1000 for v in value):
            return None
        y_min, x_min, y_max, x_max = value
        if y_min >= y_max or x_min >= x_max:
            return None
        return value
```

Import `field_validator` from pydantic.

- [ ] **Step 4: Run, confirm green**

Expected: the new tests pass and the existing model tests still do.

- [ ] **Step 5: Ask Gemini for the box**

In `backend/app/prompts/inspector.md`, extend the per-finding instructions (after the `evidence` bullet):

```markdown
- box_2d: a bounding box around the hazard itself as [y_min, x_min, y_max, x_max],
  normalised to 0-1000 with the origin at the top-left, describing the frame at
  timestamp_seconds (or the image, for a photo). Box the hazard, not the whole
  scene: the unguarded edge, the worker without the helmet, the cable in the
  water. Omit box_2d only when you genuinely cannot localise it.
- timestamp_end_seconds: for video, the second at which the hazard stops being
  visible; null for an image or when it is visible throughout.
```

- [ ] **Step 6: Put boxes in the test factory**

In `backend/tests/factories.py`, add `box_2d=[300, 120, 700, 480]` and `timestamp_end_seconds=9.0` to `make_finding`'s defaults so downstream tests exercise the annotated path.

- [ ] **Step 7: Full suite, lint, commit**

```bash
pytest -q && ruff check app tests && ruff format --check app tests
```

```
feat(backend): ask Gemini to localise each hazard with a bounding box

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
```

---

### Task 2: Frontend — geometry helpers

**Files:**
- Create: `frontend/src/lib/geometry.ts`
- Test: `frontend/src/lib/geometry.test.ts`
- Modify: `frontend/src/api/types.ts` (add the two fields to `Finding`)

This is the module both the still and the player depend on, and where gotcha #1 is solved once.

- [ ] **Step 1: Write the failing tests**

```ts
// frontend/src/lib/geometry.test.ts
import { describe, expect, it } from 'vitest'
import { boxToPercent, contentRect } from './geometry'

describe('boxToPercent', () => {
  it('converts a 0-1000 box to CSS percentages', () => {
    expect(boxToPercent([100, 200, 400, 600])).toEqual({
      top: 10, left: 20, width: 40, height: 30,
    })
  })

  it('clamps a box that runs past the edge', () => {
    expect(boxToPercent([0, 0, 1000, 1000])).toEqual({
      top: 0, left: 0, width: 100, height: 100,
    })
  })
})

describe('contentRect', () => {
  it('is the whole element when the aspect ratios match', () => {
    expect(contentRect(1600, 900, 800, 450)).toEqual({ x: 0, y: 0, width: 800, height: 450 })
  })

  it('letterboxes a wide video in a tall box', () => {
    // 16:9 video inside a 400x400 element -> 400x225 centred vertically
    expect(contentRect(1600, 900, 400, 400)).toEqual({ x: 0, y: 87.5, width: 400, height: 225 })
  })

  it('pillarboxes a tall video in a wide box', () => {
    // 9:16 video inside a 400x400 element -> 225x400 centred horizontally
    expect(contentRect(900, 1600, 400, 400)).toEqual({ x: 87.5, y: 0, width: 225, height: 400 })
  })

  it('returns a zero rect before metadata has loaded', () => {
    expect(contentRect(0, 0, 400, 400)).toEqual({ x: 0, y: 0, width: 0, height: 0 })
  })
})
```

- [ ] **Step 2: Run, confirm red**

`cd frontend && npx vitest run src/lib/geometry.test.ts`

- [ ] **Step 3: Implement**

```ts
// frontend/src/lib/geometry.ts
import type { Finding } from '../api/types'

export interface BoxPercent {
  top: number
  left: number
  width: number
  height: number
}

/** Gemini returns [y_min, x_min, y_max, x_max] normalised to 0-1000. */
export function boxToPercent(box: number[]): BoxPercent {
  const [yMin, xMin, yMax, xMax] = box
  const top = yMin / 10
  const left = xMin / 10
  return {
    top,
    left,
    width: Math.min(100 - left, (xMax - xMin) / 10),
    height: Math.min(100 - top, (yMax - yMin) / 10),
  }
}

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Where `object-contain` actually paints the media inside its element.
 *
 * Box coordinates are relative to the video frame, but the element is usually a
 * different shape, so the frame is letterboxed inside it. Positioning overlays
 * against the element instead of this rect misplaces every box.
 */
export function contentRect(
  naturalWidth: number,
  naturalHeight: number,
  elementWidth: number,
  elementHeight: number,
): Rect {
  if (!naturalWidth || !naturalHeight || !elementWidth || !elementHeight) {
    return { x: 0, y: 0, width: 0, height: 0 }
  }
  const scale = Math.min(elementWidth / naturalWidth, elementHeight / naturalHeight)
  const width = naturalWidth * scale
  const height = naturalHeight * scale
  return { x: (elementWidth - width) / 2, y: (elementHeight - height) / 2, width, height }
}

/** Whether a finding's hazard is on screen at `time` (seconds). */
export function isVisibleAt(finding: Finding, time: number, window = 1.5): boolean {
  if (finding.timestamp_seconds === null) return false
  const start = finding.timestamp_seconds
  const end = finding.timestamp_end_seconds ?? start + window
  return time >= start - window / 2 && time <= end
}
```

Add to `frontend/src/api/types.ts` inside `Finding`:

```ts
  timestamp_end_seconds: number | null
  box_2d: number[] | null
```

- [ ] **Step 4: Run, confirm green; `npx tsc -p tsconfig.app.json --noEmit`**

- [ ] **Step 5: Commit**

```
feat(frontend): add box and letterbox geometry helpers

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
```

---

### Task 3: Frontend — frame capture hook

**Files:**
- Create: `frontend/src/hooks/useFrameCaptures.ts`
- Test: `frontend/src/hooks/useFrameCaptures.test.tsx`

One off-screen `<video>`, seeks queued in order, each frame painted to a canvas and handed back as an object URL keyed by finding index. This is gotcha #2.

- [ ] **Step 1: Write the failing test**

jsdom implements neither video decoding nor canvas, so the test drives a fake media element and asserts the *sequence* — the contract that matters.

```tsx
// frontend/src/hooks/useFrameCaptures.test.tsx
import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useFrameCaptures } from './useFrameCaptures'

function fakeVideo() {
  const listeners: Record<string, Array<() => void>> = {}
  return {
    el: {
      videoWidth: 1600,
      videoHeight: 900,
      preload: '',
      muted: false,
      crossOrigin: '',
      src: '',
      currentTime: 0,
      addEventListener: (name: string, fn: () => void) => {
        ;(listeners[name] ??= []).push(fn)
      },
      removeEventListener: (name: string, fn: () => void) => {
        listeners[name] = (listeners[name] ?? []).filter((l) => l !== fn)
      },
      load: vi.fn(),
      remove: vi.fn(),
    },
    fire: (name: string) => (listeners[name] ?? []).forEach((fn) => fn()),
  }
}

describe('useFrameCaptures', () => {
  it('seeks to each timestamp in order and returns one image per capture', async () => {
    const video = fakeVideo()
    const seeks: number[] = []
    Object.defineProperty(video.el, 'currentTime', {
      get: () => 0,
      set: (t: number) => {
        seeks.push(t)
        queueMicrotask(() => video.fire('seeked'))
      },
    })

    const { result } = renderHook(() =>
      useFrameCaptures({
        src: '/api/analyses/a1/media',
        timestamps: [4, 7],
        enabled: true,
        createVideo: () => video.el as unknown as HTMLVideoElement,
        capture: () => 'blob:frame',
      }),
    )

    video.fire('loadedmetadata')
    await waitFor(() => expect(Object.keys(result.current.frames)).toHaveLength(2))
    expect(seeks).toEqual([4, 7])
    expect(result.current.frames[0]).toBe('blob:frame')
    expect(result.current.frames[1]).toBe('blob:frame')
  })

  it('reports failure without throwing when the media cannot load', async () => {
    const video = fakeVideo()
    const { result } = renderHook(() =>
      useFrameCaptures({
        src: '/bad',
        timestamps: [1],
        enabled: true,
        createVideo: () => video.el as unknown as HTMLVideoElement,
        capture: () => 'blob:frame',
      }),
    )

    video.fire('error')
    await waitFor(() => expect(result.current.failed).toBe(true))
    expect(result.current.frames).toEqual({})
  })

  it('does nothing when disabled', () => {
    const createVideo = vi.fn()
    renderHook(() =>
      useFrameCaptures({ src: '/x', timestamps: [1], enabled: false, createVideo, capture: () => '' }),
    )
    expect(createVideo).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run, confirm red**

- [ ] **Step 3: Implement**

```ts
// frontend/src/hooks/useFrameCaptures.ts
import { useEffect, useRef, useState } from 'react'

export interface FrameCaptureOptions {
  src: string
  /** Seconds to capture, one per finding, in finding order. */
  timestamps: number[]
  enabled: boolean
  /** Seams for tests: jsdom decodes no video and paints no canvas. */
  createVideo?: () => HTMLVideoElement
  capture?: (video: HTMLVideoElement) => string | null
}

function defaultCreateVideo(): HTMLVideoElement {
  const video = document.createElement('video')
  video.preload = 'auto'
  video.muted = true
  video.crossOrigin = 'anonymous'
  video.playsInline = true
  return video
}

function defaultCapture(video: HTMLVideoElement): string | null {
  const canvas = document.createElement('canvas')
  canvas.width = video.videoWidth
  canvas.height = video.videoHeight
  const context = canvas.getContext('2d')
  if (!context || !canvas.width || !canvas.height) return null
  context.drawImage(video, 0, 0, canvas.width, canvas.height)
  try {
    return canvas.toDataURL('image/jpeg', 0.82)
  } catch {
    return null // tainted canvas: media served cross-origin
  }
}

/**
 * Captures one still per timestamp from a single off-screen video.
 *
 * Seeks run sequentially: a video element serves one seek at a time, and eight
 * findings must not mean eight downloads of the same clip.
 */
export function useFrameCaptures({
  src,
  timestamps,
  enabled,
  createVideo = defaultCreateVideo,
  capture = defaultCapture,
}: FrameCaptureOptions) {
  const [frames, setFrames] = useState<Record<number, string>>({})
  const [failed, setFailed] = useState(false)
  const key = timestamps.join(',')
  const cancelled = useRef(false)

  useEffect(() => {
    if (!enabled || timestamps.length === 0) return
    cancelled.current = false
    setFrames({})
    setFailed(false)

    const video = createVideo()
    let index = 0

    const seekNext = () => {
      if (cancelled.current || index >= timestamps.length) return
      video.currentTime = timestamps[index]
    }

    const onSeeked = () => {
      if (cancelled.current) return
      const dataUrl = capture(video)
      const at = index
      if (dataUrl) setFrames((prev) => ({ ...prev, [at]: dataUrl }))
      index += 1
      seekNext()
    }

    const onError = () => {
      if (!cancelled.current) setFailed(true)
    }

    video.addEventListener('loadedmetadata', seekNext)
    video.addEventListener('seeked', onSeeked)
    video.addEventListener('error', onError)
    video.src = src
    video.load()

    return () => {
      cancelled.current = true
      video.removeEventListener('loadedmetadata', seekNext)
      video.removeEventListener('seeked', onSeeked)
      video.removeEventListener('error', onError)
      video.src = ''
      video.remove()
    }
    // `key` stands in for the timestamps array identity.
  }, [src, key, enabled]) // eslint-disable-line react-hooks/exhaustive-deps

  return { frames, failed }
}
```

- [ ] **Step 4: Run, confirm green; tsc clean**

- [ ] **Step 5: Commit**

```
feat(frontend): capture one still per finding from a single video element

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
```

---

### Task 4: Frontend — `AnnotatedFrame`

**Files:**
- Create: `frontend/src/components/report/AnnotatedFrame.tsx`
- Test: `frontend/src/components/report/AnnotatedFrame.test.tsx`

Renders one still (a captured data URL for video, the media URL itself for an image) with the box drawn over it as a positioned element. Nothing is painted onto the pixels, so the box stays crisp and its label stays selectable text.

- [ ] **Step 1: Write the failing tests**

```tsx
// frontend/src/components/report/AnnotatedFrame.test.tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { findingEdge } from '../../test/fixtures'
import { AnnotatedFrame } from './AnnotatedFrame'

describe('AnnotatedFrame', () => {
  it('draws the box over the still with an accessible description', () => {
    render(<AnnotatedFrame src="data:image/jpeg;base64,x" finding={findingEdge} />)
    const figure = screen.getByRole('figure', { name: /unprotected slab edge/i })
    expect(figure).toBeInTheDocument()
    const box = screen.getByTestId('hazard-box')
    expect(box).toHaveStyle({ top: '50%', left: '10%' })
  })

  it('renders the still without a box when the hazard was not localised', () => {
    render(<AnnotatedFrame src="data:image/jpeg;base64,x" finding={{ ...findingEdge, box_2d: null }} />)
    expect(screen.queryByTestId('hazard-box')).not.toBeInTheDocument()
    expect(screen.getByRole('img')).toBeInTheDocument()
  })

  it('shows a placeholder while the still is still being captured', () => {
    render(<AnnotatedFrame src={null} finding={findingEdge} />)
    expect(screen.getByText(/capturing frame/i)).toBeInTheDocument()
  })

  it('explains when the still could not be captured', () => {
    render(<AnnotatedFrame src={null} finding={findingEdge} failed />)
    expect(screen.getByText(/could not capture/i)).toBeInTheDocument()
  })
})
```

(`findingEdge` gets `box_2d: [500, 100, 900, 700]` in Task 6, which is where `top: 50%` / `left: 10%` comes from.)

- [ ] **Step 2: Run, confirm red**

- [ ] **Step 3: Implement**

```tsx
// frontend/src/components/report/AnnotatedFrame.tsx
import { ImageOff, Loader2 } from 'lucide-react'
import type { Finding } from '../../api/types'
import { boxToPercent } from '../../lib/geometry'
import { LEVELS, riskBand } from '../../lib/risk'

interface Props {
  /** The captured still, or null while it is being produced. */
  src: string | null
  finding: Finding
  failed?: boolean
}

export function AnnotatedFrame({ src, finding, failed = false }: Props) {
  const level = LEVELS[riskBand(finding.severity * finding.likelihood)]

  if (!src) {
    return (
      <div
        className="flex aspect-video w-full items-center justify-center gap-2 rounded-md border border-border bg-muted text-xs text-fg-muted"
        role="status"
      >
        {failed ? (
          <>
            <ImageOff className="size-4" aria-hidden /> Could not capture this frame
          </>
        ) : (
          <>
            <Loader2 className="size-4 animate-spin" aria-hidden /> Capturing frame…
          </>
        )}
      </div>
    )
  }

  const box = finding.box_2d ? boxToPercent(finding.box_2d) : null

  return (
    <figure
      className="relative overflow-hidden rounded-md border border-border bg-muted"
      aria-label={`Annotated frame: ${finding.title}`}
    >
      <img src={src} alt={`Frame showing ${finding.title}`} className="block w-full" />
      {box && (
        <>
          <span
            data-testid="hazard-box"
            className={`pointer-events-none absolute rounded-sm border-2 ${level.border}`}
            style={{
              top: `${box.top}%`,
              left: `${box.left}%`,
              width: `${box.width}%`,
              height: `${box.height}%`,
            }}
          />
          <figcaption
            className={`absolute max-w-[85%] truncate rounded px-1.5 py-0.5 text-[11px] font-semibold ${level.fill} text-white`}
            style={{ top: `calc(${box.top}% - 1.25rem)`, left: `${box.left}%` }}
          >
            {finding.title}
          </figcaption>
        </>
      )}
    </figure>
  )
}
```

Add a `border` class to each entry of `LEVELS` in `frontend/src/lib/risk.ts` (`border-risk-low`, `border-risk-moderate`, `border-risk-high`, `border-risk-critical`) and extend the existing "every level has label, icon and classes" test in `risk.test.ts` to assert it.

- [ ] **Step 4: Run, confirm green; tsc clean**

- [ ] **Step 5: Commit**

```
feat(frontend): add AnnotatedFrame for a single localised hazard

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
```

---

### Task 5: Frontend — `AnnotatedPlayer`

**Files:**
- Create: `frontend/src/components/report/AnnotatedPlayer.tsx`
- Test: `frontend/src/components/report/AnnotatedPlayer.test.tsx`
- Modify: `frontend/src/components/report/ReportHeader.tsx`

The video with live boxes and a hazard timeline. This is where `contentRect` earns its place.

- [ ] **Step 1: Write the failing tests**

```tsx
// frontend/src/components/report/AnnotatedPlayer.test.tsx
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { completedDetail } from '../../test/fixtures'
import { AnnotatedPlayer } from './AnnotatedPlayer'

const findings = completedDetail.result!.findings

function renderPlayer() {
  const utils = render(<AnnotatedPlayer src="/api/analyses/a1/media" findings={findings} />)
  const video = screen.getByLabelText(/site footage/i) as HTMLVideoElement
  // jsdom reports no intrinsic size; give the player something to scale against.
  Object.defineProperty(video, 'videoWidth', { value: 1600, configurable: true })
  Object.defineProperty(video, 'videoHeight', { value: 900, configurable: true })
  Object.defineProperty(video, 'clientWidth', { value: 800, configurable: true })
  Object.defineProperty(video, 'clientHeight', { value: 450, configurable: true })
  Object.defineProperty(video, 'duration', { value: 20, configurable: true })
  fireEvent.loadedMetadata(video)
  return { ...utils, video }
}

describe('AnnotatedPlayer', () => {
  it('shows a timeline marker per localised hazard', () => {
    renderPlayer()
    const markers = screen.getAllByRole('button', { name: /jump to/i })
    expect(markers).toHaveLength(findings.filter((f) => f.timestamp_seconds !== null).length)
  })

  it('shows a box only while its hazard is on screen', () => {
    const { video } = renderPlayer()
    expect(screen.queryAllByTestId('overlay-box')).toHaveLength(0)

    video.currentTime = 7 // findingEdge
    fireEvent.timeUpdate(video)
    expect(screen.getAllByTestId('overlay-box').length).toBeGreaterThan(0)

    video.currentTime = 19 // past every hazard
    fireEvent.timeUpdate(video)
    expect(screen.queryAllByTestId('overlay-box')).toHaveLength(0)
  })

  it('seeks when a timeline marker is clicked', async () => {
    const { video } = renderPlayer()
    await userEvent.click(screen.getAllByRole('button', { name: /jump to/i })[0])
    expect(video.currentTime).toBeGreaterThan(0)
  })

  it('positions overlays against the painted video, not the element', () => {
    const { video } = renderPlayer()
    Object.defineProperty(video, 'clientHeight', { value: 800, configurable: true })
    fireEvent.loadedMetadata(video)
    video.currentTime = 7
    fireEvent.timeUpdate(video)
    const layer = screen.getByTestId('overlay-layer')
    // 1600x900 inside 800x800 paints 800x450, centred: 175px of letterbox above.
    expect(layer).toHaveStyle({ height: '450px', top: '175px' })
  })

  it('falls back to a plain video when nothing was localised', () => {
    render(
      <AnnotatedPlayer
        src="/x"
        findings={findings.map((f) => ({ ...f, box_2d: null, timestamp_seconds: null }))}
      />,
    )
    expect(screen.queryByTestId('overlay-layer')).not.toBeInTheDocument()
    expect(screen.getByLabelText(/site footage/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run, confirm red**

- [ ] **Step 3: Implement**

```tsx
// frontend/src/components/report/AnnotatedPlayer.tsx
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Finding } from '../../api/types'
import { formatTimestamp } from '../../lib/format'
import { boxToPercent, contentRect, isVisibleAt, type Rect } from '../../lib/geometry'
import { LEVELS, riskBand } from '../../lib/risk'

interface Props {
  src: string
  findings: Finding[]
}

const EMPTY_RECT: Rect = { x: 0, y: 0, width: 0, height: 0 }

export function AnnotatedPlayer({ src, findings }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [time, setTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [rect, setRect] = useState<Rect>(EMPTY_RECT)

  const located = findings.filter((f) => f.timestamp_seconds !== null)
  const annotated = located.filter((f) => f.box_2d !== null)

  const measure = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    setRect(contentRect(video.videoWidth, video.videoHeight, video.clientWidth, video.clientHeight))
    if (Number.isFinite(video.duration)) setDuration(video.duration)
  }, [])

  useEffect(() => {
    if (typeof ResizeObserver === 'undefined' || !videoRef.current) return
    const observer = new ResizeObserver(measure)
    observer.observe(videoRef.current)
    return () => observer.disconnect()
  }, [measure])

  const visible = annotated.filter((f) => isVisibleAt(f, time))

  return (
    <div className="space-y-2">
      <div className="relative overflow-hidden rounded-md bg-muted">
        <video
          ref={videoRef}
          src={src}
          controls
          playsInline
          preload="metadata"
          aria-label="Site footage"
          className="block max-h-[60vh] w-full object-contain"
          onLoadedMetadata={measure}
          onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
        />
        {annotated.length > 0 && rect.width > 0 && (
          <div
            data-testid="overlay-layer"
            className="pointer-events-none absolute"
            style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }}
          >
            {visible.map((finding, i) => {
              const box = boxToPercent(finding.box_2d!)
              const level = LEVELS[riskBand(finding.severity * finding.likelihood)]
              return (
                <span
                  key={`${finding.title}-${i}`}
                  data-testid="overlay-box"
                  className={`absolute rounded-sm border-2 ${level.border}`}
                  style={{
                    top: `${box.top}%`,
                    left: `${box.left}%`,
                    width: `${box.width}%`,
                    height: `${box.height}%`,
                  }}
                >
                  <span
                    className={`absolute -top-5 left-0 max-w-[16rem] truncate rounded px-1.5 py-0.5 text-[11px] font-semibold text-white ${level.fill}`}
                  >
                    {finding.title}
                  </span>
                </span>
              )
            })}
          </div>
        )}
      </div>

      {located.length > 0 && (
        <div>
          <div className="relative h-8 rounded-md bg-muted" aria-hidden>
            {duration > 0 &&
              located.map((finding, i) => {
                const level = LEVELS[riskBand(finding.severity * finding.likelihood)]
                return (
                  <span
                    key={i}
                    className={`absolute top-1 h-6 w-1 rounded ${level.fill}`}
                    style={{ left: `${(finding.timestamp_seconds! / duration) * 100}%` }}
                  />
                )
              })}
          </div>
          <ul className="mt-2 flex flex-wrap gap-2 print:hidden">
            {located.map((finding, i) => {
              const level = LEVELS[riskBand(finding.severity * finding.likelihood)]
              const Icon = level.icon
              return (
                <li key={i}>
                  <button
                    type="button"
                    aria-label={`Jump to ${finding.title} at ${formatTimestamp(finding.timestamp_seconds!)}`}
                    onClick={() => {
                      const video = videoRef.current
                      if (!video) return
                      video.currentTime = finding.timestamp_seconds!
                      setTime(finding.timestamp_seconds!)
                    }}
                    className={`inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-md border border-border bg-surface px-2 text-xs font-medium text-fg transition-colors duration-150 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg`}
                  >
                    <Icon className={`size-3.5 ${level.text}`} aria-hidden />
                    <span className="tabular font-mono">
                      {formatTimestamp(finding.timestamp_seconds!)}
                    </span>
                    <span className="max-w-[12rem] truncate">{finding.title}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
```

In `ReportHeader.tsx`, use `AnnotatedPlayer` in place of the bare `<video>` when `analysis.media_type === 'video'`, passing `analysis.result?.findings ?? []`.

- [ ] **Step 4: Run, confirm green; tsc clean; `npm run build`**

- [ ] **Step 5: Commit**

```
feat(frontend): overlay hazard boxes on the report video with a jump timeline

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
```

---

### Task 6: Wire the stills into the findings list

**Files:**
- Modify: `frontend/src/components/report/FindingCard.tsx`, `FindingsList.tsx`, `frontend/src/test/fixtures.ts`
- Test: `frontend/src/components/report/findings.test.tsx`

`FindingsList` owns the capture (one video for the whole list) and passes each still down to its card.

- [ ] **Step 1: Put boxes in the fixtures**

In `frontend/src/test/fixtures.ts`: `findingHelmet` gets `box_2d: [200, 300, 600, 550], timestamp_end_seconds: 8`; `findingEdge` gets `box_2d: [500, 100, 900, 700], timestamp_end_seconds: 12`; `findingCable` keeps `box_2d: null` and `timestamp_seconds: null` so the "not localised" path stays covered.

- [ ] **Step 2: Write the failing tests**

Append to `frontend/src/components/report/findings.test.tsx`:

```tsx
it('shows an annotated still for a localised finding', () => {
  render(<FindingsList result={completedDetail.result!} scores={completedDetail.scores!} mediaSrc="/api/analyses/a1/media" mediaType="video" />)
  expect(screen.getAllByRole('figure', { name: /annotated frame/i }).length).toBeGreaterThan(0)
})

it('omits the still for an image analysis without a box', () => {
  const result = { ...completedDetail.result!, findings: [{ ...findingCable }] }
  render(<FindingsList result={result} scores={completedDetail.scores!} mediaSrc="/x" mediaType="image" />)
  expect(screen.queryByRole('figure')).not.toBeInTheDocument()
})
```

- [ ] **Step 3: Implement**

`FindingsList` takes `mediaSrc: string` and `mediaType: MediaType`, calls `useFrameCaptures` with the timestamps of the findings that have both a timestamp and a box (video only), and renders a two-column card on `sm+`: text on the left, `AnnotatedFrame` on the right (stacked on mobile). For an image analysis it passes `mediaSrc` straight to `AnnotatedFrame` as the still. `ReportPage` passes `api.mediaUrl(id)` and `analysis.media_type` down.

- [ ] **Step 4: Run the whole suite, tsc, build**

- [ ] **Step 5: Commit**

```
feat(frontend): show an annotated still beside each finding

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
```

---

### Task 7: Verify on real footage, then ship

- [ ] **Step 1: Re-analyse a clip locally and confirm Gemini returns boxes**

```bash
cd backend && source .venv/bin/activate
set -a && source .env && set +a
pytest -m integration -q -s
```

Then check a real result contains `box_2d`:

```bash
python - <<'EOF'
import json, os
from pathlib import Path
from app.domain.models import MediaType
from app.services.gemini_client import GoogleGeminiAnalyzer

clip = sorted(Path("../samples").glob("*.mov"))[0]
analyzer = GoogleGeminiAnalyzer(api_key=os.environ["GEMINI_API_KEY"], model="gemini-2.5-flash")
outcome = analyzer.analyze(clip, "video/quicktime", MediaType.video)
for f in outcome.result.findings:
    print(f"{f.timestamp_seconds}s  box={f.box_2d}  {f.title}")
EOF
```

Expected: most findings carry a plausible `box_2d`. If Gemini omits them, strengthen the prompt wording before continuing — do not ship a feature whose data is usually missing.

- [ ] **Step 2: Run the app and look at it**

Start both servers, upload a sample clip, and check: the still under each finding shows the right moment, the box sits on the hazard, the overlay appears and disappears as the video plays, the timeline buttons seek, and nothing overflows at 375 px. Screenshot the report.

- [ ] **Step 3: Check the print output**

`window.print()` — the stills must appear in the PDF (they are `<img>` with data URLs, so they should). The timeline buttons are `print:hidden`.

- [ ] **Step 4: Deploy and verify**

Push, wait for Vercel, upload a clip on the deployed site, confirm the annotations render there too.

- [ ] **Step 5: Update the docs**

Add a short "Visual annotations" section to `README.md` describing what the boxes are and the accuracy caveat.

---

## Spec coverage

| Requirement | Task |
|---|---|
| Gemini localises each hazard | 1 |
| Malformed box never breaks a report | 1 |
| Annotated still beside each finding | 3, 4, 6 |
| Boxes drawn over the playing video | 5 |
| Timeline of hazards, click to jump | 5 |
| Correct placement under `object-contain` | 2, 5 |
| One video element for a whole report | 3 |
| Works for images as well as video | 4, 6 |
| Degrades cleanly when no box is returned | 1, 4, 5, 6 |
