// תרגול מפה אילמת: שיבוץ, זיהוי ואיתור. ההתקדמות נשמרת בדפדפן.
const GEO = window.MAP_GEO, CATS = window.MAP_CATS, PLACES = window.PLACES;
const LEVELS = {
  1: { name: 'שיבוץ', desc: 'כל הנקודות מסומנות על המפה – משבצים לכל אחת את השם.' },
  2: { name: 'זיהוי', desc: 'מסומנת נקודה אחת – מקלידים מה נמצא שם.' },
  3: { name: 'איתור', desc: 'מקבלים שם ומסמנים על מפה ריקה איפה הוא.' },
};
const norm = s => s.replace(/["'״׳`()\-–:,.]/g, ' ').replace(/\s+/g, ' ').trim();
const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
const byId = id => PLACES.find(p => p.id === id);
const label = p => p.short || p.name;
const catName = c => c === 'all' ? 'כל המקומות' : CATS[c].name;

// הקרנה זהה לזו שבה נוצרו הגבולות ב-map-geo.js
const proj = (lat, lon) => [(lon - GEO.lon0) * GEO.c * GEO.k, (GEO.lat0 - lat) * GEO.k];
const unproj = (x, y) => [GEO.lat0 - y / GEO.k, GEO.lon0 + x / (GEO.c * GEO.k)];
const km = (a, b) => Math.hypot((a[0] - b[0]) * 110.6, (a[1] - b[1]) * 111.3 * Math.cos(a[0] * Math.PI / 180));

// ───────── אחסון ─────────
const STORE_KEY = 'mikraot-map-v1';
function loadStore() {
  try { return Object.assign({ sessions: [], p: {} }, JSON.parse(localStorage.getItem(STORE_KEY))); }
  catch { return { sessions: [], p: {} }; }
}
let store = loadStore();
function saveStore() { try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch { /* מצב פרטי */ } }
function recordAnswer(p, right) {
  const s = store.p[p.id] || (store.p[p.id] = { r: 0, w: 0 });
  right ? s.r++ : s.w++;
  saveStore();
}
function recordSession(cat, level, correct, total) {
  store.sessions.push({ ts: Date.now(), cat, level, correct, total });
  saveStore();
}

const app = document.getElementById('app');
const settings = { cat: 'all', level: 1, size: 0 };
try { Object.assign(settings, JSON.parse(localStorage.getItem('mikraot-map-settings'))); } catch { }
function persistSettings() { try { localStorage.setItem('mikraot-map-settings', JSON.stringify(settings)); } catch { } }

document.querySelectorAll('[data-nav]').forEach(b => b.addEventListener('click', () => b.dataset.nav === 'stats' ? renderStats() : renderHome()));
function setNav(which) {
  document.querySelectorAll('.navbtn').forEach(b => b.classList.toggle('active', b.dataset.nav === which));
  window.scrollTo(0, 0);
}

const placesOf = cat => cat === 'all' ? PLACES : PLACES.filter(p => p.t === cat);
// קודם המקומות שטעית בהם יותר, אחר כך אקראי
function pick(cat, n) {
  const score = p => { const s = store.p[p.id]; return s ? s.w - s.r : 0; };
  const all = shuffle([...placesOf(cat)]);
  return n >= all.length ? all : all.sort((a, b) => score(b) - score(a) + (Math.random() - .5)).slice(0, n);
}

// ───────── ציור המפה ─────────
function symPath(t, x, y) {
  const s = 4.4;
  if (t === 'region') return `M${x} ${y - s * 1.3}L${x + s * 1.05} ${y}L${x} ${y + s * 1.3}L${x - s * 1.05} ${y}Z`;
  if (t === 'nature') return `M${x} ${y - s * 1.3}L${x + s * 1.2} ${y + s * .85}L${x - s * 1.2} ${y + s * .85}Z`;
  if (t === 'site') {
    let d = '';
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? s * .55 : s * 1.4, a = Math.PI / 5 * i - Math.PI / 2;
      d += (i ? 'L' : 'M') + (x + r * Math.cos(a)).toFixed(2) + ' ' + (y + r * Math.sin(a)).toFixed(2);
    }
    return d + 'Z';
  }
  return `M${x - s} ${y}a${s} ${s} 0 1 0 ${2 * s} 0a${s} ${s} 0 1 0 ${-2 * s} 0`;
}
function marker(p, cls = '') {
  const [x, y] = proj(p.lat, p.lon);
  return `<g class="pm ${p.t} ${cls}" data-id="${p.id}">
    <circle class="hit" cx="${x}" cy="${y}" r="11"/><path class="sym" d="${symPath(p.t, x, y)}"/>
    <text class="lbl" x="${x - 8}" y="${y + 3.5}">${esc(label(p))}</text></g>`;
}
const ringPath = r => 'M' + r.map(([la, lo]) => proj(la, lo).map(v => v.toFixed(1)).join(' ')).join('L') + 'Z';
function baseMap(inner = '') {
  const land = [...GEO.land, ...GEO.pal].map(d => `<path d="${d}"/>`).join('');
  return `<svg class="map" viewBox="0 0 ${GEO.w} ${GEO.h}" role="img" aria-label="מפת ארץ ישראל">
    <text class="cty" x="150" y="40">לבנון</text>
    <text class="cty" x="240" y="560">ירדן</text>
    <text class="cty" x="48" y="640">מצרים</text>
    <text class="seaname" x="62" y="190">הים התיכון</text>
    <g class="landedge">${land}</g><g class="land">${land}</g>
    <g class="pal">${GEO.pal.map(d => `<path d="${d}"/>`).join('')}</g>
    <g class="water">${window.MAP_WATER.map(r => `<path d="${ringPath(r)}"/>`).join('')}</g>
    <g class="marks">${inner}</g>
  </svg>`;
}
const ZOOMS = [1, 1.6, 2.4, 3.4];
function mapBlock(inner) {
  return `<div class="mapcol">
    <div class="zoom"><button type="button" data-z="1" aria-label="הגדל">+</button><button type="button" data-z="-1" aria-label="הקטן">−</button></div>
    <div class="mapwrap">${baseMap(inner)}</div></div>`;
}
// זום: מגדילים את גובה המפה ושומרים על אותה נקודת מרכז
function wireZoom(root) {
  const wrap = root.querySelector('.mapwrap'), svg = wrap.querySelector('svg');
  let z = 0;
  root.querySelectorAll('[data-z]').forEach(b => b.onclick = () => {
    const nz = Math.max(0, Math.min(ZOOMS.length - 1, z + +b.dataset.z));
    if (nz === z) return;
    const cx = (wrap.scrollLeft + wrap.clientWidth / 2) / svg.clientWidth, cy = (wrap.scrollTop + wrap.clientHeight / 2) / svg.clientHeight;
    z = nz;
    svg.style.setProperty('--z', ZOOMS[z]);
    wrap.scrollLeft = cx * svg.clientWidth - wrap.clientWidth / 2;
    wrap.scrollTop = cy * svg.clientHeight - wrap.clientHeight / 2;
  });
}
// גלילת המפה (כשהיא מוגדלת) כך שהנקודה תהיה במרכז
function centerOn(root, p) {
  const wrap = root.querySelector('.mapwrap'), svg = wrap.querySelector('svg'), [x, y] = proj(p.lat, p.lon);
  wrap.scrollTo({ left: x / GEO.w * svg.clientWidth - wrap.clientWidth / 2, top: y / GEO.h * svg.clientHeight - wrap.clientHeight / 2, behavior: 'smooth' });
}
const legend = `<span class="legend"><i class="region">◆</i> חבל ארץ <i class="nature">▲</i> תופעת טבע <i class="site">★</i> אתר <i class="city">●</i> יישוב</span>`;

// ───────── מסך בית ─────────
function renderHome() {
  setNav('home');
  const cats = ['all', ...Object.keys(CATS)];
  app.innerHTML = `
    <section class="panel">
      <h2>מה ממקמים?</h2>
      <p class="hint">המקומות למבחן מפה אילמת, לפי החוברת.</p>
      <div class="chips mapcats">${cats.map(c => `
        <button class="chip ${settings.cat === c ? 'on' : ''}" data-cat="${c}">
          <b>${c === 'all' ? 'הכל' : ({ region: '◆', nature: '▲', site: '★', city: '●' })[c]}</b><span>${catName(c)}</span>
          <small>${placesOf(c).length} מקומות</small>
        </button>`).join('')}
      </div>
    </section>
    <section class="panel">
      <h2>רמת קושי</h2>
      <div class="levels">${[1, 2, 3].map(l => `
        <button class="level ${settings.level === l ? 'on' : ''}" data-level="${l}">
          <span class="lvnum">${'●'.repeat(l)}${'○'.repeat(3 - l)}</span>
          <b>${LEVELS[l].name}</b><p>${LEVELS[l].desc}</p>
          ${bestBadge(settings.cat, l)}
        </button>`).join('')}
      </div>
    </section>
    <section class="panel row">
      <label>מקומות בסבב
        <select id="size">${[10, 20, 0].map(n => `<option value="${n}" ${settings.size === n ? 'selected' : ''}>${n || 'הכל'}</option>`).join('')}</select>
      </label>
      <button class="primary" id="start">התחל ▸</button>
    </section>`;
  app.querySelectorAll('[data-cat]').forEach(b => b.onclick = () => { settings.cat = b.dataset.cat; persistSettings(); renderHome(); });
  app.querySelectorAll('[data-level]').forEach(b => b.onclick = () => { settings.level = +b.dataset.level; persistSettings(); renderHome(); });
  app.querySelector('#size').onchange = e => { settings.size = +e.target.value; persistSettings(); };
  app.querySelector('#start').onclick = startRound;
}
function bestBadge(cat, level) {
  const s = store.sessions.filter(x => x.cat === cat && x.level === level);
  if (!s.length) return '<em class="badge">עוד לא תרגלת</em>';
  const pct = x => Math.round(100 * x.correct / x.total);
  return `<em class="badge">אחרון ${pct(s[s.length - 1])}% · שיא ${Math.max(...s.map(pct))}% · ${s.length} סבבים</em>`;
}
function startRound() {
  const { cat, level } = settings, items = pick(cat, settings.size || 999);
  [renderLevel1, renderLevel2, renderLevel3][level - 1](cat, items);
}
function roundHeader(cat, level, extra = '') {
  return `<div class="roundhead"><div><small>${esc(catName(cat))}</small><h2>${LEVELS[level].name}</h2></div>${extra}</div>`;
}
function finish(root, cat, level, correct, total) {
  recordSession(cat, level, correct, total);
  const pct = Math.round(100 * correct / total), el = root.querySelector('#result');
  el.innerHTML = `
    <div class="score ${pct >= 80 ? 'good' : pct >= 50 ? 'mid' : 'bad'}">
      <div class="big">${pct}%</div>
      <div>${correct} מתוך ${total} נכונות בניסיון הראשון</div>
      <div class="actions"><button class="primary" id="again">סבב נוסף</button><button id="home">חזרה לבחירה</button></div>
    </div>`;
  el.querySelector('#again').onclick = startRound;
  el.querySelector('#home').onclick = renderHome;
  el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ───────── שלב 1: שיבוץ שמות לנקודות ─────────
function renderLevel1(cat, items) {
  setNav('home');
  let sel = null, correct = 0, left = items.length;
  const tried = new Set();
  app.innerHTML = '<div class="round"></div>';
  const root = app.firstElementChild;
  root.innerHTML = roundHeader(cat, 1, `<span class="counter" id="cnt"></span>`) + `
    <p class="hint">הקש על שם ואז על הנקודה שלו במפה (או גרור אותו). ${legend}</p>
    <div class="maplay">
      ${mapBlock(items.map(p => marker(p)).join(''))}
      <div class="side"><div class="pool mpool" id="pool">${shuffle([...items]).map(p =>
        `<button type="button" class="card ${p.t}" draggable="true" data-id="${p.id}">${esc(label(p))}</button>`).join('')}</div>
        <button type="button" class="hintbtn" id="hintbtn" disabled>איפה זה? (נספר כטעות)</button></div>
    </div>
    <div id="result"></div>`;
  wireZoom(root);
  const pool = root.querySelector('#pool'), hintbtn = root.querySelector('#hintbtn');
  const count = () => root.querySelector('#cnt').textContent = `נשארו ${left} · ${correct} נכונות`;
  count();
  const select = id => {
    sel = sel === id ? null : id;
    pool.querySelectorAll('.card').forEach(c => c.classList.toggle('sel', c.dataset.id === sel));
    hintbtn.disabled = !sel;
  };
  const miss = id => { if (!tried.has(id)) { tried.add(id); recordAnswer(byId(id), false); } pool.querySelector(`[data-id="${id}"]`)?.classList.add('miss'); };
  const place = (id, g) => {
    if (!id || g.classList.contains('done')) return;
    if (id !== g.dataset.id) {
      miss(id);
      g.classList.add('no'); setTimeout(() => g.classList.remove('no'), 700);
      return;
    }
    if (!tried.has(id)) { tried.add(id); correct++; recordAnswer(byId(id), true); }
    g.classList.remove('peek');
    g.classList.add('done', tried.has(id) && pool.querySelector(`[data-id="${id}"]`).classList.contains('miss') ? 'late' : 'ok');
    pool.querySelector(`[data-id="${id}"]`).remove();
    sel = null; hintbtn.disabled = true;
    left--; count();
    if (!left) finish(root, cat, 1, correct, items.length);
  };
  pool.addEventListener('click', e => { const c = e.target.closest('.card'); if (c) select(c.dataset.id); });
  pool.addEventListener('dragstart', e => { const c = e.target.closest('.card'); if (c) { select(c.dataset.id); sel = c.dataset.id; e.dataTransfer.setData('text/plain', c.dataset.id); } });
  const marks = root.querySelector('.marks');
  marks.addEventListener('click', e => { const g = e.target.closest('.pm'); if (g) place(sel, g); });
  marks.addEventListener('dragover', e => { if (e.target.closest('.pm:not(.done)')) e.preventDefault(); });
  marks.addEventListener('drop', e => { const g = e.target.closest('.pm'); if (g) { e.preventDefault(); place(e.dataTransfer.getData('text/plain') || sel, g); } });
  hintbtn.onclick = () => {
    if (!sel) return;
    miss(sel);
    const g = marks.querySelector(`[data-id="${sel}"]`);
    g.classList.add('peek');
    centerOn(root, byId(sel));
  };
}

// ───────── שלב 2: מה נמצא בנקודה? ─────────
const NAMES = PLACES.map(p => p.name);
function findPlace(v) {
  const n = norm(v);
  return n ? PLACES.find(p => [p.name, p.short, ...(p.alt || [])].some(x => x && norm(x) === n)) : null;
}
function attachAutocomplete(input, onPick) {
  const list = input.nextElementSibling;
  let items = [], active = -1;
  const render = () => {
    const words = norm(input.value).split(' ').filter(Boolean);
    items = words.length ? NAMES.filter(t => { const n = norm(t); return words.every(w => n.includes(w)); }).slice(0, 8) : [];
    active = -1;
    list.hidden = !items.length;
    list.innerHTML = items.map((t, i) => `<li data-i="${i}">${esc(t)}</li>`).join('');
  };
  const choose = i => { input.value = items[i]; list.hidden = true; onPick(); };
  input.addEventListener('input', render);
  input.addEventListener('blur', () => setTimeout(() => list.hidden = true, 150));
  input.addEventListener('keydown', e => {
    if (list.hidden) return;
    if (e.key === 'ArrowDown') active = Math.min(active + 1, items.length - 1);
    else if (e.key === 'ArrowUp') active = Math.max(active - 1, 0);
    else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); choose(active); return; }
    else if (e.key === 'Escape') { list.hidden = true; return; }
    else return;
    e.preventDefault();
    [...list.children].forEach((li, i) => li.classList.toggle('act', i === active));
  });
  list.addEventListener('mousedown', e => { const li = e.target.closest('li'); if (li) { e.preventDefault(); choose(+li.dataset.i); } });
}
function renderLevel2(cat, items) {
  setNav('home');
  let i = 0, correct = 0;
  app.innerHTML = '<div class="round"></div>';
  const root = app.firstElementChild;
  root.innerHTML = roundHeader(cat, 2, `<span class="counter" id="cnt"></span>`) + `
    <div class="maplay">
      ${mapBlock(items.map(p => marker(p, 'hide')).join(''))}
      <div class="side"><div class="question mq" id="q"></div></div>
    </div>
    <div id="result"></div>`;
  wireZoom(root);
  const q = root.querySelector('#q'), marks = root.querySelector('.marks');
  const ask = () => {
    const p = items[i];
    root.querySelector('#cnt').textContent = `${i + 1} / ${items.length} · ${correct} נכונות`;
    marks.querySelectorAll('.pm').forEach(g => g.classList.remove('target'));
    const g = marks.querySelector(`[data-id="${p.id}"]`);
    g.classList.remove('hide'); g.classList.add('target');
    marks.appendChild(g); // מעל כל השאר
    centerOn(root, p);
    q.innerHTML = `
      <p class="qtitle">מה מסומן במפה?</p>
      <p class="qsub">${CATS[p.t].one} – הנקודה המהבהבת</p>
      <form id="f" class="nameform">
        <div class="ac"><input type="text" autocomplete="off" placeholder="הקלד שם…" id="nm"><ul class="sugg" hidden></ul></div>
        <button class="primary">ענה</button>
      </form>
      <div id="fb"></div>`;
    const nm = q.querySelector('#nm'), f = q.querySelector('#f');
    attachAutocomplete(nm, () => {});
    if (matchMedia('(hover: hover)').matches) nm.focus();
    f.onsubmit = e => {
      e.preventDefault();
      if (q.querySelector('#fb').innerHTML) return next();
      if (!nm.value.trim()) return;
      const right = findPlace(nm.value)?.id === p.id;
      if (right) correct++;
      recordAnswer(p, right);
      g.classList.remove('target'); g.classList.add('done', right ? 'ok' : 'late');
      q.querySelector('#fb').innerHTML = `
        <div class="feedback ${right ? 'right' : 'wrong'}">
          <b>${right ? 'נכון!' : 'לא נכון'}</b>
          <p>זה <strong>${esc(p.name)}</strong></p>
          <button class="primary" type="submit" form="f">${i + 1 < items.length ? 'הבא ▸' : 'סיום'}</button>
        </div>`;
      nm.disabled = true;
      f.querySelector(':scope > .primary').hidden = true;
      root.querySelector('#cnt').textContent = `${i + 1} / ${items.length} · ${correct} נכונות`;
      q.querySelector('.feedback .primary').focus({ preventScroll: true });
    };
  };
  const next = () => {
    i++;
    if (i < items.length) return ask();
    q.innerHTML = '<p class="qtitle">סיימת!</p>';
    finish(root, cat, 2, correct, items.length);
  };
  ask();
}

