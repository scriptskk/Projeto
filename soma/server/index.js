import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { createDatabase, currentMonth, validMonth, CATEGORIES, addTransaction, removeTransaction, listTransactions, getOverview } from './db.js';
import { hashPassword, checkPassword, createSession, findSession, revokeSession, cookieFor, clearedCookie } from './auth.js';

const publicDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public');
const db = createDatabase();
const secureCookie = process.env.COOKIE_SECURE === 'true';
const rate = new Map();
const mime = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.svg':'image/svg+xml', '.ico':'image/x-icon' };
function send(res, status, payload, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(JSON.stringify(payload));
}
function fail(res, status, error) { send(res, status, { error }); }
function badRate(ip) {
  const now = Date.now();
  let data = rate.get(ip);
  if (!data || data.until < now) data = { count: 0, until: now + 60_000 };
  data.count++;
  rate.set(ip, data);
  if (rate.size > 10000) for (const [key, r] of rate) if (r.until < now) rate.delete(key);
  return data.count > 120;
}
async function body(req) {
  if (!req.headers['content-type']?.startsWith('application/json')) throw new Error('Envie JSON.');
  let buf = '';
  for await (const chunk of req) {
    buf += chunk.toString();
    if (buf.length > 16_384) throw new Error('Mensagem muito grande.');
  }
  try { return JSON.parse(buf); } catch { throw new Error('JSON inválido.'); }
}
function originAllowed(req) {
  const origin = req.headers.origin;
  if (!origin) return false;
  try { return new URL(origin).host === req.headers.host && ['http:', 'https:'].includes(new URL(origin).protocol); }
  catch { return false; }
}
function requireUser(req, res) {
  const user = findSession(db, req.headers.cookie || '');
  if (!user) fail(res, 401, 'Faça login para continuar.');
  return user;
}
function sendFile(req, res, file) {
  const ext = path.extname(file);
  if (!Object.hasOwn(mime, ext)) return fail(res, 404, 'Não encontrado.');
  try {
    const data = fs.readFileSync(path.join(publicDir, file));
    res.writeHead(200, { 'Content-Type': mime[ext], 'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600' });
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch { fail(res, 404, 'Não encontrado.'); }
}
const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('X-Frame-Options','DENY');
  res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
  res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data:; script-src 'self'; style-src 'self'; connect-src 'self'; font-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'");
  const url = new URL(req.url || '/', 'http://localhost');
  const p = url.pathname;
  if (badRate(req.socket.remoteAddress || 'local')) return fail(res, 429, 'Muitas solicitações. Tente novamente em um minuto.');
  if (p === '/api/health' && req.method === 'GET') return send(res, 200, { status:'ok' });
  if (p.startsWith('/api/')) {
    if (!['GET','POST','DELETE'].includes(req.method)) return fail(res,405,'Método inválido.');
    if (req.method !== 'GET' && (!originAllowed(req) || req.headers['x-requested-with'] !== 'soma-web')) return fail(res,403,'Origem não autorizada.');
    try {
      if (p === '/api/auth/register' && req.method === 'POST') {
        const input = await body(req);
        const name = String(input.name || '').trim();
        const email = String(input.email || '').trim().toLowerCase();
        const password = String(input.password || '');
        if (name.length < 2 || name.length > 70) return fail(res,400,'Nome entre 2 e 70 caracteres.');
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 250) return fail(res,400,'E-mail inválido.');
        if (password.length < 10 || password.length > 128) return fail(res,400,'Use uma senha de 10 a 128 caracteres.');
        if (input.acceptedTerms !== true) return fail(res,400,'É necessário aceitar os termos de teste.');
        if (db.prepare('SELECT 1 FROM users WHERE email=?').get(email)) return fail(res,409,'E-mail já cadastrado.');
        const id = randomUUID();
        db.prepare('INSERT INTO users(id,name,email,password_hash) VALUES(?,?,?,?)').run(id,name,email,hashPassword(password));
        const raw = createSession(db,id);
        return send(res,201,{ user:{id,name,email} },{'Set-Cookie':cookieFor(raw,secureCookie)});
      }
      if (p === '/api/auth/login' && req.method === 'POST') {
        const input = await body(req);
        const email = String(input.email || '').trim().toLowerCase();
        const password = String(input.password || '');
        const user = db.prepare('SELECT * FROM users WHERE email=?').get(email);
        if (!user || !checkPassword(password,user.password_hash)) return fail(res,401,'E-mail ou senha incorretos.');
        const raw = createSession(db,user.id);
        return send(res,200,{user:{id:user.id,name:user.name,email:user.email}}, {'Set-Cookie':cookieFor(raw,secureCookie)});
      }
      if (p === '/api/auth/logout' && req.method === 'POST') {
        revokeSession(db, req.headers.cookie || '');
        return send(res,200,{ok:true},{'Set-Cookie':clearedCookie(secureCookie)});
      }
      const user = requireUser(req,res);
      if (!user) return;
      if (p === '/api/auth/me' && req.method === 'GET') return send(res,200,{user});
      if (p === '/api/overview' && req.method === 'GET') {
        const month = url.searchParams.get('month') || currentMonth();
        if (!validMonth(month)) return fail(res,400,'Mês inválido.');
        return send(res,200,getOverview(db,user.id,month));
      }
      if (p === '/api/transactions' && req.method === 'GET') {
        const month = url.searchParams.get('month') || currentMonth();
        if (!validMonth(month)) return fail(res,400,'Mês inválido.');
        return send(res,200,{transactions:listTransactions(db,user.id,month,200),categories:CATEGORIES});
      }
      if (p === '/api/transactions' && req.method === 'POST') {
        const id = addTransaction(db,user.id,await body(req));
        return send(res,201,{id});
      }
      const matched = p.match(/^\/api\/transactions\/([\w-]{36})$/);
      if (matched && req.method === 'DELETE') {
        if (!removeTransaction(db,user.id,matched[1])) return fail(res,404,'Transação não encontrada.');
        return send(res,200,{ok:true});
      }
      if (p === '/api/export' && req.method === 'GET') {
        const transactions = db.prepare('SELECT type,description,category,amount_cents,occurred_on FROM transactions WHERE user_id=? ORDER BY occurred_on DESC').all(user.id);
        const escape = v => `"${String(v).replaceAll('"','""')}"`;
        const csv = ['tipo,descricao,categoria,valor,data', ...transactions.map(t => [t.type, t.description, t.category, (t.amount_cents / 100).toFixed(2), t.occurred_on].map(escape).join(','))].join('\r\n');
        res.writeHead(200,{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="soma-export.csv"','Cache-Control':'no-store'});
        return res.end('\uFEFF'+csv);
      }
      if (p === '/api/auth/account' && req.method === 'DELETE') {
        const input = await body(req);
        const stored = db.prepare('SELECT password_hash FROM users WHERE id=?').get(user.id);
        if (!checkPassword(String(input.password || ''),stored.password_hash)) return fail(res,403,'Senha incorreta.');
        db.prepare('DELETE FROM users WHERE id=?').run(user.id);
        return send(res,200,{ok:true},{'Set-Cookie':clearedCookie(secureCookie)});
      }
      return fail(res,404,'Rota inexistente.');
    } catch (err) {
      if (err.message?.includes('UNIQUE constraint')) return fail(res,409,'Registro já existente.');
      if (err.message?.includes('SQLITE')) { console.error(err); return fail(res,500,'Falha interna.'); }
      return fail(res,400,err.message || 'Não foi possível processar a solicitação.');
    }
  }
  if (!['GET','HEAD'].includes(req.method)) return fail(res,405,'Método inválido.');
  if (p === '/' || p === '/index.html') return sendFile(req,res,'index.html');
  if (p === '/app') return sendFile(req,res,'app.html');
  if (p === '/privacidade') return sendFile(req,res,'privacidade.html');
  if (/^\/assets\/[\w-]+\.(css|js|svg)$/.test(p)) return sendFile(req,res,p.slice(1));
  return sendFile(req,res,'index.html');
});
const port = Number(process.env.PORT || '3000');
const host = process.env.HOST || '127.0.0.1';
server.listen(port,host,()=> console.log(`soma. disponível em http://${host}:${port}`));
