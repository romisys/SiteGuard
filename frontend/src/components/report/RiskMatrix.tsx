import type { Finding } from '../../api/types'
import { LEVELS, riskBand } from '../../lib/risk'

const SCALE = [1, 2, 3, 4, 5]

export function RiskMatrix({ findings }: { findings: Finding[] }) {
  const counts = new Map<string, number>()
  for (const f of findings) {
    const key = `${f.severity}-${f.likelihood}`
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  return (
    <div>
      <div className="grid gap-1" style={{ gridTemplateColumns: 'auto repeat(5, minmax(0, 1fr))' }} role="table" aria-label="Severity by likelihood matrix">
        <div role="row" className="contents">
          <div role="columnheader" className="pr-2 text-right text-[11px] font-medium text-fg-muted">Sev ↓ / Lik →</div>
          {SCALE.map((l) => <div key={l} role="columnheader" className="pb-1 text-center text-xs font-medium text-fg-muted">{l}</div>)}
        </div>
        {[...SCALE].reverse().map((severity) => (
          <div role="row" className="contents" key={severity}>
            <div role="rowheader" className="pr-2 text-right text-xs font-medium text-fg-muted">{severity}</div>
            {SCALE.map((likelihood) => {
              const n = counts.get(`${severity}-${likelihood}`) ?? 0
              const meta = LEVELS[riskBand(severity * likelihood)]
              return (
                <div
                  key={likelihood}
                  role="cell"
                  aria-label={`Severity ${severity}, likelihood ${likelihood}: ${n} finding${n === 1 ? '' : 's'}`}
                  className={`tabular grid aspect-square place-items-center rounded-md font-mono text-sm font-semibold ${meta.bg} ${n > 0 ? meta.text : 'text-transparent'} ${n > 0 ? 'ring-2 ring-inset ring-current' : ''}`}
                >
                  {n > 0 ? n : '·'}
                </div>
              )
            })}
          </div>
        ))}
      </div>
      <ul className="mt-3 flex flex-wrap gap-3 text-xs text-fg-muted" aria-label="Legend">
        {(['Low', 'Moderate', 'High', 'Critical'] as const).map((lvl) => {
          const Icon = LEVELS[lvl].icon
          return (
            <li key={lvl} className="flex items-center gap-1">
              <span className={`inline-block size-3 rounded-sm ${LEVELS[lvl].fill}`} aria-hidden />
              <Icon className={`size-3.5 ${LEVELS[lvl].text}`} aria-hidden />
              {lvl}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
