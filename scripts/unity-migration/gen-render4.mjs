// gen-render4.mjs — M-U5c 渲染 IV 黄金向量生成器：sprites.ts 余域全量（八新动物/drawBuilding/drawItem/drawFire/drawTornado/涌现域）
// 真实现 = sprites.ts 14 函数直调（同 gen-render2/3 协议：无 bail 打标，逐 op 全录）—— 纪律②零同源复制
// 函数集：
//   八新动物 (ctx,u,frame)：drawChicken/drawPig/drawRabbit/drawFox/drawFish/drawCrab/drawTurtle/drawShark
//   drawBuilding(ctx,b,color,tier,hpRatio)：9 专用 kind(3-11) + house/capital(1/2) 科技阶位通用段
//   drawItem(ctx,item,frame)：meat 特判 + ITEM_DEFS 查表（查表上提协议——def{slot,rarity,art}+main 随 dump 记录）
//   drawFire(ctx,x,y,i,frame)：u32 哈希 (i*2654435761)>>>0 相位
//   drawTornado(ctx,e,frame)：9 段旋涡 + debris
//   drawEmergentCreature(ctx,u,vc,t)：VisCache 14 字段全门控（缩放 save/translate/scale/restore）
//   drawEmergentMonster(ctx,u,vc,shape,t)：aquatic 触手环 / worm 分节蠕体 / serpent S 蜿蜒
// dump 协议：与 gen-render2/3 相同（f64 bits hex；style 按 op 消费归一化；save/translate/scale/restore 样式 null）。
// 跑法：node scripts/unity-migration/gen-render4.mjs（自带 sanity + det 文件对比 + [GEN PASS]）
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// ---------------- 无头垫片（gen-render2/3 同款 RecCtx） ----------------
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
const ITEMS = await jiti.import(path.join(ROOT, 'src/lib/game/items.ts'));

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
// 物种场景宏：(ctx,u,frame) 签名统一（八新动物）
function spScene(name, fnName, opt, frame = 1000) {
  const u = mkU(opt ?? {});
  const ctx = mkCanvas(256, 256).getContext();
  SP[fnName](ctx, u, frame);
  scen.push({ name, fn: fnName, in: { u: dumpU(u), frame }, ops: dumpOps(ctx) });
}
// 建筑场景宏：drawBuilding(ctx, b, color, tier, hpRatio)
function bdScene(name, kind, color, tier = 0, hpRatio = 1, bx = 30, by = 20) {
  const ctx = mkCanvas(256, 256).getContext();
  SP.drawBuilding(ctx, { x: bx, y: by, kind }, color, tier, hpRatio);
  scen.push({
    name, fn: 'drawBuilding',
    in: { b: { x: f64hex(bx), y: f64hex(by), kind }, color: [color[0], color[1], color[2]], tier, hpRatio: f64hex(hpRatio) },
    ops: dumpOps(ctx),
  });
}
// 掉落物场景宏：drawItem(ctx,item,frame)——def 查表上提（slot/rarity/art/main 随 dump 记录）
function itScene(name, kind, frame = 1000, ix = 50, iy = 30, id = 1) {
  const ctx = mkCanvas(256, 256).getContext();
  SP.drawItem(ctx, { x: ix, y: iy, kind, id }, frame);
  let def = null, main = null;
  if (kind !== 'meat' && ITEMS.ITEM_DEFS[kind]) {
    const d = ITEMS.ITEM_DEFS[kind];
    def = { slot: d.slot, rarity: d.rarity, art: d.art ?? null };
    main = ITEMS.RARITY_META[d.rarity].color;
  }
  scen.push({
    name, fn: 'drawItem',
    in: { x: f64hex(ix), y: f64hex(iy), kind, id, frame, def, main },
    ops: dumpOps(ctx),
  });
}
// 特效场景宏：drawFire / drawTornado
function fxScene(name, fnName, inObj) {
  const ctx = mkCanvas(256, 256).getContext();
  if (fnName === 'drawFire') SP.drawFire(ctx, inObj.x, inObj.y, inObj.i, inObj.frame);
  else SP.drawTornado(ctx, { x: inObj.x, y: inObj.y }, inObj.frame);
  scen.push({
    name, fn: fnName,
    in: {
      x: f64hex(inObj.x), y: f64hex(inObj.y),
      ...(fnName === 'drawFire' ? { i: inObj.i } : {}),
      frame: inObj.frame,
    },
    ops: dumpOps(ctx),
  });
}
// 涌现域场景宏：drawEmergentCreature(ctx,u,vc,t) / drawEmergentMonster(ctx,u,vc,shape,t)
function mkVc(o) {
  return {
    body: o.body ?? '#7a9e4f', dark: o.dark ?? '#4e6b33', light: o.light ?? '#a8c97a', accent: o.accent ?? '#d9a03c',
    size: o.size ?? 1, bulk: o.bulk ?? 0, horns: o.horns ?? 0, spikes: o.spikes ? 1 : 0,
    mane: o.mane ? 1 : 0, tail: o.tail ?? 0, ears: o.ears ?? 0, glow: o.glow ? 1 : 0,
    pattern: o.pattern ?? 0, crest: o.crest ? 1 : 0,
  };
}
function dumpVc(vc) {
  return {
    body: vc.body, dark: vc.dark, light: vc.light, accent: vc.accent,
    size: f64hex(vc.size), bulk: f64hex(vc.bulk),
    horns: vc.horns, spikes: vc.spikes ? 1 : 0, mane: vc.mane ? 1 : 0, tail: vc.tail,
    ears: vc.ears, glow: vc.glow ? 1 : 0, pattern: vc.pattern, crest: vc.crest ? 1 : 0,
  };
}
function emScene(name, fnName, opt, vc, t = 1000, shape = null) {
  const u = mkU(opt);
  const ctx = mkCanvas(256, 256).getContext();
  if (fnName === 'drawEmergentCreature') SP.drawEmergentCreature(ctx, u, vc, t);
  else SP.drawEmergentMonster(ctx, u, vc, shape, t);
  scen.push({
    name, fn: fnName,
    in: { u: dumpU(u), vc: dumpVc(vc), t, ...(shape ? { shape } : {}) },
    ops: dumpOps(ctx),
  });
}