// ───────── שלב 3: איפה זה? ─────────
function renderLevel3(cat, items) {
  setNav('home');
  let i = 0, correct = 0, answered = false;
  app.innerHTML = '<div class="round"></div>';
  const root = app.firstElementChild;
  root.innerHTML = roundHeader(cat, 3, `<span class="counter" id="cnt"></span>`) + `
    <div class="maplay">
      ${mapBlock('')}
      <div class="side"><div class="question mq" id="q"></div></div>
    </div>
    <div id="result"></div>`;
  wireZoom(root);
  const q = root.querySelector('#q'), svg = root.querySelector('svg.map'), marks = root.querySelector('.marks');
  svg.classList.add('pickable');
  const ask = () => {
    const p = items[i];
    answered = false;
    marks.innerHTML = '';
    root.querySelector('#cnt').textContent = `${i + 1} / ${items.length} · ${correct} נכונות`;
    q.innerHTML = `
      <p class="qsub">${CATS[p.t].one} · הקש על המפה איפה זה</p>
      <p class="qtitle">${esc(p.name)}</p>
      <div id="fb"></div>`;
  };
  svg.addEventListener('click', e => {
    if (answered || i >= items.length) return;
    const p = items[i], pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const { x, y } = pt.matrixTransform(svg.getScreenCTM().inverse());
    const dist = km(unproj(x, y), [p.lat, p.lon]), tol = p.r || CATS[p.t].r, right = dist <= tol;
    answered = true;
    if (right) correct++;
    recordAnswer(p, right);
    const [tx, ty] = proj(p.lat, p.lon);
    marks.innerHTML = `<line class="miss-line" x1="${x}" y1="${y}" x2="${tx}" y2="${ty}"/>
      <path class="guess" d="M${x - 4} ${y - 4}L${x + 4} ${y + 4}M${x + 4} ${y - 4}L${x - 4} ${y + 4}"/>` + marker(p, `done ${right ? 'ok' : 'late'}`);
    const d = Math.round(dist);
    q.querySelector('#fb').innerHTML = `
      <div class="feedback ${right ? 'right' : 'wrong'}">
        <b>${right ? (d <= 1 ? 'בול!' : `נכון! (${d} ק״מ מהמקום)`) : `פספסת ב-${d} ק״מ`}</b>
        <p class="info">ה-X הוא הסימון שלך; הסמל הצבעוני הוא המיקום הנכון.</p>
        <button class="primary" id="nx">${i + 1 < items.length ? 'הבא ▸' : 'סיום'}</button>
      </div>`;
    root.querySelector('#cnt').textContent = `${i + 1} / ${items.length} · ${correct} נכונות`;
    const nx = q.querySelector('#nx');
    nx.focus({ preventScroll: true });
    nx.onclick = () => {
      i++;
      if (i < items.length) return ask();
      marks.innerHTML = '';
      q.innerHTML = '<p class="qtitle">סיימת!</p>';
      finish(root, cat, 3, correct, items.length);
    };
  });
  ask();
}

