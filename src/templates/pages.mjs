/**
 * pages.mjs —— 侧栏 / 目录 / 门户 / 章节页 / 术语表 的正文结构
 */

import { renderBlocks } from './blocks.mjs';

const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const TABS = [
  { key: 'explain', icon: '📖' },
  { key: 'code', icon: '⌨️' },
  { key: 'demo', icon: '▶️' },
];

/* ------------------------------------------------------------ 侧栏 */
export function renderSidebar({ chapters, currentSlug, lang, url, ui, counts }) {
  const items = chapters.map((ch) => {
    const isCurrent = ch.slug === currentSlug;
    const subs = isCurrent
      ? `<ul class="sections">${ch.sections.map((s) => `
        <li><a class="sections__link" href="#${esc(s.slug)}" data-section-link="${esc(s.slug)}">
          <span class="sections__num">${esc(s.num)}</span>
          <span class="sections__label">${esc(s.title[lang])}</span>
          <span class="sections__done" data-done="0" aria-hidden="true"></span>
        </a></li>`).join('')}
      </ul>`
      : '';
    return `<li class="chapters__item">
      <a class="chapters__link" href="${url(`${ch.slug}/`)}"${isCurrent ? ' aria-current="page"' : ''}>
        <span class="chapters__num">${ch.num}</span>
        <span>${esc(ch.title[lang])}</span>
      </a>
      ${subs}
    </li>`;
  }).join('\n');

  const done = counts?.done ?? 0;
  const total = counts?.total ?? 0;

  return `<aside class="sidebar" data-sidebar>
  <nav class="sidebar__inner">
    <div class="sidebar__head">
      <span class="sidebar__title">${esc(ui.chapters)}</span>
      <span class="sidebar__progress" data-global-progress>${done}/${total}</span>
    </div>
    <ul class="chapters">
${items}
    </ul>
    <ul class="chapters">
      <li class="chapters__item"><a class="chapters__link" href="${url('overview/')}">
        <span class="chapters__num">◱</span><span>${esc(ui.navOverview)}</span>
      </a></li>
      <li class="chapters__item"><a class="chapters__link" href="${url('glossary/')}">
        <span class="chapters__num">∑</span><span>${esc(ui.glossary)}</span>
      </a></li>
    </ul>
  </nav>
</aside>`;
}

/* ------------------------------------------------------ 右侧辅助栏 */
/*
 * 这里原本是「本页目录」，和左侧栏的小节列表重复，属于无效信息。
 * 换成三块真正有用的内容：
 *   1) 本章进度（环形 + 已学计数，与左侧栏的圆点联动）
 *   2) 本章术语（从术语表里筛出本章用到的，点进去看释义）
 *   3) 本章关键代码（列出每个小节的代码用途，点击直达该小节）
 */
export function renderRail({ lessonData, lang, ui, url, terms = [], codes = [] }) {
  const n = lessonData.sections.length;

  const termList = terms.length
    ? terms.map((t) => `<li class="rail__term">
        <span class="rail__term-name">${esc(t.term[lang] || t.term.zh)}</span>
        <span class="rail__term-def">${esc(t.def[lang] || t.def.zh)}</span>
      </li>`).join('')
    : `<li class="rail__empty">${esc(ui.railNoTerms)}</li>`;

  const codeList = codes.length
    ? codes.map((c) => `<li><a class="rail__code" href="#${esc(c.slug)}">
        <span class="rail__code-num">${esc(c.num)}</span>
        <span class="rail__code-label">${esc(c.label)}</span>
      </a></li>`).join('')
    : `<li class="rail__empty">${esc(ui.railNoCodes)}</li>`;

  return `<aside class="rail" aria-label="${esc(ui.railLabel)}">
  <section class="rail__card">
    <h2 class="rail__head">${esc(ui.railProgress)}</h2>
    <div class="rail__progress">
      ${ring(lessonData.slug)}
      <p class="rail__progress-text"><b data-rail-done>0</b> / ${n} ${esc(ui.railDoneUnit)}</p>
    </div>
    <a class="rail__link" href="${url('glossary/')}">${esc(ui.glossary)}<span aria-hidden="true">→</span></a>
  </section>

  <section class="rail__card">
    <h2 class="rail__head">${esc(ui.railTerms)}</h2>
    <ul class="rail__terms">${termList}</ul>
  </section>

  <section class="rail__card">
    <h2 class="rail__head">${esc(ui.railCodes)}</h2>
    <ol class="rail__codes">${codeList}</ol>
  </section>
</aside>`;
}

