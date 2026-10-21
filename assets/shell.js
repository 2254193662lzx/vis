/**
 * shell.js —— 站点运行时（外壳交互）
 *
 * 职责：主题 / 移动端抽屉 / Tab / 滚动定位 / 学习进度 /
 *       代码复制 / 入场揭示 / 卡片光晕 / 演示懒加载 / 术语提示 / 快捷键。
 *
 * 设计约束（对应「华丽属于外壳、克制属于阅读面」）：
 *  - 不劫持滚动，不改变正文的任何布局；
 *  - 动效一律由 CSS 变量驱动，prefers-reduced-motion 下自动归零；
 *  - 无 JS 时页面内容完整可读，本文件只做增强。
 */

const html = document.documentElement;
const BASE = html.dataset.base || '';
const LOCALE = html.dataset.locale || 'zh';
const LESSON = html.dataset.lesson || '';
const LOCALE_ROOT = html.dataset.localeRoot || '';
const UI = JSON.parse(document.getElementById('site-ui')?.textContent || '{}');
const RM = window.matchMedia('(prefers-reduced-motion: reduce)');
/** 动效是否开启：由顶栏开关控制，默认开启 */
const MOTION_ON = () => html.getAttribute('data-motion') !== 'off';

globalThis.__SITE__ = { base: BASE, localeRoot: LOCALE_ROOT, data: `${BASE}data/`, images: `${BASE}img/`, locale: LOCALE, lesson: LESSON };

/**
 * 解析为绝对 URL 再交给 import()。
 * 门户页的 BASE 是空串，`import('assets/x.js')` 会被当成裸模块说明符而直接抛
 * 「Failed to resolve module specifier」——必须转成绝对地址。
 */
const assetUrl = (p) => new URL(BASE + p, document.baseURI).href;

/* ============================================================ 主题 / 专注 */
function setTheme(t) {
  html.setAttribute('data-theme', t);
  try { localStorage.setItem('vis.theme', t); } catch (e) { /* 隐私模式忽略 */ }
  const dark = t === 'dark';
  document.querySelectorAll('[data-theme-icon-dark]').forEach((el) => { el.hidden = !dark; });
  document.querySelectorAll('[data-theme-icon-light]').forEach((el) => { el.hidden = dark; });
}


/* ============================================================ 移动端抽屉 */
function setNav(open) {
  html.setAttribute('data-nav', open ? 'open' : 'closed');
  const scrim = document.querySelector('[data-scrim]');
  if (scrim) scrim.hidden = !open;
  document.querySelectorAll('[data-nav-toggle]').forEach((b) => b.setAttribute('aria-expanded', String(open)));
}

/* ============================================================ 学习进度 */
const ringGrown = new WeakSet();
const DONE_KEY = 'vis.done';
let done = new Set();
try { done = new Set(JSON.parse(localStorage.getItem(DONE_KEY) || '[]')); } catch (e) { done = new Set(); }

const key = (slug) => (slug.includes('/') ? slug : `${LESSON}/${slug}`);

function saveDone() {
  try { localStorage.setItem(DONE_KEY, JSON.stringify([...done])); } catch (e) { /* 忽略 */ }
  syncProgress();
}

function syncProgress() {
  const total = UI.totalSections || 0;

  document.querySelectorAll('[data-section-link]').forEach((a) => {
    const on = done.has(key(a.dataset.sectionLink));
    a.dataset.done = on ? '1' : '0';
    const dot = a.querySelector('[data-done]');
    if (dot) dot.setAttribute('data-done', on ? '1' : '0');
  });

  document.querySelectorAll('[data-mark]').forEach((b) => {
    const on = done.has(key(b.dataset.mark));
    b.setAttribute('aria-pressed', String(on));
    b.textContent = on ? (UI.markedDone || '已学') : (UI.markDone || '标记已学');
  });

  const local = [...document.querySelectorAll('[data-section]')];
  if (local.length) {
    const n = local.filter((s) => done.has(key(s.dataset.section))).length;
    const el = document.querySelector('[data-chapter-progress]');
    if (el) el.textContent = `${n}/${local.length}`;
    // 右栏的「本章进度」卡片用的是另一个元素，之前只更新了页头那个
    const railEl = document.querySelector('[data-rail-done]');
    if (railEl) railEl.textContent = String(n);
  }

  const gp = document.querySelector('[data-global-progress]');
  if (gp && total) gp.textContent = `${[...done].length}/${total}`;

  const C = 113.1;
  document.querySelectorAll('[data-ring]').forEach((svg) => {
    const slug = svg.dataset.ring;
    const per = (UI.perLesson && UI.perLesson[slug]) || 0;
    const n = [...done].filter((k) => k.startsWith(`${slug}/`)).length;
    const ratio = per ? n / per : 0;
    const fg = svg.querySelector('.ring__fg');
    const label = svg.querySelector('[data-ring-label]');
    if (fg) {
      const target = String(C * (1 - ratio));
      // 首次绘制从「空环」开始，让描边有一次生长；之后是普通更新
      if (!ringGrown.has(svg)) {
        ringGrown.add(svg);
        fg.setAttribute('stroke-dashoffset', String(C));
        requestAnimationFrame(() => fg.setAttribute('stroke-dashoffset', target));
      } else {
        fg.setAttribute('stroke-dashoffset', target);
      }
    }
    if (label) label.textContent = `${Math.round(ratio * 100)}%`;
    svg.setAttribute('aria-label', `${n}/${per}`);
  });
}

