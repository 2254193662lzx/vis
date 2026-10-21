/**
 * migrate.mjs —— 内容迁移脚本
 *
 * 输入：legacy/lesson-0N/index.html（旧站原页，只读）
 * 输出：content/lesson-0N.json （双语同源的内容层）
 *       content/index.json    （章节/小节索引，供导航与知识地图使用）
 *       tools/report/migration-report.json（迁移报告：基线计数 + 未配对项）
 *
 * 设计要点
 *  - 旧站用「data-lang 双节点」表达双语：zh-CN 节点后紧跟同 tag 的 en-US 节点。
 *    本脚本按此规则配对，配对失败不静默丢弃，一律写入报告。
 *  - 代码块 pre 不带 data-lang（语言中立），只存一份；其 span 内的语法着色标记
 *    （cmt/str/kw/num/fn/op/star）原样保留，构建期直接沿用，无需引入高亮器。
 *  - 所有 data-page-node-id 编辑噪声在执行期清除。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseHTML } from 'linkedom';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const LEGACY = path.join(ROOT, 'legacy');
const CONTENT = path.join(ROOT, 'content');
const REPORT = path.join(ROOT, 'tools', 'report');

const LESSONS = ['lesson-01', 'lesson-02', 'lesson-03', 'lesson-04', 'lesson-05'];

// ---------------------------------------------------------------- i18n 字典
/**
 * 从旧站 i18n.js 中取出两套翻译字典（用于反解 h2 标题的英文）。
 * 旧文件是 ES module，直接 import 会触碰 document，故按花括号配对截取对象字面量后求值。
 */
