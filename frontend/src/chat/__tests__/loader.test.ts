import { describe, expect, it } from 'vitest'
import { QUICK_MS, blocking, initialLoader, loaderEvent, loaderReducer, revealed, type LoaderEvent, type LoaderState } from '../loader'

const run = (events: LoaderEvent[], from: LoaderState = initialLoader(1000, false)) => events.reduce(loaderReducer, from)
const progress = (step: Extract<LoaderEvent, { type: 'progress' }>['step'], done: number): LoaderEvent => ({ type: 'progress', step, done })
const SLOW = 1000 + QUICK_MS + 2000

describe('Lim loading screen', () => {
  it('holds the page and keeps Lim off-stage from the first render', () => {
    const start = initialLoader(1000, false)
    expect(start).toMatchObject({ phase: 'loading', step: 'code', done: 0 })
    expect(blocking(start)).toBe(true)
    expect(revealed(start)).toBe(false)
  })

  it('follows the stage step by step, and its bar never runs backwards', () => {
    const later = run([progress('gpu', 0.15), progress('toys', 0.45), progress('light', 0.57)])
    expect(later).toMatchObject({ phase: 'loading', step: 'light', done: 0.57 })
    // A rebuild starts its count again from the code.
    expect(run([progress('code', 0)], later)).toMatchObject({ step: 'code', done: 0.57 })
  })

  it('plays the whole exit after a long load, with Lim entering as it goes', () => {
    const leaving = run([progress('warm', 1), { type: 'ready', at: SLOW }])
    expect(leaving).toEqual({ phase: 'leaving', quick: false })
    expect(blocking(leaving)).toBe(false)
    expect(revealed(leaving)).toBe(true)
    expect(run([progress('warm', 1)], leaving)).toBe(leaving)
    const gone = run([{ type: 'exited' }], leaving)
    expect(gone).toEqual({ phase: 'gone', late: false })
    expect(revealed(gone)).toBe(true)
  })

  it('leaves quickly when the stage was ready too soon to make a show of it', () => {
    expect(run([{ type: 'ready', at: 1000 + QUICK_MS - 1 }])).toEqual({ phase: 'leaving', quick: true })
    expect(run([{ type: 'ready', at: 1000 + QUICK_MS }])).toEqual({ phase: 'leaving', quick: false })
  })

  it('goes straight to the chat when the stage cannot load', () => {
    const gone = run([progress('gpu', 0.15), { type: 'failed' }])
    expect(gone).toEqual({ phase: 'gone', late: false })
    expect(blocking(gone)).toBe(false)
  })

  it('shows the chat at once on chat first, and keeps loading behind it', () => {
    const chatting = run([progress('toys', 0.45), { type: 'skip' }])
    expect(chatting).toEqual({ phase: 'chat-first', step: 'toys', done: 0.45 })
    expect(blocking(chatting)).toBe(false)
    expect(revealed(chatting)).toBe(true)
    expect(run([progress('warm', 0.8)], chatting)).toEqual({ phase: 'chat-first', step: 'warm', done: 0.8 })
    expect(run([{ type: 'skip' }], chatting)).toBe(chatting)
  })

  it('marks the stage arriving after chat first, but not a stage that never comes', () => {
    const chatting = run([{ type: 'skip' }])
    expect(run([{ type: 'ready', at: SLOW }], chatting)).toEqual({ phase: 'gone', late: true })
    expect(run([{ type: 'failed' }], chatting)).toEqual({ phase: 'gone', late: false })
  })

  it('cuts the exit short on chat first', () => {
    expect(run([{ type: 'ready', at: SLOW }, { type: 'skip' }])).toEqual({ phase: 'gone', late: false })
  })

  it('never comes back once gone, whatever the stage does next', () => {
    const gone = run([{ type: 'ready', at: SLOW }, { type: 'exited' }])
    const rebuild: LoaderEvent[] = [progress('code', 0), progress('gpu', 0.15), { type: 'ready', at: SLOW + 9000 }, { type: 'failed' }, { type: 'skip' }, { type: 'exited' }]
    expect(run(rebuild, gone)).toBe(gone)
  })

  it('is not shown again on a later visit to the page in the same session', () => {
    const again = initialLoader(1000, true)
    expect(again).toEqual({ phase: 'gone', late: false })
    expect(revealed(again)).toBe(true)
    expect(run([progress('code', 0)], again)).toBe(again)
  })

  it("reads the stage's reports", () => {
    expect(loaderEvent({ kind: 'loading', step: 'light', done: 0.6 }, 5)).toEqual({ type: 'progress', step: 'light', done: 0.6 })
    expect(loaderEvent({ kind: 'ready' }, 5)).toEqual({ type: 'ready', at: 5 })
    expect(loaderEvent({ kind: 'failed' }, 5)).toEqual({ type: 'failed' })
  })
})
