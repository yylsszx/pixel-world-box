// gen-render2.mjs — M-U5a 渲染 II 黄金向量生成器：sprites.ts 精灵像素画（bail 契约展开为完整 op 序列）
// 真实现 = sprites.ts 12 函数直调（无 bail 折叠——与 gen-render.mjs 的"折叠为 bailCalls"相反，
// 本 gen 不打标、逐 op 全录）—— 纪律②零同源复制：被测对象就是 src/lib/game/sprites.ts 原函数。
// 函数集（M-U4 已锁签名 7 + 中档五族 5）：
//   drawTree / drawMountainProp / drawPerson / drawPersonFine / drawQuadFine
//   drawBoat / drawCaravan / drawSheep / drawWolf / drawSnowWolf / drawBear / drawDeer
// dump 协议：f64 → u64 bits hex（小端 16 字符）；ops = {o, a:[f64hex…], s:[fillStyle|strokeStyle,lineWidth|null…]}
//   style 按 op 消费归一化（与 gen-render.mjs dumpOpRange 同协议）：fillRect→[fillStyle]；strokeRect→[strokeStyle,lineWidth]；其余 null
// 跑法：node scripts/unity-migration/gen-render2.mjs（jiti 转译；自带 sanity + det 双跑 + [GEN PASS]）
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// ---------------- 无头垫片：录制版 canvas/ctx（必须在 import sprites 之前挂好） ----------------
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
    this.imageSmoothingEnabled = true;
    this.font = '';
    this.textAlign = 'left';
    this.textBaseline = 'alphabetic';
    this.lineCap = 'butt';
    this.lineJoin = 'miter';
  }
  _rec(o, args) {
    this.ops.push({ o, a: args, s: [this.fillStyle, this.strokeStyle, this.lineWidth, this.globalAlpha] });
  }
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

// 精灵真实现直调（不打 bail 标——展开契约）
const SP = await jiti.import(path.join(ROOT, 'src/lib/game/sprites.ts'));
const { RACES } = await jiti.import(path.join(ROOT, 'src/lib/game/types.ts'));

// 动态物种注册（涌现有 v3）：drawPerson/drawPersonFine 的 vis = RACES[race]?.vis 查表（非 Unit 字段）。
// 夹具仿 engine.ts 种化注册 {...parentDef, key:'dynN', vis}（id≥100 与预设枚举隔离）；
// C#/镜像侧以 raceVis 入参等价接收（同一 race 同一 vis，查表上提语义不变）。
RACES[100] = { ...RACES[0], key: 'dyn100', name: '测试亚种甲', dynTint: '#a1e8d0',
  vis: { root: 0, hue: 15, lum: 1.1, size: 1, bulk: 0.7, horns: 2, spikes: 0, ears: 2, crest: 1, glow: 1, pattern: 1, tail: 0, mane: 0 } };
RACES[101] = { ...RACES[3], key: 'dyn101', name: '测试亚种乙', dynTint: '#f0a1e8',
  vis: { root: 9, hue: -10, lum: 0.9, size: 1, bulk: 0.3, horns: 1, spikes: 0, ears: 1, crest: 0, glow: 0, pattern: 2, tail: 0, mane: 0 } };
RACES[102] = { ...RACES[0], key: 'dyn102', name: '测试亚种丙', dynTint: '#c0d8a0',
  vis: { root: 0, hue: 20, lum: 1.05, size: 1, bulk: 0.2, horns: 1, spikes: 0, ears: 0, crest: 1, glow: 1, pattern: 0, tail: 0, mane: 0 } };
RACES[103] = { ...RACES[0], key: 'dyn103', name: '测试亚种丁', dynTint: '#d0a1e0',
  vis: { root: 0, hue: -25, lum: 0.95, size: 1, bulk: 0.2, horns: 2, spikes: 0, ears: 0, crest: 0, glow: 0, pattern: 1, tail: 0, mane: 0 } };
RACES[104] = { ...RACES[19], key: 'dyn104', name: '测试亚种戊', dynTint: '#a0c0e8',
  vis: { root: 19, hue: 5, lum: 1.2, size: 1, bulk: 0.2, horns: 0, spikes: 0, ears: 1, crest: 0, glow: 0, pattern: 2, tail: 0, mane: 0 } };
const RACE_VIS = { 100: RACES[100].vis, 101: RACES[101].vis, 102: RACES[102].vis, 103: RACES[103].vis, 104: RACES[104].vis };