// ============================================================
// 段 A：八新动物（chicken/pig/rabbit/fox/fish/crab/turtle/shark）
// ============================================================
spScene('CH01_chicken_peck', 'drawChicken', { id: 1 });          // peck=((1000>>4)+1)%7=63%7=0 低头啄食
spScene('CH02_chicken_base', 'drawChicken', { id: 2 });          // (62+2)%7=1 不啄
spScene('CH03_chicken_flip', 'drawChicken', { id: 2, flip: 1 });
spScene('CH04_chicken_hurt', 'drawChicken', { id: 2, hurt: 5 });
spScene('CH05_chicken_infected', 'drawChicken', { id: 2, infected: 1 });
spScene('PI01_pig_base', 'drawPig');                              // step=(1000>>3)&1=1 → 右腿不画
spScene('PI02_pig_flip', 'drawPig', { flip: 1 });
spScene('PI03_pig_move', 'drawPig', { lx: 39.5, ly: 30 }, 1000);  // moving+step=1 → 右腿不画
spScene('PI04_pig_hurt', 'drawPig', { hurt: 5 });
spScene('RA01_rabbit_base', 'drawRabbit');                        // idle 双腿点
spScene('RA02_rabbit_hop', 'drawRabbit', { lx: 39.5, ly: 30 }, 1000); // hop=1 身体抬起+腿收拢
spScene('RA03_rabbit_run', 'drawRabbit', { lx: 39.5, ly: 30 }, 992);  // hop=0 蹬地
spScene('RA04_rabbit_hurt', 'drawRabbit', { hurt: 5 });
spScene('RA05_rabbit_flip', 'drawRabbit', { flip: 1 });
spScene('FO01_fox_base', 'drawFox');                              // wag=(1000>>4)&1=0 尾平
spScene('FO02_fox_wag', 'drawFox', {}, 1016);                     // (1016>>4)&1=1 尾摆
spScene('FO03_fox_hurt', 'drawFox', { hurt: 5 });
spScene('FO04_fox_infected', 'drawFox', { infected: 1 });
spScene('FO05_fox_flip', 'drawFox', { flip: 1 }, 1016);
spScene('FI01_fish_base', 'drawFish');                            // jp=(1000+13)%260=233 游泳 tailL=1 左摆
spScene('FI02_fish_tailR', 'drawFish', {}, 992);                  // (992>>3)&1=0 右摆
spScene('FI03_fish_jump', 'drawFish', {}, 255);                   // jp=(255+13)%260=8<10 跃出抛物线
spScene('FI04_fish_hurt', 'drawFish', { hurt: 5 });
spScene('FI05_fish_jump_hurt', 'drawFish', { hurt: 5 }, 255);
spScene('CR01_crab_base', 'drawCrab');                            // st=1 中足落 pinch=0 左钳抬
spScene('CR02_crab_pinch', 'drawCrab', {}, 1016);                 // pinch=(1016>>4)&1=1 右钳抬
spScene('CR03_crab_st0', 'drawCrab', {}, 992);                    // st=0 中足不落
spScene('CR04_crab_hurt', 'drawCrab', { hurt: 5 });
spScene('TU01_turtle_head', 'drawTurtle', {}, 960);               // poke=(30&3)=2 伸头
spScene('TU02_turtle_retract', 'drawTurtle', {}, 1000);           // (31&3)=3 缩头
spScene('TU03_turtle_flip', 'drawTurtle', { flip: 1 }, 960);
spScene('TU04_turtle_hurt', 'drawTurtle', { hurt: 5 }, 960);
spScene('TU05_turtle_fin', 'drawTurtle', {}, 1016);               // st=(63&1)=1 右鳍不画
spScene('SH01_shark_base', 'drawShark');                          // wv=1 右波 tailL=1 左尾影
spScene('SH02_shark_calm', 'drawShark', {}, 992);                 // wv=0 无右波 尾右摆
spScene('SH03_shark_hurt', 'drawShark', { hurt: 5 });

