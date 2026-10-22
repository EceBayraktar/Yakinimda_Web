const VERSION = '0.8';

// ---------- Ayarlar ----------
const MIN_ZOOM = 14;       // bu yakınlıktan uzakta restoran yüklenmez (çok geniş alan olur)
const PAGE = 60;           // listede bir seferde gösterilen kart sayısı (haritada hepsi görünür)
const MAX_ELEMENTS = 4000; // bir görünümde en fazla çekilecek mekân
const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter'];

// Mutfağa göre "tipik" referans fiyat. Gerçek veri biriktikçe bölge medyanından hesaplanmalı.
const BASE = {'Köfte':170,'Kebap':140,'Pide':160,'Fast Food':150,'Kahvaltı':180,'Balık':240,'Ev Yemekleri':135,'Uzak Doğu':240,'İtalyan':250,'Diğer':160};
// Kullanıcıya "bu fiyat neyin fiyatı" sorusunu cevaplayan referans ürün
const REF = {'Köfte':'Izgara köfte porsiyonu','Kebap':'Adana kebap porsiyonu','Pide':'Kıymalı pide','Fast Food':'Hamburger menü','Kahvaltı':'Serpme kahvaltı, kişi başı','Balık':'Levrek porsiyonu','Ev Yemekleri':'Günün yemeği ve pilav','Uzak Doğu':'Sushi set','İtalyan':'Makarna','Diğer':'Ortalama ana yemek'};

// Eksik bir öğe sayfanın tamamını bozmasın diye boş bir yedek nesne döner
const $ = id => document.getElementById(id) || {style:{}, value:'', textContent:'', innerHTML:'', classList:{add(){}, remove(){}}};
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// VS Code'un içindeki önizleme panelleri yazmayı ve ağ isteklerini engelleyebilir: gerçek tarayıcıda açılması gerekir
try { if (location.protocol==='file:' || /vscode/i.test(navigator.userAgent)) { const w = document.createElement('p'); w.className='warn'; w.textContent = 'Not: Bu sayfa dosya olarak ya da VS Code önizlemesinde açılmış görünüyor. Yazma, konum ve restoran yükleme çalışmayabilir. Chrome ya da Edge\'de http://localhost:8000 adresinden aç (terminalde klasörün içinde: python -m http.server 8000).'; document.body.insertBefore(w, document.body.firstChild); } } catch (e) {}
try { document.querySelector('header small').insertAdjacentText('beforeend', ' (sürüm '+VERSION+')'); } catch (e) {}

let data = [];          // şu an yüklü mekânlar
let user = null;        // {lat, lng}: konum izni, haritadan seçim ya da aranan yer
let placeQuery = '';    // yer olarak aranmış metin: mekân filtresi olarak kullanılmaz
let limit = PAGE;
let truncated = false;
const selected = new Set();

const placeId = (name, lat, lng) => 'p'+name.toLowerCase().trim()+'@'+lat.toFixed(3)+','+lng.toFixed(3);
const median = a => { const s=[...a].sort((p,q)=>p-q), m=s.length>>1; return s.length%2 ? s[m] : (s[m-1]+s[m])/2; };
const dist = (a,b) => { const t=d=>d*Math.PI/180, dl=t(b.lat-a.lat), dg=t(b.lng-a.lng), h=Math.sin(dl/2)**2+Math.cos(t(a.lat))*Math.cos(t(b.lat))*Math.sin(dg/2)**2; return 12742*Math.asin(Math.sqrt(h)); };
const AVG_RATING = 4.3, MIN_REVIEWS = 100;
const ago = d => d==null ? 'bilinmiyor' : d===0 ? 'bugün' : d===1 ? 'dün' : d+' gün önce';

// Kullanıcının bu tarayıcıda girdiği fiyat ve puanlar (sunucu gelene kadar yerel saklanır)
const LS = 'yakinimda_yerel_v1';
const store = () => { try { return JSON.parse(localStorage.getItem(LS)) || {}; } catch (e) { return {}; } };
function saveLocal(r){ try { const s = store(); s[r.id] = {p:r.reports, t:r.ts, r:r.ratings}; localStorage.setItem(LS, JSON.stringify(s)); } catch (e) {} }