/* ------------------------------------------------------------ 进度环 */
const RING_C = 113.1;
function ring(slug, label = '0%') {
  return `<svg class="ring" viewBox="0 0 44 44" data-ring="${esc(slug)}" role="img" aria-label="${esc(label)}">
    <circle class="ring__bg" cx="22" cy="22" r="18" fill="none" stroke-width="4"/>
    <circle class="ring__fg" cx="22" cy="22" r="18" fill="none" stroke-width="4"
      stroke-dasharray="${RING_C}" stroke-dashoffset="${RING_C}" transform="rotate(-90 22 22)"/>
    <text class="ring__label" x="22" y="25.5" text-anchor="middle" data-ring-label>0%</text>
  </svg>`;
}

/* ------------------------------------------------------------ 主页（独立落地页） */
/*
 * 主页只做一件事：建立第一印象，并把用户送进课程。
 * 内容层（知识地图 / 章节 / 使用方式 / 关于）全部移到「课程总览」页，
 * 因此主页可以撑满一屏、不受内容长度牵制，留白也就有了目的。
 */
export function renderLanding({ lang, ui, portal, stats, url }) {
  // 统计写成一句短句，不用「A · B · C」那种中点拼接（那是最典型的模板腔之一）
  const subLine = stats
    .slice(1)
    .map((x, i) => `${i === 0 ? '' : '，'}<b data-count="${x.value}">0</b> ${esc(x.label)}`)
    .join('') + '。';

  return `<section class="landing">
  <canvas class="sky" data-sky aria-hidden="true"></canvas>
  <div class="landing__veil" aria-hidden="true"></div>

  <div class="wrap landing__inner">
    <h1 class="landing__title">
      <span class="line"><span>${esc(portal.name)}</span></span>
    </h1>

    <p class="landing__tagline">${esc(portal.tagline)}</p>
    <p class="landing__sub">${subLine}</p>

    <div class="landing__cta">
      <a class="btn btn--glass btn--lg" href="${url('overview/')}">${esc(portal.enterCourse)}</a>
    </div>

    <p class="landing__scroll" aria-hidden="true">${esc(portal.scrollHint)}</p>
  </div>
</section>`;
}

/* ------------------------------------------------------------ 课程总览 */
function accordion(items, prefix) {
  const rows = items
    .map(
      (it, i) => `
      <div class="acc${i === 0 ? ' is-open' : ''}" data-acc>
        <h3 class="acc__head">
          <button class="acc__btn" type="button" aria-expanded="${i === 0}" aria-controls="${prefix}-p${i}">
            <span class="acc__title">${esc(it.title)}</span>
            <span class="acc__chev" aria-hidden="true"></span>
          </button>
        </h3>
        <div class="acc__panel" id="${prefix}-p${i}" role="region">
          <div class="acc__inner"><p>${esc(it.desc)}</p></div>
        </div>
      </div>`
    )
    .join('');
  return `<div class="acc-group" data-acc-group>${rows}</div>`;
}

