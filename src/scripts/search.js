/**
 * search.js —— 全站搜索（命令面板）
 *
 * 索引由构建期生成（assets/search-<locale>.json），覆盖 27 个小节的正文、
 * 关键代码与术语。无后端、无第三方库：打分用「标题命中权重高 + 正文命中」的朴素策略，
 * 对本站的规模（几百条）足够快且结果可预期。
 */

let state = null;

const norm = (s) => String(s || '').toLowerCase();

function score(item, q) {
  const title = norm(item.n);
  const text = norm(item.x);
  let s = 0;
  if (title.startsWith(q)) s += 100;
  if (title.includes(q)) s += 60;
  const ti = text.indexOf(q);
  if (ti >= 0) s += 24 - Math.min(20, ti / 40);
  if (item.k === 'code') s += 6;
  if (item.k === 'gloss') s += 4;
  return s;
}

function snippet(text, q) {
  const i = norm(text).indexOf(q);
  if (i < 0) return text.slice(0, 96);
  const from = Math.max(0, i - 34);
  const raw = text.slice(from, from + 110);
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const idx = norm(raw).indexOf(q);
  if (idx < 0) return esc(raw);
  return (
    (from > 0 ? '…' : '') +
    esc(raw.slice(0, idx)) +
    `<mark>${esc(raw.slice(idx, idx + q.length))}</mark>` +
    esc(raw.slice(idx + q.length)) +
    '…'
  );
}

function render(list, q) {
  const box = document.getElementById('palette-list');
  const count = document.querySelector('[data-palette-count]');
  if (!box) return;

  if (!q) {
    const picks = state.index.filter((i) => i.k !== 'code').slice(0, 8);
    box.innerHTML = picks
      .map(
        (it, i) => `<a class="palette__item" role="option" href="${state.base}${state.localeRoot}${it.u}" data-idx="${i}" aria-selected="${i === 0}" style="animation-delay:${i * 26}ms">
        <span class="palette__num">${it.c}</span>
        <span class="palette__text"><span class="palette__title">${it.n}</span></span></a>`
      )
      .join('');
    if (count) count.textContent = '';
    state.items = picks;
    return;
  }

  const hits = state.index
    .filter((i) => norm(`${i.n} ${i.x}`).includes(q))
    .map((i) => ({ i, s: score(i, q) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, 14)
    .map((x) => x.i);

  state.items = hits;
  if (!hits.length) {
    box.innerHTML = `<div class="palette__empty">${state.ui.noResults || '没有匹配的结果'}</div>`;
    if (count) count.textContent = '';
    return;
  }
  box.innerHTML = hits
    .map(
      (it, i) => `<a class="palette__item" role="option" href="${state.base}${state.localeRoot}${it.u}" data-idx="${i}" aria-selected="${i === 0}" style="animation-delay:${i * 26}ms">
      <span class="palette__num">${it.c}</span>
      <span class="palette__text">
        <span class="palette__title">${it.n}</span>
        <span class="palette__snippet">${snippet(it.x, q)}</span>
      </span></a>`
    )
    .join('');
  if (count) count.textContent = `${hits.length} 条`;
  state.sel = 0;
}

function move(delta) {
  if (!state.items || !state.items.length) return;
  state.sel = (state.sel + delta + state.items.length) % state.items.length;
  const nodes = [...document.querySelectorAll('.palette__item')];
  nodes.forEach((n, i) => n.setAttribute('aria-selected', String(i === state.sel)));
  nodes[state.sel]?.scrollIntoView({ block: 'nearest' });
}

function close(restoreFocus = true) {
  const p = document.getElementById('palette');
  if (!p || p.dataset.open !== '1') return;
  p.dataset.open = '0';
  document.body.style.overflow = '';
  if (restoreFocus) document.querySelector('[data-search-open]')?.focus();
}

function open() {
  const p = document.getElementById('palette');
  const input = document.getElementById('palette-input');
  if (!p) return;
  p.dataset.open = '1';
  document.body.style.overflow = 'hidden';
  render([], '');
  setTimeout(() => input && input.focus(), 30);
}

export async function initSearch({ base, locale, ui }) {
  if (state) return { open, close };
  const res = await fetch(`${base}assets/search-${locale}.json`);
  const index = await res.json();
  const localeRoot = document.documentElement.dataset.localeRoot || '';
  state = { index, base, locale, localeRoot, ui, items: [], sel: 0 };

  const p = document.getElementById('palette');
  const input = document.getElementById('palette-input');

  input?.addEventListener('input', () => render(null, input.value.trim().toLowerCase()));
  input?.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
    else if (e.key === 'Enter') {
      const item = (state.items || [])[state.sel];
      if (item) { e.preventDefault(); close(); location.href = `${base}${state.localeRoot}${item.u}`; }
    }
  });
  p?.addEventListener('click', (e) => { if (e.target === p) close(); });

  return { open, close };
}

export { open, close };
