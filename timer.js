// שעון סבב משותף לכל מצבי התרגול: startTimer() בתחילת סבב, stopTimer() בסופו (מחזיר מילישניות).
// כל אלמנט .timer בעמוד מתעדכן כל שנייה בזמן שהסבב רץ.
let roundT0 = null, lastDur = 0;
function startTimer() { roundT0 = Date.now(); }
function stopTimer() { lastDur = roundT0 ? Date.now() - roundT0 : 0; roundT0 = null; return lastDur; }
function fmtDur(ms) {
  const s = Math.round(ms / 1000), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}
const timerHtml = () => roundT0 ? `<span class="timer" title="זמן הסבב">⏱ ${fmtDur(Date.now() - roundT0)}</span>` : '';
// זמן בשורת היסטוריה (לסבבים ישנים אין זמן)
const durText = x => x.dur ? ` · ⏱ ${fmtDur(x.dur)}` : '';
setInterval(() => {
  if (!roundT0) return;
  const t = '⏱ ' + fmtDur(Date.now() - roundT0);
  document.querySelectorAll('.timer').forEach(el => el.textContent = t);
}, 1000);
