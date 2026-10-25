// ============ Procedural world generation (continents, biomes, wildlife) ============
import { T, R, RACES } from './types';
import { W, H } from './constants';
import { fbm, mulberry32, hash2 } from './noise';

export interface WorldGenResult {
  terrain: Uint8Array<ArrayBuffer>;
  variant: Uint8Array<ArrayBuffer>; // per-tile color variation hash 0..255
  temp: Uint8Array<ArrayBuffer>; // 0-255 气温场（纬度 + 噪声，地图覆盖模式用）
  moist: Uint8Array<ArrayBuffer>; // 0-255 湿度场（fBm，地图覆盖模式用）
  spawnAnimals: { race: number; x: number; y: number }[];
}

/** 世界模板参数（标题屏「世界模板」使用；全部可选，缺省 = 经典随机世界） */
export interface WorldGenParams {
  /** 海平面偏移：正 = 更多海洋（群岛），负 = 更多陆地（盘古大陆） */
  seaBias?: number;
  /** 温度偏置：负 = 冰河期，正 = 温室纪 */
  tempBias?: number;
  /** 湿度偏置：负 = 干旱，正 = 湿润 */
  moistBias?: number;
  /** 地形破碎度（domain warp 强度倍率）：高 = 峡湾群岛，低 = 平整大陆 */
  warp?: number;
  /** 边缘衰减强度：低 = 内陆型超大陆，高 = 环形群岛链 */
  falloff?: number;
  /** 湖泊数量（缺省随机 3-6） */
  lakes?: number;
}

/** main heightmap: domain-warped fBm with edge falloff → continents & islands */
function heightAt(x: number, y: number, seed: number, warp: number, falloff: number): number {
  const nx = x / W;
  const ny = y / H;
  // domain warp
  const wx = fbm(nx * 3 + 5.2, ny * 3 + 1.3, seed + 77, 3) - 0.5;
  const wy = fbm(nx * 3 + 1.7, ny * 3 + 9.2, seed + 133, 3) - 0.5;
  let h = fbm(nx * 4.4 + wx * 1.4 * warp, ny * 4.4 + wy * 1.4 * warp, seed, 6);
  // edge falloff so the map is surrounded by ocean
  const dx = (nx - 0.5) * 2;
  const dy = (ny - 0.5) * 2;
  const d = Math.sqrt(dx * dx + dy * dy);
  h -= Math.max(0, (d - 0.55) * falloff);
  // gentle contrast push
  h = Math.max(0, Math.min(1, (h - 0.28) * 1.55 + 0.28));
  return h;
}

