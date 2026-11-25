import { sameOrigin, json, body } from '../server/http.js';

export default async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) return json(res, 405, { error: 'Método não permitido.' });
  if (req.method === 'POST' && !sameOrigin(req)) return json(res, 403, { error: 'Origem não permitida.' });
  const databaseUrl = process.env.CULTOS_SUPABASE_URL || process.env.SUPABASE_URL;
  const databaseKey = process.env.CULTOS_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!databaseUrl || !databaseKey) return json(res, 503, { error: 'Sincronização não configurada. Os outros dispositivos não recebem as alterações.' });
  try {
    const query = new URL(req.url, 'http://localhost').searchParams;
    let data;
    if (req.method === 'POST') {
      try { data = await body(req); } catch { return json(res, 400, { error: 'Dados do evento inválidos.' }); }
    }
    const eventId = String(data?.id || query.get('id') || '').toUpperCase();
    const health = req.method === 'GET' && query.get('health') === '1';
    if (!health && !/^[A-Z0-9-]{3,80}$/.test(eventId)) return json(res, 400, { error: 'Código do evento inválido.' });
    if (req.method === 'POST' && (!['create', 'update', 'overwrite'].includes(data?.action) || !data?.payload || typeof data.payload !== 'object' || Array.isArray(data.payload))) {
      return json(res, 400, { error: 'Operação do evento inválida.' });
    }
    const target = new URL(req.method === 'POST' ? '/rest/v1/rpc/save_event' : '/rest/v1/events', databaseUrl);
    if (req.method === 'GET') {
      target.searchParams.set('select', health ? 'id' : 'payload,revision');
      target.searchParams.set('limit', '1');
      if (!health) target.searchParams.set('id', `eq.${eventId}`);
    }
    const upstream = await fetch(target, {
      method: req.method,
      headers: { apikey: databaseKey, Authorization: `Bearer ${databaseKey}`, 'Content-Type': 'application/json' },
      body: req.method === 'POST' ? JSON.stringify({ p_id: eventId, p_action: data.action, p_payload: data.payload }) : undefined,
      cache: 'no-store', signal: AbortSignal.timeout(8000),
    });
    if (!upstream.ok) return json(res, 502, { error: 'Não foi possível sincronizar. As alterações locais serão reenviadas quando a conexão voltar.' });
    const result = await upstream.json();
    const event = req.method === 'GET' ? result[0] || null : result;
    if (req.method === 'POST' && !event) return json(res, 404, { error: 'Evento não encontrado no servidor.' });
    return json(res, 200, { event: health ? null : event, serverTime: Date.now(), connected: true });
  } catch { return json(res, 502, { error: 'Sem conexão com o servidor. Os outros dispositivos não recebem as alterações.' }); }
}
