'use strict';

// ───────── נתונים ─────────
const EVENTS = window.EVENTS_RAW.split('\n')
  .map(l => l.trim())
  .filter(l => l && !l.startsWith('#'))
  .map((line, i) => {
    const [g, yr, end, label, title, info] = line.split('|').map(s => s.trim());
    const [lo, hi] = yr.split('~').map(Number);
    return {
      id: i,
      gates: g.split(',').map(Number),
      y: lo,
      ok: [lo, isNaN(hi) ? lo : hi],
      approx: !isNaN(hi),
      end: end ? Number(end) : null,
      label: label || '',
      title,
      info: info || '',
    };
  });

const LEVELS = {
  1: { name: 'מיקום על הציר', desc: 'השנים מסומנות על הציר. גוררים (או מקישים) כל אירוע למקום שלו.' },
  2: { name: 'מה קרה בשנה הזו?', desc: 'על הציר מופיעות שנים. מקלידים מה קרה בכל אחת – עם השלמה אוטומטית.' },
  3: { name: 'באיזו שנה?', desc: 'מקבלים אירוע בלי ציר ובלי הקשר, ועונים באיזו שנה הוא קרה.' },
};

const fmtYear = y => y < 0 ? `${-y} לפנה"ס` : y < 1000 ? `${y} לספירה` : String(y);
const fmtRange = (a, b) => a > 0 && b < 1000 ? `${a}–${b} לספירה` : `${fmtYear(a)}–${fmtYear(b)}`;
const slotLabel = ev => ev.approx ? ev.label : ev.end ? fmtRange(ev.y, ev.end) : fmtYear(ev.y);
const fullDate = ev => ev.label || slotLabel(ev);
const norm = s => s.replace(/["'״׳`()\-–:,.]/g, ' ').replace(/\s+/g, ' ').trim();
const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
// שער 8 (שנות חיים של אישים) הוא מקבץ נפרד, ולכן לא נכלל ב"כל השערים".
const PEOPLE = 8;
const ALL_GATES = [1, 2, 3, 4, 5, 6, 7, PEOPLE, 0];
const eventsOf = gate => EVENTS.filter(e => gate === 0 ? !e.gates.includes(PEOPLE) : e.gates.includes(gate));
const gateName = g => g === 0 ? 'כל השערים' : g === PEOPLE ? window.GATES[g] : `שער ${g}: ${window.GATES[g]}`;

// ───────── שמירת התקדמות (localStorage) ─────────
const STORE_KEY = 'mikraot-timeline-v1';
function loadStore() {
  try { return Object.assign({ sessions: [], ev: {} }, JSON.parse(localStorage.getItem(STORE_KEY))); }
  catch { return { sessions: [], ev: {} }; }
}
let store = loadStore();
function saveStore() { try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch { /* מצב פרטי */ } }
function recordAnswer(ev, right) {
  const s = store.ev[ev.title] || (store.ev[ev.title] = { r: 0, w: 0 });
  right ? s.r++ : s.w++;
}
function recordSession(gate, level, correct, total) {
  store.sessions.push({ ts: Date.now(), gate, level, correct, total });
  saveStore();
}

// בחירת אירועים לסבב: אירועים שטעית בהם (או שלא ראית) מופיעים יותר.
function pickEvents(gate, n, distinctYears) {
  const keyed = eventsOf(gate).map(ev => {
    const s = store.ev[ev.title] || { r: 0, w: 0 };
    const w = (s.w * 2 + 1) / (s.r + 1) + 0.3;
    return { ev, k: Math.pow(Math.random(), 1 / w) };
  }).sort((a, b) => b.k - a.k);
  const used = new Set(), out = [];
  for (const { ev } of keyed) {
    if (out.length >= n) break;
    if (distinctYears && used.has(ev.y)) continue;
    used.add(ev.y);
    out.push(ev);
  }
  return out;
}

// ───────── ניווט ─────────
const app = document.getElementById('app');
const settings = { gate: 1, level: 1, size: 10 };
try { Object.assign(settings, JSON.parse(localStorage.getItem('mikraot-settings'))); } catch { }

document.querySelectorAll('[data-nav]').forEach(b => b.addEventListener('click', e => {
  e.preventDefault();
  b.dataset.nav === 'stats' ? renderStats() : renderHome();
}));
function setNav(which) {
  document.querySelectorAll('.navbtn').forEach(b => b.classList.toggle('active', b.dataset.nav === which));
  window.scrollTo(0, 0);
}

// ───────── מסך בית ─────────
function renderHome() {
  setNav('home');
  const gates = ALL_GATES;
  app.innerHTML = `
    <section class="panel">
      <h2>בחר שער</h2>
      <div class="chips">${gates.map(g => `
        <button class="chip ${settings.gate === g ? 'on' : ''}" data-gate="${g}">
          <b>${g === 0 ? 'הכל' : g === PEOPLE ? 'אישים' : g}</b><span>${g === 0 ? 'כל השערים' : window.GATES[g]}</span>
          <small>${eventsOf(g).length} אירועים</small>
        </button>`).join('')}
      </div>
    </section>
    <section class="panel">
      <h2>רמת קושי</h2>
      <div class="levels">${[1, 2, 3].map(l => `
        <button class="level ${settings.level === l ? 'on' : ''}" data-level="${l}">
          <span class="lvnum">${'●'.repeat(l)}${'○'.repeat(3 - l)}</span>
          <b>${LEVELS[l].name}</b><p>${LEVELS[l].desc}</p>
          ${bestBadge(settings.gate, l)}
        </button>`).join('')}
      </div>
    </section>
    <section class="panel row">
      <label>אירועים בסבב
        <select id="size">${[6, 10, 15, 0].map(n => `<option value="${n}" ${settings.size === n ? 'selected' : ''}>${n || 'הכל'}</option>`).join('')}</select>
      </label>
      <button class="primary" id="start">התחל ▸</button>
    </section>`;
  app.querySelectorAll('[data-gate]').forEach(b => b.onclick = () => { settings.gate = +b.dataset.gate; persistSettings(); renderHome(); });
  app.querySelectorAll('[data-level]').forEach(b => b.onclick = () => { settings.level = +b.dataset.level; persistSettings(); renderHome(); });
  app.querySelector('#size').onchange = e => { settings.size = +e.target.value; persistSettings(); };
  app.querySelector('#start').onclick = startRound;
}
function persistSettings() { try { localStorage.setItem('mikraot-settings', JSON.stringify(settings)); } catch { } }
function bestBadge(gate, level) {
  const s = store.sessions.filter(x => x.gate === gate && x.level === level);
  if (!s.length) return '<em class="badge">עוד לא תרגלת</em>';
  const last = s[s.length - 1], pct = x => Math.round(100 * x.correct / x.total);
  return `<em class="badge">אחרון ${pct(last)}% · שיא ${Math.max(...s.map(pct))}% · ${s.length} סבבים</em>`;
}

function startRound() {
  const { gate, level } = settings;
  const size = settings.size || 9999;
  if (level === 3) return renderLevel3(gate, pickEvents(gate, size, false));
  const evs = pickEvents(gate, size, true).sort((a, b) => a.y - b.y);
  if (evs.length < 2) { alert('אין מספיק אירועים בשער הזה'); return; }
  level === 1 ? renderLevel1(gate, evs) : renderLevel2(gate, evs);
}

function roundHeader(gate, level, extra = '') {
  return `<div class="roundhead"><div><small>${esc(gateName(gate))}</small><h2>${LEVELS[level].name}</h2></div>${extra}</div>`;
}

// ───────── שלב 1: גרירת אירועים לשנים ─────────
function renderLevel1(gate, evs) {
  setNav('home');
  const placed = new Array(evs.length).fill(null); // slot -> event id
  let selected = null, checked = false;
  const pool = shuffle(evs.map(e => e.id));

  app.innerHTML = '<div class="round"></div>';
  const root = app.firstElementChild;  // מאזינים על אלמנט חדש בכל סבב, כדי שלא יצטברו
  root.innerHTML = roundHeader(gate, 1, `<button class="primary" id="check" disabled>בדוק</button>`) + `
    <p class="hint">גרור אירוע לשנה המתאימה, או הקש על אירוע ואז על השנה.</p>
    <div class="l1">
      <div class="pool" id="pool"></div>
      <ol class="timeline" id="tl"></ol>
    </div>
    <div id="result"></div>`;
  const poolEl = root.querySelector('#pool'), tl = root.querySelector('#tl'), checkBtn = root.querySelector('#check');
  const byId = id => EVENTS[id];

  function draw() {
    const inPool = pool.filter(id => !placed.includes(id));
    poolEl.innerHTML = inPool.length
      ? inPool.map(id => `<div class="card ${selected === id ? 'sel' : ''}" draggable="true" data-id="${id}">${esc(byId(id).title)}</div>`).join('')
      : '<p class="empty">כל האירועים מוקמו ✓</p>';
    tl.innerHTML = evs.map((slot, i) => {
      const id = placed[i];
      let cls = '', fix = '';
      if (checked) {
        const right = id !== null && byId(id).y === slot.y;
        cls = right ? 'right' : 'wrong';
        if (!right) fix = `<div class="fix">✓ ${esc(slot.title)}</div>`;
      }
      return `<li class="slot ${cls}" data-slot="${i}">
        <span class="year">${esc(slotLabel(slot))}</span>
        <div class="drop">${id !== null ? `<div class="card placed" draggable="${!checked}" data-id="${id}">${esc(byId(id).title)}</div>` : '<span class="ph">—</span>'}${fix}</div>
      </li>`;
    }).join('');
    checkBtn.disabled = checked || placed.includes(null);
  }

  function place(id, slot) {
    if (checked) return;
    const from = placed.indexOf(id);
    if (from >= 0) placed[from] = placed[slot];  // החלפה בין שתי משבצות
    placed[slot] = id;
    selected = null;
    draw();
  }

  root.addEventListener('click', e => {
    if (checked) return;
    const card = e.target.closest('.card');
    const slot = e.target.closest('.slot');
    if (card && !card.classList.contains('placed')) { const id = +card.dataset.id; selected = selected === id ? null : id; draw(); return; }
    if (slot && selected !== null) { place(selected, +slot.dataset.slot); return; }
    if (card && card.classList.contains('placed')) { placed[placed.indexOf(+card.dataset.id)] = null; draw(); }
  });
  root.addEventListener('dragstart', e => { const c = e.target.closest('.card'); if (c) e.dataTransfer.setData('text/plain', c.dataset.id); });
  root.addEventListener('dragover', e => { if (e.target.closest('.slot, .pool')) e.preventDefault(); });
  root.addEventListener('drop', e => {
    e.preventDefault();
    const id = +e.dataTransfer.getData('text/plain');
    const slot = e.target.closest('.slot');
    if (slot) place(id, +slot.dataset.slot);
    else if (e.target.closest('.pool') && placed.includes(id)) { placed[placed.indexOf(id)] = null; draw(); }
  });

  checkBtn.onclick = () => {
    checked = true;
    let correct = 0;
    evs.forEach((slot, i) => {
      const ev = byId(placed[i]);
      const right = ev.y === slot.y;
      if (right) correct++;
      recordAnswer(ev, right);
    });
    recordSession(gate, 1, correct, evs.length);
    draw();
    showRoundResult(correct, evs.length);
  };
  draw();
}

// ───────── שלב 2: הקלדת האירוע לפי השנה ─────────
function renderLevel2(gate, evs) {
  setNav('home');
  const pool = eventsOf(gate);
  app.innerHTML = roundHeader(gate, 2, `<button class="primary" id="check">בדוק</button>`) + `
    <p class="hint">כתוב מה קרה בכל שנה ובחר מהרשימה. אם כמה אירועים בשער קרו באותה שנה, כל אחד מהם נחשב נכון.</p>
    <ol class="timeline">${evs.map((slot, i) => `
      <li class="slot" data-slot="${i}">
        <span class="year">${esc(slotLabel(slot))}</span>
        <div class="drop"><div class="ac"><input type="text" autocomplete="off" placeholder="מה קרה?" data-i="${i}"><ul class="sugg" hidden></ul></div><div class="fix" hidden></div></div>
      </li>`).join('')}
    </ol>
    <div id="result"></div>`;
  const inputs = [...app.querySelectorAll('.ac input')];
  inputs.forEach(attachAutocomplete);

  app.querySelector('#check').onclick = e => {
    let correct = 0;
    evs.forEach((slot, i) => {
      const input = inputs[i];
      const picked = findByTitle(input.value);
      // נכון אם נבחר אירוע מהשער שהתחיל באותה שנה
      const right = !!picked && picked.y === slot.y && pool.includes(picked);
      if (right) correct++;
      recordAnswer(slot, right);
      if (picked && !right) recordAnswer(picked, false);
      const li = input.closest('.slot');
      li.classList.add(right ? 'right' : 'wrong');
      input.disabled = true;
      const fix = li.querySelector('.fix');
      if (!right) {
        const sameYear = pool.filter(x => x.y === slot.y).map(x => x.title);
        fix.hidden = false;
        fix.innerHTML = `✓ ${sameYear.map(esc).join(' / ')}` + (picked ? `<br><small>מה שבחרת: ${esc(fullDate(picked))}</small>` : '');
      }
    });
    e.target.disabled = true;
    recordSession(gate, 2, correct, evs.length);
    showRoundResult(correct, evs.length);
  };
}

const TITLES = [...new Set(EVENTS.map(e => e.title))];
function findByTitle(v) { const n = norm(v); return n ? EVENTS.find(e => norm(e.title) === n) : null; }

function attachAutocomplete(input) {
  const list = input.nextElementSibling;
  let items = [], active = -1;
  const render = () => {
    const words = norm(input.value).split(' ').filter(Boolean);
    items = words.length ? TITLES.filter(t => { const n = norm(t); return words.every(w => n.includes(w)); }).slice(0, 8) : [];
    active = -1;
    list.hidden = !items.length;
    list.innerHTML = items.map((t, i) => `<li data-i="${i}">${esc(t)}</li>`).join('');
  };
  const choose = i => { input.value = items[i]; list.hidden = true; const next = input.closest('.slot')?.nextElementSibling?.querySelector('input'); if (next) next.focus(); };
  input.addEventListener('input', render);
  input.addEventListener('focus', render);
  input.addEventListener('blur', () => setTimeout(() => list.hidden = true, 150));
  input.addEventListener('keydown', e => {
    if (list.hidden) return;
    if (e.key === 'ArrowDown') { active = Math.min(active + 1, items.length - 1); }
    else if (e.key === 'ArrowUp') { active = Math.max(active - 1, 0); }
    else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); choose(active); return; }
    else if (e.key === 'Escape') { list.hidden = true; return; }
    else return;
    e.preventDefault();
    [...list.children].forEach((li, i) => li.classList.toggle('act', i === active));
  });
  list.addEventListener('mousedown', e => { const li = e.target.closest('li'); if (li) { e.preventDefault(); choose(+li.dataset.i); } });
}

