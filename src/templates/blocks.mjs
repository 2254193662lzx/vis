/**
 * blocks.mjs —— 内容块渲染器
 *
 * 说明：
 *  1) 正文与表格保留旧站的**行内 HTML**（<strong>/<code>/<a>）—— 回退成纯文本会
 *     丢掉原站的强调与行内代码，不算「无损迁移」。因此模板层不转义正文，只转义属性。
 *  2) 代码块的着色：旧站第 1、2 章已预烘焙 <span class="cmt|str|kw|num|fn|op|star">，
 *     直接沿用；第 3~5 章无着色，用下方轻量着色器补上，并做**纯文本保真校验**
 *     —— 若着色后去标签的文本与原文不一致，则放弃着色、原样输出，绝不篡改代码。
 */

const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const unesc = (s) =>
  String(s ?? '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');

const stripTags = (s) => String(s ?? '').replace(/<[^>]*>/g, '');

const pick = (b, lang) => (lang === 'en' ? b.en : b.zh) || '';

/* -------------------------------------------------- 轻量 JS 着色器 */
const KW = new Set([
  'const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'do', 'of', 'in',
  'new', 'await', 'async', 'class', 'extends', 'import', 'export', 'from', 'try', 'catch',
  'finally', 'throw', 'typeof', 'instanceof', 'delete', 'switch', 'case', 'break', 'continue',
  'default', 'null', 'undefined', 'true', 'false', 'this', 'yield', 'static', 'get', 'set', 'void',
]);

const span = (cls, text) => `<span class="${cls}">${esc(text)}</span>`;

function highlight(code) {
  let out = '';
  let i = 0;
  const n = code.length;
  while (i < n) {
    const c = code[i];
    if (c === '/' && code[i + 1] === '/') {
      let j = code.indexOf('\n', i);
      if (j < 0) j = n;
      out += span('cmt', code.slice(i, j));
      i = j;
      continue;
    }
    if (c === '/' && code[i + 1] === '*') {
      const k = code.indexOf('*/', i + 2);
      const j = k < 0 ? n : k + 2;
      out += span('cmt', code.slice(i, j));
      i = j;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1;
      while (j < n) {
        if (code[j] === '\\') j += 2;
        else if (code[j] === c) { j++; break; }
        else j++;
      }
      out += span('str', code.slice(i, j));
      i = j;
      continue;
    }
    if (/[0-9]/.test(c) && !/[A-Za-z0-9_$.]/.test(code[i - 1] || '')) {
      let j = i;
      while (j < n && /[0-9._]/.test(code[j])) j++;
      out += span('num', code.slice(i, j));
      i = j;
      continue;
    }
    if (/[A-Za-z_$]/.test(c)) {
      let j = i;
      while (j < n && /[A-Za-z0-9_$]/.test(code[j])) j++;
      const word = code.slice(i, j);
      if (KW.has(word)) out += span('kw', word);
      else if (code[j] === '(') out += span('fn', word);
      else out += esc(word);
      i = j;
      continue;
    }
    out += esc(c);
    i++;
  }
  return out;
}

/**
 * 返回可直接插入 <code> 的 HTML。
 * 已有旧站着色标记 → 原样沿用；否则着色，并在文本层面校验保真。
 */
function codeHtml(html) {
  if (/<span\s+class="/.test(html)) return html;
  const raw = unesc(html);
  const colored = highlight(raw);
  // 保真校验：去标签后必须与原文逐字一致，否则退回纯文本
  const plain = (s) => unesc(stripTags(s)).replace(/\s+/g, ' ').trim();
  return plain(colored) === plain(raw) ? colored : html;
}

/* -------------------------------------------------- 行渲染 */
const starOf = (line) => /^\s*⭐/.test(unesc(stripTags(line)));

/**
 * 只给 ⭐ 关键行套一层 inline-block 满宽 span，其余行保持纯文本。
 * 逐行包裹会让每个代码块多出 24 字节/行，全站累计是几十 KB —— 不值得。
 * inline-block + width:100% 能让高亮铺满整行，且不会与相邻换行叠加成空行。
 */
function renderLines(html) {
  return String(html)
    .split(/\r?\n/)
    .map((line) => (starOf(line) ? `<span class="ln--star">${line}</span>` : line))
    .join('\n');
}

const COPY_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>`;

export function renderBlock(b, lang, ui, asset) {
  switch (b.type) {
    case 'h3': return `<h3>${pick(b, lang)}</h3>`;
    case 'p': return `<p>${pick(b, lang)}</p>`;
    case 'keypoint': return `<div class="block--keypoint">${pick(b, lang)}</div>`;
    case 'note': return `<div class="block--note">${pick(b, lang)}</div>`;
    case 'purpose': return `<p class="block--purpose">${pick(b, lang)}</p>`;
    case 'demohint': return `<p class="block--demohint">${pick(b, lang)}</p>`;
    case 'list': {
      const items = (lang === 'en' ? b.en : b.zh) || [];
      if (!items.length) return '';
      return `<ul>${items.map((i) => `<li>${i}</li>`).join('')}</ul>`;
    }
    case 'figure': {
      const cap = b.caption[lang] || b.caption.zh;
      const alt = b.alt[lang] || b.alt.zh;
      // 插图为构建前一次性优化好的 WebP（见 tools/optimize-images.py）
      const src = String(b.src || '').replace(/\.png$/i, '.webp');
      return `<figure class="theory-figure">
    <img src="${esc(asset ? asset(src) : src)}" alt="${esc(alt)}" loading="lazy" decoding="async">
    ${cap ? `<figcaption>${cap}</figcaption>` : ''}
  </figure>`;
    }
    case 'table': {
      const html = pick(b, lang);
      if (!html) return '';
      return `<div class="table-wrap"><table>${html}</table></div>`;
    }
    case 'code': {
      const html = codeHtml(b.html);
      const stars = String(html).split(/\r?\n/).filter(starOf).length;
      const hint = stars ? `<span class="code-block__hint">${ui.keyLine.replace('{n}', stars)}</span>` : '';
      return `<div class="code-block">
    <div class="code-block__bar">
      <span class="code-block__lang">${esc(b.lang || 'js')}</span>
      ${hint}
      <button class="code-block__copy" type="button" data-copy aria-label="${esc(ui.copy)}">${COPY_ICON}<span>${esc(ui.copy)}</span></button>
    </div>
    <pre><code>${renderLines(html)}</code></pre>
  </div>`;
    }
    case 'demo':
      return `<div class="demo-block" data-demo="${esc(b.ref)}" data-state="loading">${ui.demoLoading}</div>`;
    default:
      return '';
  }
}

export function renderBlocks(list, lang, ui, url) {
  return (list || []).map((b) => renderBlock(b, lang, ui, url)).filter(Boolean).join('\n');
}
