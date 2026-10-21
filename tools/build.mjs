/**
 * build.mjs —— 静态站构建
 *
 * content/*.json + src/**  →  dist/**（双语静态 HTML，零运行时依赖）
 *
 * 关键决策：
 *  - zh 放在站点根目录（保持旧站 /lesson-01/ 等 URL 可用），en 镜像到 /en/；
 *  - 双语在构建期展开为「单语页面」，页面内不再有隐藏的另一种语言节点，
 *    也不再有运行时 i18n 字典 —— 这同时消除了旧站的两套多语言机制；
 *  - 所有路径经 base 相对解析，既能部署到 GitHub Pages 子路径，也能本地打开。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderShell } from '../src/templates/shell.mjs';
import { renderSidebar, renderRail, renderLanding, renderOverview, renderLesson, renderGlossary } from '../src/templates/pages.mjs';
import { minifyHTML, minifyCSS } from './minify.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CONTENT = path.join(ROOT, 'content');
const SRC = path.join(ROOT, 'src');
const DIST = path.join(ROOT, 'dist');

const SITE_URL = process.env.SITE_URL || 'https://cinger007.github.io/vis/';

/* ============================================================ 文案 */

const UI = {
  zh: {
    brand: '可视化导论', brandSub: 'VISUALIZATION', siteName: '《可视化导论》', titleSep: ' · ',
    skip: '跳到正文', chapters: '章节', glossary: '术语表',
    search: '搜索', searchPlaceholder: '搜索小节、代码、术语…', searchResults: '搜索结果',
    theme: '切换深色/浅色',  lang: '切换语言',
    fontSize: '调节字号', fontSmaller: '减小字号', fontLarger: '增大字号', toTop: '回到顶部',
    motion: '开启动效',
overviewTitle: '课程总览', deckClosing: '开始学习', navOverview: '课程总览', navHome: '课程主页',
    railLabel: '本章辅助信息', railProgress: '本章进度', railDoneUnit: '个已学',
    railTerms: '本章术语', railCodes: '本章关键代码', railNoTerms: '本章没有引入新术语。', railNoCodes: '本章以概念讲解为主。',
    overviewLead: '先看地图找到位置，再按章进入；也可以直接从任意一章开始。',
    globeHint: '拖动可旋转星球；点右侧章节只看那一章，再点小节直接进入。',
    globeAll: '全部章节', globeFilterLabel: '按章节筛选小节',
    globeNoJs: '（开启 JavaScript 后可拖动星球；右侧的小节列表同样可以进入。）',
    accLead: '点击标题展开详情。',
    toggleNav: '打开章节导航', copy: '复制', copied: '已复制', keyLine: '{n} 处关键点',
    demoLoading: '正在加载演示…', demoError: '演示加载失败，请检查网络或稍后重试',
    markDone: '标记已学', markedDone: '已学', home: '课程首页', chaptersTitle: '课程章节',
    prevChapter: '上一章', nextChapter: '下一章', chapterWord: '第', sectionWord: '小节',
    paletteMove: '选择', paletteOpen: '打开', noResults: '没有匹配的结果',
    glossaryTitle: '术语表', glossaryLead: '全站关键术语的双语释义与出处，正文中的术语可点击查看。',
    term: '术语', termDef: '释义', termWhere: '出处',
    footer: '© 2026 《可视化导论》课程 · 中国石油大学（华东）· 授课教师：李昕 · 主要参考教材：陈为《可视化导论》',
    footerSource: '查看原站源码',
    tabs: { explain: '讲解', code: '关键代码', demo: '演示' },
  },
  en: {
    brand: 'Introduction to Visualization', brandSub: '', siteName: 'Introduction to Visualization', titleSep: ' · ',
    skip: 'Skip to content', chapters: 'Chapters', glossary: 'Glossary',
    search: 'Search', searchPlaceholder: 'Search sections, code, terms…', searchResults: 'Search results',
    theme: 'Toggle dark / light',  lang: 'Switch language',
    fontSize: 'Text size', fontSmaller: 'Decrease text size', fontLarger: 'Increase text size', toTop: 'Back to top',
    motion: 'Turn on motion',
overviewTitle: 'Course Overview', deckClosing: 'Start learning', navOverview: 'Overview', navHome: 'Home',
    railLabel: 'Chapter aids', railProgress: 'Chapter progress', railDoneUnit: 'learned',
    railTerms: 'Terms in this chapter', railCodes: 'Key code in this chapter', railNoTerms: 'No new terms in this chapter.', railNoCodes: 'This chapter is mostly conceptual.',
    overviewLead: 'Find your place on the globe first, then enter a chapter — or jump straight into any chapter.',
    globeHint: 'Drag to spin the globe; pick a chapter on the right to isolate it, then click a section to enter.',
    globeAll: 'All chapters', globeFilterLabel: 'Filter sections by chapter',
    globeNoJs: '(Enable JavaScript to spin the globe; the section list works regardless.)',
    accLead: 'Click a title to expand.',
    toggleNav: 'Open chapter navigation', copy: 'Copy', copied: 'Copied', keyLine: '{n} key lines',
    demoLoading: 'Loading demo…', demoError: 'Failed to load the demo — check your connection and retry',
    markDone: 'Mark learned', markedDone: 'Learned', home: 'Course home', chaptersTitle: 'Chapters',
    prevChapter: 'Previous', nextChapter: 'Next', chapterWord: 'Chapter', sectionWord: 'sections',
    paletteMove: 'move', paletteOpen: 'open', noResults: 'No matching results',
    glossaryTitle: 'Glossary', glossaryLead: 'Bilingual definitions of key terms with links back to where they appear.',
    term: 'Term', termDef: 'Definition', termWhere: 'Appears in',
    footer: '© 2026 Introduction to Visualization · China University of Petroleum (East China) · Instructor: Li Xin · Main text: Chen Wei, Introduction to Visualization',
    footerSource: 'Original site source',
    tabs: { explain: 'Explain', code: 'Key Code', demo: 'Demo' },
  },
};

