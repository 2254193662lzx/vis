/**
 * migrate-demos.mjs —— 演示抽取与统一契约适配
 *
 * 旧站把演示渲染函数内嵌在每章的 lesson.js 里（window/DEMOS 注册 + 大量为旧
 * shell 服务的导航逻辑混在一起），且 demo id 跨章重名（lesson-01 与 lesson-03
 * 都有 d-3-1）。本脚本：
 *   1) 从 lesson.js 中剥离旧 shell 逻辑，只保留 DEMOS 注册；
 *   2) 统一导出契约 export default DEMOS，d3 改为外壳提供的全局（去掉 CDN 依赖）；
 *   3) 数据路径改为运行时 __data() 解析，实现数据文件去重；
 *   4) 生成 content/demos.json 注册表（含命名空间 <lesson>/<demoId>）；
 *   5) 汇总演示用到的 CSS 类名，供外壳样式覆盖。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const LEGACY = path.join(ROOT, 'legacy');
const DEMOS = path.join(ROOT, 'demos');
const CONTENT = path.join(ROOT, 'content');
const REPORT = path.join(ROOT, 'tools', 'report');
const PUBLIC_DATA = path.join(ROOT, 'public', 'data');

const LESSONS = ['lesson-01', 'lesson-02', 'lesson-03', 'lesson-04', 'lesson-05'];

const DATA_MAP = {
  'newstudent.csv': 'lesson-01/data/newstudent.csv',
  'crime.csv': 'lesson-03/data/crime.csv',
  'french_names.json': 'lesson-05/data/french_names.json',
  'weather_2024.csv': 'lesson-05/data/weather_2024.csv',
};

function main() {
  fs.mkdirSync(DEMOS, { recursive: true });
  fs.mkdirSync(PUBLIC_DATA, { recursive: true });
  fs.mkdirSync(REPORT, { recursive: true });

  const registry = {};
  const classUsage = new Map();
  const dataUsed = new Set();

  for (const lesson of LESSONS) {
    const src = path.join(LEGACY, lesson, 'lesson.js');
    if (!fs.existsSync(src)) continue;
    let code = fs.readFileSync(src, 'utf8');

    // 1) 剥离旧 shell：从 __resolveDemoName 到 DEMOS 定义之前
    const cutStart = code.indexOf('function __resolveDemoName');
    const cutEnd = code.indexOf('const DEMOS');
    if (cutStart >= 0 && cutEnd > cutStart) {
      code = code.slice(0, code.lastIndexOf('// ===', cutStart) >= 0 ? code.lastIndexOf('// ===', cutStart) : cutStart)
           + code.slice(cutEnd);
    }

    // 2) 去掉 CDN d3 导入（改为外壳注入的全局 d3）
    code = code.replace(/^\s*import\s+\*\s+as\s+d3\s+from\s+["'][^"']+["'];?\s*$/gm, '');

    // 3) 数据路径 → __data()，并登记用到的数据文件
    code = code.replace(/(["'])\.\/data\/([^"']+)\1/g, (m, q, name) => {
      dataUsed.add(name);
      return `__data(${q}${name}${q})`;
    });
    // 提示文案里残留的 ./data/ 前缀已与新的数据位置不符，去掉以免误导
    code = code.replace(/\.\/data\/([\w.-]+)/g, '$1');

    // 4) 收集演示里出现的 CSS 类名（用于外壳样式覆盖）
    code.replace(/class="([^"]+)"/g, (m, list) => {
      list.split(/\s+/).filter(Boolean).forEach((c) => classUsage.set(c, (classUsage.get(c) || 0) + 1));
      return m;
    });

    // 5) 收集 demo id
    const ids = [...new Set([...code.matchAll(/DEMOS\["([^"]+)"\]/g)].map((m) => m[1]))];
    ids.forEach((id) => { registry[`${lesson}/${id}`] = `demos/${lesson}.js`; });

    const header = `/**
 * ${lesson} 的演示模块（由 legacy/${lesson}/lesson.js 迁移）
 *
 * 契约：
 *   - 外壳先加载 d3 全局并设置 globalThis.__SITE__（base/data/locale），
 *     再动态 import 本模块，取 DEMOS[demoId](mountEl, ctx) 调用；
 *   - 数据一律经 __data(name) 解析，实现数据文件全站去重。
 */

const __data = (name) => (((globalThis.__SITE__ && globalThis.__SITE__.data) || '/data/') + name);

`;
    const footer = `\nexport default DEMOS;\n`;

    fs.writeFileSync(path.join(DEMOS, `${lesson}.js`), header + code.trimStart() + footer, 'utf8');
    console.log(`  ${lesson}.js → demos/${lesson}.js （${ids.length} 个演示：${ids.join(', ')}）`);
  }

  // 数据文件去重复制
  for (const [name, rel] of Object.entries(DATA_MAP)) {
    const from = path.join(LEGACY, rel);
    if (!fs.existsSync(from)) { console.warn(`  ! 缺数据文件 ${rel}`); continue; }
    fs.copyFileSync(from, path.join(PUBLIC_DATA, name));
    console.log(`  数据去重：${rel} → public/data/${name}`);
  }

  fs.writeFileSync(path.join(CONTENT, 'demos.json'), `${JSON.stringify(registry, null, 2)}\n`, 'utf8');
  fs.writeFileSync(
    path.join(REPORT, 'demo-classes.json'),
    `${JSON.stringify([...classUsage.entries()].sort((a, b) => b[1] - a[1]), null, 2)}\n`,
    'utf8'
  );
  console.log(`\n演示注册表：${Object.keys(registry).length} 项 → content/demos.json`);
  console.log(`数据文件：${dataUsed.size} 个被引用 → public/data/`);
  console.log(`演示使用的 CSS 类：${classUsage.size} 个 → tools/report/demo-classes.json`);
}

main();
