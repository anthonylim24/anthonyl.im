import { test, expect, describe, mock } from 'bun:test';
import { createClerkAuth } from './clerkAuth';
import { Hono } from 'hono';

describe('createClerkAuth', () => {
  test('rejects requests without Authorization header (401)', async () => {
    const auth = createClerkAuth({ verifyToken: mock(async () => ({ sub: 'u' })) });
    const app = new Hono().use('*', auth).get('/x', (c) => c.text('ok'));
    const res = await app.request('/x');
    expect(res.status).toBe(401);
  });
  test('rejects malformed Authorization (no Bearer) (401)', async () => {
    const auth = createClerkAuth({ verifyToken: mock(async () => ({ sub: 'u' })) });
    const app = new Hono().use('*', auth).get('/x', (c) => c.text('ok'));
    const res = await app.request('/x', { headers: { Authorization: 'NotBearer X' } });
    expect(res.status).toBe(401);
  });
  test('accepts a valid token, sets userId in context', async () => {
    const verifyToken = mock(async () => ({ sub: 'user-42' }));
    const auth = createClerkAuth({ verifyToken });
    const app = new Hono().use('*', auth).get('/x', (c) => c.text((c.get('userId') as string)));
    const res = await app.request('/x', { headers: { Authorization: 'Bearer TOK' } });
    expect(await res.text()).toBe('user-42');
  });
  test('rejects when verifyToken throws (401)', async () => {
    const verifyToken = mock(async () => { throw new Error('bad'); });
    const auth = createClerkAuth({ verifyToken });
    const app = new Hono().use('*', auth).get('/x', (c) => c.text('ok'));
    const res = await app.request('/x', { headers: { Authorization: 'Bearer X' } });
    expect(res.status).toBe(401);
  });

  test('dev bearer match → accepts request with configured userId, no Clerk call', async () => {
    const verifyToken = mock(async () => { throw new Error('should not be called'); });
    const auth = createClerkAuth({ verifyToken, devBearer: 'SECRET', devUserId: 'anthony' });
    const app = new Hono().use('*', auth).get('/x', (c) => c.text(c.get('userId') as string));
    const res = await app.request('/x', { headers: { Authorization: 'Bearer SECRET' } });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('anthony');
    expect(verifyToken).not.toHaveBeenCalled();
  });

  test('dev bearer mismatch → falls through to Clerk verification', async () => {
    const verifyToken = mock(async () => ({ sub: 'real-user' }));
    const auth = createClerkAuth({ verifyToken, devBearer: 'SECRET' });
    const app = new Hono().use('*', auth).get('/x', (c) => c.text(c.get('userId') as string));
    const res = await app.request('/x', { headers: { Authorization: 'Bearer WRONG' } });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('real-user');
    expect(verifyToken).toHaveBeenCalled();
  });
});

describe('createClerkVerifier', () => {
  const { generateKeyPairSync } = require('node:crypto') as typeof import('node:crypto');
  const { signJwt } = require('@clerk/backend/jwt') as typeof import('@clerk/backend/jwt');

  function signingKey(kid: string) {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const jwk = { ...publicKey.export({ format: 'jwk' }), kid, alg: 'RS256', use: 'sig' };
    const sign = (sub: string) => {
      const now = Math.floor(Date.now() / 1000);
      return signJwt(
        { sub, iat: now, nbf: now - 5, exp: now + 60, iss: 'https://clerk.anthonyl.im' },
        privateKey.export({ format: 'pem', type: 'pkcs8' }) as string,
        { algorithm: 'RS256', header: { kid, typ: 'JWT', cat: 'cl_B7d4PD111AAA' } },
      );
    };
    return { jwk, sign };
  }

  test('verifies a session token and fetches the signing keys only once', async () => {
    const key = signingKey('ins_1');
    const fetchJwks = mock(async () => [key.jwk]);
    const { createClerkVerifier } = await import('./clerkAuth');
    const verify = createClerkVerifier(fetchJwks);
    expect(await verify(await key.sign('user_a'))).toEqual({ sub: 'user_a' });
    expect(await verify(await key.sign('user_b'))).toEqual({ sub: 'user_b' });
    expect(fetchJwks).toHaveBeenCalledTimes(1);
  });

  test('a token from a rotated key fetches the keys again', async () => {
    const old = signingKey('ins_old');
    const rotated = signingKey('ins_new');
    let published = [old.jwk];
    const fetchJwks = mock(async () => published);
    const { createClerkVerifier } = await import('./clerkAuth');
    const verify = createClerkVerifier(fetchJwks, { missCooldownMs: 0 });
    await verify(await old.sign('u'));
    published = [old.jwk, rotated.jwk];
    expect(await verify(await rotated.sign('u2'))).toEqual({ sub: 'u2' });
    expect(fetchJwks).toHaveBeenCalledTimes(2);
  });

  test('a key replaced under the same id is picked up by the background refresh', async () => {
    const before = signingKey('ins_1');
    const after = signingKey('ins_1');
    let published = [before.jwk];
    const fetchJwks = mock(async () => published);
    const { createClerkVerifier } = await import('./clerkAuth');
    const verify = createClerkVerifier(fetchJwks, { refreshAfterMs: 0 });
    await verify(await before.sign('u'));
    published = [after.jwk];
    await expect(verify(await after.sign('u'))).rejects.toThrow();
    await Bun.sleep(5);
    expect(await verify(await after.sign('u'))).toEqual({ sub: 'u' });
  });

  test('a key dropped from the published set stops verifying after the refresh', async () => {
    const revoked = signingKey('ins_old');
    const current = signingKey('ins_new');
    let published = [revoked.jwk, current.jwk];
    const { createClerkVerifier } = await import('./clerkAuth');
    const verify = createClerkVerifier(async () => published, { refreshAfterMs: 0, missCooldownMs: 60_000 });
    await verify(await revoked.sign('u'));
    published = [current.jwk];
    await verify(await current.sign('u'));
    await Bun.sleep(5);
    await expect(verify(await revoked.sign('u'))).rejects.toThrow();
  });

  test('tokens with made-up key ids cannot make it fetch on every request', async () => {
    const real = signingKey('ins_1');
    const forged = signingKey('ins_forged');
    const fetchJwks = mock(async () => [real.jwk]);
    const { createClerkVerifier } = await import('./clerkAuth');
    const verify = createClerkVerifier(fetchJwks, { missCooldownMs: 60_000 });
    await verify(await real.sign('u'));
    for (let i = 0; i < 3; i++) await expect(verify(await forged.sign('x'))).rejects.toThrow();
    expect(fetchJwks).toHaveBeenCalledTimes(1);
  });

  test('a token signed by another key under a known key id is rejected', async () => {
    const real = signingKey('ins_1');
    const impostor = signingKey('ins_1');
    const { createClerkVerifier } = await import('./clerkAuth');
    const verify = createClerkVerifier(async () => [real.jwk]);
    await expect(verify(await impostor.sign('x'))).rejects.toThrow();
  });

  test('a failed key fetch is retried on the next request, not held off', async () => {
    const key = signingKey('ins_1');
    let up = false;
    const fetchJwks = mock(async () => { if (!up) throw new Error('api.clerk.com down'); return [key.jwk]; });
    const { createClerkVerifier } = await import('./clerkAuth');
    const verify = createClerkVerifier(fetchJwks, { missCooldownMs: 60_000 });
    await expect(verify(await key.sign('u'))).rejects.toThrow();
    up = true;
    expect(await verify(await key.sign('u'))).toEqual({ sub: 'u' });
  });
});
