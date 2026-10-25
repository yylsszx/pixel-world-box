// ============ 深时涌现引擎（Deep-Time Substrate）—— Task 40 ============
// 设计哲学：地形不再是静态分类，而是「连续场耦合系统」的涌现投影。
//   1. 连续海拔场 elev + 水力侵蚀/沉积（%600===41）：流向累加按海拔降序传递，
//      坡陡流大处刻谷、平缓低地与河口积沙成原——山脉链/泛滥平原/三角洲从底层规则涌现；
//   2. 土壤肥力场 soilF：沉积+腐殖质累积、火烧/过牧耗竭——驱动植被复苏快慢与森林演替；
//   3. 动态温度场 tempF（%120===27）：纬度基线 + 海拔递减率 + 大陆度（海洋调节记忆）
//      + 灰烬遮蔽冷却 + 洋流异常——高原雪山与霜线漂移由此涌现（温度覆盖层即实时场）；
//   4. 洋流系统（%120===15，粗网格 AW×AH）：风应力旋度 + 科氏 β 项的 Stommel 流函数
//      Jacobi 松弛——西向强化自然涌现；沿流场平流海温异常（湾流式暖岸/寒流凉岸/上升流渔场）；
//   5. 冰川系统 glacier（%240===33）：积累/消融/进退——火山冬让冰川扩张的反馈环；
//   6. 海平面 seaLevel（%600===47）：全球均温驱动海岸线进退（有主领土一律绕行）；
//   7. 群系漂移（%600===53）：气候期望群系 vs 现状持续错配（>3 期）才迁移一格。
// 存档哲学：全部场不入存档——由「已恢复地形 + seed」在 applySave 后重导出（与板块同一哲学），
//           读档零存档成本；刻意的深时记忆损失（侵蚀量/漂移计数归零）视为新纪元开始。
// 性能预算：全图排序/迭代只在 %600 步发生（≈25-40ms/600tick，摊销 <0.1ms/tick），
//           其余分频采样——总开销远低于 1.5ms/平均 tick。
import type { GameEngine } from './engine';
import { W, H } from './constants';
import { T } from './types';
import { isWater } from './constants';
import { mulberry32, fbm } from './noise';
import { AW, AH, CELL } from './nature';
import { ep } from './engineParams';

/** 地形类别 → 海拔场目标值（海面=0 基准；DEEP 深渊 / MOUNTAIN 高峰） */
const ELEV_TGT: Record<number, number> = {
  [T.DEEP]: -2.6, [T.WATER]: -1.0, [T.SAND]: 0.05, [T.GRASS]: 0.18, [T.FOREST]: 0.2,
  [T.HILL]: 0.5, [T.MOUNTAIN]: 0.85, [T.SNOW]: 0.18, [T.LAVA]: 0.7, [T.BURNT]: 0.18, [T.ICE]: -0.9,
};
/** 地形类别 → 初始土壤肥力（植被加成：森林最肥、山岩最瘠） */
const SOIL_BASE: Record<number, number> = {
  [T.DEEP]: 40, [T.WATER]: 45, [T.SAND]: 64, [T.GRASS]: 142, [T.FOREST]: 152, [T.HILL]: 112,
  [T.MOUNTAIN]: 66, [T.SNOW]: 92, [T.LAVA]: 30, [T.BURNT]: 96, [T.ICE]: 45,
};
/** 侵蚀强度系数（elev 单位/期：×sqrt(流量)×坡度，单步封顶 0.02） */
const ERODE_K = 0.011;
/** 温标说明：tempF ≈ 0.6 赤道 → −0.5 极地；<−0.15 约=冰点以下（冰川积累线） */

export class WorldSim {
  eng: GameEngine;
  seed = 0;
  rng: () => number = Math.random;

  // ---- 一：连续海拔场（Float32 ≈ 160KB） ----
  elev = new Float32Array(W * H);
  /** 静态气候纹波（±0.15，init 生成，温度场的空间质感） */
  tNoise = new Float32Array(W * H);
  /** 流向累加（scratch，%600 重算） */
  flowAcc = new Float32Array(W * H);
  /** 海拔降序索引（scratch，复用防 GC） */
  order = new Uint32Array(W * H);

  // ---- 三：土壤肥力场 ----
  soilF = new Uint8Array(W * H);

  // ---- 四：动态温度场 + 覆盖层数据源（与旧 tempMap 同量纲 0-255） ----
  tempF = new Float32Array(W * H);
  tempOverlay = new Uint8Array(W * H);

