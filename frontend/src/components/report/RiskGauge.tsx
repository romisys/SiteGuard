import type { RiskLevel } from '../../api/types'
import { LEVELS } from '../../lib/risk'

interface Props {
  score: number
  level: RiskLevel
  caption?: string
}

/** Semi-circular gauge. Score is always rendered as text; the arc is decoration. */
export function RiskGauge({ score, level, caption = 'Overall risk' }: Props) {
  const meta = LEVELS[level]
  const Icon = meta.icon
  const r = 80
  const circumference = Math.PI * r // half circle
  const filled = (Math.max(0, Math.min(100, score)) / 100) * circumference

  return (
    <div className="flex flex-col items-center">
      <svg
        viewBox="0 0 200 120"
        className="w-full max-w-[260px]"
        role="img"
        aria-label={`Risk score ${score} out of 100, ${meta.label}`}
      >
        <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke="var(--color-muted)" strokeWidth="16" strokeLinecap="round" />
        {score > 0 && (
          <path
            d="M 20 100 A 80 80 0 0 1 180 100"
            fill="none"
            stroke={meta.cssVar}
            strokeWidth="16"
            strokeLinecap="round"
            strokeDasharray={`${filled} ${circumference}`}
            style={{ transition: 'stroke-dasharray 300ms ease-out' }}
          />
        )}
        <text x="100" y="92" textAnchor="middle" className="fill-fg-strong font-mono tabular" style={{ fontSize: 44, fontWeight: 600 }}>
          {score}
        </text>
        <text x="100" y="112" textAnchor="middle" className="fill-fg-muted" style={{ fontSize: 12 }}>
          {caption} · 0–100
        </text>
      </svg>
      <p className={`mt-1 inline-flex items-center gap-1.5 text-base font-semibold ${meta.text}`}>
        <Icon className="size-5" aria-hidden />
        {meta.label}
      </p>
    </div>
  )
}
