#!/usr/bin/env python3
"""PWB 素材打包：从 Dawnlike / Kenney 源图抽格重组 pwb_atlas.png + spriteAtlas.ts
许可：Dawnlike CC-BY 4.0（署名 docs/ASSETS_CREDITS.md）；Kenney 全系 CC0。
布局：帧展开连续（每帧一格，跨行自动换行——修复行末帧越界与同格覆盖两类 bug）；
      atlas 下半区为 8×8 half 帧（LOD 中远景档）。
用法：python3 scripts/build-sprites.py（源：research/oga/dawnlike + /tmp/kenney_sparse）
"""
import os
from PIL import Image

ROOT = "/home/z/my-project/pixel-world-box"
DL = f"{ROOT}/research/oga/dawnlike/Characters"
KF = "/tmp/kenney_sparse/2d/Tiny Farm/Tiles"
RTS = "/tmp/kenney_sparse/2d/RTS Medieval (Pixel)/Tiles"
TT = "/tmp/kenney_sparse/2d/Tiny Town/Tiles"
OUT_PNG = f"{ROOT}/public/sprites/pwb_atlas.png"
OUT_TS = f"{ROOT}/src/lib/game/spriteAtlas.ts"

# name -> (kind, payload, frames, tintable)
# kind: 'dl' = dawnlike (sheet, r, c)；'kf'/'rts'/'tt' = kenney tile_XXXX.png（帧=相邻编号）
S = [
    # ---- 四足动物（Quadraped0/1，全 2 帧）----
    ("q_sheep",     "dl", ("Quadraped", 2, 1), 2, False),
    ("q_goat",      "dl", ("Quadraped", 2, 0), 2, False),
    ("q_yak",       "dl", ("Quadraped", 2, 5), 2, False),
    ("q_wolf",      "dl", ("Quadraped", 10, 0), 2, False),
    ("q_snowwolf",  "dl", ("Quadraped", 11, 0), 2, False),
    ("q_bear",      "dl", ("Quadraped", 0, 0), 2, False),
    ("q_deer",      "dl", ("Quadraped", 5, 1), 2, False),
    ("q_buck",      "dl", ("Quadraped", 5, 2), 2, False),
    ("q_camel",     "dl", ("Quadraped", 1, 6), 2, False),
    ("q_boar",      "dl", ("Quadraped", 3, 2), 2, False),
    ("q_fox",       "dl", ("Quadraped", 11, 1), 2, False),
    ("q_horse",     "dl", ("Quadraped", 4, 0), 2, False),
    ("q_horse_w",   "dl", ("Quadraped", 4, 1), 2, False),
    ("q_donkey",    "dl", ("Quadraped", 4, 2), 2, False),
    ("q_horse_b",   "dl", ("Quadraped", 4, 3), 2, False),
    # ---- 人形：职业（Player0/1，全 2 帧，可染色）----
    ("p_peasant",   "dl", ("Player", 0, 0), 2, True),
    ("p_farmer",    "dl", ("Player", 0, 5), 2, True),
    ("p_warrior",   "dl", ("Player", 3, 1), 2, True),
    ("p_archer",    "dl", ("Player", 7, 0), 2, True),
    ("p_builder",   "dl", ("Player", 0, 4), 2, True),
    ("p_merchant",  "dl", ("Player", 1, 0), 2, True),
    ("p_miner",     "dl", ("Player", 4, 5), 2, True),
    ("p_noble",     "dl", ("Player", 7, 4), 2, True),
    ("p_king",      "dl", ("Player", 7, 6), 2, True),
    ("p_mage",      "dl", ("Player", 3, 6), 2, True),
    ("p_bandit",    "dl", ("Player", 1, 6), 2, True),
    # ---- 人形：种族 ----
    ("p_elf",       "dl", ("Player", 0, 2), 2, True),
    ("p_dwarf",     "dl", ("Player", 13, 0), 2, True),
    ("p_orc",       "dl", ("Player", 11, 2), 2, True),
    ("p_goblin",    "dl", ("Player", 14, 0), 2, True),
    ("p_lizard",    "dl", ("Reptile", 1, 0), 2, True),
    # ---- 亡灵/爬行/啮齿 ----
    ("u_zombie",    "dl", ("Undead", 0, 0), 2, False),
    ("u_skeleton",  "dl", ("Undead", 1, 0), 2, False),
    ("u_ghost",     "dl", ("Undead", 3, 0), 2, False),
    ("r_snake",     "dl", ("Reptile", 0, 0), 2, False),
    ("r_basilisk",  "dl", ("Reptile", 5, 0), 2, False),
    ("m_rat",       "dl", ("Rodent", 0, 0), 2, False),
    ("q_rabbit",    "dl", ("Rodent", 1, 0), 2, False),
    # ---- 水生/鸟类（Aquatic/Avian，2 帧）----
    ("a_fish",      "dl", ("Aquatic", 0, 0), 2, False),
    ("a_shark",     "dl", ("Aquatic", 1, 0), 2, False),
    ("a_whale",     "dl", ("Aquatic", 1, 4), 2, False),
    ("a_turtle",    "dl", ("Aquatic", 4, 0), 2, False),
    ("a_crab",      "dl", ("Aquatic", 4, 2), 2, False),
    ("a_penguin",   "dl", ("Avian", 3, 0), 2, False),
    ("a_crow",      "dl", ("Avian", 0, 6), 2, False),
    # ---- Kenney Tiny Farm：家畜 + 农作物 ----
    ("f_pig",       "kf", 125, 2, False),
    ("f_chicken",   "kf", 121, 2, False),
    ("f_farmer",    "kf", 108, 2, True),
    ("f_wheat0",    "kf", 65, 1, False),
    ("f_wheat1",    "kf", 66, 1, False),
    ("f_wheat2",    "kf", 67, 1, False),
    ("f_corn0",     "kf", 39, 1, False),
    ("f_corn1",     "kf", 40, 1, False),
    ("f_corn2",     "kf", 41, 1, False),
    ("f_carrot0",   "kf", 4, 1, False),
    ("f_carrot1",   "kf", 5, 1, False),
    ("f_carrot2",   "kf", 6, 1, False),
    ("f_row",       "kf", 48, 1, False),
    ("f_hay",       "kf", 67, 1, False),
    # ---- Kenney RTS Medieval Pixel：建筑 ----
    ("b_house",     "rts", 164, 1, False),
    ("b_house_g",   "rts", 163, 1, False),
    ("b_capital",   "rts", 185, 1, False),
    ("b_tower",     "rts", 167, 1, False),
    ("b_barracks",  "rts", 188, 1, False),
    ("b_castle",    "rts", 184, 1, False),
    ("b_market",    "rts", 171, 1, False),
    ("b_temple",    "rts", 146, 1, False),
    ("b_library",   "rts", 147, 1, False),
    ("b_mine",      "rts", 102, 1, False),
    ("b_well",      "rts", 169, 1, False),
    ("b_tent",      "rts", 170, 1, False),
    ("b_lighthouse","rts", 148, 1, False),
    ("b_barn",      "rts", 189, 1, False),
    ("b_gate",      "rts", 186, 1, False),
    ("b_windmill",  "rts", 168, 1, False),
    # ---- 树（RTS + Tiny Town 秋树）----
    ("t_oak",       "rts", 69, 1, False),
    ("t_oak2",      "rts", 70, 1, False),
    ("t_oak3",      "rts", 71, 1, False),
    ("t_pine",      "rts", 76, 1, False),
    ("t_pine3",     "rts", 93, 1, False),
    ("t_autumn",    "tt", 5, 1, False),
    ("t_autumn2",   "tt", 7, 1, False),
    ("t_bush",      "rts", 74, 1, False),
    ("t_stump",     "rts", 78, 1, False),
]

