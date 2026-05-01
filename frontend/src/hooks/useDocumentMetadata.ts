import { useEffect } from 'react'

interface DocumentMetadata {
  title: string
  description: string
}

function getDescriptionMeta(): HTMLMetaElement {
  const existing = document.querySelector<HTMLMetaElement>('meta[name="description"]')
  if (existing) return existing

  const meta = document.createElement('meta')
  meta.name = 'description'
  document.head.appendChild(meta)
  return meta
}

export function useDocumentMetadata({ title, description }: DocumentMetadata) {
  useEffect(() => {
    const previousTitle = document.title
    const descriptionMeta = getDescriptionMeta()
    const previousDescription = descriptionMeta.getAttribute('content')

    document.title = title
    descriptionMeta.setAttribute('content', description)

    return () => {
      document.title = previousTitle
      if (previousDescription === null) {
        descriptionMeta.removeAttribute('content')
      } else {
        descriptionMeta.setAttribute('content', previousDescription)
      }
    }
  }, [description, title])
}
