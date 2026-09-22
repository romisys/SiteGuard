import { useEffect, useRef, useState } from 'react'

export interface FrameCaptureOptions {
  src: string
  /** Seconds to capture, one per finding, in finding order. */
  timestamps: number[]
  enabled: boolean
  /** Seams for tests: jsdom decodes no video and paints no canvas. */
  createVideo?: () => HTMLVideoElement
  capture?: (video: HTMLVideoElement) => string | null
  /** How long to wait for a painted frame before capturing anyway (ms). */
  paintTimeout?: number
}

/**
 * How long a seek gets to be presented before the still is taken regardless.
 *
 * Long enough that a decoded frame normally wins the race, short enough that a
 * report with eight findings is not noticeably slower to fill in.
 */
const PAINT_TIMEOUT_MS = 150

export interface FrameCaptures {
  /** Captured stills as data URLs, keyed by the index of the timestamp. */
  frames: Record<number, string>
  failed: boolean
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

/** State carries the run it belongs to, so a new run reads as empty without an extra render. */
interface CaptureState extends FrameCaptures {
  src: string
  key: string
}

const NO_FRAMES: Record<number, string> = {}

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
  paintTimeout = PAINT_TIMEOUT_MS,
}: FrameCaptureOptions): FrameCaptures {
  // The timestamps themselves are the identity of a run; a fresh array of the
  // same seconds is the same work. The effect reads them back out of `key`, so
  // its dependency list is exactly what it uses.
  const key = timestamps.join(',')
  const [state, setState] = useState<CaptureState>({ src, key, frames: {}, failed: false })

  // Callers pass these inline, so they change identity on every render. Held in
  // refs, they cannot restart a capture run that is already the right one.
  const seams = useRef({ createVideo, capture, paintTimeout })
  useEffect(() => {
    seams.current = { createVideo, capture, paintTimeout }
  })

  useEffect(() => {
    const times = key === '' ? [] : key.split(',').map(Number)
    if (!enabled || times.length === 0) return

    const video = seams.current.createVideo()
    let cancelled = false
    let index = 0
    let paintHandle: number | null = null
    let paintTimer: ReturnType<typeof setTimeout> | null = null

    const clearPaint = () => {
      if (paintHandle !== null && typeof video.cancelVideoFrameCallback === 'function') {
        video.cancelVideoFrameCallback(paintHandle)
      }
      paintHandle = null
      if (paintTimer !== null) clearTimeout(paintTimer)
      paintTimer = null
    }

    const seekNext = () => {
      if (cancelled || index >= times.length) return
      video.currentTime = times[index]
    }

    const store = (at: number, dataUrl: string) =>
      setState((prev) =>
        prev.src === src && prev.key === key
          ? { ...prev, frames: { ...prev.frames, [at]: dataUrl } }
          : { src, key, frames: { [at]: dataUrl }, failed: false },
      )

    const grab = () => {
      if (cancelled) return
      const dataUrl = seams.current.capture(video)
      if (dataUrl) store(index, dataUrl)
      index += 1
      seekNext()
    }

    // `seeked` means the seek landed, not that the new frame has been painted —
    // capturing there can hand back the previous frame. requestVideoFrameCallback
    // fires when a frame is actually presented, so prefer it where it exists.
    //
    // But a *paused* video presents no frames at all, so on every browser that
    // implements the callback it simply never runs, and every still stays on
    // "Capturing frame…" for good. Race it against a short timer and take
    // whichever comes first.
    const onSeeked = () => {
      if (cancelled) return
      if (typeof video.requestVideoFrameCallback !== 'function') {
        grab()
        return
      }
      const paint = () => {
        if (cancelled) return
        clearPaint()
        grab()
      }
      paintHandle = video.requestVideoFrameCallback(() => {
        paintHandle = null
        paint()
      })
      paintTimer = setTimeout(paint, seams.current.paintTimeout)
    }

    const onError = () => {
      if (!cancelled) {
        setState((prev) =>
          prev.src === src && prev.key === key
            ? { ...prev, failed: true }
            : { src, key, frames: {}, failed: true },
        )
      }
    }

    video.addEventListener('loadedmetadata', seekNext)
    video.addEventListener('seeked', onSeeked)
    video.addEventListener('error', onError)
    video.src = src
    video.load()

    return () => {
      cancelled = true
      clearPaint()
      video.removeEventListener('loadedmetadata', seekNext)
      video.removeEventListener('seeked', onSeeked)
      video.removeEventListener('error', onError)
      video.src = ''
      video.remove()
    }
  }, [src, key, enabled])

  // Results from a previous src or timestamp list are not this run's results.
  const current = state.src === src && state.key === key
  return { frames: current ? state.frames : NO_FRAMES, failed: current ? state.failed : false }
}
