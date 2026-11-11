// QA（确定性）：全绘档人形四相步态 —— mock ctx 重放 drawPerson 生产代码
// 断言：①行进 16 帧周期恰 4 个不同姿态 ②周期 16（t 与 t+16 帧完全一致）③站立稳定 ④三族系（人/僵尸/哥布林）全走四相
import { drawPerson } from '../src/lib/game/sprites.ts';
import { R } from '../src/lib/game/types';
import type { Unit } from '../src/lib/game/types';

function mkCtx() {
  const rec: string[] = [];
  return {
    rec,
    ctx: {
      fillStyle: '',
      fillRect: (x: number, y: number, w: number, h: number) => { rec.push(x + ',' + y + ',' + w + ',' + h); },
      save: () => {}, restore: () => {}, translate: () => {}, scale: () => {},
      drawImage: () => {}, beginPath: () => {}, arc: () => {}, fill: () => {},
    } as unknown as CanvasRenderingContext2D,
  };
}

function mkUnit(race: number, moving: boolean): Unit {
  const u = {
    id: 42, race, x: 64, y: 40, rx: 64, ry: 40, civ: -1, age: 20, maxAge: 80,
    hurt: 0, atk: 0, sleep: false, job: 0, flip: false,
  } as unknown as Unit;
  if (moving) { (u as any).lx = 63; (u as any).ly = 40; }
  return u;
}

function frameSet(u: Unit, t: number): string {
  const { ctx, rec } = mkCtx();
  drawPerson(ctx, u, null, t);
  return rec.slice().sort().join('|');
}

let fail = 0;
function check(name: string, ok: boolean, detail = '') {
  console.log((ok ? 'PASS' : 'FAIL') + ' ' + name + (detail ? '  [' + detail + ']' : ''));
  if (!ok) fail++;
}

for (const [raceName, raceId] of [['human', R.HUMAN], ['zombie', R.ZOMBIE], ['goblin', R.GOBLIN]] as [string, number][]) {
  const u = mkUnit(raceId, true);
  const states: string[] = [];
  for (let t = 1000; t < 1016; t += 4) states.push(frameSet(u, t));
  const uniq = new Set(states);
  check(raceName + ': 行进四相状态数=4', uniq.size === 4, 'got ' + uniq.size);
  check(raceName + ': 周期16（t1000≡t1016）', states[0] === frameSet(u, 1016));
  const idleU = mkUnit(raceId, false);
  check(raceName + ': 站立稳定（1000≡1032 同呼吸相）', frameSet(idleU, 1000) === frameSet(idleU, 1032));
  check(raceName + ': 站立与行进姿态不同', frameSet(idleU, 1000) !== states[0]);
}

// 步幅错位证据：四相里至少两态含 x=px-2 / px+1 的跨步腿位（px=128 → 126/129 在集合中）
{
  const u = mkUnit(0, true);
  const all = new Set();
  for (let t = 1000; t < 1016; t += 4) frameSet(u, t).split('|').forEach((s) => all.add(s.split(',')[0]));
  const xs = [...all].map(Number);
  const hasStride = xs.includes(126) && xs.includes(129);
  check('步幅错位（126 后蹬与 129 前跨）', hasStride, 'xs=' + xs.sort((a, b) => a - b).join(','));
}

console.log(fail === 0 ? 'ALL GREEN' : 'FAILURES=' + fail);
process.exit(fail === 0 ? 0 : 1);
