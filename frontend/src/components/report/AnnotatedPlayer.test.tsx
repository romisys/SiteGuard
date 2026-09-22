import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { Finding } from '../../api/types'
import { completedDetail, findingEdge } from '../../test/fixtures'
import { AnnotatedPlayer } from './AnnotatedPlayer'

const findings = completedDetail.result!.findings

function renderPlayer(given: Finding[] = findings) {
  const utils = render(<AnnotatedPlayer src="/api/analyses/a1/media" findings={given} />)
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

function seek(video: HTMLVideoElement, to: number) {
  video.currentTime = to
  fireEvent.timeUpdate(video)
}

describe('AnnotatedPlayer', () => {
  it('shows a timeline marker per localised hazard', () => {
    renderPlayer()
    const markers = screen.getAllByRole('button', { name: /jump to/i })
    expect(markers).toHaveLength(findings.filter((f) => f.timestamp_seconds !== null).length)
  })

  it('names every marker with its hazard and timestamp', () => {
    renderPlayer()
    // Markers run in time order, so the tab order is the order of the footage.
    expect(screen.getAllByRole('button', { name: /jump to/i }).map((b) => b.getAttribute('aria-label')))
      .toEqual(['Jump to Worker without helmet at 0:04', 'Jump to Unprotected slab edge at 0:07'])
  })

  it('shows a box only while its hazard is on screen', () => {
    const { video } = renderPlayer()
    expect(screen.queryAllByTestId('overlay-box')).toHaveLength(0)

    seek(video, 7) // findingEdge
    expect(screen.getAllByTestId('overlay-box').length).toBeGreaterThan(0)

    seek(video, 19) // past every hazard
    expect(screen.queryAllByTestId('overlay-box')).toHaveLength(0)
  })

  it('follows a scrub made while paused', () => {
    const { video } = renderPlayer()
    video.currentTime = 7
    fireEvent.seeked(video)
    expect(screen.getAllByTestId('overlay-box').length).toBeGreaterThan(0)
  })

  it('marks the hazards that are on screen in the timeline', () => {
    const { video } = renderPlayer()
    expect(screen.getByRole('button', { name: /unprotected slab edge/i })).not.toHaveAttribute('aria-current')
    seek(video, 7)
    expect(screen.getByRole('button', { name: /unprotected slab edge/i })).toHaveAttribute('aria-current', 'true')
  })

  it('seeks when a timeline marker is clicked', async () => {
    const { video } = renderPlayer()
    await userEvent.click(screen.getAllByRole('button', { name: /jump to/i })[0])
    expect(video.currentTime).toBeGreaterThan(0)
  })

  it('names the hazard a marker points at while it is hovered', async () => {
    renderPlayer()
    expect(screen.getByTestId('timeline-readout')).toHaveTextContent(/2 hazards marked/i)
    await userEvent.hover(screen.getByRole('button', { name: /unprotected slab edge/i }))
    expect(screen.getByTestId('timeline-readout')).toHaveTextContent(/unprotected slab edge/i)
  })

  it('positions overlays against the painted video, not the element', () => {
    const { video } = renderPlayer()
    Object.defineProperty(video, 'clientHeight', { value: 800, configurable: true })
    fireEvent.loadedMetadata(video)
    seek(video, 7)
    const layer = screen.getByTestId('overlay-layer')
    // 1600x900 inside 800x800 paints 800x450, centred: 175px of letterbox above.
    expect(layer).toHaveStyle({ height: '450px', top: '175px' })
  })

  it('keeps a label for a box near the right edge inside the painted frame', () => {
    const rightEdge: Finding = { ...findingEdge, box_2d: [400, 700, 500, 950] }
    const { video } = renderPlayer([rightEdge])
    seek(video, 7)
    const caption = screen.getByTestId('overlay-caption')
    expect(caption).toHaveStyle({ right: '5%', maxWidth: '95%' })
    expect(caption.style.left).toBe('')
  })

  it('keeps two captions in the same spot from printing over each other', () => {
    const twin: Finding = { ...findingEdge, title: 'Second hazard here' }
    const { video } = renderPlayer([findingEdge, twin])
    seek(video, 7)
    const tops = screen.getAllByTestId('overlay-caption').map((c) => c.style.top)
    expect(tops).toHaveLength(2)
    expect(new Set(tops).size).toBe(2)
  })

  it('falls back to a plain video when nothing was localised', () => {
    render(
      <AnnotatedPlayer
        src="/x"
        findings={findings.map((f) => ({ ...f, box_2d: null, timestamp_seconds: null }))}
      />,
    )
    expect(screen.queryByTestId('overlay-layer')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /jump to/i })).not.toBeInTheDocument()
    expect(screen.getByLabelText(/site footage/i)).toBeInTheDocument()
  })
})
