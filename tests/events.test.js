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

test('older tabs can read the single-event PostgREST response and PATCH the running timer', async () => {
  const original = globalThis.fetch;
  let state = { status: 'IDLE', targetEndTime: null }, revision = 1;
  globalThis.fetch = async (url, options) => {
    if (options.method === 'POST') {
      const input = JSON.parse(options.body);
      assert.equal(input.p_id, 'TESTE');
      state = { ...state, ...input.p_payload }; revision++;
      return new Response(JSON.stringify({ payload: state, revision }));
    }
    assert.equal(url.searchParams.get('id'), 'eq.TESTE');
    return new Response(JSON.stringify([{ payload: state, revision }]));
  };
  try {
    const oldRequest = req('GET', { url: '/api/events?select=payload&id=eq.TESTE', headers: { accept: 'application/vnd.pgrst.object+json' } });
    const before = await call(oldRequest);
    assert.equal(before.statusCode, 200); assert.equal(JSON.parse(before.text).payload.status, 'IDLE');
    const update = await call(req('PATCH', { url: '/api/events?id=eq.TESTE', body: { payload: { status: 'RUNNING', targetEndTime: 123456 } } }));
    assert.equal(update.statusCode, 200);
    const oldPhone = JSON.parse((await call(oldRequest)).text);
    const newPhone = JSON.parse((await call(req())).text);
    assert.equal(oldPhone.payload.status, 'RUNNING');
    assert.equal(newPhone.event.payload.targetEndTime, oldPhone.payload.targetEndTime);
  } finally { globalThis.fetch = original; }
});

test('legacy creation is idempotent and missing single reads preserve the expected error', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    if (options.method === 'GET') return new Response('[]');
    const input = JSON.parse(options.body); assert.equal(input.p_action, 'create');
    return new Response(JSON.stringify({ payload: input.p_payload, revision: 1 }));
  };
  try {
    assert.equal((await call(req('POST', { body: { id: 'TESTE', payload: { status: 'IDLE' } } }))).statusCode, 200);
    const missing = await call(req('GET', { url: '/api/events?select=payload&id=eq.TESTE', headers: { accept: 'application/vnd.pgrst.object+json' } }));
    assert.equal(missing.statusCode, 406); assert.equal(JSON.parse(missing.text).code, 'PGRST116');
  } finally { globalThis.fetch = original; }
});