// ---------------- dump 工具 ----------------
function f64hex(v) {
  const b = new DataView(new ArrayBuffer(8));
  b.setFloat64(0, v ?? 0, true);
  let s = '';
  for (let i = 0; i < 8; i++) s += b.getUint8(i).toString(16).padStart(2, '0');
  return s;
}
// style 按 op 消费归一化（M-U4 同协议）
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
// 精灵画布：12 函数全部在"世界画布"上画（2px/tile 或 4px/tile 基准），画布尺寸对结果无影响
// （无裁剪语义——与 render() 的视口剔除无关，这里只测函数本体），用 256×256 充裕画布。
function sprScene(name, fn, call) {
  const ctx = mkCanvas(256, 256).getContext();
  call(ctx);
  scen.push({ name, fn, in: call.__in, ops: dumpOps(ctx) });
}
// 夹具 Unit 最小构造（十二函数读取字段并集；未列字段与函数无关）
function mkU(o) {
  return {
    id: 1, name: 'U', race: o.race ?? 0, civ: o.civ ?? -1,
    x: o.x ?? 40, y: o.y ?? 30, rx: o.rx, ry: o.ry, dpx: o.dpx, dpy: o.dpy,
    flip: o.flip ? 1 : 0, lx: o.lx, ly: o.ly,
    wep: o.wep ?? null, arm: o.arm ?? null, hlm: o.hlm ?? null,
    atk: o.atk ?? 0, trait: o.trait ?? null, age: o.age ?? 20, maxAge: o.maxAge ?? 100,
    hurt: o.hurt ?? 0, hp: o.hp ?? 60, maxHp: o.maxHp ?? 60,
    panic: o.panic, boat: o.boat ? 1 : 0, caravan: o.caravan ?? 0, king: o.king ? 1 : 0,
    job: o.job ?? 0, infected: !!o.infected, dead: 0, vis: o.vis ?? undefined,
  };
}
// Unit 参数 dump（in 契约：C#/镜像按此重建夹具）
function dumpU(u) {
  return {
    race: u.race, civ: u.civ,
    x: f64hex(u.x), y: f64hex(u.y),
    rx: u.rx === undefined ? null : f64hex(u.rx), ry: u.ry === undefined ? null : f64hex(u.ry),
    dpx: u.dpx === undefined ? null : f64hex(u.dpx), dpy: u.dpy === undefined ? null : f64hex(u.dpy),
    flip: u.flip ? 1 : 0,
    lx: u.lx === undefined ? null : f64hex(u.lx), ly: u.ly === undefined ? null : f64hex(u.ly),
    wep: u.wep ?? null, arm: u.arm ?? null, hlm: u.hlm ?? null,
    atk: f64hex(u.atk ?? 0), trait: u.trait ?? null,
    age: u.age, maxAge: u.maxAge,
    hurt: u.hurt, hp: f64hex(u.hp), maxHp: f64hex(u.maxHp),
    job: u.job, infected: u.infected ? 1 : 0, king: u.king,
  };
}
function dumpVis(u) { return RACE_VIS[u.race] ? JSON.stringify(RACE_VIS[u.race]) : null; }
// 人形/船/商队场景宏：opt → mkU + 调用真函数
const CIV0 = [59, 125, 216];
function personScene(name, opt, civColor = CIV0, t = 1000) {
  const u = mkU(opt);
  sprScene(name, 'drawPerson', (ctx) => SP.drawPerson(ctx, u, civColor, t));
  scen[scen.length - 1].in = { u: dumpU(u), raceVis: dumpVis(u), civColor: civColor ? civColor.map((c) => c) : null, t };
}
function personFineScene(name, opt, civColor = CIV0, t = 1000, crown = false) {
  const u = mkU(opt);
  sprScene(name, 'drawPersonFine', (ctx) => SP.drawPersonFine(ctx, u, civColor, t, crown));
  scen[scen.length - 1].in = { u: dumpU(u), raceVis: dumpVis(u), civColor: civColor ? civColor.map((c) => c) : null, t, crown: crown ? 1 : 0 };
}
function quadScene(name, opt, kind, t = 1000, crown = false) {
  const u = mkU(opt);
  sprScene(name, 'drawQuadFine', (ctx) => SP.drawQuadFine(ctx, u, kind, t, crown));
  scen[scen.length - 1].in = { u: dumpU(u), kind, t, crown: crown ? 1 : 0 };
}
function boatScene(name, opt, civColor = CIV0, frame = 1000) {
  const u = mkU(opt);
  sprScene(name, 'drawBoat', (ctx) => SP.drawBoat(ctx, u, civColor, frame));
  scen[scen.length - 1].in = { u: dumpU(u), civColor: civColor ? civColor.map((c) => c) : null, frame };
}
function caravanScene(name, opt, civColor = CIV0, frame = 1000) {
  const u = mkU(opt);
  sprScene(name, 'drawCaravan', (ctx) => SP.drawCaravan(ctx, u, civColor, frame));
  scen[scen.length - 1].in = { u: dumpU(u), civColor: civColor ? civColor.map((c) => c) : null, frame };
}
function midScene(name, fnName, opt) {
  const u = mkU(opt);
  sprScene(name, fnName, (ctx) => SP[fnName](ctx, u));
  scen[scen.length - 1].in = { u: dumpU(u) };
}