COLS = 16


def load_cell(spec):
    kind = spec[0]
    if kind == "dl":
        _, (sheet, r, c), frames, _ = spec
        out = []
        for fi in range(frames):
            im = Image.open(f"{DL}/{sheet}{fi}.png").convert("RGBA")
            out.append(im.crop((c * 16, r * 16, c * 16 + 16, r * 16 + 16)))
        return out
    _, num, frames, _ = spec
    base = {"kf": KF, "rts": RTS, "tt": TT}[kind]
    out = []
    for fi in range(frames):
        im = Image.open(f"{base}/tile_{num + fi:04d}.png").convert("RGBA")
        out.append(im.crop((0, 0, im.width, im.height)))
    return out


def half(frame):
    return frame.resize((frame.width // 2, frame.height // 2), Image.BOX)


def main():
    os.makedirs(os.path.dirname(OUT_PNG), exist_ok=True)
    entries = {}
    loaded = []
    for row in S:
        loaded.append((row[0], row, load_cell(row[1:])))

    total_slots = sum(len(f) for _, _, f in loaded)
    rows_main = (total_slots + COLS - 1) // COLS
    atlas = Image.new("RGBA", (COLS * 16, rows_main * 2 * 16), (0, 0, 0, 0))
    pos = 0
    empty_report = []
    for name, row, frames in loaded:
        first_x = (pos % COLS) * 16
        first_y = (pos // COLS) * 16
        for fi, fr in enumerate(frames):
            gx = ((pos + fi) % COLS) * 16
            gy = ((pos + fi) // COLS) * 16
            atlas.paste(fr, (gx, gy))
            atlas.paste(half(fr), (gx, gy + rows_main * 16))
            a = fr.getchannel("A")
            if sum(1 for p in a.getdata() if p > 8) < 20:
                empty_report.append((name, fi))
        pos += len(frames)
        tintable = row[4] if len(row) > 4 else False
        entries[name] = {
            "x": first_x, "y": first_y, "w": 16, "h": 16,
            "frames": len(frames),
            "lodX": first_x, "lodY": first_y + rows_main * 16,
            "tintable": bool(tintable),
        }
    atlas.save(OUT_PNG, optimize=True)
    if empty_report:
        print("WARNING 空白帧:", empty_report)
        raise SystemExit(1)
    print("空白帧自检: 无 ✓")

    ts = ["// GENERATED by scripts/build-sprites.py — DO NOT EDIT",
          "// 素材：Dawnlike (CC-BY 4.0, opengameart.org/content/dawnlike-16x16-universal-rogue-like-tileset-v181)",
          "//      + Kenney RTS Medieval (Pixel) / Tiny Farm / Tiny Town (CC0, kenney.nl)",
          "export interface AtlasEntry { x: number; y: number; w: number; h: number; frames: number; lodX: number; lodY: number; tintable: boolean; }",
          "export const ATLAS: Record<string, AtlasEntry> = {"]
    for name, e in entries.items():
        ts.append(
            f"  {name}: {{ x: {e['x']}, y: {e['y']}, w: {e['w']}, h: {e['h']}, frames: {e['frames']}, lodX: {e['lodX']}, lodY: {e['lodY']}, tintable: {str(e['tintable']).lower()} }},"
        )
    ts += ["};", f"export const ATLAS_COLS = {COLS};"]
    with open(OUT_TS, "w") as f:
        f.write("\n".join(ts) + "\n")
    print(f"atlas: {atlas.size}, sprites: {len(entries)} -> {OUT_PNG}")
    print(f"manifest -> {OUT_TS}")


if __name__ == "__main__":
    main()
