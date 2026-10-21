/**
 * verify-content.mjs —— 零内容损失门禁
 *
 * 做法：对每一小节，分别从「旧站 DOM」和「新内容层」抽取**同一口径的文本块多重集**，
 *       逐小节比对。集合不等即判定内容丢失/篡改，直接以非零码退出，阻断构建。
 *
 * 这比统计字数更强：字数相同也可能张冠李戴，集合相等则是逐块可追溯的。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseHTML } from 'linkedom';
import { stripNoise, classify, textOf, langOf } from './migrate.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const LEGACY = path.join(ROOT, 'legacy');
const CONTENT = path.join(ROOT, 'content');
const REPORT = path.join(ROOT, 'tools', 'report');

const LESSONS = ['lesson-01', 'lesson-02', 'lesson-03', 'lesson-04', 'lesson-05'];
const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();

/** 从旧站小节 DOM 抽取块多重集（lang: 'zh' | 'en'） */
function legacyBlocks(section, lang) {
  const wanted = lang === 'en' ? 'en-US' : 'zh-CN';
  const out = [];
  section.querySelectorAll('.tab-panel').forEach((panel) => {
    Array.from(panel.children).forEach((el) => {
      const type = classify(el);
      if (type === 'skip' || type === 'other') return;
      if (type === 'demo') { out.push(`demo::${el.getAttribute('data-demo') || (el.getAttribute('id') || '').replace(/^demo-mount-/, '')}`); return; }
      if (type === 'code') { out.push(`code::${norm(textOf((el.querySelector('code') || el).innerHTML))}`); return; }
      if (type === 'list') {
        Array.from(el.children).forEach((li) => {
          if ((li.tagName || '').toLowerCase() !== 'li') return;
          const l = langOf(li);
          if (l === wanted) out.push(`li::${norm(textOf(li.innerHTML))}`);
        });
        return;
      }
      if (type === 'figure') {
        if (langOf(el) !== wanted) return;                 // 裸 <img> 无 data-lang，不参与文本比对
        const cap = el.querySelector('figcaption');
        const text = norm(textOf(cap ? cap.innerHTML : ''));
        if (text) out.push(`figure::${text}`);             // 无图注的插图由结构计数与 src 比对负责
        return;
      }
      if (langOf(el) !== wanted) return;
      out.push(`${type}::${norm(textOf(el.innerHTML))}`);
    });
  });
  return out;
}

/** 从新内容层抽取同口径块多重集 */
function contentBlocks(section, lang) {
  const out = [];
  ['explain', 'code', 'demo'].forEach((tab) => {
    (section.tabs[tab] || []).forEach((b) => {
      if (b.type === 'demo') { out.push(`demo::${b.ref}`); return; }
      if (b.type === 'code') { out.push(`code::${norm(b.text)}`); return; }
      if (b.type === 'list') {
        (lang === 'en' ? (b.en || []) : (b.zh || [])).forEach((item) => out.push(`li::${norm(textOf(item))}`));
        return;
      }
      if (b.type === 'figure') {
        const text = norm(textOf((b.caption && (b.caption[lang] || b.caption.zh)) || ''));
        if (text) out.push(`figure::${text}`);
        return;
      }
      const val = lang === 'en' ? b.en : b.zh;
      if (!val) return;
      out.push(`${b.type}::${norm(textOf(val))}`);
    });
  });
  return out;
}

const tally = (arr) => arr.reduce((m, k) => m.set(k, (m.get(k) || 0) + 1), new Map());

/** 语言中立的插图（裸 <img>，无中英对照），旧站只计一份，故比对时也要扣除 */
const countNeutralFig = (cs) =>
  ['explain', 'code', 'demo']
    .flatMap((t) => cs.tabs[t] || [])
    .filter((b) => b.type === 'figure' && b.neutral).length;

function diff(a, b) {
  const ta = tally(a), tb = tally(b);
  const missing = [], extra = [];
  for (const [k, n] of ta) if ((tb.get(k) || 0) < n) missing.push(k);
  for (const [k, n] of tb) if ((ta.get(k) || 0) < n) extra.push(k);
  return { missing, extra };
}

