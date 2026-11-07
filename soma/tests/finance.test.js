import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createDatabase, addTransaction, removeTransaction, listTransactions, getOverview, parseCents, isDate } from '../server/db.js';
import { hashPassword, checkPassword, createSession, findSession } from '../server/auth.js';

test('parser de valores sem ponto flutuante no armazenamento',()=>{
  assert.equal(parseCents('12.90'),1290);
  assert.equal(parseCents('0.01'),1);
  assert.equal(parseCents('12.345'),null);
  assert.equal(parseCents('-12'),null);
  assert.equal(parseCents('0'),null);
  assert.equal(isDate('2026-02-29'),false);
  assert.equal(isDate('2024-02-29'),true);
});
test('isolamento multiusuário, saldo e exclusão protegida',()=>{
  const db=createDatabase(':memory:');
  const a=randomUUID(),b=randomUUID();
  for(const [id,email] of [[a,'a@exemplo.com'],[b,'b@exemplo.com']])
    db.prepare('INSERT INTO users(id,name,email,password_hash) VALUES(?,?,?,?)').run(id,'Teste',email,hashPassword('senha-muito-forte'));
  const input={type:'income',description:'Salário',category:'salario',amount:'2500.00',occurredOn:'2026-11-05'};
  const id=addTransaction(db,a,input);
  addTransaction(db,b,{type:'expense',description:'Transporte',category:'transporte',amount:'30.25',occurredOn:'2026-11-06'});
  assert.equal(listTransactions(db,a,'2026-11').length,1);
  assert.equal(listTransactions(db,b,'2026-11').length,1);
  assert.equal(getOverview(db,a,'2026-11').balance,250000);
  assert.equal(getOverview(db,b,'2026-11').balance,-3025);
  assert.equal(removeTransaction(db,b,id),false);
  assert.equal(removeTransaction(db,a,id),true);
  assert.equal(getOverview(db,a,'2026-11').balance,0);
  db.close();
});
test('sessão autentica o usuário correto',()=>{
  const db=createDatabase(':memory:');const id=randomUUID();const pass='uma-senha-de-teste-123';
  db.prepare('INSERT INTO users(id,name,email,password_hash) VALUES(?,?,?,?)').run(id,'Maria','maria@exemplo.com',hashPassword(pass));
  assert.equal(checkPassword(pass,db.prepare('SELECT password_hash FROM users WHERE id=?').get(id).password_hash),true);
  assert.equal(checkPassword('errada',db.prepare('SELECT password_hash FROM users WHERE id=?').get(id).password_hash),false);
  const raw=createSession(db,id);
  assert.equal(findSession(db,`soma_session=${raw}`).id,id);
  assert.equal(findSession(db,'soma_session=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'),null);
  db.close();
});
