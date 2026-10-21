/**
 * color.js —— 画布用的颜色工具
 *
 * 背景：Canvas 不认 CSS 变量（`ctx.fillStyle = 'var(--x)'` 会静默失效），
 * 也不认 5 个分量的 rgba。这两点都踩过坑：
 *   - 把 'var(--border)' 直接交给 strokeStyle → 静默无效；
 *   - 把 'rgba(r,g,b,a)' 喂给只处理十六进制的拼接函数 → 拼出 5 个分量 → addColorStop 抛错。
 * 所以统一走这里：先读变量，再安全地叠加透明度。
 */

/** 读取 :root 上的自定义属性（返回原始值，可能是 #hex 或 rgb()/rgba()） */
export const cssVar = (name) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/** 解析 #hex / rgb() / rgba() 为 [r, g, b, a] */
export function parseColor(input) {
  const s = String(input || '#000').trim();
  const m = s.match(/^rgba?\(([^)]+)\)$/i);
  if (m) {
    const p = m[1].split(',').map((x) => parseFloat(x));
    return [p[0] || 0, p[1] || 0, p[2] || 0, p[3] === undefined || Number.isNaN(p[3]) ? 1 : p[3]];
  }
  let h = s.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  if (Number.isNaN(n)) return [0, 0, 0, 1];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
}

/** 在给定颜色的基础上叠加透明度（与原 alpha 相乘），返回可被 Canvas 接受的 rgba() */
export function withAlpha(input, a) {
  const [r, g, b, al] = parseColor(input);
  return `rgba(${r}, ${g}, ${b}, ${(al * a).toFixed(4)})`;
}

/** 读取变量并叠加透明度：withVar('--accent', 0.4) */
export const withVar = (name, a) => withAlpha(cssVar(name), a);
