/**
 * minify.mjs —— 构建期压缩（HTML / CSS）
 *
 * 只用保守规则，不引入压缩器依赖：
 *  - 保护 <pre> / <script> / <textarea> 内容（代码块的换行与缩进是内容本身，绝不能动）；
 *  - 只折叠「标签之间」的纯空白，不碰文本节点内部的空格；
 *  - CSS 只删注释、折叠空白、去掉紧邻 { } ; 的空白；**不做冒号周边压缩**
 *    —— 那会把 `a :hover`（后代选择器）误改成 `a:hover`，语义不同。
 */

const PROTECT = /<(pre|script|textarea)\b[^>]*>[\s\S]*?<\/\1>/gi;

export function minifyHTML(html) {
  const stash = [];
  const masked = html.replace(PROTECT, (m) => {
    stash.push(m);
    return `\u0000${stash.length - 1}\u0000`;
  });

  const out = masked
    .replace(/<!--(?!\[if)[\s\S]*?-->/g, '')      // 注释（保留条件注释）
    .replace(/>\s+</g, '><')                     // 标签间空白
    .replace(/\s{2,}/g, ' ')                     // 连续空白
    .trim();

  return out.replace(/\u0000(\d+)\u0000/g, (_, i) => stash[Number(i)]);
}

export function minifyCSS(css) {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, '')            // 注释
    .replace(/\s*\n\s*/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\s*([{};])\s*/g, '$1')
    .replace(/\n+/g, '')
    .trim();
}
