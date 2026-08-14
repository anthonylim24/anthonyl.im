/** Normalize whatever Gemini streamed into markdown the renderer can parse.
 *
 *  Flash models wrap answers in ```markdown fences, leak <think> blocks,
 *  emit a handful of HTML tags, and use unicode bullets. Strip / rewrite
 *  those so remark-gfm sees ordinary CommonMark + GFM. */

const COMPLETE_FENCE = /^```(?:markdown|md|gfm|text)?[ \t]*\n([\s\S]*?)\n```[ \t]*$/i
const OPEN_FENCE = /^```(?:markdown|md|gfm|text)?[ \t]*\n([\s\S]*)$/i
const THINK_BLOCK = /<think\b[^>]*>[\s\S]*?<\/think>/gi
const HTML_BREAK = /<br\s*\/?>/gi
const HTML_P_JOIN = /<\/p>\s*<p\b[^>]*>/gi
const HTML_P = /<\/?p\b[^>]*>/gi
const HTML_STRONG = /<\/?(?:strong|b)>/gi
const HTML_EM = /<\/?(?:em|i)>/gi
const HTML_HR = /<hr\s*\/?>/gi
const HTML_ANCHOR = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi
const HTML_NOISE = /<\/?(?:span|div|u|small|font)\b[^>]*>/gi
const UNICODE_BULLET = /^(\s*)(?:[•‣∙·○●▪▫–—])(\s+)/gm

export function normalizeGeminiMarkdown(raw: string): string {
  let text = raw.replace(/\r\n/g, "\n")
  text = text.replace(THINK_BLOCK, "")

  const trimmed = text.trim()
  const complete = trimmed.match(COMPLETE_FENCE)
  if (complete) {
    text = complete[1] ?? text
  } else {
    const open = trimmed.match(OPEN_FENCE)
    if (open) text = open[1] ?? text
  }

  text = text
    .replace(HTML_ANCHOR, "[$2]($1)")
    .replace(HTML_BREAK, "\n")
    .replace(HTML_P_JOIN, "\n\n")
    .replace(HTML_P, "\n")
    .replace(HTML_STRONG, "**")
    .replace(HTML_EM, "*")
    .replace(HTML_HR, "\n\n---\n\n")
    .replace(HTML_NOISE, "")
    .replace(UNICODE_BULLET, "$1- ")

  return text
}
