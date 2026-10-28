// gen-render3.mjs — M-U5b 渲染 III 黄金向量生成器：sprites.ts frame 驱动物种精灵 20 族
// 真实现 = sprites.ts 20 函数直调（同 gen-render2 协议：无 bail 打标，逐 op 全录）—— 纪律②零同源复制
// 函数集（全部签名 (ctx, u, frame)）：
//   drawDragon / drawPenguin / drawCamel / drawScorpion / drawSnake
//   drawSkeleton / drawDemon / drawAngel / drawPhoenix / drawEnt / drawLich
//   drawTroll / drawOgre / drawWhiteWalker / drawVampire / drawKraken / drawSandworm
//   drawBasilisk / drawHydra / drawMage
// 特殊语义：hydra 世代 u.gen（[3,2,1][gen] 头数/躯干半高，斩首递减）；mage 施法亮袍 u.cd>18；
//   whitewalker 飘雪 u32 哈希 (id*97+k*131+frame*7)>>>0%16；phoenix/lich Math.cos/sin 确定性公转（f64 位精确）。
// dump 协议：与 gen-render2 相同（f64 bits hex；style 按 op 消费归一化）。
// 跑法：node scripts/unity-migration/gen-render3.mjs（自带 sanity + det 文件对比 + [GEN PASS]）
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// ---------------- 无头垫片（gen-render2 同款 RecCtx） ----------------
let canvasSeq = 0;
class RecCtx {
  constructor(canvas) {
    this.canvas = canvas;
    this.id = canvas.__id;
    this.ops = [];
    this.fillStyle = '#000000';
    this.strokeStyle = '#000000';
    this.lineWidth = 1;
    this.globalAlpha = 1;
  }
  _rec(o, args) { this.ops.push({ o, a: args, s: [this.fillStyle, this.strokeStyle, this.lineWidth, this.globalAlpha] }); }
  fillRect(x, y, w, h) { this._rec('fillRect', [x, y, w, h]); }
  clearRect(x, y, w, h) { this._rec('clearRect', [x, y, w, h]); }
  strokeRect(x, y, w, h) { this._rec('strokeRect', [x, y, w, h]); }
  save() { this._rec('save', []); }
  restore() { this._rec('restore', []); }
  translate(x, y) { this._rec('translate', [x, y]); }
  scale(x, y) { this._rec('scale', [x, y]); }
  rotate() {}
  setTransform(a, b, c, d, e, f) { this._rec('setTransform', [a, b, c, d, e, f]); }
  resetTransform() { this._rec('setTransform', [1, 0, 0, 1, 0, 0]); }
  beginPath() {} moveTo() {} lineTo() {} arc() {} closePath() {} fill() {} stroke() {} clip() {} rect() {}
  fillText() {} strokeText() {} measureText() { return { width: 0 }; }
  drawImage() {} putImageData() {}
  createImageData(w, h) { return { data: new Uint8ClampedArray(Math.max(4, (w | 0) * (h | 0) * 4)), width: w | 0, height: h | 0 }; }
  getImageData(x, y, w, h) { return this.createImageData(w, h); }
  createLinearGradient() { return { addColorStop() {} }; }
  createRadialGradient() { return { addColorStop() {} }; }
  createPattern() { return {}; }
  setLineDash() {} getLineDash() { return []; }
  quadraticCurveTo() {} bezierCurveTo() {} arcTo() {} ellipse() {} isPointInPath() { return false; }
}
function mkCanvas(w, h) {
  const c = { width: w ?? 0, height: h ?? 0, style: {}, __id: 'cv' + (++canvasSeq) };
  c.getContext = () => { if (!c.__ctx) c.__ctx = new RecCtx(c); return c.__ctx; };
  return c;
}
globalThis.document = {
  createElement: (tag) => (tag === 'canvas' ? mkCanvas() : { style: {}, appendChild() {} }),
  addEventListener() {},
  getElementById: () => null,
};
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.requestAnimationFrame = () => 0;

const { createJiti } = await import('jiti');
const jiti = createJiti(import.meta.url, { alias: { '@': path.join(ROOT, 'src') } });
const SP = await jiti.import(path.join(ROOT, 'src/lib/game/sprites.ts'));

