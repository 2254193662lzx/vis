/**
 * sky.js —— 主页背景：一个斜视角的旋臂星系
 *
 * 上一版把「一条星带」绕屏幕中心转，那不是银河的样子：真实的旋臂星系是
 * **盘面绕自己的银心整体旋转**，而且几乎不会正对着我们看 —— 总是带一个倾角，
 * 所以我们看到的是压扁的椭圆盘 + 两侧伸出的旋臂 + 中央核球。
 *
 * 这一版按业界常用的旋臂星系生成器来做（对数旋臂 + 半径加权的散布）：
 *
 *   半径 r      = pow(rand, 1.7) * R            越靠银心越密
 *   旋臂编号 b  = i % ARMS
 *   角度 a      = b / ARMS * 2π + r * SPIN       旋臂是绕出来的，不是画出来的
 *   散布        = pow(rand, 1.6) * r * SCATTER  外圈更松散
 *
 * 旋转方式是关键：**整个盘面绕银心刚性旋转**（每颗星的角速度相同），
 * 旋臂因此不会被打散；再叠加每颗星自己的小幅度"本轮摆动"与闪烁，
 * 于是整片星系在缓慢转动，但旋臂结构始终清晰 —— 这才是好看的转法。
 *
 * 盘面按倾角 TILT 旋转后再沿竖直方向压扁到 SQUASH，形成斜视角。
 * 另外还有：中央核球的暖光、沿旋臂的尘埃暗带、前景行星（会脉动）、流星。
 * 减弱动效（data-motion="off"）时只画一帧静态星系。
 */

import { cssVar, withAlpha } from './color.js';

const ARMS = 3;
const ARM_STARS = 900;          // 每条旋臂上的星
const CORE_STARS = 140;         // 核球里的星
const FIELD_STARS = 120;        // 带外散星
const SPIN = 2.42;              // 旋臂缠绕强度（弧度 / 单位半径）→ 约 1.4 圈
const SCATTER = 0.17;           // 散布强度（相对半径）
const TILT = -0.30;             // 盘面倾角（弧度）
const SQUASH = 0.42;            // 竖直压扁比例（0.42 约等于 65° 倾角）
const SPIN_SPEED = 0.000055;    // 盘面刚性自转（弧度 / 毫秒 → 约 3.2°/分钟）

const rand = (seed) => () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

