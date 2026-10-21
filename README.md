# 《可视化导论》课程网站重构

对课程网站 <https://cinger007.github.io/vis/> 的重构：**迁移复用内容与演示，重建外壳、多语言层与构建管线**，并补上搜索、进度、术语表、知识地图等学习功能。

线上旧站的内容（5 章 / 27 小节 / 27 个交互演示 / 60 段关键代码 / 双语正文）全部保留，一行未少——这一点由构建期的**零内容损失门禁**机械校验，不靠人工核对。

---

## 快速开始

```bash
npm ci                 # 只装构建期依赖（产物零依赖）

node tools/migrate.mjs        # legacy/ 的旧站 HTML  →  content/ 双语同源内容层
node tools/migrate-demos.mjs  # 旧 lesson.js        →  demos/ 独立演示模块
node tools/verify-content.mjs # 零内容损失门禁（不通过即中断）
node tools/build.mjs          # content/ + src/     →  dist/ 双语静态站
node tools/budget.mjs         # 体积预算检查

node tools/serve.mjs 8899      # 本地预览 http://127.0.0.1:8899/
```

一行跑完全部：`npm run all`

> 本地预览必须走 HTTP：演示要 `fetch` 读取 `data/*.csv`，`file://` 下会被 CORS 拦掉。

---

## 目录结构

```
content/      内容层（唯一内容源，双语同文件）—— 由迁移脚本生成，可人工修订
  lesson-0N.json   一个小节 = 一组结构化块（讲解 / 代码 / 演示 三个 tab）
  glossary.json    术语表（跨章复用）
  overrides.json   编辑层：集中修正旧站遗留的内容问题，便于审计
demos/        27 个演示，每个导出 mount(el, ctx)，由外壳按需动态 import
src/
  templates/  页面模板（外壳 / 门户 / 章节页 / 术语表 / 内容块渲染）
  styles/     7 个样式源文件，构建期按顺序合并压缩为 site.css
  scripts/    运行时（外壳交互 / 搜索 / 知识地图）
tools/        迁移、校验、构建、预算、本地预览
legacy/       旧站只读副本（迁移输入，不参与构建产物）
public/       数据与插图（构建前一次性优化）
dist/         构建产物 —— 部署这一个目录
docs/         改动说明、部署指南、视频脚本
```

---

## 设计要点

**双语的实现方式**：旧站把两种语言都内联进每个页面，用 `data-lang` 成对节点 + `hidden` 隐藏其中一份，另有一套 283 键的 `i18n.js` 字典。现在改为**内容层双语同源、构建期展开为单语页面**：中文站部署在根目录（延续旧站 `/lesson-01/` 等 URL），英文站镜像到 `/en/`，语言切换就是一个普通链接。页面里只有一种语言，没有隐藏节点，也没有运行时字典。

**动效的边界**：华丽只留在家门与过道（门户、导航、切换），书桌保持安静。所有动画只动 `transform`/`opacity`，正文、表格、代码区域内零环境动效，禁止滚动劫持；提供「专注模式」一键关闭全部环境特效，并遵循 `prefers-reduced-motion`。无 JS 时页面完整可读。

**零依赖产出**：`dist/` 是纯静态 HTML/CSS/JS，D3 本地打包（不依赖 CDN，真正可离线/局域网使用），演示模块按需加载。

---

## 校验

| 工具 | 作用 |
|---|---|
| `tools/verify-content.mjs` | 逐小节比对旧站 DOM 与新内容层的**块集合**（含中英两侧），并独立计数 `<pre>`/`<ul>`/`<ol>`/`<table>`/`<figure>`/`<img>`/演示挂载点；插图逐张比对文件名。任一不符即非零退出 |
| `tools/budget.mjs` | 单页 HTML、合并 CSS、外壳 JS、全站 gzip 的预算门禁 |
| `tools/build.mjs`（内建） | 演示挂载点必须在注册表中存在；内容引用的插图必须存在 |

详见 [docs/CHANGES.md](docs/CHANGES.md)（改动说明）与 [docs/DEPLOY.md](docs/DEPLOY.md)（部署）。