function main() {
  const problems = [];
  const rows = [];
  let totalBlocks = 0;

  for (const lesson of LESSONS) {
    const legacyFile = path.join(LEGACY, lesson, 'index.html');
    const contentFile = path.join(CONTENT, `${lesson}.json`);
    if (!fs.existsSync(legacyFile) || !fs.existsSync(contentFile)) {
      problems.push(`${lesson}: 缺少 legacy 或 content`);
      continue;
    }
    const { document: doc } = parseHTML(fs.readFileSync(legacyFile, 'utf8'));
    stripNoise(doc);
    const legacySections = Array.from(doc.querySelectorAll('article.chapter'));
    const content = JSON.parse(fs.readFileSync(contentFile, 'utf8'));

    // 小节数一致
    if (legacySections.length !== content.sections.length) {
      problems.push(`${lesson}: 小节数 ${legacySections.length} → ${content.sections.length}`);
    }

    legacySections.forEach((sec, idx) => {
      const id = sec.getAttribute('id');
      const cs = content.sections[idx];
      if (!cs) { problems.push(`${lesson} ${id}: 新内容缺该小节`); return; }

      ['zh', 'en'].forEach((lang) => {
        const a = legacyBlocks(sec, lang);
        const b = contentBlocks(cs, lang);
        totalBlocks += a.length;
        const { missing, extra } = diff(a, b);
        if (missing.length || extra.length) {
          problems.push(
            `${lesson} ${id} [${lang}] 丢失 ${missing.length} / 新增 ${extra.length}` +
            (missing.length ? `\n      例: ${missing.slice(0, 2).map((s) => s.slice(0, 90)).join('\n          ')}` : '') +
            (extra.length ? `\n      多: ${extra.slice(0, 2).map((s) => s.slice(0, 90)).join('\n          ')}` : '')
          );
        }
      });

      // 结构化计数（代码块 / 演示）逐小节精确比对；代码块可能出现在 explain 或 code tab
      const codeLegacy = sec.querySelectorAll('pre').length;
      const codeNew = ['explain', 'code', 'demo']
        .flatMap((t) => cs.tabs[t] || []).filter((b) => b.type === 'code').length;
      if (codeLegacy !== codeNew) problems.push(`${lesson} ${id}: 代码块 ${codeLegacy} → ${codeNew}`);

      const demoLegacy = Array.from(sec.querySelectorAll('div')).filter((d) => {
        const did = d.getAttribute('id') || '';
        return d.getAttribute('data-demo') || did.startsWith('demo-mount');
      }).length;
      const demoNew = ['explain', 'code', 'demo']
        .flatMap((t) => cs.tabs[t] || []).filter((b) => b.type === 'demo').length;
      if (demoLegacy !== demoNew) problems.push(`${lesson} ${id}: 演示 ${demoLegacy} → ${demoNew}`);

      /*
       * 独立结构计数：直接数旧 DOM 的元素，不经过 classify()。
       * 这一层是必需的 —— 之前 figure 被 classify() 归为 other 而双方一起跳过，
       * 文本比对因此「一致通过」，5 张插图却被静默丢掉。同类盲区必须由不依赖
       * 分类器的计数来兜住。
       *
       * 口径说明：
       *  - 列表要连 <ol> 一起数（旧站两种都用），并扣除嵌套列表 —— 嵌套列表随父
       *    <li> 的 innerHTML 一并保留，不会再单独成为一个块；
       *  - <table>、<figure> 在旧站中英各一份，故新侧块数需 ×2；
       *  - 插图额外做「逐张引用比对」，避免计数相等但图片来源被换掉。
       */
      const allNew = ['explain', 'code', 'demo'].flatMap((t) => cs.tabs[t] || []);
      const countType = (ty) => allNew.filter((b) => b.type === ty).length;

      const listLegacy = sec.querySelectorAll('ul, ol').length
        - sec.querySelectorAll('ul ul, ul ol, ol ul, ol ol').length;
      if (listLegacy !== countType('list')) {
        problems.push(`${lesson} ${id}: 列表 旧 ${listLegacy} → 新 ${countType('list')}`);
      }
      const structural = [
        ['table', sec.querySelectorAll('table').length, countType('table'), 2],
        ['figure', sec.querySelectorAll('figure').length, countType('figure') - countNeutralFig(cs), 2],
      ];
      structural.forEach(([name, legacyN, newN, factor]) => {
        if (legacyN !== newN * factor) {
          problems.push(`${lesson} ${id}: <${name}> 旧 ${legacyN} → 新 ${newN * factor}`);
        }
      });

      // 插图逐张比对：旧站引用的每个文件名都必须出现在新内容里
      const newHtml = allNew.map((b) => JSON.stringify(b)).join(' ');
      sec.querySelectorAll('img').forEach((im) => {
        const src = im.getAttribute('src') || '';
        const stem = src.split('/').pop().replace(/\.(png|jpe?g|gif)$/i, '');
        if (stem && !newHtml.includes(stem)) {
          problems.push(`${lesson} ${id}: 插图丢失 ${src}`);
        }
      });

      rows.push({ lesson, id, zh: legacyBlocks(sec, 'zh').length, en: legacyBlocks(sec, 'en').length });
    });

    // 未配对项必须为 0
    content.sections.forEach((s) => {
      if (s.unpaired && s.unpaired.length) problems.push(`${lesson} ${s.id}: ${s.unpaired.length} 个未配对块`);
    });
  }

  fs.mkdirSync(REPORT, { recursive: true });
  const summary = {
    ok: problems.length === 0,
    checkedSections: rows.length,
    checkedBlocks: totalBlocks,
    problems,
  };
  fs.writeFileSync(path.join(REPORT, 'verify-report.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');

  console.log(`校验小节：${rows.length}，比对内容块：${totalBlocks}`);
  if (problems.length) {
    console.error(`\n✗ 内容校验未通过（${problems.length} 项）：`);
    problems.slice(0, 20).forEach((p) => console.error('  - ' + p));
    if (problems.length > 20) console.error(`  …另有 ${problems.length - 20} 项`);
    process.exit(1);
  }
  console.log('✓ 内容校验通过：逐小节中英文块集合完全一致，零内容损失。');
}

main();
