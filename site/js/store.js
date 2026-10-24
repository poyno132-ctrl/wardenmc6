(function(){
  var $=function(i){return document.getElementById(i)};
  var me=null,cat=null,tab='coin',mode='login',pending=null;
  var TABS={coin:'Coin yükle',rank:'Rütbeler',key:'Kasa anahtarları',set:'Özel setler'};
  function toast(m){var t=$('toast');t.textContent=m;t.classList.add('on');clearTimeout(toast.t);toast.t=setTimeout(function(){t.classList.remove('on')},3800)}
  function api(url,body){
    return fetch(url,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{}).then(function(r){
      return r.json().catch(function(){return{}}).then(function(j){if(!r.ok)throw new Error(j.error||'İstek başarısız');return j});
    });
  }
  function open(d){if(d.showModal&&!d.open)d.showModal();else d.setAttribute('open','')}
  function close(d){if(d.close)d.close();else d.removeAttribute('open')}
  function paint(){$('acct').textContent=me?me.name+' · '+me.coin+' coin':'Giriş yap'}
  function drawTabs(){
    var box=$('tabs');box.innerHTML='';
    Object.keys(TABS).forEach(function(k){
      var b=document.createElement('button');b.type='button';b.setAttribute('role','tab');b.setAttribute('aria-selected',k===tab);b.textContent=TABS[k];
      b.onclick=function(){tab=k;drawTabs();drawItems()};box.appendChild(b);
    });
  }
  function drawItems(){
    var box=$('items');box.innerHTML='';if(!cat)return;
    cat[tab].forEach(function(it){
      var a=document.createElement('article');a.className='item';a.style.setProperty('--c','var(--'+(it.c||'cyan')+')');
      var h=document.createElement('h3');h.textContent=it.n;
      var p=document.createElement('p');p.textContent=it.d;
      var pr=document.createElement('div');pr.className='price';
      pr.innerHTML=tab==='coin'?it.tl+' ₺ <small>= '+it.coin+' coin</small>':it.p+' <small>coin</small>';
      var b=document.createElement('button');b.type='button';b.className='btn'+(tab==='coin'?' amber':'');
      b.textContent=tab==='coin'?'Satın al':'Coin ile al';b.onclick=function(){buy(it)};
      [h,p,pr,b].forEach(function(x){a.appendChild(x)});box.appendChild(a);
    });
  }
  function buy(it){
    if(!me){openAuth('login');toast('Satın almak için önce giriş yap.');return}
    if(tab==='coin'){pending=it;open($('payDlg'));return}
    if(me.coin<it.p){tab='coin';drawTabs();drawItems();toast('Yetersiz coin. Önce coin yükle.');return}
    api('/api/buy',{id:it.id}).then(function(r){me.coin=r.coin;paint();toast(it.n+' satın alındı. Oyunda otomatik teslim edilir.')}).catch(function(e){toast(e.message)});
  }
  function setMode(m){
    mode=m;var reg=m==='register';
    $('authTitle').textContent=reg?'Kayıt ol':'Giriş yap';$('authGo').textContent=reg?'Kayıt ol':'Giriş yap';
    $('mailRow').hidden=!reg;$('modeLogin').className=reg?'':'on';$('modeReg').className=reg?'on':'';$('authErr').textContent='';
  }
  function openAuth(m){setMode(m);open($('authDlg'))}
  $('modeLogin').onclick=function(){setMode('login')};$('modeReg').onclick=function(){setMode('register')};
  $('authX').onclick=function(){close($('authDlg'))};
  $('authForm').onsubmit=function(e){
    e.preventDefault();
    api(mode==='register'?'/api/register':'/api/login',{name:$('fName').value.trim(),email:$('fMail').value.trim(),password:$('fPass').value})
      .then(function(r){me=r;paint();$('fPass').value='';close($('authDlg'));toast('Hoş geldin '+r.name+'.')})
      .catch(function(x){$('authErr').textContent=x.message});
  };
  $('acct').onclick=function(){
    if(!me){openAuth('login');return}
    $('acctName').textContent=me.name;$('acctCoin').textContent='Bakiye: '+me.coin+' coin';open($('acctDlg'));
  };
  $('acctClose').onclick=function(){close($('acctDlg'))};
  $('logout').onclick=function(){api('/api/logout',{}).then(function(){me=null;paint();close($('acctDlg'));toast('Çıkış yapıldı.')})};
  $('payX').onclick=function(){close($('payDlg'))};
  $('payForm').onsubmit=function(e){
    e.preventDefault();
    api('/api/pay/create',{packId:pending.id,fullName:$('pName').value.trim(),phone:$('pPhone').value.trim()})
      .then(function(r){close($('payDlg'));$('payFrame').src='https://www.paytr.com/odeme/guvenli/'+r.token;open($('frameDlg'))})
      .catch(function(x){$('payErr').textContent=x.message});
  };
  $('frameX').onclick=function(){close($('frameDlg'));$('payFrame').src='about:blank';refresh()};
  function refresh(){return api('/api/me').then(function(r){me=r;paint()}).catch(function(){me=null;paint()})}
  api('/api/catalog').then(function(c){cat=c;drawTabs();drawItems();return refresh()}).then(function(){
    var q=new URLSearchParams(location.search);
    if(q.get('odeme')==='ok')toast('Ödeme alındı. Coin birkaç saniye içinde hesabına eklenir.');
    if(q.get('odeme')==='fail')toast('Ödeme tamamlanamadı.');
    if(q.get('giris')&&!me)openAuth('login');
  }).catch(function(){
    var s=$('status');s.classList.add('err');s.textContent='Mağaza sunucusuna ulaşılamıyor. server klasörünü çalıştır (README.md).';
  });
  drawTabs();
})();
