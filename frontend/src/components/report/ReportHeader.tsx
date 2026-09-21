import { Printer, Trash2 } from 'lucide-react'
import { api } from '../../api/client'
import type { AnalysisDetail } from '../../api/types'
import { formatDate, formatTokens } from '../../lib/format'
import { LevelBadge } from '../ui/Badge'
import { Button } from '../ui/Button'

interface Props {
  analysis: AnalysisDetail
  onDelete: () => void
  deleting: boolean
}

export function ReportHeader({ analysis, onDelete, deleting }: Props) {
  const mediaUrl = api.mediaUrl(analysis.id)
  return (
    <header className="grid gap-4 rounded-lg border border-border bg-surface p-4 shadow-card md:grid-cols-[240px_1fr]">
      <div className="overflow-hidden rounded-md bg-muted" style={{ aspectRatio: '16 / 10' }}>
        {analysis.media_type === 'video' ? (
          <video src={mediaUrl} controls muted playsInline className="size-full object-cover" aria-label={`Video ${analysis.filename}`} />
        ) : (
          <img src={mediaUrl} alt={`Site photo ${analysis.filename}`} className="size-full object-cover" />
        )}
      </div>
      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold text-fg-strong">{analysis.site_name ?? 'Site analysis'}</h1>
            <p className="text-sm text-fg-muted">{analysis.filename} · {formatDate(analysis.created_at)}</p>
          </div>
          {analysis.risk_level && <LevelBadge level={analysis.risk_level} size="lg" />}
        </div>
        {analysis.result && <p className="text-sm text-fg">{analysis.result.scene_summary}</p>}
        <dl className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-fg-muted">
          <div><dt className="inline">Model: </dt><dd className="inline font-mono">{analysis.model ?? '—'}</dd></div>
          <div><dt className="inline">Tokens in/out: </dt><dd className="inline tabular font-mono">{formatTokens(analysis.input_tokens)} / {formatTokens(analysis.output_tokens)}</dd></div>
        </dl>
        <div className="mt-auto flex flex-wrap gap-2 print:hidden">
          <Button variant="secondary" onClick={() => window.print()}>
            <Printer className="size-4" aria-hidden /> Download PDF
          </Button>
          <Button variant="danger" onClick={onDelete} loading={deleting}>
            <Trash2 className="size-4" aria-hidden /> Delete
          </Button>
        </div>
      </div>
    </header>
  )
}
