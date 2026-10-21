/**
 * extract-demo-css.mjs —— 从旧站五份章节样式表中抽出「演示组件」相关规则
 *
 * 旧站把布局与演示组件样式混在五份复制粘贴的 styles.css 里。重构时布局由外壳重建，
 * 但演示组件的样式（console / demo-btn / color-cell / cvd-cell …）是真实资产，
 * 抽取复用比重新发明更忠实、也更省事。
 *
 * 输出：src/styles/demos.css
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const LEGACY = path.join(ROOT, 'legacy');
const OUT = path.join(ROOT, 'src', 'styles', 'demos.css');
const CLASSES = path.join(ROOT, 'tools', 'report', 'demo-classes.json');

const LESSONS = ['lesson-01', 'lesson-02', 'lesson-03', 'lesson-04', 'lesson-05'];

/** 把 CSS 拆成 {media, selector, body} 列表（处理一层 @media 嵌套） */
function parseRules(css) {
  const rules = [];
  const src = css.replace(/\/\*[\s\S]*?\*\//g, '');
  let i = 0;

  const readBlock = (start) => {
    // start 指向 '{'，返回 [内容, 结束索引]
    let depth = 0;
    let j = start;
    let quote = null;
    for (; j < src.length; j++) {
      const c = src[j];
      if (quote) { if (c === '\\') j++; else if (c === quote) quote = null; continue; }
      if (c === '"' || c === "'") { quote = c; continue; }
      if (c === '{') depth++;
      else if (c === '}') { depth--; if (depth === 0) return [src.slice(start + 1, j), j]; }
    }
    return [src.slice(start + 1), src.length];
  };

  while (i < src.length) {
    const open = src.indexOf('{', i);
    if (open < 0) break;
    const selector = src.slice(i, open).trim();
    const [body, end] = readBlock(open);
    if (/^@media/.test(selector)) {
      const inner = [];
      let k = 0;
      const innerSrc = body;
      while (k < innerSrc.length) {
        const o = innerSrc.indexOf('{', k);
        if (o < 0) break;
        const sel = innerSrc.slice(k, o).trim();
        let depth = 0, j = o, quote = null;
        for (; j < innerSrc.length; j++) {
          const c = innerSrc[j];
          if (quote) { if (c === '\\') j++; else if (c === quote) quote = null; continue; }
          if (c === '"' || c === "'") { quote = c; continue; }
          if (c === '{') depth++;
          else if (c === '}') { depth--; if (depth === 0) break; }
        }
        inner.push({ selector: sel, body: innerSrc.slice(o + 1, j) });
        k = j + 1;
      }
      inner.forEach((r) => rules.push({ media: selector, selector: r.selector, body: r.body }));
    } else if (selector) {
      rules.push({ media: null, selector, body });
    }
    i = end + 1;
  }
  return rules;
}

function main() {
  const demoClasses = new Set(
    JSON.parse(fs.readFileSync(CLASSES, 'utf8')).map(([name]) => name)
  );
  // 旧布局/页壳类：即使出现在演示样式里也一律不回迁（外壳重建）
  const shellClasses = new Set([
    'lesson-main', 'lesson-header', 'chapter-nav', 'chapter', 'tab-btn', 'tab-panel',
    'tab-panels', 'tabs', 'course-topbar', 'pager', 'back', 'chapter-subtitle',
    'lesson-footer', 'subtitle', 'header-tip', 'kbd',
  ]);

  const seen = new Map(); // selector(含 media) → body
  let scanned = 0, kept = 0;

  for (const lesson of LESSONS) {
    const file = path.join(LEGACY, lesson, 'styles.css');
    if (!fs.existsSync(file)) continue;
    const rules = parseRules(fs.readFileSync(file, 'utf8'));
    scanned += rules.length;
    for (const r of rules) {
      if (r.selector.startsWith('@')) continue;
      const mentioned = [...r.selector.matchAll(/\.([A-Za-z0-9_-]+)/g)].map((m) => m[1]);
      if (!mentioned.length) continue;
      const hitDemo = mentioned.some((c) => demoClasses.has(c) && !shellClasses.has(c));
      if (!hitDemo) continue;
      // 只回迁「不与外壳类混写」的纯演示规则，避免把旧页壳样式带回来
      if (mentioned.some((c) => shellClasses.has(c))) continue;
      const key = `${r.media || ''}|${r.selector}`;
      if (!seen.has(key)) { seen.set(key, r); kept++; }
    }
  }

  const groups = new Map();
  for (const r of seen.values()) {
    const key = r.media || '';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }

  let css = `/* ============================================================\n * demos.css —— 演示组件样式（自旧站五份 styles.css 抽取复用）\n *\n * 仅保留与「演示组件」相关的规则；旧页壳/布局规则由外壳重建，故不回迁。\n * 生成命令：node tools/extract-demo-css.mjs\n * ============================================================ */\n\n`;

  for (const [media, rules] of groups) {
    if (media) css += `${media} {\n`;
    for (const r of rules) {
      const body = r.body.trim().replace(/\s*\n\s*/g, '\n  ');
      css += `${media ? '  ' : ''}${r.selector} {\n${media ? '  ' : ''}  ${body}\n${media ? '  ' : ''}}\n`;
    }
    if (media) css += `}\n`;
    css += '\n';
  }

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, css, 'utf8');
  console.log(`扫描规则 ${scanned} 条 → 保留演示规则 ${kept} 条（去重后）`);
  console.log(`输出：src/styles/demos.css (${(css.length / 1024).toFixed(1)} KB)`);
}

main();
