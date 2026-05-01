import { render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { useDocumentMetadata } from '../useDocumentMetadata'

function MetadataProbe() {
  useDocumentMetadata({
    title: 'BreathFlow - Scientific Breathwork',
    description: 'Evidence-informed breathwork for calm and focus.',
  })
  return null
}

function getDescription() {
  return document.querySelector<HTMLMetaElement>('meta[name="description"]')
}

function ensureDescription() {
  const existing = getDescription()
  if (existing) return existing

  const meta = document.createElement('meta')
  meta.name = 'description'
  document.head.appendChild(meta)
  return meta
}

const initialHead = document.head.innerHTML
const initialTitle = document.title

afterEach(() => {
  document.head.innerHTML = initialHead
  document.title = initialTitle
})

describe('useDocumentMetadata', () => {
  it('sets and restores document title and description', () => {
    document.title = 'Anthony Lim - Software Engineer'
    ensureDescription().setAttribute('content', 'Original description')

    const { unmount } = render(<MetadataProbe />)

    expect(document.title).toBe('BreathFlow - Scientific Breathwork')
    expect(getDescription()?.getAttribute('content')).toBe('Evidence-informed breathwork for calm and focus.')

    unmount()

    expect(document.title).toBe('Anthony Lim - Software Engineer')
    expect(getDescription()?.getAttribute('content')).toBe('Original description')
  })

  it('creates a description meta tag when one is missing', () => {
    getDescription()?.remove()

    render(<MetadataProbe />)

    expect(getDescription()?.getAttribute('content')).toBe('Evidence-informed breathwork for calm and focus.')
  })
})
