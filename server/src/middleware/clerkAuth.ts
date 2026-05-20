import type { MiddlewareHandler } from 'hono';
import { verifyToken as clerkVerify } from '@clerk/backend';

export interface ClerkAuthDeps {
  verifyToken?: (token: string) => Promise<{ sub: string }>;
  secretKey?: string;
  devBearer?: string;       // if set, a request bearing exactly this string is accepted
  devUserId?: string;       // userId to set when devBearer matches; defaults to 'dev-user'
}

export function createClerkAuth(deps: ClerkAuthDeps = {}): MiddlewareHandler {
  const verify = deps.verifyToken ?? (async (token: string) => {
    const payload = await clerkVerify(token, { secretKey: deps.secretKey });
    return { sub: payload.sub };
  });
  return async (c, next) => {
    const header = c.req.header('Authorization');
    if (!header?.startsWith('Bearer ')) {
      return c.json({ error: 'missing or malformed Authorization header' }, 401);
    }
    const token = header.slice('Bearer '.length).trim();
    if (deps.devBearer && token === deps.devBearer) {
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
  if (deps.devBearer && token === deps.devBearer) {
    return deps.devUserId ?? 'dev-user';
  }
  try {
    const verify = deps.verifyToken ?? (async (t: string) => {
      const payload = await clerkVerify(t, { secretKey: deps.secretKey });
      return { sub: payload.sub };
    });
    const { sub } = await verify(token);
    return sub;
  } catch {
    return null;
  }
}
