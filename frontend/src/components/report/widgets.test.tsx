import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { completedDetail } from '../../test/fixtures'
import { MitigationBars } from './MitigationBars'
import { RiskGauge } from './RiskGauge'
import { WorkersPanel } from './WorkersPanel'

describe('RiskGauge', () => {
  it('shows score and level as text', () => {
    render(<RiskGauge score={88} level="Critical" />)
    expect(screen.getByText('88')).toBeInTheDocument()
    expect(screen.getByText('Critical')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /risk score 88 out of 100, critical/i })).toBeInTheDocument()
  })

  it('renders score 0 without a filled arc', () => {
    render(<RiskGauge score={0} level="Low" />)
    expect(screen.getByText('0')).toBeInTheDocument()
    expect(screen.getByText('Low')).toBeInTheDocument()
    // only the track arc; no zero-length filled arc (its round linecap would draw a stray dot)
    expect(screen.getByRole('img', { name: /risk score 0 out of 100, low/i }).querySelectorAll('path')).toHaveLength(1)
  })
})

describe('MitigationBars', () => {
  it('shows current, residual and reduction', () => {
    render(<MitigationBars scores={completedDetail.scores!} />)
    expect(screen.getByText(/current risk/i)).toBeInTheDocument()
    expect(screen.getByText(/after mitigation/i)).toBeInTheDocument()
    expect(screen.getByText(/reduce risk by 72 points/i)).toBeInTheDocument()
    expect(screen.getByText(/88% → 16%/)).toBeInTheDocument()
  })

  it('says there is nothing to mitigate when no hazards were found', () => {
    render(
      <MitigationBars
        scores={{ ...completedDetail.scores!, risk_score: 0, residual_score: 0, reduction: 0, risk_level: 'Low', residual_level: 'Low', per_finding: [] }}
      />,
    )
    expect(screen.getByText(/no hazards found/i)).toBeInTheDocument()
    expect(screen.queryByText(/reduce risk by/i)).not.toBeInTheDocument()
    expect(screen.getByText(/current risk/i)).toBeInTheDocument()
  })
})

describe('WorkersPanel', () => {
  it('lists workers, PPE chips and unsafe behaviours', () => {
    render(<WorkersPanel workers={completedDetail.result!.workers} complianceRate={0.75} />)
    expect(screen.getByText(/2 workers visible/i)).toBeInTheDocument()
    expect(screen.getByText('Helmet')).toBeInTheDocument()
    expect(screen.getByText('1/2')).toBeInTheDocument()
    expect(screen.getByText('Hi-vis vest')).toBeInTheDocument()
    expect(screen.getByText('2/2')).toBeInTheDocument()
    expect(screen.getByText(/75%/)).toBeInTheDocument()
    expect(screen.getByText('Leaning over unprotected edge')).toBeInTheDocument()
  })

  it('marks a 0/0 PPE item as not assessed and shows notes', () => {
    render(
      <WorkersPanel
        workers={{ workers_visible: 1, ppe: [{ item: 'harness', compliant: 0, non_compliant: 0, notes: 'Not visible from this angle' }], unsafe_behaviours: [] }}
        complianceRate={null}
      />,
    )
    expect(screen.getByText('Harness')).toBeInTheDocument()
    expect(screen.getByText('0/0')).toBeInTheDocument()
    expect(screen.getByText('not assessed')).toBeInTheDocument()
    expect(screen.queryByText('all compliant')).not.toBeInTheDocument()
    expect(screen.getByText(/Not visible from this angle/)).toBeInTheDocument()
  })

  it('handles no workers', () => {
    render(<WorkersPanel workers={{ workers_visible: 0, ppe: [], unsafe_behaviours: [] }} complianceRate={null} />)
    expect(screen.getByText(/no workers visible/i)).toBeInTheDocument()
  })
})