const PORTAL = {
  zh: {
    name: '《可视化导论》',
    tagline: '从数据到图表：JavaScript + D3.js 实战课程',
    ctaStart: '直接看第 1 章', ctaMap: '查看知识地图', enterCourse: '进入课程总览',
    closingTitle: '把数据读成图，把图读回数据。', closingLead: '27 个小节、27 个可运行演示都在总览页等着。',
    stageTypes: ['柱状图', '散点图', '日历热图', '螺旋日历'],
    stageAlt: '同一份数据在柱状图、散点图、日历热图与螺旋日历之间自动变形',
    stageFoot: '同一份数据，四种图形 —— 只换坐标映射，含义就变了。',
    scrollHint: '向下滚动可看课程总览',
    stagePause: '暂停图形切换', stagePlay: '继续图形切换',
    ticker: ['DIKW 金字塔', 'Stevens 测量尺度', '视觉通道排序', 'Data-Join 三态', 'd3.rollup 多层聚合', 'Reingold-Tilford 布局', '事件委托', 'CIE Lab 色域', 'colormap 三类', '色觉缺陷 CVD', 'Cleveland 45° 倾角', 'Marching Squares', 'van Wijk 日历热图', '阿基米德螺旋', 'Storyline 故事线'],
    mapTitle: '课程知识地图', mapLead: '五章各占一条纬带，27 个小节就是带上的点。拖动可以转动星球，从不同角度看同一门课。',
    mapCross: '跨章概念关联',
    chaptersTitle: '章节', chaptersLead: '每小节含三个视角：讲解 / 关键代码 / 演示。演示可在页面内直接运行，无需跳转。',
    howtoTitle: '使用方式',
    aboutTitle: '关于本课程',
    enter: '进入本章', chapterWord: '第', sectionWord: '节',
    howto: [
      { title: '课堂讲解', desc: '打开任一章节，按小节顺序讲解，随时切到「演示」在页面内实时运行。' },
      { title: '学生自学', desc: '侧栏可看到全站章节与本章小节，右上角「标记已学」记录进度，进度环自动更新。' },
      { title: '按需检索', desc: 'Ctrl/⌘ + K 打开全站搜索，覆盖小节正文、关键代码与术语；术语表给出双语释义。' },
      { title: '离线 / 局域网', desc: '构建产物为纯静态文件，D3 已本地打包，无需联网；直接 python -m http.server 即可。' },
    ],
    about: [
      { title: '理论来源', desc: '陈为《可视化导论》、Mackinlay 1986 视觉通道排序、Stevens 1946 测量尺度、Cleveland 1984 45° 倾角、Card 1999 数据流模型。' },
      { title: '设计原则', desc: '案例为中心：每个知识点都嵌入真实数据案例，配关键点解释与可运行演示。' },
      { title: '技术栈', desc: '零运行时依赖：构建期生成为纯静态 HTML/CSS/JS，D3.js v7 本地打包，无框架、无 CDN。' },
      { title: '无障碍与阅读', desc: '支持键盘导航、深色模式、专注模式、打印导出完整讲义，并遵循 prefers-reduced-motion。' },
    ],
  },
  en: {
    name: 'Introduction to Visualization',
    tagline: 'From Data to Charts: A Hands-on JavaScript + D3.js Course',
    ctaStart: 'Open Chapter 1', ctaMap: 'See the knowledge map', enterCourse: 'Enter the course',
    closingTitle: 'Read data as charts, and charts back as data.', closingLead: 'All 27 sections and 27 runnable demos are one click away.',
    stageTypes: ['Bar chart', 'Scatter plot', 'Calendar heatmap', 'Spiral calendar'],
    stageAlt: 'One dataset morphing between a bar chart, a scatter plot, a calendar heatmap and a spiral calendar',
    stageFoot: 'One dataset, four charts — only the mapping changed, so did the meaning.',
    scrollHint: 'Scroll down for the course overview',
    stagePause: 'Pause chart rotation', stagePlay: 'Resume chart rotation',
    ticker: ['DIKW pyramid', 'Stevens scales', 'Channel ranking', 'Data-Join states', 'd3.rollup', 'Reingold-Tilford', 'Event delegation', 'CIE Lab gamut', 'Colormap types', 'Color vision deficiency', 'Cleveland 45°', 'Marching Squares', 'Calendar heatmap', 'Archimedean spiral', 'Storyline'],
    mapTitle: 'Course knowledge map', mapLead: 'Each chapter is a latitude band; the 27 sections are the dots on it. Drag to spin the globe and look at the course from another angle.',
    mapCross: 'Cross-chapter concept',
    chaptersTitle: 'Chapters', chaptersLead: 'Each section has three views: Explain / Key Code / Demo. Demos run inline, without leaving the page.',
    howtoTitle: 'How to use',
    aboutTitle: 'About this course',
    enter: 'Open chapter', chapterWord: 'Ch.', sectionWord: 'sections',
    howto: [
      { title: 'Teaching in class', desc: 'Open a chapter and walk through sections in order, switching to Demo to run it live on the page.' },
      { title: 'Self-study', desc: 'The sidebar lists all chapters plus the current chapter\'s sections; "Mark learned" records progress and updates the rings.' },
      { title: 'Search anything', desc: 'Ctrl/⌘ + K searches prose, key code and glossary across the whole site. The glossary gives bilingual definitions.' },
      { title: 'Offline / LAN', desc: 'The build output is plain static files with D3 bundled locally — no network needed. Just run python -m http.server.' },
    ],
    about: [
      { title: 'Theory sources', desc: 'Chen Wei, Introduction to Visualization; Mackinlay 1986 channel ranking; Stevens 1946 measurement scales; Cleveland 1984 45° inclination; Card 1999 data-flow model.' },
      { title: 'Design principle', desc: 'Case-centered: every concept is embedded in a real dataset case, with key points and a runnable demo.' },
      { title: 'Tech stack', desc: 'Zero runtime dependencies: built into plain static HTML/CSS/JS, D3.js v7 bundled locally, no framework, no CDN.' },
      { title: 'Accessibility & reading', desc: 'Keyboard navigation, dark mode, focus mode, print-to-handout of the whole lecture, and respects prefers-reduced-motion.' },
    ],
  },
};

