#!/usr/bin/env python3
"""#104 位图管线移植补丁（v2 重建版）：把开源素材精灵层注入远端新基线（半单位艺术层架构）
- sprites.ts：drawPerson + 19 动物 + drawBuilding/drawTree 注入 blitSprite fast path（失败回落程序化精绘）
- render.ts：render() 开头 ensureAtlas() + spriteCache 纪元闸（atlas 就绪 → 全缓存失效）
幂等可重跑。"""
import re

ROOT = "/home/z/my-project/pixel-world-box"
SP = f"{ROOT}/src/lib/game/sprites.ts"
RD = f"{ROOT}/src/lib/game/render.ts"

src = open(SP).read()
orig = src

# 1) import
if "spriteRuntime" not in src:
    src = src.replace(
        "import { shiftColor, shiftRgb, visCacheFor, type VisCache } from './emergence';",
        "import { shiftColor, shiftRgb, visCacheFor, type VisCache } from './emergence';\n"
        "import { blitSprite } from './spriteRuntime';", 1)

# 2) CORE 块（drawPerson 前）
CORE = '''
// ============ #104 开源素材贴图层（Dawnlike CC-BY 4.0 + Kenney CC0）============
// fast path 原则 = atlas 未就绪/特殊姿态（睡/骑乘/乘船/巨人）→ 返回 false 完整回落
// 远端程序化精绘（#98~#103 半单位重制）作为兜底与涌现物种通道保留 —— 双路线并存。
// 坐标约定：与各宿主函数同坐标系（人形/动物 = 用户单位 px；建筑/树 = 4px/格内部坐标，
// render 层 scale(0.5) 包裹由 blit scale:2 补偿）。精灵光栅缓存自动继承贴图输出
// （atlasEpoch 纪元闸保证就绪后缓存整体失效，见 render.ts）。

/** 职业 → Dawnlike Player 帧表（peasant/farmer/warrior/archer/builder/merchant/miner/noble/king） */
const JOB_SPRITES: Record<number, string> = {
  0: 'p_peasant', 1: 'p_farmer', 2: 'p_warrior', 3: 'p_archer',
  4: 'p_builder', 5: 'p_merchant', 6: 'p_miner', 7: 'p_noble', 8: 'p_king',
};

/** 动物物种 sprite 键 → atlas 帧名 */
const UNIT_SPRITE_ATLAS: Record<string, string> = {
  sheep: 'q_sheep', wolf: 'q_wolf', snowwolf: 'q_snowwolf', bear: 'q_bear',
  deer: 'q_deer', camel: 'q_camel', pig: 'f_pig', rabbit: 'q_rabbit',
  fox: 'q_fox', chicken: 'f_chicken', penguin: 'a_penguin', snake: 'r_snake',
  fish: 'a_fish', crab: 'a_crab', turtle: 'a_turtle', shark: 'a_shark',
  skeleton: 'u_skeleton', horse: 'q_horse',
};

/** 人形单位帧选择：国王/僵尸/种族优先，其余按职业换装（WorldBox「换装即换帧」） */
function blitPersonFrame(
  wc: CanvasRenderingContext2D, u: Unit, civColor: [number, number, number] | null,
  px: number, py: number, step: number,
): boolean {
  let name: string;
  if (u.king) name = 'p_king';
  else if (u.race === R.ZOMBIE) name = 'u_zombie';
  else if (u.race === R.BANDIT) name = 'p_bandit';
  else if (u.race === R.MAGE) name = 'p_mage';
  else if (u.race === R.GOBLIN) name = 'p_goblin';
  else if (u.race === R.DWARF) name = 'p_dwarf';
  else if (u.race === R.ORC) name = 'p_orc';
  else if (u.race === R.LIZARD) name = 'p_lizard';
  else if (u.race === R.ELF) name = 'p_elf';
  else name = JOB_SPRITES[u.job ?? 0] ?? 'p_peasant';
  return blitSprite(wc, name, px, py, {
    frame: step, flip: u.flip,
    tint: name === 'p_king' ? null : civColor, // 国王金冠华袍不染（染色吞王冠）
    hurt: u.hurt > 0, shadow: true,
  });
}

/** 建筑贴图（Kenney RTS Medieval）：kind → 三档 tier 换装；render 层 ×0.5 由 scale 2 补偿 */
const BUILDING_SPRITE_ATLAS: Record<number, string[]> = {
  1: ['b_house', 'b_house_g', 'b_barn'],
  2: ['b_capital', 'b_castle', 'b_castle'],
  3: ['b_tower', 'b_tower', 'b_barracks'],
  4: ['f_row', 'f_wheat0', 'f_wheat1'],
  5: ['b_barracks', 'b_barracks', 'b_barracks'],
  6: ['b_castle', 'b_castle', 'b_castle'],
  8: ['b_library', 'b_library', 'b_library'],
  9: ['b_market', 'b_market', 'b_market'],
  10: ['b_temple', 'b_temple', 'b_temple'],
  12: ['b_house_g', 'b_house_g', 'b_house_g'],
  18: ['b_mine', 'b_mine', 'b_mine'],
};

function blitBuildingAtlas(wc: CanvasRenderingContext2D, b: Building, tier: number): boolean {
  const list = BUILDING_SPRITE_ATLAS[b.kind];
  if (!list) return false;
  const name = list[Math.min(2, Math.max(0, tier))];
  // 内部 4px/格坐标（外层 scale 0.5 → 屏幕 2px/格）：32 内部px = 16 用户px ≈ WB 房 2×2 格
  return blitSprite(wc, name, b.x * 4 + 2, b.y * 4 + 10, { scale: 2 });
}

/** 树贴图：variant 群落 × season 季相（冬秃/夏松保留程序化枝干形态） */
function blitTreeAtlas(wc: CanvasRenderingContext2D, x: number, y: number, variant: number, season: number): boolean {
  if (season === 3) return false;
  const names = season === 2
    ? ['t_autumn', 't_autumn2', 't_oak2', 't_autumn']
    : ['t_oak', 't_oak2', 't_pine', 't_oak3', 't_pine3', 't_bush'];
  const name = names[variant % names.length];
  return blitSprite(wc, name, x * 4 + 2, y * 4 + 2 + 7, { scale: 2 });
}

'''
if "JOB_SPRITES" not in src:
    anchor = "export function drawPerson(ctx: CanvasRenderingContext2D, u: Unit, civColor: [number, number, number] | null, t = 0, armLv = 0) {"
    assert anchor in src
    src = src.replace(anchor, CORE + anchor, 1)