// ───────── שלב 3: באיזו שנה? ─────────
function renderLevel3(gate, evs) {
  setNav('home');
  let i = 0, correct = 0;
  const ask = () => {
    const ev = evs[i];
    app.innerHTML = roundHeader(gate, 3, `<span class="counter">${i + 1} / ${evs.length} · ${correct} נכונות</span>`) + `
      <div class="question">
        <p class="qtitle">${esc(ev.title)}</p>
        <p class="qsub">${ev.end ? 'באיזו שנה זה התחיל?' : 'באיזו שנה זה קרה?'}</p>
        <form id="f" class="yearform">
          <input id="yr" type="number" inputmode="numeric" min="1" max="2100" required placeholder="שנה">
          <label class="bce"><input type="checkbox" id="bce"> לפנה"ס</label>
          <button class="primary">ענה</button>
        </form>
        <div id="fb"></div>
      </div>`;
    const yr = app.querySelector('#yr');
    yr.focus();
    app.querySelector('#f').onsubmit = e => {
      e.preventDefault();
      if (app.querySelector('#fb').innerHTML) return next();
      const val = (+yr.value) * (app.querySelector('#bce').checked ? -1 : 1);
      const right = val >= ev.ok[0] && val <= ev.ok[1];
      if (right) correct++;
      recordAnswer(ev, right);
      const diff = Math.abs(val - ev.y);
      app.querySelector('#fb').innerHTML = `
        <div class="feedback ${right ? 'right' : 'wrong'}">
          <b>${right ? 'נכון!' : `לא בדיוק – פספסת ב-${diff} ${diff === 1 ? 'שנה' : 'שנים'}`}</b>
          <p>${esc(ev.title)}: <strong>${esc(fullDate(ev))}</strong></p>
          ${ev.info ? `<p class="info">${esc(ev.info)}</p>` : ''}
          <button class="primary" type="submit" form="f">${i + 1 < evs.length ? 'הבא ▸' : 'סיום'}</button>
        </div>`;
      yr.disabled = true;
      app.querySelector('#bce').disabled = true;
      app.querySelector('#f > .primary').hidden = true;
      app.querySelector('.feedback .primary').focus();
    };
  };
  const next = () => {
    i++;
    if (i < evs.length) return ask();
    recordSession(gate, 3, correct, evs.length);
    app.innerHTML = roundHeader(gate, 3);
    const box = document.createElement('div'); box.id = 'result'; app.appendChild(box);
    showRoundResult(correct, evs.length);
  };
  ask();
}