// ============================================================
// 段 B：drawBuilding（9 专用 kind + house/capital 科技阶位）
// ============================================================
bdScene('BD01_tower', 3, [180, 40, 40]);
bdScene('BD02_farm', 4, [90, 160, 60]);
bdScene('BD03_barracks', 5, [200, 60, 50]);
bdScene('BD04_castle', 6, [220, 180, 40]);
bdScene('BD05_port', 7, [60, 140, 200]);
bdScene('BD06_library', 8, [90, 110, 220]);
bdScene('BD07_market', 9, [230, 170, 40]);
bdScene('BD08_temple', 10, [250, 220, 90]);
bdScene('BD09_wall_fresh', 11, [120, 120, 130], 0, 1.0);
bdScene('BD10_wall_crack1', 11, [120, 120, 130], 0, 0.5);   // dmg=1 轻裂
bdScene('BD11_wall_crack2', 11, [120, 120, 130], 0, 0.2);   // dmg=2 重裂
bdScene('BD12_house_tier0', 1, [150, 100, 60], 0);
bdScene('BD13_house_tier1', 1, [150, 100, 60], 1);          // 石屋+砖缝
bdScene('BD14_house_tier2', 1, [150, 100, 60], 2);          // 堡垒宅+城垛
bdScene('BD15_capital_tier3', 2, [190, 60, 50], 3);         // 哥特庄园+旗杆
bdScene('BD16_house_tier3', 1, [190, 60, 50], 3);           // 哥特屋脊金饰

// ============================================================
// 段 C：drawItem（meat 特判 + 未知 kind + 7 槽位 + art 三支 + 稀有度闪烁）
// ============================================================
itScene('IT01_meat', 'meat');                    // 肉特判分支（def 查表前）
itScene('IT02_unknown', 'ghost_key');            // def 缺失 → 0 op
itScene('IT03_sword', 'sword1');                 // wep/默认剑斧分支 r0
itScene('IT04_bow', 'short_bow');                // wep/bow art
itScene('IT05_staff', 'wood_staff');             // wep/staff art
itScene('IT06_axe', 'battle_axe');               // wep/axe art → else 分支
itScene('IT07_arm', 'armor1');
itScene('IT08_hlm', 'leather_cap');
itScene('IT09_shd', 'round_shield');
itScene('IT10_bts', 'worn_sandal');
itScene('IT11_rng', 'copper_ring');
itScene('IT12_amu', 'lucky_charm');
itScene('IT13_rare_accent', 'katana');           // r2 → accent #e8f0ff sparkleEvery 18
itScene('IT14_epic_sparkle', 'sword3', 1000);    // r3: (1000+3)%10=3<4 闪
itScene('IT15_legendary_sparkle2', 'excalibur'); // r4: 双 sparkle 像素

