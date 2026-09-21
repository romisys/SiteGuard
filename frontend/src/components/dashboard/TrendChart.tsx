import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { TrendPoint } from '../../api/types'
import { formatShortDate } from '../../lib/format'

export function TrendChart({ trend }: { trend: TrendPoint[] }) {
  if (trend.length === 0) return <p className="text-sm text-fg-muted">No completed analyses yet.</p>
  const data = trend.map((p) => ({ date: formatShortDate(p.date), score: p.score }))
  return (
    <div>
      <div style={{ height: 220 }} aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ left: 0, right: 16, top: 8, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--color-border)" />
            <XAxis dataKey="date" tick={{ fill: 'var(--color-fg-muted)', fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} width={32} tick={{ fill: 'var(--color-fg-muted)', fontSize: 12 }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 6, color: 'var(--color-fg-strong)' }} />
            <Line type="monotone" dataKey="score" stroke="var(--color-accent)" strokeWidth={2} dot={{ r: 3, fill: 'var(--color-accent)' }} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <ul className="sr-only" aria-label="Risk score trend">
        {data.map((d, i) => <li key={i}>{d.date}: {d.score}</li>)}
      </ul>
    </div>
  )
}
