// ============ 自然模拟引擎（板块构造 / 地质演变 / 四季轮转 / 大气环流 / 风暴天灾） ============
// 设计原则：
//   1. 全部子系统由「确定性种子」驱动（板块由 seed 重生成，读档零成本）；
//   2. 分频推进（大气 10 tick / 风暴 40 / 板块 240 / 地质 600）——40k 地图上总开销 < 1ms/tick；
//   3. 天灾不再是无中生有的独立按钮，而是四大系统的自然产物：
//      地震=板块应力释放 → 火山=应力热点喷发 → 灰烬遮蔽=全球降温；
//      气旋=暖洋热能+风场孕育 → 登陆肆虐→遇山抬升触发龙卷；
//      干旱=雨影区长期缺湿 → 沙暴=沙漠+大风；暴雪=极地冬季风暴；洪水=持续暴雨。
import type { GameEngine } from './engine';
import type { Cyclone, NatureSnapshot } from './types';
import { W, H } from './constants';
import { T, R } from './types';
import { mulberry32, valueNoise } from './noise';
import { ep } from './engineParams';

/** 大气粗网格：8 tile 一格（32×20）——平流/风场/云在此粒度演化 */
export const AW = Math.floor(W / 8);
export const AH = Math.floor(H / 8);
export const CELL = 8;
/** 一季 = 2 个游戏年（≈5.4s @1x）：既可见又从容 */
export const SEASON_YEARS = 2;
export const SEASON_NAMES = ['春', '夏', '秋', '冬'];

/** 风暴命名池（台风式中文命名） */
const STORM_NAMES = ['海燕', '山竹', '天鸽', '榴莲', '白鹿', '烟花', '梅花', '轩岚', '玉兔', '木兰', '杜鹃', '海棠', '悟空', '电母', '海神', '冥河', '飓父', '霜牙', '凛冬', '雪龙'];
/** 由风暴 id 确定性取名（存档恢复时零成本重算） */
export const STORM_NAME_AT = (id: number) => STORM_NAMES[Math.min(STORM_NAMES.length - 1, Math.max(0, id) % STORM_NAMES.length)];

/** 冷血种族集合（Task 109）：节律徽章判定用 —— types.RaceDef.coldBlood 的引擎侧镜像 */
const COLD_BLOOD_RACES: ReadonlySet<number> = new Set([R.SCORPION, R.SNAKE, R.LIZARD, R.BASILISK, R.HYDRA, R.TURTLE]);

export class NatureSystem {
  eng: GameEngine;
  seed: number;
  rng: () => number;

  // ---- 板块构造 ----
  /** 每格所属板块 id（0..plateN-1）；由 seed 的抖动 Voronoi 确定性生成 */
  plate = new Uint8Array(W * H);
  plateN = 6;
  /** 每板块漂移向量（单位：格/地质期，±0.6） */
  drift: { dx: number; dy: number }[] = [];
  /** 板块种子质心当前位置（缓慢漂移 → 边界世纪尺度迁移，板块真正在「轮」动） */
  plateCx: number[] = [];
  plateCy: number[] = [];
  /** 构造期计数（每 4 期重算一次 Voronoi 场，摊开销销） */
  plateEpoch = 0;
  /** 板块边界格集合（邻居异板块） */
  boundary = new Set<number>();
  /** 边界应力场（仅边界格有意义；>RELEASE 阈值即触发地震集群释放） */
  stress = new Float32Array(W * H);
  /** 应力释放阈值（单格） */
  static readonly RELEASE = 26;
  /** 火山热点（边界上的固定喷发点，2-4 个） */
  hotspots: { x: number; y: number; heat: number }[] = [];

  // ---- 大气 ----
  /** 湿度场 0-1（粗网格） */
  moist = new Float32Array(AW * AH);
  /** 灰烬平流场 0-1（粗网格）：大喷发注入 → 随风漂移扩散 → 缓慢沉降（v2 取代全局标量，无夏之年先区域后全球） */
  ashF = new Float32Array(AW * AH);
  /** 风场相位（缓慢演化的大尺度湍流） */
  windPhase = 0;
  /** 降雨强度 0-255（上一大气步的落雨格，渲染/灭火/洪水用） */
  rainCell = new Uint8Array(AW * AH);
  /** 洪水累计器（持续暴雨格，>阈值触发洪水） */
  floodAcc = new Float32Array(AW * AH);

  // ---- 风暴 ----
  storms: Cyclone[] = [];
  stormSeq = 1;
  // ---- 气压系统（v2：移动的 H/L 中心——风场的「发动机」，科氏力旋向） ----
  /** 活动气压中心：kind 0=低压(L) 1=高压(H)；低压生雨/增强风暴，高压晴燥 */
  pSystems: { x: number; y: number; kind: number; str: number; ttl: number }[] = [];

  // ---- 全局气候 ----
  /** 火山灰遮蔽 0-1（大喷发后累积，缓慢沉降；>0.3 = 火山冬） */
  ash = 0;
  /** 季节偏移（devNextSeason 累计） */
  seasonOffset = 0;

  // ---- 计数与纪事 ----
  counters = { quakes: 0, quakesBig: 0, eruptions: 0, uplifts: 0, erosions: 0, cyclones: 0, tsunamis: 0, floods: 0, blizzards: 0, droughts: 0 };
  recentQuakes: { x: number; y: number; m: number; year: number }[] = [];

  constructor(eng: GameEngine, seed: number) {
    this.eng = eng;
    this.seed = seed;
    this.rng = mulberry32(seed ^ 0x7ea12d);
  }

  /** 由 seed 确定性初始化板块/漂移/热点（读档时同样调用；质心可被存档覆盖后重算） */
  initPlates() {
    const rand = mulberry32(this.seed ^ 0x51ab7);
    this.plateN = 5 + Math.floor(rand() * 3); // 5-7 板块
    this.drift = [];
    this.plateCx = [];
    this.plateCy = [];
    for (let p = 0; p < this.plateN; p++) {
      this.plateCx.push(20 + rand() * (W - 40));
      this.plateCy.push(12 + rand() * (H - 24));
      const ang = rand() * Math.PI * 2;
      const spd = 0.18 + rand() * 0.42;
      this.drift.push({ dx: Math.cos(ang) * spd, dy: Math.sin(ang) * spd });
    }
    this.recomputePlates();
    // 火山热点：地幔柱固定于世界坐标（不随边界重算迁移——链状火山岛的种子）
    this.hotspots = [];
    const bl = [...this.boundary];
    const nHot = 2 + Math.floor(rand() * 3);
    for (let k = 0; k < nHot && bl.length > 0; k++) {
      const i = bl[Math.floor(rand() * bl.length)];
      this.hotspots.push({ x: i % W, y: (i / W) | 0, heat: 0 });
    }
    this.stress.fill(0);
    this.moist.fill(0.35);
    this.rainCell.fill(0);
    this.floodAcc.fill(0);
    this.ashF.fill(0);
    this.ash = 0;
    this.pSystems = [];
    this.seasonOffset = 0;
    this.storms = [];
    this.stormSeq = 1;
    this.plateEpoch = 0;
    this.counters = { quakes: 0, quakesBig: 0, eruptions: 0, uplifts: 0, erosions: 0, cyclones: 0, tsunamis: 0, floods: 0, blizzards: 0, droughts: 0 };
    this.recentQuakes = [];
  }

