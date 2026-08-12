import { describe, expect, it, afterEach } from 'vitest'
import { useRef } from 'react'
import { render, cleanup } from '@testing-library/react'
import { useScrollMappedHide } from '../useScrollMappedHide'

function Harness({ enabled = true }: { enabled?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  useScrollMappedHide(ref, {
    translateX: '-50%',
    maxHidden: 80,
    enabled,
  })
  return <div ref={ref} data-testid="nav" />
}

function setDocumentScroll(y: number, scrollHeight = 2000, innerHeight = 800) {
  Object.defineProperty(window, 'scrollY', { configurable: true, value: y })
  Object.defineProperty(window, 'pageYOffset', { configurable: true, value: y })
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: innerHeight })
  Object.defineProperty(document.documentElement, 'scrollHeight', {
    configurable: true,
    value: scrollHeight,
  })
}

describe('useScrollMappedHide', () => {
  afterEach(() => {
    cleanup()
    setDocumentScroll(0)
  })

  it('keeps the footer visible at rest and after overscroll past the document end', () => {
    setDocumentScroll(0)
    const { getByTestId } = render(<Harness />)
    const nav = getByTestId('nav')

    expect(nav.style.transform).toBe('translate3d(-50%, 0px, 0)')

    setDocumentScroll(400)
    window.dispatchEvent(new Event('scroll'))
    expect(nav.style.transform).toBe('translate3d(-50%, 80px, 0)')

    setDocumentScroll(2500)
    window.dispatchEvent(new Event('scroll'))
    expect(nav.style.transform).toBe('translate3d(-50%, 0px, 0)')
  })

  it('reveals the footer on a meaningful scroll up', () => {
    setDocumentScroll(400)
    const { getByTestId } = render(<Harness />)
    const nav = getByTestId('nav')

    setDocumentScroll(480)
    window.dispatchEvent(new Event('scroll'))
    expect(nav.style.transform).toBe('translate3d(-50%, 80px, 0)')

    setDocumentScroll(400)
    window.dispatchEvent(new Event('scroll'))
    expect(nav.style.transform).toBe('translate3d(-50%, 0px, 0)')
  })
})
