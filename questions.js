'use strict';

// ───────── נתונים ─────────
const QUESTIONS = window.QUESTIONS;
const byId = Object.fromEntries(QUESTIONS.map(q => [q.id, q]));
const SUBJECTS = ['מקראות ישראל', 'התקווה וההמנון', 'מפה', 'נשק', 'עזרה ראשונה', 'קשר', 'תחקיר', 'פיקוד ותורת הלחימה'];
const PARTS = ['שערים 1-3', 'שערים 4-5', 'שערים 6-7'];
const MODES = {
  mix: { name: 'מעורב', desc: 'קודם שאלות שטעית בהן ושעוד לא ראית' },
  new: { name: 'שאלות חדשות', desc: 'רק שאלות שעוד לא ענית עליהן' },
  wrong: { name: 'חזרה על טעויות', desc: 'רק שאלות שטעית בהן בפעם האחרונה' },
};

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
const pct = x => Math.round(100 * x.correct / x.total);

// ───────── שמירת התקדמות (localStorage) ─────────
const STORE_KEY = 'mikraot-questions-v1';
function loadStore() {
  try { return Object.assign({ sessions: [], q: {} }, JSON.parse(localStorage.getItem(STORE_KEY))); }
  catch { return { sessions: [], q: {} }; }
}
let store = loadStore();
function saveStore() { try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch { /* מצב פרטי */ } }
function recordAnswer(q, right) {
  const s = store.q[q.id] || (store.q[q.id] = { r: 0, w: 0 });
  right ? s.r++ : s.w++;
  s.last = right ? 1 : 0;
  saveStore();
}

const settings = { subject: 'מקראות ישראל', part: '', mode: 'mix', size: 20, open: true };
try { Object.assign(settings, JSON.parse(localStorage.getItem('mikraot-q-settings'))); } catch { }
function persistSettings() { try { localStorage.setItem('mikraot-q-settings', JSON.stringify(settings)); } catch { } }

function pool({ subject, part, open }) {
  return QUESTIONS.filter(q => (subject === 'הכל' || q.s === subject) && (!part || q.p === part) && (open || q.t !== 'open'));
}
function pick(qs, mode, n) {
  const seen = id => store.q[id];
  if (mode === 'new') qs = qs.filter(q => !seen(q.id));
  if (mode === 'wrong') qs = qs.filter(q => seen(q.id) && seen(q.id).last === 0);
  // מעורב: שאלות שטעית בהן ושלא ראית מקבלות משקל גבוה יותר
  return qs.map(q => {
    const s = seen(q.id);
    const w = !s ? 2 : s.last === 0 ? 4 : 0.5 / (s.r + 1);
    return { q, k: Math.pow(Math.random(), 1 / w) };
  }).sort((a, b) => b.k - a.k).slice(0, n).map(x => x.q);
}

// ───────── ניווט ─────────
const app = document.getElementById('app');
document.querySelectorAll('[data-nav]').forEach(b => b.addEventListener('click', () => b.dataset.nav === 'stats' ? renderStats() : renderHome()));
function setNav(which) {
  document.querySelectorAll('.navbtn').forEach(b => b.classList.toggle('active', b.dataset.nav === which));
  window.scrollTo(0, 0);
}