  // ---- 五：洋流系统（粗网格 32×20） ----
  /** 流函数（Stommel 方程 Jacobi 暖启动记忆） */
  psi = new Float32Array(AW * AH);
  curU = new Float32Array(AW * AH);
  curV = new Float32Array(AW * AH);
  /** 海温异常场（偏离纬圈均值：暖池 + / 冷舌 −） */
  sstAnom = new Float32Array(AW * AH);
  /** 热含量场（平流输运用） */
  heatQ = new Float32Array(AW * AH);
  /** 上升流标记（渔场加成，快照统计用） */
  upwell = new Uint8Array(AW * AH);
  /** 大陆度记忆（0 洋性 ↔ 1 陆性；指数平滑——海洋调节 vs 大陆冬冷夏热） */
  cont = new Float32Array(AW * AH);
  /** 陆格邻近海温异常缓存（tempTick 用） */
  coastal = new Float32Array(AW * AH);
  /** 粗格水格计数（scratch） */
  waterCnt = new Uint16Array(AW * AH);
  /** 风应力缓存（scratch） */
  windU = new Float32Array(AW * AH);
  windV = new Float32Array(AW * AH);
  /** 风应力旋度（scratch） */
  curlArr = new Float32Array(AW * AH);
  /** 热含量平流双缓冲（scratch） */
  qNext = new Float32Array(AW * AH);
  /** 强流占比（|v|>0.35 的水格 / 水格总数，快照用） */
  strongFrac = 0;
  /** 上升流渔场粗格数 */
  upwellingCells = 0;

  // ---- 六：冰川系统 ----
  glacier = new Uint8Array(W * H);
  /** 冰川格计数（glacier>80 的格——视觉冰盖口径） */
  glacierTiles = 0;

  // ---- 七：海平面 + 群系漂移 ----
  seaLevel = 0;
  driftAcc = new Uint8Array(W * H);

  // ---- 全局态与统计 ----
  globalTemp = 0;
  baselineTemp = 0;
  eroded = 0;
  deposited = 0;
  biomeDrift = 0;
  /** 海岸线事件播报冷却（tick） */
  coastNoteCd = 0;

  constructor(eng: GameEngine) {
    this.eng = eng;
  }

  // ==================================================================
  // 初始化：由地形类别 + seed 重导出全部场（generate 与 applySave 共用）
  // ==================================================================
  initFromTerrain() {
    const eng = this.eng;
    this.seed = eng.seed;
    this.rng = mulberry32(eng.seed ^ 0x3a91f7);
    const N = W * H;
    for (let i = 0; i < N; i++) {
      const t = eng.terrain[i];
      const x = i % W;
      const y = (i / W) | 0;
      // 连续海拔 = 类别基值 + fBm 细节（±0.08——同类别内部也有起伏，河谷与山脊的分野）
      this.elev[i] = (ELEV_TGT[t] ?? 0.18) + (fbm(x / 14, y / 14, this.seed + 4040, 3) - 0.5) * 0.16;
      this.soilF[i] = SOIL_BASE[t] ?? 128;
      this.glacier[i] = 0;
      this.driftAcc[i] = 0;
      this.tNoise[i] = (fbm(x / 40, y / 40, this.seed + 8080, 3) - 0.5) * 0.3;
      this.flowAcc[i] = 0;
    }
    this.psi.fill(0);
    this.curU.fill(0);
    this.curV.fill(0);
    this.sstAnom.fill(0);
    this.heatQ.fill(0);
    this.qNext.fill(0);
    this.upwell.fill(0);
    this.cont.fill(0.5);
    this.coastal.fill(0);
    this.eroded = 0;
    this.deposited = 0;
    this.biomeDrift = 0;
    this.seaLevel = 0;
    this.coastNoteCd = 0;
    this.glacierTiles = 0;
    this.upwellingCells = 0;
    this.strongFrac = 0;
    this.globalTemp = this.computeTemps();
    this.baselineTemp = this.globalTemp;
  }

  /** setTerrain 同步钩子：地形变化 → 海拔场向新类别目标值靠拢（造山=抬升 / 沉降=下探） */
  onTerrainChanged(i: number, t: number) {
    const tgt = ELEV_TGT[t];
    if (tgt !== undefined) this.elev[i] += (tgt - this.elev[i]) * 0.7;
    // 火烧地力损耗（灰烬回田要等腐殖质慢慢累积）
    if (t === T.BURNT && this.soilF[i] > 8) this.soilF[i] -= 8;
    // 水面/岩浆覆写清除冰川覆被（冰盖记忆不穿越海侵）
    if ((t === T.WATER || t === T.DEEP || t === T.LAVA) && this.glacier[i] > 0) {
      if (this.glacier[i] > 80) this.glacierTiles--;
      this.glacier[i] = 0;
      this.eng.dirty.add(i);
    }
    this.driftAcc[i] = 0;
  }

