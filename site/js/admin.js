/* WardenMC yönetim paneli (ön yüz). Uç noktalar server.js içinde: /api/admin/... */
(() => {
  const $ = s => document.querySelector(s);
  const API = '/api/admin';
  const KEY = 'wmc_admin_token';
  let token = sessionStorage.getItem(KEY) || '';
  let tab = 'stats';

  const h = (tag, attrs, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === 'class') n.className = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v);
    }
    n.append(...kids.filter(x => x !== null && x !== undefined));
    return n;
  };
  const fmtDate = d => d ? new Date(d).toLocaleString('tr-TR') : '-';
  const fmtNum = n => Number(n || 0).toLocaleString('tr-TR');
  const money = n => fmtNum(n) + ' ₺';

  let toastT;
  const toast = msg => {
    const t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2600);
  };

  async function api(path, { method = 'GET', body } = {}) {
    const res = await fetch(API + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
      body: body ? JSON.stringify(body) : undefined
    });
    if (res.status === 401 && token) { signOut(); throw new Error('Oturum süresi doldu.'); }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'İstek başarısız oldu.');
    return data;
  }

  function show() {
    $('#login').hidden = !!token;
    $('#app').hidden = !token;
    if (token) render();
  }
  function signOut() { token = ''; sessionStorage.removeItem(KEY); show(); }

  $('#loginForm').addEventListener('submit', async e => {
    e.preventDefault();
    $('#lErr').textContent = '';
    try {
      const r = await api('/login', { method: 'POST', body: { username: $('#lUser').value.trim(), password: $('#lPass').value } });
      token = r.token; sessionStorage.setItem(KEY, token); $('#lPass').value = ''; show();
    } catch (err) { $('#lErr').textContent = err.message; }
  });
  $('#logout').addEventListener('click', signOut);

  $('#tabs').addEventListener('click', e => {
    const b = e.target.closest('[data-tab]'); if (!b) return;
    tab = b.dataset.tab;
    document.querySelectorAll('#tabs [data-tab]').forEach(x => x.setAttribute('aria-selected', x === b));
    render();
  });
  document.querySelectorAll('dialog [data-close]').forEach(b => b.addEventListener('click', () => b.closest('dialog').close()));

  const table = (cols, rows, emptyMsg) => {
    if (!rows.length) return h('div', { class: 'tbl' }, h('p', { class: 'empty' }, emptyMsg));
    return h('div', { class: 'tbl' }, h('table', {},
      h('thead', {}, h('tr', {}, ...cols.map(c => h('th', {}, c.h)))),
      h('tbody', {}, ...rows.map(r => h('tr', {}, ...cols.map(c => h('td', {}, c.f(r))))))
    ));
  };

  async function render() {
    const v = $('#view');
    v.replaceChildren(h('p', { class: 'empty' }, 'Yükleniyor…'));
    try { await ({ stats: vStats, users: vUsers, orders: vOrders, deliveries: vDeliveries, products: vProducts })[tab](v); }
    catch (err) { v.replaceChildren(h('p', { class: 'empty' }, err.message)); }
  }

  async function vStats(v) {
    const s = await api('/stats');
    const card = (l, val) => h('div', { class: 'stat' }, h('span', {}, l), h('strong', {}, val));
    v.replaceChildren(h('h2', {}, 'Özet'), h('div', { class: 'stats' },
      card('Kayıtlı oyuncu', fmtNum(s.users)),
      card('Bugünkü sipariş', fmtNum(s.ordersToday)),
      card('Bugünkü gelir', money(s.revenueToday)),
      card('Dolaşımdaki coin', fmtNum(s.coinsTotal))));
  }

  async function vUsers(v, q = '') {
    const rows = await api('/users?q=' + encodeURIComponent(q));
    const search = h('input', { type: 'search', placeholder: 'Oyuncu ara', 'aria-label': 'Oyuncu ara', value: q });
    let t; search.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => vUsers(v, search.value.trim()).then(() => $('#view input').focus()), 350); });
    v.replaceChildren(
      h('div', { class: 'bar' }, h('h2', { style: 'margin:0' }, 'Oyuncular'), search),
      table([
        { h: 'Oyuncu', f: r => r.name },
        { h: 'E-posta', f: r => r.email },
        { h: 'Coin', f: r => fmtNum(r.coins) },
        { h: 'Kayıt', f: r => fmtDate(r.createdAt) },
        { h: '', f: r => h('div', { class: 'acts' },
            h('button', { class: 'btn sm ghost', type: 'button', onclick: () => giveDialog(r) }, 'Ürün ver'),
            h('button', { class: 'btn sm ghost', type: 'button', onclick: () => coinDialog(r) }, 'Coin ayarla')) }
      ], rows, 'Oyuncu bulunamadı.'));
  }

  let giveItems = null;
  async function giveDialog(user) {
    $('#giveTitle').textContent = user.name + ' için ürün ver';
    $('#gWhy').value = ''; $('#gErr').textContent = '';
    try { if (!giveItems) giveItems = (await api('/products')).filter(p => p.unit === 'coin'); }
    catch (err) { toast(err.message); return; }
    const groups = {};
    giveItems.forEach(p => (groups[p.category] = groups[p.category] || []).push(p));
    const sel = $('#gItem');
    sel.replaceChildren(...Object.entries(groups).map(([c, list]) =>
      h('optgroup', { label: c }, ...list.map(p => h('option', { value: p.id }, p.name)))));
    $('#giveForm').onsubmit = async e => {
      e.preventDefault();
      try {
        await api('/users/' + encodeURIComponent(user.name) + '/give', { method: 'POST', body: { id: sel.value, reason: $('#gWhy').value.trim() } });
        $('#giveDlg').close(); toast('Teslimat sıraya eklendi');
      } catch (err) { $('#gErr').textContent = err.message; }
    };
    $('#giveDlg').showModal();
  }

  function coinDialog(user) {
    $('#coinTitle').textContent = user.name + ' için coin ayarla';
    $('#cAmt').value = ''; $('#cWhy').value = ''; $('#cErr').textContent = '';
    $('#coinForm').onsubmit = async e => {
      e.preventDefault();
      const amount = parseInt($('#cAmt').value, 10);
      if (!amount) { $('#cErr').textContent = 'Sıfırdan farklı bir miktar gir.'; return; }
      try {
        await api('/users/' + encodeURIComponent(user.name) + '/coins', { method: 'POST', body: { amount, reason: $('#cWhy').value.trim() } });
        $('#coinDlg').close(); toast('Coin güncellendi'); render();
      } catch (err) { $('#cErr').textContent = err.message; }
    };
    $('#coinDlg').showModal();
  }

  async function vOrders(v) {
    const rows = await api('/orders');
    const st = { paid: ['ok', 'Ödendi'], pending: ['wait', 'Bekliyor'], failed: ['fail', 'Başarısız'] };
    v.replaceChildren(h('h2', {}, 'Siparişler'), table([
      { h: 'Sipariş no', f: r => r.oid },
      { h: 'Oyuncu', f: r => r.player },
      { h: 'Tutar', f: r => money(r.amount) },
      { h: 'Coin', f: r => fmtNum(r.coin) },
      { h: 'Durum', f: r => { const [c, l] = st[r.status] || ['', r.status]; return h('span', { class: 'tag ' + c }, l); } },
      { h: 'Tarih', f: r => fmtDate(r.createdAt) }
    ], rows, 'Henüz sipariş yok.'));
  }

  async function vDeliveries(v) {
    const rows = await api('/deliveries');
    v.replaceChildren(h('h2', {}, 'Teslimatlar'), table([
      { h: 'Oyuncu', f: r => r.player },
      { h: 'Ürün', f: r => r.label },
      { h: 'Durum', f: r => h('span', { class: 'tag ' + (r.done ? 'ok' : 'wait') }, r.done ? 'Teslim edildi' : 'Bekliyor') },
      { h: 'Tarih', f: r => fmtDate(r.createdAt) },
      { h: '', f: r => r.done ? h('button', { class: 'btn sm ghost', type: 'button', onclick: () => requeue(r) }, 'Tekrar gönder') : null }
    ], rows, 'Henüz teslimat yok.'));
  }

  async function requeue(r) {
    if (!confirm(r.player + ' için "' + r.label + '" tekrar teslimat sırasına alınsın mı? Oyuncu ürünü bir kez daha alabilir.')) return;
    try { await api('/deliveries/' + encodeURIComponent(r.id) + '/requeue', { method: 'POST' }); toast('Teslimat sıraya alındı'); render(); }
    catch (err) { toast(err.message); }
  }

  async function vProducts(v) {
    const rows = await api('/products');
    v.replaceChildren(
      h('h2', {}, 'Ürünler'),
      h('p', { style: 'color:var(--mute);margin:0 0 1rem' }, 'Ürünler ve fiyatlar server\\catalog.js dosyasından gelir. Değiştirmek için o dosyayı düzenleyip siteyi yeniden yayınla.'),
      table([
        { h: 'Ürün', f: r => r.name },
        { h: 'Kategori', f: r => r.category },
        { h: 'Fiyat', f: r => fmtNum(r.price) + ' ' + r.unit },
        { h: 'Kod', f: r => r.id }
      ], rows, 'Ürün yok.'));
  }

  show();
})();