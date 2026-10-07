import { describe, expect, it } from 'vitest'
import indexCss from '../../index.css?raw'
import appSource from '../../App.tsx?raw'
import chatbotStyles from '../../styles/chatbot.stylex.ts?raw'
import stageSource from '../../chat/LimStage.tsx?raw'

describe('mobile overflow guardrails', () => {
  it('keeps the document free of nested scrollports and fixed containing blocks on #root', () => {
    expect(indexCss).toMatch(/#root\s*\{[\s\S]*?min-height:\s*0/)
    expect(indexCss).not.toMatch(/#root\s*\{[\s\S]*?overflow-x:\s*clip/)
    expect(indexCss).not.toMatch(/html,\s*body\s*\{[\s\S]*?min-height:\s*100dvh/)
  })

  it('lets the document grow instead of pinning html/body/#root to 100%', () => {
    expect(indexCss).toMatch(/html,\s*body\s*\{[\s\S]*?height:\s*auto/)
    expect(indexCss).toMatch(/#root\s*\{[\s\S]*?height:\s*auto/)
  })

  it('keeps the chatbot viewport pin on App shell styles, not on #root', () => {
    expect(chatbotStyles).toMatch(/height:\s*['"]100dvh['"]/)
    expect(chatbotStyles).toMatch(/minHeight:\s*['"]100svh['"]/)
    expect(chatbotStyles).toMatch(/overflow:\s*['"]hidden['"]/)
    expect(appSource).toContain('chatbot.root')
    const rootBlock = indexCss.match(/#root \{[^}]+\}/)?.[0] ?? ''
    expect(rootBlock).toContain('height: auto')
    expect(rootBlock).not.toContain('overflow')
  })

  it('freezes Lim under reduced motion instead of looping the jelly', () => {
    expect(stageSource).toContain('useReducedMotion()')
    expect(stageSource).toMatch(/createLimScene\(\{[\s\S]*?reducedMotion,/)
    expect(chatbotStyles).toMatch(/animationPlayState:\s*\{\s*default:\s*'running',\s*\[RM\]:\s*'paused'/)
  })
})
