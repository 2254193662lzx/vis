/**
 * globe.js —— 知识地图地球仪（课程总览页，按需加载）
 *
 * 为什么是地球仪：本站的层级是「5 章 → 27 小节」，用平面分列图表达时，
 * 跨章的概念联系只能靠连线，静态看就是一团乱线（见 CHANGES 第三轮修订）。
 * 球面天然适合表达「同一球体上的多个区域」：5 章各占一条纬带，27 个小节是带上的点，
 * 转动球体时「换个角度就能看到背面的章节」，这与课程里反复出现的「换个映射、
 * 换个视角，读数就变了」是同一个意思。
 *
 * 实现：纯 Canvas 2D + 手写旋转矩阵与正交投影，不引入 three.js / WebGL ——
 * 站点要保持零依赖与离线可用，27 个点也不需要 GPU。
 *
 * 交互：自动缓慢自转；可拖拽旋转（带惯性）；悬停显示小节名；点击进入该小节。
 * 无障碍：球体的点画在 canvas 上，读屏与键盘摸不到，因此右侧面板里的小节是**真实链接**
 * （共 27 条，覆盖全部小节，筛选只切换 hidden 而不会把它们移出 DOM）；
 * 开启专注模式或系统偏好减弱动效时自转停止（仍可拖拽）。
 */

import { cssVar, withAlpha, withVar } from './color.js';

const BAND_LAT = [-52, -26, 0, 26, 52];
const SPREAD = 150;      // 一条纬带上小节的经度跨度（度）
const ROT_SPEED = 0.0032;
const TILT_MAX = 0.85;   // 俯仰角上限（弧度）

const rad = (d) => (d * Math.PI) / 180;

