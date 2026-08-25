import * as stylex from '@stylexjs/stylex'

/** StyleX style objects, semantic class strings, or conditional args. */
type SxInput = object | string | false | null | undefined

/** Merge StyleX styles with optional semantic CSS class strings. */
export function sx(...inputs: SxInput[]) {
  const styles: object[] = []
  const classNames: string[] = []

  for (const input of inputs) {
    if (!input) continue
    if (typeof input === 'string') {
      classNames.push(input)
    } else {
      styles.push(input)
    }
  }

  const stylexProps =
    styles.length > 0
      ? (stylex.props as (...args: object[]) => ReturnType<typeof stylex.props>)(...styles)
      : ({} as ReturnType<typeof stylex.props>)
  const mergedClassName = [stylexProps.className, ...classNames].filter(Boolean).join(' ')

  return {
    ...stylexProps,
    ...(mergedClassName ? { className: mergedClassName } : {}),
  }
}

export { stylex }
