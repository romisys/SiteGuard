import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Finding } from '../../api/types'
import { formatTimestamp } from '../../lib/format'
import {
  boxToPercent,
  captionPlacement,
  captionSpan,
  contentRect,
  isVisibleAt,
  markerTrackWidth,
  spreadMarkers,
  type Rect,
} from '../../lib/geometry'
import { LEVELS, riskBand, type LevelMeta } from '../../lib/risk'

interface Props {
  src: string
  findings: Finding[]
  /** Accessible name for the video element. */
  label?: string
}

const VIDEO_CLASS = 'block max-h-[60vh] w-full bg-muted object-contain'

/**
 * The report's footage with every localised hazard boxed as it plays.
 *
 * Nothing is drawn into the pixels: the boxes are positioned elements over the
 * video, so they stay crisp and their labels stay selectable text — the same
 * language as AnnotatedFrame, which shows the same hazards as stills.
 */
export function AnnotatedPlayer({ src, findings, label = 'Site footage' }: Props) {
  const located = findings.filter((f) => f.timestamp_seconds !== null)

  // Nothing to point at (a clip Gemini could not place, or no findings at all):
  // a plain video, with none of the measuring machinery behind it.
  if (located.length === 0) {
    return (
      <video
        src={src}
        controls
        playsInline
        preload="metadata"
        aria-label={label}
        className={`${VIDEO_CLASS} rounded-md`}
      />
    )
  }

  return <TimelinePlayer src={src} label={label} located={located} />
}

interface Hazard {
  finding: Finding
  /** `timestamp_seconds`, already known to be non-null. */
  at: number
  level: LevelMeta
}

const EMPTY_RECT: Rect = { x: 0, y: 0, width: 0, height: 0 }

