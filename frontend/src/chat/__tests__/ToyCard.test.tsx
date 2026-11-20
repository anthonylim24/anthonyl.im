import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ITEMS } from '../world/spec'

vi.mock('../toyArt', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../toyArt')>()),
  loadTurn: () => Promise.resolve(true),
}))

const { TOY_ART } = await import('../toyArt')
const { ToyCard } = await import('../ToyCard')

const bean = ITEMS.bean.spec

function card(reducedMotion: boolean) {
  const { container } = render(
    <ToyCard spec={bean} art={TOY_ART.bean} thumbs={null} reducedMotion={reducedMotion} onGive={() => {}} />,
  )
  const strip = () => container.querySelector<HTMLElement>('span[style*="background-image"]')
  return { button: screen.getByRole('button', { name: bean.name }), strip }
}

describe('toy box pictures', () => {
  it('has a pre-rendered still and turn for every catalog toy', () => {
    expect(Object.keys(ITEMS).filter((key) => !TOY_ART[key])).toEqual([])
  })

  it('turns a toy once on hover, then settles back on its still', async () => {
    const { button, strip } = card(false)
    await act(async () => {
      fireEvent.pointerEnter(button, { pointerType: 'mouse' })
    })
    expect(strip()?.style.backgroundImage).toContain(TOY_ART.bean.turn)
    fireEvent.animationEnd(strip()!)
    expect(strip()).toBeNull()
  })

  it('keeps the still when motion is reduced', async () => {
    const { button, strip } = card(true)
    await act(async () => {
      fireEvent.pointerEnter(button, { pointerType: 'mouse' })
    })
    expect(strip()).toBeNull()
  })
})