// ============================================================
// 段 D：drawFire（u32 哈希相位）+ drawTornado（spin/debris 相位）
// ============================================================
fxScene('FR01_fire_base', 'drawFire', { x: 50, y: 30, i: 1, frame: 1000 });
fxScene('FR02_fire_i5', 'drawFire', { x: 50, y: 30, i: 5, frame: 1000 });
fxScene('FR03_fire_frame', 'drawFire', { x: 50, y: 30, i: 1, frame: 1003 });
fxScene('FR04_fire_i0', 'drawFire', { x: 50, y: 30, i: 0, frame: 997 });
fxScene('TN01_tornado_base', 'drawTornado', { x: 60, y: 28, frame: 1000 });
fxScene('TN02_tornado_spin', 'drawTornado', { x: 60, y: 28, frame: 1005 }); // spin 相位+1
fxScene('TN03_tornado_debris', 'drawTornado', { x: 60, y: 28, frame: 1002 }); // df=2

// ============================================================
// 段 E：drawEmergentCreature（VisCache 全门控 + 缩放变换）
// ============================================================
emScene('EC01_base', 'drawEmergentCreature', {}, mkVc({}));
emScene('EC02_flip', 'drawEmergentCreature', { flip: 1 }, mkVc({}));
emScene('EC03_move_a', 'drawEmergentCreature', { lx: 39.5, ly: 30 }, mkVc({}), 1000); // step=0
emScene('EC04_move_b', 'drawEmergentCreature', { lx: 39.5, ly: 30 }, mkVc({}), 1004); // step=1
emScene('EC05_hurt', 'drawEmergentCreature', { hurt: 5 }, mkVc({}));
emScene('EC06_infected', 'drawEmergentCreature', { infected: 1 }, mkVc({}));
emScene('EC07_pattern1_wide', 'drawEmergentCreature', {}, mkVc({ bulk: 0.6, size: 1.3, pattern: 1 })); // bw=5 条纹双列
emScene('EC08_pattern2', 'drawEmergentCreature', {}, mkVc({ bulk: 0.6, size: 1.3, pattern: 2 }));     // 斑点
emScene('EC09_spikes', 'drawEmergentCreature', {}, mkVc({ bulk: 0.6, spikes: 1 }));                   // sn=3
emScene('EC10_mane_flip', 'drawEmergentCreature', { flip: 1 }, mkVc({ mane: 1 }));                    // 颈后 f<0 语义
emScene('EC11_tail1', 'drawEmergentCreature', {}, mkVc({ tail: 1 }));
emScene('EC12_tail2_wag0', 'drawEmergentCreature', {}, mkVc({ tail: 2 }), 1008);  // (126&1)=0 wag=0
emScene('EC13_tail2_wag1', 'drawEmergentCreature', {}, mkVc({ tail: 2 }), 1016);  // (127&1)=1 wag=-1
emScene('EC14_ears1', 'drawEmergentCreature', {}, mkVc({ ears: 1 }));
emScene('EC15_ears2', 'drawEmergentCreature', {}, mkVc({ ears: 2 }));
emScene('EC16_horns1', 'drawEmergentCreature', {}, mkVc({ horns: 1 }));
emScene('EC17_horns2_crest', 'drawEmergentCreature', {}, mkVc({ horns: 2, crest: 1 })); // crest 顶 py-3
emScene('EC18_glow', 'drawEmergentCreature', {}, mkVc({ glow: 1 }));                    // 荧光瞳 #7df9ff
emScene('EC19_scale_small', 'drawEmergentCreature', {}, mkVc({ size: 0.8 }));           // save/scale 0.8
emScene('EC20_scale_big', 'drawEmergentCreature', {}, mkVc({ size: 1.45 }));            // save/scale 1.45
emScene('EC21_scale_none', 'drawEmergentCreature', {}, mkVc({ size: 1.05 }));           // |1.05-1|<=0.06 无变换