function loadI18nDict(file) {
  if (!fs.existsSync(file)) return {};
  const src = fs.readFileSync(file, 'utf8');
  const anchor = src.indexOf('const I18N');
  if (anchor < 0) return {};
  const braceStart = src.indexOf('{', anchor);
  if (braceStart < 0) return {};

  let depth = 0;
  let i = braceStart;
  let quote = null;
  for (; i < src.length; i++) {
    const c = src[i];
    const next = src[i + 1];
    if (quote) {
      if (c === '\\') i++;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === '/' && next === '/') {          // 行注释（对象内确有注释）
      while (i < src.length && src[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && next === '*') {          // 块注释
      i += 2;
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++;
      i++;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) break; }
  }
  try {
    return new Function(`return ${src.slice(braceStart, i + 1)}`)();
  } catch (err) {
    console.warn(`  ! i18n 字典解析失败：${err.message}`);
    return {};
  }
}

// -------------------------------------------------------------------- 工具
const clean = (html) =>
  String(html || '')
    .replace(/<[^>]*\sdata-page-node-id="[^"]*"[^>]*>/g, (m) =>
      m.replace(/\sdata-page-node-id="[^"]*"/g, ''))
    .replace(/\s*\n\s*/g, ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();

const cleanCode = (html) =>
  String(html || '')
    .replace(/\sdata-page-node-id="[^"]*"/g, '')
    .replace(/^\s*\n/, '')
    .replace(/\s+$/, '');

const textOf = (html) => String(html || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

const langOf = (el) => el && el.getAttribute('data-lang');

/** 剥离元素及其子树的编辑噪声属性 */
function stripNoise(doc) {
  doc.querySelectorAll('[data-page-node-id]').forEach((el) => {
    el.removeAttribute('data-page-node-id');
  });
}

function classify(el) {
  const tag = el.tagName ? el.tagName.toLowerCase() : '';
  const cls = el.getAttribute('class') || '';
  if (cls.includes('chapter-subtitle')) return 'skip';
  if (tag === 'h3') return 'h3';
  if (tag === 'p') {
    if (cls.includes('key-point')) return 'keypoint';
    if (cls.includes('note')) return 'note';
    if (cls.includes('code-purpose')) return 'purpose';
    if (cls.includes('demo-hint')) return 'demohint';
    return 'p';
  }
  if (tag === 'ul' || tag === 'ol') return 'list';
  if (tag === 'table') return 'table';
  if (tag === 'pre') return 'code';
  if (tag === 'figure' || tag === 'img') return 'figure';
  if (tag === 'div') {
    const id = el.getAttribute('id') || '';
    if (el.getAttribute('data-demo') || id.startsWith('demo-mount')) return 'demo';
  }
  return 'other';
}

/**
 * 插图：两种来源——
 *  1) <figure class="theory-figure" data-lang> 内含 <img> + <figcaption>（中英成对，如 Ch.2 的 5 张示意图）；
 *  2) 面板下的裸 <img>（无 data-lang，语言中立，如 Ch.1 的 join.png）。
 * 统一归到 img/ 下，便于构建期一次性校验资源是否存在。
 */
function makeFigure(el, enEl) {
  const isImg = el.tagName && el.tagName.toLowerCase() === 'img';
  const img = isImg ? el : el.querySelector('img');
  const src = (img ? img.getAttribute('src') : '') || '';
  const alt = (img ? img.getAttribute('alt') : '') || '';
  const cap = isImg ? null : el.querySelector('figcaption');
  const capEn = enEl ? enEl.querySelector('figcaption') : null;
  const altEn = enEl && enEl.querySelector('img') ? enEl.querySelector('img').getAttribute('alt') : '';
  const base = path.basename(src) || 'unnamed';
  return {
    type: 'figure',
    src: `img/${base}`,
    alt: { zh: alt, en: altEn || alt },
    caption: { zh: cap ? textOf(cap.innerHTML) : '', en: capEn ? textOf(capEn.innerHTML) : '' },
    neutral: isImg,           // 语言中立：中英共用同一张图
  };
}

/** 代码块：保留着色 span，记录 ⭐ 关键行号，另存纯文本供搜索与保真校验 */
function makeCode(el) {
  const codeEl = el.querySelector('code');
  const html = cleanCode((codeEl || el).innerHTML);
  const astext = textOf(html);
  const stars = [];
  // ⭐ 标记所在的逻辑行号（按纯文本行计）
  const withMarkers = html.replace(/<span class="star">[^<]*<\/span>/g, '\u0001');
  const lines = textOf(withMarkers.replace(/\u0001/g, ' *STAR* ')).split(/\n/);
  const rawLines = String(html)
    .replace(/<span class="star">[^<]*<\/span>/g, ' *STAR* ')
    .replace(/<[^>]*>/g, '')
    .split('\n');
  rawLines.forEach((ln, idx) => {
    if (ln.includes('*STAR*')) stars.push(idx + 1);
  });
  void lines;
  const lang = /^\s*(\/\/|#)/.test(String(html).replace(/<[^>]*>/g, '')) || /[;{]/.test(astext) ? 'js' : 'text';
  return { type: 'code', lang, html, text: astext, stars };
}

/** 双语列表：<ul> 内 zh/en 的 <li> 交替出现，按语言归组 */
function makeList(el) {
  const items = Array.from(el.children).filter((c) => c.tagName && c.tagName.toLowerCase() === 'li');
  const hasLang = items.some((li) => langOf(li));
  if (!hasLang) {
    return { type: 'list', zh: items.map((li) => clean(li.innerHTML)), en: [] };
  }
  const zh = [];
  const en = [];
  items.forEach((li) => {
    const l = langOf(li);
    if (l === 'en-US') en.push(clean(li.innerHTML));
    else zh.push(clean(li.innerHTML));
  });
  return { type: 'list', zh, en };
}

// ------------------------------------------------------------ 小节内容抽取
function extractSection(section, dict) {
  const id = section.getAttribute('id') || '';
  const h2 = section.querySelector('h2');
  const rawTitle = textOf(h2 ? h2.innerHTML : '');
  const key = h2 ? h2.getAttribute('data-i18n') : null;
  const rawTitleEn = key && dict[key] ? dict[key] : rawTitle;
  const m = rawTitle.match(/^(\d+\.\d+)\s*(.*)$/);
  const num = m ? m[1] : '';
  // 中英标题都剥掉 "1.2 " 前缀，只留名称
  const nameZh = (m ? m[2] : rawTitle).trim();
  const nameEn = (rawTitleEn.match(/^(\d+\.\d+)\s*(.*)$/) || [, , rawTitleEn])[2].trim();

  // 副标题：data-lang 成对
  let subtitle = { zh: '', en: '' };
  const subs = Array.from(section.children).filter(
    (c) => (c.getAttribute && (c.getAttribute('class') || '').includes('chapter-subtitle'))
  );
  subs.forEach((s) => {
    if (langOf(s) === 'en-US') subtitle.en = textOf(s.innerHTML);
    else subtitle.zh ||= textOf(s.innerHTML);
  });

  const tabs = { explain: [], code: [], demo: [] };
  const unpaired = [];

  Array.from(section.querySelectorAll('.tab-panel')).forEach((panel) => {
    const tab = panel.getAttribute('data-panel');
    if (!tabs[tab]) return;
    const kids = Array.from(panel.children);
    for (let i = 0; i < kids.length; i++) {
      const el = kids[i];
      const type = classify(el);
      if (type === 'skip' || type === 'other') continue;
      if (langOf(el) === 'en-US') continue; // 已随 zh 节点消费

      if (type === 'code') { tabs[tab].push(makeCode(el)); continue; }
      if (type === 'demo') {
        const ref = el.getAttribute('data-demo')
          || (el.getAttribute('id') || '').replace(/^demo-mount-/, '');
        tabs[tab].push({ type: 'demo', ref });
        continue;
      }
      if (type === 'list') { tabs[tab].push(makeList(el)); continue; }

      const isZh = langOf(el) === 'zh-CN' || !langOf(el);
      if (isZh) {
        const sib = el.nextElementSibling;
        const paired = sib
          && langOf(sib) === 'en-US'
          && sib.tagName
          && sib.tagName.toLowerCase() === el.tagName.toLowerCase();
        if (type === 'figure') {
          const neutral = el.tagName.toLowerCase() === 'img';   // 裸 img：中英共用，无需配对
          if (!neutral && paired) i++;
          tabs[tab].push(makeFigure(el, paired ? sib : null));
          if (!neutral && !paired) unpaired.push({ chapter: id, tab, type, text: 'figure 缺英文对照' });
          continue;
        }
        let en = '';
        if (paired) { en = clean(sib.innerHTML); i++; }
        else unpaired.push({ chapter: id, tab, type, text: textOf(el.innerHTML).slice(0, 60) });
        tabs[tab].push({ type, zh: clean(el.innerHTML), en });
      } else {
        // 只有英文、没有中文的孤块
        if (type === 'figure') {
          tabs[tab].push(makeFigure(el, null));
        } else {
          tabs[tab].push({ type, zh: '', en: clean(el.innerHTML) });
        }
        unpaired.push({ chapter: id, tab, type, text: textOf(el.innerHTML).slice(0, 60), alone: 'en' });
      }
    }
  });

  return {
    id,
    num,
    slug: num ? num.replace('.', '-') : id,
    title: { zh: nameZh, en: nameEn },
    subtitle,
    tabs,
    unpaired,
  };
}

// ------------------------------------------------------------------ 基线
function baseline(doc) {
  const zhNodes = doc.querySelectorAll('[data-lang="zh-CN"]').length;
  const enNodes = doc.querySelectorAll('[data-lang="en-US"]').length;
  const li = doc.querySelectorAll('article.chapter li[data-lang="zh-CN"]').length;
  const tables = doc.querySelectorAll('article.chapter table').length;
  const pre = doc.querySelectorAll('article.chapter pre').length;
  let demos = 0;
  doc.querySelectorAll('article.chapter div').forEach((d) => {
    const id = d.getAttribute('id') || '';
    if (d.getAttribute('data-demo') || id.startsWith('demo-mount')) demos++;
  });
  const zhChars = doc
    .querySelectorAll('[data-lang="zh-CN"]')
    .map((el) => (el.textContent || '').replace(/\s/g, '').length)
    .reduce((a, b) => a + b, 0);
  const enWords = doc
    .querySelectorAll('[data-lang="en-US"]')
    .map((el) => (el.textContent || '').trim().split(/\s+/).filter(Boolean).length)
    .reduce((a, b) => a + b, 0);
  return { zhNodes, enNodes, li, tables, pre, demos, zhChars, enWords };
}

// -------------------------------------------------------------------- 主流程
export { loadI18nDict, stripNoise, classify, textOf, clean, cleanCode, langOf };

function main() {
  if (!fs.existsSync(LEGACY)) {
    console.error('找不到 legacy/，请先放入旧站源码。');
    process.exit(1);
  }
  fs.mkdirSync(CONTENT, { recursive: true });
  fs.mkdirSync(REPORT, { recursive: true });

  const dict = loadI18nDict(path.join(LEGACY, 'i18n.js'));
  const enDict = dict['en-US'] || {};
  const zhDict = dict['zh-CN'] || {};
  console.log(`i18n 字典载入：zh ${Object.keys(zhDict).length} 键 / en ${Object.keys(enDict).length} 键`);

  const index = { chapters: [] };
  const report = { lessons: [], totals: {} };
  const totals = { sections: 0, blocks: 0, code: 0, demos: 0, tables: 0, lists: 0, unpaired: 0 };

  for (const lesson of LESSONS) {
    const file = path.join(LEGACY, lesson, 'index.html');
    if (!fs.existsSync(file)) { console.warn(`跳过缺失的 ${lesson}`); continue; }
    const html = fs.readFileSync(file, 'utf8');
    const { document: doc } = parseHTML(html);
    stripNoise(doc);

    const h1 = doc.querySelector('h1');
    const titleZh = textOf(h1 ? h1.innerHTML : lesson);
    const numMatch = titleZh.match(/第\s*(\d+)\s*章\s*(.*)$/);
    const num = numMatch ? Number(numMatch[1]) : 0;
    const titleEn = /^Ch(apter)?\s*\d+\s*·\s*/.test(String(enDict[`nav.ch${num}`] || ''))
      ? String(enDict[`nav.ch${num}`]).replace(/^Ch(apter)?\s*\d+\s*·\s*/, '')
      : titleZh;

    const sections = Array.from(doc.querySelectorAll('article.chapter'))
      .map((s) => extractSection(s, enDict));

    const base = baseline(doc);
    let blocks = 0, code = 0, demos = 0, tables = 0, lists = 0, unpairedCount = 0;
    sections.forEach((s) => {
      unpairedCount += s.unpaired.length;
      ['explain', 'code', 'demo'].forEach((tab) => {
        s.tabs[tab].forEach((b) => {
          blocks++;
          if (b.type === 'code') code++;
          if (b.type === 'demo') demos++;
          if (b.type === 'table') tables++;
          if (b.type === 'list') lists++;
        });
      });
    });

    const out = {
      num,
      slug: lesson,
      title: { zh: titleZh.replace(/^第\s*\d+\s*章\s*/, ''), en: titleEn },
      rawTitle: { zh: titleZh, en: enDict[`nav.ch${num}`] || titleZh },
      sections,
    };
    fs.writeFileSync(path.join(CONTENT, `${lesson}.json`), `${JSON.stringify(out, null, 2)}\n`, 'utf8');

    index.chapters.push({
      num,
      slug: lesson,
      title: out.title,
      sectionCount: sections.length,
      sections: sections.map((s) => ({ id: s.id, num: s.num, slug: s.slug, title: s.title })),
    });

    report.lessons.push({ lesson, num, baseline: base, extracted: { sections: sections.length, blocks, code, demos, tables, lists, unpaired: unpairedCount }, sections: sections.map((s) => ({ id: s.id, blocks: s.tabs.explain.length + s.tabs.code.length + s.tabs.demo.length, unpaired: s.unpaired })) });

    Object.assign(totals, {
      sections: totals.sections + sections.length,
      blocks: totals.blocks + blocks,
      code: totals.code + code,
      demos: totals.demos + demos,
      tables: totals.tables + tables,
      lists: totals.lists + lists,
      unpaired: totals.unpaired + unpairedCount,
    });

    console.log(
      `  ${lesson}: ${sections.length} 小节 / ${blocks} 块 ` +
      `(代码 ${code}, 演示 ${demos}, 表格 ${tables}, 列表 ${lists}) ` +
      `未配对 ${unpairedCount}`
    );
  }

  report.totals = totals;
  fs.writeFileSync(path.join(CONTENT, 'index.json'), `${JSON.stringify(index, null, 2)}\n`, 'utf8');
  fs.writeFileSync(path.join(REPORT, 'migration-report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  console.log('\n合计：', totals);
  console.log('报告：tools/report/migration-report.json');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