// ───────── מסך בחירה ─────────
function renderHome() {
  setNav('home');
  const subjects = [...SUBJECTS, 'הכל'];
  const counts = s => pool({ subject: s, part: '', open: settings.open }).length;
  const done = s => pool({ subject: s, part: '', open: settings.open }).filter(q => store.q[q.id]).length;
  const avail = pick(pool(settings), settings.mode, 1e9).length;
  app.innerHTML = `
    <section class="panel">
      <h2>נושא</h2>
      <div class="chips">${subjects.map(s => `
        <button class="chip ${settings.subject === s ? 'on' : ''}" data-subject="${esc(s)}">
          <span>${esc(s)}</span><small>${counts(s)} שאלות · ענית על ${done(s)}</small>
        </button>`).join('')}
      </div>
      ${settings.subject === 'מקראות ישראל' ? `
      <div class="subchips">
        <span class="hint">חלק:</span>
        ${['', ...PARTS].map(p => `<button class="pill ${settings.part === p ? 'on' : ''}" data-part="${p}">${p || 'הכל'}</button>`).join('')}
      </div>
      <p class="hint small">רוב השאלות במאגר לא משויכות לשער מסוים, ולכן מופיעות רק תחת ״הכל״.</p>` : ''}
    </section>
    <section class="panel">
      <h2>אילו שאלות?</h2>
      <div class="levels">${Object.entries(MODES).map(([k, m]) => `
        <button class="level ${settings.mode === k ? 'on' : ''}" data-mode="${k}"><b>${m.name}</b><p>${m.desc}</p></button>`).join('')}
      </div>
      <label class="check"><input type="checkbox" id="open" ${settings.open ? 'checked' : ''}> לכלול שאלות פתוחות (בודקים את עצמך)</label>
    </section>
    <section class="panel row">
      <label>שאלות בסבב
        <select id="size">${[10, 20, 50, 0].map(n => `<option value="${n}" ${settings.size === n ? 'selected' : ''}>${n || 'הכל'}</option>`).join('')}</select>
      </label>
      <span class="hint">${avail ? `${avail} שאלות זמינות` : 'אין שאלות שמתאימות לבחירה'}</span>
      <button class="primary" id="start" ${avail ? '' : 'disabled'}>התחל ▸</button>
    </section>`;
  app.querySelectorAll('[data-subject]').forEach(b => b.onclick = () => { settings.subject = b.dataset.subject; settings.part = ''; persistSettings(); renderHome(); });
  app.querySelectorAll('[data-part]').forEach(b => b.onclick = () => { settings.part = b.dataset.part; persistSettings(); renderHome(); });
  app.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => { settings.mode = b.dataset.mode; persistSettings(); renderHome(); });
  app.querySelector('#open').onchange = e => { settings.open = e.target.checked; persistSettings(); renderHome(); };
  app.querySelector('#size').onchange = e => { settings.size = +e.target.value; persistSettings(); };
  app.querySelector('#start').onclick = startRound;
}

// ───────── סבב שאלות ─────────
function startRound() {
  const qs = pick(pool(settings), settings.mode, settings.size || 1e9);
  if (qs.length) renderRound(qs);
}