# 3) drawPerson fast path
if "blitPersonFrame(ctx, u, civColor, px, py, step)" not in src:
    anchor = "  const y = py - bob - breath;\n"
    idx = src.find(anchor, src.find("export function drawPerson("))
    assert idx > 0, "drawPerson anchor"
    insert = ("  // —— #104 贴图 fast path：Dawnlike 职业帧 + 王国色染色；特殊姿态回落程序化精绘 ——\n"
              "  if (!u.sleep && !u.mount && !u.boat && u.trait !== 'giant') {\n"
              "    if (blitPersonFrame(ctx, u, civColor, px, py, step)) return;\n"
              "  }\n")
    src = src[:idx + len(anchor)] + insert + src[idx + len(anchor):]

# 4) 动物函数注入（新版签名带相位参数 fc/frame/t → 帧序 = 参数>>3）
ANIMALS = {
    'drawSheep': ('q_sheep', 'fc'), 'drawWolf': ('q_wolf', 'fc'),
    'drawSnowWolf': ('q_snowwolf', 'fc'), 'drawBear': ('q_bear', 'fc'),
    'drawDeer': ('q_deer', 'fc'), 'drawPenguin': ('a_penguin', 'frame'),
    'drawCamel': ('q_camel', 'frame'), 'drawSnake': ('r_snake', 'frame'),
    'drawSkeleton': ('u_skeleton', 'frame'), 'drawHorse': ('q_horse', 't'),
    'drawChicken': ('f_chicken', 'frame'), 'drawPig': ('f_pig', 'frame'),
    'drawRabbit': ('q_rabbit', 'frame'), 'drawFox': ('q_fox', 'frame'),
    'drawFish': ('a_fish', 'frame'), 'drawCrab': ('a_crab', 'frame'),
    'drawTurtle': ('a_turtle', 'frame'), 'drawShark': ('a_shark', 'frame'),
}
missed = []
for fn, (atlas, ph) in ANIMALS.items():
    if f"blitSprite(ctx, '{atlas}', px, py" in src:
        continue
    m = re.search(
        rf"export function {fn}\(ctx: CanvasRenderingContext2D, u: Unit[^)]*\) \{{\n"
        rf"  const px = u\.dpx \?\? \(u\.rx \?\? u\.x\) \* 2;\n"
        rf"  const py = u\.dpy \?\? \(u\.ry \?\? u\.y\) \* 2;\n", src)
    if not m:
        missed.append(fn)
        continue
    ins = (f"  if (blitSprite(ctx, '{atlas}', px, py, {{ frame: (({ph} >> 3) & 1), flip: u.flip, "
           f"shadow: true, hurt: u.hurt > 0 }})) return;\n")
    src = src[:m.end()] + ins + src[m.end():]
