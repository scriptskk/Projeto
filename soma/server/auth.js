import { randomBytes, scryptSync, createHash, timingSafeEqual } from 'node:crypto';

const WEEK = 7 * 24 * 60 * 60;
export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}
export function checkPassword(password, stored) {
  const [salt, hex] = String(stored).split(':');
  if (!salt || !hex || hex.length !== 128) return false;
  const actual = scryptSync(password, salt, 64);
  return timingSafeEqual(actual, Buffer.from(hex, 'hex'));
}
function hashToken(raw) { return createHash('sha256').update(raw).digest('hex'); }
export function createSession(db, userId) {
  const raw = randomBytes(32).toString('hex');
  const expires = Math.floor(Date.now() / 1000) + WEEK;
  db.prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES (?,?,?)')
    .run(hashToken(raw), userId, expires);
  return raw;
}
export function findSession(db, cookies) {
  const raw = cookies.match(/(?:^|;\s*)soma_session=([a-f0-9]{64})(?:;|$)/)?.[1];
  if (!raw) return null;
  return db.prepare(`SELECT users.id, users.name, users.email FROM sessions
    JOIN users ON users.id=sessions.user_id
    WHERE token_hash = ? AND expires_at > ?`).get(hashToken(raw), Math.floor(Date.now() / 1000)) || null;
}
export function revokeSession(db, cookies) {
  const raw = cookies.match(/(?:^|;\s*)soma_session=([a-f0-9]{64})(?:;|$)/)?.[1];
  if (raw) db.prepare('DELETE FROM sessions WHERE token_hash=?').run(hashToken(raw));
}
export function cookieFor(raw, secure = false) {
  return `soma_session=${raw}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${WEEK}${secure ? '; Secure' : ''}`;
}
export function clearedCookie(secure = false) {
  return `soma_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secure ? '; Secure' : ''}`;
}
