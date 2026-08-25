import * as stylex from '@stylexjs/stylex'
<<<<<<< HEAD

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

  const stylexProps = styles.length > 0 ? stylex.props(...(styles as Parameters<typeof stylex.props>)) : {}
  const mergedClassName = [stylexProps.className, ...classNames].filter(Boolean).join(' ')

  return {
    ...stylexProps,
    ...(mergedClassName ? { className: mergedClassName } : {}),
  }
=======
import { clsx, type ClassValue } from 'clsx'

type StyleXArg = Parameters<typeof stylex.props>[0]

type SxInput = StyleXArg | ClassValue | false | null | undefined

function isClassDictionary(value: object): value is Record<string, boolean> {
  const values = Object.values(value)
  return values.length > 0 && values.every((entry) => typeof entry === 'boolean')
}

function isClassValue(arg: SxInput): arg is ClassValue {
  if (arg === false || arg === null || arg === undefined) return false
  if (typeof arg === 'string' || typeof arg === 'number' || typeof arg === 'boolean') return true
  if (Array.isArray(arg)) return true
  return typeof arg === 'object' && isClassDictionary(arg)
}

/** Merge StyleX styles with optional semantic CSS class names from index.css. */
export function sx(...args: SxInput[]) {
  const styles: StyleXArg[] = []
  const classes: ClassValue[] = []

  for (const arg of args) {
    if (arg === false || arg === null || arg === undefined) continue
    if (isClassValue(arg)) {
      classes.push(arg)
    } else {
      styles.push(arg)
    }
  }

  const props = stylex.props(...styles)
  const className = clsx(props.className, ...classes)
  return className ? { ...props, className } : props
>>>>>>> origin/cursor/tailwind-to-stylex-chatbot-2aeb
}

export { stylex }
