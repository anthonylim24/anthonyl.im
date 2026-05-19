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
});
