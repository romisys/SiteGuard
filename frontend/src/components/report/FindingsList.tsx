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
              className={`inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-md border px-3 text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg ${
                active ? 'border-accent bg-accent text-on-accent' : 'border-border bg-surface text-fg hover:bg-muted'
              }`}
            >
              {Icon && <Icon className="size-4" aria-hidden />}
              {label} <span className="tabular font-mono">({counts[key]})</span>
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