// ───────── מסך התקדמות ─────────
function renderStats() {
  setNav('stats');
  const pct = x => Math.round(100 * x.correct / x.total);
  const cats = ['all', ...Object.keys(CATS)];
  const cell = (c, l) => {
    const s = store.sessions.filter(x => x.cat === c && x.level === l);
    if (!s.length) return '<td class="na">–</td>';
    const ps = s.map(pct), avg = Math.round(ps.reduce((a, b) => a + b, 0) / ps.length);
    return `<td><b>${ps[ps.length - 1]}%</b><small>שיא ${Math.max(...ps)}%<br>ממוצע ${avg}%<br>${s.length} סבבים</small></td>`;
  };
  const weak = Object.entries(store.p)
    .filter(([, s]) => s.w > 0)
    .sort((a, b) => (b[1].w - b[1].r) - (a[1].w - a[1].r) || b[1].w - a[1].w)
    .slice(0, 12)
    .map(([id, s]) => { const p = byId(id); return p ? `<li><span>${esc(p.name)}</span><b>${CATS[p.t].one}</b><small>${s.r}✓ ${s.w}✗</small></li>` : ''; })
    .join('');
  const recent = store.sessions.slice(-15).reverse().map(x => `
    <li><span>${new Date(x.ts).toLocaleString('he-IL', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
    <span>${esc(catName(x.cat))} · ${LEVELS[x.level].name}</span><b>${x.correct}/${x.total} (${pct(x)}%)</b></li>`).join('');
  app.innerHTML = `
    <section class="panel">
      <h2>הציונים שלך</h2>
      <p class="hint">הציון הגדול הוא של הסבב האחרון. ההתקדמות נשמרת בדפדפן הזה בלבד.</p>
      <div class="tablewrap"><table class="stats">
        <thead><tr><th>מקומות</th>${[1, 2, 3].map(l => `<th>${l}. ${LEVELS[l].name}</th>`).join('')}</tr></thead>
        <tbody>${cats.map(c => `<tr><th>${catName(c)}</th>${[1, 2, 3].map(l => cell(c, l)).join('')}</tr>`).join('')}</tbody>
      </table></div>
    </section>
    <section class="panel two">
      <div><h2>המקומות שהכי מכשילים אותך</h2>${weak ? `<ul class="list">${weak}</ul>` : '<p class="hint">עוד אין טעויות.</p>'}</div>
      <div><h2>סבבים אחרונים</h2>${recent ? `<ul class="list">${recent}</ul>` : '<p class="hint">עוד אין סבבים.</p>'}</div>
    </section>
    <section class="panel row">
      <button id="reset" class="danger">איפוס ההתקדמות במפה</button>
    </section>`;
  app.querySelector('#reset').onclick = () => {
    if (confirm('למחוק את כל ההיסטוריה של תרגול המפה?')) { store = { sessions: [], p: {} }; saveStore(); renderStats(); }
  };
}

renderHome();