export function init() {
  const canvas = document.querySelector('[data-sky]');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const host = canvas.parentElement;

  const calm = () => document.documentElement.getAttribute('data-motion') === 'off';
  const light = () => document.documentElement.getAttribute('data-theme') === 'light';

  let W = 0, H = 0, R = 0, CX = 0, CY = 0;
  let stars = [], core = [], field = [], planets = [];
  let shooting = [];
  let nextShoot = 280;
  let t = 0;
  let visible = true;
  let drawnStatic = false;

  /* ---------- 生成 ---------- */
  function build() {
    const rnd = rand(20261016);
    stars = [];
    for (let i = 0; i < ARMS * ARM_STARS; i++) {
      const arm = i % ARMS;
      const rn = Math.pow(rnd(), 1.7);          // 半径分布：靠近核心更密
      const r = rn;                              // 归一化半径 0..1
      const spread = Math.pow(rnd(), 1.6) * SCATTER;
      stars.push({
        r,
        a0: (arm / ARMS) * Math.PI * 2 + r * SPIN,
        scatter: spread,
        sAngle: rnd() * Math.PI * 2,             // 散布方向
        size: 0.4 + rnd() * rnd() * 1.9,
        bright: 0.4 + rnd() * 0.6,
        tw: 0.4 + rnd() * 1.6,                   // 闪烁频率
        ph: rnd() * 6.283,
        wob: 0.006 + rnd() * 0.014,              // 本轮摆动幅度（弧度）
        big: rnd() > 0.982,
      });
    }
    core = Array.from({ length: CORE_STARS }, () => ({
      r: Math.pow(rnd(), 2.6) * 0.14,
      a0: rnd() * Math.PI * 2,
      size: 0.3 + rnd() * 0.9,
      bright: 0.5 + rnd() * 0.5,
      ph: rnd() * 6.283,
    }));
    field = Array.from({ length: FIELD_STARS }, () => ({
      x: rnd(), y: rnd(),
      size: 0.3 + rnd() * 1.0,
      bright: 0.12 + rnd() * 0.4,
      tw: 0.3 + rnd() * 1.2,
      ph: rnd() * 6.283,
    }));
    // 前景行星：不参与盘面旋转，浮在星系之前
    planets = [
      { x: 0.14, y: 0.30, r: 6.5, col: '--accent',   sp: 0.00052, ph: 0.6, ring: true },
      { x: 0.86, y: 0.66, r: 4.2, col: '--accent-2', sp: 0.00071, ph: 2.4, ring: false },
      { x: 0.74, y: 0.18, r: 2.8, col: '#d79a92',    sp: 0.00094, ph: 4.3, ring: false },
    ];
  }

  function resize() {
    const rect = host.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.max(320, Math.round(rect.width));
    H = Math.max(320, Math.round(rect.height));
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // 银心略高于画面中心，让盘面从标题上方铺开
    CX = W * 0.5;
    CY = H * 0.3;
    R = Math.max(W, H) * 0.56;
    drawnStatic = false;
  }

  /* ---------- 盘面 → 屏幕 ---------- */
  const cosT = Math.cos(TILT);
  const sinT = Math.sin(TILT);

  function place(rNorm, angle, rot, scroll) {
    // 刚性旋转：所有星共用同一个 rot，旋臂因此不会被剪切打散
    const a = angle + rot;
    const rr = rNorm * R;
    let dx = Math.cos(a) * rr;
    let dy = Math.sin(a) * rr;
    // 先按倾角旋转，再沿竖直方向压扁 —— 斜视角
    const tx = dx * cosT - dy * sinT;
    const ty = (dx * sinT + dy * cosT) * SQUASH;
    return { x: CX + tx, y: CY + ty + scroll * 0.1 };
  }

  function draw(now) {
    const isLight = light();
    const scroll = calm() ? 0 : -window.scrollY * 0.14;
    const rot = calm() ? 0.5 : t * SPIN_SPEED;

    ctx.clearRect(0, 0, W, H);

    // 1) 夜空
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, cssVar('--sky-1'));
    bg.addColorStop(0.6, cssVar('--sky-2'));
    bg.addColorStop(1, cssVar('--sky-3'));
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // 2) 盘面整体一层极淡的辉光（压扁的椭圆），让旋臂有"底盘"
    ctx.save();
    ctx.translate(CX, CY + scroll * 0.1);
    ctx.rotate(TILT);
    ctx.scale(1, SQUASH);
    const disk = ctx.createRadialGradient(0, 0, R * 0.05, 0, 0, R);
    disk.addColorStop(0, withAlpha(cssVar('--accent'), isLight ? 0.14 : 0.22));
    disk.addColorStop(0.35, withAlpha(cssVar('--accent-2'), isLight ? 0.09 : 0.13));
    disk.addColorStop(0.72, withAlpha(cssVar('--accent-2'), isLight ? 0.03 : 0.045));
    disk.addColorStop(1, withAlpha(cssVar('--accent-2'), 0));
    ctx.fillStyle = disk;
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 3) 尘埃暗带：沿旋臂偏内一些的暗弧，制造"旋臂被切开"的真实感
    if (!isLight) {
      ctx.save();
      ctx.translate(CX, CY + scroll * 0.1);
      ctx.rotate(TILT);
      ctx.scale(1, SQUASH);
      ctx.globalCompositeOperation = 'destination-out';
      for (let arm = 0; arm < ARMS; arm++) {
        for (let k = 0; k < 3; k++) {
          const r0 = 0.16 + k * 0.26;
          ctx.beginPath();
          for (let s = 0; s <= 40; s++) {
            const rn = r0 + (s / 40) * 0.22;
            const a = (arm / ARMS) * Math.PI * 2 + rn * SPIN - 0.14 + rot;
            const x = Math.cos(a) * rn * R;
            const y = Math.sin(a) * rn * R;
            if (s === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
          }
          ctx.lineWidth = R * (0.012 + k * 0.004);
          ctx.strokeStyle = `rgba(0,0,0,${0.28 - k * 0.05})`;
          ctx.stroke();
        }
      }
      ctx.restore();
      ctx.globalCompositeOperation = 'source-over';
    }

    // 4) 核球：一团暖光 + 密集小星
    const coreGlow = ctx.createRadialGradient(CX, CY + scroll * 0.1, 0, CX, CY + scroll * 0.1, R * 0.15);
    coreGlow.addColorStop(0, withAlpha(cssVar('--accent'), isLight ? 0.34 : 0.55));
    coreGlow.addColorStop(0.35, withAlpha(cssVar('--accent'), isLight ? 0.14 : 0.24));
    coreGlow.addColorStop(1, withAlpha(cssVar('--accent'), 0));
    ctx.fillStyle = coreGlow;
    ctx.fillRect(CX - R * 0.17, CY + scroll * 0.1 - R * 0.17, R * 0.34, R * 0.34);

    ctx.fillStyle = isLight ? 'rgba(74,58,30,0.62)' : 'rgba(255,238,196,0.85)';
    ctx.beginPath();
    core.forEach((s) => {
      const p = place(s.r, s.a0, rot, scroll);
      ctx.moveTo(p.x + s.size, p.y);
      ctx.arc(p.x, p.y, s.size, 0, Math.PI * 2);
    });
    ctx.fill();

    // 5) 旋臂星场：按「冷暖 × 亮度」分桶合并成少量路径
    const warm = cssVar('--accent');
    const cool = cssVar('--accent-2');
    const buckets = new Map();
    const put = (key, x, y, size) => {
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push([x, y, size]);
    };

    stars.forEach((s) => {
      const ang = s.a0 + (calm() ? 0 : rot + Math.sin(t * 0.0004 + s.ph) * s.wob);
      const sr = s.scatter * R * 0.6;
      const dx = Math.cos(ang) * s.r * R + Math.cos(s.sAngle) * sr;
      const dy = Math.sin(ang) * s.r * R + Math.sin(s.sAngle) * sr;
      const x = CX + dx * cosT - dy * sinT;
      const y = CY + (dx * sinT + dy * cosT) * SQUASH + scroll * 0.1;
      if (x < -30 || x > W + 30 || y < -30 || y > H + 30) return;
      const tw = calm() ? 1 : 0.55 + 0.45 * Math.sin(t * 0.0015 * s.tw + s.ph);
      const a = s.bright * tw * (isLight ? 0.55 : 1);
      const temp = Math.min(3, Math.floor(s.r * 4));       // 0=核心暖, 3=外圈冷
      const band = a > 0.62 ? 2 : a > 0.36 ? 1 : 0;
      put(`${temp}-${band}`, x, y, s.size);
      if (s.big && !isLight && a > 0.5) {
        ctx.strokeStyle = withAlpha('#fff3d6', a * 0.28);
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(x - 6, y); ctx.lineTo(x + 6, y);
        ctx.moveTo(x, y - 6); ctx.lineTo(x, y + 6);
        ctx.stroke();
      }
    });

    const mix = (temp, band) => {
      // temp 0..3 从暖到冷，band 0..2 从暗到亮
      if (isLight) {
        // 亮色主题走「墨线星图」：用深墨画星，像印在纸上的星图
        const inkAlphas = [0.16, 0.32, 0.52];
        const k = temp / 3;
        return withAlpha(k < 0.34 ? '#4a3a1e' : (k < 0.67 ? '#333d3a' : '#2b3640'), inkAlphas[band]);
      }
      const warmA = [0.26, 0.5, 0.86][band];
      const coolA = [0.22, 0.44, 0.8][band];
      const k = temp / 3;
      const w = cssVar('--accent');
      const c = cssVar('--accent-2');
      return withAlpha(k < 0.5 ? w : c, warmA * (1 - k) + coolA * k);
    };
    buckets.forEach((list, key) => {
      const [temp, band] = key.split('-').map(Number);
      ctx.fillStyle = mix(temp, band);
      ctx.beginPath();
      list.forEach(([x, y, size]) => {
        ctx.moveTo(x + size, y);
        ctx.arc(x, y, size, 0, Math.PI * 2);
      });
      ctx.fill();
    });

    // 6) 前景散星
    ctx.fillStyle = isLight ? 'rgba(43,54,64,0.32)' : 'rgba(255,246,228,0.5)';
    ctx.beginPath();
    field.forEach((s) => {
      const tw = calm() ? 1 : 0.45 + 0.55 * Math.sin(t * 0.0013 * s.tw + s.ph);
      if (s.bright * tw < 0.12) return;
      const x = s.x * W;
      const y = s.y * H + scroll * 0.35;
      if (y < -10 || y > H + 10) return;
      ctx.moveTo(x + s.size, y);
      ctx.arc(x, y, s.size, 0, Math.PI * 2);
    });
    ctx.fill();

    // 7) 前景行星（脉动）
    planets.forEach((pl) => {
      const x = pl.x * W;
      const y = pl.y * H + scroll * 0.5;
      const pulse = calm() ? 0.85 : 0.6 + 0.4 * Math.sin(t * pl.sp + pl.ph);
      const col = cssVar(pl.col);
      const halo = ctx.createRadialGradient(x, y, pl.r * 0.4, x, y, pl.r * 6);
      halo.addColorStop(0, withAlpha(col, 0.3 * pulse));
      halo.addColorStop(0.45, withAlpha(col, 0.08 * pulse));
      halo.addColorStop(1, withAlpha(col, 0));
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(x, y, pl.r * 6, 0, Math.PI * 2);
      ctx.fill();
      if (pl.ring) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(-0.42);
        ctx.strokeStyle = withAlpha(col, 0.38 * pulse);
        ctx.lineWidth = Math.max(0.8, pl.r * 0.16);
        ctx.beginPath();
        ctx.ellipse(0, 0, pl.r * 2.4, pl.r * 0.7, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
      const body = ctx.createRadialGradient(x - pl.r * 0.35, y - pl.r * 0.4, pl.r * 0.1, x, y, pl.r);
      body.addColorStop(0, withAlpha('#fff8e6', 0.85 * pulse));
      body.addColorStop(0.55, withAlpha(col, 0.95));
      body.addColorStop(1, withAlpha(col, 0.35));
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.arc(x, y, pl.r, 0, Math.PI * 2);
      ctx.fill();
    });

    // 8) 流星
    if (!calm()) {
      if (--nextShoot <= 0) {
        const x0 = W * (0.1 + Math.random() * 0.8);
        shooting.push({
          x0, y0: H * (0.05 + Math.random() * 0.3),
          x1: x0 - 220 - Math.random() * 160, y1: H * (0.3 + Math.random() * 0.3),
          life: 900,
        });
        nextShoot = 280 + Math.random() * 460;
      }
      shooting = shooting.filter((s) => s.life > 0);
      shooting.forEach((s) => {
        const p = 1 - s.life / 900;
        const x = s.x0 + (s.x1 - s.x0) * p;
        const y = s.y0 + (s.y1 - s.y0) * p;
        const ang = Math.atan2(s.y1 - s.y0, s.x1 - s.x0);
        const tx = x - Math.cos(ang) * 100;
        const ty = y - Math.sin(ang) * 100;
        const g = ctx.createLinearGradient(tx, ty, x, y);
        g.addColorStop(0, 'rgba(255,248,230,0)');
        g.addColorStop(1, `rgba(255,248,230,${0.8 * Math.min(1, s.life / 600)})`);
        ctx.strokeStyle = g;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.lineTo(x, y);
        ctx.stroke();
        s.life -= 16;
      });
    }
  }

  function loop(now) {
    t = now || 0;
    if (visible && !document.hidden) {
      if (calm()) {
        if (!drawnStatic) { draw(t); drawnStatic = true; }
      } else {
        drawnStatic = false;
        draw(t);
      }
    }
    requestAnimationFrame(loop);
  }

  build();
  resize();
  if ('ResizeObserver' in window) new ResizeObserver(resize).observe(host);
  if ('IntersectionObserver' in window) {
    new IntersectionObserver((es) => { visible = es[0].isIntersecting; }, { threshold: 0.02 }).observe(canvas);
  }
  document.addEventListener('visibilitychange', () => { drawnStatic = false; });
  new MutationObserver(() => { drawnStatic = false; if (calm()) draw(t); })
    .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-motion'] });
  window.addEventListener('scroll', () => { if (calm()) drawnStatic = false; }, { passive: true });

  requestAnimationFrame(loop);
}
