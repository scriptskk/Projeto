const $ = id => document.getElementById(id);
const money = cents => new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(cents/100);
const dateText = date => new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'short',timeZone:'UTC'}).format(new Date(`${date}T12:00:00Z`));
const monthName = month => new Intl.DateTimeFormat('pt-BR',{month:'short',timeZone:'UTC'}).format(new Date(`${month}-01T12:00:00Z`)).replace('.','').toUpperCase();
const colors=['#246c4d','#7eae89','#bfd6bd','#dfe9d9','#a2c8b0','#6b9580','#d5e4cf','#8db4a3','#bfd4c8','#d8e7dc'];
let user=null, month=new Date().toISOString().slice(0,7), transactionList=[], currentView='overview', confirmAction=null;
const $sections={overview:$('overviewSection'),transactions:$('transactionsSection'),settings:$('settingsSection')};
async function api(url,options={}) {
  const opts={credentials:'same-origin',...options};
  if(opts.body) opts.headers={'Content-Type':'application/json','X-Requested-With':'soma-web',...opts.headers};
  else if(opts.method && opts.method !== 'GET') opts.headers={'X-Requested-With':'soma-web',...opts.headers};
  const response=await fetch(url,opts);
  const data=await response.json();
  if(!response.ok) {
    if(response.status===401 && !url.includes('/auth/login')) location.assign('/');
    throw Error(data.error||'Não foi possível concluir.');
  }
  return data;
}
function toast(message) {
  const el=$('toast'); el.textContent=message;el.classList.add('shown');
  clearTimeout(toast.timeout);toast.timeout=setTimeout(()=>el.classList.remove('shown'),3500);
}
function element(tag,cls,text) {
  const el=document.createElement(tag); if(cls) el.className=cls; if(text!==undefined) el.textContent=text; return el;
}
function setView(view){
  currentView=view;
  for (const [key,section] of Object.entries($sections)) section.hidden=key!==view;
  $('navOverview').classList.toggle('active',view==='overview');
  $('navTransactions').classList.toggle('active',view==='transactions');
  $('navSettings').classList.toggle('active',view==='settings');
  const titles={overview:'Visão geral',transactions:'Movimentações',settings:'Configurações'};
  $('breadcrumbCurrent').textContent=titles[view];
  $('pageTitle').textContent='';$('pageTitle').append(titles[view],element('span','brand-dot','.'));
  $('pageDesc').textContent={overview:'Um retrato simples da sua vida financeira.',transactions:'Todos os seus registros em um só lugar.',settings:'Cuide das informações da sua conta.'}[view];
  $('monthInput').parentElement.hidden=view==='settings';
  $('newTransaction').hidden=view==='settings';
}
function transactionRow(tx){
  const row=element('div','transaction-row');
  const icon=element('span','transaction-icon '+(tx.type==='income'?'income':'expense'),tx.type==='income'?'↙':'↗');
  const main=element('div');main.append(element('span','transaction-description',tx.description),element('span','transaction-secondary',tx.categoryLabel||tx.category));
  const category=element('div','transaction-category',tx.categoryLabel||tx.category);
  const value=element('div','transaction-value '+tx.type,(tx.type==='income'?'+ ':'− ')+money(tx.amountCents));
  const del=element('button','delete-transaction','×');del.type='button';del.title='Excluir movimentação';del.setAttribute('aria-label',`Excluir ${tx.description}`);
  del.addEventListener('click',()=>showConfirmation('Excluir movimentação?',`Deseja excluir “${tx.description}”? O saldo será atualizado.`,async()=>{await api(`/api/transactions/${encodeURIComponent(tx.id)}`,{method:'DELETE'});toast('Movimentação excluída.');await refresh();}));
  row.append(icon,main,category,element('span','transaction-date',dateText(tx.occurredOn)),value,del);
  row.classList.add('with-date');
  return row;
}
function renderList(el,records,limit=Infinity){
  el.replaceChildren();
  if(!records.length){el.append(element('div','empty-state'));el.firstChild.append(element('strong',null,'Tudo começa com um registro.'),'Adicione uma receita ou despesa para ver seu histórico.');return;}
  records.slice(0,limit).forEach(tx=>el.append(transactionRow(tx)));
}
function renderChart(data){
  const target=$('flowChart');target.replaceChildren();
  const peak=Math.max(1,...data.flatMap(m=>[m.income,m.expense]));
  for(const d of data){
    const col=element('div','month-col');const bars=element('div','month-bars');
    const inc=element('i');inc.style.height=`${Math.max(2,d.income/peak*100)}%`;inc.title=`Entradas: ${money(d.income)}`;
    const exp=element('b');exp.style.height=`${Math.max(2,d.expense/peak*100)}%`;exp.title=`Saídas: ${money(d.expense)}`;
    bars.append(inc,exp);col.append(bars,element('span',null,monthName(d.month)));target.append(col);
  }
  target.setAttribute('aria-label',data.map(d=>`${d.month}: entradas ${money(d.income)}, saídas ${money(d.expense)}`).join('; '));
}
function renderCategories(categories){
  const area=$('categorySection');area.replaceChildren();
  const total=categories.reduce((sum,c)=>sum+c.value,0);
  if(!total){area.append(element('div','empty-category','Nenhum gasto neste mês.'));return;}
  const content=element('div','donut-area'),donut=element('div','donut'),inner=element('div','donut-inner');
  inner.append(element('small',null,'GASTOS'),element('strong',null,money(total)));donut.append(inner);
  let offset=0;const parts=[];const legend=element('div','category-legend');
  categories.slice(0,5).forEach((c,i)=>{
    const share=c.value/total*100; const last=i===Math.min(categories.length,5)-1;
    parts.push(`${colors[i]} ${offset}% ${last?100:offset+share}%`);offset+=share;
    const item=element('div','legend-item'),lab=element('div','legend-label'),dot=element('i','legend-dot');dot.style.background=colors[i];
    lab.append(dot,element('span',null,c.label));item.append(lab,element('strong','legend-value',Math.round(share)+'%'));legend.append(item);
  });
  donut.style.background=`conic-gradient(${parts.join(', ')})`;content.append(donut,legend);area.append(content);
}
async function refresh(){
  const [overview,txData]=await Promise.all([api(`/api/overview?month=${month}`),api(`/api/transactions?month=${month}`)]);
  transactionList=txData.transactions.map(tx=>({...tx,categoryLabel:txData.categories[tx.category]||tx.category}));
  $('statBalance').textContent=money(overview.balance);
  $('statIncome').textContent=money(overview.income);
  $('statExpense').textContent=money(overview.expense);
  renderChart(overview.chart);
  renderCategories(overview.categories.map(c=>({...c,label:txData.categories[c.category]||c.category})));
  renderList($('recentTransactions'),transactionList,5);renderList($('allTransactions'),transactionList);
}
function showConfirmation(title,description,callback,password=false){
  confirmAction=callback;
  $('confirmTitle').textContent=title;$('confirmDescription').textContent=description;
  $('confirmPasswordField').hidden=!password;$('confirmPassword').value='';$('confirmError').hidden=true;
  $('confirmDialog').showModal();
}
$('closeConfirm').addEventListener('click',()=>$('confirmDialog').close());
$('cancelConfirm').addEventListener('click',()=>$('confirmDialog').close());
$('acceptConfirm').addEventListener('click',async()=>{
  if(!confirmAction)return;
  const action=confirmAction;const button=$('acceptConfirm');button.disabled=true;
  try{await action();$('confirmDialog').close();}catch(err){$('confirmError').hidden=false;$('confirmError').textContent=err.message;}finally{button.disabled=false;}
});
function openTransaction(){
  $('transactionForm').reset();$('txDate').value=new Date().toLocaleDateString('en-CA');
  $('txError').hidden=true;$('transactionDialog').showModal();$('txDescription').focus();
}
$('newTransaction').addEventListener('click',openTransaction);
$('closeTransaction').addEventListener('click',()=>$('transactionDialog').close());
$('transactionForm').addEventListener('submit',async event=>{
  event.preventDefault();
  $('txError').hidden=true;
  const button=$('saveTransaction');button.disabled=true;
  const amountInput=$('txAmount').value.trim().replace(/^R\$\s*/,'').replace(/\s/g,'');
  const value=amountInput.includes(',') ? amountInput.replace(/\./g,'').replace(',','.') : amountInput;
  const input={type:document.querySelector('input[name="type"]:checked').value,description:$('txDescription').value.trim(),category:$('txCategory').value,occurredOn:$('txDate').value,amount:value};
  try{await api('/api/transactions',{method:'POST',body:JSON.stringify(input)});$('transactionDialog').close();
    month=input.occurredOn.slice(0,7);$('monthInput').value=month; await refresh();toast('Transação adicionada com sucesso.');}
  catch(err){$('txError').hidden=false;$('txError').textContent=err.message;}
  finally{button.disabled=false;}
});
$('monthInput').addEventListener('change',async event=>{month=event.target.value;await refresh();});
$('navOverview').addEventListener('click',()=>setView('overview'));
$('navTransactions').addEventListener('click',()=>setView('transactions'));
$('navSettings').addEventListener('click',()=>setView('settings'));
$('showAllTransactions').addEventListener('click',()=>setView('transactions'));
$('mobileProfile').addEventListener('click',()=>setView('settings'));
$('logoutButton').addEventListener('click',async()=>{await api('/api/auth/logout',{method:'POST'});location.assign('/');});
$('deleteAccount').addEventListener('click',()=>showConfirmation('Excluir conta?', 'Todos os seus registros serão excluídos de forma permanente. Digite sua senha para confirmar.',async()=>{
  await api('/api/auth/account',{method:'DELETE',body:JSON.stringify({password:$('confirmPassword').value})});location.assign('/');
},true));
async function init(){
  try{
    const me=await api('/api/auth/me'); user=me.user;
    $('profileName').textContent=user.name;$('settingsName').textContent=user.name;$('settingsEmail').textContent=user.email;
    const letter=user.name.slice(0,1).toUpperCase();$('profileAvatar').textContent=letter;$('mobileProfile').textContent=letter;
    $('monthInput').value=month; await refresh();
  }catch(error){if(!user)location.assign('/');else toast(error.message);}
}
init();