// ============================================================
// 段 A：drawTree（四季 × 变体分支）
// ============================================================
const TX = 20, TY = 15; // px=80, py=60
function treeScene(name, variant, season = 1) {
  sprScene(name, 'drawTree', (ctx) => SP.drawTree(ctx, TX, TY, variant, season));
  scen[scen.length - 1].in = { x: TX, y: TY, variant, season };
}
treeScene('TR01_winter_snow', 3, 3);      // 冬 + %3==0 枝头积雪
treeScene('TR02_winter_nosnow', 4, 3);    // 冬 + %3!=0 光秃
treeScene('TR03_autumn_gold_dark', 6, 2); // 秋金 dark（%3==0）+ 落叶(&2=2,+2;&1=0)
treeScene('TR04_autumn_red_light', 1, 2); // 秋红 light（odd,%3!=0）+ %7==1 无落叶
treeScene('TR05_autumn_gold_light', 10, 2); // 秋金 light（%3=1）+ 落叶(&2=2)
treeScene('TR06_spring_sakura', 9, 0);    // 春樱（%9==0）+ 飘落花瓣
treeScene('TR07_spring_green_dark', 3, 0); // 春绿 dark
treeScene('TR08_spring_green_light', 4, 0);
treeScene('TR09_summer_dark_hi', 15, 1);  // 夏 dark + %5==0 亮档高光
treeScene('TR10_summer_light', 4, 1);     // 夏 light

// ============================================================
// 段 B：drawMountainProp（岩纹/雪线三分支）
// ============================================================
function mtnScene(name, variant, elev, cold) {
  sprScene(name, 'drawMountainProp', (ctx) => SP.drawMountainProp(ctx, TX, TY, variant, elev, cold));
  scen[scen.length - 1].in = { x: TX, y: TY, variant, elev: elev === undefined ? null : elev, cold: cold === undefined ? null : cold };
}
mtnScene('MT01_base_nosnow', 40);          // 无雪 无岩纹
mtnScene('MT02_rock', 45);                 // %5==0 岩纹 2 rect
mtnScene('MT03_snow_hash', 151);           // variant>150 哈希雪线（旧调用侧）
mtnScene('MT04_snow_elev', 40, 180, 0.2);  // elev>170 海拔雪线
mtnScene('MT05_snow_cold', 40, 160, 0.8);  // cold>0.6 && elev>150 寒冷雪线
mtnScene('MT06_nosnow_elevcold', 40, 150, 0.5); // 双门不过 → 无雪

