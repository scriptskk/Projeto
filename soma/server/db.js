import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export const CATEGORIES = Object.freeze({
  alimentacao: 'Alimentação', transporte: 'Transporte', moradia: 'Moradia',
  compras: 'Compras', saude: 'Saúde', lazer: 'Lazer', educacao: 'Educação',
  salario: 'Salário', investimentos: 'Investimentos', outros: 'Outros'
});
const ONE_MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const ONE_DATE = /^\d{4}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/;

export function isDate(value) {
  if (!ONE_DATE.test(value ?? '')) return false;
  const d = new Date(`${value}T12:00:00.000Z`);
  return !Number.isNaN(d.valueOf()) && d.toISOString().slice(0, 10) === value;
}
export function parseCents(value) {
  const s = typeof value === 'number' ? String(value) : String(value ?? '');
  if (!/^(0|[1-9]\d{0,7})(\.\d{1,2})?$/.test(s)) return null;
  const [units, decimal = ''] = s.split('.');
  const cents = Number(units) * 100 + Number(decimal.padEnd(2, '0'));
  return cents > 0 && cents <= 9999999999 ? cents : null;
}
export function createDatabase(dbPath = process.env.DATABASE_PATH || '.data/soma.sqlite') {
  if (dbPath !== ':memory:') fs.mkdirSync(path.dirname(path.resolve(dbPath)), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec(`PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;`);
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL CHECK (type IN ('income','expense')),
      description TEXT NOT NULL, category TEXT NOT NULL,
      amount_cents INTEGER NOT NULL CHECK(amount_cents > 0),
      occurred_on TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_transactions_user_date ON transactions(user_id, occurred_on DESC, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
  `);
  return db;
}
export function currentMonth() { return new Date().toISOString().slice(0, 7); }
export function validMonth(s) { return ONE_MONTH.test(s || ''); }
export function listTransactions(db, userId, month = currentMonth(), limit = 100) {
  return db.prepare(`SELECT id, type, description, category, amount_cents AS amountCents,
    occurred_on AS occurredOn, created_at AS createdAt FROM transactions
    WHERE user_id = ? AND occurred_on >= ? AND occurred_on < ?
    ORDER BY occurred_on DESC, created_at DESC, rowid DESC LIMIT ?`)
    .all(userId, `${month}-01`, nextMonth(month), limit);
}
export function nextMonth(month) {
  const [year, m] = month.split('-').map(Number);
  return `${m === 12 ? year + 1 : year}-${String(m === 12 ? 1 : m + 1).padStart(2,'0')}-01`;
}
export function addTransaction(db, userId, input) {
  const { type, description, category, amount, occurredOn } = input;
  const amountCents = parseCents(amount);
  if (!['income', 'expense'].includes(type)) throw new Error('Tipo inválido.');
  if (typeof description !== 'string' || description.trim().length < 2 || description.trim().length > 90) throw new Error('Descrição entre 2 e 90 caracteres.');
  if (!Object.hasOwn(CATEGORIES, category)) throw new Error('Categoria inválida.');
  if (!amountCents) throw new Error('Informe um valor válido acima de zero.');
  if (!isDate(occurredOn)) throw new Error('Data inválida.');
  const id = randomUUID();
  db.prepare(`INSERT INTO transactions (id, user_id, type, description, category, amount_cents, occurred_on)
    VALUES (?, ?, ?, ?, ?, ?, ?)`).run(id, userId, type, description.trim(), category, amountCents, occurredOn);
  return id;
}
export function removeTransaction(db, userId, id) {
  return db.prepare('DELETE FROM transactions WHERE id = ? AND user_id = ?').run(id, userId).changes === 1;
}
export function getOverview(db, userId, month = currentMonth()) {
  const row = db.prepare(`SELECT
    COALESCE(SUM(CASE WHEN type='income' THEN amount_cents ELSE -amount_cents END),0) AS balance
    FROM transactions WHERE user_id = ?`).get(userId);
  const period = db.prepare(`SELECT
    COALESCE(SUM(CASE WHEN type='income' THEN amount_cents ELSE 0 END),0) AS income,
    COALESCE(SUM(CASE WHEN type='expense' THEN amount_cents ELSE 0 END),0) AS expense,
    COUNT(*) AS count
    FROM transactions WHERE user_id = ? AND occurred_on >= ? AND occurred_on < ?`)
    .get(userId, `${month}-01`, nextMonth(month));
  const categories = db.prepare(`SELECT category, SUM(amount_cents) AS value
    FROM transactions WHERE user_id = ? AND type = 'expense' AND occurred_on >= ? AND occurred_on < ?
    GROUP BY category ORDER BY value DESC`).all(userId, `${month}-01`, nextMonth(month));
  const chart = [];
  let [y, m] = month.split('-').map(Number);
  for (let i = 5; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    const key = d.toISOString().slice(0, 7);
    const info = db.prepare(`SELECT
      COALESCE(SUM(CASE WHEN type='income' THEN amount_cents ELSE 0 END),0) AS income,
      COALESCE(SUM(CASE WHEN type='expense' THEN amount_cents ELSE 0 END),0) AS expense
      FROM transactions WHERE user_id=? AND occurred_on >= ? AND occurred_on < ?`)
      .get(userId, `${key}-01`, nextMonth(key));
    chart.push({ month: key, ...info });
  }
  return { month, balance: row.balance, ...period, categories, chart };
}