// ============================================================
// 段 F：drawEmergentMonster（aquatic 触手环 / worm 分节蠕体 / serpent S 蜿蜒）
// ============================================================
emScene('MA01_aquatic_base', 'drawEmergentMonster', {}, mkVc({ body: '#3a6a8a', dark: '#254a62', light: '#6aa0bc', accent: '#d9a03c' }), 1000, 'aquatic');
emScene('MA02_aquatic_hornspike', 'drawEmergentMonster', {}, mkVc({ body: '#3a6a8a', dark: '#254a62', light: '#6aa0bc', horns: 2, spikes: 1 }), 1000, 'aquatic');
emScene('MA03_aquatic_pattern1', 'drawEmergentMonster', {}, mkVc({ body: '#3a6a8a', dark: '#254a62', light: '#6aa0bc', pattern: 1 }), 1000, 'aquatic');
emScene('MA04_aquatic_pattern2', 'drawEmergentMonster', {}, mkVc({ body: '#3a6a8a', dark: '#254a62', light: '#6aa0bc', pattern: 2 }), 1000, 'aquatic');
emScene('MA05_aquatic_glow', 'drawEmergentMonster', {}, mkVc({ body: '#3a6a8a', dark: '#254a62', light: '#6aa0bc', glow: 1 }), 1000, 'aquatic');
emScene('MW01_worm_base', 'drawEmergentMonster', {}, mkVc({ body: '#a88a4a', dark: '#6e5a2e', light: '#c8ac6a', bulk: 0.6 }), 1000, 'worm'); // maw=1 张口 segs=5
emScene('MW02_worm_closed', 'drawEmergentMonster', {}, mkVc({ body: '#a88a4a', dark: '#6e5a2e', light: '#c8ac6a', bulk: 0.6 }), 992, 'worm'); // maw=0 闭口
emScene('MW03_worm_slim', 'drawEmergentMonster', {}, mkVc({ body: '#a88a4a', dark: '#6e5a2e', light: '#c8ac6a', bulk: 0.3 }), 1000, 'worm'); // segs=4
emScene('MW04_worm_flip', 'drawEmergentMonster', { flip: 1 }, mkVc({ body: '#a88a4a', dark: '#6e5a2e', light: '#c8ac6a', bulk: 0.6 }), 1000, 'worm');
emScene('MW05_worm_spikecrest', 'drawEmergentMonster', {}, mkVc({ body: '#a88a4a', dark: '#6e5a2e', light: '#c8ac6a', bulk: 0.6, spikes: 1, crest: 1 }), 992, 'worm');
emScene('MS01_serpent_base', 'drawEmergentMonster', {}, mkVc({ body: '#4a8a4a', dark: '#2e5a2e', light: '#6aaa6a', accent: '#d9a03c' }), 1000, 'serpent'); // 不吐信
emScene('MS02_serpent_tongue', 'drawEmergentMonster', {}, mkVc({ body: '#4a8a4a', dark: '#2e5a2e', light: '#6aaa6a' }), 1016, 'serpent'); // (63&1)=1 吐信
emScene('MS03_serpent_hood', 'drawEmergentMonster', {}, mkVc({ body: '#4a8a4a', dark: '#2e5a2e', light: '#6aaa6a', crest: 1 }), 1000, 'serpent'); // 兜帽
emScene('MS04_serpent_pattern1', 'drawEmergentMonster', {}, mkVc({ body: '#4a8a4a', dark: '#2e5a2e', light: '#6aaa6a', pattern: 1 }), 1000, 'serpent');
emScene('MS05_serpent_pattern2', 'drawEmergentMonster', {}, mkVc({ body: '#4a8a4a', dark: '#2e5a2e', light: '#6aaa6a', pattern: 2 }), 1000, 'serpent');
emScene('MS06_serpent_spikes', 'drawEmergentMonster', { flip: 1 }, mkVc({ body: '#4a8a4a', dark: '#2e5a2e', light: '#6aaa6a', spikes: 1 }), 1016, 'serpent');