export function renderOverview({ chapters, lang, ui, portal, url }) {
  const cards = chapters
    .map(
      (ch) => `
    <a class="card card--chapter" href="${url(`${ch.slug}/`)}">
      <span class="card__sweep" aria-hidden="true"></span>
      <div class="card__top">
        <span class="card__num" aria-hidden="true">${ch.num}</span>
        ${ring(ch.slug)}
      </div>
      <h3 class="card__title">${esc(ch.title[lang])}</h3>
      <span class="card__kicker">${ch.sections.length} ${esc(portal.sectionWord)}</span>
      <p class="card__desc card__desc--clamp">${esc(ch.desc[lang])}</p>
      <div class="card__tags">${ch.tags[lang].slice(0, 3).map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div>
      <div class="card__foot"><span>${esc(portal.enter)}</span><span class="card__enter" aria-hidden="true">→</span></div>
    </a>`
    )
    .join('');

  // 地球仪数据：只带当前语言，避免页面里塞两种语言
  const globeData = chapters.map((c) => ({
    num: c.num,
    slug: c.slug,
    color: c.color,
    title: c.title[lang],
    sections: c.sections.map((s) => ({ num: s.num, slug: s.slug, title: s.title[lang] })),
  }));
  const deck = [
    ['map', portal.mapTitle],
    ['chapters', portal.chaptersTitle],
    ['howto', portal.howtoTitle],
    ['about', portal.aboutTitle],
    ['closing', ui.deckClosing],
  ];

  return `<aside class="decknav" data-decknav aria-label="${esc(ui.overviewTitle)}">
  <h1 class="decknav__title">${esc(ui.overviewTitle)}</h1>
  <ol class="decknav__list">
    ${deck.map(([id, label], i) => `<li><a href="#${id}" data-deck="${id}"${i === 0 ? ' aria-current="true"' : ''}>
      <span class="decknav__num">${String(i + 1).padStart(2, '0')}</span>
      <span class="decknav__name">${esc(label)}</span>
    </a></li>`).join('')}
  </ol>
</aside>

<section class="section-block page-turn" id="map">
  <div class="wrap">
    <div class="section-head">
      <h2 class="reveal">${esc(portal.mapTitle)}</h2>
      <p>${esc(portal.mapLead)}</p>
    </div>

    <div class="globe" data-globe>
      <div class="globe__stage">
        <canvas class="globe__canvas" data-globe-canvas aria-hidden="true"></canvas>
        <div class="globe__tip" data-globe-tip data-open="0" aria-hidden="true"></div>
        <noscript><p class="globe__fallback">${esc(ui.globeNoJs)}</p></noscript>
      </div>

      <div class="atlas" data-atlas>
        <p class="atlas__lead">${esc(ui.globeHint)}</p>
        ${chapters.map((c, i) => `
        <div class="chap" data-chap="${i}" style="--c:${c.color}">
          <button class="chap__btn" type="button" data-globe-filter="${i}" aria-expanded="false" aria-controls="chap-p${i}">
            <span class="chap__dot" aria-hidden="true"></span>
            <span class="chap__num">${String(c.num).padStart(2, '0')}</span>
            <span class="chap__title">${esc(c.title[lang])}</span>
            <span class="chap__n">${c.sections.length} ${esc(portal.sectionWord)}</span>
            <span class="chap__chev" aria-hidden="true"></span>
          </button>
          <div class="chap__panel" id="chap-p${i}">
            <div class="chap__inner">
              <div class="chap__grid">
                ${c.sections.map((sec) => `<a class="sec" href="${url(`${c.slug}/#${sec.slug}`)}">
                  <span class="sec__num">${esc(sec.num)}</span>
                  <span class="sec__title">${esc(sec.title[lang])}</span>
                </a>`).join('')}
              </div>
            </div>
          </div>
        </div>`).join('')}
      </div>

      <script type="application/json" data-globe-data>${JSON.stringify(globeData).replace(/</g, '<')}</script>
    </div>
  </div>
</section>

<section class="section-block section-block--alt page-turn" id="chapters">
  <div class="wrap">
    <div class="section-head">
      <h2 class="reveal">${esc(portal.chaptersTitle)}</h2>
      <p>${esc(portal.chaptersLead)}</p>
    </div>
    <div class="cards cards--chapters">
${cards}
    </div>
  </div>
</section>

<section class="section-block page-turn" id="howto">
  <div class="wrap wrap--narrow">
    <div class="section-head">
      <h2 class="reveal">${esc(portal.howtoTitle)}</h2>
      <p>${esc(ui.accLead)}</p>
    </div>
    ${accordion(portal.howto, 'acc-how')}
  </div>
</section>

<section class="section-block section-block--alt page-turn" id="about">
  <div class="wrap wrap--narrow">
    <div class="section-head">
      <h2 class="reveal">${esc(portal.aboutTitle)}</h2>
      <p>${esc(ui.accLead)}</p>
    </div>
    ${accordion(portal.about, 'acc-abo')}
  </div>
</section>

<section class="closing page-turn" id="closing">
  <div class="closing__bg" aria-hidden="true"><i></i><i></i><i></i></div>
  <div class="wrap">
    <h2 class="closing__title">${esc(portal.closingTitle)}</h2>
    <p class="closing__lead">${esc(portal.closingLead)}</p>
    <div class="closing__cta">
      <a class="btn btn--primary btn--lg" href="${url(`${chapters[0].slug}/`)}">${esc(portal.ctaStart)}</a>
      <a class="btn btn--ghost btn--lg" href="${url('glossary/')}">${esc(ui.glossary)}</a>
    </div>
  </div>
</section>`;
}

/* ------------------------------------------------------------ 章节页 */
export function renderLesson({ lessonData, lang, ui, chapterColor, prev, next, url, asset }) {
  const sections = lessonData.sections.map((s) => {
    const counts = Object.fromEntries(TABS.map((t) => [t.key, (s.tabs[t.key] || []).length]));
    const tabs = TABS.map((t, i) => `<button class="tab-btn" type="button" role="tab" data-tab="${t.key}"
      aria-selected="${i === 0}" aria-controls="panel-${esc(s.slug)}-${t.key}" id="tab-${esc(s.slug)}-${t.key}" tabindex="${i === 0 ? 0 : -1}">
      <span class="tab-btn__icon" aria-hidden="true">${t.icon}</span>${esc(ui.tabs[t.key])}
      <span class="tab-btn__count">${counts[t.key]}</span></button>`).join('');

    const panels = TABS.map((t, i) => `<div class="tab-panel prose${i === 0 ? ' is-active' : ''}" data-panel="${t.key}"
      role="tabpanel" id="panel-${esc(s.slug)}-${t.key}" aria-labelledby="tab-${esc(s.slug)}-${t.key}">
${renderBlocks(s.tabs[t.key], lang, ui, asset)}
    </div>`).join('\n');

    return `<article class="section" id="${esc(s.slug)}" data-section="${esc(s.slug)}">
  <div class="section__head reveal">
    <span class="section__num">${esc(s.num)}</span>
    <h2 class="section__title">${esc(s.title[lang])}
      <button class="section__mark" type="button" data-mark="${esc(s.slug)}" aria-pressed="false">${esc(ui.markDone)}</button>
    </h2>
    ${s.subtitle[lang] ? `<p class="section__sub">${esc(s.subtitle[lang])}</p>` : ''}
  </div>
  <div class="tabs" role="tablist" aria-label="${esc(s.title[lang])}">
    ${tabs}
    <span class="tabs__ink" aria-hidden="true"></span>
  </div>
  <div class="tab-panels">
${panels}
  </div>
</article>`;
  }).join('\n');

  const pager = `<nav class="pager">
  ${prev ? `<a class="pager--prev" href="${url(`${prev.slug}/`)}"><span class="pager__dir">${esc(ui.prevChapter)}</span><span class="pager__title">${esc(prev.title[lang])}</span></a>` : '<span class="pager__spacer"></span>'}
  ${next ? `<a class="pager--next" href="${url(`${next.slug}/`)}"><span class="pager__dir">${esc(ui.nextChapter)}</span><span class="pager__title">${esc(next.title[lang])}</span></a>` : '<span class="pager__spacer"></span>'}
</nav>`;

  return `<nav class="crumbs"><a href="${url('')}">${esc(ui.navHome)}</a><span>/</span><a href="${url('overview/')}">${esc(ui.navOverview)}</a><span>/</span><span>${esc(lessonData.title[lang])}</span></nav>

<header class="chapter-head" style="--chapter:${chapterColor}">
  <div class="chapter-head__kicker">${esc(ui.chapterWord)} ${lessonData.num}</div>
  <h1>${esc(lessonData.title[lang])}</h1>
  <div class="chapter-head__meta">
    <span>${lessonData.sections.length} ${esc(ui.sectionWord)}</span>
    <span data-chapter-progress>0/${lessonData.sections.length}</span>
  </div>
</header>

${sections}
${pager}`;
}

/* ------------------------------------------------------------ 术语表 */
export function renderGlossary({ groups, lang, ui, url }) {
  const body = groups.map((g) => `
  <section class="section-block">
    <div class="section-block__head"><h2>${esc(g.title[lang])}</h2></div>
    <div class="table-wrap">
      <table class="theory-table">
        <thead><tr><th>${esc(ui.term)}</th><th>${esc(ui.termDef)}</th><th>${esc(ui.termWhere)}</th></tr></thead>
        <tbody>
          ${g.items.map((it) => `<tr>
            <td><strong>${esc(it.term[lang])}</strong></td>
            <td>${esc(it.def[lang])}</td>
            <td>${(it.refs || []).map((r) => `<a href="${url(`${r.slug}/`)}#${esc(r.section)}">${esc(r.label)}</a>`).join('、')}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>
  </section>`).join('\n');

  return `<nav class="crumbs"><a href="${url('')}">${esc(ui.navHome)}</a><span>/</span><a href="${url('overview/')}">${esc(ui.navOverview)}</a><span>/</span><span>${esc(ui.glossary)}</span></nav>
<header class="chapter-head">
  <div class="chapter-head__kicker">${esc(ui.glossary)}</div>
  <h1>${esc(ui.glossaryTitle)}</h1>
  <p class="section__sub">${esc(ui.glossaryLead)}</p>
</header>
${body}`;
}