// ============================================================
// 段 C：drawPerson（中档人形：giant/常规 + 六种族 + 六职业 + 装备/状态/vis）
// ============================================================
personScene('P01_human_civ', { civ: 0 });                       // 静止基态（t=1000 breath0）
personScene('P02_human_civ_flip', { civ: 0, flip: 1 });
personScene('P03_human_nociv', {});                             // 无王国默认衣
personScene('P04_giant', { civ: 0, trait: 'giant' });           // 巨人整身放大
personScene('P05_giant_musket', { civ: 0, trait: 'giant', wep: 'musket' });
personScene('P06_giant_musket_atk', { civ: 0, trait: 'giant', wep: 'musket', atk: 5 }); // 枪口焰
personScene('P07_giant_laser', { civ: 0, trait: 'giant', wep: 'laser_rifle' });         // 能量槽 t>>3 偶
personScene('P08_giant_laser_atk', { civ: 0, trait: 'giant', wep: 'laser_rifle', atk: 5 }); // 青束尖
personScene('P09_giant_sword_atk', { civ: 0, trait: 'giant', wep: 'sword3', atk: 5 });  // 举剑
personScene('P10_goblin', { civ: 0, race: 20 });                // 哥布林矮一号+大耳
personScene('P11_zombie', { civ: 0, race: 5 });                 // 僵尸前伸臂+腐发
personScene('P12_elf', { civ: 0, race: 1 });                    // 尖耳
personScene('P13_dwarf', { civ: 0, race: 2 });                  // 宽躯干+盔+须
personScene('P14_orc', { civ: 0, race: 3 });                    // 獠牙红瞳
personScene('P15_bandit', { civ: 0, race: 4 });                 // 兜帽
personScene('P16_lizard_tailup', { civ: 0, race: 19 }, CIV0, 1016); // 蜥蜴冠+吻+摆尾(t>>3&1=1)
personScene('P17_elder', { civ: 0, age: 90, maxAge: 100 });     // 年逾78% 灰发
personScene('P18_move_step0', { civ: 0, lx: 39.5, ly: 30 }, CIV0, 1000); // (1000>>2)&1=0
personScene('P19_move_step1', { civ: 0, lx: 39.5, ly: 30 }, CIV0, 1004); // =1 bob
personScene('P20_breath', { civ: 0 }, CIV0, 1016);              // 静止呼吸 (1016>>4)&1=1
personScene('P21_musket_atk', { civ: 0, wep: 'musket', atk: 5 }); // 常规身形枪口焰
personScene('P22_laser_shield', { civ: 0, wep: 'laser_rifle', arm: 'energy_shield' }, CIV0, 1008); // 护盾光晕(t>>2&1=0)
personScene('P23_sword_atk', { civ: 0, wep: 'sword', atk: 5 }); // 白刃光
personScene('P24_armor2', { civ: 0, arm: 'armor2' });           // 钢甲片
personScene('P25_armor1', { civ: 0, arm: 'armor1' });           // 皮甲
personScene('P26_job1', { civ: 0, job: 1 });                    // 伐木黄盔徽
personScene('P27_job2', { civ: 0, job: 2 });                    // 兵钢盔+红缨
personScene('P28_job3', { civ: 0, job: 3 });                    // 农锄
personScene('P29_job4', { civ: 0, job: 4 });                    // 建橙盔
personScene('P30_job5', { civ: 0, job: 5 });                    // 商金袋
personScene('P31_job6', { civ: 0, job: 6 });                    // 学者紫卷
personScene('P32_infected_lowhp', { civ: 0, infected: 1, hp: 20, maxHp: 60 }); // 感染点+红条
personScene('P33_vis_full', { civ: 0, race: 100 });            // 涌现亚种全标记（ears2/horns2/crest/glow/pattern1/bulk0.7）
personScene('P34_vis_min', { civ: 0, race: 101 });             // root=9 红肤 shiftRgb + horns1/ears1/pattern2