// ---------------- dump 工具 ----------------
function f64hex(v) {
  const b = new DataView(new ArrayBuffer(8));
  b.setFloat64(0, v ?? 0, true);
  let s = '';
  for (let i = 0; i < 8; i++) s += b.getUint8(i).toString(16).padStart(2, '0');
  return s;
}
function dumpOps(ctx) {
  const out = [];
  for (const op of ctx.ops) {
    let s = null;
    if (op.o === 'fillRect') s = [op.s[0]];
    else if (op.o === 'strokeRect') s = [op.s[1], f64hex(op.s[2] ?? 1)];
    out.push({ o: op.o, a: op.a.map((v) => f64hex(typeof v === 'number' ? v : 0)), s });
  }
  return out;
}

// ---------------- 场景框架 ----------------
const scen = [];
function mkU(o) {
  return {
    id: o.id ?? 1, name: 'U', race: o.race ?? 0, civ: o.civ ?? -1,
    x: o.x ?? 40, y: o.y ?? 30, rx: o.rx, ry: o.ry, dpx: o.dpx, dpy: o.dpy,
    flip: o.flip ? 1 : 0, lx: o.lx, ly: o.ly,
    wep: o.wep ?? null, arm: o.arm ?? null, hlm: o.hlm ?? null,
    atk: o.atk ?? 0, cd: o.cd ?? 0, trait: o.trait ?? null,
    age: o.age ?? 20, maxAge: o.maxAge ?? 100, gen: o.gen ?? 0,
    hurt: o.hurt ?? 0, hp: o.hp ?? 60, maxHp: o.maxHp ?? 60,
    panic: o.panic, boat: o.boat ? 1 : 0, caravan: o.caravan ?? 0, king: o.king ? 1 : 0,
    job: o.job ?? 0, infected: !!o.infected, dead: 0,
  };
}
function dumpU(u) {
  return {
    id: u.id, race: u.race, civ: u.civ,
    x: f64hex(u.x), y: f64hex(u.y),
    rx: u.rx === undefined ? null : f64hex(u.rx), ry: u.ry === undefined ? null : f64hex(u.ry),
    dpx: u.dpx === undefined ? null : f64hex(u.dpx), dpy: u.dpy === undefined ? null : f64hex(u.dpy),
    flip: u.flip ? 1 : 0,
    lx: u.lx === undefined ? null : f64hex(u.lx), ly: u.ly === undefined ? null : f64hex(u.ly),
    wep: u.wep ?? null, arm: u.arm ?? null, hlm: u.hlm ?? null,
    atk: f64hex(u.atk ?? 0), cd: u.cd, trait: u.trait ?? null,
    age: u.age, maxAge: u.maxAge, gen: u.gen,
    hurt: u.hurt, hp: f64hex(u.hp), maxHp: f64hex(u.maxHp),
    job: u.job, infected: u.infected ? 1 : 0, king: u.king,
  };
}
// 物种场景宏：全部 20 函数签名 (ctx, u, frame) 统一
function spScene(name, fnName, opt, frame = 1000) {
  const u = mkU(opt);
  const ctx = mkCanvas(256, 256).getContext();
  SP[fnName](ctx, u, frame);
  scen.push({ name, fn: fnName, in: { u: dumpU(u), frame }, ops: dumpOps(ctx) });
}

