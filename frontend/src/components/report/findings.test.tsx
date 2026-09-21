import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { completedDetail, findingEdge, findingHelmet } from '../../test/fixtures'
import { CategoryBar } from './CategoryBar'
import { FindingCard } from './FindingCard'
import { FindingsList } from './FindingsList'
import { RiskMatrix } from './RiskMatrix'

describe('RiskMatrix', () => {
  it('places findings in the right cells', () => {
    render(<RiskMatrix findings={[findingHelmet, findingEdge]} />)
    // helmet: severity 4, likelihood 3; edge: severity 5, likelihood 5
    expect(screen.getByLabelText('Severity 4, likelihood 3: 1 finding')).toBeInTheDocument()
    expect(screen.getByLabelText('Severity 5, likelihood 5: 1 finding')).toBeInTheDocument()
    expect(screen.getByLabelText('Severity 1, likelihood 1: 0 findings')).toBeInTheDocument()
  })
})

describe('CategoryBar', () => {
  it('renders an accessible list of counts', () => {
    render(<CategoryBar counts={{ ppe: 2, fall_protection: 1 }} />)
    const list = screen.getByRole('list', { name: /findings by category/i })
    expect(within(list).getByText(/PPE: 2/)).toBeInTheDocument()
    expect(within(list).getByText(/Fall protection: 1/)).toBeInTheDocument()
  })

  it('shows empty state', () => {
    render(<CategoryBar counts={{}} />)
    expect(screen.getByText(/no findings/i)).toBeInTheDocument()
  })
})

describe('FindingCard', () => {
  it('shows all fields', () => {
    render(<FindingCard finding={findingHelmet} risk={12} residualRisk={2.4} />)
    expect(screen.getByRole('heading', { name: 'Worker without helmet' })).toBeInTheDocument()
    expect(screen.getByText('Worker')).toBeInTheDocument()
    expect(screen.getByText('PPE')).toBeInTheDocument()
    expect(screen.getByText(/severity 4/i)).toBeInTheDocument()
    expect(screen.getByText(/likelihood 3/i)).toBeInTheDocument()
    expect(screen.getByText(/risk 12/i)).toBeInTheDocument()
    expect(screen.getByText(/0:04/)).toBeInTheDocument()
    expect(screen.getByText('hard hat')).toBeInTheDocument()
    expect(screen.getByText(/−80% after fix/)).toBeInTheDocument()
  })
})

describe('FindingsList', () => {
  it('sorts by risk desc and filters by subject', async () => {
    render(<FindingsList result={completedDetail.result!} scores={completedDetail.scores!} />)
    const headings = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)
    expect(headings).toEqual(['Unprotected slab edge', 'Extension cable in water', 'Worker without helmet'])

    await userEvent.click(screen.getByRole('button', { name: /workers \(1\)/i }))
    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(1)
    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('Worker without helmet')

    await userEvent.click(screen.getByRole('button', { name: /all \(3\)/i }))
    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(3)
  })
})
