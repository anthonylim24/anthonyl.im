import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { KirbyCharacter } from '../KirbyCharacter'

describe('KirbyCharacter', () => {
  it('renders an aria-hidden SVG character', () => {
    const { container } = render(<KirbyCharacter />)
    const svg = container.querySelector('svg')

    expect(svg).toBeTruthy()
    expect(svg).toHaveAttribute('aria-hidden', 'true')
  })

  it('renders at the requested square size', () => {
    const { container } = render(<KirbyCharacter size={50} />)
    const wrapper = container.firstChild as HTMLElement

    expect(wrapper.style.width).toBe('50px')
    expect(wrapper.style.height).toBe('50px')
  })

  it('uses puffAmount to scale the body and cheeks', () => {
    const { container: flat } = render(<KirbyCharacter puffAmount={0} />)
    const { container: puffed } = render(<KirbyCharacter puffAmount={1} />)

    const flatSvg = flat.querySelector('svg') as SVGSVGElement
    const puffedSvg = puffed.querySelector('svg') as SVGSVGElement
    expect(flatSvg.style.transform).toBe('scale(0.85) scaleX(1) scaleY(1)')
    expect(puffedSvg.style.transform).toBe('scale(1.3) scaleX(0.97) scaleY(1.06)')

    const flatCheek = flat.querySelectorAll('g')[0] as SVGGElement
    const puffedCheek = puffed.querySelectorAll('g')[0] as SVGGElement
    expect(flatCheek.style.transform).toBe('scale(1)')
    expect(puffedCheek.style.transform).toBe('scale(2.8)')
  })

  it('preserves caller styles and classes on the wrapper', () => {
    const { container } = render(
      <KirbyCharacter style={{ opacity: 0.5 }} className="test-class" />,
    )
    const wrapper = container.firstChild as HTMLElement

    expect(wrapper.style.opacity).toBe('0.5')
    expect(wrapper).toHaveClass('test-class')
  })
})