/** 章节补充元数据（描述/标签/配色/英文名） */
const CHAPTER_META = {
  1: {
    en: 'Data', color: '#e3cd92',
    desc: { zh: '从 DeepSeek 合成的新生数据出发，讲清数据从哪来、如何定义、有哪些属性、怎么变换，以及 D3 选择器的 enter / update / exit 三态模型。', en: 'Starting from a synthesized freshman dataset: where data comes from, how it is defined, what attributes it has, how it is transformed, and D3\'s enter / update / exit selection states.' },
    tags: { zh: ['DIKW 金字塔', 'Stevens 4 尺度', '视觉通道', 'Data-Join 三态'], en: ['DIKW pyramid', 'Stevens scales', 'Visual channels', 'Data-Join'] },
  },
  2: {
    en: 'Visualization Workflow', color: '#8fae9f',
    desc: { zh: 'Card 数据流模型串起整条链路：新生数据 → 分类树 → 树形列表，配合 d3.rollup 聚合、Reingold-Tilford 布局与 DOM 事件委托。', en: 'Card\'s data-flow model ties the whole chain together: freshman data → classification tree → tree list, with d3.rollup aggregation, Reingold-Tilford layout and DOM event delegation.' },
    tags: { zh: ['Card 模型', 'd3.rollup', 'Reingold-Tilford', '事件委托'], en: ['Card model', 'd3.rollup', 'Reingold-Tilford', 'Delegation'] },
  },
  3: {
    en: 'Color', color: '#d79a92',
    desc: { zh: '独立色彩专题：颜色模型、colormap 三类选择、CIE Lab 色域、5 大色系搭配规则、科研经典配色、对错案例，以及色觉缺陷（CVD）图测。', en: 'A dedicated color topic: color models, three kinds of colormap, CIE Lab gamut, five harmony rule sets, classic research palettes, right-vs-wrong cases, and CVD figure testing.' },
    tags: { zh: ['4 颜色空间 + CVD', 'Wong / Paul Tol', '5 大色系规则', '鲜艳 + 低饱和'], en: ['4 color spaces + CVD', 'Wong / Paul Tol', 'Harmony rules', 'Vivid + low-sat'] },
  },
  4: {
    en: 'Low-Dimensional Data', color: '#93a7b8',
    desc: { zh: '以 Crime 数据贯穿：三层坐标变换、10 种曲线拟合、Cleveland 45° 倾角判读，以及 Marching Squares 等值线提取。', en: 'Centered on the Crime dataset: three coordinate transforms, ten curve fits, Cleveland\'s 45° inclination, and Marching Squares contour extraction.' },
    tags: { zh: ['三层坐标变换', '10 种曲线', 'Cleveland 45°', 'Marching Squares'], en: ['Coordinate transforms', '10 curve fits', 'Cleveland 45°', 'Marching Squares'] },
  },
  5: {
    en: 'Time Series', color: '#c9a17a',
    desc: { zh: '5 个时间属性、法国人名时间序列、van Wijk 日历热图、阿基米德螺旋日历，以及《侏罗纪公园》Storyline 故事线。', en: 'Five time attributes, the French baby-names series, Van Wijk\'s calendar heatmap, the Archimedean spiral calendar, and a Jurassic Park storyline.' },
    tags: { zh: ['时间分解', '日历 colormap', '极坐标变换', 'Storygraph'], en: ['Time decomposition', 'Calendar colormap', 'Polar transform', 'Storygraph'] },
  },
};

