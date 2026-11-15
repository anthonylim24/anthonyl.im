import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import indexCss from '@/index.css?raw'
import { useImmersive } from '../../platform/immersive'
import { BREATHFLOW_THEME_COLORS } from '../../platform/useBreathflowTheme'
import { BreathflowLayout } from '../BreathflowLayout'

function Immersive() {
  const [on, setOn] = useState(true)
  useImmersive(on)
  return <button type="button" onClick={() => setOn(false)}>leave</button>
}

describe('BreathflowLayout', () => {
  it('takes the header, navs and skip link out of reach while a session is fullscreen', () => {
    render(
      <MemoryRouter initialEntries={['/breathwork/session']}>
        <Routes>
          <Route path="/breathwork" element={<BreathflowLayout />}>
            <Route path="session" element={<Immersive />} />
          </Route>
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.getByText('Skip to content')).toHaveAttribute('inert')
    expect(document.querySelector('header')).toHaveAttribute('inert')
    for (const nav of document.querySelectorAll('nav')) expect(nav.closest('[inert]')).not.toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'leave' }))
    expect(screen.getByText('Skip to content')).not.toHaveAttribute('inert')
    expect(document.querySelector('header')).not.toHaveAttribute('inert')
  })

  it('paints the browser chrome in the paper colours', () => {
    const canvas = [...indexCss.matchAll(/--bw-canvas:\s*(#[0-9A-Fa-f]{6})/g)].map((match) => match[1].toUpperCase())
    expect(canvas).toEqual([BREATHFLOW_THEME_COLORS.light, BREATHFLOW_THEME_COLORS.dark])
  })
})
