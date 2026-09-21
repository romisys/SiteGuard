import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Loader2, RefreshCw } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import { api, ApiError } from '../api/client'
import { CategoryBar } from '../components/report/CategoryBar'
import { FindingsList } from '../components/report/FindingsList'
import { MitigationBars } from '../components/report/MitigationBars'
import { PositiveList } from '../components/report/PositiveList'
import { ReportHeader } from '../components/report/ReportHeader'
import { RiskGauge } from '../components/report/RiskGauge'
import { RiskMatrix } from '../components/report/RiskMatrix'
import { WorkersPanel } from '../components/report/WorkersPanel'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Skeleton } from '../components/ui/Skeleton'
import { analysesKey } from '../hooks/useAnalyses'
import { analysisKey, isActive, useAnalysis } from '../hooks/useAnalysis'
import { statsKey } from '../hooks/useStats'

export function ReportPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const query = useAnalysis(id)

  const retry = useMutation({
    mutationFn: () => api.retryAnalysis(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: analysisKey(id) }),
  })

  const remove = useMutation({
    mutationFn: () => api.deleteAnalysis(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: analysesKey })
      queryClient.invalidateQueries({ queryKey: statsKey })
      navigate('/')
    },
  })

  if (query.isPending) {
    return <ReportSkeleton />
  }

  if (query.isError) {
    const message = query.error instanceof ApiError && query.error.status === 404
      ? 'Analysis not found.'
      : query.error.message
    return (
      <Card>
        <p className="text-sm text-fg-strong">{message}</p>
        <Button variant="secondary" className="mt-3" onClick={() => navigate('/')}>Back to dashboard</Button>
      </Card>
    )
  }

  const analysis = query.data

  if (isActive(analysis.status)) {
    return (
      <div className="space-y-4">
        <div role="status" className="flex items-center gap-3 rounded-lg border border-border bg-surface p-4 shadow-card">
          <Loader2 className="size-5 animate-spin text-accent" aria-hidden />
          <div>
            <p className="text-sm font-semibold text-fg-strong">Analyzing {analysis.media_type}…</p>
            <p className="text-xs text-fg-muted">
              {analysis.media_type === 'video' ? 'Video usually takes 20–60 seconds.' : 'Images usually take under 15 seconds.'} This page updates automatically.
            </p>
          </div>
        </div>
        <ReportSkeleton />
      </div>
    )
  }

  if (analysis.status === 'failed' || !analysis.result || !analysis.scores) {
    return (
      <Card title="Analysis failed">
        <div role="alert" className="flex items-start gap-2 text-sm text-fg-strong">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-risk-critical" aria-hidden />
          <span>{analysis.error_message ?? 'The analysis did not produce a result.'}</span>
        </div>
        <div className="mt-4 flex gap-2">
          <Button onClick={() => retry.mutate()} loading={retry.isPending}>
            <RefreshCw className="size-4" aria-hidden /> Retry
          </Button>
          <Button variant="danger" onClick={() => remove.mutate()} loading={remove.isPending}>Delete</Button>
        </div>
        {retry.error && <p role="alert" className="mt-2 text-sm text-danger">{retry.error.message}</p>}
      </Card>
    )
  }

  const { result, scores } = analysis

  return (
    <div className="space-y-4">
      <ReportHeader
        analysis={analysis}
        deleting={remove.isPending}
        onDelete={() => { if (window.confirm('Delete this analysis and its media file?')) remove.mutate() }}
      />

      <div className="grid gap-4 md:grid-cols-3">
        <Card title="Risk score"><RiskGauge score={scores.risk_score} level={scores.risk_level} /></Card>
        <Card title="Current vs after mitigation"><MitigationBars scores={scores} /></Card>
        <Card title="Workers & PPE"><WorkersPanel workers={result.workers} complianceRate={scores.ppe_compliance_rate} /></Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 print-break">
        <Card title="Severity × likelihood"><RiskMatrix findings={result.findings} /></Card>
        <Card title="Findings by category"><CategoryBar counts={scores.findings_by_category} /></Card>
      </div>

      <Card title={`Findings (${result.findings.length})`} className="print-break">
        <FindingsList result={result} scores={scores} />
      </Card>

      <Card title="Positive observations">
        <PositiveList items={result.positive_observations} />
      </Card>
    </div>
  )
}

function ReportSkeleton() {
  return (
    <div className="space-y-4" aria-hidden>
      <Skeleton className="h-40" />
      <div className="grid gap-4 md:grid-cols-3">
        <Skeleton className="h-56" /><Skeleton className="h-56" /><Skeleton className="h-56" />
      </div>
      <Skeleton className="h-64" />
    </div>
  )
}
