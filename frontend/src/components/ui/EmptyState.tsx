import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

export function EmptyState({ icon: Icon, title, body, action }: { icon: LucideIcon; title: string; body: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border px-6 py-12 text-center">
      <Icon className="size-8 text-fg-muted" aria-hidden />
      <h2 className="text-base font-semibold text-fg-strong">{title}</h2>
      <p className="max-w-sm text-sm text-fg-muted">{body}</p>
      {action}
    </div>
  )
}
