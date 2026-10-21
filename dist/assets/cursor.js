/**
 * cursor.js —— 卡通箭头指针
 *
 * 不是圆形光环，就是一枚**指针形状**的卡通箭头：圆润的轮廓、深色描边、
 * 香槟金填充、尖端一点高光。后面跟两枚逐渐滞后的小星做拖尾。
 *
 * 反馈：
 *   悬停可点元素 → 放大 + 歪头（-7°）
 *   按下        → 压扁（0.86）
 *   快速移动    → 拖尾星现形；停下就消失
 *
 * 只在「精确指针 + 支持悬停」的设备启用；输入框、文本域保留系统光标
 * （那里需要精确的插入点提示）；触摸设备完全不加载行为；
 * 系统开启减弱动效时不缓动、不拖尾，位置直接对齐。
 */

const HOVER_SEL = 'a, button, [role="button"], summary, .gchip, .chap__btn, .acc__btn, .card, .rail__code';

const ARROW = `<svg viewBox="0 0 24 26" aria-hidden="true" focusable="false">
  <path d="M3.4 1.8 L3.4 20.6 L8.6 15.8 L12 23.4 L15.6 21.8 L12.2 14.4 L19.2 14 L3.4 1.8 Z"
        fill="var(--accent)" stroke="rgba(10,8,4,0.82)" stroke-width="1.7"
        stroke-linejoin="round" stroke-linecap="round"/>
  <circle cx="6.6" cy="6.4" r="1.5" fill="rgba(255,255,255,0.75)"/>
</svg>`;

export function init() {
  const fine = window.matchMedia('(pointer: fine)').matches;
  const hoverable = window.matchMedia('(hover: hover)').matches;
  if (!fine || !hoverable) return;

  const wrap = document.createElement('div');
  wrap.className = 'cursor-wrap';
  wrap.setAttribute('aria-hidden', 'true');
  wrap.innerHTML = ARROW.replace('<svg ', '<svg class="cursor-arrow" ') + '<span class="cursor-spark"></span><span class="cursor-spark"></span>';
  document.body.appendChild(wrap);
  document.documentElement.setAttribute('data-cursor', 'on');

  const calm = () => document.documentElement.getAttribute('data-motion') === 'off';

  let mx = window.innerWidth / 2, my = window.innerHeight / 2;
  let px = mx, py = my;                 // 上一帧位置（判断速度）
  const spark = [
    { x: mx, y: my, k: 0.34 },
    { x: mx, y: my, k: 0.2 },
  ];
  let shown = false;
  let speed = 0;

  const show = (v) => {
    if (shown === v) return;
    shown = v;
    wrap.dataset.visible = v ? '1' : '0';
  };

  window.addEventListener('pointermove', (e) => {
    if (e.pointerType && e.pointerType !== 'mouse') return;
    mx = e.clientX;
    my = e.clientY;
    const overInput = e.target.closest && e.target.closest('input, textarea, select');
    if (overInput) { show(false); return; }
    show(true);
    wrap.dataset.hover = e.target.closest && e.target.closest(HOVER_SEL) ? '1' : '0';
  }, { passive: true });

  window.addEventListener('pointerdown', () => { wrap.dataset.press = '1'; });
  window.addEventListener('pointerup', () => { wrap.dataset.press = '0'; });
  document.addEventListener('pointerleave', () => show(false));
  window.addEventListener('blur', () => show(false));

  const sparks = [...wrap.querySelectorAll('.cursor-spark')];

  function loop() {
    const still = calm();
    speed = Math.hypot(mx - px, my - py);
    px = mx; py = my;
    // 直接写 transform（不经过 CSS 变量），少一次自定义属性解析，跟随更跟手
    wrap.style.transform = `translate3d(${mx}px, ${my}px, 0)`;

    sparks.forEach((el, i) => {
      const s = spark[i];
      s.x += (mx - s.x) * (still ? 1 : s.k);
      s.y += (my - s.y) * (still ? 1 : s.k);
      el.style.transform = `translate3d(${s.x}px, ${s.y}px, 0) scale(${(1 - i * 0.25).toFixed(2)})`;
    });
    // 拖尾只在移动时现形
    const fast = !still && speed > 6;
    wrap.dataset.trail = fast ? '1' : '0';
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
}