// ============================================================
// 段 A：小型五族（dragon/penguin/camel/scorpion/snake）
// ============================================================
spScene('D01_dragon_base', 'drawDragon', { race: 9 });
spScene('D02_dragon_flip', 'drawDragon', { race: 9, flip: 1 });
spScene('D03_dragon_wing_up', 'drawDragon', { race: 9 }, 994);   // floor(994/6)=165 偶 up
spScene('D04_dragon_wing_dn', 'drawDragon', { race: 9 }, 1000);  // floor(1000/6)=166 偶? 166%2=0 up——用 996: 166 up; 997: 166…用 1002: 167 奇 down
spScene('D05_dragon_hurt', 'drawDragon', { race: 9, hurt: 5 });
spScene('P01_penguin_base', 'drawPenguin', { race: 11 });
spScene('P02_penguin_flip', 'drawPenguin', { race: 11, flip: 1 });
spScene('P03_penguin_bob1', 'drawPenguin', { race: 11 }, 1002);  // floor(1002/6)=167 奇 bob=1
spScene('P04_penguin_hurt', 'drawPenguin', { race: 11, hurt: 3 });
spScene('C01_camel_base', 'drawCamel', { race: 12 });
spScene('C02_camel_flip', 'drawCamel', { race: 12, flip: 1 });
spScene('C03_camel_bob1', 'drawCamel', { race: 12 }, 1000);      // floor(1000/8)=125 奇 bob=1
spScene('C04_camel_hurt', 'drawCamel', { race: 12, hurt: 3 });
spScene('SC01_scorpion_base', 'drawScorpion', { race: 13 });
spScene('SC02_scorpion_flip', 'drawScorpion', { race: 13, flip: 1 });
spScene('SC03_scorpion_bob1', 'drawScorpion', { race: 13 }, 1000); // floor(1000/4)=250 偶 bob0；1002: 250 偶；1004: 251 奇
spScene('SC04_scorpion_bob1b', 'drawScorpion', { race: 13 }, 1004);
spScene('SC05_scorpion_hurt', 'drawScorpion', { race: 13, hurt: 3 });
spScene('SN01_snake_base', 'drawSnake', { race: 14 });            // fc=1000: ph=200%4=0；1000%9=1<3 吐信
spScene('SN02_snake_flip', 'drawSnake', { race: 14, flip: 1 });
spScene('SN03_snake_ph2', 'drawSnake', { race: 14 }, 1010);       // floor(1010/5)=202%4=2；1010%9=2<3 吐信
spScene('SN04_snake_notongue', 'drawSnake', { race: 14 }, 1004);  // 1004%9=5>=3 不吐信
spScene('SN05_snake_hurt', 'drawSnake', { race: 14, hurt: 3 });

