/**
 * shell.mjs —— 页面外壳（顶栏 / 侧栏 / 正文 / 右侧目录 / 页脚 / 搜索面板）
 *
 * 全站唯一的页面骨架。所有资源路径经 base 解析，因此站点既能部署在
 * GitHub Pages 的子路径（/vis/），也能直接在本地 file:// 打开。
 */

const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const ICON = {
  menu: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>`,
  search: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.2-3.2"/></svg>`,
  sun: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="4.2"/><path d="M12 2v2.5M12 19.5V22M4.2 4.2l1.8 1.8M18 18l1.8 1.8M2 12h2.5M19.5 12H22M4.2 19.8 6 18M18 6l1.8-1.8"/></svg>`,
  moon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z"/></svg>`,
  back: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>`,
  spark: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M12 3.5l1.9 5.1 5.1 1.9-5.1 1.9L12 17.5l-1.9-5.1L5 10.5l5.1-1.9z"/><path d="M18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z"/></svg>`,
};

/** 防闪烁：在样式生效前同步写入主题与动效状态（必须内联、同步执行） */
const BOOT = `(function(){var d=document.documentElement;d.setAttribute('data-js','1');
try{var t=localStorage.getItem('vis.theme');
if(!t){t=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}
d.setAttribute('data-theme',t);
/* 动效默认开启；只有用户在顶栏显式关闭过（存了 '0'）才关闭 */
var mm=localStorage.getItem('vis.motion');
d.setAttribute('data-motion', mm==='0'?'off':'on');
}
catch(e){d.setAttribute('data-theme','light');d.setAttribute('data-motion','on');}})();`;

function topbar({ base, ui, locale, altHref, nav = [], back = null }) {
  return `<header class="topbar">
  ${back ? `<a class="back" href="${esc(back.href)}" title="${esc(back.label)}" aria-label="${esc(back.label)}">${ICON.back}<span class="back__text">${esc(back.label)}</span></a>` : ''}
  <button class="icon-btn topbar__nav-toggle" type="button" data-nav-toggle aria-label="${esc(ui.toggleNav)}" aria-expanded="false">${ICON.menu}</button>
  <a class="brand" href="${base || './'}">
    <span class="brand__mark" aria-hidden="true">可</span>
    <span>
      <span class="brand__text">${esc(ui.brand)}</span>
      <span class="brand__sub">${esc(ui.brandSub)}</span>
    </span>
  </a>
  ${nav.length ? `<nav class="topnav" aria-label="${esc(ui.navOverview)}">${nav
    .map((n) => `<a href="${esc(n.href)}"${n.current ? ' aria-current="page"' : ''}>${esc(n.label)}</a>`)
    .join('')}</nav>` : ''}
  <span class="topbar__spacer"></span>
  <button class="search-trigger" type="button" data-search-open>
    ${ICON.search}
    <span class="search-trigger__label">${esc(ui.search)}</span>
    <kbd>Ctrl K</kbd>
  </button>
  <div class="topbar__group">
    <button class="icon-btn" type="button" data-motion-toggle aria-label="${esc(ui.motion)}" title="${esc(ui.motion)}" aria-pressed="true">${ICON.spark}</button>
    <button class="icon-btn" type="button" data-theme-toggle aria-label="${esc(ui.theme)}" title="${esc(ui.theme)}">
      <span data-theme-icon-dark hidden>${ICON.sun}</span><span data-theme-icon-light>${ICON.moon}</span>
    </button>
    <div class="fs-ctl" role="group" aria-label="${esc(ui.fontSize)}">
      <button type="button" data-fs-step="down" aria-label="${esc(ui.fontSmaller)}" title="${esc(ui.fontSmaller)}">A<span aria-hidden="true">−</span></button>
      <span data-fs-label aria-live="polite">100%</span>
      <button type="button" data-fs-step="up" aria-label="${esc(ui.fontLarger)}" title="${esc(ui.fontLarger)}">A<span aria-hidden="true">+</span></button>
    </div>
    <div class="lang-switch" role="group" aria-label="${esc(ui.lang)}">
      ${locale === 'zh'
        ? `<span aria-current="true">中</span><a href="${esc(altHref)}" hreflang="en">EN</a>`
        : `<a href="${esc(altHref)}" hreflang="zh-CN">中</a><span aria-current="true">EN</span>`}
    </div>
  </div>
</header>`;
}

export function renderShell({ lang, locale, localeRoot = '', base, title, description, altHref, body, sidebar = '', rail = '', lesson = '', ui, variant = 'doc', runtime = {}, nav = [], back = null, snap = false, deck = false }) {
  return `<!doctype html>
<html lang="${lang}" data-theme="light" data-base="${esc(base)}" data-locale="${locale}" data-locale-root="${esc(localeRoot)}"${lesson ? ` data-lesson="${esc(lesson)}"` : ''}${snap ? ' data-snap="1"' : ''}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta name="color-scheme" content="light dark">
<link rel="stylesheet" href="${base}assets/site.css">
<link rel="alternate" hreflang="${locale === 'zh' ? 'en' : 'zh-CN'}" href="${esc(altHref)}">
<script>${BOOT}</script>
</head>
<body>
<a class="skip-link" href="#content">${esc(ui.skip)}</a>
${topbar({ base, ui, locale, altHref, nav, back })}
<div class="scrim" data-scrim hidden></div>
<div class="scroll-progress" data-scroll-progress aria-hidden="true"></div>
<div class="shell ${variant === 'portal' ? 'shell--portal' : 'shell--doc'}">
${sidebar}
<main class="main ${variant === 'portal' ? 'main--portal' : ''}${deck ? ' main--deck' : ''}" id="content">
${body}
</main>
${rail}
</div>
<footer class="site-footer">
  <div class="site-footer__inner">
    <span>${ui.footer}</span>
    <span><a href="https://github.com/cinger007/vis" target="_blank" rel="noopener">${esc(ui.footerSource)}</a></span>
  </div>
</footer>
<div class="palette" id="palette" role="dialog" aria-modal="true" aria-label="${esc(ui.search)}" data-open="0">
  <div class="palette__box">
    <div class="palette__field">
      ${ICON.search}
      <input class="palette__input" type="search" id="palette-input" placeholder="${esc(ui.searchPlaceholder)}" aria-label="${esc(ui.searchPlaceholder)}" autocomplete="off" spellcheck="false">
      <kbd>Esc</kbd>
    </div>
    <div class="palette__list" id="palette-list" role="listbox" aria-label="${esc(ui.searchResults)}"></div>
    <div class="palette__foot">
      <span><kbd>↑</kbd><kbd>↓</kbd> ${esc(ui.paletteMove)}</span>
      <span><kbd>Enter</kbd> ${esc(ui.paletteOpen)}</span>
      <span data-palette-count></span>
    </div>
  </div>
</div>
<div class="gloss-card" id="gloss-card" data-open="0" role="tooltip"></div>
<button class="to-top" type="button" data-to-top data-show="0" aria-label="${esc(ui.toTop)}" title="${esc(ui.toTop)}">
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7"/></svg>
</button>
<script type="application/json" id="site-ui">${JSON.stringify({ ...ui, ...runtime }).replace(/</g, '\\u003c')}</script>
<script src="${base}assets/vendor/d3.min.js"></script>
<script type="module" src="${base}assets/shell.js"></script>
</body>
</html>
`;
}