function setSrc(t){ $('src').textContent = t; }
function toast(t){ const e=$('toast'); e.textContent=t; e.classList.add('show'); setTimeout(()=>e.classList.remove('show'),2600); }
function say(t){ setSrc(t); toast(t); }

// Fiyat/performans: yorum sayısına göre düzeltilmiş puan, mutfağa göre göreli fiyata bölünür
function enrich(r){
  r.reviews = r.ratings.length;
  r.rating = r.ratings.length ? r.ratings.reduce((a,b)=>a+b,0)/r.ratings.length : null;
  r.days = r.ts ? Math.floor((Date.now()-r.ts)/864e5) : null;
  r.price = r.reports.length ? Math.round(median(r.reports)) : null;
  if (r.rating==null || r.price==null) { r.idx = null; r.fp = ['Veri bekleniyor','none']; }
  else {
    const adj = r.reviews/(r.reviews+MIN_REVIEWS)*r.rating + MIN_REVIEWS/(r.reviews+MIN_REVIEWS)*AVG_RATING;
    r.idx = (adj/AVG_RATING) / Math.pow(r.price/BASE[r.cuisine], 0.6);
    r.fp = r.idx>=1.1 ? ['Çok iyi','good'] : r.idx>=0.97 ? ['İyi','ok'] : ['Orta','mid'];
  }
  r.km = user ? dist(user, r) : null;
}

function view(){
  data.forEach(enrich);
  const qv = $('q').value.trim(), q = (qv===placeQuery ? '' : qv).toLocaleLowerCase('tr');
  const pm = +$('pmax').value, rm = +$('rmin').value, s = $('sort').value;
  $('pout').textContent = pm>=400 ? 'Sınır yok' : pm+' ₺ ve altı';
  $('rout').textContent = rm===0 ? 'Tümü' : rm.toFixed(1)+' ve üstü';
  const a = data.filter(r =>
    (!selected.size || selected.has(r.cuisine)) &&
    (pm>=400 || (r.price!=null && r.price<=pm)) &&
    (rm===0 || (r.rating!=null && r.rating>=rm)) &&
    (!q || (r.name+' '+r.cuisine+' '+r.hood).toLocaleLowerCase('tr').includes(q)));
  const sorts = {
    rating:(x,y)=>(y.rating??-1)-(x.rating??-1) || (x.km??1e9)-(y.km??1e9),
    fp:(x,y)=>(y.idx??-1)-(x.idx??-1),
    price:(x,y)=>(x.price??1e9)-(y.price??1e9),
    km:(x,y)=>(x.km??1e9)-(y.km??1e9)};
  a.sort(sorts[s]);
  $('count').textContent = a.length.toLocaleString('tr-TR')+' sonuç'+(a.length>limit ? ', ilk '+limit+' kart gösteriliyor (harita hepsini gösterir)' : '');
  drawMap(a);
  const shown = a.slice(0, limit);
  const lowZoom = map && map.getZoom() < MIN_ZOOM;
  $('cards').innerHTML = (shown.length ? shown.map(r=>`
    <article class="card" id="r${r.id}">
      <div class="top"><div><h3>${esc(r.name)}</h3><p class="sub">${esc(r.cuisine)}${r.hood?', '+esc(r.hood):''}</p></div>
        <div class="price"><b>${r.price!=null?'~'+r.price+' ₺':'Fiyat yok'}</b><small>${REF[r.cuisine]}</small></div></div>
      <div class="stats"><span>${r.rating!=null?`<b>★ ${r.rating.toFixed(1)}</b> (${r.reviews.toLocaleString('tr-TR')} yorum)`:'Henüz puan yok'}</span>${r.km!=null?`<span>${r.km.toFixed(1)} km</span>`:''}<span class="fp ${r.fp[1]}">Fiyat/performans: ${r.fp[0]}</span></div>
      <p class="trust">${r.reports.length ? r.reports.length+' fiyat bildirimi, son güncelleme '+ago(r.days) : 'Henüz fiyat bildirilmedi. İlk bildiren sen ol.'}</p>
      <div class="act"><a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(r.name+' '+r.hood)}" target="_blank" rel="noopener">Google'da yorumlar ve menü</a><button data-rep="${r.id}">Fiyat ve puan bildir</button></div>
    </article>`).join('')
    : `<div class="empty">${lowZoom ? 'Restoranları görmek için haritayı yakınlaştır ya da bir semt ara.' : data.length ? 'Bu filtrelere uyan mekân yok. Fiyat sınırını yükseltmeyi veya mutfak seçimini kaldırmayı dene.' : 'Bu görünümde kayıtlı restoran bulunamadı. Haritayı kaydır ya da başka bir yeri ara.'}</div>`)
    + (a.length>limit ? `<button class="more" data-more="1">Daha fazla göster (${Math.min(PAGE, a.length-limit)} kart daha)</button>` : '');
  return a.length;
}