function TimelinePlayer({ src, label, located }: { src: string; label: string; located: Finding[] }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const [time, setTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [rect, setRect] = useState<Rect>(EMPTY_RECT)
  const [trackWidth, setTrackWidth] = useState(0)
  const [preview, setPreview] = useState<number | null>(null)

  const hazards = useMemo<Hazard[]>(
    () =>
      located
        .map((finding) => ({
          finding,
          at: finding.timestamp_seconds ?? 0,
          level: LEVELS[riskBand(finding.severity * finding.likelihood)],
        }))
        .sort((a, b) => a.at - b.at),
    [located],
  )

  /**
   * Where the video is actually painted inside its element.
   *
   * `object-contain` letterboxes the frame, and the boxes are in frame
   * coordinates, so an overlay measured against the element itself lands in the
   * wrong place on every clip whose shape differs from its box.
   */
  const measure = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    setRect(contentRect(video.videoWidth, video.videoHeight, video.clientWidth, video.clientHeight))
    if (Number.isFinite(video.duration)) setDuration(video.duration)
  }, [])

  useEffect(() => {
    const video = videoRef.current
    if (!video || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(video)
    return () => observer.disconnect()
  }, [measure])

  // The timeline is laid out in pixels, not percentages: a minimum gap between
  // markers is a promise about hit targets, and a percentage cannot make it.
  const hasTrack = duration > 0
  useEffect(() => {
    const track = trackRef.current
    if (!track) return
    const read = () => setTrackWidth(track.clientWidth)
    read()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(read)
    observer.observe(track)
    return () => observer.disconnect()
  }, [hasTrack])

  // `timeupdate` fires about four times a second. The boxes do not need more:
  // each one is a single rectangle held for the whole interval its hazard is
  // visible, so a requestAnimationFrame loop would re-render sixty times a
  // second to move nothing. `seeked` covers scrubbing while paused, where
  // `timeupdate` alone can leave the overlay a frame behind.
  const onTime = (event: { currentTarget: HTMLVideoElement }) => setTime(event.currentTarget.currentTime)

  const onScreen = hazards.filter((h) => isVisibleAt(h.finding, time))
  const overlays = onScreen
    .filter((h) => h.finding.box_2d !== null)
    .map((hazard) => ({ hazard, box: boxToPercent(hazard.finding.box_2d as number[]) }))
    .sort((a, b) => a.box.top - b.box.top || a.box.left - b.box.left)
  const captionTops = stackCaptions(
    overlays.map(({ hazard, box }) => ({
      top: box.top,
      span: captionSpan(box, hazard.finding.title, rect.width),
    })),
    rect.height,
  )

  // The readout follows the pointer or the keyboard when one is on a marker,
  // and otherwise says what is on screen.
  const readout = preview !== null && hazards[preview] ? [hazards[preview]] : onScreen

  // Where each marker actually sits, and how much track that needs. With no
  // measurement yet — the first paint, or a test environment that lays nothing
  // out — the minimum width keeps the markers apart rather than piling them up.
  const markerLefts = spreadMarkers(hazards.map((h) => h.at), duration, trackWidth, MARKER_PX)
  const laidOutWidth = markerTrackWidth(hazards.length, trackWidth, MARKER_PX)

  return (
    <div className="space-y-2">
      <div className="relative overflow-hidden rounded-md bg-muted">
        <video
          ref={videoRef}
          src={src}
          controls
          playsInline
          preload="metadata"
          aria-label={label}
          className={VIDEO_CLASS}
          onLoadedMetadata={measure}
          onTimeUpdate={onTime}
          onSeeked={onTime}
        />
        {overlays.length > 0 && rect.width > 0 && (
          // Every title here is already in the timeline and the findings list, so
          // announcing boxes as they come and go would only talk over the video.
          // Hidden in print too: a printed page shows one frame, and it is rarely
          // the frame these boxes belong to.
          <div
            data-testid="overlay-layer"
            aria-hidden
            className="pointer-events-none absolute print:hidden"
            style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }}
          >
            {overlays.map(({ hazard, box }, i) => (
              <Fragment key={`${hazard.at}-${hazard.finding.title}`}>
                <span
                  data-testid="overlay-box"
                  className={`absolute rounded-sm border-2 ${hazard.level.border}`}
                  style={{
                    top: `${box.top}%`,
                    left: `${box.left}%`,
                    width: `${box.width}%`,
                    height: `${box.height}%`,
                  }}
                />
                <span
                  data-testid="overlay-caption"
                  className={`absolute truncate rounded border border-border bg-surface px-1.5 py-0.5 text-[11px] font-semibold ${hazard.level.text}`}
                  style={{ top: `${captionTops[i]}%`, ...captionPlacement(box) }}
                >
                  {hazard.finding.title}
                </span>
              </Fragment>
            ))}
          </div>
        )}
      </div>

      {duration > 0 && (
        <div className="print:hidden">
          <div
            ref={trackRef}
            role="group"
            aria-label={`Hazard timeline: ${hazards.length} ${hazards.length === 1 ? 'hazard' : 'hazards'}`}
            className="relative h-14 overflow-x-auto overflow-y-hidden rounded-md border border-border bg-muted"
          >
            <div className="relative h-full" style={{ width: laidOutWidth, minWidth: '100%' }}>
              {/* Where each hazard really falls in the clip. A marker nudged off
                  its own second keeps this tick behind it, so the track still
                  reads as time even where it had to make room. */}
              <span aria-hidden className="pointer-events-none absolute inset-x-0 bottom-2 block h-px bg-border" />
              {hazards.map((hazard) => (
                <span
                  key={`tick-${hazard.at}-${hazard.finding.title}`}
                  aria-hidden
                  className="pointer-events-none absolute bottom-1.5 block h-2 w-px bg-fg-muted"
                  style={{ left: trueLeft(hazard.at, duration, laidOutWidth) }}
                />
              ))}
              {hazards.map((hazard, i) => {
                const active = onScreen.includes(hazard)
                return (
                  <button
                    key={`${hazard.at}-${hazard.finding.title}`}
                    type="button"
                    aria-label={`Jump to ${hazard.finding.title} at ${formatTimestamp(hazard.at)}`}
                    aria-current={active ? 'true' : undefined}
                    onClick={() => {
                      const video = videoRef.current
                      if (!video) return
                      video.currentTime = hazard.at
                      setTime(hazard.at)
                    }}
                    onMouseEnter={() => setPreview(i)}
                    onMouseLeave={() => setPreview((p) => (p === i ? null : p))}
                    onFocus={() => setPreview(i)}
                    onBlur={() => setPreview((p) => (p === i ? null : p))}
                    className="absolute top-0 flex cursor-pointer items-start justify-center rounded pt-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-bg"
                    style={{ left: markerLefts[i], width: MARKER_PX, height: MARKER_PX }}
                  >
                    <span
                      className={`rounded-full transition-all duration-150 ${hazard.level.fill} ${
                        active ? 'h-8 w-1.5' : 'h-6 w-1'
                      }`}
                    />
                  </button>
                )
              })}
            </div>
          </div>
          <p
            data-testid="timeline-readout"
            className="mt-1 flex min-h-6 flex-wrap items-center gap-x-4 gap-y-1 text-xs text-fg-muted"
          >
            {readout.length === 0
              ? `${hazards.length} ${hazards.length === 1 ? 'hazard' : 'hazards'} marked — select a marker to jump to one.`
              : readout.map((hazard) => {
                  const Icon = hazard.level.icon
                  return (
                    <span
                      key={`${hazard.at}-${hazard.finding.title}`}
                      className="inline-flex min-w-0 items-center gap-1.5"
                    >
                      <Icon className={`size-3.5 shrink-0 ${hazard.level.text}`} aria-hidden />
                      <span className="tabular shrink-0 font-mono">{formatTimestamp(hazard.at)}</span>
                      <span className="truncate text-fg">{hazard.finding.title}</span>
                    </span>
                  )
                })}
          </p>
        </div>
      )}
    </div>
  )
}

