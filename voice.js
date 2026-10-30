'use strict';
// תרגול בקול: המכשיר מקריא שאלות או כרטיסיות (Text-to-Speech), ואפשר לענות בקול (Speech-to-Text).
// נועד ללמידה בלי ידיים – בנהיגה, בבישול וכו'. עובד עם מנועי הדיבור של הדפדפן, בלי שרת.
// נפתח מתוך דף השאלות או דף הכרטיסיות: Voice.open('questions' | 'cards', { back, subject }).
// הכל עטוף בפונקציה כדי שהשמות כאן (settings, renderHome...) לא יתנגשו עם הדף המארח.
(function () {

const QUESTIONS = window.QUESTIONS || [], CARDS = window.CARDS || [];
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const HAS_TTS = 'speechSynthesis' in window;
const Q_SUBJECTS = ['מקראות ישראל', 'התקווה וההמנון', 'מפה', 'נשק', 'עזרה ראשונה', 'קשר', 'תחקיר', 'פיקוד ותורת הלחימה', 'הכל'];
const C_SUBJECTS = [...(window.CARD_SUBJECTS || []), 'הכל'];
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

const settings = { mode: 'questions', qSubject: 'מקראות ישראל', cSubject: C_SUBJECTS[0], size: 20, listen: !!SR, listenC: false, wait: 5, rate: 1, explain: 'wrong', srLang: 'he-IL' };
try { Object.assign(settings, JSON.parse(localStorage.getItem('mikraot-voice-settings'))); } catch { }
if (!SR) settings.listen = settings.listenC = false;
// מיקרופון בנפרד לשאלות ולכרטיסיות (בכרטיסיות כבוי כברירת מחדל: מקריא, ממתין ומקריא את התשובה)
const mic = () => !!SR && (settings.mode === 'cards' ? settings.listenC : settings.listen);
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
    .replace(/\s\/\s/g, ' או ').replace(/[–—]/g, ', ').replace(/[*_|]/g, ' ').replace(/\n+/g, '. ')
    // גרש וגרשיים: מנועי דיבור בטלפון מקריאים אותם כקוד ("xb7xb3"). בתוך ראשי תיבות (צה״ל) ואחרי
    // אות (ז׳) פשוט מורידים; גרשיים שמשמשים כמירכאות הופכים לפסיק, כלומר להפסקה קצרה
    .replace(/[​-‏‪-‮⁦-⁩﻿]/g, '')
    .replace(/([א-ת])["״”“](?=[א-ת])/g, '$1')
    .replace(/([א-ת])['׳’`]/g, '$1')
    .replace(/["״׳'`“”„‘’]/g, ', ')
    .replace(/[·•…]/g, ', ').replace(/\s*,\s*(,\s*)+/g, ', ').replace(/\s+/g, ' ').replace(/^\s*,\s*|\s*,\s*$/g, '');
}
// מנועי דיבור נקטעים בטקסטים ארוכים – מחלקים לקטעים קצרים (בלי lookbehind, שלא נתמך ב-Safari ישן)
function chunks(t) {
  const parts = spoken(t).match(/[^.!?:;,]+[.!?:;,]*/g) || [];
  const out = [];
  for (const raw of parts) {
    const p = raw.trim();
    if (!p) continue;
    if (out.length && (out[out.length - 1] + ' ' + p).length < 180) out[out.length - 1] += ' ' + p;
    else out.push(p);
  }
  return out;
}
const keep = [];  // באייפון מבע שנאסף ע"י ה-GC לא מסיים – שומרים הפניה
function utter(text) {
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'he-IL';
  if (voice) u.voice = voice;
  u.rate = settings.rate;
  keep.push(u); if (keep.length > 20) keep.shift();
  return u;
}
async function say(text) {
  if (!HAS_TTS) return;
  for (const c of chunks(text)) {
    if (busy()) return;
    await new Promise(res => {
      const u = utter(c);
      // ביטחון: אם onend לא מגיע (קורה באייפון), ממשיכים אחרי זמן משוער
      const t = setTimeout(res, 2500 + c.length * 110 / settings.rate);
      u.onend = u.onerror = () => { clearTimeout(t); res(); };
      try { speechSynthesis.resume(); } catch { }
      speechSynthesis.speak(u);
    });
  }
}
// באייפון מותר להתחיל לדבר רק מתוך לחיצה – אומרים משהו מיד בלחיצה על "התחל"
function unlockSpeech(text) {
  if (!HAS_TTS) return;
  try { speechSynthesis.cancel(); speechSynthesis.resume(); } catch { }
  speechSynthesis.speak(utter(text));
}

// ───────── הקשבה ─────────
// אם הטלפון חוסם הקשבה שלא התחילה בלחיצה, מציגים כפתור גדול "הקש כדי לענות"
let recog = null, micBlocked = false;
const MIC_ERRORS = {
  'not-allowed': 'המיקרופון חסום לאתר. אשרו גישה למיקרופון בהגדרות הדפדפן.',
  'service-not-allowed': 'זיהוי הדיבור כבוי. באייפון: הגדרות › כללי › מקלדת › "הפעל הכתבה".',
  'audio-capture': 'אין גישה למיקרופון.',
  'network': 'זיהוי הדיבור צריך חיבור לאינטרנט.',
  'language-not-supported': 'זיהוי דיבור בעברית לא נתמך במכשיר הזה.',
  'no-speech': 'לא נשמע דיבור.',
};
// באייפון (וחלק ממכשירי אנדרואיד) הזיהוי לא תמיד מסמן תוצאה "סופית" – לכן אוספים גם תוצאות ביניים,
// ומסיימים אחרי שתיקה קצרה. קוד השפה נבחר בבדיקת המיקרופון (יש מכשירים שמקבלים רק he או iw-IL).
const SR_LANGS = ['he-IL', 'he', 'iw-IL'];
function newRecognizer(onText, onFinish) {
  const r = new SR();
  r.lang = settings.srLang || 'he-IL';
  r.interimResults = true; r.continuous = true; r.maxAlternatives = 4;
  let heard = '', alts = [], silence = null, ended = false;
  const finish = () => { if (ended) return; ended = true; clearTimeout(silence); try { r.stop(); } catch { } onFinish(heard ? [heard, ...alts.filter(x => x.trim() && x.trim() !== heard)] : null); };
  r.onresult = e => {
    const segs = [];
    for (let i = 0; i < e.results.length; i++) {
      const t = String(e.results[i][0].transcript || '').trim();
      if (!t) continue;
      const prev = segs[segs.length - 1];
      if (prev && t.startsWith(prev)) segs[segs.length - 1] = t;
      else if (!prev || !prev.startsWith(t)) segs.push(t);
    }
    heard = segs.join(' ');
    const last = e.results[e.results.length - 1];
    if (last.isFinal) alts = [...last].map(x => x.transcript);
    if (onText) onText(heard);
    clearTimeout(silence);
    silence = setTimeout(finish, last.isFinal ? 600 : 1500);
  };
  r.finish = finish;
  return r;
}
function listen(ms) {
  return new Promise(res => {
    if (!mic() || !running) return res(null);
    let done = false, timer = null, tapping = false;
    const fin = v => { if (done) return; done = true; clearTimeout(timer); recog = null; status(''); hideTap(); res(v); };
    const begin = () => {
      tapping = false;
      const r = newRecognizer(t => status('🎤 ' + t), v => { try { r.abort(); } catch { } fin(v); });
      r.onerror = e => {
        if (['not-allowed', 'service-not-allowed'].includes(e.error) && !micBlocked && running) {
          micBlocked = true; tapping = true; clearTimeout(timer); recog = null; showTap(begin);
          return;
        }
        if (e.error !== 'no-speech' && e.error !== 'aborted') status('⚠ ' + (MIC_ERRORS[e.error] || e.error));
        r.finish();
      };
      r.onend = () => { if (!tapping) r.finish(); };
      timer = setTimeout(() => r.finish(), ms);
      recog = r;
      status('🎤 מקשיב…');
      try { r.start(); } catch { fin(null); }
    };
    if (micBlocked) { tapping = true; showTap(begin); } else begin();
  });
}
function showTap(begin) {
  status('🎤 הטלפון דורש לחיצה כדי להקשיב');
  if (document.querySelector('.vtap')) return;
  const b = document.createElement('button');
  b.className = 'primary vtap';
  b.textContent = '🎤 הקש כדי לענות';
  b.onclick = () => { b.remove(); begin(); };
  const c = document.querySelector('.vbar') || document.querySelector('.vcontrols');
  if (c) c.before(b);
}
function hideTap() { const b = document.querySelector('.vtap'); if (b) b.remove(); }

// נרמול הטקסט שמגיע מזיהוי הדיבור: ניקוד, סימני כיווניות נסתרים (נפוצים בטלפונים), פיסוק ורווחים
const norm = s => String(s).normalize('NFC')
  .replace(/[֑-ׇ]/g, '')
  .replace(/[​-‏‪-‮⁦-⁩﻿ ]/g, ' ')
  .replace(/[^\p{L}\p{N}\s]/gu, ' ')
  .replace(/\s+/g, ' ').trim().toLowerCase();
const words = s => norm(s).split(' ').filter(w => w.length > 1).map(w => w.length > 3 && 'והבלמשכ'.includes(w[0]) ? w.slice(1) : w);
const COMMANDS = {
  stop: ['עצור', 'סטופ', 'תפסיק', 'הפסק'],
  repeat: ['חזור', 'שוב', 'עוד פעם', 'תחזור'],
  skip: ['דלג', 'הבא', 'תדלג'],
  dunno: ['לא יודע', 'לא יודעת', 'אין לי מושג', 'תגיד'],
  show: ['הצג תשובה', 'הראה תשובה', 'תראה תשובה', 'מה התשובה', 'הצג'],
};
function command(alts) {
  if (!alts) return null;
  const t = norm(alts[0]);
  if (t.split(' ').length > 4) return null;
  for (const [k, ws] of Object.entries(COMMANDS)) if (ws.some(w => t === w || t.startsWith(w + ' ') || t.endsWith(' ' + w))) return k;
  return null;
}
// מספרי תשובה כפי שהם עלולים להגיע מזיהוי הדיבור: ספרה, מילה (זכר/נקבה), סודר, שם אות, ואנגלית
const NUM_WORDS = [
  ['1', 'אחת', 'אחד', 'ראשונה', 'ראשון', 'א', 'אלף', 'one'],
  ['2', 'שתיים', 'שתים', 'שניים', 'שנים', 'שנייה', 'שניה', 'שני', 'ב', 'בית', 'two'],
  ['3', 'שלוש', 'שלושה', 'שלש', 'שלשה', 'שלישית', 'שלישי', 'ג', 'גימל', 'three'],
  ['4', 'ארבע', 'ארבעה', 'רביעית', 'רביעי', 'ד', 'דלת', 'four'],
  ['5', 'חמש', 'חמישה', 'חמישית', 'חמישי', 'ה', 'five'],
];
const PREFIXES = 'והבלמשכ';
// מחזיר את מספר האפשרות (0..4) שנאמר, או -1. עובד גם עם מילים חוזרות ("אחד אחד"), מילות מילוי
// ("תשובה מספר אחת"), תחיליות ("באחת", "האחת") וספרות צמודות ("1." / "תשובה1")
function spokenNumber(text) {
  const found = new Set();
  for (const w of norm(text).split(' ')) {
    if (!w) continue;
    const cands = [w];
    if (w.length > 2 && PREFIXES.includes(w[0])) cands.push(w.slice(1));
    if (w.length > 3 && PREFIXES.includes(w[0]) && PREFIXES.includes(w[1])) cands.push(w.slice(2));
    let k = -1;
    for (const c of cands) {
      // אות בודדת (א/ב/ג/ד) נחשבת רק כשנאמרה לבד, לא כשנשארה אחרי הסרת תחילית
      if (c.length === 1 && c !== w) continue;
      k = NUM_WORDS.findIndex(ns => ns.includes(c));
      if (k >= 0) break;
    }
    if (k < 0) { const d = w.match(/^\D*([1-5])\D*$/); if (d) k = +d[1] - 1; }
    if (k >= 0) found.add(k);
  }
  return found.size === 1 ? [...found][0] : -1;
}
// מזהה איזו אפשרות נאמרה: התאמה לטקסט של האפשרות, מספר האפשרות, או רוב המילים של האפשרות
function matchOption(alts, opts) {
  if (!alts) return -1;
  const no = opts.map(o => norm(o));
  for (const a of alts) {
    const t = norm(a);
    const k = no.findIndex(o => o === t || (/^\d+$/.test(o) && t.split(' ').includes(o)));
    if (k >= 0) return k;
  }
  for (const a of alts) {
    const k = spokenNumber(a);
    if (k >= 0 && k < opts.length) return k;
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
  document.body.classList.remove('vrunning');
  const isQ = settings.mode === 'questions';
  const subj = isQ ? Q_SUBJECTS : C_SUBJECTS;
  const cur = isQ ? settings.qSubject : settings.cSubject;
  const count = s => isQ ? QUESTIONS.filter(q => (s === 'הכל' || q.s === s) && usable(q)).length : CARDS.filter(c => s === 'הכל' || c.s === s).length;
  app.innerHTML = `
    ${onBack ? '<button class="backlink vback" id="vback">→ חזרה לתרגול הרגיל</button>' : ''}
    <section class="landing voicehead">
      <h1>${isQ ? 'תרגול שאלות בקול' : 'תרגול כרטיסיות בקול'}</h1>
      <p class="hint">המכשיר מקריא, ואת/ה עונה בקול – בלי ידיים ובלי להסתכל על המסך. אחרי לחיצה על ״התחל״ הכל קורה לבד.</p>
      ${!HAS_TTS ? '<p class="warn">הדפדפן הזה לא תומך בהקראה. נסו ב-Chrome או ב-Safari.</p>' : ''}
      ${!SR ? '<p class="warn">הדפדפן הזה לא תומך בזיהוי דיבור, אז אפשר רק להקשיב: המכשיר יקריא, ימתין, ויקריא את התשובה. (זיהוי דיבור עובד ב-Chrome ובאייפון ב-Safari)</p>' : ''}
    </section>
    <section class="panel">
      <h2>נושא</h2>
      <div class="chips">${subj.map(s => `<button class="chip ${s === cur ? 'on' : ''}" data-subj="${esc(s)}"><span>${esc(s)}</span><small>${count(s)} ${isQ ? 'שאלות' : 'כרטיסיות'}</small></button>`).join('')}</div>
    </section>
    <section class="panel voiceopts">
      <label>כמה בסבב <select id="size">${[10, 20, 50, 0].map(n => `<option value="${n}" ${settings.size === n ? 'selected' : ''}>${n || 'הכל'}</option>`).join('')}</select></label>
      <label>מהירות הקראה <select id="rate">${[[0.8, 'איטי'], [1, 'רגיל'], [1.2, 'מהיר']].map(([v, n]) => `<option value="${v}" ${settings.rate === v ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      <label class="chk"><input type="checkbox" id="lis" ${mic() ? 'checked' : ''} ${SR ? '' : 'disabled'}> לענות בקול (מיקרופון)</label>
      ${isQ ? `<label>הסבר אחרי שאלה <select id="explain">${[['always', 'תמיד'], ['wrong', 'רק כשטעיתי'], ['never', 'בלי']].map(([v, n]) => `<option value="${v}" ${settings.explain === v ? 'selected' : ''}>${n}</option>`).join('')}</select></label>` : ''}
      <label>זמן לחשוב <select id="wait">${[3, 5, 8, 12].map(n => `<option value="${n}" ${settings.wait === n ? 'selected' : ''}>${n} שניות</option>`).join('')}</select></label>
    </section>
    <section class="panel">
      <p class="hint">${isQ
        ? 'פקודות קוליות: לענות במספר התשובה או בתשובה עצמה, <b>״לא יודע״</b> – לשמוע את התשובה, <b>״דלג״</b>, <b>״חזור״</b>, <b>״עצור״</b>.'
        : mic() ? 'פקודות קוליות: לומר את התשובה, או <b>״הצג תשובה״</b> – לשמוע אותה, או <b>״דלג״</b>. וגם <b>״חזור״</b> ו<b>״עצור״</b>.'
          : `המכשיר מקריא מושג, ממתין ${settings.wait} שניות ומקריא את התשובה. אפשר לדלג, לחזור או לעצור בכפתורים. (רוצים לענות בקול? סמנו ״לענות בקול״)`} הפקודות מופיעות גם על המסך בזמן הלמידה.</p>
      <button class="primary bigstart" id="start" ${HAS_TTS ? '' : 'disabled'}>▶ התחל</button>
    </section>
    <section class="panel">
      <h2>בדיקה</h2>
      <p class="hint">לא עובד? בדקו כאן מה עובד במכשיר. באייפון זיהוי דיבור עובד רק ב-Safari (לא ב-Chrome).</p>
      <div class="voicetest"><button id="ttest">🔊 בדיקת הקראה</button><button id="mtest" ${SR ? '' : 'disabled'}>🎤 בדיקת מיקרופון</button></div>
      <p class="testout" id="testout">${SR ? '' : 'הדפדפן הזה לא תומך בזיהוי דיבור.'}</p>
    </section>`;
  const back = app.querySelector('#vback');
  if (back) back.onclick = () => { stopAll(); onBack(); };
  app.querySelectorAll('[data-subj]').forEach(b => b.onclick = () => { settings[isQ ? 'qSubject' : 'cSubject'] = b.dataset.subj; persist(); renderHome(); });
  app.querySelector('#size').onchange = e => { settings.size = +e.target.value; persist(); };
  app.querySelector('#rate').onchange = e => { settings.rate = +e.target.value; persist(); };
  app.querySelector('#wait').onchange = e => { settings.wait = +e.target.value; persist(); };
  if (isQ) app.querySelector('#explain').onchange = e => { settings.explain = e.target.value; persist(); };
  app.querySelector('#lis').onchange = e => { settings[isQ ? 'listen' : 'listenC'] = e.target.checked; persist(); renderHome(); };
  app.querySelector('#start').onclick = start;
  app.querySelector('#ttest').onclick = testSpeech;
  if (SR) app.querySelector('#mtest').onclick = testMic;
}
function testOut(t) { document.getElementById('testout').textContent = t; }
function testSpeech() {
  if (!HAS_TTS) return testOut('הדפדפן לא תומך בהקראה.');
  pickVoice();
  const he = voice ? `קול בעברית: ${voice.name}` : 'לא נמצא קול עברי במכשיר – אפשר להוריד אחד בהגדרות › נגישות › תוכן מוקרא › קולות.';
  const u = utter('שלום, זו בדיקת הקראה בעברית');
  let started = false;
  u.onstart = () => { started = true; testOut('🔊 מקריא… ' + he); };
  u.onend = () => testOut('✓ ההקראה עובדת. ' + he);
  u.onerror = e => testOut('✗ שגיאה בהקראה: ' + (e.error || '') + '. ' + he);
  try { speechSynthesis.cancel(); speechSynthesis.resume(); } catch { }
  speechSynthesis.speak(u);
  setTimeout(() => { if (!started) testOut('✗ לא התחילה הקראה. בדקו שהטלפון לא במצב שקט (מתג הצד באייפון) ושהעוצמה פתוחה. ' + he); }, 3000);
}
function testMic() {
  const lang = settings.srLang || 'he-IL';
  const seen = [];
  let text = '', errored = '', tail = ' · 🎤 דברו עכשיו (למשל "אחת")';
  const show = (extra = tail) => testOut(`שפה: ${lang} · אירועים: ${seen.join(', ') || '—'}${text ? ` · שמעתי: "${text}"` : ''}${extra}`);
  const r = newRecognizer(t => { text = t; show(); }, v => {
    if (v) {
      settings.srLang = lang; persist();
      const k = spokenNumber(v[0]);
      tail = ' · ✓ המיקרופון עובד' + (k >= 0 ? ` · זוהה כתשובה ${k + 1}` : ' · (לא זוהה מספר תשובה)'); show();
    } else {
      const next = SR_LANGS[(SR_LANGS.indexOf(lang) + 1) % SR_LANGS.length];
      settings.srLang = next; persist();
      const why = errored ? ' · ' + (MIC_ERRORS[errored] || errored)
        : seen.includes('דיבור') || seen.includes('קול') ? ` · ✗ נשמע קול אבל לא התקבל טקסט. עברתי לקוד שפה ${next} – לחצו שוב על הבדיקה`
        : ' · ✗ לא נקלט קול בכלל – בדקו שהמיקרופון לא בשימוש באפליקציה אחרת';
      tail = why; show();
    }
  });
  const ev = (name, label) => r.addEventListener(name, () => { if (!seen.includes(label)) seen.push(label); show(); });
  ev('start', 'התחיל'); ev('audiostart', 'מיקרופון'); ev('soundstart', 'קול'); ev('speechstart', 'דיבור'); ev('speechend', 'סוף דיבור'); ev('end', 'סיום');
  r.addEventListener('end', () => r.finish());
  r.onerror = e => { errored = e.error; if (e.error !== 'aborted') { seen.push('שגיאה: ' + e.error); show(); } };
  setTimeout(() => r.finish(), 9000);
  show();
  try { r.start(); } catch (err) { testOut('✗ ' + err.message); }
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

const HINT_Q = () => settings.listen ? 'אמרו מספר או הקישו · ״לא יודע״ · ״דלג״ · ״חזור״ · ״עצור״' : 'הקישו על התשובה';
const HINT_C = () => settings.listenC ? 'אמרו את התשובה · ״הצג תשובה״ · ״דלג״ · ״חזור״ · ״עצור״' : `התשובה תוקרא אחרי ${settings.wait} שניות`;

// מסך הסבב: על כל המסך. למעלה השאלה, באמצע כפתורי תשובה ענקיים, למטה פס פקודות
function screen(title, body, kind, q) {
  const cards = kind === 'cards';
  const slot = cards
    ? '<button class="vbig primary" id="vshow2">👁 הצג תשובה</button>'
    : q && q.t === 'mc'
      ? q.o.map((o, k) => `<button class="vansbtn${o.length > 40 ? ' long' : ''}" data-k="${k}"><b>${k + 1}</b><span>${esc(o)}</span></button>`).join('')
      : '<button class="vbig" id="vshow2">👁 הצג תשובה</button>';
  const n = !cards && q && q.t === 'mc' ? q.o.length : 1;
  document.body.classList.add('vrunning');
  app.innerHTML = `
    <div class="vrun">
      <div class="vtop">
        <small class="vcount">${esc(title)}</small>
        <div class="vtext">${body}</div>
        <p class="vstatus" id="status"></p>
        <p class="vhint">${esc(cards ? HINT_C() : HINT_Q())}</p>
      </div>
      <div class="vslot n${n}">${slot}</div>
      <div class="vbar">
        ${cards ? '' : '<button id="vshow">🤷<span>לא יודע</span></button>'}
        <button id="vskip">⏭<span>דלג</span></button><button id="vrep">⟲<span>חזור</span></button><button class="danger" id="vstop">■<span>עצור</span></button>
      </div>
    </div>`;
  app.querySelector('#vstop').onclick = () => { pending = 'stop'; stopAll(); };
  app.querySelector('#vskip').onclick = () => { pending = 'skip'; interrupt(); };
  app.querySelector('#vrep').onclick = () => { pending = 'repeat'; interrupt(); };
  app.querySelectorAll('#vshow, #vshow2').forEach(b => b.onclick = () => { pending = 'show'; interrupt(); });
  app.querySelectorAll('.vansbtn').forEach(b => b.onclick = () => {
    if (tapped !== null || b.disabled) return;
    tapped = +b.dataset.k; b.classList.add('sel'); interrupt();
  });
}
// כפתורי "ידעתי / לא ידעתי" לשאלה פתוחה – ממלאים את אזור הכפתורים
function showKnew() {
  const slot = app.querySelector('.vslot');
  slot.className = 'vslot n2';
  slot.innerHTML = '<button class="vansbtn" data-yn="1"><b>✓</b><span>ידעתי</span></button><button class="vansbtn" data-yn="0"><b>✗</b><span>לא ידעתי</span></button>';
  slot.querySelectorAll('[data-yn]').forEach(b => b.onclick = () => { if (tapped === null) { tapped = +b.dataset.yn; b.classList.add('sel'); interrupt(); } });
}
// מסמן את התשובות על הכפתורים: הנכונה בירוק, הבחירה השגויה באדום
function markAnswers(q, chosen) {
  app.querySelectorAll('.vansbtn[data-k]').forEach(b => {
    const k = +b.dataset.k;
    b.disabled = true;
    if (q.c.includes(k)) b.classList.add('right');
    else if (k === chosen) b.classList.add('wrong');
  });
}

// לחיצה על כפתור בזמן הקראה, הקשבה או המתנה: עוצרים מיד, והלולאה בודקת את pending / tapped
let pending = null, tapped = null, wake = null;
function interrupt() {
  if (HAS_TTS) speechSynthesis.cancel();
  if (recog) try { recog.abort(); } catch { }
  if (wake) wake();
}
function stopAll() { running = false; interrupt(); }
const take = () => { const p = pending; pending = null; return p; };
const busy = () => !running || pending !== null || tapped !== null;
// המתנה שנקטעת מיד בלחיצה
function pause(ms) {
  return new Promise(r => {
    if (busy()) return r();
    const t = setTimeout(() => { wake = null; r(); }, ms);
    wake = () => { clearTimeout(t); wake = null; r(); };
  });
}

// סבב חדש תמיד מחליף את הקודם: עוצרים את הקודם ומחכים שיסתיים, כדי שלא ימשיך לכתוב על המסך
let active = null, runSeq = 0;
async function start() {
  const my = ++runSeq;
  unlockSpeech('מתחילים');  // חייב לקרות מיד בלחיצה, לפני כל await
  if (active) { running = false; interrupt(); await active.catch(() => { }); }
  if (my !== runSeq) return;
  running = true; pending = null; tapped = null;
  if (navigator.wakeLock) navigator.wakeLock.request('screen').then(l => { wakeLock = l; }).catch(() => { });
  const p = settings.mode === 'questions' ? runQuestions() : runCards();
  active = p;
  const result = await p;
  if (my !== runSeq) return;  // סבב חדש כבר התחיל
  active = null; running = false;
  try { if (wakeLock) await wakeLock.release(); } catch { }
  renderEnd(result);
}

async function runQuestions() {
  const qs = pickQuestions();
  let right = 0, answered = 0;
  for (let i = 0; i < qs.length && running; i++) {
    const q = qs[i];
    const mc = q.t === 'mc';
    tapped = null; pending = null;
    screen(`שאלה ${i + 1} מתוך ${qs.length} · ${q.s}`, `<p class="vq">${esc(q.q)}</p>`, 'questions', q);
    let outcome = null;  // 'right' | 'wrong' | 'skip' | 'reveal' | 'dunno'
    let chosen = null, openDone = false, tries = 0, lastKnew = null;
    const fromTap = () => { chosen = tapped; tapped = null; return q.c.includes(chosen) ? 'right' : 'wrong'; };
    while (running && !outcome) {
      await say(`שאלה ${i + 1}. ${q.q}`);
      if (mc) for (let k = 0; k < q.o.length && !busy(); k++) await say(`${k + 1}. ${q.o[k]}`);
      if (mc && tapped !== null) { outcome = fromTap(); break; }
      let p = take();
      if (p === 'stop' || !running) break;
      if (p === 'repeat') continue;
      if (p === 'skip') { outcome = 'skip'; break; }
      if (p === 'show') { outcome = mc ? 'wrong' : 'dunno'; break; }
      if (!settings.listen) {
        // בלי מיקרופון: שאלה אמריקאית מחכה להקשה על תשובה; שאלה פתוחה – זמן לחשוב ואז התשובה
        status(mc ? '👆 הקישו על התשובה' : `⏳ ${settings.wait} שניות לחשוב…`);
        await pause(mc ? (settings.wait + 25) * 1000 : settings.wait * 1000);
        if (mc && tapped !== null) { outcome = fromTap(); break; }
        p = take();
        if (p === 'stop' || !running) break;
        if (p === 'repeat') continue;
        if (p === 'skip') { outcome = 'skip'; break; }
        outcome = p === 'show' ? (mc ? 'wrong' : 'dunno') : (mc ? 'reveal' : 'dunno');
        break;
      }
      // הקשבה לתשובה (אפשר גם להקיש), עם עוד ניסיון אחד אם לא הובנה
      while (running && !outcome) {
        const alts = await listen((settings.wait + 6) * 1000);
        if (mc && tapped !== null) { outcome = fromTap(); break; }
        p = take();
        if (p === 'stop' || !running) break;
        if (p === 'repeat') break;
        if (p === 'skip') { outcome = 'skip'; break; }
        if (p === 'show') { outcome = mc ? 'wrong' : 'dunno'; break; }
        const cmd = mc && matchOption(alts, q.o) >= 0 ? null : command(alts);
        if (cmd === 'stop') { running = false; break; }
        if (cmd === 'repeat') break;
        if (cmd === 'skip') { outcome = 'skip'; break; }
        if (cmd === 'dunno' || cmd === 'show') { outcome = mc ? 'wrong' : 'dunno'; break; }
        if (!alts) {
          if (++tries >= 2) { outcome = mc ? 'wrong' : 'dunno'; break; }
          await say('לא שמעתי. נסה שוב, או אמור לא יודע.');
          continue;
        }
        status(`שמעתי: ״${alts[0]}״`);
        if (mc) {
          const k = matchOption(alts, q.o);
          if (k < 0) {
            if (++tries >= 2) { outcome = 'wrong'; break; }
            await say('לא הבנתי. אמור את מספר התשובה.');
            continue;
          }
          chosen = k;
          outcome = q.c.includes(k) ? 'right' : 'wrong';
        } else {
          outcome = 'dunno';  // תשובה פתוחה: מקריאים את התשובה ושואלים אם ידעת
        }
      }
      if (!outcome && running) { take(); continue; }
    }
    if (!running) break;
    if (outcome === 'skip') continue;
    const correct = mc ? q.c.map(k => q.o[k]).join(' או ') : q.a;
    const box = app.querySelector('.vtext');
    if (mc) {
      markAnswers(q, chosen);
      if (outcome === 'reveal') {
        box.insertAdjacentHTML('beforeend', `<p class="vres">התשובה: ${esc(correct)}</p>`);
        await say(`התשובה: ${q.c[0] + 1}. ${correct}`);
      } else {
        answered++; if (outcome === 'right') right++;
        recordAnswer(q, outcome === 'right');
        box.insertAdjacentHTML('beforeend', `<p class="vres ${outcome}">${outcome === 'right' ? 'נכון!' : 'התשובה: ' + esc(correct)}</p>`);
        await say(outcome === 'right' ? 'נכון!' : `לא נכון. התשובה הנכונה: ${q.c[0] + 1}. ${correct}`);
      }
    } else {
      // שאלה פתוחה: התשובה, ואז "ידעת?" – בקול או בכפתורים
      box.insertAdjacentHTML('beforeend', `<p class="vres">התשובה: ${esc(correct)}</p>`);
      take(); tapped = null;
      showKnew();
      await say('התשובה: ' + correct);
      if (tapped === null && !pending && running) {
        await say('ידעת?');
        if (settings.listen) {
          const yn = await listen(7000);
          if (tapped === null && yn) tapped = /^(כן|נכון|ידעתי|בטח)/.test(norm(yn[0])) ? 1 : 0;
        } else await pause(8000);
      }
      lastKnew = tapped;
      if (tapped !== null) {
        answered++; if (tapped === 1) right++;
        recordAnswer(q, tapped === 1);
        openDone = true;
      }
      tapped = null;
    }
    const ex = q.x || (q.e && q.e[0] && q.e[0][1]);
    const wasRight = mc ? outcome === 'right' : lastKnew === 1;
    const wantEx = settings.explain === 'always' || (settings.explain === 'wrong' && !wasRight);
    if (ex && wantEx && !busy()) { box.insertAdjacentHTML('beforeend', `<p class="vex">${esc(ex)}</p>`); await say(ex); }
    if (take() === 'stop') break;
    await pause(1200);
    take(); tapped = null;
  }
  return { kind: 'questions', right, answered };
}

async function runCards() {
  const cards = shuffle(CARDS.filter(c => settings.cSubject === 'הכל' || c.s === settings.cSubject)).slice(0, settings.size || 1e9);
  let done = 0, knew = 0;
  for (let i = 0; i < cards.length && running; i++) {
    const c = cards[i];
    pending = null;
    screen(`כרטיסייה ${i + 1} מתוך ${cards.length} · ${c.s}`, `<p class="vq">${esc(c.t)}</p>`, 'cards');
    let p;
    while (running) {
      await say(c.t);
      p = take();
      if (p === 'repeat') continue;
      if (p === 'skip' || p === 'stop' || p === 'show') break;
      if (mic()) {
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
        await pause(settings.wait * 1000);
        p = take();
        if (p === 'repeat') continue;
        if (p === 'skip' || p === 'stop') break;
      }
      break;
    }
    if (!running) break;
    if (p === 'skip') continue;
    status('');
    app.querySelector('.vtext').insertAdjacentHTML('beforeend', `<p class="vex">${esc(c.d)}</p>`);
    await say(c.d);
    done++;
    if (take() === 'stop') break;
    await pause(1200);
    take();
  }
  return { kind: 'cards', done, knew };
}

function renderEnd(r) {
  if (HAS_TTS) speechSynthesis.cancel();
  document.body.classList.remove('vrunning');
  const line = r.kind === 'questions'
    ? (r.answered ? `ענית נכון על ${r.right} מתוך ${r.answered} שאלות` : 'לא נענו שאלות')
    : `עברת על ${r.done} כרטיסיות${r.knew ? ` · ${r.knew} מהן ענית נכון בקול` : ''}`;
  app.innerHTML = `
    <section class="voicebox">
      <div class="vtext"><p class="vq">סיימנו</p><p>${line}</p></div>
    </section>
    <div class="vcontrols two"><button class="primary" id="again">▶ עוד סבב</button><button id="home">חזרה לבחירה</button></div>`;
  app.querySelector('#again').onclick = start;
  app.querySelector('#home').onclick = renderHome;
  if (r.kind === 'questions' && r.answered && HAS_TTS) speechSynthesis.speak(utter(line));  // בלי לגעת ב-running, כדי שסבב חדש לא ייעצר
}

let onBack = null;
window.Voice = {
  // פותח את מסך התרגול בקול בתוך #app של הדף
  open(mode, opts = {}) {
    settings.mode = mode;
    onBack = opts.back || null;
    if (opts.subject && mode === 'questions' && Q_SUBJECTS.includes(opts.subject)) settings.qSubject = opts.subject;
    if (opts.subject && mode === 'cards' && C_SUBJECTS.includes(opts.subject)) settings.cSubject = opts.subject;
    persist();
    renderHome();
    window.scrollTo(0, 0);
  },
  stop() { stopAll(); document.body.classList.remove('vrunning'); },
};

})();