export function init() {
  const host = document.querySelector('[data-globe]');
  if (!host) return;
  const canvas = host.querySelector('[data-globe-canvas]');
  const tip = host.querySelector('[data-globe-tip]');
  const dataEl = host.querySelector('[data-globe-data]');
  if (!canvas || !dataEl) return;

  let chapters;
  try { chapters = JSON.parse(dataEl.textContent || '[]'); } catch (e) { return; }
  if (!chapters.length) return;

  const ctx = canvas.getContext('2d');
  const base = document.documentElement.dataset.base || '';
  const localeRoot = document.documentElement.dataset.localeRoot || '';

  /* ---------- 把 27 个小节铺到球面上 ---------- */
  const pts = [];
  chapters.forEach((ch, ci) => {
    const lat = BAND_LAT[Math.min(ci, BAND_LAT.length - 1)];
    const n = ch.sections.length;
    ch.sections.forEach((sec, si) => {
      const lon = n > 1 ? (si - (n - 1) / 2) * (SPREAD * 2 / (n - 1)) + ci * 15 : ci * 15;
      const la = rad(lat + (si % 3 - 1) * 3.2);   // 轻微抖动，避免看起来像刻度
      const lo = rad(lon);
      pts.push({
        x: Math.cos(la) * Math.sin(lo),
        y: Math.sin(la),
        z: Math.cos(la) * Math.cos(lo),
        lon,
        chapterIdx: ci,
        color: ch.color,
        label: `${sec.num} ${sec.title}`,
        chapter: ch.title,
        href: `${base}${localeRoot}${ch.slug}/#${sec.slug}`,
      });
    });
  });

  /* ---------- 画布尺寸 ---------- */
  let W = 0, H = 0, R = 0, cx = 0, cy = 0;
  function resize() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.max(280, Math.round(rect.width));
    H = Math.max(280, Math.round(rect.height));
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    R = Math.min(W, H) * 0.45;
    cx = W / 2;
    cy = H / 2;
  }
  resize();
  if ('ResizeObserver' in window) new ResizeObserver(resize).observe(canvas);

  /* ---------- 状态 ---------- */
  let yaw = -0.4;
  let pitch = 0.28;
  let vel = 0;
  let dragging = false;
  let hovered = null;
  let moved = 0;
  let last = { x: 0, y: 0 };
  let visible = true;
  let tick = 0;
  let selected = -1;          // -1 = 全部章节
  let preview = -1;           // 悬停预览（不改变选中状态）
  let yawTarget = null;       // 选中某章时，把该章转到正面
  const filters = [...host.querySelectorAll('[data-globe-filter]')];
  const chapEls = [...host.querySelectorAll('[data-chap]')];

  const calm = () => document.documentElement.getAttribute('data-motion') === 'off';

  function rotate(p) {
    const cyw = Math.cos(yaw), syw = Math.sin(yaw);
    let x = p.x * cyw + p.z * syw;
    let z = -p.x * syw + p.z * cyw;
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    const y = p.y * cp - z * sp;
    z = p.y * sp + z * cp;
    return { x, y, z };
  }

  /** 球面坐标 → 屏幕坐标（正交投影；z>0 为朝向观察者） */
  function project(p) {
    const r = rotate(p);
    return { px: cx + r.x * R, py: cy - r.y * R, z: r.z };
  }

  function graticule() {
    const out = [];
    for (let lat = -60; lat <= 60; lat += 30) {
      const la = rad(lat);
      out.push(Array.from({ length: 73 }, (_, k) => {
        const lo = rad(k * 5);
        return { x: Math.cos(la) * Math.sin(lo), y: Math.sin(la), z: Math.cos(la) * Math.cos(lo) };
      }));
    }
    for (let lon = 0; lon < 360; lon += 30) {
      const lo = rad(lon);
      out.push(Array.from({ length: 61 }, (_, k) => {
        const la = rad(-90 + k * 3);
        return { x: Math.cos(la) * Math.sin(lo), y: Math.sin(la), z: Math.cos(la) * Math.cos(lo) };
      }));
    }
    return out;
  }
  const GRID = graticule();

  function draw() {
    if (!W || !H) return;
    ctx.clearRect(0, 0, W, H);

    // 球体本体：极淡的球面渐变 + 边缘光
    const g = ctx.createRadialGradient(cx - R * 0.3, cy - R * 0.35, R * 0.1, cx, cy, R);
    g.addColorStop(0, withVar('--accent', 0.1));
    g.addColorStop(0.65, withVar('--accent-2', 0.07));
    g.addColorStop(1, withVar('--accent-2', 0.03));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fill();

    ctx.lineWidth = 1;
    ctx.strokeStyle = withVar('--text-3', 0.5);
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.stroke();

    // 经纬网：逐段按深度调整透明度，形成前后景深
    ctx.lineWidth = 1;
    GRID.forEach((line) => {
      for (let i = 0; i < line.length - 1; i++) {
        const a = project(line[i]);
        const b = project(line[i + 1]);
        const za = (a.z + b.z) / 2;
        if (za < -0.15) continue;
        ctx.strokeStyle = withVar('--text-3', 0.16 + Math.max(0, za) * 0.5);
        ctx.beginPath();
        ctx.moveTo(a.px, a.py);
        ctx.lineTo(b.px, b.py);
        ctx.stroke();
      }
    });

    // 点：背面先画且更淡，正面后画
    const proj = pts.map((p) => ({ ...project(p), p }));
    proj.sort((m, n) => m.z - n.z);
    proj.forEach((o) => {
      const front = o.z > 0;
      const focus = selected >= 0 ? selected : preview;
      const on = focus < 0 || o.p.chapterIdx === focus;   // 是否属于当前关注章
      const dim = on ? 1 : 0.16;
      const alpha = (front ? 0.45 + o.z * 0.55 : 0.16) * dim;
      const r = (front ? 3.8 + o.z * 2.6 : 2.8) * (on ? 1 : 0.72);
      const isHov = hovered === o.p;
      if (front && o.z > 0.55 && on) {               // 正面的点带一圈光晕
        ctx.fillStyle = withAlpha(o.p.color, 0.22 * o.z);
        ctx.beginPath();
        ctx.arc(o.px, o.py, r + 6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = withAlpha(o.p.color, isHov ? 1 : alpha);
      ctx.beginPath();
      ctx.arc(o.px, o.py, isHov ? r + 2 : r, 0, Math.PI * 2);
      ctx.fill();
      if (isHov) {
        ctx.strokeStyle = withAlpha(o.p.color, 0.9);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(o.px, o.py, r + 7, 0, Math.PI * 2);
        ctx.stroke();
        ctx.lineWidth = 1;
      }
    });

    if (tip && hovered) {
      const o = proj.find((q) => q.p === hovered);
      if (o) placeTip(o.px, o.py);
    }
  }

  function withAlpha(hex, a) {
    const h = String(hex || '#6366f1').replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }

  function placeTip(px, py) {
    tip.style.left = `${px}px`;
    tip.style.top = `${py}px`;
  }

  function showTip(p) {
    if (!tip) return;
    tip.innerHTML = `<b>${p.label}</b><span>${p.chapter}</span>`;
    tip.dataset.open = '1';
  }
  function hideTip() {
    if (!tip) return;
    tip.dataset.open = '0';
  }

  /* ---------- 命中测试 ---------- */
  function pick(mx, my) {
    let best = null;
    let bestD = 15;
    pts.forEach((p) => {
      if (selected >= 0 && p.chapterIdx !== selected) return;   // 已筛掉其它章
      const o = project(p);
      if (o.z <= 0.02) return;              // 背面的点不可点
      const d = Math.hypot(o.px - mx, o.py - my);
      if (d < bestD) { bestD = d; best = p; }
    });
    return best;
  }

  /* ---------- 交互 ---------- */
  canvas.addEventListener('pointerdown', (e) => {
    dragging = true;
    moved = 0;
    vel = 0;
    last = { x: e.clientX, y: e.clientY };
    canvas.setPointerCapture?.(e.pointerId);
    canvas.style.cursor = 'grabbing';
  });

  canvas.addEventListener('pointermove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    if (dragging) {
      const dx = e.clientX - last.x;
      const dy = e.clientY - last.y;
      moved += Math.abs(dx) + Math.abs(dy);
      yawTarget = null;
      yaw += dx * 0.0075;
      pitch = Math.max(-TILT_MAX, Math.min(TILT_MAX, pitch + dy * 0.006));
      vel = dx * 0.0075;
      last = { x: e.clientX, y: e.clientY };
      hideTip();
      hovered = null;
      return;
    }

    const p = pick(mx, my);
    if (p !== hovered) {
      hovered = p;
      if (p) { showTip(p); placeTip(0, 0); } else hideTip();
    }
    canvas.style.cursor = p ? 'pointer' : 'grab';
    if (p) {
      const o = project(p);
      placeTip(o.px, o.py);
    }
  });

  canvas.addEventListener('pointerup', (e) => {
    dragging = false;
    canvas.style.cursor = 'grab';
    if (moved < 6 && hovered) {
      location.href = hovered.href;
      return;
    }
    if (moved < 6) {
      const rect = canvas.getBoundingClientRect();
      const p = pick(e.clientX - rect.left, e.clientY - rect.top);
      if (p) location.href = p.href;
    }
  });

  canvas.addEventListener('pointerleave', () => {
    dragging = false;
    hovered = null;
    hideTip();
    canvas.style.cursor = 'grab';
  });

  canvas.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') { yaw -= 0.12; e.preventDefault(); }
    if (e.key === 'ArrowRight') { yaw += 0.12; e.preventDefault(); }
    if (e.key === 'ArrowUp') { pitch = Math.max(-TILT_MAX, pitch - 0.1); e.preventDefault(); }
    if (e.key === 'ArrowDown') { pitch = Math.min(TILT_MAX, pitch + 0.1); e.preventDefault(); }
  });

  /* ---------- 章节展开 / 筛选 ---------- */
  /*
   * 点一章：球体转到那一章的正面、其它章淡出，同时把该章的小节展开成对齐的网格；
   * 再点一次收起并把球体还原。默认状态只有五行章节 —— 不再把 27 个小节一次性铺出来。
   */
  function setFilter(i) {
    // 再点同一章 = 收起
    if (i >= 0 && i === selected) i = -1;
    selected = i;

    filters.forEach((b) => {
      const on = Number(b.dataset.globeFilter) === i;
      b.setAttribute('aria-pressed', String(on));
      b.setAttribute('aria-expanded', String(on));
    });
    chapEls.forEach((c) => {
      c.classList.toggle('is-open', Number(c.dataset.chap) === i);
    });
    hovered = null;
    hideTip();

    if (i < 0) { yawTarget = null; return; }
    // 把该章的平均经度转到正面：z' = cos(lon + yaw)，取 yaw = -lon 即正对观察者
    const mine = pts.filter((p) => p.chapterIdx === i);
    const mean = mine.reduce((a, p) => a + p.lon, 0) / (mine.length || 1);
    const want = -rad(mean);
    const d = Math.atan2(Math.sin(want - yaw), Math.cos(want - yaw));   // 取最短转向
    yawTarget = yaw + d;
  }
  filters.forEach((b) => b.addEventListener('click', () => setFilter(Number(b.dataset.globeFilter))));

  // 悬停章节行 → 球面上预览该章（点开才算选中）
  chapEls.forEach((c) => {
    const idx = Number(c.dataset.chap);
    c.addEventListener('pointerenter', () => { if (selected < 0) preview = idx; });
    c.addEventListener('pointerleave', () => { preview = -1; });
    c.addEventListener('focusin', () => { if (selected < 0) preview = idx; });
    c.addEventListener('focusout', () => { preview = -1; });
  });

  /* ---------- 帧循环 ---------- */
  function loop() {
    tick++;
    if (!dragging) {
      // 拖拽释放后的惯性 + 常态自转；专注模式/减弱动效下只保留惯性，不自动转
      vel *= 0.94;
      if (Math.abs(vel) < 0.0004) vel = 0;
      yaw += vel;

      if (yawTarget !== null) {
        // 选中某章：平滑转到该章正面，转到位就停下（不再自转，方便看清）
        const d = yawTarget - yaw;
        if (Math.abs(d) < 0.002) { yaw = yawTarget; yawTarget = null; }
        else yaw += d * (calm() ? 1 : 0.09);
      } else if (selected < 0 && !calm()) {
        yaw += ROT_SPEED * (hovered ? 0.25 : 1);
      }
    }
    if (visible) draw();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  // 离开视口就停画，回到视口继续 —— 别让装饰性动效空转
  if ('IntersectionObserver' in window) {
    new IntersectionObserver((es) => { visible = es[0].isIntersecting; }, { threshold: 0.05 }).observe(canvas);
  }
  canvas.style.cursor = 'grab';
  canvas.setAttribute('tabindex', '0');
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', host.querySelector('.globe__hint')?.textContent || 'Knowledge globe');
}
