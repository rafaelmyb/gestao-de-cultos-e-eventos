import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import events from '../api/events.js';

process.env.VERCEL = '1';
process.env.SUPABASE_URL = 'https://db.example';
process.env.SUPABASE_KEY = randomBytes(24).toString('hex');
function req(method = 'GET', extra = {}) {
  return { method, url: '/api/events?select=id&limit=1', headers: { host: 'app.example', origin: 'https://app.example' }, socket: {}, ...extra };
}
async function call(request) {
  const result = { headers: {}, statusCode: 200, text: '' };
  result.setHeader = (key, value) => { result.headers[key.toLowerCase()] = value; };
  result.end = value => { result.text = value || ''; };
  await events(request, result);
  return result;
}
test('read, create and update work without a password or session; credentials stay on server', async () => {
  const originalFetch = globalThis.fetch;
  let seen;
  globalThis.fetch = async (url, options) => { seen = { url, options }; return new Response('[]', { status: 200 }); };
  try {
    for (const method of ['GET', 'POST', 'PATCH']) {
      const result = await call(req(method, method === 'GET' ? {} : { body: { id: 'TEST', payload: {} } }));
      assert.equal(result.statusCode, 200);
      assert.equal(seen.url.pathname, '/rest/v1/events');
      assert.equal(seen.options.method, method);
      assert.equal(seen.options.headers.apikey, process.env.SUPABASE_KEY);
      assert.equal(result.text.includes(process.env.SUPABASE_KEY), false);
      assert.equal(result.headers['cache-control'], 'no-store');
      assert.equal(result.headers['set-cookie'], undefined);
    }
  } finally { globalThis.fetch = originalFetch; }
});
test('cross-origin writes and unsupported methods remain blocked', async () => {
  assert.equal((await call(req('POST', { headers: { host: 'app.example', origin: 'https://other.example' } }))).statusCode, 403);
  assert.equal((await call(req('DELETE'))).statusCode, 405);
});
test('missing database configuration returns an actionable failure, not a login challenge', async () => {
  const original = process.env.SUPABASE_KEY;
  delete process.env.SUPABASE_KEY;
  try { assert.equal((await call(req())).statusCode, 503); }
  finally { process.env.SUPABASE_KEY = original; }
});
