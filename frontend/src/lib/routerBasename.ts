/** React Router basename derived from Vite's `base` (always trailing-slash). */
export function routerBasename(baseUrl: string = import.meta.env.BASE_URL): string | undefined {
  const trimmed = baseUrl.replace(/\/+$/, "")
  return trimmed === "" ? undefined : trimmed
}

/** Prefix a root-absolute asset path with the Vite base (no-op in production). */
export function withViteBase(path: string, baseUrl: string = import.meta.env.BASE_URL): string {
  if (!path.startsWith("/")) return path
  const base = routerBasename(baseUrl) ?? ""
  return `${base}${path}`
}

