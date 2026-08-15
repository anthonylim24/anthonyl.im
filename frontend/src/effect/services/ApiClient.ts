import { Effect } from "effect"
import { fetchApi, parseJson, readAuthToken, readErrorMessage, requestJson, requireOk, type GetToken } from "../http"
import { readSse } from "../sse"
import type { SseReadOptions } from "../../lib/sseStream"

export class ApiClient extends Effect.Service<ApiClient>()("app/ApiClient", {
  accessors: true,
  effect: Effect.succeed({
    fetch: Effect.fn("ApiClient.fetch")(function* (path: string, init?: RequestInit) {
      return yield* fetchApi(path, init)
    }),
    requestJson: Effect.fn("ApiClient.requestJson")(function* <T>(
      getToken: GetToken,
      path: string,
      init: RequestInit = {},
    ) {
      return yield* requestJson<T>(getToken, path, init)
    }),
    requireOk: Effect.fn("ApiClient.requireOk")(function* (res: Response) {
      return yield* requireOk(res)
    }),
    parseJson: Effect.fn("ApiClient.parseJson")(function* <T>(res: Response) {
      return yield* parseJson<T>(res)
    }),
    readErrorMessage: Effect.fn("ApiClient.readErrorMessage")(function* (res: Response) {
      return yield* readErrorMessage(res)
    }),
    readAuthToken: Effect.fn("ApiClient.readAuthToken")(function* (getToken: GetToken) {
      return yield* readAuthToken(getToken)
    }),
    readSse: Effect.fn("ApiClient.readSse")(function* (
      body: ReadableStream<Uint8Array> | null,
      opts: SseReadOptions,
    ) {
      return yield* readSse(body, opts)
    }),
  }),
}) {}