/* ============================================================ Tab */
const demoModules = new Map();

async function loadDemos() {
  if (!LESSON) return null;
  if (!demoModules.has(LESSON)) {
    demoModules.set(
      LESSON,
      import(assetUrl(`assets/demos/${LESSON}.js`)).catch((err) => {
        console.error('[demos] 模块加载失败', err);
        return null;
      })
    );
  }
  return demoModules.get(LESSON);
}

/** 挂载指定范围内、且处于可见 Tab 面板中的演示 */
async function mountDemos(scope = document) {
  const blocks = [...scope.querySelectorAll('.demo-block')].filter((el) => {
    if (el.dataset.rendered) return false;
    const panel = el.closest('.tab-panel');
    return !panel || panel.classList.contains('is-active');
  });
  if (!blocks.length) return;

  const mod = await loadDemos();
  const demos = (mod && mod.default) || null;

  blocks.forEach(async (el) => {
    el.dataset.rendered = '1';
    const ref = el.dataset.demo;
    const fn = demos && demos[ref];
    if (typeof fn !== 'function') {
      el.dataset.state = 'error';
      el.textContent = `${UI.demoError || 'Demo error'} (${ref})`;
      return;
    }
    try {
      el.dataset.state = '';
      el.innerHTML = '';
      await fn(el, { d3: globalThis.d3, locale: LOCALE, base: BASE, data: (n) => `${BASE}data/${n}` });
      if (!el.dataset.state) el.dataset.state = 'ready';
    } catch (err) {
      // 把错误挂在 DOM 上：演示失败时页面仍要可用，同时便于排查
      console.error('[demo]', ref, err);
      el.dataset.state = 'error';
      el.dataset.error = String((err && err.message) || err);
      el.textContent = UI.demoError || 'Demo failed to load';
    }
  });
}

function initTabs() {
  document.querySelectorAll('.tabs').forEach((tabs) => {
    const wrap = tabs.nextElementSibling;
    if (!wrap) return;
    let btns = [...tabs.querySelectorAll('.tab-btn')];
    const ink = tabs.querySelector('.tabs__ink');

    // 空 Tab（例如某小节没有演示）直接隐藏，避免点了没内容
    btns.forEach((b) => {
      const count = b.querySelector('.tab-btn__count');
      const empty = count && count.textContent.trim() === '0';
      b.hidden = !!empty;
    });
    btns = btns.filter((b) => !b.hidden);
    if (!btns.length) return;

    const active = () => btns.find((b) => b.getAttribute('aria-selected') === 'true') || btns[0];

    const moveInk = (btn) => {
      if (!ink || !btn) return;
      ink.style.width = `${btn.offsetWidth}px`;
      ink.style.transform = `translateX(${btn.offsetLeft}px)`;
      ink.style.opacity = '1';
    };

    const select = (name, focus = false) => {
      btns.forEach((b) => {
        const on = b.dataset.tab === name;
        b.setAttribute('aria-selected', String(on));
        b.tabIndex = on ? 0 : -1;
        if (on && focus) b.focus();
      });
      [...wrap.children].forEach((p) => p.classList.toggle('is-active', p.dataset.panel === name));
      moveInk(btns.find((b) => b.dataset.tab === name));
      if (name === 'demo') mountDemos(wrap);
    };

    // 默认 Tab 若为空，落到第一个非空 Tab
    if (active().hidden) select(btns[0].dataset.tab);
    else select(active().dataset.tab);

    btns.forEach((b) => {
      b.addEventListener('click', () => select(b.dataset.tab));
      b.addEventListener('keydown', (e) => {
        const i = btns.indexOf(b);
        const go = (j) => { e.preventDefault(); select(btns[(j + btns.length) % btns.length].dataset.tab, true); };
        if (e.key === 'ArrowRight') go(i + 1);
        else if (e.key === 'ArrowLeft') go(i - 1);
        else if (e.key === 'Home') go(0);
        else if (e.key === 'End') go(btns.length - 1);
      });
    });

    requestAnimationFrame(() => moveInk(active()));
    window.addEventListener('resize', () => moveInk(active()), { passive: true });
  });
}

