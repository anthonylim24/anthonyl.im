import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { KirbyCharacter } from '../KirbyCharacter'

describe('KirbyCharacter', () => {
  it('renders an SVG element', () => {
    const { container } = render(<KirbyCharacter />)
    expect(container.querySelector('svg')).toBeTruthy()
  })

  it('renders at the specified size', () => {
    const { container } = render(<KirbyCharacter size={50} />)
    const wrapper = container.firstChild as HTMLElement
    expect(wrapper.style.width).toBe('50px')
    expect(wrapper.style.height).toBe('50px')
  })

  it('puffed cheeks are larger than flat cheeks', () => {
    const { container: flat } = render(<KirbyCharacter puffAmount={0} />)
    const { container: puffed } = render(<KirbyCharacter puffAmount={1} />)
    const flatRx = Number(flat.querySelectorAll('ellipse[fill="#FF85A1"]')[0].getAttribute('rx'))
    const puffedRx = Number(puffed.querySelectorAll('ellipse[fill="#FF85A1"]')[0].getAttribute('rx'))
    expect(puffedRx).toBeGreaterThan(flatRx)
  })

  it('applies additional style and className', () => {
    const { container } = render(
      <KirbyCharacter style={{ opacity: 0.5 }} className="test-class" />
    )
    const wrapper = container.firstChild as HTMLElement
    expect(wrapper.style.opacity).toBe('0.5')
    expect(wrapper.classList.contains('test-class')).toBe(true)
  })
})
