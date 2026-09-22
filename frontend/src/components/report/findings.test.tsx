import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { completedDetail, findingCable, findingEdge, findingHelmet } from '../../test/fixtures'
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
  it('lets the still sit alongside the recommendation, not just the description', () => {
    // A 13rem-tall still beside three lines of text used to stretch its grid row
    // and leave the text column half empty, because the recommendation block sat
    // below the grid entirely. The still now spans both rows instead.
    render(
      <FindingCard
        finding={findingHelmet}
        risk={12}
        residualRisk={2.4}
        still={<div data-testid="the-still" />}
      />,
    )
    const still = screen.getByTestId('the-still').parentElement!
    const recommendation = screen.getByText(/recommendation/i).closest('div')!
    expect(still.className).toMatch(/sm:row-span-2/)
    // Same grid, so the still can span past the description into the recommendation.
    expect(still.parentElement).toBe(recommendation.parentElement)
  })


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

const listProps = {
  result: completedDetail.result!,
  scores: completedDetail.scores!,
  mediaSrc: '/api/analyses/a1/media',
  mediaType: 'video' as const,
}

describe('FindingsList', () => {
  it('sorts by risk desc and filters by subject', async () => {
    render(<FindingsList {...listProps} />)
    const headings = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)
    expect(headings).toEqual(['Unprotected slab edge', 'Extension cable in water', 'Worker without helmet'])

    await userEvent.click(screen.getByRole('button', { name: /workers \(1\)/i }))
    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(1)
    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('Worker without helmet')

    await userEvent.click(screen.getByRole('button', { name: /all \(3\)/i }))
    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(3)
  })

  it('shows an annotated still for a localised finding', () => {
    render(<FindingsList {...listProps} />)
    // two of the three fixture findings carry a box; the cable has none
    expect(screen.getAllByRole('figure', { name: /annotated frame/i })).toHaveLength(2)
  })

  it('omits the still for an image analysis without a box', () => {
    const result = { ...completedDetail.result!, findings: [{ ...findingCable }] }
    render(<FindingsList result={result} scores={completedDetail.scores!} mediaSrc="/x" mediaType="image" />)
    expect(screen.queryByRole('figure')).not.toBeInTheDocument()
  })

  it('annotates an image analysis with the media itself, capturing nothing', () => {
    const result = { ...completedDetail.result!, findings: [{ ...findingEdge, timestamp_seconds: null }] }
    render(<FindingsList result={result} scores={completedDetail.scores!} mediaSrc="/photo.jpg" mediaType="image" />)
    expect(screen.getByRole('img', { name: /frame showing unprotected slab edge/i })).toHaveAttribute('src', '/photo.jpg')
  })
})