// ---------- Gerçek mekânlar: OpenStreetMap (Overpass API), haritada görünen alan için ----------
function guessCuisine(t){
  const n = (t.name||'').toLocaleLowerCase('tr'), c = (t.cuisine||'').toLowerCase();
  const has = (s, ...k) => k.some(x => s.includes(x));
  if (has(n,'köfte','kofte') || has(c,'meatball')) return 'Köfte';
  if (has(n,'kebap','kebab','döner','doner','ocakbaşı','ocakbasi') || has(c,'kebab','doner','turkish_grill')) return 'Kebap';
  if (has(n,'pide','lahmacun') || has(c,'pide','lahmacun')) return 'Pide';
  if (has(n,'balık','balik') || has(c,'seafood','fish')) return 'Balık';
  if (has(n,'kahvaltı','kahvalti') || has(c,'breakfast')) return 'Kahvaltı';
  if (has(n,'pizza','pasta','trattoria') || has(c,'pizza','italian','pasta')) return 'İtalyan';
  if (has(n,'sushi','wok','noodle') || has(c,'sushi','chinese','japanese','asian','thai','korean','vietnamese')) return 'Uzak Doğu';
  if (has(n,'burger','tavuk','chicken','sandviç','tost') || has(c,'burger','chicken','sandwich','fried_chicken','hot_dog') || t.amenity==='fast_food') return 'Fast Food';
  if (has(n,'ev yemek','lokanta','esnaf') || has(c,'regional','home')) return 'Ev Yemekleri';
  return 'Diğer';
}
async function fetchJson(url, ms){
  const ctl = new AbortController(), t = setTimeout(()=>ctl.abort(), ms);
  try { const r = await fetch(url, {signal:ctl.signal}); if (!r.ok) throw new Error('HTTP '+r.status); return await r.json(); }
  finally { clearTimeout(t); }
}
let loaded = null, loadTimer = null, reqId = 0;
function scheduleLoad(){ clearTimeout(loadTimer); loadTimer = setTimeout(() => loadView(), 500); }
function srcNote(){
  setSrc(data.length.toLocaleString('tr-TR')+' mekân yüklendi (OpenStreetMap katkıcıları).'
    +(truncated ? ' Çok fazla mekân var, bir kısmı gösterilmiyor olabilir; yakınlaştırırsan hepsi gelir.' : '')
    +' Puan ve fiyatlar kullanıcılardan gelir; henüz bildirilmemişse "Veri bekleniyor" yazar.');
}
// Haritanın kendi vektör verisinden (OpenFreeMap) restoran noktaları: ek ağ isteği gerekmez, anında gelir
async function tileFeatures(){
  try {
    await new Promise(res => {
      if (typeof map.areTilesLoaded === 'function' && map.areTilesLoaded()) return res();
      const t = setTimeout(res, 3000); map.once('idle', () => { clearTimeout(t); res(); });
    });
    const st = map.getStyle(), src = Object.keys(st.sources).find(k => st.sources[k].type==='vector');
    if (!src) return [];
    const seen = new Set(), out = [], saved = store();
    for (const f of map.querySourceFeatures(src, {sourceLayer:'poi'})) {
      const p = f.properties || {};
      if (!['restaurant','fast_food'].includes(p.class) && !['restaurant','fast_food'].includes(p.subclass)) continue;
      const name = p.name || p['name:latin'] || p['name:tr']; if (!name || !f.geometry || f.geometry.type!=='Point') continue;
      const [lng, lat] = f.geometry.coordinates, id = placeId(name, lat, lng);
      if (seen.has(id)) continue; seen.add(id);
      const s = saved[id] || {};
      out.push({id, name, cuisine:guessCuisine({name, cuisine:p.cuisine, amenity:p.subclass||p.class}), hood:'', lat, lng, reports:s.p||[], ratings:s.r||[], ts:s.t||0});
    }
    return out;
  } catch (e) { return []; }
}
let ovpLoaded = null; // Overpass'ten ayrıntılı veri yüklenmiş alan
async function loadView(){
  if (!map) return;
  if (map.getZoom() < MIN_ZOOM) {
    reqId++; data = []; ovpLoaded = null;
    setSrc('Restoranları görmek için haritayı biraz daha yakınlaştır (şu an çok uzaksın). Bir semt ya da mekân da arayabilirsin.');
    return view();
  }
  const b = map.getBounds(), S=b.getSouth(), W=b.getWest(), N=b.getNorth(), E=b.getEast();
  if (ovpLoaded && S>=ovpLoaded.S && W>=ovpLoaded.W && N<=ovpLoaded.N && E<=ovpLoaded.E) return; // görünen alan zaten yüklü
  const pl = (N-S)*.2, pg = (E-W)*.2, box = {S:S-pl, W:W-pg, N:N+pl, E:E+pg};
  const my = ++reqId;
  // 1) Haritanın kendi verisi: anında
  const t = await tileFeatures();
  if (my !== reqId) return;
  if (t.length) {
    data = t; truncated = false; limit = PAGE; view();
    setSrc(t.length.toLocaleString('tr-TR')+' mekân gösteriliyor (harita verisi). Mutfak türü ve semt gibi ayrıntılar yükleniyor...');
  } else { data = []; setSrc('Restoranlar yükleniyor...'); view(); $('cards').innerHTML = '<div class="empty">Restoranlar yükleniyor...</div>'; }
  // 2) Overpass: daha ayrıntılı ve eksiksiz veri
  const bb = `(${box.S},${box.W},${box.N},${box.E})`;
  const q = `[out:json][timeout:25];(nwr["amenity"="restaurant"]["name"]${bb};nwr["amenity"="fast_food"]["name"]${bb};);out tags center ${MAX_ELEMENTS};`;
  let j = null, lastErr = '';
  for (const base of OVERPASS) {
    try {
      const r = await fetchJson(base+'?data='+encodeURIComponent(q), 20000);
      // Overpass bazen HTTP 200 ile "zaman aşımı" notu ve boş sonuç döner; bunu hata say
      if (r.remark && /error|timed out|too many/i.test(r.remark)) throw new Error(String(r.remark).slice(0,80));
      j = r; break;
    } catch (e) { lastErr = base.split('/')[2]+': '+(e.name==='AbortError' ? 'zaman aşımı' : e.message); }
    if (my !== reqId) return;
  }
  if (my !== reqId) return; // daha yeni bir istek başladı
  if (j) {
    const saved = store(), seen = new Set();
    data = j.elements.map(el => {
      const tg = el.tags || {}, lat = el.lat ?? (el.center && el.center.lat), lng = el.lon ?? (el.center && el.center.lon);
      if (lat==null || lng==null || !tg.name) return null;
      const id = placeId(tg.name, lat, lng); if (seen.has(id)) return null; seen.add(id);
      const s = saved[id] || {};
      return {id, name:tg.name, cuisine:guessCuisine(tg), hood:tg['addr:suburb']||tg['addr:neighbourhood']||tg['addr:district']||'', lat, lng,
              reports:s.p||[], ratings:s.r||[], ts:s.t||0};
    }).filter(Boolean);
    truncated = j.elements.length >= MAX_ELEMENTS;
    ovpLoaded = box; limit = PAGE; srcNote(); return view();
  }
  if (t.length) setSrc(t.length.toLocaleString('tr-TR')+' mekân gösteriliyor (harita verisi). Ayrıntılı veri servisine ulaşılamadı ('+lastErr+'), mutfak türü tahmini eksik olabilir.');
  else setSrc('Bu görünümde restoran bulunamadı ya da veri servisine ulaşılamadı ('+lastErr+'). Haritayı biraz kaydırıp tekrar dene ya da "Bağlantıyı test et" düğmesine bas.');
}