/* ============================================================ 滚动定位 */
/*
 * 这里曾经用一个 Set 记录「已标记过的小节」，本意是减少 DOM 写入，
 * 实际后果是每个小节只标记一次，之后无论如何滚动或点击都不再更新 ——
 * 高亮框会永久卡在最后一个小节上。改为只记录「上一次标记的值」，每次都允许更新。
 */
function initScrollSpy() {
  const sections = [...document.querySelectorAll('[data-section]')];
  const sideLinks = [...document.querySelectorAll('[data-section-link]')];
  const outLinks = [...document.querySelectorAll('[data-outline-link]')];

  // 侧栏的滑动指示条：让高亮「跟着走」而不是硬切
  let marker = null;
  const sideList = document.querySelector('.sections');
  if (sideList && sideLinks.length) {
    marker = document.createElement('span');
    marker.className = 'sections__marker';
    marker.setAttribute('aria-hidden', 'true');
    sideList.appendChild(marker);
  }

  let current = null;
  function mark(slug, animate = true) {
    if (!slug || slug === current) return;
    current = slug;
    sideLinks.forEach((a) => a.setAttribute('aria-current', String(a.dataset.sectionLink === slug)));
    outLinks.forEach((a) => a.setAttribute('aria-current', String(a.dataset.outlineLink === slug)));

    if (marker) {
      const active = sideLinks.find((a) => a.dataset.sectionLink === slug);
      if (active) {
        if (!animate) marker.style.transition = 'none';
        marker.style.transform = `translateY(${active.offsetTop}px)`;
        marker.style.height = `${active.offsetHeight}px`;
        marker.style.opacity = '1';
        if (!animate) requestAnimationFrame(() => { marker.style.transition = ''; });
      }
    }
  }

  if (sections.length && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length) mark(visible[0].target.dataset.section);
      },
      { rootMargin: '-18% 0px -68% 0px', threshold: [0, 0.2, 1] }
    );
    sections.forEach((s) => io.observe(s));
  }

  // 点击侧栏 / 目录时立即跟随，不等滚动结束（这正是之前「跟进不过去」的直观原因）
  [...sideLinks, ...outLinks].forEach((a) => {
    a.addEventListener('click', () => {
      const slug = a.dataset.sectionLink || a.dataset.outlineLink;
      mark(slug);
      const target = document.getElementById(slug);
      if (target && history.replaceState) history.replaceState(null, '', `#${slug}`);
    });
  });

  if (sections.length) {
    const first = sections[0].dataset.section;
    requestAnimationFrame(() => mark(location.hash.slice(1) || first, false));
  }
}

/* ============================================================ 字号调节 */
const FS_KEY = 'vis.fs';
const FS_STEPS = [0.9, 1, 1.12, 1.25];

function applyFontScale(v, persist = true) {
  html.style.setProperty('--fs-scale', String(v));
  if (persist) { try { localStorage.setItem(FS_KEY, String(v)); } catch (e) { /* 忽略 */ } }
  document.querySelectorAll('[data-fs-label]').forEach((el) => { el.textContent = `${Math.round(v * 100)}%`; });
  document.querySelectorAll('[data-fs-step]').forEach((b) => {
    const i = FS_STEPS.indexOf(Number(html.style.getPropertyValue('--fs-scale')) || 1);
    b.disabled = (b.dataset.fsStep === 'down' && i <= 0) || (b.dataset.fsStep === 'up' && i >= FS_STEPS.length - 1);
  });
}

