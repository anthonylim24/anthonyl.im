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

function getMeta(attribute: 'name' | 'property', value: string) {
  return document.querySelector<HTMLMetaElement>(`meta[${attribute}="${value}"]`)
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
  it('sets and restores document title, description, and social metadata', () => {
    document.title = 'Anthony Lim - Software Engineer'
    ensureDescription().setAttribute('content', 'Original description')
    const ogTitle = document.createElement('meta')
    ogTitle.setAttribute('property', 'og:title')
    ogTitle.setAttribute('content', 'Original OG title')
    document.head.appendChild(ogTitle)

    const { unmount } = render(<MetadataProbe />)

    expect(document.title).toBe('BreathFlow - Scientific Breathwork')
    expect(getDescription()?.getAttribute('content')).toBe('Evidence-informed breathwork for calm and focus.')
    expect(getMeta('property', 'og:title')?.getAttribute('content')).toBe('BreathFlow - Scientific Breathwork')
    expect(getMeta('property', 'og:description')?.getAttribute('content')).toBe('Evidence-informed breathwork for calm and focus.')
    expect(getMeta('name', 'twitter:title')?.getAttribute('content')).toBe('BreathFlow - Scientific Breathwork')
    expect(getMeta('name', 'twitter:description')?.getAttribute('content')).toBe('Evidence-informed breathwork for calm and focus.')

    unmount()

    expect(document.title).toBe('Anthony Lim - Software Engineer')
    expect(getDescription()?.getAttribute('content')).toBe('Original description')
    expect(getMeta('property', 'og:title')?.getAttribute('content')).toBe('Original OG title')
    expect(getMeta('property', 'og:description')).toBeNull()
    expect(getMeta('name', 'twitter:title')).toBeNull()
    expect(getMeta('name', 'twitter:description')).toBeNull()
  })

  it('creates metadata tags when they are missing', () => {
    getDescription()?.remove()

    render(<MetadataProbe />)

    expect(getDescription()?.getAttribute('content')).toBe('Evidence-informed breathwork for calm and focus.')
    expect(getMeta('property', 'og:title')?.getAttribute('content')).toBe('BreathFlow - Scientific Breathwork')
    expect(getMeta('property', 'og:description')?.getAttribute('content')).toBe('Evidence-informed breathwork for calm and focus.')
    expect(getMeta('name', 'twitter:title')?.getAttribute('content')).toBe('BreathFlow - Scientific Breathwork')
    expect(getMeta('name', 'twitter:description')?.getAttribute('content')).toBe('Evidence-informed breathwork for calm and focus.')
  })
})
