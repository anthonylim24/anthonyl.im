// Model output is sometimes cut off mid-answer (an output-token cap, a
// dropped connection). A plan with nine good days and half of a tenth is
// still nine good days: close what was left open and keep everything that
// arrived whole.

/**
 * Close a truncated JSON document after its last complete object or array.
 * Returns null when there is nothing recoverable (no opening bracket, or
 * nothing complete inside it). Text that is already complete comes back
 * trimmed to its outermost value.
 */
export function repairTruncatedJson(text: string): string | null {
  const start = text.search(/[{[]/)
  if (start < 0) return null

  const stack: string[] = []
  let inString = false
  let escaped = false
  // The last point where a nested value had just closed, and what was
  // still open around it.
  let safe: { end: number; open: string[] } | null = null

  for (let i = start; i < text.length; i++) {
    const ch = text[i]!
    if (inString) {
      if (escaped) escaped = false
      else if (ch === "\\") escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') inString = true
    else if (ch === "{") stack.push("}")
    else if (ch === "[") stack.push("]")
    else if (ch === "}" || ch === "]") {
      if (stack[stack.length - 1] !== ch) break // malformed: stop at the last safe point
      stack.pop()
      if (stack.length === 0) return text.slice(start, i + 1)
      safe = { end: i + 1, open: [...stack] }
    }
  }

  if (!safe) return null
  const kept = text.slice(start, safe.end).replace(/[\s,]+$/, "")
  return kept + safe.open.reverse().join("")
}