function initFontScale() {
  let v = 1;
  try { v = Number(localStorage.getItem(FS_KEY)) || 1; } catch (e) { v = 1; }
  if (!FS_STEPS.includes(v)) v = 1;
  applyFontScale(v, false);

  document.querySelectorAll('[data-fs-step]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const cur = Number(html.style.getPropertyValue('--fs-scale')) || 1;
      let i = FS_STEPS.indexOf(cur);
      if (i < 0) i = FS_STEPS.indexOf(1);
      i = btn.dataset.fsStep === 'up' ? Math.min(FS_STEPS.length - 1, i + 1) : Math.max(0, i - 1);
      applyFontScale(FS_STEPS[i]);
    });
  });
}

/* ============================================================ 返回顶部 */
function initBackToTop() {
  const btn = document.querySelector('[data-to-top]');
  if (!btn) return;
  let raf = 0;
  const update = () => {
    raf = 0;
    btn.dataset.show = window.scrollY > 700 ? '1' : '0';
  };
  window.addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(update); }, { passive: true });
  btn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: MOTION_ON() ? 'smooth' : 'auto' }));
  update();
}

/* ============================================================ 页面切换过渡 */
/** 跨文档 View Transitions：浏览器支持时，站内跳转会有一次淡入淡出 */
function initViewTransitions() {
  if (!document.startViewTransition || !MOTION_ON()) return;
  document.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('a[href]');
    if (!a) return;
    const href = a.getAttribute('href');
    if (!href || href.startsWith('#') || a.target === '_blank' || href.startsWith('http') || e.metaKey || e.ctrlKey || e.shiftKey) return;
    if (a.hasAttribute('download')) return;
    e.preventDefault();
    document.startViewTransition(() => { location.href = href; });
  });
}

/* ============================================================ 入场揭示 */
function initReveal() {
  const items = [...document.querySelectorAll('.reveal')];
  if (!items.length) return;
  if (!MOTION_ON() || !('IntersectionObserver' in window)) {
    items.forEach((el) => el.classList.add('is-in'));
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        e.target.classList.add('is-in');
        io.unobserve(e.target);
      });
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.08 }
  );
  items.forEach((el) => io.observe(el));
}

/* ============================================================ 代码复制 */
function initCopy() {
  document.querySelectorAll('.code-block').forEach((block) => {
    const btn = block.querySelector('[data-copy]');
    const pre = block.querySelector('pre');
    if (!btn || !pre) return;
    btn.addEventListener('click', async () => {
      const label = btn.querySelector('span');
      const text = pre.textContent.replace(/\u200b/g, '');
      try {
        await navigator.clipboard.writeText(text);
      } catch (e) {
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); } catch (e2) { /* 忽略 */ }
        ta.remove();
      }
      btn.dataset.copied = '1';
      if (label) label.textContent = UI.copied || '已复制';
      setTimeout(() => {
        btn.dataset.copied = '0';
        if (label) label.textContent = UI.copy || '复制';
      }, 1600);
    });
  });
}

/* ============================================================ 卡片光晕 */
function initCardGlow() {
  document.querySelectorAll('.card').forEach((card) => {
    card.addEventListener('pointermove', (e) => {
      if (!MOTION_ON() || (e.pointerType && e.pointerType !== 'mouse')) return;
      const r = card.getBoundingClientRect();
      card.style.setProperty('--mx', `${e.clientX - r.left}px`);
      card.style.setProperty('--my', `${e.clientY - r.top}px`);
    });
  });
}

