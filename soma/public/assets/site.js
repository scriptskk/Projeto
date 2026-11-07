const dialog = document.getElementById('authDialog');
const form = document.getElementById('authForm');
const $ = id => document.getElementById(id);
let mode = 'register';
function setMode(next) {
  mode = next;
  const creating = mode === 'register';
  $('authOverline').textContent = creating ? 'BEM-VINDO À SOMA.' : 'QUE BOM TER VOCÊ DE VOLTA';
  $('authTitle').textContent = creating ? 'Comece com clareza.' : 'Entre no seu espaço.';
  $('authDesc').textContent = creating ? 'Seu espaço financeiro está a poucos segundos.' : 'Tudo pronto para continuar de onde parou.';
  $('nameField').hidden = !creating;
  $('termsField').hidden = !creating;
  $('authName').required = creating;
  $('acceptedTerms').required = creating;
  $('authPassword').autocomplete = creating ? 'new-password' : 'current-password';
  $('authSubmit').textContent = creating ? 'Criar minha conta ↗' : 'Entrar no meu espaço ↗';
  $('authSwitchText').firstChild.textContent = creating ? 'Já tem conta? ' : 'Ainda não tem conta? ';
  $('authSwitch').textContent = creating ? 'Entrar' : 'Criar conta';
  $('authError').hidden = true;
}
function openAuth(next) { setMode(next); form.reset(); dialog.showModal(); requestAnimationFrame(()=>$(next==='register'?'authName':'authEmail').focus()); }
document.querySelectorAll('[data-auth]').forEach(b=> b.addEventListener('click',()=>openAuth(b.dataset.auth)));
$('closeAuth').addEventListener('click',()=>dialog.close());
$('authSwitch').addEventListener('click',()=>setMode(mode==='register'?'login':'register'));
dialog.addEventListener('click', event => {if(event.target===dialog) dialog.close();});
form.addEventListener('submit',async event=>{
  event.preventDefault();
  $('authError').hidden = true;
  const submit=$('authSubmit'); submit.disabled=true; submit.textContent='Aguarde...';
  const data={email:$('authEmail').value,password:$('authPassword').value};
  if(mode==='register') Object.assign(data,{name:$('authName').value,acceptedTerms:$('acceptedTerms').checked});
  try {
    const response=await fetch(`/api/auth/${mode}`,{method:'POST',headers:{'Content-Type':'application/json','X-Requested-With':'soma-web'},body:JSON.stringify(data),credentials:'same-origin'});
    const result=await response.json();
    if(!response.ok) throw Error(result.error||'Não foi possível entrar.');
    window.location.assign('/app');
  }catch(error){ $('authError').hidden=false; $('authError').textContent=error.message; }
  finally{ submit.disabled=false; submit.textContent=mode==='register'?'Criar minha conta ↗':'Entrar no meu espaço ↗'; }
});
fetch('/api/auth/me',{credentials:'same-origin'}).then(r=>{if(r.ok) window.location.assign('/app')}).catch(()=>{});