// ============================================================
// 段 D：drawPersonFine（精绘 ×4 人形：四相步态/装备全族/种族五官/vis）
// ============================================================
personFineScene('PF01_base_civ', { civ: 0 });                   // 静止（ph=-1）
personFineScene('PF02_flip', { civ: 0, flip: 1 });
personFineScene('PF03_nociv', {});
personFineScene('PF04_ph0', { civ: 0, lx: 39.5, ly: 30 }, CIV0, 1008); // (1008>>2)&3=0
personFineScene('PF05_ph1', { civ: 0, lx: 39.5, ly: 30 }, CIV0, 1012); // =1
personFineScene('PF06_ph2', { civ: 0, lx: 39.5, ly: 30 }, CIV0, 1000); // =2
personFineScene('PF07_ph3', { civ: 0, lx: 39.5, ly: 30 }, CIV0, 1004); // =3 bob
personFineScene('PF08_breath', { civ: 0 }, CIV0, 1016);
personFineScene('PF09_zombie', { civ: 0, race: 5 });
personFineScene('PF10_atk_sword', { civ: 0, wep: 'sword', atk: 5 });   // 举臂+剑举高+白刃光
personFineScene('PF11_atk_nowep', { civ: 0, atk: 5 });                 // 只举臂
personFineScene('PF12_dwarf', { civ: 0, race: 2 });
personFineScene('PF13_bandit_hood', { race: 4 });                      // 无 civ 才触发兜帽
personFineScene('PF14_bandit_civ', { civ: 0, race: 4 });               // 有 civ 不触发（对照）
personFineScene('PF15_orc', { civ: 0, race: 3 });
personFineScene('PF16_elf', { civ: 0, race: 1 });
personFineScene('PF17_goblin', { civ: 0, race: 20 });
personFineScene('PF18_lizard', { civ: 0, race: 19 });                  // 含发型段脊冠
personFineScene('PF19_arm_steel', { civ: 0, arm: 'armor2' });
personFineScene('PF20_arm_leather', { civ: 0, arm: 'armor1' });
personFineScene('PF21_hlm_steel', { civ: 0, hlm: 'hlm2' });
personFineScene('PF22_hlm_leather', { civ: 0, hlm: 'hlm1' });
personFineScene('PF23_axe_berserker', { civ: 0, wep: 'berserker_axe' });
personFineScene('PF24_axe_plain', { civ: 0, wep: 'axe' });
personFineScene('PF25_spear', { civ: 0, wep: 'spear' });
personFineScene('PF26_bow', { civ: 0, wep: 'bow' });                   // 唯一 strokeRect
personFineScene('PF27_musket', { civ: 0, wep: 'musket' });
personFineScene('PF28_rifle', { civ: 0, wep: 'rifle' });               // 瞄具
personFineScene('PF29_laser_glow_a', { civ: 0, wep: 'laser_rifle' }, CIV0, 1000); // t>>3 偶 #3ec6d8
personFineScene('PF30_laser_glow_b', { civ: 0, wep: 'laser_rifle' }, CIV0, 1016); // 奇 #7df9ff
personFineScene('PF31_laser_atk', { civ: 0, wep: 'laser_rifle', atk: 5 }); // 三段青束
personFineScene('PF32_musket_atk', { civ: 0, wep: 'musket', atk: 5 }); // 黄白焰
personFineScene('PF33_flame_sword_a', { civ: 0, wep: 'flame_sword' }, CIV0, 1000); // (1000>>2)&1=0 无余烬
personFineScene('PF34_flame_sword_b', { civ: 0, wep: 'flame_sword' }, CIV0, 1004); // =1 余烬
personFineScene('PF35_crown', { civ: 0 }, CIV0, 1000, true);           // 国王金冠
personFineScene('PF36_elder', { civ: 0, age: 90, maxAge: 100 });
personFineScene('PF37_infected', { civ: 0, infected: 1, hp: 20 });
personFineScene('PF38_vis_h1_crest_glow', { civ: 0, race: 102 }); // horns1+crest+glow
personFineScene('PF39_vis_h2_pat1', { civ: 0, race: 103 });    // horns2+pattern1 躯干纹
personFineScene('PF40_vis_ears_pat2', { civ: 0, race: 104 });  // lizard 父种 ears1+pattern2

// ============================================================
// 段 E：drawQuadFine（精绘 ×4 四足兽：五族/四相/状态/王冠/摆尾）
// ============================================================
quadScene('Q01_wolf', {}, 'wolf');
quadScene('Q02_snowwolf', {}, 'snowwolf');
quadScene('Q03_sheep', {}, 'sheep');
quadScene('Q04_bear', {}, 'bear');
quadScene('Q05_deer', {}, 'deer');
quadScene('Q06_wolf_flip', { flip: 1 }, 'wolf');
quadScene('Q07_sheep_ph0', { lx: 39.5, ly: 30 }, 'sheep', 1008);
quadScene('Q08_sheep_ph1', { lx: 39.5, ly: 30 }, 'sheep', 1012);
quadScene('Q09_sheep_ph2', { lx: 39.5, ly: 30 }, 'sheep', 1000);
quadScene('Q10_sheep_ph3', { lx: 39.5, ly: 30 }, 'sheep', 1004);
quadScene('Q11_wolf_hurt', { hurt: 5 }, 'wolf');
quadScene('Q12_sheep_infected', { infected: 1 }, 'sheep');
quadScene('Q13_bear_crown', {}, 'bear', 1000, true);
quadScene('Q14_wolf_wag', {}, 'wolf', 1016);   // (1016>>3)&1=1 wag=-1

