# 部署指南

目标：把 `dist/` 发布到**你自己的** GitHub Pages，拿到形如 `https://<你的用户名>.github.io/vis/` 的链接。

> **注意**：原站 `cinger007/vis` 在教师账号名下，你没有推送权限。作业要求提交「你的网站发布后的链接」，所以必须自己部署一份。

---

## 方式一：GitHub Actions 自动部署（推荐）

仓库里已备好 `.github/workflows/deploy.yml`，推上去即自动构建并发布。

### 1. 在 GitHub 新建空仓库

例如 `vis`（公开仓库才能用免费的 Pages）。

### 2. 推送代码

```bash
cd vis-rebuild
git init
git add .
git commit -m "课程网站重构：内容迁移 + 外壳重建"
git branch -M main
git remote add origin https://github.com/<你的用户名>/vis.git
git push -u origin main
```

> `legacy/` 是旧站只读副本（迁移输入）。它不算大（约 2 MB），建议一并提交，这样 Actions 里能完整跑通 `migrate → verify → build`，也让「内容从哪来」完全可追溯。若不想提交，需把 workflow 里的 `migrate` / `migrate:demos` 两步去掉，并把 `content/`、`demos/`、`public/` 一起提交。

### 3. 打开 Pages

仓库 **Settings → Pages → Build and deployment → Source** 选 **GitHub Actions**。

### 4. 等 Actions 跑完

约 1–2 分钟。首页会出现部署链接，形如
`https://<你的用户名>.github.io/vis/`

### 5. 确认站点前缀正确

Pages 项目站点的根路径是 `/<仓库名>/`。workflow 里已按此自动推导：

```yaml
SITE_URL: https://${{ github.repository_owner }}.github.io/${{ github.event.repository.name }}/
```

- 若仓库名不是 `vis`（例如 `my-course`），**无需改**，workflow 会自动适配。
- 若你把站点发布成「用户主页」仓库（`<用户名>.github.io`），根路径变成 `/`，则需把该变量改为
  `https://<你的用户名>.github.io/`。

> 这个变量只影响 `sitemap.xml`、`robots.txt` 与 `404.html` 里的绝对链接。页面之间的导航一律用相对路径，所以即使设错，正文导航也不会坏。

---

## 方式二：手动发布 `dist/`

```bash
npm ci
npm run all            # 生成 dist/
```

然后把 `dist/` 的内容推到任意分支的根目录，在 Settings → Pages 里选择该分支。
产物是纯静态文件，也可以直接丢到任何静态托管（对象存储、Nginx、校内服务器），无需 Node 运行时。

---

## 本地预览

```bash
node tools/serve.mjs 8899
# http://127.0.0.1:8899/
```

**必须走 HTTP**：演示要 `fetch` 读取 `data/*.csv`，用 `file://` 直接打开会被 CORS 拦掉。

---

## 常见问题

**页面样式丢失 / 图片 404**
站点部署在子路径下。本项目所有页内链接与资源引用都用相对路径解析（`data-base`），因此子路径无需额外配置。若你手改了模板并引入了 `/assets/...` 这类根绝对路径，在子路径下就会 404。

**演示显示「演示加载失败」**
多为 `data/` 下的 CSV/JSON 未随 `dist/` 一起发布。确认 `dist/data/` 存在（含 `newstudent.csv`、`crime.csv`、`french_names.json`、`weather_2024.csv`）。

**Actions 里 verify 或 budget 失败**
这是**有意的**门禁，不是环境问题：
- `verify-content.mjs` 失败 → 内容层与旧站不一致（多半是刚改过 `content/`，误删或误改了块）；
- `budget.mjs` 失败 → 体积超出预算（多半是新加了未压缩的大资源）。

看报错里列出的具体小节与指标即可定位。

**想改内容**
直接改 `content/lesson-0N.json`，然后 `npm run build`。
注意：`content/` 是**生成物**——重跑 `npm run migrate` 会用旧站数据覆盖它。若你的修改需要长期保留，放进 `content/overrides.json`（编辑层，迁移不会覆盖），或迁移后不要重跑 `migrate`。

**构建期不需要 Node 的哪些东西**
`dist/` 零依赖：不含任何 npm 包、不引用 CDN，D3 已本地打包。断网（含局域网）也能完整使用。
