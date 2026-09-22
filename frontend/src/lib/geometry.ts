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