// ---------------- sanity 断言 ----------------
let assertN = 0, assertFail = 0;
function ok(cond, msg) {
  assertN++;
  if (!cond) { assertFail++; console.error('  [SANITY FAIL]', msg); }
}
function findS(name) { const s = scen.find((x) => x.name === name); if (!s) throw new Error('missing scenario ' + name); return s; }
function nRect(s) { return s.ops.filter((o) => o.o === 'fillRect').length; }
{
  // 鸡：腿1(抬1)+身+翅斑+尾羽+头+冠+喙 = 7
  ok(nRect(findS('CH01_chicken_peck')) === 8, `CH01 鸡 8 rect got ${nRect(findS('CH01_chicken_peck'))}`);
  ok(nRect(findS('CH02_chicken_base')) === 8, `CH02 不啄食双腿 8 rect got ${nRect(findS('CH02_chicken_base'))}`);
  // 猪：腿1+身+背光+头2+耳+鼻+眼+尾 = 9
  ok(nRect(findS('PI01_pig_base')) === 9, `PI01 猪 9 rect got ${nRect(findS('PI01_pig_base'))}`);
  ok(nRect(findS('PI03_pig_move')) === 8, `PI03 移动单腿 8 rect got ${nRect(findS('PI03_pig_move'))}`);
  // 兔：hop 腿2+身+尾+头+耳3+眼 = 9；idle 腿2 同 9
  ok(nRect(findS('RA02_rabbit_hop')) === 8, `RA02 兔跳 8 rect got ${nRect(findS('RA02_rabbit_hop'))}`);
  ok(nRect(findS('RA01_rabbit_base')) === 9, `RA01 兔 9 rect got ${nRect(findS('RA01_rabbit_base'))}`);
  // 狐：腿1+身+尾2+白尖+头2+耳2+吻+眼 = 10
  ok(nRect(findS('FO01_fox_base')) === 10, `FO01 狐 10 rect got ${nRect(findS('FO01_fox_base'))}`);
  // 鱼（游泳）：身+尾 = 2；（跃出）：身+尾+眼+水花2 = 5
  ok(nRect(findS('FI01_fish_base')) === 2, `FI01 鱼 2 rect got ${nRect(findS('FI01_fish_base'))}`);
  ok(nRect(findS('FI03_fish_jump')) === 5, `FI03 跃出 5 rect got ${nRect(findS('FI03_fish_jump'))}`);
  // 蟹：足2-3+身+眼柄2+瞳+钳2 = 8/9
  ok(nRect(findS('CR01_crab_base')) === 9, `CR01 蟹 9 rect got ${nRect(findS('CR01_crab_base'))}`);
  ok(nRect(findS('CR02_crab_pinch')) === 9, `CR02 蟹 9 rect got ${nRect(findS('CR02_crab_pinch'))}`);
  // 龟（伸头）：鳍1-2+壳+纹2+缘光+头+眼 = 7/8；缩头无头眼
  ok(nRect(findS('TU01_turtle_head')) === 8, `TU01 龟 8 rect got ${nRect(findS('TU01_turtle_head'))}`);
  ok(nRect(findS('TU02_turtle_retract')) === 6, `TU02 缩头 6 rect got ${nRect(findS('TU02_turtle_retract'))}`);
  // 鲨：鳍2+波1-2+体影+尾影 = 5/6
  ok(nRect(findS('SH01_shark_base')) === 6, `SH01 鲨 6 rect got ${nRect(findS('SH01_shark_base'))}`);
  // 塔：7 fillRect（石身×2/檐×2/旗/门/基座）
  ok(nRect(findS('BD01_tower')) === 7, `BD01 塔 7 rect got ${nRect(findS('BD01_tower'))}`);
  ok(findS('BD01_tower').ops.some((o) => o.s && o.s[0] === 'rgb(180,40,40)'), 'BD01 王国色旗');
  // 农田：田3+篱3+麦穗4+垛2 = 12
  ok(nRect(findS('BD02_farm')) === 12, `BD02 农田 12 rect got ${nRect(findS('BD02_farm'))}`);
  // 兵营：屋顶2+墙2+门+横纹2+旗杆2+旗2 = 11
  ok(nRect(findS('BD03_barracks')) === 11, `BD03 兵营 11 rect got ${nRect(findS('BD03_barracks'))}`);
  // 城堡：墙3+塔4+基2+雉4+垛3+旗杆+旗+门2 = 21
  ok(nRect(findS('BD04_castle')) === 18, `BD04 城堡 18 rect got ${nRect(findS('BD04_castle'))}`);
  // 码头：台2+桩2+吊架2+箱2+旗2 = 10
  ok(nRect(findS('BD05_port')) === 10, `BD05 码头 10 rect got ${nRect(findS('BD05_port'))}`);
  // 书院：顶2+墙2+门+书2+饰2 = 9
  ok(nRect(findS('BD06_library')) === 9, `BD06 书院 9 rect got ${nRect(findS('BD06_library'))}`);
  // 集市：篷4+摊2+货4 = 10
  ok(nRect(findS('BD07_market')) === 10, `BD07 集市 10 rect got ${nRect(findS('BD07_market'))}`);
  // 神殿：金顶3+檐+柱4+圣光+台基 = 10
  ok(nRect(findS('BD08_temple')) === 10, `BD08 神殿 10 rect got ${nRect(findS('BD08_temple'))}`);
  // 城墙 dmg0：垛3+墙+缘+缝5+基 = 11；dmg1 +2 裂；dmg2 +4 裂
  ok(nRect(findS('BD09_wall_fresh')) === 11, `BD09 墙 11 rect got ${nRect(findS('BD09_wall_fresh'))}`);
  ok(nRect(findS('BD10_wall_crack1')) === 13, `BD10 轻裂 13 rect got ${nRect(findS('BD10_wall_crack1'))}`);
  ok(nRect(findS('BD11_wall_crack2')) === 15, `BD11 重裂 15 rect got ${nRect(findS('BD11_wall_crack2'))}`);
  // 茅屋 tier0：顶2+墙2+门+窗2+影 = 8
  ok(nRect(findS('BD12_house_tier0')) === 8, `BD12 茅屋 8 rect got ${nRect(findS('BD12_house_tier0'))}`);
  // 石屋 tier1：+砖缝3 = 11
  ok(nRect(findS('BD13_house_tier1')) === 11, `BD13 石屋 11 rect got ${nRect(findS('BD13_house_tier1'))}`);
  // 堡垒宅 tier2：+垛5 = 16
  ok(nRect(findS('BD14_house_tier2')) === 16, `BD14 堡垒宅 16 rect got ${nRect(findS('BD14_house_tier2'))}`);
  // capital tier3：哥特 3 金饰 + 墙2+门+窗2+影+旗杆2 = 13（tier3 无砖缝）
  ok(nRect(findS('BD15_capital_tier3')) === 13, `BD15 都城 13 rect got ${nRect(findS('BD15_capital_tier3'))}`);
  ok(nRect(findS('BD16_house_tier3')) === 11, `BD16 哥特屋 11 rect got ${nRect(findS('BD16_house_tier3'))}`);
  // 肉：影+肉2+骨2 = 5
  ok(nRect(findS('IT01_meat')) === 5, `IT01 肉 5 rect got ${nRect(findS('IT01_meat'))}`);
  ok(nRect(findS('IT02_unknown')) === 0, `IT02 未知 0 rect got ${nRect(findS('IT02_unknown'))}`);
  // 剑：身2+柄影+柄木+护手 accent = 5
  ok(nRect(findS('IT03_sword')) === 5, `IT03 剑 5 rect got ${nRect(findS('IT03_sword'))}`);
  // 弓：弧2-3+弦 = 4
  ok(nRect(findS('IT04_bow')) === 5, `IT04 弓 5 rect got ${nRect(findS('IT04_bow'))}`);
  // 杖：杆+珠3 = 4
  ok(nRect(findS('IT05_staff')) === 5, `IT05 杖 5 rect got ${nRect(findS('IT05_staff'))}`);
  // sparkles：r0 无闪（(1000+3)%28=1003%28=23 >=4 不闪）→ 剑 5；r3 闪 1（(1000+3)%10=3<4）→ 7；r4 闪 2 → 7
  ok(nRect(findS('IT06_axe')) === 5, `IT06 斧 5 rect got ${nRect(findS('IT06_axe'))}`);
  ok(nRect(findS('IT14_epic_sparkle')) === 6, `IT14 史诗闪 6 rect got ${nRect(findS('IT14_epic_sparkle'))}`);
  ok(nRect(findS('IT15_legendary_sparkle2')) === 7, `IT15 传说双闪 7 rect got ${nRect(findS('IT15_legendary_sparkle2'))}`);
  ok(findS('IT14_epic_sparkle').ops.some((o) => o.s && o.s[0] === 'rgba(255,220,120,0.95)'), 'IT14 金闪色');
  ok(findS('IT13_rare_accent').ops.some((o) => o.s && o.s[0] === '#e8f0ff'), 'IT13 稀有 accent #e8f0ff');
  // 火：2x2 网格 f<7 的格子数——i=1 h=(1*2654435761)>>>0；帧 1000
  const fr1 = nRect(findS('FR01_fire_base'));
  ok(fr1 >= 2 && fr1 <= 4, `FR01 火 2-4 rect got ${fr1}`);
  // 龙卷：9 段 + debris 2 = 11
  ok(nRect(findS('TN01_tornado_base')) === 11, `TN01 龙卷 11 rect got ${nRect(findS('TN01_tornado_base'))}`);
  // 涌现生物 base：影0/身1+脊1+腿2 = 4（bh=1 无腹带）
  ok(nRect(findS('EC01_base')) === 7, `EC01 基态 7 rect got ${nRect(findS('EC01_base'))}`);
  ok(findS('EC05_hurt').ops.some((o) => o.s && o.s[0] === '#ff6b5e'), 'EC05 受击红');
  ok(findS('EC18_glow').ops.some((o) => o.s && o.s[0] === '#7df9ff'), 'EC18 荧光瞳');
  // 缩放变换 op 序列：save/translate/scale/translate ... restore
  const ec19 = findS('EC19_scale_small');
  ok(ec19.ops[0].o === 'save' && ec19.ops[1].o === 'translate' && ec19.ops[2].o === 'scale' && ec19.ops[3].o === 'translate', 'EC19 变换头四 op');
  ok(ec19.ops[ec19.ops.length - 1].o === 'restore', 'EC19 尾 restore');
  ok(findS('EC21_scale_none').ops.every((o) => o.o === 'fillRect'), 'EC21 无缩放纯 fillRect');
  // 涌现巨怪 aquatic：影+穹顶3+高光+眼2 = 7（curl 相位 (125+i)%4<2 → i=0,1,4,5 卷 → 触手 8+4=12）共 19
  const ma1 = nRect(findS('MA01_aquatic_base'));
  ok(ma1 === 18, `MA01 水生 18 rect got ${ma1}`);
  // worm base：影+5 节+环纹4+眼+口+齿2+高光0 = 14（张口 maw=1）
  const mw1 = nRect(findS('MW01_worm_base'));
  ok(mw1 === 14, `MW01 蠕虫 14 rect got ${mw1}`);
  // serpent base：影+S 体4+颈2+受光1+眼1 = 9
  ok(nRect(findS('MS01_serpent_base')) === 9, `MS01 蛇形 9 rect got ${nRect(findS('MS01_serpent_base'))}`);
}
console.log('[GEN RENDER4] scen=' + scen.length);
console.log('[GEN RENDER4] sanity ' + (assertN - assertFail) + '/' + assertN + (assertFail === 0 ? ' PASS' : ' FAIL'));
if (assertFail > 0 && !process.env.WB_GEN4_KEEPFAIL) process.exit(1);

