import * as stylex from '@stylexjs/stylex'
import { clsx, type ClassValue } from 'clsx'

type StyleXArg = Parameters<typeof stylex.props>[0]

type SxInput = StyleXArg | ClassValue | false | null | undefined

/** A clsx `{ name: boolean }` map. Compiled StyleX objects carry `$$css` (an empty style is only `{ $$css: true }`). */
function isClassDictionary(value: object): value is Record<string, boolean> {
  if ('$$css' in value) return false
  const values = Object.values(value)
  return values.length > 0 && values.every((entry) => typeof entry === 'boolean')
}

/** Sorts each leaf, arrays flattened in order, so `[a.btn, 'cls']` styles like `a.btn, 'cls'`. */
function collect(arg: unknown, styles: StyleXArg[], classes: ClassValue[]) {
  if (arg === false || arg === null || arg === undefined) return
  if (Array.isArray(arg)) {
    for (const entry of arg) collect(entry, styles, classes)
  } else if (typeof arg === 'object' && !isClassDictionary(arg)) {
    styles.push(arg as StyleXArg)
  } else {
    classes.push(arg as ClassValue)
  }
}

/** Merge StyleX styles with optional semantic CSS class names from index.css. */
export function sx(...args: SxInput[]) {
  const styles: StyleXArg[] = []
  const classes: ClassValue[] = []
  for (const arg of args) collect(arg, styles, classes)

  const props = stylex.props(...styles)
  const className = clsx(props.className, ...classes)
  return className ? { ...props, className } : props
}

export { stylex }
