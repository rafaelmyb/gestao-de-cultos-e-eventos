// One store per browser. Separate devices share only the server, never localStorage.
export function mergeState(current, patch) {
  const merged = { ...current, ...patch };
  for (const key of ['roster', 'equipmentStatus', 'storedSessionItems']) {
    if (patch[key]) merged[key] = { ...current[key], ...patch[key] };
  }
  if (patch.roster?.nucleos) merged.roster.nucleos = { ...current.roster?.nucleos, ...patch.roster.nucleos };
  return merged;
}

export function createEventStore({ storage, fetcher, now = Date.now, defaults }) {
  const records = new Map();
  const listeners = new Set();
  let offset = 0;
  const normalize = id => String(id).trim().toUpperCase();
  function read(key, fallback) {
    try { return JSON.parse(storage.getItem(key)) ?? fallback; } catch { return fallback; }
  }
  function record(rawId) {
    const id = normalize(rawId);
    if (!records.has(id)) records.set(id, {
      id, revision: 0, generation: 0, pending: read(`chronos_pending_${id}`, []),
      status: 'connecting', error: '', flushing: null,
    });
    return records.get(id);
  }
  const cached = id => read(`chronos_event_${normalize(id)}`, null);
  function cache(id, payload) { storage.setItem(`chronos_event_${id}`, JSON.stringify(payload)); }
  function persist(r) { storage.setItem(`chronos_pending_${r.id}`, JSON.stringify(r.pending)); }
  function status(r, value, error = '') {
    r.status = value; r.error = error;
    for (const listener of listeners) listener(r.id, value, error);
  }
  async function request(path, options = {}) {
    const started = now();
    // AbortSignal.timeout is absent in older Safari and embedded mobile browsers.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    let response, data;
    try {
      response = await fetcher(path, { ...options, cache: 'no-store', signal: controller.signal });
      data = await response.json();
    } finally { clearTimeout(timeout); }
    if (!response.ok) throw new Error(data.error || 'Falha na sincronização.');
    if (Number.isFinite(data.serverTime)) offset = data.serverTime - (started + now()) / 2;
    return data;
  }
  function applyRemote(r, event, generation) {
    // A GET that started before a local write must never roll the timer back.
    if (!event || r.pending.length || r.generation !== generation || event.revision < r.revision) return cached(r.id);
    r.revision = event.revision;
    cache(r.id, event.payload);
    return event.payload;
  }
  async function flush(r) {
    if (r.flushing) return r.flushing;
    r.flushing = (async () => {
      while (r.pending.length) {
        status(r, 'syncing');
        const operation = r.pending[0];
        try {
          const data = await request('/api/events', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: r.id, ...operation }),
          });
          r.pending.shift(); persist(r);
          r.revision = Math.max(r.revision, data.event.revision);
          if (!r.pending.length) cache(r.id, data.event.payload);
        } catch (error) {
          status(r, 'offline', error.message);
          return false;
        }
      }
      status(r, 'synced');
      return true;
    })();
    try { return await r.flushing; } finally { r.flushing = null; }
  }
  async function write(id, action, payload) {
    const r = record(id);
    const next = action === 'update' ? mergeState(cached(r.id) || defaults(), payload) : payload;
    cache(r.id, next); r.generation++;
    r.pending.push({ action, payload }); persist(r);
    await flush(r);
    return cached(r.id);
  }
  async function get(id) {
    const r = record(id);
    if (r.pending.length && !await flush(r)) return cached(r.id);
    const generation = r.generation;
    try {
      const data = await request(`/api/events?id=${encodeURIComponent(r.id)}`);
      if (generation !== r.generation || r.pending.length) return cached(r.id);
      status(r, data.event ? 'synced' : 'missing');
      if (!data.event) return null;
      return applyRemote(r, data.event, generation);
    } catch (error) {
      status(r, 'offline', error.message);
      return cached(r.id);
    }
  }
  async function create(id, initialName) {
    const r = record(id);
    const local = cached(r.id);
    const remote = await get(r.id);
    if (remote && r.status === 'synced') return remote;
    // Preserve pre-existing offline events when migrating to a working backend.
    const initial = local || { ...defaults(), id: r.id, eventName: initialName || 'Novo Evento' };
    if (!r.pending.some(op => op.action === 'create')) {
      r.pending.unshift({ action: 'create', payload: initial }); persist(r); cache(r.id, initial); r.generation++;
    }
    await flush(r);
    return cached(r.id);
  }
  return {
    get, create, cached, write,
    now: () => now() + offset,
    status: id => { const r = record(id); return { status: r.status, error: r.error }; },
    onStatus: listener => { listeners.add(listener); return () => listeners.delete(listener); },
    health: () => request('/api/events?health=1'),
  };
}
