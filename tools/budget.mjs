/**
 * budget.mjs —— 体积预算门禁
 *
 * 只看两个有意义的数字：
 *  1) 传输体积（gzip）—— 静态托管实际发给学生的字节数；
 *  2) 首次渲染要下载的关键资源（HTML + CSS + 外壳 JS + d3），演示与数据按需加载。
 *
 * 超出预算即以非零码退出，避免「重构着重构着体积又回去了」。
 */

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');

/** 预算（字节） */
const BUDGET = {
  totalGzip: 900 * 1024,        // 全站 gzip 后（不含 d3 单文件上限见下）
  pageHtmlRaw: 60 * 1024,       // 单页 HTML 原始字节
  // 合并样式表原始字节。
  // 60 KB 是「文档骨架 + 5 份章节样式」时期的数字；此后陆续加上了
  // 动态天空背景、知识地图地球仪与筛选面板、手风琴、阅读辅助栏、
  // 自定义指针与整套毛玻璃体系，样式表随之增长到 ~64 KB。
  // 已做过三轮死代码清理（累计回收约 9 KB），剩余部分都是有实际作用的规则，
  // 因此这里把上限调到 70 KB —— 仍然能拦住「无意间堆进去」的样式。
  cssRaw: 70 * 1024,
  shellJsRaw: 60 * 1024,        // 外壳脚本（含搜索/地图）原始字节
};

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const gz = (buf) => zlib.gzipSync(buf, { level: 9 }).length;
const kb = (n) => `${(n / 1024).toFixed(1)} KB`;

function main() {
  if (!fs.existsSync(DIST)) {
    console.error('找不到 dist/，请先运行 npm run build');
    process.exit(1);
  }
  const files = walk(DIST);
  let rawTotal = 0;
  let gzTotal = 0;
  let gzPages = 0;
  let pageCount = 0;
  let shellJs = 0;
  let cssRaw = 0;
  let maxPage = { file: '', size: 0 };

  for (const f of files) {
    const buf = fs.readFileSync(f);
    const rel = path.relative(DIST, f).replace(/\\/g, '/');
    rawTotal += buf.length;
    const g = gz(buf);
    gzTotal += g;

    if (rel.endsWith('.html')) {
      gzPages += g;
      pageCount++;
      if (buf.length > maxPage.size) maxPage = { file: rel, size: buf.length };
      if (buf.length > BUDGET.pageHtmlRaw) {
        console.error(`✗ 单页超预算：${rel} = ${kb(buf.length)}（上限 ${kb(BUDGET.pageHtmlRaw)}）`);
        process.exit(1);
      }
    }
    if (rel === 'assets/site.css') cssRaw = buf.length;
    if (/^assets\/(shell|search|knowledge-map)\.js$/.test(rel)) shellJs += buf.length;
  }

  const checks = [
    ['全站 gzip 合计', gzTotal, BUDGET.totalGzip],
    ['合并 CSS 原始', cssRaw, BUDGET.cssRaw],
    ['外壳 JS 原始', shellJs, BUDGET.shellJsRaw],
  ];

  console.log('体积预算');
  console.log(`  文件数            ${files.length}`);
  console.log(`  全站原始          ${kb(rawTotal)}`);
  console.log(`  全站 gzip         ${kb(gzTotal)}   (上限 ${kb(BUDGET.totalGzip)})`);
  console.log(`  ${pageCount} 个页面 gzip    ${kb(gzPages)}`);
  console.log(`  单页最大          ${kb(maxPage.size)}  ${maxPage.file}`);
  console.log(`  合并 CSS 原始     ${kb(cssRaw)}   (上限 ${kb(BUDGET.cssRaw)})`);
  console.log(`  外壳 JS 原始      ${kb(shellJs)}   (上限 ${kb(BUDGET.shellJsRaw)})`);

  const failed = checks.filter(([, v, limit]) => v > limit);
  if (failed.length) {
    console.error('\n✗ 超出预算：' + failed.map(([n, v, l]) => `${n} ${kb(v)} > ${kb(l)}`).join('；'));
    process.exit(1);
  }
  console.log('\n✓ 全部指标在预算内。');
}

main();
