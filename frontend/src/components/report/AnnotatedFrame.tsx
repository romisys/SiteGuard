import { ImageOff, Loader2 } from 'lucide-react'
import type { Finding } from '../../api/types'
import { boxToPercent, captionPlacement } from '../../lib/geometry'
import { LEVELS, riskBand } from '../../lib/risk'

interface Props {
  /** The still to annotate, or null while it is being captured. */
  src: string | null
  finding: Finding
  /** The capture was attempted and failed; stop waiting and say so. */
  failed?: boolean
}

/**
 * The tallest a still may be. A portrait clip yields a still two and a half
 * times taller than it is wide, which used to stretch a finding's card to the
 * height of the picture and leave most of the text column empty. Capping the
 * height at the width of the card's still column keeps every still inside a
 * square envelope, whatever the camera was held like.
 */
const STILL_MAX_HEIGHT = 'max-h-52'

/**
 * One finding's still with its hazard boxed.
 *
 * The box is a positioned element over the `<img>`, never painted into the
 * pixels: it stays crisp at any size, its label stays selectable text, and the
 * print stylesheet keeps working on both.
 *
 * A still that hits the height cap is letterboxed in its slot, and that is why
 * the box and its label sit in a wrapper around the `<img>` rather than in the
 * figure. `boxToPercent` returns percentages of the *frame*, and a percentage
 * resolves against the nearest positioned ancestor: against the figure they
 * would be percentages of the slot, and every box on a portrait still would
 * drift sideways and stretch. The wrapper shrinks to the picture — the picture
 * is scaled, never cropped, so the box it points at is always still in shot.
 */
export function AnnotatedFrame({ src, finding, failed = false }: Props) {
  const level = LEVELS[riskBand(finding.severity * finding.likelihood)]
  const box = src && finding.box_2d ? boxToPercent(finding.box_2d) : null
  // A caption above a box flush with the top edge would be clipped off the
  // frame, so a high box wears its label on the inside instead.
  const captionAbove = box !== null && box.top > 10

  // The still is a data URL, so it prints; the box is a border and its label a
  // background, and a browser drops both from a PDF unless colours are kept exact.
  return (
    <figure
      className="flex items-center justify-center overflow-hidden rounded-md border border-border bg-muted print:break-inside-avoid print:[-webkit-print-color-adjust:exact] print:[print-color-adjust:exact]"
      aria-label={`Annotated frame: ${finding.title}`}
    >
      {src ? (
        <div className="relative w-fit max-w-full overflow-hidden">
          <img
            src={src}
            alt={`Frame showing ${finding.title}`}
            className={`block w-auto max-w-full ${STILL_MAX_HEIGHT}`}
          />
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
                className={`pointer-events-none absolute truncate rounded border border-border bg-surface px-1.5 py-0.5 text-[11px] font-semibold ${level.text}`}
                style={{
                  top: captionAbove ? `calc(${box.top}% - 1.25rem)` : `${box.top}%`,
                  ...captionPlacement(box),
                }}
              >
                {finding.title}
              </figcaption>
            </>
          )}
        </div>
      ) : (
        <div
          role="status"
          className="flex aspect-video w-full items-center justify-center gap-2 px-2 text-center text-xs text-fg-muted"
        >
          {failed ? (
            <>
              <ImageOff className="size-4 shrink-0" aria-hidden /> Could not capture this frame
            </>
          ) : (
            <>
              <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden /> Capturing frame…
            </>
          )}
        </div>
      )}
    </figure>
  )
}
