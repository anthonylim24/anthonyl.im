import { Cause, Effect, Exit, Layer, ManagedRuntime, Option } from "effect"
import { ApiClient } from "./services/ApiClient"

/** Unwrap Effect failures as the original tagged / native Error so existing
 *  `instanceof Error` and `.message` checks (tests + UI) keep working.
 *  `Effect.runPromise` would otherwise reject with `FiberFailure`. */
export async function runPromise<A, E>(effect: Effect.Effect<A, E>): Promise<A> {
  const exit = await Effect.runPromiseExit(effect)
  if (Exit.isSuccess(exit)) return exit.value
  const failure = Cause.failureOption(exit.cause)
  if (Option.isSome(failure)) {
    const err = failure.value
    throw err instanceof Error ? err : new Error(String(err))
  }
  throw Cause.squash(exit.cause)
}

export const AppLayer = ApiClient.Default

export const AppRuntime = ManagedRuntime.make(AppLayer)

export function runApp<A, E>(effect: Effect.Effect<A, E, ApiClient>): Promise<A> {
  return runPromise(effect.pipe(Effect.provide(AppLayer)) as Effect.Effect<A, E>)
}

export function provideApp<A, E, R>(
  effect: Effect.Effect<A, E, R | ApiClient>,
): Effect.Effect<A, E, Exclude<R, ApiClient>> {
  return effect.pipe(Effect.provide(AppLayer)) as Effect.Effect<A, E, Exclude<R, ApiClient>>
}

export { Layer }
