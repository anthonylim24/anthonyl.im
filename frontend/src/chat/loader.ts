/**
 * The loading screen over Lim's page as a pure state machine. The stage reports how far its live
 * scene has come (`StageLoad`), and the visitor may choose to chat first. The screen shows once per
 * page visit: nothing leaves `gone`, so a graphics change loading the scene again never brings it back.
 */
import type { StageLoad } from './LimStage'

export type LoadStep = Extract<StageLoad, { kind: 'loading' }>['step']

export type LoaderState =
  /** Over the page while the stage comes up. `since`: when it went up, in ms. */
  | { phase: 'loading'; step: LoadStep; done: number; since: number }
  /** The visitor chose the chat; the stage keeps loading behind the drawing. */
  | { phase: 'chat-first'; step: LoadStep; done: number }
  /** The stage is ready and the screen is on its way out. `quick` when the load was too short to make a show of. */
  | { phase: 'leaving'; quick: boolean }
  /** For the rest of the visit. `late`: the stage arrived after the visitor chose to chat first. */
  | { phase: 'gone'; late: boolean }

export type LoaderEvent =
  | { type: 'progress'; step: LoadStep; done: number }
  | { type: 'ready'; at: number }
  | { type: 'failed' }
  | { type: 'skip' }
  /** The exit has played. */
  | { type: 'exited' }

/** A stage ready sooner than this gets a quick fade rather than the whole exit. */
export const QUICK_MS = 700

/**
 * The scene's download and GPU start have no deadline of their own, and a stalled one would hold the
 * screen for good. Past this the screen lets the visitor into the chat, as "Chat first" does, and Lim
 * arrives behind the drawing when it can.
 */
export const LOAD_DEADLINE_MS = 12_000

/** `seen`: the screen has already been and gone during this visit. */
export const initialLoader = (now: number, seen: boolean): LoaderState =>
  seen ? { phase: 'gone', late: false } : { phase: 'loading', step: 'code', done: 0, since: now }

export const loaderEvent = (load: StageLoad, at: number): LoaderEvent =>
  load.kind === 'loading' ? { type: 'progress', step: load.step, done: load.done } : load.kind === 'ready' ? { type: 'ready', at } : { type: 'failed' }

/** The screen holds the page: the chat behind it is out of reach. */
export const blocking = (state: LoaderState) => state.phase === 'loading'

/**
 * Lim may make its entrance. That starts with the exit, so Lim is mid-hop as the sheet uncovers the
 * stage rather than waiting there in its still frame.
 */
export const revealed = (state: LoaderState) => state.phase !== 'loading'

export function loaderReducer(state: LoaderState, event: LoaderEvent): LoaderState {
  switch (state.phase) {
    case 'loading':
    case 'chat-first': {
      if (event.type === 'progress') {
        // A rebuild starts its count again; the bar never runs backwards.
        const done = Math.max(state.done, event.done)
        return done === state.done && event.step === state.step ? state : { ...state, step: event.step, done }
      }
      if (event.type === 'failed') return { phase: 'gone', late: false }
      if (state.phase === 'chat-first') return event.type === 'ready' ? { phase: 'gone', late: true } : state
      if (event.type === 'ready') return { phase: 'leaving', quick: event.at - state.since < QUICK_MS }
      if (event.type === 'skip') return { phase: 'chat-first', step: state.step, done: state.done }
      return state
    }
    case 'leaving':
      return event.type === 'exited' || event.type === 'skip' ? { phase: 'gone', late: false } : state
    case 'gone':
      return state
  }
}
