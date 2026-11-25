import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import session from '../api/session.js';
import events from '../api/events.js';
import { authenticated, issueSession, MAX_AGE } from '../server/auth.js';

process.env.PANEL_PASSWORD = randomBytes(24).toString('hex');
process.env.SESSION_SECRET = randomBytes(32).toString('hex');
process.env.VERCEL = '1';
function req(method = 'GET', extra = {}) {
  return { method, url: '/api/session', headers: { host: 'app.example', origin: 'https://app.example' }, socket: {}, ...extra };
}
async function call(handler, request) {
  const result = { headers: {}, statusCode: 200, text: '' };
  result.setHeader = (key, value) => { result.headers[key.toLowerCase()] = value; };
  result.end = value => { result.text = value || ''; };
  await handler(request, result);
  return result;
}
test('login rejects old/wrong password, then issues a secure HttpOnly cookie', async () => {
  const invalid = await call(session, req('POST', { body: { password: 'invalid' } }));
  assert.equal(invalid.statusCode, 401);
  assert.equal(invalid.headers['set-cookie'], undefined);
  const valid = await call(session, req('POST', { body: { password: process.env.PANEL_PASSWORD } }));
  assert.equal(valid.statusCode, 200);
  assert.match(valid.headers['set-cookie'], /HttpOnly; SameSite=Strict/);
  assert.match(valid.headers['set-cookie'], /; Secure/);
  assert.equal(valid.text.includes(process.env.PANEL_PASSWORD), false);
  const cookie = valid.headers['set-cookie'].split(';')[0];
  const check = await call(session, req('GET', { headers: { cookie } }));
  assert.equal(JSON.parse(check.text).authenticated, true);
});
test('expired, modified, and password-rotated sessions are rejected', () => {
  const now = Date.now();
  const token = issueSession(now);
  assert.equal(authenticated(req('GET', { headers: { cookie: `chronos_session=${token}` } }), now), true);
  assert.equal(authenticated(req('GET', { headers: { cookie: `chronos_session=${token}bad` } }), now), false);
  assert.equal(authenticated(req('GET', { headers: { cookie: `chronos_session=${token}` } }), now + MAX_AGE * 1000), false);
  const original = process.env.PANEL_PASSWORD;
  process.env.PANEL_PASSWORD = randomBytes(24).toString('hex');
  assert.equal(authenticated(req('GET', { headers: { cookie: `chronos_session=${token}` } })), false);
  process.env.PANEL_PASSWORD = original;
});
test('cross-origin login and writes are rejected', async () => {
  const request = req('POST', { body: { password: process.env.PANEL_PASSWORD }, headers: { host: 'app.example', origin: 'https://evil.example', cookie: `chronos_session=${issueSession()}` } });
  assert.equal((await call(session, request)).statusCode, 403);
  assert.equal((await call(events, request)).statusCode, 403);
});
test('every database operation requires a server-verified session', async () => {
  for (const method of ['GET', 'POST', 'PATCH']) assert.equal((await call(events, req(method))).statusCode, 401);
});
test('missing configuration fails closed', async () => {
  const original = process.env.SESSION_SECRET;
  delete process.env.SESSION_SECRET;
  assert.equal((await call(session, req())).statusCode, 503);
  assert.equal((await call(events, req())).statusCode, 401);
  process.env.SESSION_SECRET = original;
});
test('logout clears cookie and login attempts are throttled', async () => {
  const logout = await call(session, req('DELETE'));
  assert.match(logout.headers['set-cookie'], /Max-Age=0/);
  for (let i = 0; i < 10; i++) await call(session, req('POST', { body: { password: 'wrong' }, socket: { remoteAddress: 'test-throttle' } }));
  const limited = await call(session, req('POST', { body: { password: 'wrong' }, socket: { remoteAddress: 'test-throttle' } }));
  assert.equal(limited.statusCode, 429);
});
test('authenticated proxy keeps credentials on server and restricts the table', async () => {
  const originalFetch = globalThis.fetch;
  process.env.SUPABASE_URL = 'https://db.example';
  process.env.SUPABASE_KEY = randomBytes(24).toString('hex');
  let seen;
  globalThis.fetch = async (url, options) => { seen = { url, options }; return new Response('[]', { status: 200 }); };
  try {
    const result = await call(events, req('GET', { url: '/api/events?select=id&limit=1', headers: { cookie: `chronos_session=${issueSession()}` } }));
    assert.equal(result.statusCode, 200);
    assert.equal(seen.url.pathname, '/rest/v1/events');
    assert.equal(seen.options.headers.apikey, process.env.SUPABASE_KEY);
    assert.equal(result.text.includes(process.env.SUPABASE_KEY), false);
    assert.equal(result.headers['cache-control'], 'no-store');
  } finally { globalThis.fetch = originalFetch; }
});
