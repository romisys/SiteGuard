import { Clock, MapPin, Wrench } from 'lucide-react'
import type { ReactNode } from 'react'
import type { Finding } from '../../api/types'
import { formatTimestamp } from '../../lib/format'
import { CATEGORY_LABELS, LEVELS, SUBJECT_META, riskBand } from '../../lib/risk'
import { Chip } from '../ui/Badge'

interface Props {
  finding: Finding
  risk: number
  residualRisk: number
  /** The annotated still, when this finding was localised in the media. */
  still?: ReactNode
}

export function FindingCard({ finding, risk, residualRisk, still }: Props) {
  const subject = SUBJECT_META[finding.subject]
  const SubjectIcon = subject.icon
  const band = LEVELS[riskBand(risk)]
  const BandIcon = band.icon
  const reduction = Math.round(finding.mitigation_effectiveness * 100)

  return (
    <article className="rounded-lg border border-border bg-surface p-4 shadow-card print:break-inside-avoid">
      <div className="flex flex-wrap items-center gap-2">
        <Chip><SubjectIcon className="size-3.5" aria-hidden />{subject.label}</Chip>
        <Chip>{CATEGORY_LABELS[finding.category]}</Chip>
        <span className={`ml-auto inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold ${band.bg} ${band.text}`}>
          <span className="tabular font-mono">Risk {risk}</span>
          <span aria-hidden>·</span>
          <BandIcon className="size-3.5" aria-hidden />
          <span>{band.label}</span>
        </span>
      </div>

      <div className={`mt-2 gap-4 ${still ? 'sm:grid sm:grid-cols-[minmax(0,1fr)_minmax(0,13rem)] sm:items-start' : ''}`}>
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-fg-strong">{finding.title}</h3>
          <p className="mt-1 text-sm text-fg">{finding.description}</p>

          <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm md:grid-cols-2">
            <div className="flex gap-2">
              <dt className="sr-only">Severity and likelihood</dt>
              <dd className="flex flex-wrap gap-2">
                <Chip>Severity {finding.severity}/5</Chip>
                <Chip>Likelihood {finding.likelihood}/5</Chip>
              </dd>
            </div>
            <div className="text-fg-muted">
              <dt className="sr-only">Evidence</dt>
              <dd className="flex items-start gap-2">
                <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span>
                  {finding.evidence}
                  {finding.timestamp_seconds !== null && (
                    <span className="ml-2 inline-flex items-center gap-1 tabular font-mono text-xs">
                      <Clock className="size-3" aria-hidden />{formatTimestamp(finding.timestamp_seconds)}
                    </span>
                  )}
                </span>
              </dd>
            </div>
          </dl>
        </div>
        {still && <div className="mt-3 min-w-0 sm:mt-0">{still}</div>}
      </div>

      <div className="mt-3 rounded-md border-l-4 border-accent bg-muted p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-fg-muted">Recommendation</p>
        <p className="mt-1 text-sm text-fg-strong">{finding.recommendation}</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {finding.required_equipment.map((item) => (
            <Chip key={item} className="bg-surface"><Wrench className="size-3" aria-hidden />{item}</Chip>
          ))}
          <span className="ml-auto text-xs font-semibold text-risk-low">
            −{reduction}% after fix{' '}
            <span className="tabular font-mono font-medium text-fg-muted">(residual {residualRisk})</span>
          </span>
        </div>
      </div>
    </article>
  )
}
