require('dotenv').config();
const express=require('express'),crypto=require('crypto'),path=require('path');
const {Pool}=require('pg');
const CAT=require('./catalog'),E=process.env,app=express();

// --- PostgreSQL bağlantı havuzu (Neon) ---
const pool=new Pool({
  connectionString:E.DATABASE_URL,
  ssl:{rejectUnauthorized:false}
});

// --- Tabloları ilk çalıştırmada oluştur ---
async function initDb(){
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      key TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      salt TEXT NOT NULL,
      hash TEXT NOT NULL,
      coin INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS orders (
      oid TEXT PRIMARY KEY,
      user_key TEXT NOT NULL,
      coin INTEGER NOT NULL,
      tl NUMERIC NOT NULL,
      status TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS deliveries (
      id TEXT PRIMARY KEY,
      user_name TEXT NOT NULL,
      item TEXT NOT NULL,
      label TEXT NOT NULL,
      done BOOLEAN NOT NULL DEFAULT FALSE,
      at BIGINT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS coin_log (
      id BIGSERIAL PRIMARY KEY,
      user_key TEXT NOT NULL,
      admin_user TEXT NOT NULL,
      amount INTEGER NOT NULL,
      reason TEXT NOT NULL,
      at BIGINT NOT NULL
    );
    ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at BIGINT;
    ALTER TABLE users ALTER COLUMN created_at SET DEFAULT (extract(epoch from now())*1000)::bigint;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS created_at BIGINT;
    ALTER TABLE orders ALTER COLUMN created_at SET DEFAULT (extract(epoch from now())*1000)::bigint;
  `);
}
initDb().catch(e=>console.error('DB init hatası:',e));

const sess=new Map(),NAME=/^[A-Za-z0-9_]{3,16}$/;
const ITEMS=Object.fromEntries([...CAT.rank,...CAT.key,...CAT.set].map(i=>[i.id,i]));
const PACKS=Object.fromEntries(CAT.coin.map(i=>[i.id,i]));
app.set('trust proxy',1);app.use(express.json());app.use(express.urlencoded({extended:false}));
const sid=r=>Object.fromEntries((r.headers.cookie||'').split(';').filter(Boolean).map(c=>c.trim().split('=')))['sid'];
const pub=u=>({name:u.name,coin:u.coin});
const hash=(p,s)=>crypto.scryptSync(p,s,64).toString('hex');
function start(res,k){const t=crypto.randomBytes(24).toString('hex');sess.set(t,k);
  res.setHeader('Set-Cookie',`sid=${t}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000${E.NODE_ENV==='production'?'; Secure':''}`)}

// --- ACME http-01 doğrulama dosyaları ---
app.use('/.well-known/acme-challenge',express.static(path.join(__dirname,'.well-known','acme-challenge'),{dotfiles:'allow'}));

// --- Oturum doğrulama ---
const auth=async(req,res,next)=>{
  const k=sess.get(sid(req));
  if(!k)return res.status(401).json({error:'Önce giriş yapmalısın.'});
  try{
    const r=await pool.query('SELECT * FROM users WHERE key=$1',[k]);
    if(!r.rows[0])return res.status(401).json({error:'Önce giriş yapmalısın.'});
    req.k=k;req.u=r.rows[0];next();
  }catch(e){res.status(500).json({error:'Veritabanı hatası.'})}
};

app.get('/api/catalog',(q,r)=>r.json(CAT));

app.post('/api/register',async(req,res)=>{
  const {name,email,password}=req.body||{};
  if(!NAME.test(name||''))return res.status(400).json({error:'Kullanıcı adı 3-16 karakter olmalı (harf, rakam, _).'});
  if(!/^\S+@\S+\.\S+$/.test(email||''))return res.status(400).json({error:'Geçerli bir e-posta gir.'});
  if((password||'').length<6)return res.status(400).json({error:'Şifre en az 6 karakter olmalı.'});
  const k=name.toLowerCase();
  try{
    const ex=await pool.query('SELECT 1 FROM users WHERE key=$1',[k]);
    if(ex.rows[0])return res.status(409).json({error:'Bu kullanıcı adı alınmış.'});
    const salt=crypto.randomBytes(16).toString('hex');
    const h=hash(password,salt);
    const r=await pool.query(
      'INSERT INTO users (key,name,email,salt,hash,coin) VALUES ($1,$2,$3,$4,$5,0) RETURNING name,coin',
      [k,name,email,salt,h]
    );
    start(res,k);res.json(pub(r.rows[0]));
  }catch(e){res.status(500).json({error:'Veritabanı hatası.'})}
});

app.post('/api/login',async(req,res)=>{
  const {name,password}=req.body||{},k=String(name||'').toLowerCase();
  try{
    const r=await pool.query('SELECT * FROM users WHERE key=$1',[k]);
    const u=r.rows[0];
    if(!u||!crypto.timingSafeEqual(Buffer.from(hash(String(password||''),u.salt),'hex'),Buffer.from(u.hash,'hex')))
      return res.status(401).json({error:'Kullanıcı adı veya şifre hatalı.'});
    start(res,k);res.json(pub(u));
  }catch(e){res.status(500).json({error:'Veritabanı hatası.'})}
});

app.post('/api/logout',(req,res)=>{sess.delete(sid(req));res.setHeader('Set-Cookie','sid=; Max-Age=0; Path=/');res.json({ok:true})});
app.get('/api/me',auth,(req,res)=>res.json(pub(req.u)));

app.post('/api/buy',auth,async(req,res)=>{
  const it=ITEMS[(req.body||{}).id];
  if(!it)return res.status(400).json({error:'Ürün bulunamadı.'});
  if(req.u.coin<it.p)return res.status(400).json({error:'Yetersiz coin.'});
  try{
    await pool.query('UPDATE users SET coin=coin-$1 WHERE key=$2',[it.p,req.k]);
    await pool.query(
      'INSERT INTO deliveries (id,user_name,item,label,done,at) VALUES ($1,$2,$3,$4,FALSE,$5)',
      [crypto.randomUUID(),req.u.name,it.id,it.n,Date.now()]
    );
    const r=await pool.query('SELECT name,coin FROM users WHERE key=$1',[req.k]);
    res.json(pub(r.rows[0]));
  }catch(e){res.status(500).json({error:'Veritabanı hatası.'})}
});

app.get('/api/deliveries',async(req,res)=>{
  if(!E.PLUGIN_KEY||req.headers['x-plugin-key']!==E.PLUGIN_KEY)return res.status(403).json({error:'yetkisiz'});
  try{
    const r=await pool.query('SELECT id,user_name AS user,item,label FROM deliveries WHERE done=FALSE');
    if(r.rows.length)await pool.query('UPDATE deliveries SET done=TRUE WHERE id=ANY($1)',[r.rows.map(x=>x.id)]);
    res.json(r.rows);
  }catch(e){res.status(500).json({error:'Veritabanı hatası.'})}
});

app.post('/api/pay/create',auth,async(req,res)=>{
  const pack=PACKS[(req.body||{}).id||(req.body||{}).packId];
  if(!pack)return res.status(400).json({error:'Paket bulunamadı.'});
  if(!E.PAYTR_MERCHANT_ID)return res.status(503).json({error:'Ödeme sistemi henüz yapılandırılmadı.'});
  const {fullName,phone}=req.body,oid='WMC'+Date.now()+crypto.randomBytes(3).toString('hex');
  const ip=(req.ip||'').replace('::ffff:',''),amount=String(pack.tl*100),test=E.PAYTR_TEST_MODE||'1';
  const basket=Buffer.from(JSON.stringify([[pack.n,pack.tl.toFixed(2),1]])).toString('base64');
  const sig=E.PAYTR_MERCHANT_ID+ip+oid+req.u.email+amount+basket+'0'+'0'+'TL'+test;
  const token=crypto.createHmac('sha256',E.PAYTR_MERCHANT_KEY).update(sig+E.PAYTR_MERCHANT_SALT).digest('base64');
  const body=new URLSearchParams({merchant_id:E.PAYTR_MERCHANT_ID,user_ip:ip,merchant_oid:oid,email:req.u.email,payment_amount:amount,
    paytr_token:token,user_basket:basket,debug_on:'1',no_installment:'0',max_installment:'0',user_name:String(fullName||req.u.name),
    user_address:'Dijital ürün',user_phone:String(phone||''),merchant_ok_url:E.SITE_URL+'/magaza.html?odeme=ok',
    merchant_fail_url:E.SITE_URL+'/magaza.html?odeme=fail',timeout_limit:'30',currency:'TL',test_mode:test});
  try{
    const r=await fetch('https://www.paytr.com/odeme/api/get-token',{method:'POST',body});
    const j=await r.json();
    if(j.status!=='success')return res.status(502).json({error:'Ödeme başlatılamadı: '+(j.reason||'bilinmeyen hata')});
    await pool.query('INSERT INTO orders (oid,user_key,coin,tl,status) VALUES ($1,$2,$3,$4,$5)',
      [oid,req.k,pack.coin,pack.tl,'pending']);
    res.json({token:j.token});
  }catch(e){res.status(502).json({error:'Ödeme sağlayıcısına ulaşılamadı.'})}
});

app.post('/api/pay/callback',async(req,res)=>{
  const {merchant_oid:oid,status,total_amount:total,hash:h}=req.body||{};
  const calc=crypto.createHmac('sha256',E.PAYTR_MERCHANT_KEY||'').update(String(oid)+(E.PAYTR_MERCHANT_SALT||'')+status+total).digest('base64');
  if(calc!==h)return res.status(400).send('PAYTR notification failed: bad hash');
  try{
    const r=await pool.query('SELECT * FROM orders WHERE oid=$1',[oid]);
    const o=r.rows[0];
    if(o&&o.status==='pending'){
      if(status==='success'){
        await pool.query('UPDATE users SET coin=coin+$1 WHERE key=$2',[o.coin,o.user_key]);
        await pool.query('UPDATE orders SET status=$1 WHERE oid=$2',['paid',oid]);
      }else{
        await pool.query('UPDATE orders SET status=$1 WHERE oid=$2',['failed',oid]);
      }
    }
    res.send('OK');
  }catch(e){res.status(500).send('DB error')}
});

// ================= YÖNETİM PANELİ =================
// .env içinde ADMIN_USER ve ADMIN_PASS tanımlı olmalı.
const adm=express.Router(),adminSess=new Map(),loginFails=new Map();
const sha=s=>crypto.createHash('sha256').update(String(s)).digest();
const same=(a,b)=>crypto.timingSafeEqual(sha(a),sha(b));
const wrap=fn=>(req,res)=>Promise.resolve(fn(req,res)).catch(e=>{console.error('Admin hatası:',e.message);res.status(500).json({error:'Veritabanı hatası.'})});
setInterval(()=>{const n=Date.now();
  for(const [t,x] of adminSess)if(x<n)adminSess.delete(t);
  for(const [i,f] of loginFails)if(f.t<n)loginFails.delete(i);
},600000).unref();

adm.use((req,res,next)=>{res.setHeader('Cache-Control','no-store');next()});

adm.post('/login',(req,res)=>{
  if(!E.ADMIN_USER||!E.ADMIN_PASS)return res.status(503).json({error:'Yönetici girişi yapılandırılmadı (ADMIN_USER ve ADMIN_PASS).'});
  const ip=req.ip||'x',f=loginFails.get(ip);
  if(f&&f.n>=5&&f.t>Date.now())return res.status(429).json({error:'Çok fazla deneme. 15 dakika sonra tekrar dene.'});
  const {username,password}=req.body||{};
  const a=same(username||'',E.ADMIN_USER),b=same(password||'',E.ADMIN_PASS);
  if(!(a&&b)){
    const n=(f&&f.t>Date.now()?f.n:0)+1;
    loginFails.set(ip,{n,t:Date.now()+900000});
    return res.status(401).json({error:'Kullanıcı adı veya şifre hatalı.'});
  }
  loginFails.delete(ip);
  const token=crypto.randomBytes(32).toString('hex');
  adminSess.set(token,Date.now()+12*3600*1000);
  res.json({token});
});

// Bundan sonraki her uç nokta yönetici girişi ister.
adm.use((req,res,next)=>{
  const h=req.headers.authorization||'',t=h.startsWith('Bearer ')?h.slice(7):'';
  const exp=adminSess.get(t);
  if(!exp||exp<Date.now()){adminSess.delete(t);return res.status(401).json({error:'Yönetici girişi gerekli.'})}
  next();
});

adm.get('/stats',wrap(async(req,res)=>{
  const day=3*3600*1000,start=Math.floor((Date.now()+day)/86400000)*86400000-day; // İstanbul günü (UTC+3)
  const u=await pool.query('SELECT COUNT(*) AS n, COALESCE(SUM(coin),0) AS coins FROM users');
  const o=await pool.query("SELECT COUNT(*) AS n, COALESCE(SUM(tl),0) AS rev FROM orders WHERE status='paid' AND created_at>=$1",[start]);
  res.json({users:Number(u.rows[0].n),coinsTotal:Number(u.rows[0].coins),ordersToday:Number(o.rows[0].n),revenueToday:Number(o.rows[0].rev)});
}));

adm.get('/users',wrap(async(req,res)=>{
  const q=String(req.query.q||'').trim().slice(0,32).replace(/[\\%_]/g,'\\$&');
  const r=await pool.query('SELECT name,email,coin,created_at FROM users WHERE name ILIKE $1 ORDER BY LOWER(name) LIMIT 100',['%'+q+'%']);
  res.json(r.rows.map(x=>({name:x.name,email:x.email,coins:x.coin,createdAt:x.created_at?Number(x.created_at):null})));
}));

adm.post('/users/:name/coins',wrap(async(req,res)=>{
  const k=String(req.params.name||'').toLowerCase();
  const amount=Number((req.body||{}).amount),reason=String((req.body||{}).reason||'').trim().slice(0,120);
  if(!Number.isInteger(amount)||amount===0||Math.abs(amount)>1000000)return res.status(400).json({error:'Miktar sıfırdan farklı bir tam sayı olmalı.'});
  if(!reason)return res.status(400).json({error:'Sebep yazmalısın.'});
  const c=await pool.connect();
  try{
    await c.query('BEGIN');
    const r=await c.query('UPDATE users SET coin=coin+$1 WHERE key=$2 AND coin+$1>=0 RETURNING coin',[amount,k]);
    if(!r.rows[0]){
      await c.query('ROLLBACK');
      const ex=await pool.query('SELECT 1 FROM users WHERE key=$1',[k]);
      return ex.rows[0]?res.status(400).json({error:'Oyuncunun coini bu kadar değil.'}):res.status(404).json({error:'Oyuncu bulunamadı.'});
    }
    await c.query('INSERT INTO coin_log (user_key,admin_user,amount,reason,at) VALUES ($1,$2,$3,$4,$5)',[k,E.ADMIN_USER,amount,reason,Date.now()]);
    await c.query('COMMIT');
    res.json({coins:r.rows[0].coin});
  }catch(e){
    await c.query('ROLLBACK').catch(()=>{});
    throw e;
  }finally{c.release()}
}));

adm.post('/users/:name/give',wrap(async(req,res)=>{
  const k=String(req.params.name||'').toLowerCase(),it=ITEMS[(req.body||{}).id];
  const reason=String((req.body||{}).reason||'').trim().slice(0,80);
  if(!it)return res.status(400).json({error:'Ürün bulunamadı.'});
  const u=await pool.query('SELECT name FROM users WHERE key=$1',[k]);
  if(!u.rows[0])return res.status(404).json({error:'Oyuncu bulunamadı.'});
  await pool.query('INSERT INTO deliveries (id,user_name,item,label,done,at) VALUES ($1,$2,$3,$4,FALSE,$5)',
    [crypto.randomUUID(),u.rows[0].name,it.id,it.n,Date.now()]);
  await pool.query('INSERT INTO coin_log (user_key,admin_user,amount,reason,at) VALUES ($1,$2,0,$3,$4)',
    [k,E.ADMIN_USER,'Ürün verildi: '+it.n+(reason?' ('+reason+')':''),Date.now()]);
  res.json({ok:true});
}));

adm.get('/orders',wrap(async(req,res)=>{
  const r=await pool.query('SELECT o.oid,u.name AS player,o.user_key,o.tl,o.coin,o.status,o.created_at FROM orders o LEFT JOIN users u ON u.key=o.user_key ORDER BY o.created_at DESC NULLS LAST, o.oid DESC LIMIT 200');
  res.json(r.rows.map(x=>({oid:x.oid,player:x.player||x.user_key,amount:Number(x.tl),coin:x.coin,status:x.status,createdAt:x.created_at?Number(x.created_at):null})));
}));

adm.get('/deliveries',wrap(async(req,res)=>{
  const r=await pool.query('SELECT id,user_name,label,done,at FROM deliveries ORDER BY at DESC LIMIT 200');
  res.json(r.rows.map(x=>({id:x.id,player:x.user_name,label:x.label,done:x.done,createdAt:Number(x.at)})));
}));

adm.post('/deliveries/:id/requeue',wrap(async(req,res)=>{
  const r=await pool.query('UPDATE deliveries SET done=FALSE WHERE id=$1 RETURNING id',[req.params.id]);
  if(!r.rows[0])return res.status(404).json({error:'Teslimat bulunamadı.'});
  res.json({ok:true});
}));

adm.get('/products',(req,res)=>{
  const names={coin:'Coin paketi',rank:'Rütbe',key:'Kasa anahtarı',set:'Set'},out=[];
  for(const cat of Object.keys(names))for(const i of CAT[cat]||[])
    out.push({id:i.id,name:i.n,category:names[cat],price:cat==='coin'?i.tl:i.p,unit:cat==='coin'?'₺':'coin'});
  res.json(out);
});

app.use('/api/admin',adm);

// --- Statik dosyalar: site klasörü server'ın bir üst dizininde ---
const SITE_DIR = path.resolve(__dirname, '..', 'site');
app.use(express.static(SITE_DIR));

app.get('/', (req, res) => {
  res.sendFile(path.join(SITE_DIR, 'index.html'), (err) => {
    if (err) {
      console.error('index.html okunamadı:', err.message);
      console.error('Aranan yol:', path.join(SITE_DIR, 'index.html'));
      res.status(404).send('index.html bulunamadı. site klasörü server ile aynı üst dizinde mi?');
    }
  });
});

app.listen(E.PORT||3000,()=>console.log('WardenMC: http://localhost:'+(E.PORT||3000)));