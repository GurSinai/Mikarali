'use strict';

const PEOPLE = window.PEOPLE, FAMILIES = window.FAMILIES;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// קשרים משפחתיים מתוך העצים: הורים, ילדים, בני זוג, אחים
const rel = {};
const R = id => rel[id] || (rel[id] = { parents: [], children: [], spouses: [], siblings: [], family: 0 });
function walk(node, parents, fam) {
  const kids = (node.children || []).flatMap(c => c.group ? c.children : [c]);
  if (node.id) {
    R(node.id).family = fam;
    R(node.id).parents.push(...parents);
    (node.spouses || []).forEach(s => { R(node.id).spouses.push(s); R(s).spouses.push(node.id); R(s).family = fam; });
    kids.forEach(k => R(node.id).children.push(k.id));
    kids.forEach(k => R(k.id).siblings.push(...kids.filter(o => o !== k).map(o => o.id)));
  } else {
    // צומת קיבוץ (״בני לאה״) – הילדים שייכים להורה של הצומת
    kids.forEach(k => R(k.id).siblings.push(...kids.filter(o => o !== k).map(o => o.id)));
  }
  (node.children || []).forEach(c => c.group
    ? c.children.forEach(k => walk(k, node.id ? [node.id] : parents, fam))
    : walk(c, node.id ? [node.id] : parents, fam));
}
FAMILIES.forEach((f, i) => f.trees.forEach(t => walk(t, [], i)));

let current = 0;
const tabs = document.getElementById('tabs'), tree = document.getElementById('tree'), detail = document.getElementById('detail');

function personBtn(id, extra = '') {
  const p = PEOPLE[id];
  return `<button class="person ${extra}" data-id="${id}"><b>${esc(p.name)}</b>${p.years ? `<small>${esc(p.years.replace(/ \(הערכה.*\)$/, ''))}</small>` : ''}</button>`;
}
const isLeaf = c => c.id && !c.children && !c.spouses;
function nodeHtml(n) {
  let label;
  if (n.group) label = `<div class="nodelabel"><span class="groupnode">${esc(n.group)}</span></div>`;
  else label = `<div class="nodelabel">${personBtn(n.id)}${n.note ? `<span class="relnote">${esc(n.note)}</span>` : ''}${(n.spouses || []).length
    ? `<span class="spouses">בני זוג: ${(n.spouses).map(s => `<a href="#" data-id="${s}">${esc(PEOPLE[s].name)}</a>`).join(', ')}</span>` : ''}</div>`;
  const kids = n.children || [];
  // כמה ילדים בלי צאצאים – בשורה אחת, כדי שהעץ לא יתארך
  if (kids.length > 2 && kids.every(isLeaf)) {
    return label + `<ul><li><div class="leafrow">${kids.map(c => personBtn(c.id) + (c.note ? `<span class="relnote">${esc(c.note)}</span>` : '')).join('')}</div></li></ul>`;
  }
  return label + (kids.length ? `<ul>${kids.map(c => `<li>${nodeHtml(c)}</li>`).join('')}</ul>` : '');
}

function render() {
  tabs.innerHTML = FAMILIES.map((f, i) => `<button class="pill ${i === current ? 'on' : ''}" data-i="${i}">${esc(f.title)}</button>`).join('');
  tree.innerHTML = FAMILIES[current].trees.map(t => `<ul class="tree"><li>${nodeHtml(t)}</li></ul>`).join('');
}

function names(ids) { return ids.map(id => `<a href="#" data-id="${id}">${esc(PEOPLE[id].name)}</a>`).join(', '); }
function relatedQuestions(p) {
  if (!p.terms.length || !window.QUESTIONS) return [];
  // מילה שלמה בלבד (אפשר עם אות שימוש לפניה), כדי ש״שרה״ לא יתפוס את ״עשרה״
  const res = p.terms.map(t => new RegExp(`(^|[^א-ת])[ובלהמש]?${t}($|[^א-ת])`));
  const hit = s => res.some(r => r.test(s));
  return window.QUESTIONS.filter(q => (hit(q.q) || hit(q.a)) && !(p.not || []).some(n => q.q.includes(n) || q.a.includes(n))).slice(0, 6);
}
function showPerson(id) {
  const p = PEOPLE[id], r = R(id);
  if (r.family !== current) { current = r.family; render(); }
  tree.querySelectorAll('.person').forEach(b => b.classList.toggle('on', b.dataset.id === id));
  const rows = [
    ['הורים', r.parents], ['בני זוג', r.spouses], ['ילדים', r.children], ['אחים', [...new Set(r.siblings)]],
  ].filter(([, ids]) => ids.length);
  const qs = relatedQuestions(p);
  detail.innerHTML = `
    <h3>${esc(p.name)}</h3>
    <p class="role">${esc(p.role)}${p.years ? ` · ${esc(p.years)}` : ''}</p>
    <p>${esc(p.info)}</p>
    ${rows.length ? `<dl class="rels">${rows.map(([k, ids]) => `<dt>${k}</dt><dd>${names(ids)}</dd>`).join('')}</dl>` : ''}
    ${qs.length ? `<h4>שאלות מהמאגר</h4><ul class="relq">${qs.map(q => `<li><span>${esc(q.q)}</span><b>${esc(q.t === 'mc' ? q.c.map(k => q.o[k]).join(' / ') : q.a)}</b></li>`).join('')}</ul>` : ''}`;
  if (matchMedia('(max-width: 720px)').matches) detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

tabs.addEventListener('click', e => { const b = e.target.closest('[data-i]'); if (b) { current = +b.dataset.i; render(); detail.innerHTML = '<p class="hint">בחר אדם בעץ.</p>'; } });
document.addEventListener('click', e => {
  const t = e.target.closest('[data-id]');
  if (t && PEOPLE[t.dataset.id]) { e.preventDefault(); showPerson(t.dataset.id); }
});
render();