// ============================================================
// 段 F：drawBoat / drawCaravan（起伏/摆动相位/王国色/状态）
// ============================================================
boatScene('B01_boat_civ', { civ: 0, boat: 1 });                    // fc=1000: bob1 wk0
boatScene('B02_boat_nociv', { boat: 1 }, null);                    // 白帆黄旗
boatScene('B03_boat_flip', { boat: 1, flip: 1 });
boatScene('B04_boat_bob0_wk0', { boat: 1 }, CIV0, 990);            // /9=110 even, /5=198 even
boatScene('B05_boat_bob0_wk1', { boat: 1 }, CIV0, 995);            // wk1 尾迹摆
boatScene('B06_boat_hurt', { boat: 1, hurt: 5 });
boatScene('B07_boat_lowhp', { boat: 1, hp: 20, maxHp: 60 });
caravanScene('C01_caravan_civ', { civ: 0, caravan: 1 }, CIV0, 960);   // bob0 step0
caravanScene('C02_caravan_flip', { caravan: 1, flip: 1 });
caravanScene('C03_caravan_bob1_step1', { caravan: 1 }, CIV0, 982);    // /6=163 odd, /4=245 odd
caravanScene('C04_caravan_bob1_step0', { caravan: 1 }, CIV0, 978);    // /6=163, /4=244 even
caravanScene('C05_caravan_hurt', { caravan: 1, hurt: 5 });
caravanScene('C06_caravan_lowhp', { caravan: 1, hp: 20, maxHp: 60 });
caravanScene('C07_caravan_nociv', { caravan: 1 }, null);              // 黄旗

// ============================================================
// 段 G：中档五族（drawSheep/drawWolf/drawSnowWolf/drawBear/drawDeer）
// ============================================================
midScene('S01_sheep', 'drawSheep', { race: 6 });
midScene('S02_sheep_infected', 'drawSheep', { race: 6, infected: 1 });
midScene('S03_sheep_flip', 'drawSheep', { race: 6, flip: 1 });
midScene('S04_wolf', 'drawWolf', { race: 7 });
midScene('S05_wolf_hurt', 'drawWolf', { race: 7, hurt: 3 });
midScene('S06_wolf_flip', 'drawWolf', { race: 7, flip: 1 });
midScene('S07_snowwolf', 'drawSnowWolf', { race: 15 });
midScene('S08_snowwolf_flip', 'drawSnowWolf', { race: 15, flip: 1 });
midScene('S09_bear', 'drawBear', { race: 8 });
midScene('S10_deer', 'drawDeer', { race: 10 });

