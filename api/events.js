import { sameOrigin, json, body } from '../server/http.js';

// Preserve the PostgREST-shaped API used by tabs opened before the sync migration.
export function parseEventRequest(req, data) {
  const query = new URL(req.url, 'http://localhost').searchParams;
  const legacy = query.has('select') || query.get('id')?.startsWith('eq.') || req.method === 'PATCH' || (req.method === 'POST' && !data?.action);
  const rawId = String(data?.id || query.get('id') || '');
  const id = rawId.replace(/^eq\./, '').toUpperCase();
  const health = req.method === 'GET' && (query.get('health') === '1' || (legacy && !id && query.get('select') === 'id'));
  const single = String(req.headers.accept || '').includes('application/vnd.pgrst.object+json');
  const action = legacy ? (req.method === 'PATCH' ? 'update' : String(req.headers.prefer || '').includes('resolution=merge-duplicates') ? 'overwrite' : 'create') : data?.action;
  return { legacy, id, health, single, action, payload: data?.payload };
}

export default async function handler(req, res) {
  if (!['GET', 'POST', 'PATCH'].includes(req.method)) return json(res, 405, { error: 'Método não permitido.' });
  if (req.method !== 'GET' && !sameOrigin(req)) return json(res, 403, { error: 'Origem não permitida.' });
  const databaseUrl = process.env.CULTOS_SUPABASE_URL || process.env.SUPABASE_URL;
  const databaseKey = process.env.CULTOS_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!databaseUrl || !databaseKey) return json(res, 503, { error: 'Sincronização não configurada. Os outros dispositivos não recebem as alterações.' });
  try {
    let data;
    if (req.method !== 'GET') {
      try { data = await body(req); } catch { return json(res, 400, { error: 'Dados do evento inválidos.' }); }
    }
    const request = parseEventRequest(req, data);
    const { id, health, action, payload, legacy, single } = request;
    if (!health && !/^[A-Z0-9-]{3,80}$/.test(id)) return json(res, 400, { error: 'Código do evento inválido.' });
    if (req.method !== 'GET' && (!['create', 'update', 'overwrite'].includes(action) || !payload || typeof payload !== 'object' || Array.isArray(payload))) {
      return json(res, 400, { error: 'Operação do evento inválida.' });
    }
    const write = req.method !== 'GET';
    const target = new URL(write ? '/rest/v1/rpc/save_event' : '/rest/v1/events', databaseUrl);
    if (!write) {
      target.searchParams.set('select', health ? 'id' : 'payload,revision');
      target.searchParams.set('limit', '1');
      if (!health) target.searchParams.set('id', `eq.${id}`);
    }
    const options = {
      method: write ? 'POST' : 'GET',
      headers: { apikey: databaseKey, Authorization: `Bearer ${databaseKey}`, 'Content-Type': 'application/json' },
      body: write ? JSON.stringify({ p_id: id, p_action: action, p_payload: payload }) : undefined,
      cache: 'no-store', signal: AbortSignal.timeout(8000),
    };
    let upstream = await fetch(target, options);
    if (!upstream.ok) return json(res, 502, { error: 'Não foi possível sincronizar. As alterações locais serão reenviadas quando a conexão voltar.' });
    let result = await upstream.json();
    // Older tabs only PATCH a full snapshot. Recover their previously local event
    // when the new database has no row yet, without touching an existing event.
    if (legacy && action === 'update' && write && !result) {
      upstream = await fetch(target, { ...options, body: JSON.stringify({ p_id: id, p_action: 'create', p_payload: payload }) });
      if (!upstream.ok) return json(res, 502, { error: 'Falha ao publicar o evento.' });
      result = await upstream.json();
    }
    const event = write ? result : result[0] || null;
    if (write && !event) return json(res, 404, { error: 'Evento não encontrado no servidor.' });
    if (legacy) {
      if (health) return json(res, 200, result);
      if (!write && !event && single) return json(res, 406, { code: 'PGRST116', message: 'Evento não encontrado.' });
      const row = event ? { id, payload: event.payload, revision: event.revision } : null;
      return json(res, 200, single ? row : row ? [row] : []);
    }
    return json(res, 200, { event: health ? null : event, serverTime: Date.now(), connected: true });
  } catch { return json(res, 502, { error: 'Sem conexão com o servidor. Os outros dispositivos não recebem as alterações.' }); }
}
