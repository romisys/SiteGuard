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

  it('anchors the box to the picture, not to the letterboxed slot', () => {
    // A portrait still is capped in height and centred in a wider slot, so the
    // figure is no longer the picture. Percentages are relative to the nearest
    // positioned ancestor, so the box and its label have to live in a wrapper
    // that is exactly the rendered <img> box — otherwise every box drifts.
    render(<AnnotatedFrame src="data:image/jpeg;base64,x" finding={findingEdge} />)
    const img = screen.getByRole('img')
    const frame = img.parentElement as HTMLElement
    expect(frame).toHaveClass('relative')
    expect(screen.getByTestId('hazard-box').parentElement).toBe(frame)
    expect(screen.getByText('Unprotected slab edge').parentElement).toBe(frame)
    // The wrapper shrinks to the picture instead of the picture stretching to it.
    expect(frame.className).toMatch(/\bw-fit\b/)
  })

  it('scales the still down rather than cropping it', () => {
    // Cropping would be the easy way to cap a portrait still's height, and it
    // would cut away the annotated box, which is the entire point of the still.
    render(<AnnotatedFrame src="data:image/jpeg;base64,x" finding={findingEdge} />)
    const img = screen.getByRole('img')
    expect(img.className).toMatch(/\bmax-h-52\b/)
    expect(img.className).toMatch(/\bw-auto\b/)
    expect(img.className).toMatch(/\bmax-w-full\b/)
    expect(img.className.split(' ')).not.toContain('w-full')
    expect(img.className.split(' ')).not.toContain('h-full')
    expect(img.className).not.toMatch(/object-(cover|fill)/)
  })
})
