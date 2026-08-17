---
title: Dynamic Imports for Heavy Components
impact: CRITICAL
impactDescription: directly affects TTI and LCP
tags: bundle, dynamic-import, code-splitting, next-dynamic
---

> **anthonyl.im override (wins):** Vite SPA. Use `React.lazy` + `Suspense`. Do **not** `import dynamic from 'next/dynamic'`. See [`../SKILL.md`](../SKILL.md).

## Dynamic Imports for Heavy Components

Lazy-load large components not needed on initial render.

**Incorrect (Monaco bundles with main chunk ~300KB):**

```tsx
import { MonacoEditor } from './monaco-editor'

function CodePanel({ code }: { code: string }) {
  return <MonacoEditor value={code} />
}
```

**Correct in this repo (`React.lazy`):**

```tsx
import { lazy, Suspense } from 'react'

const MonacoEditor = lazy(() =>
  import('./monaco-editor').then((m) => ({ default: m.MonacoEditor })),
)

function CodePanel({ code }: { code: string }) {
  return (
    <Suspense fallback={null}>
      <MonacoEditor value={code} />
    </Suspense>
  )
}
```

<details>
<summary>Upstream Next.js example (do not copy in this repo)</summary>

```tsx
import dynamic from 'next/dynamic'

const MonacoEditor = dynamic(
  () => import('./monaco-editor').then(m => m.MonacoEditor),
  { ssr: false }
)
```

</details>