// Bağlantı testi: hangi servise ulaşılabildiğini ekranda gösterir
(function(){
  const b = document.createElement('button'); b.textContent = 'Bağlantıyı test et'; b.className = 'diagbtn';
  const pre = document.createElement('pre'); pre.className = 'diag'; pre.hidden = true;
  try { $('src').insertAdjacentElement('afterend', pre); $('src').insertAdjacentElement('afterend', b); } catch (e) {}
  b.onclick = async () => {
    pre.hidden = false; pre.textContent = 'Test ediliyor...';
    const q = encodeURIComponent('[out:json][timeout:15];nwr["amenity"="restaurant"]["name"](40.985,29.020,40.990,29.026);out tags center 3;');
    const tests = OVERPASS.map(u => [u.split('/')[2], u+'?data='+q, j => j.remark ? 'cevap geldi ama not: '+String(j.remark).slice(0,60) : (j.elements||[]).length+' mekân'])
      .concat([['photon.komoot.io (yer arama)', 'https://photon.komoot.io/api/?limit=1&q=Kadikoy', j => (j.features||[]).length+' sonuç'],
               ['nominatim (yedek yer arama)', 'https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=tr&q=Kadikoy', j => j.length+' sonuç'],
               ['tiles.openfreemap.org (harita)', 'https://tiles.openfreemap.org/planet', j => j.tiles ? 'çalışıyor' : 'beklenmeyen cevap']]);
    const lines = [];
    for (const [n, u, ok] of tests) {
      const t0 = Date.now();
      try { const j = await fetchJson(u, 15000); lines.push('OK    '+n+': '+ok(j)+' ('+(Date.now()-t0)+' ms)'); }
      catch (e) { lines.push('HATA  '+n+': '+(e.name==='AbortError' ? 'zaman aşımı' : e.message)); }
      pre.textContent = lines.join('\n');
    }
  };
})();

