import type { HTMLAttributes, ReactNode } from 'react'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  title?: string
  action?: ReactNode
}

export function Card({ title, action, children, className = '', ...rest }: CardProps) {
  return (
    <section
      className={`rounded-lg border border-border bg-surface shadow-card ${className}`}
      aria-label={title}
      {...rest}
    >
      {(title || action) && (
        <header className="flex items-center justify-between gap-4 border-b border-border px-4 py-3">
          {title && <h2 className="text-sm font-semibold text-fg-strong">{title}</h2>}
          {action}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  )
}
