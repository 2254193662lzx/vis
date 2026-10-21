#!/usr/bin/env python3
"""
optimize-images.py —— 插图优化（一次性执行，产物提交进 public/img/）

背景：旧站 lesson-02 的 5 张插图共 645 KB，其中一张 Mackinlay 排名图就要 434 KB。
这些是线条示意图，PNG 存储效率极差；转 WebP 后合计 124 KB（-81%）。

有意不在 CI 里跑：GitHub Actions 的 runner 不保证装有 Pillow，
而这属于「一次优化、长期复用」的静态资源，优化结果直接入库更可靠。

用法：python tools/optimize-images.py
"""
import glob
import os

from PIL import Image

SRC = os.path.join(os.path.dirname(__file__), '..', 'legacy', 'lesson-02', 'img')
OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'img')
MAX_W = 1400       # 正文栏 860px，2x 屏需要 1720px；示意图 1400px 足够
QUALITY = 82

def main():
    os.makedirs(OUT, exist_ok=True)
    total_in = total_out = 0
    for f in sorted(glob.glob(os.path.join(SRC, '*.png'))):
        name = os.path.basename(f)
        im = Image.open(f)
        w, h = im.size
        if w > MAX_W:
            im = im.resize((MAX_W, round(h * MAX_W / w)), Image.LANCZOS)
        dst = os.path.join(OUT, name.replace('.png', '.webp'))
        im.save(dst, 'WEBP', quality=QUALITY, method=6)
        a, b = os.path.getsize(f), os.path.getsize(dst)
        total_in += a
        total_out += b
        print(f'  {name:<40} {a/1024:7.1f}K -> {b/1024:6.1f}K')
    print(f'  合计 {total_in/1024:.1f}K -> {total_out/1024:.1f}K  节省 {(1-total_out/total_in)*100:.0f}%')

if __name__ == '__main__':
    main()