/* ============================================================ 术语提示 */
async function initGlossary() {
  const card = document.getElementById('gloss-card');
  if (!card) return;

  // 术语释义按需拉取，避免每个页面都内联十几 KB
  let terms = UI.terms;
  if (!terms) {
    try {
      terms = await (await fetch(`${BASE}assets/glossary-${LOCALE}.json`)).json();
    } catch (err) {
      return;   // 术语提示是增强功能，取不到就静默跳过
    }
  }
  if (!terms || !terms.length) return;

  // 在正文（排除代码/链接/已有标记）内标注每个术语的首次出现
  const scopes = [...document.querySelectorAll('.tab-panel.is-active, .section-block .prose')];
  terms.forEach((t) => {
    const word = t.term[LOCALE] || t.term.zh;
    if (!word) return;
    let placed = false;
    for (const scope of scopes) {
      if (placed) break;
      const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
          const p = node.parentElement;
          if (!p || p.closest('pre, code, a, button, .gloss, .section__title, .tabs')) return NodeFilter.FILTER_REJECT;
          return node.nodeValue.includes(word) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
        },
      });
      const node = walker.nextNode();
      if (!node) continue;
      const idx = node.nodeValue.indexOf(word);
      const before = node.nodeValue.slice(0, idx);
      const after = node.nodeValue.slice(idx + word.length);
      const mark = document.createElement('span');
      mark.className = 'gloss';
      mark.dataset.gloss = t.id;
      mark.textContent = word;
      const frag = document.createDocumentFragment();
      if (before) frag.appendChild(document.createTextNode(before));
      frag.appendChild(mark);
      if (after) frag.appendChild(document.createTextNode(after));
      node.parentNode.replaceChild(frag, node);
      placed = true;
    }
  });

  const byId = Object.fromEntries(terms.map((t) => [t.id, t]));
  const show = (el) => {
    const t = byId[el.dataset.gloss];
    if (!t) return;
    card.innerHTML = `<span class="gloss-card__term">${t.term[LOCALE] || t.term.zh}</span>${t.def[LOCALE] || t.def.zh}`;
    card.dataset.open = '1';
    const r = el.getBoundingClientRect();
    const w = Math.min(320, window.innerWidth - 32);
    card.style.width = `${w}px`;
    const left = Math.min(Math.max(12, r.left), window.innerWidth - w - 12);
    const below = r.bottom + 10 + card.offsetHeight < window.innerHeight;
    card.style.left = `${left}px`;
    card.style.top = `${below ? r.bottom + 10 : Math.max(12, r.top - card.offsetHeight - 10)}px`;
  };
  const hide = () => { card.dataset.open = '0'; };

  document.addEventListener('pointerover', (e) => {
    const el = e.target.closest && e.target.closest('.gloss');
    if (el) show(el);
  });
  document.addEventListener('pointerout', (e) => {
    if (e.target.closest && e.target.closest('.gloss')) hide();
  });
  document.addEventListener('focusin', (e) => {
    const el = e.target.closest && e.target.closest('.gloss');
    if (el) show(el);
  });
  document.addEventListener('focusout', hide);
  document.addEventListener('click', (e) => {
    if (!e.target.closest || !e.target.closest('.gloss')) hide();
  });
}

/* ============================================================ 快捷键 */
function initKeys() {
  document.addEventListener('keydown', (e) => {
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      globalThis.__openSearch?.();
    }
    if (e.key === 'Escape') {
      globalThis.__closeSearch?.();
      setNav(false);
    }
  });
}

/* ============================================================ 总览页分区导航 */
/** 左栏固定导航：跟随滚动高亮当前分区；点击平滑滚到该段 */
function initDeck() {
  const nav = document.querySelector('[data-decknav]');
  if (!nav) return;
  const links = [...nav.querySelectorAll('[data-deck]')];
  const targets = links.map((a) => document.getElementById(a.dataset.deck)).filter(Boolean);
  if (!targets.length) return;

  const setCurrent = (id) => links.forEach((a) => a.setAttribute('aria-current', String(a.dataset.deck === id)));

  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(
      (entries) => {
        const best = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (best) setCurrent(best.target.id);
      },
      { threshold: [0.2, 0.5, 0.8], rootMargin: '-15% 0px -35% 0px' }
    );
    targets.forEach((t) => io.observe(t));
  }

  links.forEach((a) => {
    a.addEventListener('click', (e) => {
      const el = document.getElementById(a.dataset.deck);
      if (!el) return;
      e.preventDefault();
      if (globalThis.__pagerTo && MOTION_ON()) globalThis.__pagerTo(el);
      else el.scrollIntoView({ behavior: MOTION_ON() ? 'smooth' : 'auto', block: 'start' });
      setCurrent(a.dataset.deck);
    });
  });
}

/* ============================================================ 总览页：一次滚轮翻一页 */
/**
 * 为什么不用 CSS scroll-snap：
 *   `scroll-snap-type: mandatory` + `scroll-snap-stop: always` 会把滚动交给浏览器，
 *   而首页那些毛玻璃面板在滚动时要逐帧重算背景模糊，于是「吸附动画」本身掉帧；
 *   同时不同设备的滚轮/触控板惯性差异很大，容易卡在两段之间。
 * 改为自己接管 wheel：一次手势 → 滚到下一段（带缓动的 rAF 补间，约 520ms），
 * 手势期间加锁，所以不会连跳，也不会停在中间。
 */