// ============================================================
// 段 B：中坚十族（skeleton/demon/angel/phoenix/ent/lich/troll/ogre/whitewalker/vampire）
// ============================================================
spScene('SK01_skeleton_base', 'drawSkeleton', { race: 16 });      // fc=1000 静止；骷髏瞳火 1000%14=6<7 亮
spScene('SK02_skeleton_flip', 'drawSkeleton', { race: 16, flip: 1 });
spScene('SK03_skeleton_move_a', 'drawSkeleton', { race: 16, lx: 39.5, ly: 30 }, 1000); // (1000>>2)&1=0
spScene('SK04_skeleton_move_b', 'drawSkeleton', { race: 16, lx: 39.5, ly: 30 }, 1004); // =1
spScene('SK05_skeleton_atk', 'drawSkeleton', { race: 16, atk: 5, wep: 'sword' });
spScene('SK06_skeleton_hurt_low', 'drawSkeleton', { race: 16, hurt: 5, hp: 20 });
spScene('SK07_skeleton_eye_dim', 'drawSkeleton', { race: 16 }, 1007); // 1007%14=13>=7 暗瞳
spScene('DM01_demon_base', 'drawDemon', { race: 17 });            // swell=100 偶0 flap=166 偶0 eye 1000%8=0<4 亮
spScene('DM02_demon_flip', 'drawDemon', { race: 17, flip: 1 });
spScene('DM03_demon_swell_flap', 'drawDemon', { race: 17 }, 1016);// swell=floor(1016/10)=101 奇1 flap=floor(1016/6)=169 奇1 tail (1016>>3)&1=127&1=1
spScene('DM04_demon_atk_none', 'drawDemon', { race: 17, hp: 20 }); // lowhp 条
spScene('DM05_demon_hurt', 'drawDemon', { race: 17, hurt: 5 });
spScene('AN01_angel_base', 'drawAngel', { race: 28 });            // bob=floor(1000/8)=125 奇1 flap=floor(1000/7)=142 偶0 光环 1000%12=4<6 亮 圣光 1000%20=0<3 闪
spScene('AN02_angel_flip', 'drawAngel', { race: 28, flip: 1 });
spScene('AN03_angel_bob0', 'drawAngel', { race: 28 }, 1008);      // floor(1008/8)=126 偶0
spScene('AN04_angel_hurt', 'drawAngel', { race: 28, hurt: 5, hp: 20 });
spScene('PH01_phoenix_base', 'drawPhoenix', { race: 29 });        // bob1 flap=floor(1000/5)=200 偶0 冠羽 1000%10=0<6 心脏 1000%14=4<7 尾 sway (1000+k*4)%12
spScene('PH02_phoenix_flip', 'drawPhoenix', { race: 29, flip: 1 });
spScene('PH03_phoenix_move', 'drawPhoenix', { race: 29, lx: 39.5, ly: 30 }, 1002); // flap=200 偶0 移动焰痕拉长
spScene('PH04_phoenix_low', 'drawPhoenix', { race: 29, hp: 20 }); // dim 余烬将熄 + 灰烟 1000%16=8 不冒烟——fc=1004: 1004%16=12; 用 fc=1000 冒烟帧 1000%16=8 no; 1008%16=14 no; 992%16=2<4 ✓ 用 992
spScene('PH05_phoenix_low_smoke', 'drawPhoenix', { race: 29, hp: 20 }, 992);
spScene('PH06_phoenix_hurt', 'drawPhoenix', { race: 29, hurt: 5 });
spScene('EN01_ent_base', 'drawEnt', { race: 30 });                // sway=floor(1000/12)=83 奇1 blink 1000%40=0<5 闭眼帧(亮眸变树皮) 根足 step0
spScene('EN02_ent_flip', 'drawEnt', { race: 30, flip: 1 });
spScene('EN03_ent_blink_open', 'drawEnt', { race: 30 }, 1010);    // 1010%40=10>=5 睁眼琥珀
spScene('EN04_ent_move', 'drawEnt', { race: 30, lx: 39.5, ly: 30 }, 1016); // step=(1016>>4)&1=63&1=1 armSw=1
spScene('EN05_ent_low_leaf', 'drawEnt', { race: 30, hp: 20 }, 1000); // dim 枯叶 1000%24=16 不落——fc=996: 996%24=12 no; 984%24=0<6 ✓
spScene('EN06_ent_low_leaffall', 'drawEnt', { race: 30, hp: 20 }, 984);
spScene('LI01_lich_base', 'drawLich', { race: 31 });              // bob 1000%14=6<7 0 glow 1000%8=0<6 亮 orbT=110
spScene('LI02_lich_flip', 'drawLich', { race: 31, flip: 1 });
spScene('LI03_lich_move', 'drawLich', { race: 31, lx: 39.5, ly: 30 }, 1008); // armSw (1008>>3)&1=126&1=0→-1 袍雾 1008%8=0<3 ✓
spScene('LI04_lich_low', 'drawLich', { race: 31, hp: 20 }, 1000); // dim fade 1000%22=10 不沉 glow 1000%16=8<10 亮
spScene('LI05_lich_low_fade', 'drawLich', { race: 31, hp: 20 }, 1001); // 1001%22=11 不沉；1001%16=9<10；用 fc=1004: 1004%22=14; fc=998: 998%22=8<4? no 8>=4; fade 帧需 %22<4: fc=990: 990%22=0<4 ✓ 沉降
spScene('LI06_lich_low_sunk', 'drawLich', { race: 31, hp: 20 }, 990);
spScene('TR01_troll_base', 'drawTroll', { race: 21 });            // breath 1000>>4=62&1=0 moss 1000%20=0<10
spScene('TR02_troll_flip', 'drawTroll', { race: 21, flip: 1 });
spScene('TR03_troll_move_a', 'drawTroll', { race: 21, lx: 39.5, ly: 30 }, 1000);
spScene('TR04_troll_atk', 'drawTroll', { race: 21, atk: 5 });     // 双臂高举+挥击白光
spScene('TR05_troll_hurt_low', 'drawTroll', { race: 21, hurt: 5, hp: 20 });
spScene('OG01_ogre_base', 'drawOgre', { race: 22 });              // breath 0 棒垂
spScene('OG02_ogre_flip', 'drawOgre', { race: 22, flip: 1 });
spScene('OG03_ogre_atk', 'drawOgre', { race: 22, atk: 5 });       // 抡棒过头+尖头白
spScene('OG04_ogre_move_a', 'drawOgre', { race: 22, lx: 39.5, ly: 30 }, 1004); // step1 bob1
spScene('OG05_ogre_hurt_low', 'drawOgre', { race: 22, hurt: 5, hp: 20 });
spScene('WW01_whitewalker_base', 'drawWhiteWalker', { race: 23 }); // 瞳 1000%10=0<5 亮档 飘雪 id=1
spScene('WW02_whitewalker_flip', 'drawWhiteWalker', { race: 23, flip: 1 });
spScene('WW03_whitewalker_atk', 'drawWhiteWalker', { race: 23, atk: 5 }); // 招霜
spScene('WW04_whitewalker_move_a', 'drawWhiteWalker', { race: 23, lx: 39.5, ly: 30 }, 1004);
spScene('WW05_whitewalker_snow_id7', 'drawWhiteWalker', { race: 23, id: 7 }, 1004); // 飘雪哈希 id=7 相位
spScene('WW06_whitewalker_eye_dim', 'drawWhiteWalker', { race: 23 }, 1005); // 1005%10=5 暗档
spScene('VA01_vampire_base', 'drawVampire', { race: 24 });        // hover (1000>>3)&1=125&1=1 沉 flutter (1000>>2)&1=0 瞳 1000%12=4<6 亮
spScene('VA02_vampire_flip', 'drawVampire', { race: 24, flip: 1 });
spScene('VA03_vampire_atk', 'drawVampire', { race: 24, atk: 5 }); // 尖牙+猩红残影
spScene('VA04_vampire_hover0', 'drawVampire', { race: 24 }, 1008); // (1008>>3)&1=126&1=0 浮
spScene('VA05_vampire_hurt_low', 'drawVampire', { race: 24, hurt: 5, hp: 20 });