  /** 重算 Voronoi 板块场与边界集合（种子漂移后调用；应力只保留仍在边界上的格）
   *  开销：W×H×plateN 欧氏平方距离 ≈ 25 万次比较，每 4 个构造期（≈24 年）一次，<2ms */
  recomputePlates() {
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        let best = 0;
        let bestD = Infinity;
        for (let p = 0; p < this.plateN; p++) {
          const jit = valueNoise(x / 22, y / 22, this.seed + 900 + p * 37) * 34 - 17;
          const d = (x + jit - this.plateCx[p]) ** 2 + (y - this.plateCy[p]) ** 2;
          if (d < bestD) { bestD = d; best = p; }
        }
        this.plate[y * W + x] = best;
      }
    }
    this.boundary.clear();
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        const p = this.plate[i];
        if ((x > 0 && this.plate[i - 1] !== p) || (x < W - 1 && this.plate[i + 1] !== p) || (y > 0 && this.plate[i - W] !== p) || (y < H - 1 && this.plate[i + W] !== p)) {
          this.boundary.add(i);
        } else if (this.stress[i] > 0) {
          this.stress[i] = 0; // 离开边界的格应力归零（断层带随板块迁移）
        }
      }
    }
  }

  // ---------------- 四季 ----------------
  get season(): number {
    if (!this.eng.laws.seasons) return 1; // 永夏
    const s = (Math.floor(this.eng.yearF / SEASON_YEARS) + this.seasonOffset) % 4;
    return s < 0 ? s + 4 : s;
  }
  get seasonName(): string { return SEASON_NAMES[this.season]; }
  /** 地震风险等级 0-3（边界平均应力 / 释放阈值）——神谕上下文与快照共用 */
  get quakeRisk(): number {
    let sum = 0;
    for (const i of this.boundary) sum += this.stress[i];
    const avg = this.boundary.size > 0 ? sum / this.boundary.size : 0;
    return avg > ep('nature.quakeStress') * 0.72 ? 3 : avg > ep('nature.quakeStress') * 0.5 ? 2 : avg > ep('nature.quakeStress') * 0.3 ? 1 : 0;
  }
  /** 季节推进检测（每 40 tick）：变化时全图刷新色调；森林同步重绘树冠（秋红冬秃春花）
   *  换季宣告（季节 × 万物）：真实过渡（lastSeason >= 0，开局/读档静默）时 toast + 编年史，
   *  文案自带机制提示——玩家由此得知季节正在改变生物节律 */
  lastSeason = -1;
  /** 冬季封冻纪事防重标记（瞬态：本轮冬季已播过「千里冰封」；离冬即复位，不入档） */
  iceChronDone = false;
  /** 春汛落冰湖纪事防重标记（瞬态：本春已播过「冰面行人落水」；离春即复位，不入档） */
  thawChronDone = false;
  /** 冬季雪人纪事防重标记（瞬态：本冬已播过「堆雪人」；离冬即复位，不入档） */
  snowmanChronDone = false;
  /** 自然雷暴闪电冷却 tick（瞬态：冷却期内不再落雷，不入档）；本局首场雷暴/雷打雪纪事防重（冬夏各记一次） */
  boltCool = 0;
  boltChronDone = false;
  tSnowChronDone = false;
  /** 自然闪电累计（QA 可观测：eng.nature.lightningN；瞬态不入档） */
  lightningN = 0;
  /** 雨后彩虹（瞬态装饰，不入档）：弧心世界坐标 + TTL tick；prevRain 为上一大气步雨情快照（大雨骤停检测） */
  rainbowX = -1;
  rainbowY = -1;
  rainbowTTL = 0;
  /** 彩虹节流冷却（瞬态）：一道彩虹谢幕后 90s 内不再出新虹——连雨天气防彩虹泛滥 */
  rainbowCool = 0;
  prevRain = new Uint8Array(AW * AH);
  rainbowChronDone = false;
  seasonCheck() {
    const s = this.season;
    if (s !== this.lastSeason) {
      const first = this.lastSeason < 0;
      this.lastSeason = s;
      if (s !== 3) this.iceChronDone = false; // 离冬复位：下个冬季重新择机播报封冻
      if (s !== 3) this.snowmanChronDone = false; // 离冬复位：下个冬季重新播报堆雪人
      if (s !== 0) this.thawChronDone = false; // 离春复位：下个春季重新播报落冰湖
      for (let i = 0; i < W * H; i++) {
        this.eng.dirty.add(i);
        if (this.eng.terrain[i] === T.FOREST) this.eng.propsDirty.add(i);
      }
      if (first) return; // 开局/读档基线：不宣告（HUD 已示当前季节）
      if (s === 0) {
        this.eng.toast('春回大地——草木返青，万物复苏，树人开始了春播', 'good');
        this.eng.addEvent('season', '春回大地：万物复苏，草木返青（生物节律 · 春播加成）');
      } else if (s === 1) {
        this.eng.toast('盛夏来临——烈日当空，野火更易燎原', 'info');
        this.eng.addEvent('season', '盛夏来临：烈日当空，野火更易燎原（火险上升）');
      } else if (s === 2) {
        this.eng.toast('秋色渐染——金风送爽，林梢染红，大地进入收获的季节', 'info');
        this.eng.addEvent('season', '秋色渐染：金风送爽，林梢染红（草木生长放缓）');
      } else {
        this.eng.toast('寒冬降临——霜封大地，蛇虫蛰伏，亡灵在长夜中愈发活跃', 'danger');
        this.eng.addEvent('season', '寒冬降临：霜封大地，蛇虫蛰伏，死灵在长夜中愈发活跃');
      }
    }
  }
  /** 季节对地形基色的调制（flushDirty 调用；返回 rgb 增量；i 为格索引——深时引擎冰川覆被用） */
  tint(t: number, y: number, i = -1): [number, number, number] {
    // 深时引擎：冰川覆被——冰量 >80 的格冬夏皆霜白偏蓝（b 分量偏多的寒冰感；冰上不生草木）
    const ws = this.eng.worldsim;
    if (i >= 0 && ws && ws.glacier[i] > 80) {
      const a = Math.min(1, (ws.glacier[i] - 80) / 100);
      return [Math.round(38 + 8 * a), Math.round(40 + 9 * a), Math.round(52 + 16 * a)];
    }
    const s = this.season;
    if (s === 1 && this.ash < 0.05) return [0, 0, 0];
    const latF = Math.abs(y / H - 0.5) * 2; // 0 赤道 → 1 极地
    let r = 0, g = 0, b = 0;
    if (s === 0) { // 春：草木返青
      if (t === T.GRASS) { r = -6; g = 22; b = -8; }
      else if (t === T.FOREST) { r = -4; g = 18; b = -6; }
    } else if (s === 2) { // 秋：金红染林
      const f = 0.35 + latF * 0.4;
      if (t === T.GRASS) { r = Math.round(38 * f); g = Math.round(14 * f); b = Math.round(-30 * f); }
      else if (t === T.FOREST) { r = Math.round(44 * f); g = Math.round(4 * f); b = Math.round(-36 * f); }
      else if (t === T.HILL) { r = Math.round(14 * f); g = Math.round(2 * f); b = Math.round(-12 * f); }
    } else if (s === 3) { // 冬：霜尘漂白（纬度越高越白）
      const f = Math.max(0, latF - 0.22) * 1.25;
      if (t === T.GRASS) { r = Math.round(62 * f); g = Math.round(58 * f); b = Math.round(52 * f); }
      else if (t === T.FOREST) { r = Math.round(46 * f); g = Math.round(42 * f); b = Math.round(38 * f); }
      else if (t === T.HILL) { r = Math.round(40 * f); g = Math.round(38 * f); b = Math.round(34 * f); }
      else if (t === T.SAND) { r = Math.round(26 * f); g = Math.round(26 * f); b = Math.round(26 * f); }
    }
    // 火山灰遮蔽：全球压暗去饱和（无夏之年的肃杀）
    if (this.ash > 0.05) {
      const a = Math.min(1, this.ash);
      r -= Math.round(26 * a); g -= Math.round(22 * a); b -= Math.round(14 * a);
      if (s === 1 && latF > 0.45) { // 火山冬：夏季也见霜
        const f = (latF - 0.45) * a * 1.8;
        r += Math.round(40 * f); g += Math.round(38 * f); b += Math.round(36 * f);
      }
    }
    return [r, g, b];
  }
  /** 当季生物节律（Task 101）：引擎实况计算——单趟 O(n) 收集存活种族，
   *  对应种族灭绝的节律自动退场（不会对空林播「树人春播」）；火险/繁衍等气候节律常驻。
   *  数值与引擎钩子严格同源：fireMul（夏1.3/冬0.45/秋0.8）、reproMul（春1.14/冬0.78）、
   *  树人播种 pm（春1.3）、巫妖死潮（冬 8/12 tick）、凤凰灰烬 TTL（冬 ×1.5） */
  rhythmChips(): { label: string; desc: string; tone: 'good' | 'info' | 'danger' }[] {
    const s = this.season;
    const out: { label: string; desc: string; tone: 'good' | 'info' | 'danger' }[] = [];
    const present = new Set<number>();
    for (const u of this.eng.units) if (!u.dead) present.add(u.race);
    if (s === 0) {
      out.push({ label: '万物萌动', desc: '繁衍时节 ×1.14，生机盎然', tone: 'good' });
      if (present.has(R.ENT)) out.push({ label: '树人春播', desc: '播种造林 ×1.3，森林扩张', tone: 'good' });
    } else if (s === 1) {
      out.push({ label: '烈日火险', desc: '野火蔓延 ×1.3，天干物燥', tone: 'danger' });
    } else if (s === 2) {
      out.push({ label: '秋高气爽', desc: '火势回落 ×0.8，金风送爽', tone: 'info' });
    } else {
      out.push({ label: '霜寒火抑', desc: '野火蔓延 ×0.45，生息收敛 ×0.78', tone: 'info' });
      if (present.has(R.LICH)) out.push({ label: '死潮高涨', desc: '亡灵复生加速 ×1.5', tone: 'danger' });
      if (present.has(R.HYDRA)) out.push({ label: '九头蛇冬眠', desc: '再生之泉封冻，断首不再萌发', tone: 'info' });
      if (present.has(R.ENT)) out.push({ label: '树人蛰伏', desc: '春播暂停，扑火不休', tone: 'info' });
      if (present.has(R.PHOENIX)) out.push({ label: '涅槃迟缓', desc: '灰烬滞留 ×1.5，重生更慢', tone: 'info' });
      let cold = false;
      for (const cr of COLD_BLOOD_RACES) if (present.has(cr)) { cold = true; break; }
      if (cold) out.push({ label: '冷血缓滞', desc: '变温生物代谢迟缓，移速 ×0.6', tone: 'info' });
    }
    return out;
  }

  /** 火焰蔓延季节/降雨系数（fireTick 概率乘子） */
  fireMul(i: number): number {
    // 深时引擎：冰川覆被之上不燃（冰上无草木可焚）
    const ws = this.eng.worldsim;
    if (ws && ws.glacier[i] > 80) return 0;
    const s = this.season;
    let m = s === 3 ? 0.45 : s === 2 ? 0.8 : s === 0 ? 1.0 : 1.3;
    const c = this.cellOf(i % W, (i / W) | 0);
    if (this.rainCell[c] > 60) m *= 0.45; // 雨区难燃
    return m;
  }
  /** 植被复苏系数（regrow 计时长度除子） */
  regrowMul(): number {
    const s = this.season;
    return s === 0 ? 0.65 : s === 1 ? 0.9 : s === 2 ? 1.15 : 2.0;
  }
  /** 繁衍系数（春生万物） */
  reproMul(): number {
    const s = this.season;
    return s === 0 ? 1.14 : s === 3 ? 0.78 : 1;
  }
  /** 冰缘扩张系数（冬季极地冻结更活跃；火山冬也扩） */
  iceMul(): number {
    let m = this.season === 3 ? 1.8 : this.season === 1 ? 0.55 : 1;
    m += this.ash * 0.8;
    return m;
  }

  /** 赤道辐合带（ITCZ）纬度 0-1：随季节南北摆动（北半球夏偏北/冬偏南）——季风的引擎
   *  信风带/西风带边界随它整体平移 → 近赤道风向季节性反转 */
  get itczLat(): number {
    if (!this.eng.laws.seasons) return 0.5;
    const s = this.season;
    return 0.5 + (s === 1 ? 0.062 : s === 0 ? 0.034 : s === 2 ? -0.026 : -0.062);
  }
  /** 急流强度季节调制（冬季经向温差大 → 急流更强） */
  jetMul(): number {
    const s = this.season;
    return s === 3 ? 1.35 : s === 1 ? 0.85 : 1;
  }

  // ---------------- 大气环流（每 10 tick） ----------------
  cellOf(x: number, y: number): number {
    const cx = Math.min(AW - 1, Math.max(0, (x / CELL) | 0));
    const cy = Math.min(AH - 1, Math.max(0, (y / CELL) | 0));
    return cy * AW + cx;
  }
  /** 风矢量（tile/大气步）：纬向三环（随 ITCZ 摆动）+ 两支急流 + 气压中心科氏旋涡 + 湍流 + 风暴环流 */
  windAt(cx: number, cy: number): [number, number] {
    const lat = cy / (AH - 1); // 0 北极 → 1 南极
    const itcz = this.itczLat;
    const latA = Math.abs(lat - itcz) * 2; // 0 辐合带 → 1 极点
    // 信风(东风)/西风带/极风(东风) —— 三环环流（边界随 ITCZ 季节摆动）
    let u: number;
    if (latA < 0.32) u = -0.55 + latA * 0.9; // 信风带西向
    else if (latA < 0.72) u = 0.75 - (latA - 0.32) * 0.35; // 西风带东向
    else u = -0.45 + (latA - 0.72) * 1.6; // 极风带西向
    // 急流：副热带/副极锋两支窄强东向带（西风带里的「高速公路」，冬季更强）
    const jet = this.jetMul();
    const g1 = Math.exp(-((latA - 0.38) ** 2) / 0.005);
    const g2 = Math.exp(-((latA - 0.62) ** 2) / 0.0098);
    u += (g1 * 0.55 + g2 * 0.95) * jet;
    // 大尺度湍流（缓慢演化，打破对称）
    const n = valueNoise(cx / 6 + this.windPhase, cy / 6 - this.windPhase * 0.6, this.seed + 313) - 0.5;
    const n2 = valueNoise(cx / 9 - this.windPhase * 0.7, cy / 9 + this.windPhase * 0.4, this.seed + 727) - 0.5;
    u += n * 0.5;
    let v = n2 * 0.35;
    // 气压中心旋涡：科氏力（北半球 L 逆时针/H 顺时针，南半球反转）+ 辐合辐散螺旋
    for (const ps of this.pSystems) {
      const dx = cx - ps.x / CELL;
      const dy = cy - ps.y / CELL;
      const d = Math.hypot(dx, dy);
      if (d < 7 && d > 0.3) {
        const nh = lat < 0.5 ? 1 : -1; // 科氏符号（半球）
        const sw = (ps.str * 1.35) / (d * 0.8 + 1);
        const sgn = ps.kind === 0 ? 1 : -1; // 低压逆旋 / 高压顺旋
        u += (-dy / d) * nh * sw * sgn + (dx / d) * sw * (ps.kind === 0 ? -0.22 : 0.16);
        v += (dx / d) * nh * sw * sgn + (dy / d) * sw * (ps.kind === 0 ? -0.22 : 0.16);
      }
    }
    // 风暴气旋式环流（切向卷入）
    for (const st of this.storms) {
      const sx = st.x / CELL;
      const sy = st.y / CELL;
      const dx = cx - sx;
      const dy = cy - sy;
      const d = Math.hypot(dx, dy);
      if (d < 5 && d > 0.4) {
        const pull = (st.strength * 1.6) / (d * d + 1) * 0.8;
        u += (-dy / d) * pull;
        v += (dx / d) * pull;
      }
    }
    return [u, v];
  }
  /** 粗网格单格统计：水域占比 / 平均海拔（0 平原 → 3 山脉） */
  cellStats(cx: number, cy: number): { waterFrac: number; elev: number } {
    const eng = this.eng;
    let water = 0;
    let elev = 0;
    const x0 = cx * CELL;
    const y0 = cy * CELL;
    for (let y = y0; y < y0 + CELL && y < H; y++) {
      for (let x = x0; x < x0 + CELL && x < W; x++) {
        const t = eng.terrain[y * W + x];
        if (t === T.DEEP || t === T.WATER) water++;
        else if (t === T.MOUNTAIN) elev += 3;
        else if (t === T.HILL) elev += 2;
        else if (t === T.LAVA) elev += 3;
        else elev += 1;
      }
    }
    const n = CELL * CELL;
    return { waterFrac: water / n, elev: elev / n };
  }
  atmTick() {
    const eng = this.eng;
    if (!eng.laws.atmosphere) {
      this.prevRain.fill(0); // 大气关停期间清空快照：重启后首拍不得用残留旧雨情误判「骤停出彩虹」
      return;
    }
    if (this.boltCool > 0) this.boltCool -= 10; // 闪电冷却（atmTick 每 10 tick 一步）
    if (this.rainbowCool > 0) this.rainbowCool -= 10;
    this.windPhase += 0.012;
    const s = this.season;
    // —— 气压系统生命周期（风场的发动机：生成/引导气流漂移/衰减） ——
    this.pressureTick();
    // —— 灰烬平流场：随风漂移扩散 + 缓慢沉降（无夏之年先区域后全球） ——
    {
      const nextA = new Float32Array(AW * AH);
      let sum = 0;
      for (let cy = 0; cy < AH; cy++) {
        for (let cx = 0; cx < AW; cx++) {
          const i = cy * AW + cx;
          const [u, v] = this.windAt(cx, cy);
          const sx = Math.min(AW - 1, Math.max(0, Math.round(cx - u * 1.6)));
          const sy = Math.min(AH - 1, Math.max(0, Math.round(cy - v * 1.6)));
          let a = this.ashF[i] * 0.9 + this.ashF[sy * AW + sx] * 0.1;
          a = Math.max(0, a * 0.996 - 0.00028); // 湍流扩散 + 干沉降
          nextA[i] = Math.min(1, a);
          sum += nextA[i];
        }
      }
      this.ashF = nextA;
      this.ash = sum / (AW * AH); // 全局平均（tint / 滤镜 / UI / 火山冬判定）
    }
    const next = new Float32Array(AW * AH);
    // 蒸发 + 平流（半拉格朗日：从上风处采样）
    for (let cy = 0; cy < AH; cy++) {
      for (let cx = 0; cx < AW; cx++) {
        const i = cy * AW + cx;
        const [u, v] = this.windAt(cx, cy);
        const st = this.cellStats(cx, cy);
        let m = this.moist[i];
        // 洋面蒸发（夏强冬弱；ITCZ 辐合带与副热带高压蒸发最旺）
        if (st.waterFrac > 0.5) {
          const latA = Math.abs(cy / (AH - 1) - this.itczLat) * 2;
          let evap = (s === 1 ? 0.028 : s === 3 ? 0.012 : 0.02) * (1 + (latA > 0.28 && latA < 0.4 ? 0.3 : 0) + (latA < 0.08 ? 0.25 : 0));
          // 深时引擎：暖流海面蒸发加成（湾流式暖池向大气输送更多水汽）
          const ws = this.eng.worldsim;
          if (ws && ws.sstAnom[i] > 0) evap *= 1.15;
          m = Math.min(1, m + evap);
        }
        // 平流：上风取样 0.18，本格残留 0.82（云随风走）
        const sx = Math.min(AW - 1, Math.max(0, Math.round(cx - u * 1.6)));
        const sy = Math.min(AH - 1, Math.max(0, Math.round(cy - v * 1.6)));
        m = m * 0.82 + this.moist[sy * AW + sx] * 0.18;
        next[i] = m;
      }
    }
    this.moist = next;
    // 降雨：陆地湿气过饱和 → 落雨；地形抬升（迎风坡）加强 → 背风坡雨影
    this.rainCell.fill(0);
    for (let cy = 0; cy < AH; cy++) {
      for (let cx = 0; cx < AW; cx++) {
        const i = cy * AW + cx;
        const st = this.cellStats(cx, cy);
        if (st.waterFrac > 0.5 || this.moist[i] <= 0.55) continue;
        const [u, v] = this.windAt(cx, cy);
        // 下风格海拔 vs 本格：迎风坡抬升致雨
        const nx = Math.min(AW - 1, Math.max(0, cx + (u > 0 ? 1 : -1)));
        const ny = Math.min(AH - 1, Math.max(0, cy + (v > 0.15 ? 1 : v < -0.15 ? -1 : 0)));
        const stN = this.cellStats(nx, ny);
        const orographic = stN.elev > st.elev + 0.5 ? 1.7 : stN.elev < st.elev - 0.5 ? 0.55 : 1;
        let rain = (this.moist[i] - 0.55) * 0.5 * orographic;
        if (s === 3) rain *= 0.7; // 冬季干燥大陆气团
        // ITCZ 深对流带：辐合上升气流终年致雨（热带雨林的所在）
        if (Math.abs(cy / (AH - 1) - this.itczLat) < 0.07) rain += 0.045 + this.moist[i] * 0.05;
        // 气压调制：低压抬升致雨 / 高压下沉压制
        for (const ps of this.pSystems) {
          if (Math.abs(cx - ps.x / CELL) < 4 && Math.abs(cy - ps.y / CELL) < 4) {
            const d = Math.hypot(cx - ps.x / CELL, cy - ps.y / CELL);
            if (d < 4) rain *= ps.kind === 0 ? 1 + ps.str * (1 - d / 4) * 0.9 : 1 - ps.str * (1 - d / 4) * 0.55;
          }
        }
        if (rain > 0) {
          this.moist[i] -= rain * 0.6;
          this.rainCell[i] = Math.min(255, Math.round(rain * 420));
        }
      }
    }
    // 降雨作用于世界（灭火 / 加速复苏 / 洪水累计 / 沙漠逆转）
    const winterBolt = s === 3; // 冬季降水为雪：雷暴即「雷打雪」罕见景观
    for (let cy = 0; cy < AH; cy++) {
      for (let cx = 0; cx < AW; cx++) {
        const i = cy * AW + cx;
        const r = this.rainCell[i];
        if (r < 45) { this.floodAcc[i] = Math.max(0, this.floodAcc[i] - 0.03); continue; }
        // 灭火：雨区内火焰
        if (r > 70) {
          const x0 = cx * CELL;
          const y0 = cy * CELL;
          for (let k = 0; k < 6; k++) {
            const fi = this.eng.rainFireProbe(x0, y0);
            if (fi < 0) break;
          }
        }
        // 复苏：焦土提前返青（regrow 计时 -60 tick）
        if (this.eng.rng() < 0.3 && r > 80) this.eng.rainRegrow(cx * CELL, cy * CELL);
        // 洪水累计：低地暴雨持续 → 淹没
        this.floodAcc[i] += (r - 60) / 4200;
        if (this.floodAcc[i] > 1 && this.eng.laws.naturalDisasters) {
          this.floodAcc[i] = 0;
          this.eng.natureFlood(cx * CELL + 4, cy * CELL + 4);
        }
        // 雷暴：强对流暴雨云（r≥190）中的自然闪电——冷却门控稀疏化（3-7s 一道），
        // 弱伤害不点燃（natureLightning）；首道雷播报「雷暴降临」。
        // 冬季降水为雪（雪暴/冰暴云 r 同样可达 255）——「雷打雪」：概率更低、
        // 冷却更长（10-20s 一道），纪事独立防重（冬夏各记一次首见）
        if (r >= 190 && this.boltCool <= 0 && eng.laws.naturalDisasters && eng.rng() < (winterBolt ? 0.012 : 0.05)) {
          this.boltCool = winterBolt ? 600 + Math.floor(eng.rng() * 600) : 180 + Math.floor(eng.rng() * 240); // 冬 600-1200 / 夏 180-420 tick
          this.lightningN++;
          this.eng.natureLightning(cx * CELL + 4, cy * CELL + 4);
          if (winterBolt) {
            if (!this.tSnowChronDone) {
              this.tSnowChronDone = true;
              this.eng.toast('雷打雪——暴雪云中惊雷乍响，冬雷震震', 'danger');
              this.eng.addEvent('geo', '雷打雪：罕见的冬季雷暴在暴雪云中炸响，冬雷震震（雷击对暴露的单位有危险）');
            }
          } else if (!this.boltChronDone) {
            this.boltChronDone = true;
            this.eng.toast('雷暴降临——暴雨云中电光乍裂，惊雷滚过大地', 'danger');
            this.eng.addEvent('geo', '雷暴降临：强对流暴雨中的闪电开始叩击大地（雷击对暴露的单位有危险）');
          }
        }
      }
    }
    // —— 雨后彩虹：上一拍的大雨（≥120）本拍骤停 + 白昼 + 概率门 → 天幕挂一道渐隐彩虹；
    //    全场至多一道（rainbowTTL 期间不再触发）+ 谢幕节流（rainbowCool：90s 内不出第二道，
    //    连雨天气防彩虹连环泛滥）；prevRain 快照供下一拍对比 ——
    if (this.rainbowTTL > 0) {
      this.rainbowTTL -= 10;
    } else if (eng.dayPhase() < 0.42 && this.rainbowCool <= 0) {
      for (let i = 0; i < AW * AH; i++) {
        if (this.prevRain[i] >= 120 && this.rainCell[i] === 0 && eng.rng() < 0.02) {
          this.rainbowTTL = 2400;
          this.rainbowCool = 5400; // 谢幕后 50s 间隔（TTL 40s + 50s = 90s 一道上限）
          this.rainbowX = (i % AW) * CELL + CELL / 2;
          this.rainbowY = ((i / AW) | 0) * CELL + CELL / 2;
          if (!this.rainbowChronDone) {
            this.rainbowChronDone = true;
            this.eng.toast('雨过天青——一道彩虹横跨天际', 'good');
            this.eng.addEvent('geo', '雨过天青：骤歇的暴雨在天幕留下一道彩虹');
          }
          break;
        }
      }
    }
    this.prevRain.set(this.rainCell);
  }

  /** 气压系统生命周期（每大气步）：低压生于 ITCZ/中纬锋面，高压生于副热带与极地；
   *  随盛行风漂移，低压暖洋增强陆地衰减——风场的「天气尺度发动机」 */
  pressureTick() {
    const eng = this.eng;
    const cap = 5;
    if (this.pSystems.length < cap && eng.rng() < 0.06) {
      const isL = eng.rng() < 0.55;
      let lat: number;
      if (isL) {
        // 低压：ITCZ 辐合带或中纬锋面（气旋 генери区）
        lat = eng.rng() < 0.5 ? this.itczLat + (eng.rng() - 0.5) * 0.16 : 0.5 + (eng.rng() < 0.5 ? 1 : -1) * (0.24 + eng.rng() * 0.1);
      } else {
        // 高压：副热带（信风/西风分界）或极地反气旋
        lat = eng.rng() < 0.7 ? 0.5 + (eng.rng() < 0.5 ? 1 : -1) * (0.16 + eng.rng() * 0.07) : eng.rng() < 0.5 ? 0.06 + eng.rng() * 0.05 : 0.89 + eng.rng() * 0.05;
      }
      lat = Math.max(0.03, Math.min(0.97, lat));
      this.pSystems.push({ x: 8 + eng.rng() * (W - 16), y: lat * H, kind: isL ? 0 : 1, str: 0.3 + eng.rng() * 0.3, ttl: isL ? 90 + Math.floor(eng.rng() * 160) : 150 + Math.floor(eng.rng() * 200) });
    }
    for (let k = this.pSystems.length - 1; k >= 0; k--) {
      const ps = this.pSystems[k];
      ps.ttl--;
      // 引导气流：所在纬度的盛行风携带漂移（信风带向西/西风带向东）
      const cyy = Math.min(AH - 1, Math.max(0, (ps.y / CELL) | 0));
      const latA = Math.abs(cyy / (AH - 1) - this.itczLat) * 2;
      const baseU = latA < 0.32 ? -0.5 : latA < 0.72 ? 0.6 : -0.35;
      ps.x = Math.max(6, Math.min(W - 6, ps.x + baseU * 2.2 + (eng.rng() - 0.5) * 1.6));
      // 低压向极漂移（北半球朝 y- / 南半球朝 y+ —— 锋面气旋的真实去向）
      ps.y = Math.max(6, Math.min(H - 6, ps.y + (eng.rng() - 0.5) * 2.2 + (ps.kind === 0 ? (ps.y < H / 2 ? -0.35 : 0.35) : 0)));
      // 强度演化：低压暖洋增强/陆地衰减；高压洋面准常驻（副热带高压）/陆上冬季更盛
      const stC = this.cellStats(Math.min(AW - 1, Math.max(0, (ps.x / CELL) | 0)), cyy);
      if (ps.kind === 0) ps.str += stC.waterFrac > 0.6 && this.season !== 3 ? 0.006 : -0.004;
      else ps.str += stC.waterFrac > 0.5 || this.season === 3 ? 0.0018 : -0.0028;
      ps.str = Math.max(0.15, Math.min(1, ps.str));
      if (ps.ttl <= 0 || ps.str <= 0.16) this.pSystems.splice(k, 1);
    }
  }

  // ---------------- 风暴生命周期（每 40 tick） ----------------
  stormTick() {
    const eng = this.eng;
    if (!eng.laws.atmosphere) return;
    const s = this.season;
    // 孕育：暖洋高湿格 → 热带气旋；冬季极地高湿 → 冰暴；强低压中心助产（nature.stormRate 热参数可调）
    let spawnP = (s === 1 ? 0.1 : s === 0 || s === 2 ? 0.06 : 0.08) * ep('nature.stormRate');
    for (const ps of this.pSystems) if (ps.kind === 0 && ps.str > 0.55) spawnP += 0.05;
    if (eng.laws.naturalDisasters && this.storms.length < 3 && eng.rng() < spawnP) {
      for (let tr = 0; tr < 6; tr++) {
        const cx = Math.floor(eng.rng() * AW);
        const cy = Math.floor(eng.rng() * AH);
        const i = cy * AW + cx;
        const st = this.cellStats(cx, cy);
        const latA = Math.abs(cy / (AH - 1) - 0.5) * 2;
        const winterPolar = s === 3 && latA > 0.68 && st.waterFrac > 0.3 && this.moist[i] > 0.5;
        const nearL = this.pSystems.some((ps) => ps.kind === 0 && ps.str > 0.6 && Math.hypot(cx - ps.x / CELL, cy - ps.y / CELL) < 3);
        const warmOcean = (st.waterFrac > 0.88 || (nearL && st.waterFrac > 0.55)) && this.moist[i] > 0.72 && Math.abs(cy / (AH - 1) - this.itczLat) < 0.2;
        if (warmOcean || winterPolar) {
          const st0 = this.storms.length >= 2 ? 0.3 : 0.38;
          this.storms.push({
            id: this.stormSeq++,
            x: cx * CELL + 4,
            y: cy * CELL + 4,
            strength: st0,
            ttl: 320 + Math.floor(eng.rng() * 420),
            seed: Math.floor(eng.rng() * 65536),
            kind: winterPolar ? 'blizzard' : 'cyclone',
            name: STORM_NAME_AT(this.stormSeq - 1),
            landed: false,
          });
          this.counters.cyclones++;
          if (winterPolar) {
            eng.addEvent('geo', `极地冰暴「${this.storms[this.storms.length - 1].name}」在寒洋上空成形，裹挟着暴雪逼近陆地`, { x: cx * CELL + 4, y: cy * CELL + 4 });
          } else {
            eng.addEvent('geo', `热带气旋「${this.storms[this.storms.length - 1].name}」在暖洋上空孕育成形，螺旋云带开始收紧`, { x: cx * CELL + 4, y: cy * CELL + 4 });
            eng.toast(`气旋「${this.storms[this.storms.length - 1].name}」成形`, 'info');
          }
          break;
        }
      }
    }
    // 推进每个风暴
    for (let k = this.storms.length - 1; k >= 0; k--) {
      const st = this.storms[k];
      st.ttl -= 40;
      const [u, v] = this.windAt(st.x / CELL, st.y / CELL);
      // 自主漂移：顺引导气流 + Beta 效应（台风路径共性：向极转折 + 缓慢西移）
      // 向极 = 北半球朝 y-（北极）/ 南半球朝 y+（南极）
      const pole = st.y < H / 2 ? -0.22 : 0.22;
      st.x = Math.max(3, Math.min(W - 4, st.x + u * 2.6 - 0.16 + (eng.rng() - 0.5) * 1.4));
      st.y = Math.max(3, Math.min(H - 4, st.y + v * 2.6 + pole + (eng.rng() - 0.5) * 1.4));
      const stC = this.cellStats(Math.min(AW - 1, (st.x / CELL) | 0), Math.min(AH - 1, (st.y / CELL) | 0));
      const latA = Math.abs(st.y / H - 0.5) * 2;
      const overWarmOcean = stC.waterFrac > 0.85 && this.season !== 3;
      const overLand = stC.waterFrac < 0.4;
      // 能量学：暖洋增益 / 登陆衰减 / 高山重衰减 / 寒流减弱
      if (overWarmOcean) st.strength += 0.02 + (latA < 0.3 ? 0.012 : 0);
      else if (overLand) st.strength -= 0.028 + stC.elev * 0.012;
      else st.strength -= 0.008;
      st.strength = Math.max(0.08, Math.min(1.6, st.strength));
      // 登陆播报 + 肆虐
      if (overLand && !st.landed && st.strength > 0.55) {
        st.landed = true;
        if (st.kind === 'blizzard') {
          eng.addEvent('geo', `冰暴「${st.name}」登陆！狂风裹雪横扫海岸，大地在白茫中噤声`, { x: st.x, y: st.y });
          this.counters.blizzards++;
        } else {
          eng.addEvent('geo', `气旋「${st.name}」登陆！狂风撕扯着沿岸的森林与屋舍`, { x: st.x, y: st.y });
          eng.toast(`「${st.name}」登陆肆虐`, 'danger');
        }
      }
      // 肆虐结算（每 40 tick 一次；强度 >0.7 才有破坏力）
      if (st.strength > 0.7 && eng.laws.naturalDisasters) {
        eng.stormRavage(st);
        // 遇山抬升 → 龙卷分离
        if (stC.elev > 1.6 && st.kind === 'cyclone' && eng.rng() < 0.12) {
          eng.spawnTornado(st.x, st.y, 1);
          eng.addEvent('geo', `「${st.name}」撞上山岳，气流剧烈抬升——龙卷风从雨幕中俯冲而下`, { x: st.x, y: st.y });
        }
      }
      // 湿气倾泻：风暴所在格暴雨
      const ci = this.cellOf(st.x, st.y);
      this.moist[ci] = Math.min(1, this.moist[ci] + 0.3);
      this.rainCell[ci] = 255;
      // 消散
      if (st.ttl <= 0 || st.strength < 0.16) {
        if (st.landed || st.strength > 0.9) eng.addEvent('geo', `风暴「${st.name}」终于耗尽了能量，云带散作细雨`, { x: st.x, y: st.y });
        this.storms.splice(k, 1);
      }
    }
    // 气候型天灾掷骰（干旱/沙暴）：雨影区与沙漠
    if (eng.laws.naturalDisasters && (s === 1 || s === 2) && eng.rng() < 0.05) {
      const cx = Math.floor(eng.rng() * AW);
      const cy = Math.floor(eng.rng() * AH);
      const i = cy * AW + cx;
      const st = this.cellStats(cx, cy);
      if (st.waterFrac < 0.25 && this.moist[i] < 0.14) {
        const [u, v] = this.windAt(cx, cy);
        const windSpd = Math.hypot(u, v);
        // 沙地为主 + 大风 → 沙暴
        let sand = 0;
        const x0 = cx * CELL;
        const y0 = cy * CELL;
        for (let y = y0; y < y0 + CELL && y < H; y++) for (let x = x0; x < x0 + CELL && x < W; x++) if (eng.terrain[y * W + x] === T.SAND) sand++;
        if (sand > 34 && windSpd > 0.5) {
          eng.sandstorm(x0 + 4, y0 + 4, 5.5, 240);
          this.counters.droughts++; // 沙暴计入气候事件
        } else if (sand < 20) {
          eng.drought(x0 + 4, y0 + 4, 6 + eng.rng() * 4, 220);
          this.counters.droughts++;
        }
      }
    }
  }

  // ---------------- 板块构造（每 240 tick ≈ 6 年） ----------------
  tectonicTick() {
    const eng = this.eng;
    if (!eng.laws.tectonics) return;
    // —— 板块真实漂移：种子质心缓慢位移（边界随之世纪尺度迁移——「轮」动名副其实） ——
    this.plateEpoch++;
    const DK = 0.55; // 每构造期位移系数（≈0.55×drift 格/6 年 → 边界百年移数格）
    for (let p = 0; p < this.plateN; p++) {
      this.plateCx[p] = Math.max(16, Math.min(W - 16, this.plateCx[p] + this.drift[p].dx * DK));
      this.plateCy[p] = Math.max(10, Math.min(H - 10, this.plateCy[p] + this.drift[p].dy * DK));
    }
    if (this.plateEpoch % 4 === 0) this.recomputePlates();
    // 应力积累：按真实边界法线投影（会聚挤压为正 → 造山带与地震带；离散则松弛）
    const acc = 0.85;
    for (const i of this.boundary) {
      const x = i % W;
      const y = (i / W) | 0;
      const p = this.plate[i];
      // 找一个异板块邻居及其真实方向（边界法线，替代象限 hack）
      let np = p;
      let ndx = 0;
      let ndy = 0;
      if (x > 0 && this.plate[i - 1] !== p) { np = this.plate[i - 1]; ndx = -1; }
      else if (x < W - 1 && this.plate[i + 1] !== p) { np = this.plate[i + 1]; ndx = 1; }
      else if (y > 0 && this.plate[i - W] !== p) { np = this.plate[i - W]; ndy = -1; }
      else if (y < H - 1 && this.plate[i + W] !== p) { np = this.plate[i + W]; ndy = 1; }
      if (np === p) continue;
      const dA = this.drift[p];
      const dB = this.drift[np];
      // 相对速度在法线方向投影（正 = 会聚挤压）
      const conv = (dB.dx - dA.dx) * ndx + (dB.dy - dA.dy) * ndy;
      if (conv > 0) this.stress[i] += conv * acc * 1.6;
      else this.stress[i] = Math.max(0, this.stress[i] + conv * 0.5);
    }
    // 热点增压（火山带：缓慢积蓄，~130 年一次喷发周期）
    for (const h of this.hotspots) h.heat = Math.min(3, h.heat + 0.09 + (this.stress[h.y * W + h.x] || 0) * 0.008);
    // 应力释放检查：高应力格成簇 → 地震
    let done = 0;
    for (const i of this.boundary) {
      if (this.stress[i] < ep('nature.quakeStress')) continue;
      this.releaseQuake(i);
      if (++done >= 2) break; // 每构造期最多 2 次释压
    }
    // 灰烬沉降兜底（大气法则关闭时；正常由 atmTick 平流场沉降）
    if (!eng.laws.atmosphere && this.ash > 0) {
      this.ash = Math.max(0, this.ash * 0.9 - 0.006);
      this.ashF.fill(this.ash);
    }
  }

  /** 集群释压：以 i 为震中，聚合邻近高应力 → 里氏震级 → 引擎地震 */
  releaseQuake(i: number) {
    const eng = this.eng;
    // 收集半径 6 内的边界应力
    const x = i % W;
    const y = (i / W) | 0;
    let energy = 0;
    const zapped: number[] = [];
    for (let yy = Math.max(0, y - 6); yy <= Math.min(H - 1, y + 6); yy++) {
      for (let xx = Math.max(0, x - 6); xx <= Math.min(W - 1, x + 6); xx++) {
        const j = yy * W + xx;
        if (!this.boundary.has(j)) continue;
        if (Math.hypot(xx - x, yy - y) > 6) continue;
        if (this.stress[j] > ep('nature.quakeStress') * 0.7) {
          energy += this.stress[j];
          zapped.push(j);
        }
      }
    }
    for (const j of zapped) this.stress[j] = 0;
    if (energy < 10) return;
    // 里氏震级（自然集群释放典型 M6-7；饱和应力+宽集群才逼近 8.5+）
    const m = Math.min(8.8, 4.2 + Math.log2(1 + energy) * 0.42);
    this.counters.quakes++;
    if (m >= 6.5) this.counters.quakesBig++;
    this.recentQuakes.unshift({ x, y, m: Math.round(m * 10) / 10, year: Math.floor(eng.yearF) });
    if (this.recentQuakes.length > 6) this.recentQuakes.pop();
    eng.natureQuake(x + 0.5, y + 0.5, m);
    // 海震 → 海啸（浅水/近海）
    const ti = y * W + x;
    const t = eng.terrain[ti];
    if ((t === T.WATER || t === T.DEEP) && m >= 6.8) {
      eng.tsunami(x, y, 4 + (m - 6.8) * 4);
      this.counters.tsunamis++;
    } else if (m >= 7.4 && eng.rng() < 0.35) {
      // 近岸强震也可能掀起局部海啸
      let coast = false;
      for (let k = 0; k < 4 && !coast; k++) {
        const xx = x + (k === 0 ? -4 : k === 1 ? 4 : 0);
        const yy = y + (k === 2 ? -4 : k === 3 ? 4 : 0);
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        if (eng.terrain[yy * W + xx] === T.WATER || eng.terrain[yy * W + xx] === T.DEEP) coast = true;
      }
      if (coast) { eng.tsunami(x, y, 4); this.counters.tsunamis++; }
    }
    // 余震：残留应力小幅释放
    if (m >= 6 && eng.rng() < 0.4) {
      for (const j of zapped) if (eng.rng() < 0.3) this.stress[j] = ep('nature.quakeStress') * 0.4 * eng.rng();
    }
  }

  // ---------------- 地质演变（每 600 tick ≈ 15 年） ----------------
  geologyTick() {
    const eng = this.eng;
    if (!eng.laws.tectonics) return;
    // 1. 造山带（v2）：沿会聚边界链行走抬升 → 山脉链而非孤立散点（缝合线的脊梁）
    for (let tr = 0; tr < 2; tr++) {
      const cand: number[] = [];
      for (const i of this.boundary) if (this.stress[i] > 9) cand.push(i);
      if (cand.length === 0) break;
      const start = cand[Math.floor(eng.rng() * cand.length)];
      let cur = start;
      let dirX = 0;
      let dirY = 0;
      let mount = 0;
      const steps = 5 + Math.floor(eng.rng() * 6);
      for (let s = 0; s < steps; s++) {
        const t = eng.terrain[cur];
        if (t === T.HILL) {
          if (eng.rng() < 0.5) { eng.setTerrain(cur, T.MOUNTAIN); this.counters.uplifts++; mount++; }
        } else if (t === T.GRASS || t === T.FOREST) {
          if (eng.rng() < 0.35) { eng.setTerrain(cur, T.HILL); this.counters.uplifts++; }
        }
        // 下一格：边界邻居中保持行进方向者优先（沿断层链生长）
        let best = -1;
        let bestDot = -2;
        const cx0 = cur % W;
        const cy0 = (cur / W) | 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const xx = cx0 + dx;
            const yy = cy0 + dy;
            if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
            const j = yy * W + xx;
            if (!this.boundary.has(j)) continue;
            if (dx === -dirX && dy === -dirY) continue; // 不回头
            const dl = Math.hypot(dx, dy);
            const dot = (dx * dirX + dy * dirY) / (dl * (Math.hypot(dirX, dirY) || 1));
            if (dot > bestDot) { bestDot = dot; best = j; }
          }
        }
        if (best < 0) break;
        dirX = (best % W) - cx0;
        dirY = ((best / W) | 0) - cy0;
        cur = best;
      }
      if (mount >= 4 && this.counters.uplifts % 10 < 2) {
        eng.addEvent('geo', `沿着会聚边界的缝合线，一条新的山脉链正缓缓隆起——未来它将截断信风制造荒漠`, { x: start % W, y: (start / W) | 0 });
      }
    }
    // 1b. 岛弧（v2）：洋-洋会聚边界 → 俯冲带火山升出海面（火山岛链的种子）
    if (eng.rng() < 0.12) {
      const cand: number[] = [];
      for (const i of this.boundary) {
        if (this.stress[i] < 6) continue;
        const t = eng.terrain[i];
        if (t !== T.WATER && t !== T.DEEP) continue;
        cand.push(i);
      }
      if (cand.length > 0) {
        const i = cand[Math.floor(eng.rng() * cand.length)];
        const x = i % W;
        const y = (i / W) | 0;
        eng.setTerrain(i, T.MOUNTAIN);
        for (let k = 0; k < 4; k++) {
          const xx = x + (k === 0 ? -1 : k === 1 ? 1 : 0);
          const yy = y + (k === 2 ? -1 : k === 3 ? 1 : 0);
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
          const nt = eng.terrain[yy * W + xx];
          if ((nt === T.WATER || nt === T.DEEP) && eng.rng() < 0.7) eng.setTerrain(yy * W + xx, T.SAND);
        }
        this.counters.uplifts++;
        eng.addEvent('geo', `深海之下，俯冲带搓出的火山终于升出海面——一座新的火山岛在浪花中诞生`, { x, y });
      }
    }
    // 2. 侵蚀与沉积：山体风化成丘 / 海岸沙滩外延
    for (let tr = 0; tr < 4; tr++) {
      const x = 1 + Math.floor(eng.rng() * (W - 2));
      const y = 1 + Math.floor(eng.rng() * (H - 2));
      const i = y * W + x;
      const t = eng.terrain[i];
      if (t === T.MOUNTAIN && eng.rng() < 0.22) {
        // 山麓有低地邻居 → 风化
        let lower = false;
        for (let k = 0; k < 4 && !lower; k++) {
          const xx = x + (k === 0 ? -1 : k === 1 ? 1 : 0);
          const yy = y + (k === 2 ? -1 : k === 3 ? 1 : 0);
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
          const nt = eng.terrain[yy * W + xx];
          if (nt !== T.MOUNTAIN && nt !== T.LAVA) lower = true;
        }
        if (lower) { eng.setTerrain(i, T.HILL); this.counters.erosions++; }
      } else if (t === T.WATER) {
        // 浅海沉积：三面环陆 → 滩涂外延
        let landN = 0;
        for (let k = 0; k < 4; k++) {
          const xx = x + (k === 0 ? -1 : k === 1 ? 1 : 0);
          const yy = y + (k === 2 ? -1 : k === 3 ? 1 : 0);
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
          const nt = eng.terrain[yy * W + xx];
          if (nt !== T.WATER && nt !== T.DEEP) landN++;
        }
        if (landN >= 3 && eng.rng() < 0.3) { eng.setTerrain(i, T.SAND); this.counters.erosions++; }
      } else if (t === T.LAVA && eng.rng() < 0.4) {
        eng.setTerrain(i, T.BURNT); // 岩浆冷却成岩
      }
    }
    // 3. 火山热点喷发：热量满 → 大喷发 + 灰烬注入平流场（随风漂移扩散；饱和递减防失控）
    for (const h of this.hotspots) {
      if (h.heat < 2.6 || eng.rng() > 0.3) continue;
      h.heat = 0.4;
      const pw = (this.stress[h.y * W + h.x] || 0) > 14 ? 3 : 2;
      eng.volcano(h.x, h.y, pw);
      this.counters.eruptions++;
      // 大喷发 → 灰烬注入平流层场（先区域漂移，后全球平均遮蔽）
      const cell = this.cellOf(h.x, h.y);
      const inject = (pw === 3 ? 0.55 : 0.3) * (1 - this.ashF[cell]);
      this.ashF[cell] = Math.min(1, this.ashF[cell] + inject);
      const cxx = cell % AW;
      const cyy = (cell / AW) | 0;
      for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = cxx + ox;
        const ny = cyy + oy;
        if (nx < 0 || ny < 0 || nx >= AW || ny >= AH) continue;
        this.ashF[ny * AW + nx] = Math.min(1, this.ashF[ny * AW + nx] + inject * 0.4);
      }
      const before = this.ash;
      let sum = 0;
      for (let k = 0; k < AW * AH; k++) sum += this.ashF[k];
      this.ash = sum / (AW * AH);
      if (before < 0.3 && this.ash >= 0.3) {
        eng.addEvent('geo', `「无夏之年」——火山灰遮蔽了天空，阳光变得苍白，霜线向赤道蔓延，田畴将歉收数年`, {});
        eng.toast('火山冬降临：全球气候骤冷', 'danger');
      } else if (pw === 3) {
        eng.addEvent('geo', `剧烈的普林尼式喷发把火山灰送上高空，灰云开始随风漂散`, { x: h.x, y: h.y });
      }
      // 热点链（v2）：板块在移动而地幔柱固定 → 下一喷口逆漂移方向偏移（夏威夷式岛链）
      const pHere = this.plate[Math.min(W * H - 1, Math.max(0, h.y * W + h.x))];
      h.x = Math.max(4, Math.min(W - 5, Math.round(h.x - this.drift[pHere].dx * 5)));
      h.y = Math.max(4, Math.min(H - 5, Math.round(h.y - this.drift[pHere].dy * 5)));
    }
    // 4. 裂谷拉张：离散边界缓慢沉降（罕见：陆缘开裂成海）
    if (eng.rng() < 0.35) {
      const bl = [...this.boundary];
      const i = bl[Math.floor(eng.rng() * bl.length)];
      if (i != null) {
        const p = this.plate[i];
        const x = i % W;
        const y = (i / W) | 0;
        let np = p;
        if (x > 0 && this.plate[i - 1] !== p) np = this.plate[i - 1];
        else if (x < W - 1 && this.plate[i + 1] !== p) np = this.plate[i + 1];
        else if (y > 0 && this.plate[i - W] !== p) np = this.plate[i - W];
        else if (y < H - 1 && this.plate[i + W] !== p) np = this.plate[i + W];
        const conv = (this.drift[np].dx - this.drift[p].dx) + (this.drift[np].dy - this.drift[p].dy);
        if (conv < -0.2) {
          const t = eng.terrain[i];
          if (t === T.MOUNTAIN && eng.rng() < 0.3) { eng.setTerrain(i, T.HILL); this.counters.erosions++; }
          else if (t === T.HILL && eng.rng() < 0.18) { eng.setTerrain(i, T.GRASS); this.counters.erosions++; }
          else if (t === T.GRASS && eng.rng() < 0.1) {
            // 陆缘开裂：邻水则成浅海
            let waterAdj = 0;
            for (let k = 0; k < 4; k++) {
              const xx = x + (k === 0 ? -1 : k === 1 ? 1 : 0);
              const yy = y + (k === 2 ? -1 : k === 3 ? 1 : 0);
              if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
              const nt = eng.terrain[yy * W + xx];
              if (nt === T.WATER || nt === T.DEEP) waterAdj++;
            }
            if (waterAdj > 0) {
              eng.setTerrain(i, T.WATER);
              eng.addEvent('geo', `裂谷的拉张撕开了陆缘，海水涌入新的地堑`, { x, y });
            }
          }
        }
      }
    }
  }

  // ---------------- 水文（每 120 tick ≈ 3 年）：降雨驱动的河流 genesis ----------------
  /** 丰沛降雨在湿润山地汇流成新河（雨影区无河、湿地河网密布——大气与地貌的因果链） */
  hydroTick() {
    const eng = this.eng;
    if (!eng.laws.atmosphere) return;
    if (eng.riverTiles.size > 900) return; // 河网密度上限（≈2.2% 地表防泛滥）
    if (eng.rng() > 0.05) return;
    for (let tr = 0; tr < 10; tr++) {
      const x = 4 + Math.floor(eng.rng() * (W - 8));
      const y = 4 + Math.floor(eng.rng() * (H - 8));
      const i = y * W + x;
      const t = eng.terrain[i];
      if (t !== T.MOUNTAIN && t !== T.HILL) continue;
      const c = this.cellOf(x, y);
      if (this.moist[c] < 0.72 && this.rainCell[c] < 90) continue;
      // 已有河道近旁不再生河
      let nearRiver = false;
      for (let dy = -3; dy <= 3 && !nearRiver; dy++) {
        for (let dx = -3; dx <= 3 && !nearRiver; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
          if (eng.riverDir[yy * W + xx] > 0) nearRiver = true;
        }
      }
      if (nearRiver) continue;
      if (eng.carveRiver(x + 0.5, y + 0.5, 0)) {
        eng.addEvent('river', '丰沛的降雨在群山间汇流——一条新的河流开始向大海进发', { x, y });
        break;
      }
    }
  }

  /** 世界生成期的自然河网：挑湿润高地源头刻 8-13 条河（用生成期气候场 moistMap 判湿润） */
  seedRivers() {
    const eng = this.eng;
    const n = 8 + Math.floor(this.rng() * 6);
    let carved = 0;
    for (let tr = 0; tr < n * 16 && carved < n; tr++) {
      const x = 6 + Math.floor(this.rng() * (W - 12));
      const y = 6 + Math.floor(this.rng() * (H - 12));
      const i = y * W + x;
      const t = eng.terrain[i];
      if (t !== T.MOUNTAIN && t !== T.HILL) continue;
      if (eng.moistMap && eng.moistMap[i] < 115) continue; // 干旱山地不成河（115/255 ≈ 0.45）
      if (eng.carveRiver(x + 0.5, y + 0.5, 0)) carved++;
    }
    if (carved > 0) eng.addEvent('river', `这个年轻的世界有了自己的河网——${carved} 条大河从山地奔向海洋`, {});
  }

  // ---------------- 快照 ----------------
  snapshot(): NatureSnapshot {
    let cloud = 0;
    let hum = 0;
    for (let i = 0; i < AW * AH; i++) {
      if (this.moist[i] > 0.58) cloud++;
      hum += this.moist[i];
    }
    let stressTotal = 0;
    for (const i of this.boundary) stressTotal += this.stress[i];
    const quakeRisk = this.quakeRisk;
    let ashCells = 0;
    for (let i = 0; i < AW * AH; i++) if (this.ashF[i] > 0.12) ashCells++;
    return {
      season: this.season,
      seasonName: this.seasonName,
      rhythms: this.rhythmChips(),
      // Task 100 修复：旧公式 floor(yearF/SY) % SY 实为「季节序号的奇偶」（值域恒 {0,1}，且与本季进度脱节）——
      // 本季年进度 = yearF 对 SY 取余（相位 offset 只决定哪个季节先来，不影响季内进度）；保留 1 位小数供 HUD 直读
      seasonYearIn: Math.round((this.eng.yearF % SEASON_YEARS) * 10) / 10,
      seasonYears: SEASON_YEARS,
      ash: Math.round(this.ash * 100) / 100,
      plates: this.plateN,
      stress: Math.round(stressTotal),
      quakeRisk,
      cloudCover: Math.round((cloud / (AW * AH)) * 100) / 100,
      humidity: Math.round((hum / (AW * AH)) * 100) / 100,
      storms: this.storms.map((st) => ({ id: st.id, name: st.name, kind: st.kind, strength: Math.round(st.strength * 100) / 100, x: st.x, y: st.y, landed: st.landed })),
      counters: { ...this.counters },
      recentQuakes: this.recentQuakes.slice(),
      drift: this.drift.map((d) => ({ dx: Math.round(d.dx * 100) / 100, dy: Math.round(d.dy * 100) / 100 })),
      pressure: this.pSystems.map((ps) => ({ x: Math.round(ps.x), y: Math.round(ps.y), kind: ps.kind, str: Math.round(ps.str * 100) / 100 })),
      itcz: Math.round(this.itczLat * 1000) / 1000,
      jet: Math.round(this.jetMul() * 100) / 100,
      ashCells,
      deepTime: this.eng.worldsim.deepSnapshot(),
    };
  }
}
