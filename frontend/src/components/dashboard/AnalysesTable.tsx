import { FileVideo, Image as ImageIcon, Loader2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { AnalysisSummary } from '../../api/types'
import { formatDate, formatPercent } from '../../lib/format'
import { LevelBadge } from '../ui/Badge'

export function AnalysesTable({ rows }: { rows: AnalysisSummary[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm" aria-label="Past analyses">
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-fg-muted">
            <th scope="col" className="py-2 pr-4 font-medium">Site</th>
            <th scope="col" className="py-2 pr-4 font-medium">Date</th>
            <th scope="col" className="py-2 pr-4 font-medium">Level</th>
            <th scope="col" className="py-2 pr-4 text-right font-medium">Score</th>
            <th scope="col" className="py-2 text-right font-medium">PPE</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-border transition-colors duration-150 last:border-0 hover:bg-muted">
              <td className="py-2 pr-4">
                <Link
                  to={`/analyses/${row.id}`}
                  className="flex min-h-11 items-center gap-2 rounded-md font-medium text-fg-strong hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
                >
                  {row.media_type === 'video' ? <FileVideo className="size-4 shrink-0 text-fg-muted" aria-hidden /> : <ImageIcon className="size-4 shrink-0 text-fg-muted" aria-hidden />}
                  <span>
                    {row.site_name ?? 'Untitled site'}
                    <span className="block text-xs font-normal text-fg-muted">{row.filename}</span>
                  </span>
                </Link>
              </td>
              <td className="py-2 pr-4 whitespace-nowrap text-fg">{formatDate(row.created_at)}</td>
              <td className="py-2 pr-4">
                {row.risk_level ? <LevelBadge level={row.risk_level} /> : (
                  <span className="inline-flex items-center gap-1 text-xs text-fg-muted">
                    {row.status === 'failed' ? 'Failed' : <><Loader2 className="size-3 animate-spin" aria-hidden /> Processing</>}
                  </span>
                )}
              </td>
              <td className="tabular py-2 pr-4 text-right font-mono font-semibold text-fg-strong">{row.risk_score ?? '—'}</td>
              <td className="tabular py-2 text-right font-mono text-fg">{formatPercent(row.ppe_compliance_rate)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
