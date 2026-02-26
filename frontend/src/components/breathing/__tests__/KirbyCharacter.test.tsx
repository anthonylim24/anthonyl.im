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

  it('puffAmount scales the body and cheeks', () => {
    const { container: flat } = render(<KirbyCharacter puffAmount={0} />)
    const { container: puffed } = render(<KirbyCharacter puffAmount={1} />)

    const flatSvg = flat.querySelector('svg') as SVGSVGElement
    const puffedSvg = puffed.querySelector('svg') as SVGSVGElement
    expect(flatSvg.style.transform).toBe('scale(1)')
    expect(puffedSvg.style.transform).toBe('scale(1.15)')

    // Cheek groups should be larger when puffed
    const flatCheek = flat.querySelectorAll('g')[0] as SVGGElement
    const puffedCheek = puffed.querySelectorAll('g')[0] as SVGGElement
    expect(flatCheek.style.transform).toBe('scale(1)')
    expect(puffedCheek.style.transform).toBe('scale(2.3)')
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