// ---------------- sanity 断言 ----------------
let assertN = 0, assertFail = 0;
function ok(cond, msg) {
  assertN++;
  if (!cond) { assertFail++; console.error('  [SANITY FAIL]', msg); }
}
function findS(name) { const s = scen.find((x) => x.name === name); if (!s) throw new Error('missing scenario ' + name); return s; }
function nRect(s) { return s.ops.filter((o) => o.o === 'fillRect').length; }
function styleOf(s, i) { return s.ops[i] && s.ops[i].s ? s.ops[i].s[0] : null; }
{
  // 树：结构 rect 数（冬秃 ~5-7 / 秋 8-10 / 春樱 5 / 夏 6）
  const tr1 = findS('TR01_winter_snow');
  ok(tr1.ops.every((o) => o.o === 'fillRect'), 'TR01 全 fillRect');
  ok(styleOf(tr1, 0) === 'rgba(0,0,0,0.22)', 'TR01 根影开头 rgba(0,0,0,0.22)');
  ok(nRect(findS('TR02_winter_nosnow')) === 5, `TR02 冬秃 5 rect got ${nRect(findS('TR02_winter_nosnow'))}`);
  ok(nRect(findS('TR01_winter_snow')) === 7, `TR01 冬雪 7 rect got ${nRect(findS('TR01_winter_snow'))}`);
  ok(nRect(findS('TR03_autumn_gold_dark')) === 8, `TR03 秋金 8 rect(含 2 落叶) got ${nRect(findS('TR03_autumn_gold_dark'))}`);
  ok(nRect(findS('TR04_autumn_red_light')) === 6, `TR04 秋红无落叶 6 rect got ${nRect(findS('TR04_autumn_red_light'))}`);
  ok(nRect(findS('TR06_spring_sakura')) === 7, `TR06 樱 7 rect got ${nRect(findS('TR06_spring_sakura'))}`);
  const tr9 = findS('TR09_summer_dark_hi');
  ok(tr9.ops[3].s && tr9.ops[3].s[0] === '#6fc04a', 'TR09 %5==0 高光亮档 #6fc04a @op3');
  // 山：真值 MT01(40) 基态含岩纹（40%5==0）9 rect；雪线 +3
  ok(nRect(findS('MT01_base_nosnow')) === 9, `MT01 基态 9 rect got ${nRect(findS('MT01_base_nosnow'))}`);
  ok(nRect(findS('MT02_rock')) === 9, 'MT02 岩纹 9（45%5==0 同样触发岩纹，与基态等量）');
  ok(nRect(findS('MT04_snow_elev')) === 12, 'MT04 海拔雪线 12（9+3）');
  ok(nRect(findS('MT06_nosnow_elevcold')) === 9, 'MT06 双门不过无雪 9');
  // 人形：P01 真值 9 rect（阴影/腮2/躯干/腮2/发/肤/瞳）；裤色 rgb(34,55,84)=mix(mix(蓝,[30,30,30],.25),[20,18,14],.55)
  const p1 = findS('P01_human_civ');
  ok(styleOf(p1, 0) === 'rgba(0,0,0,0.28)', 'P01 阴影 rgba(0,0,0,0.28)');
  ok(styleOf(p1, 1) === 'rgb(34,55,84)', `P01 裤色 got ${styleOf(p1, 1)}`);
  ok(nRect(p1) === 9, `P01 基态 9 rect got ${nRect(p1)}`);
  const p4 = findS('P04_giant');
  ok(styleOf(p4, 0) === 'rgba(0,0,0,0.3)', 'P04 巨人阴影 0.3');
  ok(nRect(findS('P13_dwarf')) === nRect(findS('P01_human_civ')) + 2, `P13 矮人+盔须 2 rect（铜盔/须各 1）`);
  const p16 = findS('P16_lizard_tailup');
  ok(nRect(p16) === 13, `P16 蜥蜴摆尾 13 rect got ${nRect(p16)}`);
  ok(styleOf(p16, p16.ops.length - 1) === '#2c5e24', 'P16 摆尾 #2c5e24 收尾');
  const p17 = findS('P17_elder');
  ok(p17.ops.some((o) => o.s && o.s[0] === '#c9c5bd'), 'P17 长者灰发 #c9c5bd');
  const p33 = findS('P33_vis_full');
  ok(nRect(p33) === 16, `P33 涌现全标记 16 rect got ${nRect(p33)}`);
  ok(p33.ops.some((o) => o.s && o.s[0] === '#7df9ff'), 'P33 荧光瞳 #7df9ff');
  ok(p33.ops.some((o) => o.s && o.s[0] === '#e9e5c9'), 'P33 角色移 shiftColor(#e8dcc8,-0.08)');
  ok(p33.ops.some((o) => o.s && o.s[0] === '#e19368'), 'P33 头冠色移 shiftColor(#cf3f2e,+0.1)');
  ok(p33.ops.some((o) => o.s && o.s[0] === 'rgb(226,201,125)'), 'P33 肤色 shiftRgb(SKIN[0])');
  // 精绘：PF01 真值 22 rect（阴影3/腮2/靴2/腰带+扣/躯干3/腮2/颈/头+双瞳/发4 高光）
  const f1 = findS('PF01_base_civ');
  ok(nRect(f1) === 22, `PF01 基态 22 rect got ${nRect(f1)}`);
  ok(styleOf(f1, 0) === 'rgba(0,0,0,0.3)' && styleOf(f1, 1) === 'rgba(0,0,0,0.3)', 'PF01 椭圆阴影前 2 rect 同色');
  ok(f1.ops.some((o) => o.s && o.s[0] === '#3a2c1c'), 'PF01 靴色');
  ok(f1.ops.some((o) => o.s && o.s[0] === '#d9a941'), 'PF01 金扣');
  ok(f1.ops.some((o) => o.s && o.s[0] === 'rgb(38,67,107)'), 'PF01 背阴列 clothDark');
  ok(!findS('PF01_base_civ').ops.some((o) => o.o === 'strokeRect'), 'PF01 无 strokeRect');
  ok(nRect(findS('PF26_bow')) === nRect(findS('PF01_base_civ')) + 1 && findS('PF26_bow').ops.some((o) => o.o === 'strokeRect'), 'PF26 弓 strokeRect 唯一');
  ok(findS('PF35_crown').ops.some((o) => o.s && o.s[0] === '#ffe9a8'), 'PF35 冠亮芯');
  // 四足：Q01 真值 20 rect（阴影3/腮4/躯干+脊线+腹缘/背纹2/头3/鼻/眼/耳2/尾2）
  const q1 = findS('Q01_wolf');
  ok(nRect(q1) === 20, `Q01 狼 20 rect got ${nRect(q1)}`);
  ok(styleOf(q1, 0) === 'rgba(0,0,0,0.28)', 'Q01 阴影');
  ok(q1.ops.some((o) => o.s && o.s[0] === '#14100c'), 'Q01 鼻尖/眼黑');
  ok(q1.ops.some((o) => o.s && o.s[0] === 'rgb(112,110,107)'), 'Q01 尾巴 mix(body,dark,0.35)');
  ok(findS('Q13_bear_crown').ops.some((o) => o.s && o.s[0] === '#ffe9a8'), 'Q13 四足冠亮芯');
  // 船/商队
  const b1 = findS('B01_boat_civ');
  ok(b1.ops.some((o) => o.s && o.s[0] === 'rgba(240,248,255,0.65)'), 'B01 尾迹 0.65');
  ok(b1.ops.some((o) => o.s && o.s[0] === 'rgb(59,125,216)'), 'B01 王国帆 rgb');
  ok(findS('B02_boat_nociv').ops.some((o) => o.s && o.s[0] === '#f2ead8'), 'B02 无王国白帆');
  const c1 = findS('C01_caravan_civ');
  ok(c1.ops.some((o) => o.s && o.s[0] === 'rgba(0,0,0,0.25)'), 'C01 车辙影 0.25');
  ok(c1.ops.some((o) => o.s && o.s[0] === '#d9a94e'), 'C01 麻袋金');
  // 五族
  ok(nRect(findS('S01_sheep')) === 2, 'S01 羊 2 rect');
  ok(nRect(findS('S04_wolf')) === 2, 'S04 狼 2 rect');
  ok(nRect(findS('S07_snowwolf')) === 4, 'S07 雪狼 4 rect');
  ok(nRect(findS('S09_bear')) === 3, 'S09 熊 3 rect');
  ok(nRect(findS('S10_deer')) === 6, 'S10 鹿 6 rect');
  const s2 = findS('S02_sheep_infected');
  ok(s2.ops[0].s && s2.ops[0].s[0] === '#b8e2b4', 'S02 感染绿 #b8e2b4 @op0');
}
console.log('[GEN RENDER2] scen=' + scen.length);
console.log('[GEN RENDER2] sanity ' + (assertN - assertFail) + '/' + assertN + (assertFail === 0 ? ' PASS' : ' FAIL'));
if (assertFail > 0) process.exit(1);

