import { AlertTriangle, Check, Minus, Users } from 'lucide-react'
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
            const state = total === 0 ? 'unassessed' : check.non_compliant === 0 ? 'ok' : 'missing'
            const styles = {
              unassessed: 'border-border bg-muted text-fg',
              ok: 'border-risk-low/40 bg-risk-low/10 text-fg-strong',
              missing: 'border-risk-critical/40 bg-risk-critical/10 text-fg-strong',
            }[state]
            return (
              <li key={check.item} className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium ${styles}`}>
                {state === 'unassessed' && <Minus className="size-3.5 text-fg-muted" aria-hidden />}
                {state === 'ok' && <Check className="size-3.5 text-risk-low" aria-hidden />}
                {state === 'missing' && <AlertTriangle className="size-3.5 text-risk-critical" aria-hidden />}
                <span>{PPE_LABELS[check.item]}</span>
                <span className="tabular font-mono">{check.compliant}/{total}</span>
                <span className="sr-only">
                  {state === 'unassessed' ? 'not assessed' : state === 'ok' ? 'all compliant' : `${check.non_compliant} missing`}
                </span>
              </li>
            )
          })}
        </ul>
      )}

      {workers.ppe.some((check) => check.notes) && (
        <ul className="space-y-0.5 text-xs text-fg-muted" aria-label="PPE notes">
          {workers.ppe.filter((check) => check.notes).map((check) => (
            <li key={check.item}>{PPE_LABELS[check.item]}: {check.notes}</li>
          ))}
        </ul>
      )}

      {workers.unsafe_behaviours.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-fg-muted">Unsafe behaviours</p>
          <ul className="list-disc space-y-1 pl-5 text-sm text-fg">
            {workers.unsafe_behaviours.map((b, i) => <li key={`${i}-${b}`}>{b}</li>)}
          </ul>
        </div>
      )}
    </div>
  )
}
