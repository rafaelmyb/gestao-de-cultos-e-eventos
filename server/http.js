export function sameOrigin(req) {
  try {
    const origin = new URL(req.headers.origin);
    const proto = process.env.VERCEL ? 'https:' : (req.socket?.encrypted ? 'https:' : 'http:');
    return origin.host === req.headers.host && origin.protocol === proto;
  } catch { return false; }
}
export function json(res, status, data) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(JSON.stringify(data));
}
export async function body(req, maxBytes = 2_000_000) {
  if (req.body !== undefined) {
    const raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    if (Buffer.byteLength(raw) > maxBytes) throw new Error('Body too large');
    return JSON.parse(raw);
  }
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (Buffer.byteLength(raw) > maxBytes) throw new Error('Body too large');
  }
  return JSON.parse(raw || '{}');
}