// ---------- Semt / yer arama (Photon, yedek: Nominatim; ikisi de ücretsiz) ----------
async function geocode(q){
  try {
    const f = (await fetchJson('https://photon.komoot.io/api/?limit=1&bbox=25.5,35.8,45,42.2&q='+encodeURIComponent(q), 8000)).features[0];
    if (f) return {lat:f.geometry.coordinates[1], lng:f.geometry.coordinates[0], name:f.properties.name || q};
  } catch (e) {}
  try {
    const f = (await fetchJson('https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=tr&q='+encodeURIComponent(q), 8000))[0];
    if (f) return {lat:+f.lat, lng:+f.lon, name:q};
  } catch (e) { return {error:true}; }
  return null;
}
async function search(){
  const q = $('q').value.trim(); limit = PAGE; view();
  if (!q) return;
  const ql = q.toLocaleLowerCase('tr');
  if (data.some(r => (r.name+' '+r.cuisine+' '+r.hood).toLocaleLowerCase('tr').includes(ql))) return; // yüklü mekânlarda eşleşti
  setSrc('"'+q+'" yer olarak aranıyor...');
  const g = await geocode(q);
  if (!g) return say('"'+q+'" için sonuç bulunamadı. Başka bir yazım dene ya da haritada kaydır.');
  if (g.error) return say('Yer arama servisine ulaşılamadı. İnternet bağlantını kontrol et; sorun sürerse haritayı elle kaydırıp yakınlaştır.');
  placeQuery = q;
  $('locstat').textContent = g.name+' bölgesi gösteriliyor.';
  setUser(g.lat, g.lng, true);
}

