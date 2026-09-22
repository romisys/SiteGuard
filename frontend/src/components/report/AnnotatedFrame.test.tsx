import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { findingEdge } from '../../test/fixtures'
import { AnnotatedFrame } from './AnnotatedFrame'

describe('AnnotatedFrame', () => {
  it('draws the box over the still with an accessible description', () => {
    render(<AnnotatedFrame src="data:image/jpeg;base64,x" finding={findingEdge} />)
    const figure = screen.getByRole('figure', { name: /unprotected slab edge/i })
    expect(figure).toBeInTheDocument()
    const box = screen.getByTestId('hazard-box')
    expect(box).toHaveStyle({ top: '50%', left: '10%', width: '60%', height: '40%' })
  })

  it('labels the box with the finding title', () => {
    render(<AnnotatedFrame src="data:image/jpeg;base64,x" finding={findingEdge} />)
    expect(screen.getByText('Unprotected slab edge')).toBeInTheDocument()
  })

  it('renders the still without a box when the hazard was not localised', () => {
    render(<AnnotatedFrame src="data:image/jpeg;base64,x" finding={{ ...findingEdge, box_2d: null }} />)
    expect(screen.queryByTestId('hazard-box')).not.toBeInTheDocument()
    expect(screen.getByRole('img')).toBeInTheDocument()
  })

  it('shows a placeholder while the still is still being captured', () => {
    render(<AnnotatedFrame src={null} finding={findingEdge} />)
    expect(screen.getByText(/capturing frame/i)).toBeInTheDocument()
    expect(screen.queryByTestId('hazard-box')).not.toBeInTheDocument()
  })

  it('explains when the still could not be captured', () => {
    render(<AnnotatedFrame src={null} finding={findingEdge} failed />)
    expect(screen.getByText(/could not capture/i)).toBeInTheDocument()
  })

  it('keeps a label for a box near the right edge inside the still', () => {
    // Left-aligning it there would run the title off the frame, and the figure
    // clips its overflow, so the end of the title would simply be gone.
    render(<AnnotatedFrame src="data:image/jpeg;base64,x" finding={{ ...findingEdge, box_2d: [400, 700, 500, 950] }} />)
    const caption = screen.getByText('Unprotected slab edge')
    expect(caption).toHaveStyle({ right: '5%', maxWidth: '95%' })
    expect(caption.style.left).toBe('')
  })

  it('keeps a box at the very top of the frame inside the still', () => {
    // A caption placed above a box flush with the top edge would be clipped away.
    render(<AnnotatedFrame src="data:image/jpeg;base64,x" finding={{ ...findingEdge, box_2d: [0, 100, 400, 700] }} />)
    expect(screen.getByText('Unprotected slab edge')).toHaveStyle({ top: '0%' })
  })
})