function renderRound(qs) {
  setNav('home');
  let i = 0;
  const results = [];
  app.innerHTML = '<div class="round"></div>';
  const root = app.firstElementChild;  // מאזינים על אלמנט חדש בכל סבב, כדי שלא יצטברו
  let onKey = null;

  const finish = (q, right) => {
    results.push({ q, right });
    recordAnswer(q, right);
    root.querySelector('.after').hidden = false;
    root.querySelector('.after').innerHTML = explain(q, right) + `<button class="primary" id="next">${i + 1 < qs.length ? 'הבאה ▸' : 'סיום'}</button>`;
    root.querySelector('#next').onclick = next;
    root.querySelector('#next').focus({ preventScroll: true });
    root.querySelector('.after').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };

  const show = () => {
    const q = qs[i];
    const correct = results.filter(r => r.right).length;
    const multi = q.t === 'mc' && q.c.length > 1;
    root.innerHTML = `
      <div class="roundhead">
        <div><small>${esc(q.s)}${q.p ? ' · ' + esc(q.p) : ''}</small><h2>שאלה ${i + 1} מתוך ${qs.length}</h2></div>
        <span class="counter">${correct} נכונות</span>
      </div>
      <div class="progress"><span style="width:${100 * i / qs.length}%"></span></div>
      <div class="qcard">
        <p class="qtext">${esc(q.q)}</p>
        ${q.t === 'mc' ? `
          ${multi ? `<p class="hint">יש ${q.c.length} תשובות נכונות – סמן את כולן ולחץ ״בדוק״.</p>` : ''}
          <div class="options">${q.o.map((o, k) => `
            <button class="opt" data-k="${k}"><span class="key">${k + 1}</span><span>${esc(o)}</span></button>`).join('')}
          </div>
          ${multi ? '<button class="primary" id="checkmulti" disabled>בדוק</button>' : ''}` : `
          <textarea id="mine" rows="3" placeholder="כתוב כאן את התשובה שלך (לא חובה)"></textarea>
          <button class="primary" id="reveal">הצג תשובה</button>`}
        <div class="after" hidden></div>
      </div>`;

    if (q.t === 'mc') {
      const opts = [...root.querySelectorAll('.opt')];
      const chosen = new Set();
      const reveal = () => {
        opts.forEach((b, k) => {
          b.disabled = true;
          if (q.c.includes(k)) b.classList.add('right');
          else if (chosen.has(k)) b.classList.add('wrong');
        });
        const right = chosen.size === q.c.length && q.c.every(k => chosen.has(k));
        finish(q, right);
      };
      opts.forEach((b, k) => b.onclick = () => {
        if (multi) {
          chosen.has(k) ? chosen.delete(k) : chosen.add(k);
          b.classList.toggle('sel', chosen.has(k));
          root.querySelector('#checkmulti').disabled = chosen.size !== q.c.length;
        } else { chosen.add(k); reveal(); }
      });
      if (multi) root.querySelector('#checkmulti').onclick = e => { e.target.hidden = true; reveal(); };
      onKey = e => {
        const k = +e.key - 1;
        if (k >= 0 && k < opts.length && !opts[k].disabled && !e.target.closest('textarea')) opts[k].click();
      };
    } else {
      onKey = null;
      root.querySelector('#reveal').onclick = e => {
        e.target.hidden = true;
        root.querySelector('#mine').readOnly = true;
        const after = root.querySelector('.after');
        after.hidden = false;
        after.innerHTML = `
          <div class="feedback neutral"><b>התשובה:</b><p class="ans">${esc(q.a)}</p></div>
          <p class="hint">צדקת?</p>
          <div class="actions"><button class="primary" id="knew">ידעתי ✓</button><button id="didnt">לא ידעתי ✗</button></div>`;
        after.querySelector('#knew').onclick = () => finish(q, true);
        after.querySelector('#didnt').onclick = () => finish(q, false);
      };
    }
  };

  const next = () => {
    i++;
    if (i < qs.length) return show();
    document.removeEventListener('keydown', keyHandler);
    const correct = results.filter(r => r.right).length;
    store.sessions.push({ ts: Date.now(), subject: settings.subject, part: settings.part, mode: settings.mode, correct, total: results.length });
    saveStore();
    renderSummary(results);
  };

  const keyHandler = e => { if (onKey && root.isConnected) onKey(e); };
  document.addEventListener('keydown', keyHandler);
  show();
}

// הסבר אחרי תשובה: התשובה הנכונה, הערות, ומה הוסיף או תיקן Claude
function explain(q, right) {
  const correctText = q.t === 'mc' ? q.c.map(k => q.o[k]).join(' / ') : q.a;
  const tags = [];
  if (q.fix) tags.push(`<li><b>תוקן:</b> ${esc(q.fix)}</li>`);
  if (q.ai) tags.push(`<li><b>התשובה נכתבה ע״י Claude</b> (אין תשובה במקור) – ${esc(q.ai)}</li>`);
  if (q.gen) tags.push('<li>במקור זו שאלה פתוחה. את התשובות השגויות הוסיף Claude.</li>');
  if (q.n) tags.push(`<li>${esc(q.n)}</li>`);
  return `
    ${q.t === 'mc' ? `<div class="feedback ${right ? 'right' : 'wrong'}"><b>${right ? 'נכון!' : 'לא נכון'}</b>${right ? '' : `<p>התשובה הנכונה: <strong>${esc(correctText)}</strong></p>`}</div>` : ''}
    ${tags.length ? `<ul class="meta">${tags.join('')}</ul>` : ''}
    <p class="src">מקור: ${q.src.map(esc).join(' · ')}</p>`;
}

