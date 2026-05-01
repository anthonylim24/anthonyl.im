import { useEffect } from 'react'

interface DocumentMetadata {
  title: string
  description: string
}

interface ManagedMeta {
  attribute: 'name' | 'property'
  value: string
  content: string
}

function getManagedMeta({ attribute, value }: ManagedMeta): {
  element: HTMLMetaElement
  created: boolean
} {
  const existing = document.querySelector<HTMLMetaElement>(`meta[${attribute}="${value}"]`)
  if (existing) return { element: existing, created: false }

  const meta = document.createElement('meta')
  meta.setAttribute(attribute, value)
  document.head.appendChild(meta)
  return { element: meta, created: true }
}

export function useDocumentMetadata({ title, description }: DocumentMetadata) {
  useEffect(() => {
    const previousTitle = document.title
    const managedMetas: ManagedMeta[] = [
      { attribute: 'name', value: 'description', content: description },
      { attribute: 'property', value: 'og:title', content: title },
      { attribute: 'property', value: 'og:description', content: description },
      { attribute: 'name', value: 'twitter:title', content: title },
      { attribute: 'name', value: 'twitter:description', content: description },
    ]
    const previousMetas = managedMetas.map((meta) => {
      const { element, created } = getManagedMeta(meta)
      const previousContent = element.getAttribute('content')
      element.setAttribute('content', meta.content)
      return { element, created, previousContent }
    })

    document.title = title

    return () => {
      document.title = previousTitle
      for (const { element, created, previousContent } of previousMetas) {
        if (created) {
          element.remove()
        } else if (previousContent === null) {
          element.removeAttribute('content')
        } else {
          element.setAttribute('content', previousContent)
        }
      }
    }
  }, [description, title])
}
