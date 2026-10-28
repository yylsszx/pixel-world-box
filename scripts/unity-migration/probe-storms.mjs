// ============================================================================
// probe-storms.mjs —— M-U1b 切片 3 激活度工程探针（Task 138）
// 验证三场景分支可达性：暖洋气旋窗（waterFrac>0.88 邻 ITCZ 洋格）/ 极地冰暴窗
// （latA>0.68 洋格）/ 干旱沙暴窗（waterFrac<0.25 且沙地>34 或 <20 的格）。
// 运行：bun scripts/unity-migration/probe-storms.mjs
// ============================================================================
import { generateWorld } from '../../src/lib/game/worldgen.ts';
import { W, H } from '../../src/lib/game/constants.ts';

const AW = Math.floor(W / 8), AH = Math.floor(H / 8), CELL = 8;

function cellStats(terrain, cx, cy) {
  let water = 0, elev = 0, sand = 0;
  const x0 = cx * CELL, y0 = cy * CELL;
  for (let y = y0; y < y0 + CELL && y < H; y++) {
    for (let x = x0; x < x0 + CELL && x < W; x++) {
      const t = terrain[y * W + x];
      if (t === 0 || t === 1) water++;
      else if (t === 6 || t === 8) elev += 3;
      else if (t === 5) elev += 2;
      else elev += 1;
      if (t === 2) sand++; // T.SAND=2
    }
  }
  const n = CELL * CELL;
  return { waterFrac: water / n, elev: elev / n, sand };
}

for (const seed of [20261026, 42, 777, 1234, 5555, 31415]) {
  const world = generateWorld(seed);
  const t = world.terrain;
  // 暖洋窗：cy 8..14（|latA-itcz|<0.2, itcz夏=0.562）且 waterFrac>0.88
  let warmCells = 0, warmWithLand = 0;
  for (let cy = 8; cy <= 14; cy++) for (let cx = 0; cx < AW; cx++) {
    const st = cellStats(t, cx, cy);
    if (st.waterFrac > 0.88) { warmCells++; if (st.waterFrac < 1.0) warmWithLand++; }
  }
  // 冰暴窗：cy<=3 || cy>=16 且 waterFrac>0.3
  let polarCells = 0;
  for (let cy = 0; cy < AH; cy++) {
    const latA = Math.abs(cy / (AH - 1) - 0.5) * 2;
    if (latA <= 0.68) continue;
    for (let cx = 0; cx < AW; cx++) if (cellStats(t, cx, cy).waterFrac > 0.3) polarCells++;
  }
  // 干旱窗：waterFrac<0.25 的格中 sand>34（沙暴）/ sand<20（干旱）/ 高山格 elev>1.6
  let aridCells = 0, sandHeavy = 0, sandLight = 0, mtnCells = 0, landCells = 0;
  for (let cy = 0; cy < AH; cy++) for (let cx = 0; cx < AW; cx++) {
    const st = cellStats(t, cx, cy);
    if (st.waterFrac < 0.25) {
      aridCells++;
      if (st.sand > 34) sandHeavy++;
      else if (st.sand < 20) sandLight++;
    }
    if (st.waterFrac < 0.4 && st.elev > 1.6) mtnCells++;
    if (st.waterFrac < 0.4) landCells++;
  }
  console.log(`seed=${seed} warm(wf>0.88,cy8-14)=${warmCells} polar=${polarCells} arid(wf<0.25)=${aridCells} sandHeavy=${sandHeavy} sandLight=${sandLight} mtnLand(wf<0.4,elev>1.6)=${mtnCells} landCells=${landCells}`);
}
