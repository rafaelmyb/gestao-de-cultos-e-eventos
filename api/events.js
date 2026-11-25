import { authenticated, sameOrigin, json, body } from '../server/auth.js';
export default async function handler(req, res) {
  if (!authenticated(req)) return json(res, 401, { error: 'Faça login para acessar os eventos.' });
  if (!['GET', 'POST', 'PATCH'].includes(req.method)) return json(res, 405, { error: 'Método não permitido.' });
  if (req.method !== 'GET' && !sameOrigin(req)) return json(res, 403, { error: 'Origem não permitida.' });
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) return json(res, 503, { error: 'Banco de dados não configurado.' });
  try {
    const query = new URL(req.url, 'http://localhost').search;
    const target = new URL('/rest/v1/events' + query, process.env.SUPABASE_URL);
    const headers = {
      apikey: process.env.SUPABASE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Accept: req.headers.accept === 'application/vnd.pgrst.object+json' ? req.headers.accept : 'application/json',
      Prefer: String(req.headers.prefer || ''),
    };
    const response = await fetch(target, {
      method: req.method, headers,
      body: req.method === 'GET' ? undefined : JSON.stringify(await body(req)),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) {
      // Preserve PostgREST codes used by the client without exposing backend details.
      const error = await response.json().catch(() => ({}));
      return json(res, response.status, { code: error.code || 'DATABASE_ERROR', message: 'Não foi possível sincronizar com o banco de dados.' });
    }
    res.statusCode = response.status;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    res.end(await response.text());
  } catch { return json(res, 502, { error: 'Banco de dados indisponível.' }); }
}