function showRoundResult(correct, total) {
  const pct = Math.round(100 * correct / total);
  const el = document.getElementById('result');
  el.innerHTML = `
    <div class="score ${pct >= 80 ? 'good' : pct >= 50 ? 'mid' : 'bad'}">
      <div class="big">${pct}%</div>
      <div>${correct} מתוך ${total} נכונות</div>
      <div class="actions"><button class="primary" id="again">סבב נוסף</button><button id="home">חזרה לבחירה</button></div>
    </div>`;
  el.querySelector('#again').onclick = startRound;
  el.querySelector('#home').onclick = renderHome;
  el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ───────── מסך התקדמות ─────────
function renderStats() {
  setNav('stats');
  const pct = x => Math.round(100 * x.correct / x.total);
  const gates = ALL_GATES;
  const cell = (g, l) => {
    const s = store.sessions.filter(x => x.gate === g && x.level === l);
    if (!s.length) return '<td class="na">–</td>';
    const ps = s.map(pct), avg = Math.round(ps.reduce((a, b) => a + b, 0) / ps.length);
    return `<td><b>${ps[ps.length - 1]}%</b><small>שיא ${Math.max(...ps)}%<br>ממוצע ${avg}%<br>${s.length} סבבים</small></td>`;
  };
  const weak = Object.entries(store.ev)
    .filter(([, s]) => s.w > 0)
    .sort((a, b) => (b[1].w - b[1].r) - (a[1].w - a[1].r) || b[1].w - a[1].w)
    .slice(0, 12)
    .map(([t, s]) => { const ev = EVENTS.find(e => e.title === t); return ev ? `<li><span>${esc(t)}</span><b>${esc(fullDate(ev))}</b><small>${s.r}✓ ${s.w}✗</small></li>` : ''; })
    .join('');
  const recent = store.sessions.slice(-15).reverse().map(x => `
    <li><span>${new Date(x.ts).toLocaleString('he-IL', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
    <span>${esc(x.gate === 0 ? 'כל השערים' : x.gate === PEOPLE ? window.GATES[x.gate] : 'שער ' + x.gate)} · ${LEVELS[x.level].name}</span><b>${x.correct}/${x.total} (${pct(x)}%)</b></li>`).join('');

  app.innerHTML = `
    <section class="panel">
      <h2>הציונים שלך</h2>
      <p class="hint">הציון הגדול הוא של הסבב האחרון. ההתקדמות נשמרת בדפדפן הזה בלבד.</p>
      <div class="tablewrap"><table class="stats">
        <thead><tr><th>שער</th>${[1, 2, 3].map(l => `<th>${l}. ${LEVELS[l].name}</th>`).join('')}</tr></thead>
        <tbody>${gates.map(g => `<tr><th>${g === 0 ? 'הכל' : g === PEOPLE ? window.GATES[g] : `${g}. ${window.GATES[g]}`}</th>${[1, 2, 3].map(l => cell(g, l)).join('')}</tr>`).join('')}</tbody>
      </table></div>
    </section>
    <section class="panel two">
      <div><h2>האירועים שהכי מכשילים אותך</h2>${weak ? `<ul class="list">${weak}</ul>` : '<p class="hint">עוד אין טעויות. כל הכבוד (או שעוד לא התחלת).</p>'}</div>
      <div><h2>סבבים אחרונים</h2>${recent ? `<ul class="list">${recent}</ul>` : '<p class="hint">עוד אין סבבים.</p>'}</div>
    </section>
    <section class="panel row">
      <button id="export">ייצוא התקדמות</button>
      <label class="filebtn">ייבוא<input type="file" id="import" accept=".json" hidden></label>
      <button id="reset" class="danger">איפוס הכל</button>
    </section>`;
  app.querySelector('#export').onclick = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(store)], { type: 'application/json' }));
    a.download = `mikraot-progress-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  };
  app.querySelector('#import').onchange = async e => {
    try {
      const data = JSON.parse(await e.target.files[0].text());
      if (!Array.isArray(data.sessions)) throw 0;
      store = Object.assign({ sessions: [], ev: {} }, data); saveStore(); renderStats();
    } catch { alert('הקובץ לא תקין'); }
  };
  app.querySelector('#reset').onclick = () => {
    if (confirm('למחוק את כל ההיסטוריה?')) { store = { sessions: [], ev: {} }; saveStore(); renderStats(); }
  };
}

renderHome();