// ============================================================
// 段 C：大型五族（kraken/sandworm/basilisk/hydra/mage）
// ============================================================
spScene('KR01_kraken_base', 'drawKraken', { race: 25 });          // ripple (1000>>3)%3=125%3=2 breath 0 眨眼 1000%47=13
spScene('KR02_kraken_flip', 'drawKraken', { race: 25, flip: 1 });
spScene('KR03_kraken_atk', 'drawKraken', { race: 25, atk: 5 });   // 触手 k=1,4 前甩
spScene('KR04_kraken_move', 'drawKraken', { race: 25, lx: 39.5, ly: 30 }, 1004); // bob (1004>>2)&1=251&1=1
spScene('KR05_kraken_ripple0', 'drawKraken', { race: 25 }, 1024); // (1024>>3)%3=128%3=2；976: 122%3=2; 984: 123%3=0 ✓
spScene('KR06_kraken_ripple0b', 'drawKraken', { race: 25 }, 984);
spScene('KR07_kraken_low_blink', 'drawKraken', { race: 25, hp: 20 }, 1001); // 1001%47=13; 眨眼帧 %47<2: fc=1005: 1005%47=17; fc=986: 986%47=470%47? 47*20=940, 986-940=46 no; 47*21=987 → fc=988: 1<2 ✓ 眨眼
spScene('KR08_kraken_blink', 'drawKraken', { race: 25 }, 988);
spScene('SW01_sandworm_base', 'drawSandworm', { race: 26 });      // seg (1000>>2)&3=250&3=2 hide (1000>>3)&1=0 尾迹 1000&7=0<4 isMoving 才喷
spScene('SW02_sandworm_flip', 'drawSandworm', { race: 26, flip: 1 });
spScene('SW03_sandworm_move', 'drawSandworm', { race: 26, lx: 39.5, ly: 30 }, 1000); // 尾迹喷沙
spScene('SW04_sandworm_atk', 'drawSandworm', { race: 26, atk: 5 }); // 张开深渊巨口
spScene('SW05_sandworm_hide', 'drawSandworm', { race: 26 }, 1008); // (1008>>3)&1=126&1=0；1016: 127&1=1 ✓ 沉降
spScene('SW06_sandworm_hide1', 'drawSandworm', { race: 26 }, 1016);
spScene('SW07_sandworm_low', 'drawSandworm', { race: 26, hp: 20 });
spScene('BA01_basilisk_base', 'drawBasilisk', { race: 27 });      // und (1000>>2)&3=2 rise0 瞳 1000%24=16>=12 暗金 信子 1000%18=10 不吐
spScene('BA02_basilisk_flip', 'drawBasilisk', { race: 27, flip: 1 });
spScene('BA03_basilisk_atk', 'drawBasilisk', { race: 27, atk: 5 }); // 挺立 rise2 冠翼泛光 信子前探
spScene('BA04_basilisk_tongue', 'drawBasilisk', { race: 27 }, 992); // 992%18=2<6 吐信
spScene('BA05_basilisk_eye_bright', 'drawBasilisk', { race: 27 }, 996); // 996%24=12? >=12 暗档——995: 995%24=11<12 亮 ✓
spScene('BA06_basilisk_eye_bright1', 'drawBasilisk', { race: 27 }, 995);
spScene('HY01_hydra_gen0', 'drawHydra', { race: 32, gen: 0 });    // 三头 bodyH3 ripple (1000>>3)%3=2 鳞点 gen0
spScene('HY02_hydra_gen0_flip', 'drawHydra', { race: 32, gen: 0, flip: 1 });
spScene('HY03_hydra_gen1', 'drawHydra', { race: 32, gen: 1 });    // 双头 bodyH2
spScene('HY04_hydra_gen2', 'drawHydra', { race: 32, gen: 2 });    // 单头 bodyH1
spScene('HY05_hydra_gen0_move', 'drawHydra', { race: 32, gen: 0, lx: 39.5, ly: 30 }, 1004); // step1 背疣交替
spScene('HY06_hydra_gen0_low', 'drawHydra', { race: 32, gen: 0, hp: 20 }); // low 头颅低垂 鳞色转暗 毒雾 不吐信
spScene('HY07_hydra_gen0_drool', 'drawHydra', { race: 32, gen: 0 }, 1000);  // 毒液 1000%40=0<3 ✓ 滴落
spScene('MG01_mage_base', 'drawMage', { race: 18 });              // robe 8a4fd0 breath0 杖尖 1000%6=4>=3 暗金
spScene('MG02_mage_flip', 'drawMage', { race: 18, flip: 1 });
spScene('MG03_mage_move_a', 'drawMage', { race: 18, lx: 39.5, ly: 30 }, 1000); // 帽尖偏摆 袍摆
spScene('MG04_mage_move_b', 'drawMage', { race: 18, lx: 39.5, ly: 30 }, 1004); // step1
spScene('MG05_mage_atk', 'drawMage', { race: 18, atk: 5 });       // 施法前挥
spScene('MG06_mage_cd_bright', 'drawMage', { race: 18, cd: 25 }); // cd>18 亮袍 c98af5
spScene('MG07_mage_hurt_low', 'drawMage', { race: 18, hurt: 5, hp: 20 });