// ---------------- det 双跑（子进程重跑 + 快照 md5 对比） ----------------
const snap1 = JSON.stringify(scen);
const CHILD = process.argv.includes('--detchild');
if (CHILD) {
  mkdirSync('/tmp', { recursive: true });
  writeFileSync('/tmp/wb-det-child.json', snap1);
  process.exit(0);
}
mkdirSync(path.join(ROOT, 'scripts/unity-migration/golden'), { recursive: true });
const outPath = path.join(ROOT, 'scripts/unity-migration/golden/render2.json');
writeFileSync(outPath, JSON.stringify({ meta: { gen: 'gen-render2.mjs', note: 'M-U5a 渲染 II 黄金：sprites 12 函数像素画完整 op 序列（bail 契约展开）' }, scens: scen }));
const { createHash } = await import('node:crypto');
const { execFileSync } = await import('node:child_process');
const selfPath = fileURLToPath(import.meta.url);
execFileSync(process.execPath, [selfPath, '--detchild'], { stdio: ['ignore', 'ignore', 'inherit'] });
// det 对比走临时文件（287KB stdout 传输脆弱；文件字节级对比稳定）
const childSnap = (await import('node:fs')).readFileSync('/tmp/wb-det-child.json', 'utf8');
if (childSnap !== snap1) { console.error('[GEN RENDER2] det 双跑不一致'); process.exit(1); }
console.log('[GEN RENDER2] det 双跑字节级一致 md5=' + createHash('md5').update(snap1).digest('hex'));
console.log('[GEN RENDER2] golden/render2.json ' + (snap1.length / 1024).toFixed(0) + 'KB 快照规模');
console.log('[GEN PASS]');
