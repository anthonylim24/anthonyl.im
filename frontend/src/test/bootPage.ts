import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

export const indexHtml = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8')

const style = [...indexHtml.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((m) => m[1]!).find((css) => css.includes('.boot {'))
const templates = [...indexHtml.matchAll(/<template id="boot-\w+"[\s\S]*?<\/template>/g)].map((m) => m[0]).join('')
const script = indexHtml.match(/<script data-boot>([\s\S]*?)<\/script>/)?.[1]

/** How long index.html's quick exit animation runs. */
export const quickExitMs = Number(style?.match(/\[data-exit="quick"\]\s*\{\s*animation:\s*boot-out (\d+)ms/)?.[1])

const STORAGE_KEYS = ['korea-theme', 'breathwork-settings', 'lim-chat-night', 'trips-boot-accent']

export function paintBoot(path: string): HTMLElement {
  if (!style || !templates || !script) throw new Error('index.html no longer ships the boot screen')
  window.history.replaceState(null, '', path)
  const css = document.createElement('style')
  css.dataset.bootTest = ''
  css.textContent = style
  document.head.append(css)
  document.body.insertAdjacentHTML('beforeend', `${templates}<div id="root"></div>`)
  new Function(script)()
  const boot = document.getElementById('boot')
  if (!boot) throw new Error(`no boot screen painted at ${path}`)
  return boot
}

export function clearBoot() {
  document.querySelectorAll('#boot, #root, template[id^="boot-"], style[data-boot-test]').forEach((node) => node.remove())
  delete window.__bootMount
  delete (window as { __bootWorld?: string }).__bootWorld
  for (const key of STORAGE_KEYS) localStorage.removeItem(key)
  window.history.replaceState(null, '', '/')
}
