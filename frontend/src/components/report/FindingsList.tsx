import { useMemo, useState } from 'react'
import type { AnalysisResult, FindingSubject, ScoreSummary } from '../../api/types'
import { SUBJECT_META } from '../../lib/risk'
import { FindingCard } from './FindingCard'

type Filter = 'all' | FindingSubject

export function FindingsList({ result, scores }: { result: AnalysisResult; scores: ScoreSummary }) {
  const [filter, setFilter] = useState<Filter>('all')

  const rows = useMemo(() => {
    const byIndex = new Map(scores.per_finding.map((p) => [p.index, p]))
    const scored = result.findings.map((finding, index) => {
      const score = byIndex.get(index)
      return {
        finding,
        index,
        risk: score?.risk ?? finding.severity * finding.likelihood,
        residualRisk: score?.residual_risk ?? 0,
      }
    })
    return scored.sort((a, b) => b.risk - a.risk)
  }, [result.findings, scores.per_finding])

  const visible = filter === 'all' ? rows : rows.filter((r) => r.finding.subject === filter)
  const countBy = (subject: FindingSubject) => rows.filter((r) => r.finding.subject === subject).length
  const counts: Record<Filter, number> = {
    all: rows.length,
    worker: countBy('worker'),
    site: countBy('site'),
    equipment: countBy('equipment'),
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
      {filter !== 'all' && (
        <p className="hidden text-xs text-fg-muted print:block">Filtered: {filters.find((f) => f.key === filter)?.label} only</p>
      )}
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
