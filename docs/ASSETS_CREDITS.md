# 素材来源与许可（Assets Credits）

本项目使用的第三方开源像素素材及其许可如下（#104 位图精灵管线引入）。

## Dawnlike — 16x16 Universal Rogue-like Tileset v181
- 来源：https://opengameart.org/content/dawnlike-16x16-universal-rogue-like-tileset-v181
- 许可：**CC-BY 4.0**（https://creativecommons.org/licenses/by/4.0/）
- 用途：全部生物精灵（人形职业/种族、四足动物、水生、鸟类、亡灵、爬行、啮齿类）——
  见 `src/lib/game/spriteAtlas.ts` 与 `public/sprites/pwb_atlas.png`
- 署名方式：本文件（CC-BY 4.0 署名义务）+ 游戏内 Credits UI（#105 待办）

## Kenney — RTS Medieval (Pixel) / Tiny Farm / Tiny Town
- 作者：Kenney（https://kenney.nl）
- 获取通道：GitHub 镜像 https://github.com/shorepine/kenney
- 许可：**CC0 1.0 Universal**（无署名义务，仍致谢）
- 用途：建筑精灵（RTS Medieval 完整建筑）、农作物生长链/家畜（Tiny Farm）、秋季树（Tiny Town）

## 打包与再分发说明
- `public/sprites/pwb_atlas.png` 为上述素材的裁切重组图集（`scripts/build-sprites.py`
  自动生成）；许可随源素材（Dawnlike 部分 CC-BY 4.0、Kenney 部分 CC0）。
- 素材原件位于 `research/`（未入同步白名单），重生成需重新拉取（脚本内含来源路径）。

## 弃用记录（调研未采用）
- OpenGameArt 散装野生动物 8 件（视角/画风/质量不符，VLM 盲测 0/8 可用）
- Kenney Tiny Battle（现代战争主题）、Animal Pack（头像风格）