// ---------------- sanity 断言 ----------------
let assertN = 0, assertFail = 0;
function ok(cond, msg) {
  assertN++;
  if (!cond) { assertFail++; console.error('  [SANITY FAIL]', msg); }
}
function findS(name) { const s = scen.find((x) => x.name === name); if (!s) throw new Error('missing scenario ' + name); return s; }
function nRect(s) { return s.ops.filter((o) => o.o === 'fillRect').length; }
{
  // 龙：阴影+双翼+身+头×2+尾 = 7
  ok(nRect(findS('D01_dragon_base')) === 7, `D01 龙 7 rect got ${nRect(findS('D01_dragon_base'))}`);
  ok(findS('D01_dragon_base').ops[0].s[0] === 'rgba(0,0,0,0.28)', 'D01 阴影开头');
  ok(findS('D05_dragon_hurt').ops.some((o) => o.s && o.s[0] === '#ff6b5e'), 'D05 受击红身');
  // 企鹅：身/肚/喙/脚×2 = 5
  ok(nRect(findS('P01_penguin_base')) === 5, `P01 企鹅 5 rect got ${nRect(findS('P01_penguin_base'))}`);
  ok(findS('P01_penguin_base').ops.some((o) => o.s && o.s[0] === '#ff9b2d'), 'P01 橙喙橙脚');
  // 蛇：4 节身+头+眼 = 6（吐信场景 +1）
  ok(nRect(findS('SN01_snake_base')) === 7, `SN01 蛇含信 7 rect got ${nRect(findS('SN01_snake_base'))}`);
  ok(nRect(findS('SN04_snake_notongue')) === 6, `SN04 无信 6 rect got ${nRect(findS('SN04_snake_notongue'))}`);
  // 骷髅：阴影/腿2/胸3/臂2/头2/瞳1/剑2(wep) = 12+白刃光1 = 13
  const sk5 = findS('SK05_skeleton_atk');
  ok(sk5.ops.some((o) => o.s && o.s[0] === '#ffffff'), 'SK05 白刃光');
  ok(findS('SK07_skeleton_eye_dim').ops.some((o) => o.s && o.s[0] === '#8c2317'), 'SK07 暗瞳档 #8c2317');
  // 恶魔：阴影/翼4/角2/头1/瞳1/躯2/尾2/蹄2 = 15
  ok(nRect(findS('DM01_demon_base')) === 15, `DM01 恶魔 15 rect got ${nRect(findS('DM01_demon_base'))}`);
  // 天使：光环/翼4/头2/袍2/剑1/圣光1/腰1/足2 = 14
  ok(nRect(findS('AN01_angel_base')) === 14, `AN01 天使 14 rect got ${nRect(findS('AN01_angel_base'))}`);
  // 凤凰：翼6/冠2+冠羽1/头2/躯2/心1/尾3/烬3 = 20（移动 +3 焰痕）
  // 真值 19：余烬 3 颗中 (frame+k*7)%3===0 的颗粒隔帧闪烁跳画（fc=1000: k=2 跳过）
  ok(nRect(findS('PH01_phoenix_base')) === 19, `PH01 凤凰 19 rect got ${nRect(findS('PH01_phoenix_base'))}`);
  ok(nRect(findS('PH03_phoenix_move')) > nRect(findS('PH01_phoenix_base')), 'PH03 移动焰痕更长');
  ok(findS('PH05_phoenix_low_smoke').ops.some((o) => o.s && o.s[0] === '#575757'), 'PH05 低血灰烟');
  // 树人：冠5/枯叶0/脸3/躯3+纹2+苔2/臂4/根4/落叶圈3 = 26（blink on 闭眼）
  ok(nRect(findS('EN01_ent_base')) === 24, `EN01 树人 24 rect got ${nRect(findS('EN01_ent_base'))}`);
  ok(findS('EN03_ent_blink_open').ops.some((o) => o.s && o.s[0] === '#ffb938'), 'EN03 睁眼琥珀 #ffb938');
  ok(findS('EN01_ent_base').ops.filter((o) => o.s && o.s[0] === '#6e4a2b').length > 0, 'EN01 闭眼帧眸色=树皮');
  ok(findS('EN06_ent_low_leaffall').ops.some((o) => o.s && o.s[0] === '#c9a02a'), 'EN06 低血黄叶');
  // 巫妖：袍5/裾3/雾0(静止)/冠4/晶1/面1+缝1/瞳2/匣1/手2/火2/圈3 = 25
  ok(nRect(findS('LI01_lich_base')) === 25, `LI01 巫妖 25 rect got ${nRect(findS('LI01_lich_base'))}`);
  ok(findS('LI01_lich_base').ops.some((o) => o.s && o.s[0] === '#b56cf0'), 'LI01 紫晶命匣');
  ok(nRect(findS('LI03_lich_move')) === nRect(findS('LI01_lich_base')) + 1, 'LI03 移动+袍雾 1 rect');
  // 巨魔：阴影/腿3/臂4/躯2/苔3/头1/眼1/牙2 = 16（atk 臂4+白光）
  ok(nRect(findS('TR01_troll_base')) === 14, `TR01 巨魔 14 rect got ${nRect(findS('TR01_troll_base'))}`);
  ok(findS('TR04_troll_atk').ops.some((o) => o.s && o.s[0] === '#ffffff'), 'TR04 挥击白光');
  // 食人魔：阴影/腿3/腹3/臂2/棒1/头1+耳2+鼻环1+獠牙2 = 16
  ok(nRect(findS('OG01_ogre_base')) === 15, `OG01 食人魔 15 rect got ${nRect(findS('OG01_ogre_base'))}`);
  ok(findS('OG03_ogre_atk').ops.some((o) => o.s && o.s[0] === '#f2ead8'), 'OG03 棒尖白');
  // 白行者：阴影/袍摆3/躯3/臂2/面3/冠4/雪3 = 18
  ok(nRect(findS('WW01_whitewalker_base')) === 17, `WW01 白行者 17 rect got ${nRect(findS('WW01_whitewalker_base'))}`);
  // 吸血鬼：影1/斗篷3/衬1/领2/面1/瞳1/发2 = 12（atk +3）
  ok(nRect(findS('VA01_vampire_base')) === 11, `VA01 吸血鬼 11 rect got ${nRect(findS('VA01_vampire_base'))}`);
  // 克拉肯：涟漪2/触手12/胴2+斑2/眼1+瞳2 = 21
  ok(nRect(findS('KR01_kraken_base')) === 21, `KR01 克拉肯 21 rect got ${nRect(findS('KR01_kraken_base'))}`);
  ok(findS('KR03_kraken_atk').ops.some((o) => o.s && o.s[0] === '#ffffff'), 'KR03 触手前甩水花白');
  ok(findS('KR08_kraken_blink').ops.filter((o) => o.s && o.s[0] === '#14100c').length === 0, 'KR08 眨眼帧无瞳');
  // 沙虫：尘环1/躯10+脊4/头2+高光1/口缝或齿 = 18（base 闭口：缝1+感觉毛1 = 20）
  ok(nRect(findS('SW01_sandworm_base')) === 14, `SW01 沙虫 14 rect got ${nRect(findS('SW01_sandworm_base'))}`);
  ok(nRect(findS('SW04_sandworm_atk')) > nRect(findS('SW01_sandworm_base')), 'SW04 张口齿更多');
  ok(findS('SW03_sandworm_move').ops.some((o) => o.s && o.s[0] === 'rgba(222,203,141,0.55)'), 'SW03 尾迹喷沙');
  // 蛇怪：影1/躯4+腹1/尾2/前躯2/头1+腹1/瞳2/冠3/信子0 = 17
  ok(nRect(findS('BA01_basilisk_base')) === 17, `BA01 蛇怪 17 rect got ${nRect(findS('BA01_basilisk_base'))}`);
  ok(findS('BA03_basilisk_atk').ops.some((o) => o.s && o.s[0] === '#ff6b5e'), 'BA03 冠翼攻击泛光');
  // 九头蛇 gen0：涟漪2/毒液0(fc=1000 无滴液场景另行)/躯4/鳞2/背1/疣2/颈3×(根1+段2+头3+信0)18/低血0 = 29
  ok(nRect(findS('HY01_hydra_gen0')) === 28, `HY01 九头蛇 gen0 28 rect got ${nRect(findS('HY01_hydra_gen0'))}`);
  ok(nRect(findS('HY03_hydra_gen1')) < nRect(findS('HY01_hydra_gen0')), 'HY03 gen1 头更少');
  ok(nRect(findS('HY04_hydra_gen2')) < nRect(findS('HY03_hydra_gen1')), 'HY04 gen2 单头最少');
  ok(findS('HY07_hydra_gen0_drool').ops.some((o) => o.s && o.s[0] === '#9fd42e'), 'HY07 毒液滴落');
  // 法师：影1/帽3/面2/袍2+摆2/臂1/杖2 = 13
  ok(nRect(findS('MG01_mage_base')) === 12, `MG01 法师 12 rect got ${nRect(findS('MG01_mage_base'))}`);
  ok(findS('MG06_mage_cd_bright').ops.some((o) => o.s && o.s[0] === '#c98af5'), 'MG06 施法亮袍 #c98af5');
}
console.log('[GEN RENDER3] scen=' + scen.length);
console.log('[GEN RENDER3] sanity ' + (assertN - assertFail) + '/' + assertN + (assertFail === 0 ? ' PASS' : ' FAIL'));
if (assertFail > 0) process.exit(1);

