import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { RiskCategory } from '../../api/types'
import { CATEGORY_LABELS } from '../../lib/risk'

export function CategoryBar({ counts }: { counts: Partial<Record<RiskCategory, number>> }) {
  const data = (Object.entries(counts) as [RiskCategory, number][])
    .map(([category, count]) => ({ name: CATEGORY_LABELS[category], count }))
    .sort((a, b) => b.count - a.count)

  if (data.length === 0) {
    return <p className="text-sm text-fg-muted">No findings to chart.</p>
  }

  return (
    <div>
      <div style={{ height: Math.max(160, data.length * 32) }} aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" accessibilityLayer={false} margin={{ left: 8, right: 24, top: 4, bottom: 4 }}>
            <CartesianGrid horizontal={false} stroke="var(--color-border)" />
            <XAxis type="number" allowDecimals={false} tick={{ fill: 'var(--color-fg-muted)', fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="name" width={110} tick={{ fill: 'var(--color-fg)', fontSize: 12 }} axisLine={false} tickLine={false} />
            <Tooltip cursor={{ fill: 'var(--color-muted)' }} contentStyle={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 6, color: 'var(--color-fg-strong)' }} />
            <Bar dataKey="count" fill="var(--color-accent)" radius={[0, 4, 4, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <ul className="sr-only" aria-label="Findings by category">
        {data.map((d) => <li key={d.name}>{d.name}: {d.count}</li>)}
      </ul>
    </div>
  )
}
