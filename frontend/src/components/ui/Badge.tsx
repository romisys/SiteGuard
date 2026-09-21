import type { ReactNode } from 'react'
import type { RiskLevel } from '../../api/types'
import { LEVELS } from '../../lib/risk'

export function LevelBadge({ level, size = 'sm' }: { level: RiskLevel; size?: 'sm' | 'lg' }) {
  const meta = LEVELS[level]
  const Icon = meta.icon
  const sizing = size === 'lg' ? 'px-3 py-1.5 text-base' : 'px-2 py-0.5 text-xs'
  return (
    <span className={`inline-flex items-center gap-1 rounded-full font-semibold ${meta.bg} ${meta.text} ${sizing}`}>
      <Icon className={size === 'lg' ? 'size-5' : 'size-3.5'} aria-hidden />
      {meta.label}
    </span>
  )
}

export function Chip({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-fg ${className}`}>
      {children}
    </span>
  )
}