export function generateWorld(seed: number, params?: WorldGenParams): WorldGenResult {
  const rand = mulberry32(seed);
  const terrain = new Uint8Array(W * H);
  const variant = new Uint8Array(W * H);
  const temp = new Uint8Array(W * H);
  const moist = new Uint8Array(W * H);
  // 模板参数（缺省值 = 既往经典世界，完全向后兼容）
  const seaBias = params?.seaBias ?? 0;
  const tempBias = params?.tempBias ?? 0;
  const moistBias = params?.moistBias ?? 0;
  const warp = params?.warp ?? 1;
  const falloff = params?.falloff ?? 0.9;
  const lakeCount = params?.lakes ?? 3 + Math.floor(rand() * 4);

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      variant[i] = Math.floor(hash2(x, y, seed + 999) * 255);

      const h = heightAt(x, y, seed, warp, falloff) - seaBias;
      // climate
      const lat = Math.abs(y / H - 0.5) * 2; // 0 equator, 1 pole
      const tempF = 1 - lat * 1.25 + (fbm(x / 48, y / 48, seed + 555, 3) - 0.5) * 0.35 + tempBias;
      const moistF = Math.min(1, Math.max(0, fbm(x / 36 + 8, y / 36 + 3, seed + 321, 4) + moistBias));

      let t: number;
      if (h < 0.30) t = T.DEEP;
      else if (h < 0.42) t = T.WATER;
      else if (h < 0.46) t = T.SAND;
      else if (h < 0.70) t = T.GRASS;
      else if (h < 0.80) t = T.HILL;
      else t = T.MOUNTAIN;

      if (t === T.GRASS) {
        if (tempF < 0.26) t = T.SNOW;
        else if (moistF > 0.60 && tempF > 0.3) t = T.FOREST;
        else if (tempF > 0.82 && moistF < 0.42) t = T.SAND;
      }
      terrain[i] = t;
      // 气候场量化存储（覆盖层渲染用；同 seed 确定性复现 → 读档时直接重算，不入存档）
      temp[i] = Math.max(0, Math.min(255, Math.round((tempF + 0.08) * 165)));
      moist[i] = Math.max(0, Math.min(255, Math.round(moistF * 255)));
    }
  }

  // sprinkle small lakes
  const lakes = lakeCount;
  for (let l = 0; l < lakes; l++) {
    const cx = 20 + rand() * (W - 40);
    const cy = 16 + rand() * (H - 32);
    const r = 2 + rand() * 3;
    for (let y = Math.floor(cy - r - 1); y <= cy + r + 1; y++) {
      for (let x = Math.floor(cx - r - 1); x <= cx + r + 1; x++) {
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        const dd = Math.hypot(x - cx, y - cy);
        if (dd <= r && terrain[y * W + x] >= T.SAND) terrain[y * W + x] = T.WATER;
      }
    }
  }

  // —— 沼泽斑片：高湿度 + 低海拔 + 邻水洼地（湖畔/河畔/海岸湿地；斑块状噪声成形）——
  const nearWater = (x: number, y: number, r: number): boolean => {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const t = terrain[yy * W + xx];
        if (t === T.WATER || t === T.DEEP) return true;
      }
    }
    return false;
  };
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      if (terrain[i] !== T.GRASS) continue;
      const h = heightAt(x, y, seed, warp, falloff) - seaBias;
      if (h >= 0.56) continue; // 只落在低海拔洼地
      const m = Math.min(1, Math.max(0, fbm(x / 36 + 8, y / 36 + 3, seed + 321, 4) + moistBias));
      if (m < 0.60) continue; // 高湿度
      // 斑块噪声：只有噪声峰区成沼（避免满图烂泥；种子确定性 → 读档重放一致）
      const patch = fbm(x / 13 + 41, y / 13 + 23, seed + 777, 3);
      if (patch < 0.55) continue;
      if (!nearWater(x, y, 2)) continue; // 邻水洼地
      terrain[i] = T.SWAMP;
    }
  }

  // wildlife
  const spawnAnimals: { race: number; x: number; y: number }[] = [];
  const trySpawn = (race: number, count: number, group: [number, number], need: number, nearWaterR = 0) => {
    let placed = 0;
    let guard = 0;
    while (placed < count && guard++ < count * 60) {
      const x = rand() * W;
      const y = rand() * H;
      const i = Math.floor(y) * W + Math.floor(x);
      if (terrain[i] === need && (nearWaterR <= 0 || nearWater(Math.floor(x), Math.floor(y), nearWaterR))) {
        spawnAnimals.push({ race, x, y });
        placed++;
        // pack mates
        const n = group[0] + Math.floor(rand() * (group[1] - group[0] + 1));
        for (let m = 1; m < n; m++) {
          const mx = x + (rand() - 0.5) * 5;
          const my = y + (rand() - 0.5) * 5;
          const mi = Math.floor(my) * W + Math.floor(mx);
          if (mx >= 0 && my >= 0 && mx < W && my < H && terrain[mi] === need) {
            spawnAnimals.push({ race: R[race] === undefined ? race : race, x: mx, y: my });
          }
        }
      }
    }
  };
  /** 猎场网络均匀撒布（Task 98）：最远点采样（greedy k-center）—— 每步都挑「离已选锚点最远的
   *  候选瓦片」，锚点天然向真空带铺开，任意海域到最近猎场的距离被直接压到最小。纯随机撒点
   *  （泊松过程）会聚簇出 50+ 格无鱼真空带；min-dist 贪心防聚簇但不保证覆盖（实测仍有 78 格
   *  孔洞）—— 只有覆盖式采样能满足鲨鱼的通勤经济学（满仓续航 ≈54 格，Task 96 实测 102 格
   *  通勤必饿毙）。首锚由 rand 随机选取打破平局 → 同种子布局仍一致。 */
  const trySpawnSpread = (race: number, count: number, group: [number, number], needs: number[]) => {
    const cand: number[] = [];
    for (let i = 0; i < terrain.length; i++) if (needs.indexOf(terrain[i]) >= 0) cand.push(i);
    if (cand.length === 0) return;
    // nearest[i] = 候选 i 到最近已选锚点的距离平方（增量更新 —— O(count×cand) 对一次性世界生成可忽略）
    const nearest = new Float64Array(cand.length).fill(Infinity);
    const px: number[] = [];
    const py: number[] = [];
    const seedAt = (ci: number) => {
      const cx = ci % W;
      const cy = (ci / W) | 0;
      px.push(cx);
      py.push(cy);
      for (let i = 0; i < cand.length; i++) {
        const dx = (cand[i] % W) - cx;
        const dy = ((cand[i] / W) | 0) - cy;
        const d2 = dx * dx + dy * dy;
        if (d2 < nearest[i]) nearest[i] = d2;
      }
    };
    seedAt(Math.floor(rand() * cand.length)); // 首锚随机：打破 k-center 的平局对称性（同种子仍一致）
    for (let k = 1; k < count; k++) {
      let best = -1;
      let bestD = -1;
      for (let i = 0; i < cand.length; i++) {
        if (nearest[i] > bestD) { bestD = nearest[i]; best = i; }
      }
      if (best < 0 || bestD <= 0) break; // 全图已覆盖（理论不可达）→ 提前收手
      seedAt(cand[best]);
    }
    for (let p = 0; p < px.length; p++) {
      spawnAnimals.push({ race, x: px[p] + 0.5, y: py[p] + 0.5 });
      const n = group[0] + Math.floor(rand() * (group[1] - group[0] + 1));
      for (let m = 1; m < n; m++) {
        const mx = px[p] + (rand() - 0.5) * 5;
        const my = py[p] + (rand() - 0.5) * 5;
        if (mx < 0 || my < 0 || mx >= W || my >= H) continue;
        const mi = Math.floor(my) * W + Math.floor(mx);
        if (needs.indexOf(terrain[mi]) >= 0) {
          spawnAnimals.push({ race, x: mx, y: my });
        }
      }
    }
  };

  trySpawn(R.SHEEP, 24, [4, 7], T.GRASS); // 羊：草原大群（密度足够支撑捕食链 —— LV 从第一年起就能运转）
  trySpawn(R.WOLF, 9, [2, 4], T.FOREST);
  trySpawn(R.BEAR, 5, [1, 1], T.FOREST);
  trySpawn(R.DEER, 14, [3, 5], T.GRASS); // 鹿：草地群落，行动敏捷
  trySpawn(R.PENGUIN, 8, [2, 4], T.SNOW); // 企鹅：雪原群落
  trySpawn(R.CAMEL, 6, [2, 4], T.SAND); // 骆驼：沙漠群落
  trySpawn(R.SCORPION, 8, [2, 3], T.SAND); // 蝎子：沙漠穴居猎手
  trySpawn(R.SNAKE, 7, [2, 3], T.SAND); // 蛇：沙漠猎手（毒牙）
  trySpawn(R.SNOWWOLF, 8, [2, 4], T.SNOW); // 雪狼：极地冰原的白色猎手，成群追猎企鹅与驯鹿
  // —— 八新动物播撒 ——
  trySpawn(R.CHICKEN, 10, [3, 5], T.GRASS); // 鸡：村落式小群（草地）
  trySpawn(R.PIG, 8, [3, 5], T.GRASS);      // 猪：草地小群（掉肉大户）
  trySpawn(R.RABBIT, 12, [3, 6], T.GRASS);  // 兔：草地群穴（狐的猎物）
  trySpawn(R.RABBIT, 5, [2, 4], T.FOREST);  // 兔：林缘亦有
  trySpawn(R.FOX, 6, [1, 2], T.FOREST);     // 狐：森林猎手
  // 鱼：猎场网络均匀撒布（Task 98）—— 纯随机撒点会聚簇出 50+ 格无鱼真空带，而鲨鱼的通勤经济学
  // 依赖「任意海域到最近猎场的距离 ≤ 续航」。浅/深两次独立采样会有盲区：深洋候选集远大于锚数
  // （实测 6 锚拉出 59-87 格孔洞）—— 合并为单一全局采样，浅水/深海底一起参与最远点竞选。
  trySpawnSpread(R.FISH, 26, [5, 9], [T.WATER, T.DEEP]); // 鱼：26 锚覆盖式铺满全部海域（含深海）
  trySpawn(R.CRAB, 10, [2, 4], T.SAND, 2);  // 蟹：限邻水沙滩（2 格内有水）
  trySpawn(R.TURTLE, 9, [2, 4], T.DEEP);    // 龟：海洋游荡
  trySpawn(R.SHARK, 6, [1, 2], T.DEEP);     // 鲨鱼：深海独行猎手
  // 鲨鱼锚定鱼群：远洋独行猎手的猎场 = 鱼群巡游处 —— 随机深水的鲨鱼追不上 24 格外的鱼群
  // （Task 96 实测：距猎物 6 格饿毙），开局落位必须跟着鱼群走，否则整代猎手饿毙在猎场路上
  {
    const fishSpots = spawnAnimals.filter((a) => a.race === R.FISH);
    for (const a of spawnAnimals) {
      if (a.race !== R.SHARK || fishSpots.length === 0) continue;
      // 落点水域校验（Task 98）：±1.5 抖动可能落在岸上 —— 出世即搁浅（beachedAquaticTick
      // 15 tick 窒息终局），实测 6 头创始鲨 4 头这样夭折。8 次重试都落水失败则留守原深水点。
      const f = fishSpots[Math.floor(rand() * fishSpots.length)];
      for (let t = 0; t < 8; t++) {
        const jx = Math.max(0.5, Math.min(W - 0.5, f.x + (rand() * 3 - 1.5)));
        const jy = Math.max(0.5, Math.min(H - 0.5, f.y + (rand() * 3 - 1.5)));
        const jt = terrain[Math.floor(jy) * W + Math.floor(jx)];
        if (jt === T.WATER || jt === T.DEEP) { a.x = jx; a.y = jy; break; }
      }
    }
  }

  // sanity: ensure at least some land
  let land = 0;
  for (let i = 0; i < terrain.length; i += 7) if (terrain[i] >= T.SAND) land++;
  if (land < 400) return generateWorld(seed + 1337, params);

  return { terrain, variant, temp, moist, spawnAnimals };
}

export const raceName = (r: number) => RACES[r]?.name ?? '?';
