import { ArrowDownRight } from 'lucide-react'
import type { ScoreSummary } from '../../api/types'
import { LEVELS } from '../../lib/risk'

function Bar({ label, value, fill }: { label: string; value: number; fill: string }) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-sm">
        <span className="font-medium text-fg-strong">{label}</span>
        <span className="tabular font-mono font-semibold text-fg-strong">{value}%</span>
      </div>
      <div className="h-3 w-full overflow-hidden rounded-full bg-muted" role="presentation">
        <div className={`h-full rounded-full ${fill} transition-[width] duration-300 ease-out`} style={{ width: `${value}%` }} />
      </div>
    </div>
  )
}

export function MitigationBars({ scores }: { scores: ScoreSummary }) {
  const current = LEVELS[scores.risk_level]
  const residual = LEVELS[scores.residual_level]
  const CurrentIcon = current.icon
  const ResidualIcon = residual.icon
  return (
    <div className="space-y-4">
      <Bar label="Current risk" value={scores.risk_score} fill={current.fill} />
      <Bar label="After mitigation" value={scores.residual_score} fill={residual.fill} />
      <p className="flex items-start gap-2 rounded-md bg-muted p-3 text-sm text-fg-strong">
        <ArrowDownRight className="mt-0.5 size-4 shrink-0 text-risk-low" aria-hidden />
        <span>
          Applying every recommendation would <strong>reduce risk by {scores.reduction} points</strong>{' '}
          <span className="tabular font-mono">({scores.risk_score}% → {scores.residual_score}%)</span>, from{' '}
          <span className={`inline-flex items-center gap-1 font-semibold ${current.text}`}>
            <CurrentIcon className="size-3.5" aria-hidden />
            {current.label}
          </span>{' '}
          to{' '}
          <span className={`inline-flex items-center gap-1 font-semibold ${residual.text}`}>
            <ResidualIcon className="size-3.5" aria-hidden />
            {residual.label}
          </span>
          .
        </span>
      </p>
    </div>
  )
}