// ---------- Harita: MapLibre GL + OpenFreeMap (ücretsiz, anahtar gerektirmez) ----------
let map = null, meMarker = null, pinMarkers = [], lastList = [];
function mapMsg(t){ $('map').innerHTML = '<div class="map-msg">'+t+'</div>'; map = null; }
function focusCard(id){
  const c = $('r'+id);
  if (!c) return toast('Bu mekân listede ilk kartlar arasında değil. Sıralamayı ya da filtreleri değiştirerek bulabilirsin.');
  c.scrollIntoView({behavior:'smooth', block:'center'}); c.classList.add('flash'); setTimeout(()=>c.classList.remove('flash'),1600);
}
// Haritada ekrandaki mekânlar ızgara hücrelerine bölünür: tek olan pin, çok olan sayı baloncuğu olur (tıklayınca yakınlaşır)
function drawMap(list){
  lastList = list;
  if (!map) return;
  pinMarkers.forEach(m => m.remove()); pinMarkers = [];
  const c = map.getCanvas(), W = c.clientWidth || 800, H = c.clientHeight || 460, CELL = 56, spread = map.getZoom() >= 17;
  const cells = new Map();
  for (const r of list) {
    const p = map.project([r.lng, r.lat]);
    if (p.x<-40 || p.y<-40 || p.x>W+40 || p.y>H+40) continue;
    const k = Math.floor(p.x/CELL)+','+Math.floor(p.y/CELL);
    let g = cells.get(k); if (!g) { g = {items:[], x:0, y:0}; cells.set(k, g); }
    g.items.push(r); g.x += r.lng; g.y += r.lat;
  }
  const add = (el, lng, lat) => pinMarkers.push(new maplibregl.Marker({element:el}).setLngLat([lng, lat]).addTo(map));
  const single = r => {
    const el = document.createElement('div'); el.title = r.name;
    const pin = document.createElement('div'); pin.className = 'pin '+r.fp[1]; pin.textContent = r.price!=null ? r.price+' ₺' : '?'; el.appendChild(pin);
    el.addEventListener('click', e => { e.stopPropagation(); focusCard(r.id); });
    add(el, r.lng, r.lat);
  };
  cells.forEach(g => {
    if (g.items.length===1 || spread) return g.items.forEach(single);
    const lng = g.x/g.items.length, lat = g.y/g.items.length;
    const el = document.createElement('div'); el.title = g.items.length+' mekân, yakınlaşmak için tıkla';
    const cl = document.createElement('div'); cl.className = 'cluster'; cl.textContent = g.items.length; el.appendChild(cl);
    el.addEventListener('click', e => { e.stopPropagation(); map.easeTo({center:[lng, lat], zoom:map.getZoom()+2}); });
    add(el, lng, lat);
  });
}
// Konumu ayarla: izinle bulunan konum, haritadan seçilen nokta ya da aranan yer
function setUser(lat, lng, fly){
  user = {lat, lng};
  if (map) {
    if (!meMarker) {
      const el = document.createElement('div'); el.title = 'Konum'; el.style.zIndex = 5; el.innerHTML = '<div class="me"><i></i><b>Konum</b></div>';
      el.addEventListener('click', e => e.stopPropagation());
      meMarker = new maplibregl.Marker({element:el, draggable:true}).setLngLat([lng, lat]).addTo(map);
      meMarker.on('dragend', () => { const p = meMarker.getLngLat(); setUser(p.lat, p.lng); $('locstat').textContent = 'Konumu pini sürükleyerek değiştirdin.'; });
    } else meMarker.setLngLat([lng, lat]);
    if (fly) map.flyTo({center:[lng, lat], zoom:15});
  }
  view();
}
$('locate').onclick = () => {
  if (!navigator.geolocation) return toast('Tarayıcın konum özelliğini desteklemiyor. Haritayı kaydırarak istediğin yere git.');
  $('locstat').textContent = 'Konum izni bekleniyor...';
  navigator.geolocation.getCurrentPosition(
    p => { setUser(p.coords.latitude, p.coords.longitude, true); $('locstat').textContent = 'Konumun bulundu. Yanlışsa pini sürükleyebilirsin.'; },
    err => { $('locstat').textContent = err.code===1 ? 'Konum izni verilmedi. Haritayı kaydırıp yakınlaştırarak ya da bir semt arayarak devam edebilirsin.' : 'Konum alınamadı. Haritayı kaydırarak ya da bir semt arayarak devam edebilirsin.'; },
    {timeout:10000});
};
if (typeof maplibregl === 'undefined') {
  mapMsg('Harita kütüphanesi yüklenemedi. maplibre-gl.js ve maplibre-gl.css dosyalarının index.html ile aynı klasörde olduğunu kontrol et.');
  setSrc('Harita yüklenmeden restoranlar gösterilemez.');
} else {
  try {
    map = new maplibregl.Map({container:'map', style:'https://tiles.openfreemap.org/styles/liberty', center:[29.0245, 40.9903], zoom:14});
    map.addControl(new maplibregl.NavigationControl({showCompass:false}), 'top-left');
    map.on('moveend', () => { drawMap(lastList); scheduleLoad(); });
    map.on('load', () => loadView());
    // Boş yere tıklayınca konum seçilir (mesafe hesabı için); sürükleyip kaydırmak ayrı
    map.on('click', e => { setUser(e.lngLat.lat, e.lngLat.lng); $('locstat').textContent = 'Konumu haritadan seçtin. Pini sürükleyerek değiştirebilirsin.'; });
    setSrc('Harita ve restoranlar yükleniyor...');
  } catch (err) {
    mapMsg('Harita başlatılamadı. Tarayıcında WebGL açık olmalı.');
    setSrc('Harita başlatılamadığı için restoranlar gösterilemiyor.');
  }
}

