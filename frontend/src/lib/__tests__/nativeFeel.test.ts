import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import indexCss from '../../index.css?raw'
import { THEME_COLOR_DARK, THEME_COLOR_LIGHT } from '../themeColor'

const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8')

describe('native mobile feel', () => {
  it('gates hover styles to fine pointers so tap does not stick :hover', () => {
    expect(indexCss).toContain('@custom-variant hover')
    expect(indexCss).toContain('@media (hover: hover) and (pointer: fine)')
  })

  it('kills the gray/blue tap flash and long-press text select on controls', () => {
    expect(indexCss).toContain('-webkit-tap-highlight-color: transparent')
    expect(indexCss).toMatch(/button[\s\S]*?user-select:\s*none/)
    expect(indexCss).toContain('-webkit-touch-callout: none')
  })

  it('removes double-tap zoom delay and gives pointer-down feedback', () => {
    expect(indexCss).toContain('touch-action: manipulation')
    expect(indexCss).toContain(':active')
  })

  it('blocks pull-to-refresh hijacking the document', () => {
    expect(indexCss).toMatch(/html \{[\s\S]*?overscroll-behavior:\s*none/)
    expect(indexCss).toMatch(/body \{[\s\S]*?overscroll-behavior:\s*none/)
  })

  it('keeps horizontal carousels on the x axis', () => {
    expect(indexCss).toMatch(/\.scroll-snap-x \{[\s\S]*?touch-action:\s*pan-x/)
  })

  it('floors input font size at 16px so iOS does not zoom on focus', () => {
    expect(indexCss).toContain('font-size: 16px !important')
  })

  it('publishes theme-color per color scheme before hydration', () => {
    expect(html).toContain(`media="(prefers-color-scheme: light)" content="${THEME_COLOR_LIGHT}"`)
    expect(html).toContain(`media="(prefers-color-scheme: dark)" content="${THEME_COLOR_DARK}"`)
    expect(html).toContain('viewport-fit=cover')
  })
})
