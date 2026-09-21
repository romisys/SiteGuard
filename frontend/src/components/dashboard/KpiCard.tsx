import type { LucideIcon } from 'lucide-react'
import { useId } from 'react'

interface Props {
  label: string
  value: string
  icon: LucideIcon
  hint?: string
  tone?: 'default' | 'critical'
}

export function KpiCard({ label, value, icon: Icon, hint, tone = 'default' }: Props) {
  const labelId = useId()
  return (
    <div role="group" aria-labelledby={labelId} className="rounded-lg border border-border bg-surface p-4 shadow-card">
      <div className="flex items-center justify-between">
        <p id={labelId} className="text-sm font-medium text-fg-muted">{label}</p>
        <Icon className={`size-4 ${tone === 'critical' ? 'text-risk-critical' : 'text-fg-muted'}`} aria-hidden />
      </div>
      <p className={`tabular mt-2 font-mono text-3xl font-semibold ${tone === 'critical' ? 'text-risk-critical' : 'text-fg-strong'}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-fg-muted">{hint}</p>}
    </div>
  )
}
