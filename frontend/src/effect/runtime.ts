import { Cause, Effect, Exit, Option } from "effect"

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