function initPager() {
  if (!html.hasAttribute('data-snap')) return;
  const secs = [...document.querySelectorAll('.section-block, .closing')];
  if (!secs.length) return;

  const topbarH = parseInt(getComputedStyle(html).getPropertyValue('--topbar-h'), 10) || 62;
  let lock = false;

  const targetY = (el) => window.scrollY + el.getBoundingClientRect().top - topbarH;

  const indexOf = () => {
    const y = window.scrollY + topbarH + 8;
    let best = 0;
    secs.forEach((s, i) => { if (targetY(s) <= y) best = i; });
    return best;
  };

  /** 事件目标若位于还能继续滚动的子元素里，就交还给原生滚动 */
  const insideScrollable = (el, dir) => {
    for (let n = el; n && n !== document.body; n = n.parentElement) {
      const st = getComputedStyle(n);
      if (/(auto|scroll)/.test(st.overflowY) && n.scrollHeight > n.clientHeight + 2) {
        const atTop = n.scrollTop <= 1;
        const atEnd = n.scrollTop + n.clientHeight >= n.scrollHeight - 1;
        if ((dir > 0 && !atEnd) || (dir < 0 && !atTop)) return true;
      }
    }
    return false;
  };

  let raf = 0;
  const tween = (to) => {
    const from = window.scrollY;
    const dist = to - from;
    if (Math.abs(dist) < 2) return;
    const dur = Math.min(620, 300 + Math.abs(dist) * 0.18);
    const t0 = performance.now();
    const prevBehavior = html.style.scrollBehavior;
    html.style.scrollBehavior = 'auto';       // 避免与 html 的 smooth 打架
    cancelAnimationFrame(raf);
    const step = (now) => {
      const p = Math.min(1, (now - t0) / dur);
      const e = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
      window.scrollTo(0, from + dist * e);
      if (p < 1) raf = requestAnimationFrame(step);
      else html.style.scrollBehavior = prevBehavior;
    };
    raf = requestAnimationFrame(step);
  };

  const go = (dir) => {
    if (lock) return;
    const i = indexOf();
    const j = Math.max(0, Math.min(secs.length - 1, i + dir));
    if (j === i) return;
    lock = true;
    tween(targetY(secs[j]));
    setTimeout(() => { lock = false; }, 640);
  };

  window.addEventListener('wheel', (e) => {
    if (!MOTION_ON() || e.ctrlKey) return;                 // 减弱动效 / 缩放时走原生
    if (insideScrollable(e.target, e.deltaY > 0 ? 1 : -1)) return;
    e.preventDefault();
    go(e.deltaY > 0 ? 1 : -1);
  }, { passive: false });

  // 供左栏导航点击复用同一套补间
  globalThis.__pagerTo = (el) => {
    if (lock) return;
    lock = true;
    tween(targetY(el));
    setTimeout(() => { lock = false; }, 640);
  };
}

/* ============================================================ 手风琴 */
/** 「使用方式 / 关于本课程」的展开收起：内容始终在 DOM 里，靠 grid-template-rows 过渡 */
function initAccordions() {
  document.querySelectorAll('[data-acc]').forEach((acc) => {
    const btn = acc.querySelector('.acc__btn');
    if (!btn) return;
    btn.addEventListener('click', () => {
      const open = acc.classList.toggle('is-open');
      btn.setAttribute('aria-expanded', String(open));
    });
  });
}

