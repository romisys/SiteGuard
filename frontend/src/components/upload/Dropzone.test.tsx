import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { renderWithProviders } from '../../test/render'
import { Dropzone } from './Dropzone'

describe('Dropzone', () => {
  it('accepts a valid image and reports it', async () => {
    const onChange = vi.fn()
    renderWithProviders(<Dropzone file={null} onChange={onChange} />)
    const input = screen.getByLabelText(/upload a photo or video/i)
    const file = new File(['x'], 'site.png', { type: 'image/png' })
    await userEvent.upload(input, file)
    expect(onChange).toHaveBeenCalledWith(file)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('rejects an unsupported type with a visible error', async () => {
    const onChange = vi.fn()
    renderWithProviders(<Dropzone file={null} onChange={onChange} />)
    const input = screen.getByLabelText(/upload a photo or video/i)
    await userEvent.upload(input, new File(['x'], 'doc.pdf', { type: 'application/pdf' }), { applyAccept: false })
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent(/unsupported file type/i)
  })

  it('rejects oversize files', async () => {
    const onChange = vi.fn()
    renderWithProviders(<Dropzone file={null} onChange={onChange} maxBytes={10} />)
    const input = screen.getByLabelText(/upload a photo or video/i)
    await userEvent.upload(input, new File(['0123456789ab'], 'big.png', { type: 'image/png' }))
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent(/too large/i)
  })

  it('shows selected file name and a clear button', async () => {
    const onChange = vi.fn()
    const file = new File(['x'], 'clip.mov', { type: 'video/quicktime' })
    renderWithProviders(<Dropzone file={file} onChange={onChange} />)
    expect(screen.getByText('clip.mov')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /remove file/i }))
    expect(onChange).toHaveBeenCalledWith(null)
  })
})
