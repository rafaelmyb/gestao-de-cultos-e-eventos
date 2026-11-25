import test from 'node:test';
import assert from 'node:assert/strict';
import events from '../api/events.js';
process.env.VERCEL = '1';
process.env.CULTOS_SUPABASE_URL = 'https://db.example';
process.env.CULTOS_SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
function req(method = 'GET', extra = {}) {
  return { method, url: '/api/events?id=TESTE', headers: { host: 'app.example', origin: 'https://app.example' }, socket: {}, ...extra };
}
async function call(request) {
  const result = { headers: {}, statusCode: 200, text: '' };
  result.setHeader = (key, value) => { result.headers[key.toLowerCase()] = value; };
  result.end = value => { result.text = value || ''; };
  await events(request, result);
  return result;
}
test('GET reads one event and POST uses atomic RPC; credentials stay private and caching is disabled', async () => {
  const originalFetch = globalThis.fetch;
  let seen;
  globalThis.fetch = async (url, options) => {
    seen = { url, options };
    const event = { payload: { status: 'RUNNING' }, revision: 2 };
    return new Response(JSON.stringify(options.method === 'GET' ? [event] : event));
  };
  try {
    const read = await call(req());
    assert.equal(read.statusCode, 200);
    assert.equal(seen.url.searchParams.get('id'), 'eq.TESTE');
    assert.equal(JSON.parse(read.text).event.payload.status, 'RUNNING');
    const write = await call(req('POST', { body: { id: 'TESTE', action: 'update', payload: { status: 'PAUSED' } } }));
    assert.equal(write.statusCode, 200);
    assert.equal(seen.url.pathname, '/rest/v1/rpc/save_event');
    assert.equal(seen.options.headers.apikey, 'test-service-key');
    assert.equal(write.text.includes('test-service-key'), false);
    assert.equal(write.headers['cache-control'], 'no-store');
    assert.ok(JSON.parse(write.text).serverTime > 0);
  } finally { globalThis.fetch = originalFetch; }
});
test('invalid IDs, operations, origins and methods are rejected', async () => {
  assert.equal((await call(req('POST', { headers: { host: 'app.example', origin: 'https://other.example' } }))).statusCode, 403);
  assert.equal((await call(req('DELETE'))).statusCode, 405);
  assert.equal((await call(req('GET', { url: '/api/events?id=../secret' }))).statusCode, 400);
  assert.equal((await call(req('POST', { body: { id: 'TESTE', action: 'delete', payload: {} } }))).statusCode, 400);
});
test('database failure is reported instead of claiming the event is synchronized', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('DNS failure'); };
  try { assert.equal((await call(req())).statusCode, 502); }
  finally { globalThis.fetch = original; }
});