/* ============================================================ 首屏数字 / 滚动进度 */
/** 首屏统计数字：载入时从 0 滚到目标值；减弱动效时直接落位 */
function initCounters() {
  const nodes = [...document.querySelectorAll('[data-count]')];
  if (!nodes.length) return;

  const put = (el, n) => {
    el.textContent = String(n);
    if (el.dataset.suffix) {
      const s = document.createElement('span');
      s.textContent = el.dataset.suffix;
      el.appendChild(s);
    }
  };

  if (!MOTION_ON()) {
    nodes.forEach((el) => put(el, Number(el.dataset.count) || 0));
    return;
  }
  const DUR = 1150;
  nodes.forEach((el, i) => {
    const target = Number(el.dataset.count) || 0;
    const t0 = performance.now() + i * 90;
    const step = (now) => {
      const p = Math.min(1, Math.max(0, (now - t0) / DUR));
      const eased = 1 - Math.pow(1 - p, 3);
      put(el, Math.round(target * eased));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}

/** 门户顶部的阅读进度条（该元素只存在于门户页） */
function initScrollProgress() {
  const bar = document.querySelector('[data-scroll-progress]');
  if (!bar) return;
  let raf = 0;
  const update = () => {
    raf = 0;
    const max = document.documentElement.scrollHeight - window.innerHeight;
    const p = max > 0 ? Math.min(1, window.scrollY / max) : 0;
    bar.style.transform = `scaleX(${p})`;
  };
  const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });
  update();
}

/* ============================================================ 启动 */
function boot() {
  const ui = UI;

  // 动效开关：默认跟随系统；点一下即显式选择（本地记住）
  const syncMotion = () => {
    const on = MOTION_ON();
    document.querySelectorAll('[data-motion-toggle]').forEach((b) => b.setAttribute('aria-pressed', String(on)));
  };
  document.querySelector('[data-motion-toggle]')?.addEventListener('click', () => {
    const on = MOTION_ON();
    html.setAttribute('data-motion', on ? 'off' : 'on');
    try { localStorage.setItem('vis.motion', on ? '0' : '1'); } catch (e) { /* 忽略 */ }
    syncMotion();
    // 让天空与球体立即按新状态重画
    window.dispatchEvent(new Event('resize'));
  });
  syncMotion();

  document.querySelector('[data-theme-toggle]')?.addEventListener('click', () => {
    setTheme(html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
  });
  document.querySelector('[data-nav-toggle]')?.addEventListener('click', () => {
    setNav(html.getAttribute('data-nav') !== 'open');
  });
  document.querySelector('[data-scrim]')?.addEventListener('click', () => setNav(false));
  document.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('.sidebar a');
    if (a && window.innerWidth <= 1000) setNav(false);
  });

  document.querySelectorAll('[data-mark]').forEach((b) => {
    b.addEventListener('click', () => {
      const k = key(b.dataset.mark);
      if (done.has(k)) done.delete(k); else done.add(k);
      saveDone();
    });
  });

  document.querySelector('[data-search-open]')?.addEventListener('click', () => globalThis.__openSearch?.());

  // 初始主题图标与专注态
  setTheme(html.getAttribute('data-theme') || 'light');

  initFontScale();
  initTabs();
  initScrollSpy();
  initReveal();
  initCopy();
  initCardGlow();
  initKeys();
  initBackToTop();
  initViewTransitions();
  syncProgress();
  initGlossary();

  // 演示：仅挂载当前可见面板中的
  mountDemos(document);

  initCounters();
  initScrollProgress();

  initAccordions();
  initDeck();
  initPager();

  // 主页：按需加载动态天空背景
  if (document.querySelector('[data-sky]')) {
    import(assetUrl('assets/sky.js'))
      .then((m) => m.init())
      .catch((err) => console.error('[sky]', err));
  }
  // 自定义指针（触摸设备内部会自行跳过）
  import(assetUrl('assets/cursor.js'))
    .then((m) => m.init())
    .catch((err) => console.error('[cursor]', err));
  // 总览页：按需加载知识地图地球仪
  if (document.querySelector('[data-globe]')) {
    import(assetUrl('assets/globe.js'))
      .then((m) => m.init())
      .catch((err) => console.error('[globe]', err));
  }

  // 搜索按需加载（首次 Ctrl+K 或点击时）
  let searchLoaded = null;
  globalThis.__openSearch = () => {
    if (!searchLoaded) {
      searchLoaded = import(assetUrl('assets/search.js')).then((m) => m.initSearch({ base: BASE, locale: LOCALE, ui }));
    }
    searchLoaded.then((m) => m && m.open?.());
  };

  // 之前只定义了 open，Esc 调用的 __closeSearch 从未存在，所以按 Esc 关不掉搜索
  globalThis.__closeSearch = () => {
    if (searchLoaded) { searchLoaded.then((m) => m && m.close?.()); return; }
    const box = document.getElementById('palette');
    if (box && box.dataset.open === '1') {
      box.dataset.open = '0';
      document.body.style.overflow = '';
    }
  };

  // hash 直达：高亮目标小节
  if (location.hash) {
    const id = location.hash.slice(1);
    const el = document.getElementById(id);
    if (el) requestAnimationFrame(() => el.scrollIntoView({ block: 'start' }));
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