/**
 * The hit target every marker gets, in pixels.
 *
 * It is both the size of the button and the minimum distance to the next one,
 * so two markers can never be close enough for one to swallow the other's click.
 */
const MARKER_PX = 44

/**
 * Where a hazard's tick falls: the centre the marker would have had before any
 * spreading. Measured over the same span `spreadMarkers` uses — the track less
 * one marker — so an uncrowded marker sits exactly on its own tick.
 */
function trueLeft(at: number, duration: number, width: number): number {
  if (duration <= 0) return MARKER_PX / 2
  const span = Math.max(0, width - MARKER_PX)
  return Math.min(span, Math.max(0, (at / duration) * span)) + MARKER_PX / 2
}

/** Roughly what one caption occupies, in CSS pixels. */
const CAPTION_PX = 22

interface CaptionLabel {
  /** The top of the box being labelled, as a percentage of the frame. */
  top: number
  span: { left: number; right: number }
}

/**
 * The top of each caption, as a percentage of the painted frame.
 *
 * Hazards a second apart often sit in the same corner of the frame, and two
 * captions at the same height overprint into something unreadable. Captions are
 * placed top-down and any that would land on one already placed — within a
 * caption's height of it, and horizontally overlapping — drops a row. The
 * overlap is measured across the label's own width, not its box's: a label is
 * usually far wider than the hazard it names.
 */
function stackCaptions(labels: CaptionLabel[], frameHeight: number): number[] {
  const step = frameHeight > 0 ? (CAPTION_PX / frameHeight) * 100 : 6
  const placed: { top: number; left: number; right: number }[] = []
  return labels.map(({ top: boxTop, span }) => {
    // A box flush with the top edge has no room above it, so it wears its label inside.
    let top = boxTop > step ? boxTop - step : boxTop
    const collides = () =>
      placed.some((p) => Math.abs(p.top - top) < step * 0.99 && span.left < p.right && p.left < span.right)
    for (let guard = 0; guard <= placed.length && collides(); guard += 1) top += step
    placed.push({ top, left: span.left, right: span.right })
    return top
  })
}
