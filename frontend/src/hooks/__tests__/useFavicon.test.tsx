import { render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { useFavicon } from '../useFavicon'

function FaviconProbe() {
  useFavicon()
  return null
}

function setRouteHead(favicon = '/favicon-chat.svg') {
  document.head.innerHTML = `
    <link rel="icon" type="image/svg+xml" href="${favicon}" />
    <meta name="theme-color" content="transparent" />
  `
}

const initialHead = document.head.innerHTML

afterEach(() => {
  document.head.innerHTML = initialHead
})

describe('useFavicon', () => {
  it('uses the BreathFlow favicon on breathwork routes', async () => {
    setRouteHead()

    render(
      <MemoryRouter initialEntries={['/breathwork/progress']}>
        <FaviconProbe />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(
        document
          .querySelector<HTMLLinkElement>('link[rel="icon"][type="image/svg+xml"]')
          ?.getAttribute('href'),
      ).toBe('/favicon-breath.svg')
    })
  })

  it('uses the default favicon outside BreathFlow', async () => {
    setRouteHead('/favicon-breath.svg')

    render(
      <MemoryRouter initialEntries={['/chatbot']}>
        <FaviconProbe />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(
        document
          .querySelector<HTMLLinkElement>('link[rel="icon"][type="image/svg+xml"]')
          ?.getAttribute('href'),
      ).toBe('/favicon-chat.svg')
    })
  })
})
