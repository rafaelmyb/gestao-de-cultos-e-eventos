import { authenticated, configured, sameOrigin, equal, issueSession, sessionCookie, json, body } from '../server/auth.js';
// Additional per-instance throttling; the generated password has 192 bits of entropy.
const attempts = new Map();
export default async function handler(req, res) {
  if (!configured()) return json(res, 503, { error: 'Autenticação não configurada no servidor.' });
  if (req.method === 'GET') return json(res, 200, { authenticated: authenticated(req) });
  if (!['POST', 'DELETE'].includes(req.method)) return json(res, 405, { error: 'Método não permitido.' });
  if (!sameOrigin(req)) return json(res, 403, { error: 'Origem não permitida.' });
  if (req.method === 'DELETE') {
    res.setHeader('Set-Cookie', sessionCookie('', 0));
    return json(res, 200, { authenticated: false });
  }
  const ip = String(req.headers['x-vercel-forwarded-for'] || req.socket?.remoteAddress || 'unknown');
  const now = Date.now();
  for (const [key, entry] of attempts) if (entry.until <= now) attempts.delete(key);
  const entry = attempts.get(ip) || { count: 0, until: now + 15 * 60 * 1000 };
  if (entry.count >= 10) {
    res.setHeader('Retry-After', String(Math.ceil((entry.until - now) / 1000)));
    return json(res, 429, { error: 'Muitas tentativas. Aguarde alguns minutos.' });
  }
  let data;
  try { data = await body(req, 4096); } catch { return json(res, 400, { error: 'Requisição inválida.' }); }
  if (typeof data?.password !== 'string' || !equal(data.password, process.env.PANEL_PASSWORD)) {
    entry.count++;
    if (attempts.size < 10000 || attempts.has(ip)) attempts.set(ip, entry);
    return json(res, 401, { error: 'Senha incorreta.' });
  }
  attempts.delete(ip);
  res.setHeader('Set-Cookie', sessionCookie(issueSession()));
  return json(res, 200, { authenticated: true });
}