// ---------- Fiyat ve puan bildirme ----------
let repId = null;
$('cards').onclick = e => {
  if (e.target.dataset.more) { limit += PAGE; return view(); }
  const id = e.target.dataset.rep; if (!id) return;
  const r = data.find(x => String(x.id)===id); if (!r) return;
  repId = r.id;
  $('dt').textContent = r.name; $('dref').textContent = 'Fiyatını girdiğin ürün: '+REF[r.cuisine];
  $('dprice').value = ''; $('drate').value = '';
  $('dlg').showModal(); $('dprice').focus();
};
$('dcancel').onclick = () => $('dlg').close();
$('dok').onclick = () => {
  const r = data.find(x => x.id===repId); if (!r) return $('dlg').close();
  const pv = $('dprice').value.trim(), v = +pv, rate = +$('drate').value;
  if (!pv && !rate) return toast('Bir fiyat gir ya da puan seç.');
  if (pv && !(v>0 && v<5000)) return toast('Geçerli bir fiyat gir (1 ile 5000 ₺ arası).');
  if (pv) { r.reports.push(v); r.ts = Date.now(); }
  if (rate) r.ratings.push(rate);
  saveLocal(r);
  $('dlg').close(); view(); toast('Teşekkürler, bildirimin kaydedildi.');
};

// ---------- Filtreler ----------
$('cuisines').innerHTML = Object.keys(BASE).sort((a,b)=>a.localeCompare(b,'tr')).map(c=>`<label class="chk"><input type="checkbox" value="${c}">${c}</label>`).join('');
$('cuisines').onchange = e => { e.target.checked ? selected.add(e.target.value) : selected.delete(e.target.value); limit = PAGE; view(); };
['q','pmax','rmin','sort'].forEach(id => $(id).oninput = () => { limit = PAGE; view(); });
$('go').onclick = search;
$('q').addEventListener('keydown', e => { if (e.key==='Enter') search(); }); // (onkeydown ile false döndürmek harf girişini engeller)
$('reset').onclick = () => {
  selected.clear(); document.querySelectorAll('#cuisines input').forEach(i=>i.checked=false);
  $('pmax').value=400; $('rmin').value=0; $('q').value=''; placeQuery=''; $('sort').value='rating'; limit = PAGE; view();
};

view();