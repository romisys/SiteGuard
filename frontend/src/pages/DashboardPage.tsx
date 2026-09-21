import { Activity, ClipboardList, HardHat, OctagonAlert, Plus } from 'lucide-react'
import { Link } from 'react-router-dom'
import { AnalysesTable } from '../components/dashboard/AnalysesTable'
import { KpiCard } from '../components/dashboard/KpiCard'
import { TrendChart } from '../components/dashboard/TrendChart'
import { CategoryBar } from '../components/report/CategoryBar'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { EmptyState } from '../components/ui/EmptyState'
import { Skeleton } from '../components/ui/Skeleton'
import { useAnalyses } from '../hooks/useAnalyses'
import { useStats } from '../hooks/useStats'
import { formatPercent } from '../lib/format'

const ctaClass =
  'inline-flex min-h-11 items-center gap-2 rounded-md bg-accent px-4 text-sm font-medium text-on-accent transition-colors duration-150 hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg'

export function DashboardPage() {
  const stats = useStats()
  const analyses = useAnalyses()

  if (stats.isPending || analyses.isPending) {
    return (
      <div className="space-y-4" aria-busy>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Skeleton className="h-24" /><Skeleton className="h-24" /><Skeleton className="h-24" /><Skeleton className="h-24" />
        </div>
        <Skeleton className="h-64" />
      </div>
    )
  }

  if (stats.isError || analyses.isError) {
    return (
      <Card>
        <p role="alert" className="text-sm text-fg-strong">{(stats.error ?? analyses.error)?.message}</p>
        <Button
          variant="secondary"
          className="mt-3"
          onClick={() => { void stats.refetch(); void analyses.refetch() }}
        >
          Try again
        </Button>
      </Card>
    )
  }

  const s = stats.data
  const rows = analyses.data

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={ClipboardList}
        title="No analyses yet"
        body="Upload a photo or short video of a site and SiteGuard will score the risk, flag PPE gaps and suggest fixes."
        action={
          <Link to="/new" className={ctaClass}>
            <Plus className="size-4" aria-hidden /> Run your first analysis
          </Link>
        }
      />
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-fg-strong">Dashboard</h1>
        <Link to="/new" className={ctaClass}>
          <Plus className="size-4" aria-hidden /> New analysis
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Analyses" value={String(s.total)} icon={ClipboardList} hint={`${s.completed} completed`} />
        <KpiCard label="Average risk" value={s.average_score === null ? '—' : String(Math.round(s.average_score))} icon={Activity} hint="0–100 across completed" />
        <KpiCard label="Critical sites" value={String(s.critical_count)} icon={OctagonAlert} tone={s.critical_count > 0 ? 'critical' : 'default'} hint="score ≥ 75" />
        <KpiCard label="PPE compliance" value={formatPercent(s.average_ppe_compliance)} icon={HardHat} hint="average across analyses" />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Risk score trend"><TrendChart trend={s.trend} /></Card>
        <Card title="Findings by category"><CategoryBar counts={s.findings_by_category} /></Card>
      </div>

      <Card title="Past analyses"><AnalysesTable rows={rows} /></Card>
    </div>
  )
}