function renderSummary(results) {
  const correct = results.filter(r => r.right).length;
  const p = Math.round(100 * correct / results.length);
  const wrong = results.filter(r => !r.right);
  app.innerHTML = `
    <div class="score ${p >= 80 ? 'good' : p >= 50 ? 'mid' : 'bad'}">
      <div class="big">${p}%</div>
      <div>${correct} מתוך ${results.length} נכונות</div>
      <div class="actions"><button class="primary" id="again">סבב נוסף</button><button id="home">חזרה לבחירה</button></div>
    </div>
    ${wrong.length ? `<section class="panel"><h2>שאלות שטעית בהן</h2><ul class="list review">${wrong.map(({ q }) => `
      <li><span>${esc(q.q)}</span><b>${esc(q.t === 'mc' ? q.c.map(k => q.o[k]).join(' / ') : q.a)}</b></li>`).join('')}</ul></section>` : ''}`;
  app.querySelector('#again').onclick = startRound;
  app.querySelector('#home').onclick = renderHome;
}

// ───────── מסך התקדמות ─────────
function renderStats() {
  setNav('stats');
  const rows = SUBJECTS.map(s => {
    const qs = QUESTIONS.filter(q => q.s === s);
    const seen = qs.filter(q => store.q[q.id]);
    const lastRight = seen.filter(q => store.q[q.id].last === 1).length;
    const tot = seen.reduce((a, q) => a + store.q[q.id].r + store.q[q.id].w, 0);
    const r = seen.reduce((a, q) => a + store.q[q.id].r, 0);
    return `<tr><th>${esc(s)}</th><td>${seen.length} / ${qs.length}</td><td>${tot ? Math.round(100 * r / tot) + '%' : '–'}</td><td>${seen.length ? `${lastRight} (${Math.round(100 * lastRight / qs.length)}%)` : '–'}</td></tr>`;
  }).join('');
  const weak = Object.entries(store.q)
    .filter(([id, s]) => s.w > 0 && byId[id])
    .sort((a, b) => (b[1].w - b[1].r) - (a[1].w - a[1].r) || b[1].w - a[1].w)
    .slice(0, 12)
    .map(([id, s]) => { const q = byId[id]; return `<li><span>${esc(q.q)}</span><b>${esc(q.t === 'mc' ? q.c.map(k => q.o[k]).join(' / ') : q.a)}</b><small>${s.r}✓ ${s.w}✗</small></li>`; })
    .join('');
  const recent = store.sessions.slice(-15).reverse().map(x => `
    <li><span>${new Date(x.ts).toLocaleString('he-IL', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
    <span>${esc(x.subject)}${x.part ? ' · ' + esc(x.part) : ''} · ${MODES[x.mode].name}</span><b>${x.correct}/${x.total} (${pct(x)}%)</b></li>`).join('');

  app.innerHTML = `
    <section class="panel">
      <h2>ההתקדמות לפי נושא</h2>
      <p class="hint">״יודע עכשיו״ = שאלות שענית עליהן נכון בפעם האחרונה. ההתקדמות נשמרת בדפדפן הזה בלבד.</p>
      <div class="tablewrap"><table class="stats">
        <thead><tr><th>נושא</th><th>ענית</th><th>אחוז הצלחה</th><th>יודע עכשיו</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
    </section>
    <section class="panel two">
      <div><h2>השאלות שהכי מכשילות אותך</h2>${weak ? `<ul class="list">${weak}</ul>` : '<p class="hint">עוד אין טעויות.</p>'}</div>
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
    a.download = `mikraot-questions-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  };
  app.querySelector('#import').onchange = async e => {
    try {
      const data = JSON.parse(await e.target.files[0].text());
      if (!Array.isArray(data.sessions) || typeof data.q !== 'object') throw 0;
      store = Object.assign({ sessions: [], q: {} }, data); saveStore(); renderStats();
    } catch { alert('הקובץ לא תקין'); }
  };
  app.querySelector('#reset').onclick = () => {
    if (confirm('למחוק את כל ההיסטוריה של תרגול השאלות?')) { store = { sessions: [], q: {} }; saveStore(); renderStats(); }
  };
}

renderHome();
