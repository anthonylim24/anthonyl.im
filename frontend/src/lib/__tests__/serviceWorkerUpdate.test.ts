import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  IDLE_RELOAD_MS,
  INITIAL_UPDATE_STATE,
  createUpdateController,
  hasDraft,
  isBusyRoute,
  isSafeToReload,
  registerServiceWorker,
  setReloadBlocked,
  updateStep,
  type ReloadContext,
  type UpdateEvent,
  type UpdateState,
} from '../serviceWorker'

function run(events: UpdateEvent[], from: UpdateState = INITIAL_UPDATE_STATE) {
  const effects: string[] = []
  let state = from
  for (const event of events) {
    const [next, effect] = updateStep(state, event)
    state = next
    if (effect !== 'none') effects.push(effect)
  }
  return { state, effects }
}

describe('updateStep', () => {
  it('does not reload when the first install claims the page', () => {
    expect(run([{ type: 'REGISTERED', hadController: false }, { type: 'UPDATE_INSTALLED' }, { type: 'CONTROLLER_CHANGED' }]))
      .toEqual({ state: { phase: 'controlled' }, effects: ['skipWaiting'] })
  })

  it('waits for a safe moment, then skips waiting and reloads on the controller change', () => {
    const ready = run([{ type: 'REGISTERED', hadController: true }, { type: 'UPDATE_INSTALLED' }])
    expect(ready).toEqual({ state: { phase: 'updateReady', waiting: true }, effects: [] })

    expect(run([{ type: 'SAFE_TO_RELOAD' }, { type: 'CONTROLLER_CHANGED' }, { type: 'CONTROLLER_CHANGED' }], ready.state))
      .toEqual({ state: { phase: 'reloading', awaitingController: false }, effects: ['skipWaiting', 'reload'] })
  })

  it('treats a controller change from another tab as an update still to reload into', () => {
    const changed = run([{ type: 'REGISTERED', hadController: true }, { type: 'CONTROLLER_CHANGED' }])
    expect(changed).toEqual({ state: { phase: 'updateReady', waiting: false }, effects: [] })
    expect(run([{ type: 'SAFE_TO_RELOAD' }], changed.state).effects).toEqual(['reload'])
  })

  it('asks a newer waiting worker to skip waiting while it waits for control', () => {
    expect(run([{ type: 'UPDATE_INSTALLED' }], { phase: 'reloading', awaitingController: true }).effects).toEqual([
      'skipWaiting',
    ])
  })

  it('ignores SAFE_TO_RELOAD when no update is ready', () => {
    expect(run([{ type: 'REGISTERED', hadController: true }, { type: 'SAFE_TO_RELOAD' }]))
      .toEqual({ state: { phase: 'controlled' }, effects: [] })
  })
})

const calm: ReloadContext = { blocked: false, navigated: false, hidden: false, idleMs: 0, draft: false, busyRoute: false }

describe('isSafeToReload', () => {
  it('reloads on a route change, a hidden tab, or a minute untouched', () => {
    expect(isSafeToReload(calm)).toBe(false)
    expect(isSafeToReload({ ...calm, navigated: true })).toBe(true)
    expect(isSafeToReload({ ...calm, hidden: true })).toBe(true)
    expect(isSafeToReload({ ...calm, idleMs: IDLE_RELOAD_MS })).toBe(true)
  })

  it('never reloads over a draft, a breath session, or an app block', () => {
    expect(isSafeToReload({ ...calm, hidden: true, draft: true })).toBe(false)
    expect(isSafeToReload({ ...calm, idleMs: IDLE_RELOAD_MS * 5, busyRoute: true })).toBe(false)
    expect(isSafeToReload({ ...calm, navigated: true, blocked: true })).toBe(false)
  })
})

describe('isBusyRoute', () => {
  it('marks the breath session, preview prefix or not', () => {
    expect(isBusyRoute('/breathwork/session')).toBe(true)
    expect(isBusyRoute('/preview/pr/7/breathwork/session')).toBe(true)
    expect(isBusyRoute('/breathwork')).toBe(false)
  })
})