/* ============================================================ 工具 */

const mkdir = (p) => fs.mkdirSync(p, { recursive: true });
const write = (p, s) => { mkdir(path.dirname(p)); fs.writeFileSync(p, s, 'utf8'); };

/** HTML 与 CSS 走压缩；JSON/XML/txt 等原样写出 */
const writeOut = (p, s) =>
  write(p, p.endsWith('.html') ? minifyHTML(s) : p.endsWith('.css') ? minifyCSS(s) : s);
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/* ============================================================ 主流程 */

function main() {
  fs.rmSync(DIST, { recursive: true, force: true });
  mkdir(DIST);

  const index = JSON.parse(fs.readFileSync(path.join(CONTENT, 'index.json'), 'utf8'));
  const demoRegistry = JSON.parse(fs.readFileSync(path.join(CONTENT, 'demos.json'), 'utf8'));
  const glossary = JSON.parse(fs.readFileSync(path.join(CONTENT, 'glossary.json'), 'utf8'));

  const lessons = index.chapters.map((ch) => {
    const L = JSON.parse(fs.readFileSync(path.join(CONTENT, `${ch.slug}.json`), 'utf8'));
    const meta = CHAPTER_META[ch.num] || {};
    return {
      ...L,
      ...meta,
      // 旧站 i18n 里的英文章名过于简短（Data / Color / Low-Dim），用编辑层的完整译名覆盖
      title: { ...L.title, en: meta.en || L.title.en },
    };
  });

  /* ---------- 编辑层：修正迁移自旧站的内容问题（集中可审计） */
  const overrides = JSON.parse(fs.readFileSync(path.join(CONTENT, 'overrides.json'), 'utf8'));
  Object.entries(overrides.sectionTitles || {}).forEach(([key, patch]) => {
    const [slug, sSlug] = key.split('/');
    const L = lessons.find((x) => x.slug === slug);
    const s = L && L.sections.find((x) => x.slug === sSlug);
    if (!s) { console.warn(`  ! 覆盖规则未命中：${key}`); return; }
    Object.entries(patch).forEach(([field, val]) => {
      if (field.startsWith('_')) return;
      if (field === 'en' || field === 'zh') s.title[field] = val;
      else s[field] = val;
    });
  });

  /* ---------- 0. 构建期门禁：每个演示挂载点都要有实现 */
  const problems = [];
  lessons.forEach((L) => {
    L.sections.forEach((s) => {
      ['explain', 'code', 'demo'].forEach((tab) => {
        (s.tabs[tab] || []).forEach((b) => {
          if (b.type === 'demo' && !demoRegistry[`${L.slug}/${b.ref}`]) {
            problems.push(`${L.slug} ${s.id}: 演示 ${b.ref} 在注册表中不存在`);
          }
        });
      });
    });
  });
  if (problems.length) {
    console.error('✗ 演示挂载点校验失败：');
    problems.forEach((p) => console.error('  - ' + p));
    process.exit(1);
  }

  /* ---------- 1. 样式合并 */
  const ORDER = ['fonts', 'tokens', 'base', 'layout', 'components', 'pages', 'prose', 'scale', 'demos', 'motion', 'print'];
  const css = ORDER.map((name) => {
    const f = path.join(SRC, 'styles', `${name}.css`);
    return fs.existsSync(f) ? `/* ===== ${name}.css ===== */\n${fs.readFileSync(f, 'utf8')}` : '';
  }).join('\n');
  writeOut(path.join(DIST, 'assets', 'site.css'), css);

  /* ---------- 2. 脚本与依赖 */
  mkdir(path.join(DIST, 'assets', 'demos'));
  for (const f of fs.readdirSync(path.join(SRC, 'scripts'))) {
    fs.copyFileSync(path.join(SRC, 'scripts', f), path.join(DIST, 'assets', f));
  }
  for (const f of fs.readdirSync(path.join(ROOT, 'demos'))) {
    fs.copyFileSync(path.join(ROOT, 'demos', f), path.join(DIST, 'assets', 'demos', f));
  }
  mkdir(path.join(DIST, 'assets', 'vendor'));
  const d3src = path.join(ROOT, 'node_modules', 'd3', 'dist', 'd3.min.js');
  fs.copyFileSync(d3src, path.join(DIST, 'assets', 'vendor', 'd3.min.js'));

  /* ---------- 3. 数据文件 */
  const dataDir = path.join(ROOT, 'public', 'data');
  if (fs.existsSync(dataDir)) {
    for (const f of fs.readdirSync(dataDir)) {
      write(path.join(DIST, 'data', f), fs.readFileSync(path.join(dataDir, f)));
    }
  }

  /* ---------- 3a. 字体（自托管，离线可用） ---------- */
  const fontDir = path.join(ROOT, 'public', 'fonts');
  if (fs.existsSync(fontDir)) {
    for (const f of fs.readdirSync(fontDir)) {
      write(path.join(DIST, 'fonts', f), fs.readFileSync(path.join(fontDir, f)));
    }
  }

  /* ---------- 3b. 插图（构建前已优化为 WebP） */
  const imgDir = path.join(ROOT, 'public', 'img');
  const availableImgs = new Set();
  if (fs.existsSync(imgDir)) {
    for (const f of fs.readdirSync(imgDir)) {
      availableImgs.add(f);
      write(path.join(DIST, 'img', f), fs.readFileSync(path.join(imgDir, f)));
    }
  }
  // 硬校验：内容里引用的每张插图都必须存在，否则「静默坏图」会一路带到线上
  const missingImgs = [];
  lessons.forEach((L) => L.sections.forEach((s) => ['explain', 'code', 'demo'].forEach((tab) =>
    (s.tabs[tab] || []).forEach((b) => {
      if (b.type !== 'figure') return;
      const name = path.basename(String(b.src || '')).replace(/\.png$/i, '.webp');
      if (!availableImgs.has(name)) missingImgs.push(`${L.slug} ${s.id}: ${name}`);
    })
  )));
  if (missingImgs.length) {
    console.error('✗ 插图缺失：');
    [...new Set(missingImgs)].forEach((m) => console.error('  - ' + m));
    process.exit(1);
  }

  /* ---------- 4. 知识地图数据 + 搜索索引 */
  // 跨章概念关联（知识地图的虚线）
  const CROSS_LINKS = [
    ['lesson-01/1-3', 'lesson-03/3-1'],   // 视觉通道 ↔ 颜色模型
    ['lesson-01/1-4', 'lesson-02/2-2'],   // 数据变换 → d3.rollup 聚合
    ['lesson-01/1-5', 'lesson-02/2-4'],   // 选择器三态 → 树形列表渲染
    ['lesson-01/1-2', 'lesson-02/2-1'],   // DIKW → 数据流模型
    ['lesson-02/2-2', 'lesson-04/4-1'],   // 聚合 → 低维数据转换
    ['lesson-03/3-2', 'lesson-05/5-3'],   // colormap → 日历热图配色
    ['lesson-03/3-3', 'lesson-03/3-6'],   // Lab 感知 → 对错案例
    ['lesson-04/4-3', 'lesson-05/5-2'],   // 曲线拟合 → 折线图
  ];


  const searchIndexes = { zh: [], en: [] };
  lessons.forEach((L) => {
    L.sections.forEach((s) => {
      ['zh', 'en'].forEach((lang) => {
        const prose = [];
        const code = [];
        ['explain', 'code', 'demo'].forEach((tab) => {
          (s.tabs[tab] || []).forEach((b) => {
            if (b.type === 'code') { code.push(b.text?.slice(0, 700) || ''); return; }
            if (b.type === 'demo') return;
            const v = lang === 'en' ? (b.en || b.zh) : (b.zh || b.en);
            if (Array.isArray(v)) prose.push(v.join(' ')); else if (v) prose.push(String(v).replace(/<[^>]*>/g, ' '));
          });
        });
        const text = prose.join(' ').replace(/\s+/g, ' ').trim();
        searchIndexes[lang].push({
          u: `${L.slug}/#${s.slug}`,
          n: `${s.num} ${s.title[lang]}`,
          c: `Ch. ${L.num}`,
          x: text.slice(0, 420),
        });
        if (code.length) {
          searchIndexes[lang].push({
            u: `${L.slug}/#${s.slug}`,
            n: `${s.num} ${s.title[lang]} · ${UI[lang].tabs.code}`,
            c: `Ch. ${L.num}`,
            x: code.join(' ').replace(/\s+/g, ' ').slice(0, 500),
            k: 'code',
          });
        }
      });
    });
  });
  glossary.groups.forEach((g) => {
    g.items.forEach((it) => {
      ['zh', 'en'].forEach((lang) => {
        searchIndexes[lang].push({
          u: `glossary/#${encodeURIComponent(it.term.zh)}`,
          n: it.term[lang], c: UI[lang].glossary, x: it.def[lang], k: 'gloss',
        });
      });
    });
  });
  ['zh', 'en'].forEach((lang) => {
    write(path.join(DIST, 'assets', `search-${lang}.json`), JSON.stringify(searchIndexes[lang]));
  });

  /* ---------- 5. 逐语言生成页面 */
  const LOCALES = [
    { code: 'zh', lang: 'zh-CN', root: '' },
    { code: 'en', lang: 'en-US', root: 'en/' },
  ];
  const totalSections = lessons.reduce((a, L) => a + L.sections.length, 0);

  /**
   * 传给运行时的数据：进度基数与每章小节数（都很小，直接内联）。
   * 术语释义体量大（16 条双语），改为按需拉取 assets/glossary-<locale>.json，
   * 否则每个页面的 HTML 都要多背十几 KB。
   */
  const runtime = {
    totalSections,
    perLesson: Object.fromEntries(lessons.map((L) => [L.slug, L.sections.length])),
  };

  const glossTerms = glossary.groups.flatMap((g) =>
    g.items.map((it) => ({ id: it.term.zh, term: it.term, def: it.def, group: g.title }))
  );
  ['zh', 'en'].forEach((lang) => {
    const slim = glossTerms.map((t) => ({ id: t.id, term: t.term, def: t.def }));
    write(path.join(DIST, 'assets', `glossary-${lang}.json`), JSON.stringify(slim));
  });

  let pages = 0;

  for (const loc of LOCALES) {
    const ui = { ...UI[loc.code] };
    const G = (sitePath) => {
      const depth = (loc.root + sitePath).split('/').filter(Boolean).length;
      const base = '../'.repeat(depth);
      const url = (p) => base + loc.root + p;
      const alt = base + (loc.code === 'zh' ? 'en/' : '') + sitePath;
      return { base, url, alt, depth };
    };

    const zh = loc.code === 'zh';

    /* 主页与总览共用的一组真实统计（全部由内容层算出，不写死） */
    const codeCount = lessons.reduce(
      (a, L) => a + L.sections.reduce((b, s) => b + (s.tabs.explain || []).concat(s.tabs.code || [], s.tabs.demo || []).filter((x) => x.type === 'code').length, 0), 0);
    const demoCount = lessons.reduce((a, L) => a + L.sections.reduce((b, s) => b + (s.tabs.demo || []).filter((x) => x.type === 'demo').length, 0), 0);
    const stats = [
      { value: String(lessons.length), label: zh ? '章节' : 'Chapters' },
      { value: String(totalSections), label: zh ? '小节' : 'Sections' },
      { value: String(codeCount), label: zh ? '关键代码段' : 'Key code blocks' },
      { value: String(demoCount), label: zh ? '可交互演示' : 'Interactive demos' },
    ];

    /* --- 主页（独立落地页）--- */
    {
      const { base, url, alt } = G('');
      const body = renderLanding({
        lang: loc.code, ui, portal: PORTAL[loc.code], stats, url,
      });
      writeOut(path.join(DIST, loc.root, 'index.html'), renderShell({
        lang: loc.lang, locale: loc.code, base, url, alt,
        title: ui.siteName,
        description: PORTAL[loc.code].tagline,
        altHref: alt, body, ui, variant: 'portal', runtime, localeRoot: loc.root,
      }));
      pages++;
    }

    /* --- 课程总览：知识地图 / 五章 / 使用方式 / 关于 / 结尾 --- */
    {
      const sitePath = 'overview/';
      const { base, url, alt } = G(sitePath);
      const body = renderOverview({
        chapters: lessons.map((L) => ({
          num: L.num, slug: L.slug, color: L.color, title: L.title,
          desc: L.desc, tags: L.tags, sectionCount: L.sections.length,
          sections: L.sections.map((x) => ({ num: x.num, slug: x.slug, title: x.title })),
        })),
        lang: loc.code, ui, portal: PORTAL[loc.code], url,
      });
      writeOut(path.join(DIST, loc.root, sitePath, 'index.html'), renderShell({
        lang: loc.lang, locale: loc.code, base, url, alt,
        title: `${ui.overviewTitle}${ui.titleSep}${ui.siteName}`,
        description: ui.overviewLead,
        altHref: alt, body, ui, variant: 'portal', runtime, localeRoot: loc.root,
        nav: [{ href: url('overview/'), label: ui.navOverview, current: true }],
        back: { href: url(''), label: ui.navHome },
        snap: true,
        deck: true,
      }));
      pages++;
    }

    /* --- 章节页 --- */
    lessons.forEach((L, i) => {
      const sitePath = `${L.slug}/`;
      const { base, url, alt } = G(sitePath);
      const counts = { done: 0, total: totalSections };
      const sidebar = renderSidebar({
        chapters: lessons.map((c) => ({ num: c.num, slug: c.slug, title: c.title, sections: c.sections })),
        currentSlug: L.slug, lang: loc.code, url, ui, counts,
      });
      // 右栏内容：本章术语（按引用筛）+ 本章关键代码索引
      const railTerms = glossary.groups
        .flatMap((g) => g.items)
        .filter((it) => (it.refs || []).some((r) => r.slug === L.slug))
        .map((it) => ({ term: it.term, def: it.def }));
      const railCodes = L.sections.map((sec) => {
        const blocks = sec.tabs.code || [];
        const purpose = blocks.find((b) => b.type === 'purpose');
        const head = blocks.find((b) => b.type === 'h3');
        const label = (purpose ? (purpose[loc.code] || purpose.zh) : '') || (head ? (head[loc.code] || head.zh) : '') || sec.title[loc.code];
        return { slug: sec.slug, num: sec.num, label: String(label).replace(/<[^>]*>/g, '').slice(0, 40) };
      }).filter((c) => (L.sections.find((x) => x.slug === c.slug).tabs.code || []).some((b) => b.type === 'code'));
      const rail = renderRail({ lessonData: L, lang: loc.code, ui, url, terms: railTerms, codes: railCodes });
      const body = renderLesson({
        lessonData: L, lang: loc.code, ui, chapterColor: L.color,
        prev: i > 0 ? lessons[i - 1] : null,
        next: i < lessons.length - 1 ? lessons[i + 1] : null,
        url,
        // 插图放在站点根 /img/ 下，与语言无关，故不带 locale 前缀
        asset: (p) => base + p,
      });
      writeOut(path.join(DIST, loc.root, L.slug, 'index.html'), renderShell({
        lang: loc.lang, locale: loc.code, base, url, alt,
        title: `${loc.code === 'zh' ? `第 ${L.num} 章` : `Ch. ${L.num}`} ${L.title[loc.code]}${ui.titleSep}${ui.siteName}`,
        description: L.desc[loc.code].slice(0, 150),
        altHref: alt, body, sidebar, rail, lesson: L.slug, ui, runtime, localeRoot: loc.root,
        nav: [{ href: url('overview/'), label: ui.navOverview }],
      }));
      pages++;
    });

    /* --- 术语表 --- */
    {
      const sitePath = 'glossary/';
      const { base, url, alt } = G(sitePath);
      const body = renderGlossary({ groups: glossary.groups, lang: loc.code, ui, url });
      writeOut(path.join(DIST, loc.root, 'glossary', 'index.html'), renderShell({
        lang: loc.lang, locale: loc.code, base, url, alt,
        title: `${ui.glossaryTitle}${ui.titleSep}${ui.siteName}`,
        description: ui.glossaryLead,
        altHref: alt, body, ui, runtime, localeRoot: loc.root,
        nav: [{ href: url('overview/'), label: ui.navOverview }],
        back: { href: url('overview/'), label: ui.navOverview },
      }));
      pages++;
    }
  }

  /* ---------- 6. 全景附属文件 */
  write(path.join(DIST, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${SITE_URL}sitemap.xml\n`);

  // GitHub Pages 默认走 Jekyll；.nojekyll 关掉它，避免下划线开头的文件被忽略
  write(path.join(DIST, '.nojekyll'), '');

  // 404：用站点根路径前缀拼绝对链接（404 会在任意深度被命中，相对路径不可靠）
  const basePath = new URL(SITE_URL).pathname;
  writeOut(path.join(DIST, '404.html'), `<!doctype html>
<html lang="zh-CN">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>页面不存在 · 可视化导论</title>
<link rel="stylesheet" href="${basePath}assets/site.css"></head>
<body style="display:grid;place-items:center;min-height:100vh">
<main style="text-align:center;padding:32px;max-width:560px">
  <p style="font-size:52px;margin:0 0 8px">🧭</p>
  <h1 style="font-size:26px;margin:0 0 12px">这个页面不存在</h1>
  <p style="color:var(--text-2);margin:0 0 24px">The page you were looking for is not here.</p>
  <p style="margin:0;display:flex;gap:12px;justify-content:center;flex-wrap:wrap">
    <a class="tag" style="padding:8px 16px" href="${basePath}">返回课程首页</a>
    <a class="tag" style="padding:8px 16px" href="${basePath}en/">English home</a>
  </p>
</main>
</body></html>`);

  const urls = [];
  LOCALES.forEach((loc) => {
    urls.push(`${SITE_URL}${loc.root}`);
    lessons.forEach((L) => urls.push(`${SITE_URL}${loc.root}${L.slug}/`));
    urls.push(`${SITE_URL}${loc.root}overview/`);
    urls.push(`${SITE_URL}${loc.root}glossary/`);
  });
  write(path.join(DIST, 'sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${u}</loc></url>`).join('\n')}\n</urlset>\n`);

  /* ---------- 7. 统计 */
  const files = [];
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p); else files.push({ p, size: fs.statSync(p).size });
    }
  })(DIST);
  const total = files.reduce((a, f) => a + f.size, 0);
  const biggest = files.sort((a, b) => b.size - a.size).slice(0, 8);
  const report = {
    pages, files: files.length, totalBytes: total,
    cssBytes: files.filter((f) => f.p.endsWith('site.css')).reduce((a, f) => a + f.size, 0),
    biggest: biggest.map((f) => ({ file: path.relative(DIST, f.p).replace(/\\/g, '/'), kb: +(f.size / 1024).toFixed(1) })),
  };
  write(path.join(ROOT, 'tools', 'report', 'build-report.json'), `${JSON.stringify(report, null, 2)}\n`);

  console.log(`✓ 生成 ${pages} 个页面，共 ${files.length} 个文件，${(total / 1024 / 1024).toFixed(2)} MB`);
  console.log(`  样式合并后：${(report.cssBytes / 1024).toFixed(1)} KB`);
  console.log('  体积最大的文件：');
  report.biggest.forEach((f) => console.log(`    ${String(f.kb).padStart(7)} KB  ${f.file}`));
}

main();
