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
})

describe('MitigationBars', () => {
  it('shows current, residual and reduction', () => {
    render(<MitigationBars scores={completedDetail.scores!} />)
    expect(screen.getByText(/current risk/i)).toBeInTheDocument()
    expect(screen.getByText(/after mitigation/i)).toBeInTheDocument()
    expect(screen.getByText(/reduce risk by 72 points/i)).toBeInTheDocument()
    expect(screen.getByText(/88% → 16%/)).toBeInTheDocument()
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

  it('handles no workers', () => {
    render(<WorkersPanel workers={{ workers_visible: 0, ppe: [], unsafe_behaviours: [] }} complianceRate={null} />)
    expect(screen.getByText(/no workers visible/i)).toBeInTheDocument()
  })
})
