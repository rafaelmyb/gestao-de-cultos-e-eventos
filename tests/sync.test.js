import test from 'node:test';
import assert from 'node:assert/strict';
import { createEventStore, mergeState } from '../services/eventSync.js';
const defaults = () => ({ items: [], status: 'IDLE', targetEndTime: null, pausedAtTime: null, roster: { nucleos: {} } });
function storage() {
  const data = new Map();
  return { getItem: key => data.get(key) || null, setItem: (key, value) => data.set(key, value) };
}
function backend() {
  const events = new Map();
  const calls = [];
  let offline = false;
  return {
    events, calls, setOffline: value => { offline = value; },
    fetch: async (url, init = {}) => {
      if (offline) throw new Error('offline');
      calls.push({ url, method: init.method || 'GET' });
      let event;
      if (init.method === 'POST') {
        const { id, action, payload } = JSON.parse(init.body);
        const current = events.get(id);
        if (action === 'create') event = current || { payload, revision: 1 };
        else if (!current) return new Response(JSON.stringify({ error: 'missing' }), { status: 404 });
        else event = { payload: action === 'update' ? mergeState(current.payload, payload) : payload, revision: current.revision + 1 };
        events.set(id, structuredClone(event));
      } else event = events.get(new URL(url, 'https://app.test').searchParams.get('id')) || null;
      return new Response(JSON.stringify({ event, serverTime: Date.now() }), { status: 200 });
    },
  };
}
const device = (db, cache = storage(), clock = Date.now) => createEventStore({ storage: cache, fetcher: db.fetch, now: clock, defaults });
test('two isolated devices receive start, pause, resume and stop using the same deadline', async () => {
  const db = backend();
  const admin = device(db);
  const phone = device(db, storage(), () => Date.now() + 300000);
  assert.equal(await phone.get('TESTE'), null);
  assert.equal(db.calls.filter(c => c.method === 'POST').length, 0, 'volunteer must not create an event');
  await admin.create('TESTE', 'Teste');
  await admin.write('TESTE', 'update', { items: [{ id: 'one', durationSeconds: 300 }] });
  const deadline = admin.now() + 300000;
  await admin.write('TESTE', 'update', { status: 'RUNNING', activeItemId: 'one', targetEndTime: deadline });
  let received = await phone.get('TESTE');
  assert.equal(received.status, 'RUNNING');
  assert.equal(received.targetEndTime, deadline);
  assert.equal(received.items.length, 1);
  assert.ok(Math.abs(admin.now() - phone.now()) < 100, 'phone clock skew is corrected');
  await admin.write('TESTE', 'update', { status: 'PAUSED', targetEndTime: null, pausedAtTime: 250000 });
  received = await phone.get('TESTE');
  assert.equal(received.status, 'PAUSED'); assert.equal(received.pausedAtTime, 250000);
  await admin.write('TESTE', 'update', { status: 'RUNNING', targetEndTime: admin.now() + 250000, pausedAtTime: null });
  assert.equal((await phone.get('TESTE')).status, 'RUNNING');
  await admin.write('TESTE', 'update', { status: 'IDLE', targetEndTime: null });
  assert.equal((await phone.get('TESTE')).status, 'IDLE');
});
test('an existing offline event is migrated without erasing its rundown or timer', async () => {
  const db = backend(), cache = storage();
  cache.setItem('chronos_event_TESTE', JSON.stringify({ ...defaults(), items: [{ id: 'saved' }], status: 'RUNNING', targetEndTime: 12345 }));
  const admin = device(db, cache);
  const restored = await admin.create('TESTE');
  assert.equal(restored.items[0].id, 'saved');
  assert.equal((await device(db).get('TESTE')).targetEndTime, 12345);
});
test('failed writes survive reload and are retried in order', async () => {
  const db = backend(), cache = storage();
  const admin = device(db, cache);
  await admin.create('TESTE'); db.setOffline(true);
  await admin.write('TESTE', 'update', { status: 'RUNNING', targetEndTime: 12345 });
  await admin.write('TESTE', 'update', { status: 'PAUSED', targetEndTime: null, pausedAtTime: 5000 });
  assert.equal(admin.status('TESTE').status, 'offline');
  db.setOffline(false);
  const reloaded = device(db, cache);
  await reloaded.get('TESTE');
  const phone = device(db);
  assert.equal((await phone.get('TESTE')).status, 'PAUSED');
  assert.equal((await phone.get('TESTE')).pausedAtTime, 5000);
});
test('late reads cannot overwrite a newer local timer change', async () => {
  const db = backend(); let release; let delay = false;
  const fetcher = async (url, options) => {
    const response = await db.fetch(url, options);
    if (delay && options.method !== 'POST') { delay = false; await new Promise(resolve => { release = resolve; }); }
    return response;
  };
  const admin = createEventStore({ storage: storage(), fetcher, defaults });
  await admin.create('TESTE'); delay = true;
  const staleRead = admin.get('TESTE');
  await new Promise(resolve => setImmediate(resolve));
  await admin.write('TESTE', 'update', { status: 'RUNNING', targetEndTime: 12345 });
  release(); await staleRead;
  assert.equal(admin.cached('TESTE').status, 'RUNNING');
});
test('partial role updates preserve other teams', () => {
  const result = mergeState({ roster: { gestorCulto: 'Ana', nucleos: { SOM: 'A', LUZ: 'B' } } }, { roster: { nucleos: { SOM: 'C' } } });
  assert.equal(result.roster.gestorCulto, 'Ana'); assert.equal(result.roster.nucleos.LUZ, 'B');
});

test('mobile browsers without AbortSignal.timeout still synchronize', async () => {
  const original = AbortSignal.timeout;
  AbortSignal.timeout = undefined;
  try {
    const db = backend(), admin = device(db), phone = device(db);
    await admin.create('MOBILE');
    await admin.write('MOBILE', 'update', { status: 'RUNNING', targetEndTime: 9000 });
    assert.equal((await phone.get('MOBILE')).status, 'RUNNING');
  } finally { AbortSignal.timeout = original; }
});