assert not missed, f"anchor miss: {missed}"

# 5) drawBuilding fast path
if "blitBuildingAtlas(ctx, b, tier)" not in src:
    anchor = "  // —— 超限纪元（无限演化可视化）：阶位 > 2 = 超限建筑"
    assert anchor in src
    ins = ("  // —— #104 贴图 fast path（Kenney RTS Medieval 建筑，scale2 对冲 render 层 ×0.5）——\n"
           "  if (tier <= 2 && blitBuildingAtlas(ctx, b, tier)) return;\n  ")
    src = src.replace(anchor, ins + anchor, 1)

# 6) drawTree fast path
if "blitTreeAtlas(ctx, x, y, variant, season)" not in src:
    anchor = "  const cx = x * 4 + 2; // 格中心（用户单位）\n  const cy = y * 4 + 2;\n"
    assert anchor in src, "drawTree anchor"
    ins = ("  // —— #104 贴图 fast path（Dawnlike/Kenney 树精灵，scale2 对冲 render 层 ×0.5）——\n"
           "  if (blitTreeAtlas(ctx, x, y, variant, season)) return;\n")
    src = src.replace(anchor, anchor + ins, 1)

assert src != orig
open(SP, "w").write(src)
print("sprites.ts patched ✓")

# ---------------- render.ts ----------------
r = open(RD).read()
if "atlasEpoch" not in r:
    r = r.replace(
        "import { drawBuilding, drawDragon,",
        "import { ensureAtlas, atlasEpoch } from './spriteRuntime';\nimport { drawBuilding, drawDragon,", 1)
if "ensureAtlas();" not in r:
    anchor = "export function render(engine: GameEngine, ctx: CanvasRenderingContext2D, cw: number, ch: number) {"
    assert anchor in r
    r = r.replace(anchor,
                  anchor + "\n  ensureAtlas(); // #104 开源素材 atlas 单次异步加载（就绪前程序化精绘兜底）", 1)
if "spriteCacheEpochGate" not in r:
    old = "  let e = spriteCache.get(key);\n  const hit = !!e;"
    new = ("  // #104 atlas 纪元闸：atlas 就绪（epoch 自增）即全缓存失效——否则未就绪期光栅的\n"
           "  // 程序化版本会被相位稳定的 key 永久锁定（人形静止 2 相位在数十秒内全部完成光栅，\n"
           "  // 此后永远命中旧版；动物因相位更多而自愈——实锤 bug 修复）\n"
           "  if (spriteCacheEpochGate !== atlasEpoch.n) {\n"
           "    spriteCacheEpochGate = atlasEpoch.n;\n"
           "    if (atlasEpoch.n > 0) spriteCache.clear();\n"
           "  }\n"
           "  let e = spriteCache.get(key);\n  const hit = !!e;")
    assert old in r
    r = r.replace(old, new, 1)
    r = r.replace(
        "const spriteCache = new Map<string, SpriteRaster>();",
        "const spriteCache = new Map<string, SpriteRaster>();\nlet spriteCacheEpochGate = 0; // #104 atlas 纪元闸（初始 0：atlas 未就绪期允许缓存程序化版本作为降级档）", 1)
open(RD, "w").write(r)
print("render.ts patched ✓")
