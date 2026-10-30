'use strict';
// תרגול כרטיסיות: מושג ← "הצג תשובה" ← ידעתי / לא ידעתי. ההתקדמות נשמרת בדפדפן,
// וכרטיסיות שטעית בהן חוזרות יותר. אפשר גם לתרגל בקול (voice.js).

const CARDS = window.CARDS;
const SUBJECTS = [...window.CARD_SUBJECTS, 'הכל'];
const QUIZLET = 'https://quizlet.com/user/Gugu_SS/folders/192103440?i=4y14cx&x=1xqt';
const MODES = {
  mix: { name: 'מעורב', desc: 'קודם כרטיסיות שטעית בהן ושעוד לא ראית' },
  new: { name: 'כרטיסיות חדשות', desc: 'רק כרטיסיות שעוד לא ראית' },
  wrong: { name: 'חזרה על טעויות', desc: 'רק כרטיסיות שלא ידעת בפעם האחרונה' },
};
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const cardKey = c => c.s + '|' + c.t;

// ───────── שמירה ─────────
const STORE_KEY = 'mikraot-cards-v1';
function loadStore() { try { return Object.assign({ sessions: [], c: {} }, JSON.parse(localStorage.getItem(STORE_KEY))); } catch { return { sessions: [], c: {} }; } }
let store = loadStore();
function saveStore() { try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch { } }
function record(c, knew) {
  const s = store.c[cardKey(c)] || (store.c[cardKey(c)] = { r: 0, w: 0 });
  knew ? s.r++ : s.w++;
  s.last = knew ? 1 : 0;
  saveStore();
}
const settings = { subject: SUBJECTS[0], mode: 'mix', size: 20 };
try { Object.assign(settings, JSON.parse(localStorage.getItem('mikraot-cards-settings'))); } catch { }
if (!SUBJECTS.includes(settings.subject)) settings.subject = SUBJECTS[0];
const persist = () => { try { localStorage.setItem('mikraot-cards-settings', JSON.stringify(settings)); } catch { } };

const poolOf = s => CARDS.filter(c => s === 'הכל' || c.s === s);
function pick(cards, mode, n) {
  const seen = c => store.c[cardKey(c)];
  if (mode === 'new') cards = cards.filter(c => !seen(c));
  if (mode === 'wrong') cards = cards.filter(c => seen(c) && seen(c).last === 0);
  return cards.map(c => {
    const s = seen(c);
    const w = !s ? 2 : s.last === 0 ? 4 : 0.5 / (s.r + 1);
    return { c, k: Math.pow(Math.random(), 1 / w) };
  }).sort((a, b) => b.k - a.k).slice(0, n).map(x => x.c);
}

// ───────── ניווט ─────────
const app = document.getElementById('app');
let keyHandler = null;
document.querySelectorAll('[data-nav]').forEach(b => b.addEventListener('click', () => { if (window.Voice) window.Voice.stop(); renderHome(); }));
function setKeys(fn) {
  if (keyHandler) document.removeEventListener('keydown', keyHandler);
  keyHandler = fn;
  if (fn) document.addEventListener('keydown', fn);
}

