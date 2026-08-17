import { ORIGIN_API_BASE, type OriginClientOptions } from "./types";

export class OriginApiError extends Error {
  readonly status: number;
  readonly body: string;

  constructor(status: number, body: string, path: string) {
    super(`Origin API ${status} ${path}: ${body}`);
    this.name = "OriginApiError";
    this.status = status;
    this.body = body;
  }
}

export function createOriginClient(opts: OriginClientOptions) {
  const baseUrl = (opts.baseUrl ?? ORIGIN_API_BASE).replace(/\/$/, "");
  const doFetch = opts.fetch ?? fetch;

  async function request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const res = await doFetch(`${baseUrl}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${opts.token}`,
        accept: "application/json",
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) {
      throw new OriginApiError(res.status, text, path);
    }
    if (!text) {
      return undefined as T;
    }
    return JSON.parse(text) as T;
  }

  return {
    request,
    get: <T>(path: string) => request<T>("GET", path),
    post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
    patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, body),
  };
}

export type OriginClient = ReturnType<typeof createOriginClient>;

export function repoPath(owner: string, repo: string): string {
  return `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
}