describe('hasDraft', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('sees a focused field, or text left in one', () => {
    document.body.innerHTML = '<input id="q" type="search" /><textarea id="t"></textarea><input type="checkbox" />'
    expect(hasDraft(document)).toBe(false)
    ;(document.getElementById('q') as HTMLInputElement).focus()
    expect(hasDraft(document)).toBe(true)
    ;(document.activeElement as HTMLElement).blur()
    ;(document.getElementById('t') as HTMLTextAreaElement).value = 'half a question'
    expect(hasDraft(document)).toBe(true)
  })

  it('ignores read-only and disabled fields', () => {
    document.body.innerHTML = '<input readonly value="x" /><textarea disabled>y</textarea>'
    expect(hasDraft(document)).toBe(false)
  })
})

describe('createUpdateController', () => {
  function controller(context: Partial<ReloadContext> = {}) {
    const deps = {
      postSkipWaiting: vi.fn(),
      reload: vi.fn(),
      readContext: vi.fn(() => ({ hidden: false, idleMs: 0, draft: false, busyRoute: false, ...context })),
      onUpdateReady: vi.fn(),
    }
    return { deps, updater: createUpdateController(deps) }
  }

  it('starts watching once and holds the update while the page is busy', () => {
    const { deps, updater } = controller()
    updater.dispatch({ type: 'REGISTERED', hadController: true })
    updater.dispatch({ type: 'UPDATE_INSTALLED' })
    updater.dispatch({ type: 'UPDATE_INSTALLED' })
    expect(deps.onUpdateReady).toHaveBeenCalledTimes(1)
    expect(deps.postSkipWaiting).not.toHaveBeenCalled()

    updater.check(true)
    expect(deps.postSkipWaiting).toHaveBeenCalledTimes(1)
    updater.dispatch({ type: 'CONTROLLER_CHANGED' })
    expect(deps.reload).toHaveBeenCalledTimes(1)
  })

  it('acts at once when the update lands in a hidden tab', () => {
    const { deps, updater } = controller({ hidden: true })
    updater.dispatch({ type: 'REGISTERED', hadController: true })
    updater.dispatch({ type: 'UPDATE_INSTALLED' })
    expect(deps.postSkipWaiting).toHaveBeenCalledTimes(1)
  })

  it('waits for setReloadBlocked to be released', () => {
    const { deps, updater } = controller({ hidden: true })
    setReloadBlocked('test-stream', true)
    try {
      updater.dispatch({ type: 'REGISTERED', hadController: true })
      updater.dispatch({ type: 'CONTROLLER_CHANGED' })
      updater.check(true)
      expect(deps.reload).not.toHaveBeenCalled()
    } finally {
      setReloadBlocked('test-stream', false)
    }
    updater.check(false)
    expect(deps.reload).toHaveBeenCalledTimes(1)
  })
})

describe('registerServiceWorker update flow', () => {
  function setup(controller: object | null) {
    const listeners: Record<string, EventListener> = {}
    const reload = vi.fn()
    const container = {
      controller,
      register: vi.fn(),
      addEventListener: vi.fn((type: string, fn: EventListener) => {
        listeners[type] = fn
      }),
    } as unknown as ServiceWorkerContainer
    registerServiceWorker(
      { PROD: true },
      { serviceWorker: container },
      { addEventListener: vi.fn() as unknown as Window['addEventListener'], location: { reload, pathname: '/' } },
    )
    return { fire: () => listeners.controllerchange?.(new Event('controllerchange')), reload }
  }

  it('does not reload on the first install claiming an uncontrolled page', () => {
    const { fire, reload } = setup(null)
    fire()
    expect(reload).not.toHaveBeenCalled()
  })

  it('does not reload a controlled page the moment another tab activates an update', () => {
    const { fire, reload } = setup({})
    fire()
    expect(reload).not.toHaveBeenCalled()
  })
})