// ───────── מסך בחירה ─────────
function renderHome() {
  setKeys(null);
  window.scrollTo(0, 0);
  const known = s => poolOf(s).filter(c => store.c[cardKey(c)] && store.c[cardKey(c)].last === 1).length;
  const avail = pick(poolOf(settings.subject), settings.mode, 1e9).length;
  const last = store.sessions[store.sessions.length - 1];
  app.innerHTML = `
    <section class="panel quizlettip">
      <div>
        <h2>💡 מומלץ: לתרגל ב-Quizlet</h2>
        <p class="hint">אותן כרטיסיות נמצאות גם בתיקייה ב-Quizlet, ושם יש עוד מצבי למידה: מבחנים, התאמה, כתיבה ומשחקים. כאן אפשר לתרגל מהר, גם בלי חשבון, וגם בקול.</p>
      </div>
      <a class="primary qbtn" href="${QUIZLET}" target="_blank" rel="noopener">פתיחה ב-Quizlet ↗</a>
    </section>
    <section class="panel">
      <h2>נושא</h2>
      <div class="chips">${SUBJECTS.map(s => `
        <button class="chip ${settings.subject === s ? 'on' : ''}" data-subject="${esc(s)}">
          <span>${esc(s)}</span><small>${poolOf(s).length} כרטיסיות · יודע ${known(s)}</small>
        </button>`).join('')}
      </div>
    </section>
    <section class="panel">
      <h2>אילו כרטיסיות?</h2>
      <div class="levels">${Object.entries(MODES).map(([k, m]) => `
        <button class="level ${settings.mode === k ? 'on' : ''}" data-mode="${k}"><b>${m.name}</b><p>${m.desc}</p></button>`).join('')}
      </div>
    </section>
    <section class="panel row">
      <label>כרטיסיות בסבב
        <select id="size">${[10, 20, 50, 0].map(n => `<option value="${n}" ${settings.size === n ? 'selected' : ''}>${n || 'הכל'}</option>`).join('')}</select>
      </label>
      <span class="hint">${avail ? `${avail} כרטיסיות זמינות` : 'אין כרטיסיות שמתאימות לבחירה'}${last ? ` · סבב אחרון: ${last.knew}/${last.total}${durText(last)}` : ''}</span>
      <button class="primary" id="start" ${avail ? '' : 'disabled'}>התחל ▸</button>
    </section>
    <section class="panel voicepromo">
      <div><h2>🔊 תרגול בקול</h2><p class="hint">המכשיר מקריא מושג, ממתין, ומקריא את התשובה – לנהיגה, בישול או ריצה.</p></div>
      <button class="primary" id="voice">🔊 תרגול בקול</button>
    </section>`;
  app.querySelectorAll('[data-subject]').forEach(b => b.onclick = () => { settings.subject = b.dataset.subject; persist(); renderHome(); });
  app.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => { settings.mode = b.dataset.mode; persist(); renderHome(); });
  app.querySelector('#size').onchange = e => { settings.size = +e.target.value; persist(); };
  app.querySelector('#start').onclick = () => renderRound(pick(poolOf(settings.subject), settings.mode, settings.size || 1e9));
  app.querySelector('#voice').onclick = () => window.Voice.open('cards', { back: renderHome, subject: settings.subject });
}

// ───────── סבב ─────────
function renderRound(cards) {
  if (!cards.length) return renderHome();
  window.scrollTo(0, 0);
  startTimer();
  let i = 0, knew = 0;
  const show = () => {
    const c = cards[i];
    let revealed = false;
    app.innerHTML = `
      <div class="roundhead">
        <div><small>${esc(c.s)}</small><h2>כרטיסייה ${i + 1} מתוך ${cards.length}</h2></div>
        <div class="rh-side">${timerHtml()}<span class="counter">${knew} ידעתי</span></div>
      </div>
      <div class="progress"><span style="width:${100 * i / cards.length}%"></span></div>
      <div class="fcard">
        <p class="fterm">${esc(c.t)}</p>
        <div class="fdef" hidden>${esc(c.d)}</div>
      </div>
      <div class="fbtns" id="fb">
        <button class="primary fbig" id="reveal">הצג תשובה <small>(רווח)</small></button>
      </div>`;
    const reveal = () => {
      if (revealed) return;
      revealed = true;
      app.querySelector('.fdef').hidden = false;
      app.querySelector('#fb').innerHTML = `
        <button class="fknew" id="yes">✓ ידעתי <small>(1)</small></button>
        <button class="fnot" id="no">✗ לא ידעתי <small>(2)</small></button>`;
      app.querySelector('#yes').onclick = () => answer(true);
      app.querySelector('#no').onclick = () => answer(false);
    };
    const answer = k => {
      record(c, k);
      if (k) knew++;
      i++;
      i < cards.length ? show() : finish();
    };
    app.querySelector('#reveal').onclick = reveal;
    setKeys(e => {
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); revealed ? answer(true) : reveal(); }
      else if (revealed && e.key === '1') answer(true);
      else if (revealed && e.key === '2') answer(false);
    });
  };
  const finish = () => {
    setKeys(null);
    const dur = stopTimer();
    store.sessions.push({ ts: Date.now(), subject: settings.subject, knew, total: cards.length, dur });
    saveStore();
    const p = Math.round(100 * knew / cards.length);
    app.innerHTML = `
      <div class="score ${p >= 80 ? 'good' : p >= 50 ? 'mid' : 'bad'}">
        <div class="big">${p}%</div>
        <div>ידעת ${knew} מתוך ${cards.length} · ⏱ ${fmtDur(dur)}</div>
        <div class="actions"><button class="primary" id="again">סבב נוסף</button><button id="home">חזרה לבחירה</button></div>
      </div>`;
    app.querySelector('#again').onclick = () => renderRound(pick(poolOf(settings.subject), settings.mode, settings.size || 1e9));
    app.querySelector('#home').onclick = renderHome;
  };
  show();
}

renderHome();
