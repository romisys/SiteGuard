const dateFmt = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })
const shortDateFmt = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' })

export function formatDate(iso: string): string {
  return dateFmt.format(new Date(iso))
}

export function formatShortDate(iso: string): string {
  return shortDateFmt.format(new Date(iso))
}

export function formatTimestamp(seconds: number): string {
  const total = Math.floor(seconds)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function formatPercent(fraction: number | null | undefined): string {
  if (fraction === null || fraction === undefined) return '—'
  return `${Math.round(fraction * 100)}%`
}

export function formatTokens(n: number | null): string {
  return n === null ? '—' : n.toLocaleString()
}
