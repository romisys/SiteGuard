import { CheckCircle2 } from 'lucide-react'

export function PositiveList({ items }: { items: string[] }) {
  if (items.length === 0) return <p className="text-sm text-fg-muted">No positive observations recorded.</p>
  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li key={item} className="flex items-start gap-2 text-sm text-fg">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-risk-low" aria-hidden />
          {item}
        </li>
      ))}
    </ul>
  )
}
