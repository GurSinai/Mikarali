'use strict';
// למידה בקול: המכשיר מקריא שאלות או כרטיסיות (Text-to-Speech), ואפשר לענות בקול (Speech-to-Text).
// נועד ללמידה בלי ידיים – בנהיגה, בבישול וכו'. עובד עם מנועי הדיבור של הדפדפן, בלי שרת.

const QUESTIONS = window.QUESTIONS, CARDS = window.CARDS;
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const HAS_TTS = 'speechSynthesis' in window;
const Q_SUBJECTS = ['מקראות ישראל', 'התקווה וההמנון', 'מפה', 'נשק', 'עזרה ראשונה', 'קשר', 'תחקיר', 'פיקוד ותורת הלחימה', 'הכל'];
const C_SUBJECTS = [...window.CARD_SUBJECTS, 'הכל'];
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
const sleep = ms => new Promise(r => setTimeout(r, ms));

// התקדמות בשאלות נשמרת יחד עם תרגול השאלות הרגיל
const STORE_KEY = 'mikraot-questions-v1';
function loadStore() { try { return Object.assign({ sessions: [], q: {} }, JSON.parse(localStorage.getItem(STORE_KEY))); } catch { return { sessions: [], q: {} }; } }
function recordAnswer(q, right) {
  const store = loadStore();
  const s = store.q[q.id] || (store.q[q.id] = { r: 0, w: 0 });
  right ? s.r++ : s.w++;
  s.last = right ? 1 : 0;
  try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch { }
}

const settings = { mode: 'questions', qSubject: 'מקראות ישראל', cSubject: C_SUBJECTS[0], size: 20, listen: !!SR, wait: 5, rate: 1 };
try { Object.assign(settings, JSON.parse(localStorage.getItem('mikraot-voice-settings'))); } catch { }
if (!SR) settings.listen = false;
const persist = () => { try { localStorage.setItem('mikraot-voice-settings', JSON.stringify(settings)); } catch { } };

// ───────── דיבור ─────────
let voice = null;
function pickVoice() {
  if (!HAS_TTS) return;
  const vs = speechSynthesis.getVoices();
  voice = vs.find(v => /^(he|iw)/i.test(v.lang) && /google/i.test(v.name)) || vs.find(v => /^(he|iw)/i.test(v.lang)) || null;
}
if (HAS_TTS) { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }

// ניקוי טקסט לקריאה: קיצורים נפוצים וסימנים שהמנוע מקריא מוזר
function spoken(t) {
  return String(t)
    .replace(/לפנה"ס|לפנה״ס/g, 'לפני הספירה').replace(/ע"י|ע״י/g, 'על ידי').replace(/ק"מ|ק״מ/g, 'קילומטר')
    .replace(/מ\.ק|מ"ק|מ״ק/g, 'מכשיר קשר').replace(/(\d)\s*[-–]\s*(\d)/g, '$1 עד $2')
    .replace(/\s\/\s/g, ' או ').replace(/[–—]/g, ', ').replace(/[*_|]/g, ' ').replace(/\n+/g, '. ');
}
// מנועי דיבור נקטעים בטקסטים ארוכים – מחלקים לקטעים קצרים
function chunks(t) {
  const parts = spoken(t).split(/(?<=[.!?:;,])\s+/);
  const out = [];
  for (const p of parts) {
    if (out.length && (out[out.length - 1] + ' ' + p).length < 180) out[out.length - 1] += ' ' + p;
    else out.push(p);
  }
  return out.filter(x => x.trim());
}
async function say(text) {
  if (!HAS_TTS) return;
  for (const c of chunks(text)) {
    if (!running) return;
    await new Promise(res => {
      const u = new SpeechSynthesisUtterance(c);
      u.lang = 'he-IL';
      if (voice) u.voice = voice;
      u.rate = settings.rate;
      u.onend = u.onerror = res;
      speechSynthesis.speak(u);
    });
  }
}

// ───────── הקשבה ─────────
let recog = null;
function listen(ms) {
  return new Promise(res => {
    if (!SR || !settings.listen || !running) return res(null);
    const r = new SR();
    r.lang = 'he-IL'; r.interimResults = false; r.maxAlternatives = 4; r.continuous = false;
    let done = false;
    const fin = v => { if (done) return; done = true; clearTimeout(timer); recog = null; status(''); try { r.abort(); } catch { } res(v); };
    r.onresult = e => fin([...e.results[0]].map(a => a.transcript));
    r.onerror = () => fin(null);
    r.onend = () => fin(null);
    const timer = setTimeout(() => fin(null), ms);
    recog = r;
    status('🎤 מקשיב…');
    try { r.start(); } catch { fin(null); }
  });
}

const norm = s => String(s).replace(/[֑-ׇ]/g, '').replace(/["'״׳.,?!:;()\-–]/g, ' ').replace(/\s+/g, ' ').trim();
const words = s => norm(s).split(' ').filter(w => w.length > 1).map(w => w.length > 3 && 'והבלמשכ'.includes(w[0]) ? w.slice(1) : w);
const COMMANDS = {
  stop: ['עצור', 'סטופ', 'תפסיק', 'הפסק'],
  repeat: ['חזור', 'שוב', 'עוד פעם', 'תחזור'],
  skip: ['דלג', 'הבא', 'תדלג'],
  dunno: ['לא יודע', 'לא יודעת', 'אין לי מושג', 'תגיד'],
  show: ['הצג תשובה', 'הראה תשובה', 'תראה תשובה', 'מה התשובה', 'הצג', 'תשובה'],
};
function command(alts) {
  if (!alts) return null;
  const t = norm(alts[0]);
  if (t.split(' ').length > 4) return null;
  for (const [k, ws] of Object.entries(COMMANDS)) if (ws.some(w => t === w || t.startsWith(w + ' ') || t.endsWith(' ' + w))) return k;
  return null;
}
const NUMS = [['1', 'אחת', 'אחד', 'ראשונה', 'ראשון', 'א'], ['2', 'שתיים', 'שתים', 'שניים', 'שנים', 'שנייה', 'שני', 'ב'],
  ['3', 'שלוש', 'שלושה', 'שלישית', 'שלישי', 'ג'], ['4', 'ארבע', 'ארבעה', 'רביעית', 'רביעי', 'ד'], ['5', 'חמש', 'חמישה', 'חמישית', 'ה']];
// מזהה איזו אפשרות נאמרה: קודם התאמה לטקסט של האפשרות, ואחר כך מספר האפשרות
function matchOption(alts, opts) {
  for (const a of alts) {
    const t = norm(a);
    const k = opts.findIndex(o => norm(o) === t || (/^\d+$/.test(norm(o)) && t.split(' ').includes(norm(o))));
    if (k >= 0) return k;
  }
  const numeric = opts.every(o => /^\d+$/.test(norm(o)));
  if (!numeric) for (const a of alts) {
    const ws = norm(a).split(' ').filter(w => !['אפשרות', 'תשובה', 'מספר'].includes(w));
    if (ws.length <= 2) {
      const k = NUMS.findIndex((ns, i) => i < opts.length && ws.some(w => ns.includes(w)));
      if (k >= 0) return k;
    }
  }
  let best = -1, bestScore = 0;
  for (const a of alts) {
    const aw = new Set(words(a));
    opts.forEach((o, k) => {
      const ow = words(o);
      if (!ow.length) return;
      const sc = ow.filter(w => aw.has(w)).length / ow.length;
      if (sc > bestScore) { bestScore = sc; best = k; }
    });
  }
  return bestScore >= 0.5 ? best : -1;
}
const overlap = (alts, text) => {
  const tw = words(text);
  if (!alts || !tw.length) return 0;
  return Math.max(...alts.map(a => { const aw = new Set(words(a)); return tw.filter(w => aw.has(w)).length / tw.length; }));
};

// ───────── מסך ─────────
const app = document.getElementById('app');
let running = false, wakeLock = null;
function status(t) { const el = document.getElementById('status'); if (el) el.textContent = t; }

function renderHome() {
  running = false;
  const isQ = settings.mode === 'questions';
  const subj = isQ ? Q_SUBJECTS : C_SUBJECTS;
  const cur = isQ ? settings.qSubject : settings.cSubject;
  const count = s => isQ ? QUESTIONS.filter(q => (s === 'הכל' || q.s === s) && usable(q)).length : CARDS.filter(c => s === 'הכל' || c.s === s).length;
  app.innerHTML = `
    <section class="landing voicehead">
      <h1>למידה בקול</h1>
      <p class="hint">המכשיר מקריא, ואת/ה עונה בקול – בלי ידיים ובלי להסתכל על המסך. אחרי לחיצה על ״התחל״ הכל קורה לבד.</p>
      ${!HAS_TTS ? '<p class="warn">הדפדפן הזה לא תומך בהקראה. נסו ב-Chrome או ב-Safari.</p>' : ''}
      ${!SR ? '<p class="warn">הדפדפן הזה לא תומך בזיהוי דיבור, אז אפשר רק להקשיב: המכשיר יקריא, ימתין, ויקריא את התשובה. (זיהוי דיבור עובד ב-Chrome ובאייפון ב-Safari)</p>' : ''}
    </section>
    <section class="panel">
      <h2>מה לומדים?</h2>
      <div class="levels voicemodes">
        <button class="level ${isQ ? 'on' : ''}" data-mode="questions"><b>שאלות</b><p>מקריא שאלה ואפשרויות, ואת/ה עונה במספר או בתשובה עצמה. נשמר בהתקדמות של תרגול השאלות.</p></button>
        <button class="level ${!isQ ? 'on' : ''}" data-mode="cards"><b>כרטיסיות</b><p>מקריא מושג, מחכה לתשובה שלך, ואז מקריא את ההסבר מהחוברת.</p></button>
      </div>
    </section>
    <section class="panel">
      <h2>נושא</h2>
      <div class="chips">${subj.map(s => `<button class="chip ${s === cur ? 'on' : ''}" data-subj="${esc(s)}"><span>${esc(s)}</span><small>${count(s)} ${isQ ? 'שאלות' : 'כרטיסיות'}</small></button>`).join('')}</div>
    </section>
    <section class="panel voiceopts">
      <label>כמה בסבב <select id="size">${[10, 20, 50, 0].map(n => `<option value="${n}" ${settings.size === n ? 'selected' : ''}>${n || 'הכל'}</option>`).join('')}</select></label>
      <label>מהירות הקראה <select id="rate">${[[0.8, 'איטי'], [1, 'רגיל'], [1.2, 'מהיר']].map(([v, n]) => `<option value="${v}" ${settings.rate === v ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      <label class="chk"><input type="checkbox" id="lis" ${settings.listen ? 'checked' : ''} ${SR ? '' : 'disabled'}> לענות בקול (מיקרופון)</label>
      <label>זמן לחשוב <select id="wait">${[3, 5, 8, 12].map(n => `<option value="${n}" ${settings.wait === n ? 'selected' : ''}>${n} שניות</option>`).join('')}</select></label>
    </section>
    <section class="panel">
      <p class="hint">${isQ
        ? 'פקודות קוליות: לענות במספר התשובה או בתשובה עצמה, <b>״לא יודע״</b> – לשמוע את התשובה, <b>״דלג״</b>, <b>״חזור״</b>, <b>״עצור״</b>.'
        : 'פקודות קוליות: לומר את התשובה, או <b>״הצג תשובה״</b> – לשמוע אותה, או <b>״דלג״</b>. וגם <b>״חזור״</b> ו<b>״עצור״</b>.'} הפקודות מופיעות גם על המסך בזמן הלמידה.</p>
      <button class="primary bigstart" id="start" ${HAS_TTS ? '' : 'disabled'}>▶ התחל</button>
    </section>`;
  app.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => { settings.mode = b.dataset.mode; persist(); renderHome(); });
  app.querySelectorAll('[data-subj]').forEach(b => b.onclick = () => { settings[isQ ? 'qSubject' : 'cSubject'] = b.dataset.subj; persist(); renderHome(); });
  app.querySelector('#size').onchange = e => { settings.size = +e.target.value; persist(); };
  app.querySelector('#rate').onchange = e => { settings.rate = +e.target.value; persist(); };
  app.querySelector('#wait').onchange = e => { settings.wait = +e.target.value; persist(); };
  app.querySelector('#lis').onchange = e => { settings.listen = e.target.checked; persist(); };
  app.querySelector('#start').onclick = start;
}

// שאלות שמתאימות להקראה: תשובה אחת נכונה, בלי אפשרויות שמפנות זו לזו
const usable = q => q.t === 'open' || (q.c.length === 1 && !q.o.some(o => /[אבגד]'\s*(ו|\+)|תשובות|התשובות נכונות/.test(o)));

function pickQuestions() {
  const store = loadStore();
  const pool = QUESTIONS.filter(q => (settings.qSubject === 'הכל' || q.s === settings.qSubject) && usable(q));
  return pool.map(q => {
    const s = store.q[q.id];
    const w = !s ? 2 : s.last === 0 ? 4 : 0.5 / (s.r + 1);
    return { q, k: Math.pow(Math.random(), 1 / w) };
  }).sort((a, b) => b.k - a.k).slice(0, settings.size || 1e9).map(x => x.q);
}

const SAY_Q = settings => settings.listen
  ? [['🔢', 'אמרו את מספר התשובה או את התשובה עצמה'], ['🤷', '״לא יודע״ – לשמוע את התשובה'], ['⏭', '״דלג״'], ['⟲', '״חזור״'], ['■', '״עצור״']]
  : [['⏳', 'המכשיר ימתין ויקריא את התשובה'], ['⏭', 'דלג'], ['⟲', 'חזור'], ['■', 'עצור']];
const SAY_C = settings => settings.listen
  ? [['💬', 'אמרו את התשובה'], ['👁', '״הצג תשובה״'], ['⏭', '״דלג״'], ['⟲', '״חזור״'], ['■', '״עצור״']]
  : [['⏳', 'המכשיר ימתין ויקריא את ההסבר'], ['⏭', 'דלג'], ['⟲', 'חזור'], ['■', 'עצור']];
function screen(title, body, cards) {
  const cmds = (cards ? SAY_C : SAY_Q)(settings);
  app.innerHTML = `
    <section class="voicebox">
      <small class="vcount">${esc(title)}</small>
      <div class="vtext">${body}</div>
      <p class="vstatus" id="status"></p>
    </section>
    <ul class="vcmds" aria-label="פקודות">${cmds.map(([i, t]) => `<li><span>${i}</span>${esc(t)}</li>`).join('')}</ul>
    <div class="vcontrols">
      ${cards ? '<button id="vshow">👁 הצג תשובה</button>' : '<button id="vshow">🤷 לא יודע</button>'}<button id="vskip">⏭ דלג</button><button id="vrep">⟲ חזור</button><button class="danger" id="vstop">■ עצור</button>
    </div>`;
  app.querySelector('#vstop').onclick = () => { pending = 'stop'; stopAll(); };
  app.querySelector('#vskip').onclick = () => { pending = 'skip'; interrupt(); };
  app.querySelector('#vrep').onclick = () => { pending = 'repeat'; interrupt(); };
  app.querySelector('#vshow').onclick = () => { pending = 'show'; interrupt(); };
}
// לחיצה על כפתור בזמן הקראה/הקשבה: עוצרים את מה שקורה, והלולאה בודקת את pending
let pending = null;
function interrupt() { if (HAS_TTS) speechSynthesis.cancel(); if (recog) try { recog.abort(); } catch { } }
function stopAll() { running = false; interrupt(); }
const take = () => { const p = pending; pending = null; return p; };

async function start() {
  running = true; pending = null;
  try { wakeLock = await navigator.wakeLock?.request('screen'); } catch { }
  const result = settings.mode === 'questions' ? await runQuestions() : await runCards();
  running = false;
  try { await wakeLock?.release(); } catch { }
  renderEnd(result);
}

async function runQuestions() {
  const qs = pickQuestions();
  let right = 0, answered = 0;
  for (let i = 0; i < qs.length && running; i++) {
    const q = qs[i];
    const mc = q.t === 'mc';
    screen(`שאלה ${i + 1} מתוך ${qs.length} · ${q.s}`, `<p class="vq">${esc(q.q)}</p>${mc ? `<ol class="vopts">${q.o.map(o => `<li>${esc(o)}</li>`).join('')}</ol>` : ''}`);
    let outcome = null;  // 'right' | 'wrong' | 'skip' | 'reveal' | 'dunno'
    let openDone = false;  // שאלה פתוחה שכבר הוקראה תשובתה ונרשמה
    let tries = 0;
    while (running && !outcome) {
      await say(`שאלה ${i + 1}. ${q.q}`);
      if (mc) for (let k = 0; k < q.o.length && running && !pending; k++) await say(`${k + 1}. ${q.o[k]}`);
      let p = take();
      if (p === 'stop' || !running) break;
      if (p === 'repeat') continue;
      if (p === 'skip') { outcome = 'skip'; break; }
      if (p === 'show') { outcome = mc ? 'wrong' : 'dunno'; break; }
      if (!settings.listen) {
        status(`⏳ ${settings.wait} שניות לחשוב…`);
        await sleep(settings.wait * 1000);
        p = take();
        if (p === 'repeat') continue;
        outcome = p === 'skip' ? 'skip' : 'reveal';
        break;
      }
      // הקשבה לתשובה, עם עוד ניסיון אחד אם לא הובנה
      while (running && !outcome) {
        const alts = await listen((settings.wait + 6) * 1000);
        p = take();
        if (p === 'stop' || !running) break;
        if (p === 'repeat') break;
        if (p === 'skip') { outcome = 'skip'; break; }
        if (p === 'show') { outcome = 'wrong'; break; }
        const cmd = command(alts);
        if (cmd === 'stop') { running = false; break; }
        if (cmd === 'repeat') break;
        if (cmd === 'skip') { outcome = 'skip'; break; }
        if (cmd === 'dunno' || cmd === 'show') { outcome = mc ? 'wrong' : 'dunno'; break; }
        if (!alts) {
          if (++tries >= 2) { outcome = 'wrong'; break; }
          await say('לא שמעתי. נסה שוב, או אמור לא יודע.');
          continue;
        }
        if (mc) {
          const k = matchOption(alts, q.o);
          status(`שמעתי: ״${alts[0]}״`);
          if (k < 0) {
            if (++tries >= 2) { outcome = 'wrong'; break; }
            await say('לא הבנתי. אמור את מספר התשובה.');
            continue;
          }
          outcome = q.c.includes(k) ? 'right' : 'wrong';
        } else {
          status(`שמעתי: ״${alts[0]}״`);
          await say('התשובה היא: ' + q.a);
          await say('ידעת? אמור כן או לא.');
          const yn = await listen(6000);
          const t = yn ? norm(yn[0]) : '';
          outcome = /^(כן|נכון|ידעתי|בטח)/.test(t) ? 'right' : 'wrong';
          answered++; if (outcome === 'right') right++;
          recordAnswer(q, outcome === 'right');
          openDone = true;
        }
      }
      if (pending === 'repeat' || (!outcome && running)) { take(); continue; }
    }
    if (!running) break;
    if (outcome === 'skip') continue;
    const correct = mc ? q.c.map(k => q.o[k]).join(' או ') : q.a;
    const box = app.querySelector('.vtext');
    if (mc && outcome !== 'reveal') {
      answered++; if (outcome === 'right') right++;
      recordAnswer(q, outcome === 'right');
      box.insertAdjacentHTML('beforeend', `<p class="vres ${outcome}">${outcome === 'right' ? 'נכון!' : 'התשובה: ' + esc(correct)}</p>`);
      await say(outcome === 'right' ? 'נכון!' : `לא נכון. התשובה הנכונה: ${q.c[0] + 1}. ${correct}`);
    } else if (!openDone) {
      if (outcome === 'dunno') { answered++; recordAnswer(q, false); }
      box.insertAdjacentHTML('beforeend', `<p class="vres">התשובה: ${esc(correct)}</p>`);
      await say('התשובה: ' + correct);
    }
    const ex = q.x || (q.e && q.e[0] && q.e[0][1]);
    if (ex && running && !pending) { box.insertAdjacentHTML('beforeend', `<p class="vex">${esc(ex)}</p>`); await say(ex); }
    take();
    await sleep(700);
  }
  return { kind: 'questions', right, answered };
}

async function runCards() {
  const cards = shuffle(CARDS.filter(c => settings.cSubject === 'הכל' || c.s === settings.cSubject)).slice(0, settings.size || 1e9);
  let done = 0, knew = 0;
  for (let i = 0; i < cards.length && running; i++) {
    const c = cards[i];
    screen(`כרטיסייה ${i + 1} מתוך ${cards.length} · ${c.s}`, `<p class="vq">${esc(c.t)}</p>`, true);
    let p;
    while (running) {
      await say(c.t);
      p = take();
      if (p === 'repeat') continue;
      if (p === 'skip' || p === 'stop' || p === 'show') break;
      if (settings.listen) {
        const alts = await listen((settings.wait + 6) * 1000);
        p = take();
        const cmd = command(alts);
        if (cmd === 'stop') { running = false; break; }
        if (cmd === 'repeat' || p === 'repeat') continue;
        if (cmd === 'skip' || p === 'skip') { p = 'skip'; break; }
        if (cmd === 'show' || cmd === 'dunno' || p === 'show') break;
        if (alts && !cmd) {
          status(`שמעתי: ״${alts[0]}״`);
          if (overlap(alts, c.d) >= 0.5) { knew++; await say('נכון!'); }
        }
      } else {
        status(`⏳ ${settings.wait} שניות לחשוב…`);
        await sleep(settings.wait * 1000);
        p = take();
        if (p === 'repeat') continue;
        if (p === 'skip') break;
      }
      break;
    }
    if (!running) break;
    if (p === 'skip') continue;
    app.querySelector('.vtext').insertAdjacentHTML('beforeend', `<p class="vex">${esc(c.d)}</p>`);
    await say(c.d);
    done++;
    take();
    await sleep(800);
  }
  return { kind: 'cards', done, knew };
}

function renderEnd(r) {
  if (HAS_TTS) speechSynthesis.cancel();
  const line = r.kind === 'questions'
    ? (r.answered ? `ענית נכון על ${r.right} מתוך ${r.answered} שאלות` : 'לא נענו שאלות')
    : `עברת על ${r.done} כרטיסיות${r.knew ? ` · ${r.knew} מהן ענית נכון בקול` : ''}`;
  app.innerHTML = `
    <section class="voicebox">
      <div class="vtext"><p class="vq">סיימנו</p><p>${line}</p></div>
    </section>
    <div class="vcontrols"><button class="primary" id="again">▶ עוד סבב</button><button id="home">חזרה לבחירה</button></div>`;
  app.querySelector('#again').onclick = start;
  app.querySelector('#home').onclick = renderHome;
  if (r.kind === 'questions' && r.answered) { running = true; say(line).then(() => { running = false; }); }
}

renderHome();