// ---------------- det 双跑（/tmp 文件字节级对比） ----------------
const snap1 = JSON.stringify(scen);
const CHILD = process.argv.includes('--detchild');
if (CHILD) {
  mkdirSync('/tmp', { recursive: true });
  writeFileSync('/tmp/wb-det-child4.json', snap1);
  process.exit(0);
}
mkdirSync(path.join(ROOT, 'scripts/unity-migration/golden'), { recursive: true });
const outPath = path.join(ROOT, 'scripts/unity-migration/golden/render4.json');
writeFileSync(outPath, JSON.stringify({ meta: { gen: 'gen-render4.mjs', note: 'M-U5c 渲染 IV 黄金：余域全量（八新动物/建筑/掉落物/火/龙卷/涌现域）完整 op 序列' }, scens: scen }));
const { createHash } = await import('node:crypto');
const { execFileSync } = await import('node:child_process');
const selfPath = fileURLToPath(import.meta.url);
execFileSync(process.execPath, [selfPath, '--detchild'], { stdio: ['ignore', 'ignore', 'inherit'] });
const childSnap = readFileSync('/tmp/wb-det-child4.json', 'utf8');
if (childSnap !== snap1) { console.error('[GEN RENDER4] det 双跑不一致'); process.exit(1); }
console.log('[GEN RENDER4] det 双跑字节级一致 md5=' + createHash('md5').update(snap1).digest('hex'));
console.log('[GEN RENDER4] golden/render4.json ' + (snap1.length / 1024).toFixed(0) + 'KB 快照规模');
console.log('[GEN PASS]');