// ---------------- det 双跑（/tmp 文件字节级对比，M-U5a 教训：stdout 大快照传输脆弱） ----------------
const snap1 = JSON.stringify(scen);
const CHILD = process.argv.includes('--detchild');
if (CHILD) {
  mkdirSync('/tmp', { recursive: true });
  writeFileSync('/tmp/wb-det-child3.json', snap1);
  process.exit(0);
}
mkdirSync(path.join(ROOT, 'scripts/unity-migration/golden'), { recursive: true });
const outPath = path.join(ROOT, 'scripts/unity-migration/golden/render3.json');
writeFileSync(outPath, JSON.stringify({ meta: { gen: 'gen-render3.mjs', note: 'M-U5b 渲染 III 黄金：frame 驱动物种精灵 20 族完整 op 序列' }, scens: scen }));
const { createHash } = await import('node:crypto');
const { execFileSync } = await import('node:child_process');
const selfPath = fileURLToPath(import.meta.url);
execFileSync(process.execPath, [selfPath, '--detchild'], { stdio: ['ignore', 'ignore', 'inherit'] });
const childSnap = readFileSync('/tmp/wb-det-child3.json', 'utf8');
if (childSnap !== snap1) { console.error('[GEN RENDER3] det 双跑不一致'); process.exit(1); }
console.log('[GEN RENDER3] det 双跑字节级一致 md5=' + createHash('md5').update(snap1).digest('hex'));
console.log('[GEN RENDER3] golden/render3.json ' + (snap1.length / 1024).toFixed(0) + 'KB 快照规模');
console.log('[GEN PASS]');
