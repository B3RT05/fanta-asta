// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '@/ui/App'

describe('App shell', () => {
  it('mostra i 3 tab e parte dal Setup', async () => {
    render(<App />)
    expect(screen.getByRole('button', { name: 'Setup' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Studio' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Asta' })).toBeInTheDocument()
    expect(screen.getByText(/listone/i)).toBeInTheDocument()
  })
  it('config lega: modifica budget', async () => {
    render(<App />)
    const input = screen.getByLabelText('Budget')
    await userEvent.clear(input)
    await userEvent.type(input, '650')
    expect((input as HTMLInputElement).value).toBe('650')
  })
})
