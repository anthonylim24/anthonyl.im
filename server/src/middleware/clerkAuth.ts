import type { MiddlewareHandler } from 'hono';
import { createPublicKey } from 'node:crypto';
import { verifyToken as clerkVerify } from '@clerk/backend';
import { decodeJwt } from '@clerk/backend/jwt';
import { secretsEqual } from '../agentTasks';

type SigningKey = JsonWebKey & { kid: string };

async function fetchClerkJwks(secretKey: string): Promise<SigningKey[]> {
  const res = await fetch('https://api.clerk.com/v1/jwks', {
    headers: { Authorization: `Bearer ${secretKey}` },
    signal: AbortSignal.timeout(5_000),
  });
  if (!res.ok) throw new Error(`Clerk JWKS answered ${res.status}`);
  return ((await res.json()) as { keys: SigningKey[] }).keys;
}

// @clerk/backend empties its key cache every 5 minutes when it verifies with
// secretKey, and the next request waits on api.clerk.com. Here keys refresh in
// the background instead, so a request waits only for a key id not seen yet.
export function createClerkVerifier(
  fetchJwks: () => Promise<SigningKey[]>,
  { missCooldownMs = 10_000, refreshAfterMs = 5 * 60_000 }: { missCooldownMs?: number; refreshAfterMs?: number } = {},
) {
  let pems = new Map<string, string>();
  let fetchedAt = -Infinity;
  let fetching: Promise<void> | null = null;

  function refresh(): Promise<void> {
    fetching ??= fetchJwks()
      .then((keys) => {
        pems = new Map(keys.map((key) => [
          key.kid,
          createPublicKey({ key, format: 'jwk' }).export({ type: 'spki', format: 'pem' }) as string,
        ]));
        fetchedAt = Date.now();
      })
      .finally(() => { fetching = null; });
    return fetching;
  }

  async function pemFor(kid: string): Promise<string> {
    const age = Date.now() - fetchedAt;
    if (pems.has(kid)) {
      if (age >= refreshAfterMs) refresh().catch((err) => console.warn('[auth] Clerk key refresh failed:', err instanceof Error ? err.message : err));
    } else if (age >= missCooldownMs) {
      await refresh();
    }
    const pem = pems.get(kid);
    if (!pem) throw new Error(`no Clerk signing key with id ${kid}`);
    return pem;
  }

  return async (token: string): Promise<{ sub: string }> => {
    const { kid } = decodeJwt(token).header;
    const payload = await clerkVerify(token, { jwtKey: await pemFor(kid) });
    return { sub: payload.sub };
  };
}

const verifiers = new Map<string, (token: string) => Promise<{ sub: string }>>();

function clerkVerifierFor(secretKey: string | undefined) {
  if (!secretKey) return async (): Promise<{ sub: string }> => { throw new Error('CLERK_SECRET_KEY is not set'); };
  let verify = verifiers.get(secretKey);
  if (!verify) verifiers.set(secretKey, (verify = createClerkVerifier(() => fetchClerkJwks(secretKey))));
  return verify;
}

export interface ClerkAuthDeps {
  verifyToken?: (token: string) => Promise<{ sub: string }>;
  secretKey?: string;
  // If set, a request bearing exactly one of these strings is accepted.
  // Accepts an array so local dev can honor both the server's explicit
  // IG_DEV_BEARER and the frontend build's VITE_DEV_BEARER when they differ.
  devBearer?: string | string[];
  devUserId?: string;       // userId to set when devBearer matches; defaults to 'dev-user'
}

function matchesDevBearer(token: string, devBearer: string | string[] | undefined): boolean {
  if (!devBearer) return false;
  // Constant-time, and every candidate is compared, so timing reveals neither
  // the bearer nor which of several matched.
  const candidates = Array.isArray(devBearer) ? devBearer : [devBearer];
  return candidates.reduce((matched, candidate) => secretsEqual(candidate, token) || matched, false);
}

export function createClerkAuth(deps: ClerkAuthDeps = {}): MiddlewareHandler {
  const verify = deps.verifyToken ?? clerkVerifierFor(deps.secretKey);
  return async (c, next) => {
    const header = c.req.header('Authorization');
    if (!header?.startsWith('Bearer ')) {
      return c.json({ error: 'missing or malformed Authorization header' }, 401);
    }
    const token = header.slice('Bearer '.length).trim();
    if (matchesDevBearer(token, deps.devBearer)) {
      c.set('userId' as never, (deps.devUserId ?? 'dev-user') as never);
      await next();
      return;
    }
    try {
      const { sub } = await verify(token);
      c.set('userId' as never, sub as never);
      await next();
    } catch {
      return c.json({ error: 'invalid token' }, 401);
    }
  };
}

/**
 * Optional auth helper: verifies a Bearer token when present but does NOT
 * reject the request when missing. Returns the userId (sub) or null.
 *
 * Used by routes that serve public data but can augment the response with
 * user-specific data when the caller is authenticated (e.g. Korea day places
 * route that appends IG-assigned saves when a valid JWT is supplied).
 */
export async function verifyClerkOptional(
  authHeader: string | undefined,
  deps: ClerkAuthDeps = {},
): Promise<string | null> {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) return null;
  if (matchesDevBearer(token, deps.devBearer)) {
    return deps.devUserId ?? 'dev-user';
  }
  try {
    const verify = deps.verifyToken ?? clerkVerifierFor(deps.secretKey);
    const { sub } = await verify(token);
    return sub;
  } catch {
    return null;
  }
}
