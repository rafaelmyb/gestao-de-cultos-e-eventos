import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
export const COOKIE = 'chronos_session';
export const MAX_AGE = 12 * 60 * 60;
export function configured() {
  return process.env.PANEL_PASSWORD?.length >= 16 && process.env.SESSION_SECRET?.length >= 32;
}
const digest = value => createHash('sha256').update(value).digest();
export const equal = (a, b) => timingSafeEqual(digest(a), digest(b));
function sign(value) {
  return createHmac('sha256', process.env.SESSION_SECRET).update(value + ':' + process.env.PANEL_PASSWORD).digest('base64url');
}
export function issueSession(now = Date.now()) {
  const expires = String(Math.floor(now / 1000) + MAX_AGE);
  return `${expires}.${sign(expires)}`;
}
export function authenticated(req, now = Date.now()) {
  if (!configured()) return false;
  const token = (req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith(COOKIE + '='))?.slice(COOKIE.length + 1);
  if (!token) return false;
  const [expires, signature, extra] = token.split('.');
  const expiry = Number(expires);
  const current = Math.floor(now / 1000);
  return !extra && /^\d+$/.test(expires) && expiry > current && expiry <= current + MAX_AGE && !!signature && equal(signature, sign(expires));
}
export function sameOrigin(req) {
  try {
    const origin = new URL(req.headers.origin);
    const proto = process.env.VERCEL ? 'https:' : (req.socket?.encrypted ? 'https:' : 'http:');
    return origin.host === req.headers.host && origin.protocol === proto;
  } catch { return false; }
}
export function sessionCookie(value, maxAge = MAX_AGE) {
  return `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${process.env.VERCEL ? '; Secure' : ''}`;
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