  /** 土壤肥力对植被复苏的除子：0.6（贫瘠）↔ 1.4（沃土）——贫土复苏慢一半，沃土快四成 */
  soilMulAt(i: number): number {
    return 0.6 + (this.soilF[i] / 255) * 0.8;
  }

  // ==================================================================
  // 二 + 三：水力侵蚀与沉积 + 土壤动态（每 600 tick，与 geologyTick %31 错峰）
  // ==================================================================
  hydroTick() {
    const eng = this.eng;
    const nat = eng.nature;
    const N = W * H;
    const elev = this.elev;
    // —— 1) 降水加权：大气 moist 场（粗网格映射）× 降雨 + 河道流量加成 ——
    for (let y = 0; y < H; y++) {
      const cy = Math.min(AH - 1, (y / CELL) | 0);
      const rowBase = cy * AW;
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        const c = rowBase + ((x / CELL) | 0);
        this.flowAcc[i] = 0.5 + nat.moist[c] * 2 + (nat.rainCell[c] / 255) * 1.2 + (eng.riverDir[i] > 0 ? 8 : 0);
      }
    }
    // —— 2) 全图海拔降序排序（Uint32Array 数值排序；水格沉底成为汇） ——
    for (let i = 0; i < N; i++) this.order[i] = i;
    this.order.sort((a, b) => elev[b] - elev[a]);
    // —— 3) 流向累加：每格把累计流量传给最低邻居（8 邻域——更顺滑的汇流网络） ——
    for (let k = 0; k < N; k++) {
      const i = this.order[k];
      const t = eng.terrain[i];
      if (t === T.DEEP || t === T.WATER) continue; // 海是终点
      const x = i % W;
      const y = (i / W) | 0;
      let best = -1;
      let bestE = elev[i];
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= H) continue;
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const xx = x + dx;
          if (xx < 0 || xx >= W) continue;
          const j = yy * W + xx;
          if (elev[j] < bestE) { bestE = elev[j]; best = j; }
        }
      }
      if (best >= 0) this.flowAcc[best] += this.flowAcc[i];
    }
    // —— 4) 侵蚀与沉积 ——
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        const t = eng.terrain[i];
        if (t === T.DEEP || t === T.WATER) continue;
        let minE = Infinity;
        for (let dy = -1; dy <= 1; dy++) {
          const yy = y + dy;
          if (yy < 0 || yy >= H) continue;
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const xx = x + dx;
            if (xx < 0 || xx >= W) continue;
            const e = elev[yy * W + xx];
            if (e < minE) minE = e;
          }
        }
        const slope = elev[i] - minE;
        const f = this.flowAcc[i];
        if (slope > 0.05 && f > 2.5) {
          // 侵蚀：坡陡流大 → 山体被慢慢刻出谷地（单步 ≤0.02；冰川格 ×1.6 = U 谷刻痕）
          let er = Math.min(0.02, ERODE_K * ep('nature.erosionRate') * Math.sqrt(f) * slope);
          if (this.glacier[i] > 80) er *= 1.6;
          elev[i] -= er;
          this.eroded += er;
        } else if (slope < 0.015 && f > 3 && elev[i] < 0.32) {
          // 沉积：平缓低地 → 泥沙落淤 + 肥力累积（泛滥平原由此涌现）
          elev[i] += Math.min(0.006, 0.002 * Math.sqrt(f));
          this.soilF[i] = Math.min(255, this.soilF[i] + 2 + ((this.rng() * 4) | 0));
          this.deposited += 0.004;
        }
      }
    }
    // —— 5) 河口三角洲：riverDir>0 的入海格，邻陆优先沉积 ——
    for (const i of eng.riverTiles) {
      const x = i % W;
      const y = (i / W) | 0;
      let mouth = false;
      for (let k = 0; k < 4; k++) {
        const xx = x + (k === 0 ? -1 : k === 1 ? 1 : 0);
        const yy = y + (k === 2 ? -1 : k === 3 ? 1 : 0);
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const j = yy * W + xx;
        if (isWater(eng.terrain[j]) && !eng.riverTiles.has(j)) mouth = true;
      }
      if (!mouth) continue;
      for (let k = 0; k < 4; k++) {
        const xx = x + (k === 0 ? -1 : k === 1 ? 1 : 0);
        const yy = y + (k === 2 ? -1 : k === 3 ? 1 : 0);
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const j = yy * W + xx;
        if (!isWater(eng.terrain[j]) && eng.terrain[j] !== T.LAVA) {
          this.soilF[j] = Math.min(255, this.soilF[j] + 3);
          elev[j] += 0.003;
          this.deposited += 0.003;
        }
      }
    }
    // —— 6) 土壤动态：植被腐殖质 +1 / 沙地淋失 −1 / 过牧采样 −2 ——
    const overgraze = eng.ecoState === 'overgraze' || eng.ecoState === 'collapse';
    for (let i = 0; i < N; i++) {
      const t = eng.terrain[i];
      if (t === T.GRASS || t === T.FOREST) {
        if (this.soilF[i] < 255) this.soilF[i]++;
      } else if (t === T.SAND) {
        if (this.soilF[i] > 0) this.soilF[i]--;
      }
      if (overgraze && t === T.GRASS && (i & 7) === 0 && this.soilF[i] > 1) this.soilF[i] -= 2;
    }
    // —— 7) 连续场 → 地形类别投影（随机采样 600 格，防空间偏置；单期 ≤24 格缓变） ——
    let reclassed = 0;
    for (let k = 0; k < 600 && reclassed < 24; k++) {
      const i = (this.rng() * N) | 0;
      const t = eng.terrain[i];
      if (t === T.MOUNTAIN && elev[i] < 0.52) { eng.setTerrain(i, T.HILL); reclassed++; }
      else if (t === T.HILL && elev[i] < 0.24) { eng.setTerrain(i, T.GRASS); reclassed++; }
      else if (t === T.GRASS && elev[i] > 0.62) { eng.setTerrain(i, T.HILL); reclassed++; }
    }
  }

  // ==================================================================
  // 四：动态温度场（每 120 tick：%120===27）
  // ==================================================================
  tempTick() {
    // 全球均温慢 EMA（跨季节采样去抖——海平面驱动器要的是趋势不是季节锯齿）
    this.globalTemp += (this.computeTemps() - this.globalTemp) * 0.12;
  }

  private computeTemps(): number {
    const eng = this.eng;
    const nat = eng.nature;
    const N = W * H;
    // 1) 粗格水格清点（一次全图遍历）
    this.waterCnt.fill(0);
    for (let i = 0; i < N; i++) {
      if (isWater(eng.terrain[i])) this.waterCnt[nat.cellOf(i % W, (i / W) | 0)]++;
    }
    // 2) 大陆度记忆（指数平滑 α=0.05：世纪尺度的海洋调节 vs 大陆性记忆）
    for (let c = 0; c < AW * AH; c++) {
      const wf = this.waterCnt[c] / (CELL * CELL);
      this.cont[c] += (1 - wf - this.cont[c]) * 0.05;
    }
    // 3) 陆格邻近洋流海温（沿岸气候效应的缓存：4 邻粗格水格均值）
    for (let cy = 0; cy < AH; cy++) {
      for (let cx = 0; cx < AW; cx++) {
        const c = cy * AW + cx;
        if (this.waterCnt[c] > 32) { this.coastal[c] = 0; continue; }
        let s = 0;
        let n = 0;
        if (cx > 0 && this.waterCnt[c - 1] > 32) { s += this.sstAnom[c - 1]; n++; }
        if (cx < AW - 1 && this.waterCnt[c + 1] > 32) { s += this.sstAnom[c + 1]; n++; }
        if (cy > 0 && this.waterCnt[c - AW] > 32) { s += this.sstAnom[c - AW]; n++; }
        if (cy < AH - 1 && this.waterCnt[c + AW] > 32) { s += this.sstAnom[c + AW]; n++; }
        this.coastal[c] = n > 0 ? s / n : 0;
      }
    }
    // 4) 全图温度场：纬度基线 + 海拔递减率 + 大陆度季节振幅 + 灰烬遮蔽 + 洋流异常
    const s = nat.season;
    const seasonsOn = eng.laws.seasons;
    const ash = nat.ash;
    let sum = 0;
    for (let y = 0; y < H; y++) {
      const latF = Math.abs(y / H - 0.5) * 2; // 0 赤道 → 1 极地
      const cy = Math.min(AH - 1, (y / CELL) | 0);
      const rowBase = cy * AW;
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        const c = rowBase + ((x / CELL) | 0);
        let tv = 0.6 - latF * 1.1 + this.tNoise[i];
        if (this.elev[i] > 0) tv -= this.elev[i] * 0.55; // 海拔递减率（高原雪山涌现）
        if (seasonsOn) {
          const amp = 0.45 + this.cont[c] * 0.75; // 大陆度放大季节振幅（冬冷夏热）
          tv += s === 3 ? -0.16 * amp : s === 1 ? 0.1 * amp : 0;
        }
        tv -= ash * 0.3; // 灰烬遮蔽冷却（无夏之年）
        if (!isWater(eng.terrain[i])) tv += this.coastal[c] * 0.4; // 湾流式暖岸 / 寒流凉岸
        this.tempF[i] = tv;
        sum += tv;
        // 覆盖层量化（与旧 tempMap 同量纲：(t+0.5)×165——寒/温/热三档阈值不变）
        this.tempOverlay[i] = Math.max(0, Math.min(255, Math.round((tv + 0.5) * 165)));
      }
    }
    if (eng.overlayMode === 'temperature' || eng.overlayMode === 'biome') eng.overlayDirty = true;
    return sum / N;
  }

  // ==================================================================
  // 五：洋流系统（每 120 tick：%120===15，只在水粗格）
  // ==================================================================
  oceanTick() {
    const eng = this.eng;
    const nat = eng.nature;
    if (!eng.laws.atmosphere) return;
    const NC = AW * AH;
    const isOcean = (c: number) => this.waterCnt[c] > 32;
    // 1) 水格清点 + 风应力（640 次 windAt——缓存后旋度差分用）
    this.waterCnt.fill(0);
    for (let i = 0; i < W * H; i++) {
      if (isWater(eng.terrain[i])) this.waterCnt[nat.cellOf(i % W, (i / W) | 0)]++;
    }
    for (let cy = 0; cy < AH; cy++) {
      for (let cx = 0; cx < AW; cx++) {
        const c = cy * AW + cx;
        if (!isOcean(c)) { this.windU[c] = 0; this.windV[c] = 0; continue; }
        const [wu, wv] = nat.windAt(cx, cy);
        this.windU[c] = wu;
        this.windV[c] = wv;
      }
    }
    // 2) 风应力旋度 curl τ = ∂τy/∂x − ∂τx/∂y（陆格应力为 0）
    for (let cy = 0; cy < AH; cy++) {
      for (let cx = 0; cx < AW; cx++) {
        const c = cy * AW + cx;
        if (!isOcean(c)) { this.curlArr[c] = 0; continue; }
        const tE = cx < AW - 1 && isOcean(c + 1) ? this.windV[c + 1] : 0;
        const tW = cx > 0 && isOcean(c - 1) ? this.windV[c - 1] : 0;
        const tS = cy < AH - 1 && isOcean(c + AW) ? this.windU[c + AW] : 0;
        const tN = cy > 0 && isOcean(c - AW) ? this.windU[c - AW] : 0;
        this.curlArr[c] = (tE - tW) / 2 - (tS - tN) / 2;
      }
    }
    // 3) Stommel 流函数 Jacobi（Gauss-Seidel 就地松弛 24 次——ψ 暖启动跨期收敛）
    //    ε∇²ψ + β·∂ψ/∂x = curl τ；β>0 → 西边界流束变窄变强（湾流/黑潮式西向强化）
    const EPS = 0.3;
    const BETA = 0.16;
    for (let it = 0; it < 24; it++) {
      for (let cy = 1; cy < AH - 1; cy++) {
        for (let cx = 1; cx < AW - 1; cx++) {
          const c = cy * AW + cx;
          if (!isOcean(c)) continue;
          const pE = isOcean(c + 1) ? this.psi[c + 1] : 0;
          const pW = isOcean(c - 1) ? this.psi[c - 1] : 0;
          const pS = isOcean(c + AW) ? this.psi[c + AW] : 0;
          const pN = isOcean(c - AW) ? this.psi[c - AW] : 0;
          this.psi[c] = (EPS * (pE + pW + pS + pN) + (BETA / 2) * (pE - pW) - this.curlArr[c]) / (4 * EPS);
        }
      }
    }
    // 4) 流速场：u = −∂ψ/∂y，v = +∂ψ/∂x（尺度 ×1 后夹断——保留西边界强化的对比度）
    const CS = 1;
    for (let cy = 0; cy < AH; cy++) {
      for (let cx = 0; cx < AW; cx++) {
        const c = cy * AW + cx;
        if (!isOcean(c)) { this.curU[c] = 0; this.curV[c] = 0; continue; }
        const pE = cx < AW - 1 && isOcean(c + 1) ? this.psi[c + 1] : 0;
        const pW = cx > 0 && isOcean(c - 1) ? this.psi[c - 1] : 0;
        const pS = cy < AH - 1 && isOcean(c + AW) ? this.psi[c + AW] : 0;
        const pN = cy > 0 && isOcean(c - AW) ? this.psi[c - AW] : 0;
        this.curU[c] = Math.max(-0.6, Math.min(0.6, -(pS - pN) / 2 * CS));
        this.curV[c] = Math.max(-0.6, Math.min(0.6, (pE - pW) / 2 * CS));
      }
    }
    // 5) 热含量半拉格朗日平流（赤道暖源注入 + 缓慢衰减；西向强化流束把暖水极向输送）
    for (let cy = 0; cy < AH; cy++) {
      const lat = cy / (AH - 1);
      const src = 0.45 * (1 - Math.abs(lat - 0.5) * 2);
      for (let cx = 0; cx < AW; cx++) {
        const c = cy * AW + cx;
        if (!isOcean(c)) { this.qNext[c] = 0; continue; }
        const sx = Math.max(0, Math.min(AW - 1, Math.round(cx - this.curU[c] * 2)));
        const sy = Math.max(0, Math.min(AH - 1, Math.round(cy - this.curV[c] * 2)));
        const up = isOcean(sy * AW + sx) ? this.heatQ[sy * AW + sx] : this.heatQ[c];
        this.qNext[c] = (up + src) * 0.975;
      }
    }
    this.heatQ.set(this.qNext);
    // 6) 海温异常 = 偏离纬圈均值（×6 放大出 ±0.3 量级的暖池/冷舌）
    for (let cy = 0; cy < AH; cy++) {
      let sum = 0;
      let n = 0;
      for (let cx = 0; cx < AW; cx++) {
        const c = cy * AW + cx;
        if (isOcean(c)) { sum += this.heatQ[c]; n++; }
      }
      const zmean = n > 0 ? sum / n : 0;
      for (let cx = 0; cx < AW; cx++) {
        const c = cy * AW + cx;
        if (!isOcean(c)) { this.sstAnom[c] = 0; continue; }
        this.sstAnom[c] = Math.max(-1, Math.min(1, (this.heatQ[c] - zmean) * 6));
      }
    }
    // 7) 上升流：赤道辐合带东侧 + 大陆西岸（简化判定）→ 冷水上翻 + 渔场标记
    this.upwellingCells = 0;
    for (let cy = 0; cy < AH; cy++) {
      const lat = cy / (AH - 1);
      for (let cx = 0; cx < AW; cx++) {
        const c = cy * AW + cx;
        if (!isOcean(c)) { this.upwell[c] = 0; continue; }
        const up = Math.abs(lat - nat.itczLat) < 0.1 && (cx < AW * 0.25 || cx > AW * 0.75);
        this.upwell[c] = up ? 1 : 0;
        if (up) {
          this.sstAnom[c] = Math.max(-1, this.sstAnom[c] - 0.16);
          this.upwellingCells++;
        }
      }
    }
    // 8) 强流占比（快照：西边界强化是否成形）
    let strong = 0;
    let waterN = 0;
    for (let c = 0; c < NC; c++) {
      if (!isOcean(c)) continue;
      waterN++;
      if (Math.hypot(this.curU[c], this.curV[c]) > 0.35) strong++;
    }
    this.strongFrac = waterN > 0 ? strong / waterN : 0;
  }

  // ==================================================================
  // 六：冰川系统（每 240 tick：%240===33——积累/消融全图结算 + 采样 300 格进退）
  // ==================================================================
  glacierTick() {
    const eng = this.eng;
    // —— 1) 积累 / 消融（O(40k) 全图，摊销可忽略）：
    //       极地低地 tempF<−0.15；山地冰川 elev>0.45 放宽到 0.02（高山冰斗）
    const N = W * H;
    for (let i = 0; i < N; i++) {
      const g = this.glacier[i];
      const t = eng.terrain[i];
      if (t === T.DEEP || t === T.WATER || t === T.ICE || t === T.LAVA) continue;
      const tv = this.tempF[i];
      const accTh = this.elev[i] > 0.45 ? 0.02 : -0.15;
      if (tv < accTh) {
        const before = g;
        this.glacier[i] = Math.min(255, g + 2 + ((this.rng() * 3) | 0)); // +2~4
        if (before <= 80 && this.glacier[i] > 80) {
          eng.dirty.add(i); // 视觉冰盖阈值跨越 → 重绘
          this.glacierTiles++;
        }
      } else if (tv > 0.1 && g > 0) {
        // 消融（火山灰期全球降温由 tempF 的 ash 项自动反馈为扩张）
        this.glacier[i] = Math.max(0, g - 3);
        if (g > 80 && this.glacier[i] <= 80) {
          eng.dirty.add(i);
          this.glacierTiles--;
        }
      }
    }
    // —— 2) 采样 300 随机格：进退结算 ——
    for (let k = 0; k < 300; k++) {
      const i = (this.rng() * N) | 0;
      const t = eng.terrain[i];
      if (t === T.DEEP || t === T.WATER || t === T.ICE || t === T.LAVA) continue;
      // 进：质量 >180 向低处邻居蔓延（advance）
      if (this.glacier[i] > 180) {
        const x = i % W;
        const y = (i / W) | 0;
        let best = -1;
        let bestE = this.elev[i];
        for (let dy = -1; dy <= 1; dy++) {
          const yy = y + dy;
          if (yy < 0 || yy >= H) continue;
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const xx = x + dx;
            if (xx < 0 || xx >= W) continue;
            const j = yy * W + xx;
            const tj = eng.terrain[j];
            if (tj === T.DEEP || tj === T.WATER || tj === T.ICE || tj === T.LAVA) continue;
            if (this.elev[j] < bestE) { bestE = this.elev[j]; best = j; }
          }
        }
        if (best >= 0) {
          const bj = this.glacier[best];
          this.glacier[best] = Math.max(bj, 40);
          if (bj <= 80 && this.glacier[best] > 80) {
            eng.dirty.add(best);
            this.glacierTiles++;
          }
        }
      }
      // 退：消融殆尽 → 清零（retreat，露出原地形；雪线进退交给群系漂移）
      if (this.glacier[i] > 0 && this.glacier[i] < 30) {
        if (this.glacier[i] > 80) this.glacierTiles--;
        this.glacier[i] = 0;
      }
    }
  }

  // ==================================================================
  // 七：海平面与海岸线进退（每 600 tick：%600===47）
  // ==================================================================
  coastTick() {
    const eng = this.eng;
    // 全球均温驱动（每地质期一步，clamp ±8 米：变冷海退 / 变暖海侵）
    this.seaLevel = Math.max(-8, Math.min(8, this.seaLevel + (this.globalTemp - this.baselineTemp) * 0.02));
    if (this.coastNoteCd > 0) this.coastNoteCd -= 600;
    if (!eng.laws.naturalDisasters) return;
    let changed = 0;
    let noteKind = 0; // 1 海侵 / 2 海退
    for (let k = 0; k < 30 && changed < 2; k++) {
      const i = (this.rng() * W * H) | 0;
      // 安全约束：有主领土 / 建筑 / 单位密集格一律跳过
      if (eng.owner[i] >= 0 || eng.building[i] > 0) continue;
      const x = i % W;
      const y = (i / W) | 0;
      const bx = Math.min(eng.bw - 1, (x / 4) | 0);
      const by = Math.min(eng.bh - 1, (y / 4) | 0);
      if (eng.buckets[by * eng.bw + bx].length > 0) continue;
      const t = eng.terrain[i];
      let seaN = false;
      let landN = false;
      for (let d = 0; d < 4; d++) {
        const xx = x + (d === 0 ? -1 : d === 1 ? 1 : 0);
        const yy = y + (d === 2 ? -1 : d === 3 ? 1 : 0);
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const nt = eng.terrain[yy * W + xx];
        if (nt === T.WATER || nt === T.DEEP) seaN = true;
        else landN = true;
      }
      if (t === T.SAND && this.seaLevel > 0.5 && seaN && this.elev[i] < this.seaLevel * 0.012) {
        eng.setTerrain(i, T.WATER); // 海侵：海水漫上低洼海岸
        changed++;
        noteKind = noteKind === 0 ? 1 : noteKind;
      } else if (t === T.WATER && this.seaLevel < -0.5 && eng.waterTier[i] <= 1 && landN) {
        eng.setTerrain(i, T.SAND); // 海退：浅水露出新生滩涂
        changed++;
        noteKind = noteKind === 0 ? 2 : noteKind;
      }
    }
    if (changed > 0 && this.coastNoteCd <= 0) {
      this.coastNoteCd = 2400; // 60 年播报冷却
      if (noteKind === 1) eng.addEvent('geo', '海水漫上了低洼的海岸，咸涩的潮水一年年向内陆蚕食', {});
      else if (noteKind === 2) eng.addEvent('geo', '海退了——滩涂从浪花下露出新生的沙脊', {});
    }
  }

  // ==================================================================
  // 八：群系漂移（每 600 tick：%600===53——全图错配累计 + 池采样迁移）
  // ==================================================================
  biomeTick() {
    const eng = this.eng;
    const nat = eng.nature;
    const N = W * H;
    // —— 1) 全图错配累计：与气候期望不符 → driftAcc+1（>3 = 持续 60+ 年错配）；匹配 → 衰减 ——
    //       （复用 order 作错配池 scratch——与 hydroTick %41 错峰不冲突）
    let poolN = 0;
    for (let i = 0; i < N; i++) {
      const t = eng.terrain[i];
      // 只动软地形（山/岩浆/焦土/冰不在漂移之列）；无主无房
      if (t !== T.GRASS && t !== T.FOREST && t !== T.SAND && t !== T.SNOW) continue;
      if (eng.owner[i] >= 0 || eng.building[i] > 0) continue;
      const x = i % W;
      const y = (i / W) | 0;
      const c = nat.cellOf(x, y);
      const moist = nat.moist[c];
      const tv = this.tempF[i];
      const soil = this.soilF[i];
      // 气候期望群系（温度 × 湿度 × 肥力三元推断）
      let want: number;
      if (tv < -0.26) want = T.SNOW; // 极冷 → 苔原雪原
      else if (tv < -0.02 && moist > 0.5) want = T.FOREST; // 冷湿 → 针叶林带
      else if (moist > 0.62 && soil > 110 && tv > 0.05) want = T.FOREST; // 暖湿沃土 → 森林
      else if (moist < 0.3 && tv > 0.38 && soil < 95) want = T.SAND; // 热干贫土 → 荒漠
      else want = T.GRASS;
      if (want === t) {
        if (this.driftAcc[i] > 0) this.driftAcc[i]--; // 匹配 → 错配记忆衰减
        continue;
      }
      if (this.driftAcc[i] < 255) this.driftAcc[i]++;
      if (this.driftAcc[i] > 3) this.order[poolN++] = i;
    }
    if (poolN === 0) return;
    // —— 2) 采样 60 次迁移掷骰（从错配池随机挑——雪线进退 / 荒漠化绿化 / 演替，GRASS 为枢纽） ——
    let migrated = 0;
    for (let k = 0; k < 60 && migrated < 12; k++) {
      const i = this.order[(this.rng() * poolN) | 0];
      if (this.driftAcc[i] <= 3) continue; // 已被本轮更早的掷骰迁移过
      const t = eng.terrain[i];
      const x = i % W;
      const y = (i / W) | 0;
      const c = nat.cellOf(x, y);
      const moist = nat.moist[c];
      const tv = this.tempF[i];
      const soil = this.soilF[i];
      let want: number;
      if (tv < -0.26) want = T.SNOW;
      else if (tv < -0.02 && moist > 0.5) want = T.FOREST;
      else if (moist > 0.62 && soil > 110 && tv > 0.05) want = T.FOREST;
      else if (moist < 0.3 && tv > 0.38 && soil < 95) want = T.SAND;
      else want = T.GRASS;
      // 迁移一步（非 GRASS 群系互转也先经 GRASS 枢纽——缓变防跳变）
      let to: number = T.GRASS;
      if (t === T.GRASS) to = want;
      if (to === T.FOREST && soil <= 110) to = T.GRASS; // 森林迁移要求 soilF>110
      if (to !== t) {
        eng.setTerrain(i, to);
        this.driftAcc[i] = 0;
        migrated++;
        this.biomeDrift++;
      }
    }
    if (migrated >= 3) {
      eng.addEvent('geo', `气候在悄悄改写大地：${migrated} 处群系发生了迁移——雪线进退、荒漠化与绿化、草木演替`, {});
    }
  }

  // ==================================================================
  // 快照（NatureSnapshot.deepTime；神谕/面板共用）
  // ==================================================================
  deepSnapshot() {
    const eng = this.eng;
    const N = W * H;
    let glac = 0;
    let soil = 0;
    let land = 0;
    for (let i = 0; i < N; i++) {
      if (this.glacier[i] > 80) glac++;
      if (!isWater(eng.terrain[i])) {
        soil += this.soilF[i];
        land++;
      }
    }
    return {
      /** 全球均温（相对温标：0.6 赤道 / −0.5 极地；<0 约=冰点下） */
      globalTemp: Math.round(this.globalTemp * 100) / 100,
      /** 海平面（米，正=海侵 / 负=海退） */
      seaLevel: Math.round(this.seaLevel * 100) / 100,
      /** 冰川覆盖比 0-1（glacier>80 口径） */
      glacierArea: Math.round((glac / N) * 10000) / 10000,
      /** 上升流渔场数（粗格） */
      upwelling: this.upwellingCells,
      /** 土壤均肥 0-255（陆地口径） */
      soilAvg: land > 0 ? Math.round(soil / land) : 0,
      /** 累计侵蚀量（海拔单位） */
      eroded: Math.round(this.eroded * 100) / 100,
      /** 累计沉积量（海拔单位） */
      deposited: Math.round(this.deposited * 100) / 100,
      /** 群系漂移累计格数 */
      biomeDrift: this.biomeDrift,
      /** 强流占比 0-1（西边界强化指示） */
      currentsStrong: Math.round(this.strongFrac * 100) / 100,
    };
  }
}
