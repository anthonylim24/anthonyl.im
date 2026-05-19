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
