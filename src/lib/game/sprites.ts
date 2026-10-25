// ============ Pixel sprite painters — drawn on the 2px-per-tile world canvas ============
import type { Building, Effect, GroundItem, ItemKind, Unit } from './types';
import { T, R, RACES } from './types';
import { shiftColor, shiftRgb, visCacheFor, type VisCache } from './emergence';

const rgb = (c: [number, number, number]) => `rgb(${c[0]},${c[1]},${c[2]})`;
const mix = (a: [number, number, number], b: [number, number, number], t: number): [number, number, number] => [
  Math.round(a[0] + (b[0] - a[0]) * t),
  Math.round(a[1] + (b[1] - a[1]) * t),
  Math.round(a[2] + (b[2] - a[2]) * t),
];

const SKIN: Record<number, [number, number, number]> = {
  0: [217, 160, 102], 1: [232, 230, 200], 2: [222, 175, 120], 3: [127, 169, 60],
  4: [217, 160, 102], 5: [127, 169, 60], 9: [180, 40, 40],
  19: [79, 158, 58], 20: [127, 169, 60],
};

/**
 * 精细动态人形（恶魔级身形标准）：多部件身体 —— 地面阴影 / 交替跨步的双腿 /
 * 反相摆动的双臂 / 头部（发色/瞳孔/种族特征：精灵尖耳、矮人胡须、兽人獠牙、
 * 强盗兜帽、僵尸前伸双臂、蜥蜴人吻部与摆尾、哥布林大耳）/ 呼吸起伏 / 挥击姿势。
 * 适用种族：人类/精灵/矮人/兽人/强盗/僵尸/蜥蜴人/哥布林。
 */
export function drawPerson(ctx: CanvasRenderingContext2D, u: Unit, civColor: [number, number, number] | null, t = 0) {
  const px = u.dpx ?? (u.rx ?? u.x) * 2;
  const py = u.dpy ?? (u.ry ?? u.y) * 2;
  const f = u.flip ? -1 : 1;
  const race = u.race;
  // v3：涌现亚种（视觉基因组）→ 肤色/发色随谱系漂移 + 种族标记（角/尖耳/荧光瞳/头冠）
  const vis = RACES[race]?.vis;
  const skin = vis ? shiftRgb(SKIN[vis.root] ?? SKIN[0], vis) : (SKIN[race] ?? SKIN[0]);
  const goblin = race === R.GOBLIN;
  const zombie = race === R.ZOMBIE;
  const isMoving = u.lx !== undefined && (u.lx !== u.x || u.ly !== u.y);
  // 步态相位：移动中每 4 帧交替（WorldBox 小人韵律）；静止时呼吸相位（慢一档）
  const step = isMoving ? ((t >> 2) & 1) : 0;
  const bob = isMoving && step === 1 ? 1 : 0;
  const breath = !isMoving && ((t >> 4) & 1) === 1 ? 1 : 0;
  const y = py - bob - breath;

  // 衣布配色：蜥蜴人/哥布林无王国时着本族衣；文明单位披王国色
  let cloth: [number, number, number];
  if (race === R.GOBLIN) cloth = [90, 122, 44];
  else if (race === R.LIZARD) cloth = [58, 52, 44];
  else if (civColor) cloth = mix(civColor, [30, 30, 30], 0.25);
  else cloth = [120, 90, 70];
  const pants: [number, number, number] = mix(cloth, [20, 18, 14], 0.55);
  const hairBase = race === R.ELF ? '#e8d5a0' : race === R.DWARF ? '#b5651d' : race === R.ORC || race === R.BANDIT ? '#14100c' : race === R.ZOMBIE ? '#3a342c' : race === R.LIZARD ? '#2c5e24' : race === R.GOBLIN ? '#2c5e24' : '#5b3a1e';
  // Task 48-B3 长者灰发：年逾 78% 寿限头发染霜（岁月可见；僵尸保持腐色）
  const hairCol = race !== R.ZOMBIE && u.age > u.maxAge * 0.78 ? (vis ? shiftColor('#c9c5bd', vis) : '#c9c5bd') : vis ? shiftColor(hairBase, vis) : hairBase;

  // ---- 巨型特质：整身放大一号（头 3 宽/躯干 3 宽/加高一格） ----
  if (u.trait === 'giant') {
    const gy = py - bob;
    // 阴影
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(px - 2, gy + 3, 5, 1);
    // 头 3x2 + 发
    ctx.fillStyle = hairCol;
    ctx.fillRect(px - 1, gy - 4, 3, 1);
    ctx.fillStyle = rgb(skin);
    ctx.fillRect(px - 1, gy - 3, 3, 2);
    ctx.fillStyle = '#14100c';
    ctx.fillRect(px + (u.flip ? -2 : 1), gy - 3, 1, 1);
    // 躯干 3x2 + 巨臂
    ctx.fillStyle = u.hurt > 0 ? '#ff3b30' : rgb(cloth);
    ctx.fillRect(px - 1, gy - 1, 3, 2);
    ctx.fillStyle = rgb(skin);
    ctx.fillRect(px - 3, gy - 1, 1, 2);
    ctx.fillRect(px + 2, gy - 1, 1, 2);
    // 双腿跨步
    ctx.fillStyle = rgb(pants);
    if (step === 1) {
      ctx.fillRect(px - 1, gy + 1, 1, 2);
      ctx.fillRect(px + 1, gy + 1, 1, 1);
    } else {
      ctx.fillRect(px - 1, gy + 1, 1, 1);
      ctx.fillRect(px + 1, gy + 1, 1, 2);
    }
    // 武器：3px 长剑（攻击时举过头顶）/ 火枪（水平枪身 + 射击时枪口爆闪）/ 相位光束枪（能量槽发光）
    if (u.wep === 'musket' || u.wep === 'rifle' || u.wep === 'laser_rifle') {
      const fut = u.wep === 'laser_rifle';
      ctx.fillStyle = fut ? '#1d2b36' : u.wep === 'rifle' ? '#3a3f4a' : '#4a4038';
      ctx.fillRect(px + 2 * f, gy - 2, 3, 1); // 枪管（指向面朝方向）
      ctx.fillStyle = fut ? '#2e4456' : '#6e4a2b';
      ctx.fillRect(px + f, gy - 2, 1, 1); // 枪托/握把
      if (fut) {
        // 能量槽：枪管中段青色发光 2px（呼吸闪烁）
        const glow = ((t >> 3) & 1) === 1 ? '#7df9ff' : '#3ec6d8';
        ctx.fillStyle = glow;
        ctx.fillRect(px + 3 * f, gy - 2, 1, 1);
      }
      if ((u.atk ?? 0) > 0) {
        // 枪口爆闪：常规火药黄白 / 未来相色光束尖
        ctx.fillStyle = fut ? '#a5f3fc' : '#fff3c4';
        ctx.fillRect(px + 5 * f, gy - 2, 1, 1);
        if (fut) {
          ctx.fillStyle = '#22d3ee';
          ctx.fillRect(px + 6 * f, gy - 2, 1, 1);
        }
      }
    } else if (u.wep) {
      ctx.fillStyle = u.wep === 'sword3' ? '#ffd93d' : u.wep === 'sword2' ? '#e8e8e8' : '#9a8f7a';
      if ((u.atk ?? 0) > 0) ctx.fillRect(px + 2 * f, gy - 4, 1, 3);
      else ctx.fillRect(px + 2 * f, gy - 2, 1, 3);
    }
  } else {
    // ---- 常规身形（总高 6px：头2 躯干2 腿2；哥布林矮一号） ----
    const hY = goblin ? y + 1 : y; // 哥布林整体压低 1px
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fillRect(px - 1, y + 3, 3, 1);
    // 双腿：交替跨步（一条全长一条收起）
    ctx.fillStyle = rgb(pants);
    const legH = goblin ? 1 : 2;
    if (isMoving) {
      if (step === 1) {
        ctx.fillRect(px - 1, y + 1 + (goblin ? 1 : 0), 1, legH);
        ctx.fillRect(px, y + 2 + (goblin ? 1 : 0), 1, 1);
      } else {
        ctx.fillRect(px - 1, y + 2 + (goblin ? 1 : 0), 1, 1);
        ctx.fillRect(px, y + 1 + (goblin ? 1 : 0), 1, legH);
      }
    } else {
      ctx.fillRect(px - 1, y + 1 + (goblin ? 1 : 0), 1, legH);
      ctx.fillRect(px, y + 1 + (goblin ? 1 : 0), 1, legH);
    }
    // 躯干（2x2；矮人/壮硕亚种加宽 3）
    const torsoW = race === R.DWARF || (vis?.bulk ?? 0) >= 0.62 ? 3 : 2;
    const tx = race === R.DWARF ? px - 1 : px - 1;
    ctx.fillStyle = u.hurt > 0 ? '#ff3b30' : rgb(cloth);
    ctx.fillRect(tx, hY - 1, torsoW, 2);
    // 护甲：胸前甲片
    if (u.arm) {
      ctx.fillStyle = u.arm === 'armor2' ? '#cfd4da' : '#b58a5a';
      ctx.fillRect(px - 1, hY - 1, 1, 1);
      ctx.fillRect(px, hY - 1, 1, 1);
    }
    // 双臂：反相摆动（僵尸双臂前伸平举）
    ctx.fillStyle = rgb(skin);
    if (zombie) {
      ctx.fillRect(px + (f > 0 ? 1 : -2), hY - 2, 2, 1);
    } else if ((u.atk ?? 0) > 0) {
      // 攻击：持械臂高举
      ctx.fillRect(px + 2 * f, hY - 3, 1, 2);
      ctx.fillRect(px - 2 * f + (f > 0 ? 1 : 0), hY - 1, 1, 2);
    } else if (isMoving) {
      if (step === 1) {
        ctx.fillRect(px - 2, hY - 1, 1, 1);
        ctx.fillRect(px + 1, hY, 1, 2);
      } else {
        ctx.fillRect(px - 2, hY, 1, 2);
        ctx.fillRect(px + 1, hY - 1, 1, 1);
      }
    } else {
      ctx.fillRect(px - 2, hY - 1, 1, 2);
      ctx.fillRect(px + 1, hY - 1, 1, 2);
    }
    // 头 2x2 + 发
    ctx.fillStyle = hairCol;
    ctx.fillRect(px - 1, hY - 3, 2, 1);
    ctx.fillStyle = rgb(skin);
    ctx.fillRect(px - 1, hY - 2, 2, 2);
    // 瞳孔（朝向前方一格）
    ctx.fillStyle = race === R.ORC || race === R.GOBLIN ? '#cf3f2e' : race === R.LIZARD ? '#ffd93d' : '#14100c';
    ctx.fillRect(px + (f > 0 ? 0 : -1), hY - 2, 1, 1);
    // —— 种族特征 ——
    if (race === R.ELF) {
      // 精灵尖耳
      ctx.fillStyle = rgb(skin);
      ctx.fillRect(px - 2, hY - 2, 1, 1);
      ctx.fillRect(px + 1, hY - 2, 1, 1);
    } else if (race === R.DWARF) {
      // 矮人：钢盔 + 浓须盖胸
      ctx.fillStyle = '#c0c6cc';
      ctx.fillRect(px - 1, hY - 3, 2, 1);
      ctx.fillStyle = u.hurt > 0 ? '#ff6b5e' : '#c96a15';
      ctx.fillRect(px - 1, hY - 1, 2, 1);
    } else if (race === R.ORC) {
      // 兽人：獠牙自颌下支出
      ctx.fillStyle = '#f2ead8';
      ctx.fillRect(px - 1, hY, 1, 1);
      ctx.fillRect(px + 1, hY, 1, 1);
    } else if (race === R.BANDIT) {
      // 强盗：兜帽罩头（露一眼孔）
      ctx.fillStyle = '#3a342c';
      ctx.fillRect(px - 1, hY - 3, 2, 3);
      ctx.fillStyle = '#cf3f2e';
      ctx.fillRect(px + (f > 0 ? 0 : -1), hY - 2, 1, 1);
    } else if (race === R.LIZARD) {
      // 蜥蜴人：头冠 + 吻部前伸 + 身后摆尾
      ctx.fillStyle = '#2c5e24';
      ctx.fillRect(px - 1, hY - 3, 2, 1);
      ctx.fillStyle = rgb(skin);
      ctx.fillRect(px + 2 * f, hY - 2, 1, 1);
      ctx.fillStyle = '#2c5e24';
      const tailUp = ((t >> 3) & 1) === 1;
      ctx.fillRect(px - 2 * f, hY + 1, 1, 1);
      ctx.fillRect(px - 3 * f, tailUp ? hY : hY + 1, 1, 1);
    } else if (goblin) {
      // 哥布林：横向大耳
      ctx.fillStyle = rgb(skin);
      ctx.fillRect(px - 2, hY - 2, 1, 1);
      ctx.fillRect(px + 1, hY - 2, 1, 1);
    } else if (vis) {
      // v3 涌现亚种标记：尖耳/头角/荧光瞳/头冠/条纹 —— 血统写在脸上
      if (vis.ears === 2) {
        ctx.fillStyle = rgb(skin);
        ctx.fillRect(px - 2, hY - 3, 1, 2);
        ctx.fillRect(px + 1, hY - 3, 1, 2);
      } else if (vis.ears === 1) {
        ctx.fillStyle = rgb(skin);
        ctx.fillRect(px - 2, hY - 2, 1, 1);
        ctx.fillRect(px + 1, hY - 2, 1, 1);
      }
      if (vis.horns >= 1) {
        ctx.fillStyle = shiftColor('#e8dcc8', vis, -0.08);
        ctx.fillRect(px - 1, hY - 4, 1, 1);
        if (vis.horns >= 2) ctx.fillRect(px, hY - 4, 1, 1);
      }
      if (vis.crest) {
        ctx.fillStyle = shiftColor('#cf3f2e', vis, 0.1);
        ctx.fillRect(px - 1, hY - 4, 2, 1);
      }
      if (vis.glow) {
        ctx.fillStyle = '#7df9ff';
        ctx.fillRect(px + (f > 0 ? 0 : -1), hY - 2, 1, 1);
      }
      if (vis.pattern === 1) {
        // 条纹：躯干竖纹
        ctx.fillStyle = shiftColor('#3a342c', vis, 0.02);
        ctx.fillRect(px, hY - 1, 1, 2);
      } else if (vis.pattern === 2) {
        ctx.fillStyle = shiftColor('#cf3f2e', vis, 0.05);
        ctx.fillRect(px, hY, 1, 1);
      }
    }
    // 武器：体侧佩械（攻击时前挥 + 白刃光）/ 火枪（水平枪身 + 枪口爆闪）/ 相位光束枪（青色能量槽）
    if (u.wep === 'musket' || u.wep === 'rifle' || u.wep === 'laser_rifle') {
      const fut = u.wep === 'laser_rifle';
      ctx.fillStyle = fut ? '#1d2b36' : u.wep === 'rifle' ? '#3a3f4a' : '#4a4038';
      ctx.fillRect(px + 2 * f, hY - 2, 3, 1); // 枪管
      ctx.fillStyle = fut ? '#2e4456' : '#6e4a2b';
      ctx.fillRect(px + f, hY - 2, 1, 1); // 枪托/握把
      if (fut) {
        // 能量槽：枪管中段青色发光（呼吸闪烁）
        const glow = ((t >> 3) & 1) === 1 ? '#7df9ff' : '#3ec6d8';
        ctx.fillStyle = glow;
        ctx.fillRect(px + 3 * f, hY - 2, 1, 1);
        // 能量护盾佩戴者：身后淡青光晕 1px
        if (u.arm === 'energy_shield') {
          ctx.fillStyle = ((t >> 2) & 1) === 1 ? 'rgba(125,249,255,0.75)' : 'rgba(62,198,216,0.4)';
          ctx.fillRect(px - 2 * f, hY - 2, 1, 3);
        }
      }
      if ((u.atk ?? 0) > 0) {
        if (fut) {
          // 相位光束：枪口两段渐退青色光束尖
          ctx.fillStyle = '#22d3ee';
          ctx.fillRect(px + 5 * f, hY - 2, 1, 1);
          ctx.fillStyle = '#a5f3fc';
          ctx.fillRect(px + 4 * f, hY - 2, 1, 1);
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(px + 3 * f, hY - 2, 1, 1);
        } else {
          ctx.fillStyle = '#ffd93d';
          ctx.fillRect(px + 5 * f, hY - 2, 1, 1); // 枪口焰
          ctx.fillStyle = '#fff3c4';
          ctx.fillRect(px + 4 * f, hY - 2, 1, 1);
        }
      }
    } else if (u.wep) {
      ctx.fillStyle = u.wep === 'sword3' ? '#ffd93d' : u.wep === 'sword2' ? '#e8e8e8' : '#9a8f7a';
      if ((u.atk ?? 0) > 0) {
        ctx.fillRect(px + 2 * f, hY - 3, 1, 2);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(px + 3 * f, hY - 2, 1, 1);
      } else {
        ctx.fillRect(px + 2 * f, hY - 2, 1, 2);
      }
    }
  }
  // 职业徽标（头顶信物）：一眼可辨的分工
  const job = u.job ?? 0;
  if (u.trait !== 'giant') {
    const jY = goblin ? y + 1 : y;
    if (job === 1) {
      ctx.fillStyle = '#ffd93d';
      ctx.fillRect(px - 1, jY - 4, 2, 1);
    } else if (job === 2) {
      ctx.fillStyle = u.hurt > 0 ? '#ff6b5e' : '#c0c6cc';
      ctx.fillRect(px - 1, jY - 4, 2, 1);
      ctx.fillStyle = '#cf3f2e';
      ctx.fillRect(px - 1, jY - 5, 1, 1);
    } else if (job === 3) {
      ctx.fillStyle = '#8a5a2c';
      ctx.fillRect(px + (u.flip ? -3 : 2), jY - 2, 1, 1);
      ctx.fillRect(px + (u.flip ? -3 : 2), jY, 1, 1);
    } else if (job === 4) {
      ctx.fillStyle = '#ff9b2d';
      ctx.fillRect(px - 1, jY - 4, 2, 1);
    } else if (job === 5) {
      ctx.fillStyle = '#ffd93d';
      ctx.fillRect(px + (u.flip ? -2 : 1), jY - 1, 1, 1);
    } else if (job === 6) {
      ctx.fillStyle = '#b56cf0';
      ctx.fillRect(px - 1, jY - 1, 2, 1);
    }
  }
  if (u.infected) {
    ctx.fillStyle = '#64c95d';
    ctx.fillRect(px, y - 4, 1, 1);
  }
  if (u.hp < u.maxHp * 0.4) {
    ctx.fillStyle = '#cf3f2e';
    ctx.fillRect(px - 1, y - 5, 3, 1);
  }
}

// ---------- 涌现式生物（v3：视觉基因组驱动的程序化生物绘制） ----------
// 每个动态物种由 VisCache 参数化：体色（谱系色相漂移）× 体型（缩放/壮硕）×
// 头角/背棘/鬃毛/尾长/耳型/花纹/荧光 —— 种化一次，外形真变一次。
export function drawEmergentCreature(ctx: CanvasRenderingContext2D, u: Unit, vc: VisCache, t = 0) {
  const px = u.dpx ?? (u.rx ?? u.x) * 2;
  const py = u.dpy ?? (u.ry ?? u.y) * 2;
  const f = u.flip ? -1 : 1;
  const isMoving = u.lx !== undefined && (u.lx !== u.x || u.ly !== u.y);
  const step = isMoving ? ((t >> 2) & 1) : 0;
  const hurt = u.hurt > 0;
  const body = hurt ? '#ff6b5e' : u.infected ? '#9fd68f' : vc.body;
  const dark = hurt ? '#cf3f2e' : vc.dark;
  const light = hurt ? '#ffc4b8' : vc.light;
  const accent = hurt ? '#ffd93d' : vc.accent;
  // 体型缩放（锚定脚底，中轴不漂移）
  const scale = Math.max(0.8, Math.min(1.45, vc.size));
  const scaled = Math.abs(scale - 1) > 0.06;
  if (scaled) {
    ctx.save();
    ctx.translate(px, py + 2);
    ctx.scale(scale, scale);
    ctx.translate(-px, -(py + 2));
  }
  // —— 身体（横向椭圆体：宽度随壮硕度 3-5px，高度 1-2px）——
  const bw = 3 + (vc.bulk >= 0.55 ? 1 : 0) + (vc.size >= 1.25 ? 1 : 0);
  const bh = 1 + (vc.bulk >= 0.82 ? 1 : 0);
  const bx = px - ((bw / 2) | 0) - (f > 0 ? 0 : 1);
  const by = py - 1;
  ctx.fillStyle = body;
  ctx.fillRect(bx, by, bw, bh);
  // 腹部亮带（下缘受光）
  if (bh >= 2) {
    ctx.fillStyle = light;
    ctx.fillRect(bx + 1, by + bh - 1, bw - 2, 1);
  }
  // 背部暗脊线
  ctx.fillStyle = dark;
  ctx.fillRect(bx + 1, by, bw - 2 > 1 ? bw - 3 : 1, 1);
  // —— 花纹（条纹：暗色横带 / 斑点：强调色散点）——
  if (vc.pattern === 1) {
    ctx.fillStyle = dark;
    ctx.fillRect(bx + 1, by, 1, bh);
    if (bw >= 4) ctx.fillRect(bx + 3, by, 1, bh);
  } else if (vc.pattern === 2) {
    ctx.fillStyle = accent;
    ctx.fillRect(bx + (bw >> 1), by, 1, 1);
    if (bw >= 4 && bh >= 2) ctx.fillRect(bx + 1, by + bh - 1, 1, 1);
  }
  // —— 背棘（背中列 2-3 枚暗色尖）——
  if (vc.spikes) {
    ctx.fillStyle = dark;
    const sn = bw >= 4 ? 3 : 2;
    for (let i = 0; i < sn; i++) ctx.fillRect(bx + 1 + i, by - 1, 1, 1);
  }
  // —— 鬃毛（颈后蓬起亮色）——
  if (vc.mane) {
    ctx.fillStyle = light;
    ctx.fillRect(bx + (f > 0 ? bw - 2 : 1) - f, by - 1, 2, 1);
  }
  // —— 头（前端 1-2px + 吻部前伸）——
  const hx = f > 0 ? bx + bw : bx - 1;
  ctx.fillStyle = body;
  ctx.fillRect(hx, by, 1, bh >= 2 ? 2 : 1);
  ctx.fillRect(hx + f, by + (bh >= 2 ? 1 : 0), 1, 1); // 吻部
  // 眼（暗瞳 / 荧光瞳）
  ctx.fillStyle = vc.glow ? '#7df9ff' : dark;
  ctx.fillRect(hx, by, 1, 1);
  // —— 耳型（0 无 / 1 竖耳 / 2 长耳后掠）——
  if (vc.ears === 1) {
    ctx.fillStyle = body;
    ctx.fillRect(hx - f, by - 1, 1, 1);
  } else if (vc.ears === 2) {
    ctx.fillStyle = dark;
    ctx.fillRect(hx - 2 * f, by - 1, 2, 1);
  }
  // —— 头角（1 独角 / 2 双角：骨质亮色斜出）——
  if (vc.horns >= 1) {
    ctx.fillStyle = light;
    ctx.fillRect(hx - f, by - 1, 1, 1);
    if (vc.horns >= 2) ctx.fillRect(hx, by - 2, 1, 1);
  }
  // —— 头冠（冠羽强调色）——
  if (vc.crest) {
    ctx.fillStyle = accent;
    ctx.fillRect(hx - f, by - (vc.horns >= 2 ? 3 : 2), 2, 1);
  }
  // —— 尾（0-2px，摆动相位）——
  if (vc.tail >= 1) {
    const tx = f > 0 ? bx - 1 : bx + bw;
    ctx.fillStyle = body;
    const wag = ((t >> 3) & 1) === 1 ? -1 : 0;
    ctx.fillRect(tx, by, 1, 1);
    if (vc.tail >= 2) ctx.fillRect(tx - f, by + wag, 1, 1);
  }
  // —— 腿（两枚短腿，行走交替）——
  ctx.fillStyle = dark;
  if (isMoving) {
    if (step === 1) {
      ctx.fillRect(bx + 1, by + bh, 1, 1);
      ctx.fillRect(bx + bw - 2, by + bh, 1, 2);
    } else {
      ctx.fillRect(bx + 1, by + bh, 1, 2);
      ctx.fillRect(bx + bw - 2, by + bh, 1, 1);
    }
  } else {
    ctx.fillRect(bx + 1, by + bh, 1, 1);
    ctx.fillRect(bx + bw - 2, by + bh, 1, 1);
  }
  if (scaled) ctx.restore();
}

export function drawSheep(ctx: CanvasRenderingContext2D, u: Unit) {
  const px = u.dpx ?? (u.rx ?? u.x) * 2;
  const py = u.dpy ?? (u.ry ?? u.y) * 2;
  const f = u.flip ? -1 : 1;
  ctx.fillStyle = u.infected ? '#b8e2b4' : '#f2ead8';
  ctx.fillRect(px - 1, py, 2, 1);
  ctx.fillStyle = '#575757';
  ctx.fillRect(px + f, py, 1, 1);
}

export function drawWolf(ctx: CanvasRenderingContext2D, u: Unit) {
  const px = u.dpx ?? (u.rx ?? u.x) * 2;
  const py = u.dpy ?? (u.ry ?? u.y) * 2;
  const f = u.flip ? -1 : 1;
  ctx.fillStyle = u.hurt > 0 ? '#ff6b5e' : '#8d8d8d';
  ctx.fillRect(px - 1, py, 3, 1);
  ctx.fillStyle = '#3a342c';
  ctx.fillRect(px + f, py - 1, 1, 1);
}

export function drawSnowWolf(ctx: CanvasRenderingContext2D, u: Unit) {
  const px = u.dpx ?? (u.rx ?? u.x) * 2;
  const py = u.dpy ?? (u.ry ?? u.y) * 2;
  const f = u.flip ? -1 : 1;
  // 雪地阴影下仍可辨的白身
  ctx.fillStyle = u.hurt > 0 ? '#ff6b5e' : '#eef2f5';
  ctx.fillRect(px - 1, py, 3, 1);
  // 头 + 竖耳
  ctx.fillStyle = '#d4dde4';
  ctx.fillRect(px + f, py - 1, 1, 1);
  ctx.fillRect(px + f, py - 2, 1, 1);
  // 冰蓝鼻尖（朝向前方）
  ctx.fillStyle = '#38bdf8';
  ctx.fillRect(px + 2 * f, py - 1, 1, 1);
}

export function drawBear(ctx: CanvasRenderingContext2D, u: Unit) {
  const px = u.dpx ?? (u.rx ?? u.x) * 2;
  const py = u.dpy ?? (u.ry ?? u.y) * 2;
  ctx.fillStyle = u.hurt > 0 ? '#ff6b5e' : '#6e4a2b';
  ctx.fillRect(px - 1, py - 1, 3, 2);
  ctx.fillStyle = '#3a342c';
  ctx.fillRect(px - 1, py - 2, 1, 1);
  ctx.fillRect(px + 1, py - 2, 1, 1);
}

export function drawDragon(ctx: CanvasRenderingContext2D, u: Unit, frame: number) {
  const px = u.dpx ?? (u.rx ?? u.x) * 2;
  const py = u.dpy ?? (u.ry ?? u.y) * 2;
  const f = u.flip ? -1 : 1;
  // ground shadow
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.fillRect(px - 2, py + 2, 5, 1);
  // wings (flap)
  const up = Math.floor(frame / 6) % 2 === 0;
  ctx.fillStyle = '#1f1d24';
  ctx.fillRect(px - 2, py - (up ? 2 : 1), 2, 1);
  ctx.fillRect(px + 1, py - (up ? 2 : 1), 2, 1);
  // body
  ctx.fillStyle = u.hurt > 0 ? '#ff6b5e' : '#8c2317';
  ctx.fillRect(px - 1, py, 3, 1);
  // head
  ctx.fillStyle = '#cf3f2e';
  ctx.fillRect(px + 2 * f, py - 1, 1, 1);
  ctx.fillStyle = '#ffd93d';
  ctx.fillRect(px + 2 * f, py - 1, 1, 1);
  // tail
  ctx.fillStyle = '#8c2317';
  ctx.fillRect(px - 2 * f, py, 1, 1);
}

// ---------- buildings (houses 6x6 px, capital 8x8, tower 2x4, farm 6x4, castle 10x8 …) ----------
export function drawBuilding(ctx: CanvasRenderingContext2D, b: Building, color: [number, number, number], tier = 0) {
  // —— 超细粒度建筑（4px/格基准）：所有结构细节翻倍 ——
  const px = b.x * 4 - 4;
  const py = b.y * 4 - 8;
  switch (b.kind) {
    case 3: {
      // tower：石塔（雉堞 + 箭窗 + 旗）
      ctx.fillStyle = '#575757';
      ctx.fillRect(px + 4, py + 4, 4, 12);
      ctx.fillStyle = '#8d8d8d';
      ctx.fillRect(px + 4, py + 4, 2, 12);
      ctx.fillStyle = '#a5a5a9';
      ctx.fillRect(px + 3, py + 2, 6, 2); // 雉堞檐
      ctx.fillStyle = '#6e6e72';
      ctx.fillRect(px + 3, py + 3, 6, 1);
      ctx.fillStyle = rgb(color);
      ctx.fillRect(px + 4, py, 2, 4);
      ctx.fillStyle = '#14100c';
      ctx.fillRect(px + 6, py + 10, 2, 4);
      // 塔基
      ctx.fillStyle = '#44444a';
      ctx.fillRect(px + 3, py + 15, 6, 1);
      return;
    }
    case 4: {
      // farm：金色田垄（成行麦浪 + 篱笆 + 麦垛）
      ctx.fillStyle = '#d9b44a';
      ctx.fillRect(px, py + 2, 12, 8);
      ctx.fillStyle = '#b8912f';
      ctx.fillRect(px, py + 4, 12, 2);
      ctx.fillRect(px, py + 8, 12, 1);
      ctx.fillStyle = '#7a5a2c';
      ctx.fillRect(px - 2, py, 2, 12);
      ctx.fillRect(px + 12, py, 2, 12);
      ctx.fillRect(px - 2, py, 16, 2);
      // 成熟的麦穗点缀
      ctx.fillStyle = '#ffd93d';
      ctx.fillRect(px + 2, py + 3, 1, 1);
      ctx.fillRect(px + 5, py + 3, 1, 1);
      ctx.fillRect(px + 8, py + 6, 1, 1);
      ctx.fillRect(px + 3, py + 6, 1, 1);
      // 麦垛
      ctx.fillStyle = '#c9a84a';
      ctx.fillRect(px + 10, py + 10, 3, 2);
      ctx.fillStyle = '#a5843a';
      ctx.fillRect(px + 10, py + 12, 3, 1);
      return;
    }
    case 5: {
      // barracks：暗红顶兵营 + 双旗 + 剑形门饰
      ctx.fillStyle = '#8c2317';
      ctx.fillRect(px, py, 14, 4);
      ctx.fillStyle = '#5c150d';
      ctx.fillRect(px, py + 2, 14, 2);
      ctx.fillStyle = '#a08662';
      ctx.fillRect(px, py + 4, 14, 6);
      ctx.fillStyle = '#7a6a4c';
      ctx.fillRect(px, py + 8, 14, 2);
      ctx.fillStyle = '#14100c';
      ctx.fillRect(px + 6, py + 4, 2, 6);
      // 墙面横纹
      ctx.fillStyle = 'rgba(0,0,0,0.15)';
      ctx.fillRect(px + 1, py + 6, 4, 1);
      ctx.fillRect(px + 9, py + 6, 4, 1);
      // 双旗杆
      ctx.fillStyle = '#3a342c';
      ctx.fillRect(px - 2, py - 4, 2, 6);
      ctx.fillRect(px + 14, py - 4, 2, 6);
      ctx.fillStyle = rgb(color);
      ctx.fillRect(px - 2, py - 4, 4, 2);
      ctx.fillRect(px + 14, py - 4, 4, 2);
      return;
    }
    case 6: {
      // castle：石砌城堡（双塔 + 城垛 + 旗）
      const cx = px - 2;
      const cy = py - 4;
      // 主体城墙
      ctx.fillStyle = '#8d8d8d';
      ctx.fillRect(cx + 4, cy + 6, 12, 12);
      ctx.fillStyle = '#6e6e72';
      ctx.fillRect(cx + 4, cy + 14, 12, 2);
      ctx.fillRect(cx + 8, cy + 8, 2, 10);
      // 双塔
      ctx.fillStyle = '#a5a5a9';
      ctx.fillRect(cx, cy + 2, 4, 16);
      ctx.fillRect(cx + 16, cy + 2, 4, 16);
      ctx.fillStyle = '#575757';
      ctx.fillRect(cx, cy + 14, 4, 2);
      ctx.fillRect(cx + 16, cy + 14, 4, 2);
      // 塔顶雉堞
      ctx.fillStyle = '#a5a5a9';
      ctx.fillRect(cx, cy + 1, 1, 2);
      ctx.fillRect(cx + 2, cy + 1, 1, 2);
      ctx.fillRect(cx + 16, cy + 1, 1, 2);
      ctx.fillRect(cx + 18, cy + 1, 1, 2);
      // 城垛（锯齿）
      ctx.fillStyle = '#a5a5a9';
      ctx.fillRect(cx + 4, cy + 4, 2, 2);
      ctx.fillRect(cx + 8, cy + 4, 2, 2);
      ctx.fillRect(cx + 12, cy + 4, 2, 2);
      // 王旗
      ctx.fillStyle = '#3a342c';
      ctx.fillRect(cx + 8, cy - 4, 2, 6);
      ctx.fillStyle = rgb(color);
      ctx.fillRect(cx + 10, cy - 4, 6, 4);
      // 城门
      ctx.fillStyle = '#14100c';
      ctx.fillRect(cx + 8, cy + 12, 4, 6);
      ctx.fillStyle = '#5c3a1c';
      ctx.fillRect(cx + 9, cy + 13, 2, 5);
      return;
    }
    case 7: {
      // port：木质码头 + 系船桩 + 吊架货箱
      ctx.fillStyle = '#9c6a3c';
      ctx.fillRect(px, py + 4, 14, 4);
      ctx.fillStyle = '#7a4f2a';
      ctx.fillRect(px, py + 6, 14, 2);
      // 码头桩柱
      ctx.fillStyle = '#5c3a1c';
      ctx.fillRect(px, py + 8, 2, 4);
      ctx.fillRect(px + 12, py + 8, 2, 4);
      // 吊架 + 货箱
      ctx.fillStyle = '#3a342c';
      ctx.fillRect(px + 2, py - 2, 2, 6);
      ctx.fillRect(px + 2, py - 2, 8, 2);
      ctx.fillStyle = '#c98d5a';
      ctx.fillRect(px + 6, py, 4, 4);
      ctx.fillStyle = '#a06a3c';
      ctx.fillRect(px + 6, py + 2, 4, 2);
      // 旗帜
      ctx.fillStyle = rgb(color);
      ctx.fillRect(px + 10, py - 4, 4, 4);
      ctx.fillStyle = '#3a342c';
      ctx.fillRect(px + 10, py - 4, 2, 4);
      return;
    }
    case 8: {
      // library：蓝顶书院 + 书卷纹
      ctx.fillStyle = '#3a6ea5';
      ctx.fillRect(px, py, 12, 4);
      ctx.fillStyle = '#254d78';
      ctx.fillRect(px, py + 2, 12, 2);
      ctx.fillStyle = '#d8c9a3';
      ctx.fillRect(px, py + 4, 12, 6);
      ctx.fillStyle = '#b3a077';
      ctx.fillRect(px, py + 8, 12, 2);
      // 门
      ctx.fillStyle = '#3a342c';
      ctx.fillRect(px + 4, py + 4, 4, 6);
      // 书卷（白页竖纹）
      ctx.fillStyle = '#f2ead8';
      ctx.fillRect(px + 2, py + 6, 2, 2);
      ctx.fillRect(px + 8, py + 6, 2, 2);
      // 尖顶饰
      ctx.fillStyle = '#ffd93d';
      ctx.fillRect(px + 4, py - 2, 4, 2);
      ctx.fillRect(px + 5, py - 3, 2, 1);
      return;
    }
    case 9: {
      // market：条纹篷帐集市 + 货摊
      ctx.fillStyle = '#cf3f2e';
      ctx.fillRect(px, py + 2, 14, 4);
      ctx.fillStyle = '#f2ead8';
      ctx.fillRect(px + 2, py + 2, 2, 4);
      ctx.fillRect(px + 6, py + 2, 2, 4);
      ctx.fillRect(px + 10, py + 2, 2, 4);
      // 摊位
      ctx.fillStyle = '#9c6a3c';
      ctx.fillRect(px, py + 6, 14, 4);
      ctx.fillStyle = '#7a4f2a';
      ctx.fillRect(px, py + 8, 14, 2);
      // 摊上货物（金币/果子）
      ctx.fillStyle = '#ffd93d';
      ctx.fillRect(px + 2, py + 5, 2, 2);
      ctx.fillRect(px + 8, py + 5, 2, 2);
      ctx.fillStyle = '#6fd66f';
      ctx.fillRect(px + 4, py + 5, 2, 2);
      ctx.fillRect(px + 10, py + 5, 2, 2);
      return;
    }
    case 10: {
      // temple：白石神殿（柱廊 + 金顶）
      ctx.fillStyle = '#ffd93d';
      ctx.fillRect(px + 2, py - 4, 10, 4);
      ctx.fillStyle = '#c9a02a';
      ctx.fillRect(px + 2, py - 2, 10, 2);
      ctx.fillRect(px + 6, py - 6, 2, 2);
      // 白石檐
      ctx.fillStyle = '#f2ead8';
      ctx.fillRect(px - 2, py, 18, 2);
      // 柱廊
      ctx.fillStyle = '#e8e0cc';
      ctx.fillRect(px, py + 2, 2, 8);
      ctx.fillRect(px + 4, py + 2, 2, 8);
      ctx.fillRect(px + 8, py + 2, 2, 8);
      ctx.fillRect(px + 12, py + 2, 2, 8);
      // 殿内圣光
      ctx.fillStyle = 'rgba(255,240,190,0.85)';
      ctx.fillRect(px + 2, py + 4, 10, 6);
      // 台基
      ctx.fillStyle = '#c9bfa3';
      ctx.fillRect(px - 2, py + 10, 18, 2);
      return;
    }
  }
  // ---- house(1) / capital(2)：科技阶位外观（0 茅屋 / 1 石屋 / 2 堡垒宅 / 3 哥特庄园） ----
  const big = b.kind === 2;
  const w = big ? 16 : 12;
  const ox = px - (big ? 2 : 0);
  // 墙体材质随阶位升迁：木→右石砌→右石砌+白灰→白石青瓦
  const wallTop = tier >= 3 ? '#e8e0cc' : tier >= 1 ? '#a5a5a9' : '#c98d5a';
  const wallLow = tier >= 3 ? '#c9bfa3' : tier >= 1 ? '#6e6e72' : '#9c6a3c';
  // roof
  ctx.fillStyle = rgb(color);
  ctx.fillRect(ox, py, w, 4);
  ctx.fillStyle = rgb(mix(color, [0, 0, 0], 0.35));
  ctx.fillRect(ox, py + 2, w, 2);
  // 哥特庄园：屋脊金饰 + 抬升的尖顶呼吸感
  if (tier >= 3) {
    ctx.fillStyle = '#ffd93d';
    ctx.fillRect(ox + 2, py - 2, 2, 2);
    ctx.fillRect(ox + w - 4, py - 2, 2, 2);
    ctx.fillRect(ox + Math.floor(w / 2) - 1, py - 4, 2, 4);
  }
  // walls
  ctx.fillStyle = wallTop;
  ctx.fillRect(ox, py + 4, w, 4);
  ctx.fillStyle = wallLow;
  ctx.fillRect(ox, py + 6, w, 2);
  // 石砌村：墙面砖缝纹理
  if (tier === 1 || tier === 2) {
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(ox + 4, py + 4, 2, 2);
    ctx.fillRect(ox + w - 6, py + 6, 2, 2);
    ctx.fillRect(ox + 8, py + 4, 2, 2);
  }
  // 堡垒宅：城垛齿饰 + 山墙尖顶
  if (tier === 2) {
    ctx.fillStyle = '#a5a5a9';
    ctx.fillRect(ox, py - 2, 2, 2);
    ctx.fillRect(ox + Math.floor(w / 2) - 1, py - 2, 2, 2);
    ctx.fillRect(ox + w - 2, py - 2, 2, 2);
    ctx.fillStyle = '#575757';
    ctx.fillRect(ox + 2, py - 2, 2, 2);
    ctx.fillRect(ox + w - 4, py - 2, 2, 2);
  }
  // door
  ctx.fillStyle = '#3a2a18';
  ctx.fillRect(ox + Math.floor(w / 2) - 2, py + 4, 3, 4);
  // window light（哥特阶金光窗）
  ctx.fillStyle = tier >= 3 ? '#ffd93d' : '#ffdba0';
  ctx.fillRect(ox + 2, py + 4, 2, 2);
  ctx.fillRect(ox + w - 4, py + 4, 2, 2);
  // base shadow
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(ox, py + 8, w, 2);
  if (big) {
    // banner pole on capital
    ctx.fillStyle = '#3a342c';
    ctx.fillRect(ox + w, py - 4, 2, 6);
    ctx.fillStyle = rgb(color);
    ctx.fillRect(ox + w + 2, py - 4, 4, 2);
  }
}

/** 鹿：棕色身体 + 金色小角 + 头部朝向移动方向 */
export function drawDeer(ctx: CanvasRenderingContext2D, u: Unit) {
  const px = u.dpx ?? (u.rx ?? u.x) * 2;
  const py = u.dpy ?? (u.ry ?? u.y) * 2;
  const f = u.flip ? -1 : 1;
  // 鹿角（金色，1px 两叉）
  ctx.fillStyle = '#ffd93d';
  ctx.fillRect(px + f, py - 2, 1, 1);
  ctx.fillRect(px + 2 * f, py - 2, 1, 1);
  // 身体（浅棕）+ 头（深棕）
  ctx.fillStyle = u.hurt > 0 ? '#ff6b5e' : '#c98d5a';
  ctx.fillRect(px - 1, py, 3, 1);
  ctx.fillStyle = '#6e4a2b';
  ctx.fillRect(px + f, py - 1, 1, 1);
  // 腿
  ctx.fillRect(px - 1, py + 1, 1, 1);
  ctx.fillRect(px + 1, py + 1, 1, 1);
}

/** 企鹅：黑色轮廓 + 白肚 + 橙喙，走路左右蹒跚 */
export function drawPenguin(ctx: CanvasRenderingContext2D, u: Unit, frame: number) {
  const px = u.dpx ?? (u.rx ?? u.x) * 2;
  const py = u.dpy ?? (u.ry ?? u.y) * 2;
  // 蹒跚步态：身体每 6 帧上下 1px
  const bob = Math.floor(frame / 6) % 2 === 0 ? 0 : 1;
  const y = py - bob;
  // 黑色身体（2x2）
  ctx.fillStyle = u.hurt > 0 ? '#ff6b5e' : '#1f1d24';
  ctx.fillRect(px - 1, y - 1, 2, 2);
  // 白肚（腹部 1x2 偏下）
  ctx.fillStyle = '#f2ead8';
  ctx.fillRect(px - 1, y, 2, 1);
  // 橙喙 + 橙脚
  ctx.fillStyle = '#ff9b2d';
  ctx.fillRect(px + (u.flip ? -1 : 1), y - 1, 1, 1);
  ctx.fillRect(px - 1, y + 1, 1, 1);
  ctx.fillRect(px, y + 1, 1, 1);
}

/** 骆驼：沙色身体 + 双驼峰 + 昂起的脖颈，行走时轻微起伏 */
export function drawCamel(ctx: CanvasRenderingContext2D, u: Unit, frame: number) {
  const px = u.dpx ?? (u.rx ?? u.x) * 2;
  const py = u.dpy ?? (u.ry ?? u.y) * 2;
  const f = u.flip ? -1 : 1;
  // 行走起伏：每 8 帧身体下沉 1px
  const bob = Math.floor(frame / 8) % 2 === 0 ? 0 : 1;
  const y = py - bob;
  const body = u.hurt > 0 ? '#ff6b5e' : '#e3cf96';
  const shade = u.hurt > 0 ? '#ff6b5e' : '#c4ad74';
  // 双驼峰（暗沙色两个隆起）
  ctx.fillStyle = shade;
  ctx.fillRect(px - 1, y - 1, 1, 1);
  ctx.fillRect(px + 1, y - 1, 1, 1);
  // 身体（沙色 3x1）
  ctx.fillStyle = body;
  ctx.fillRect(px - 1, y, 3, 1);
  // 昂起的脖颈 + 头
  ctx.fillRect(px + 2 * f, y - 1, 1, 1);
  ctx.fillStyle = shade;
  ctx.fillRect(px + 2 * f, y - 2, 1, 1);
  // 长腿（站立高于 bob 时还原到地面）
  ctx.fillStyle = shade;
  ctx.fillRect(px - 1, y + 1, 1, 1);
  ctx.fillRect(px + 1, y + 1, 1, 1);
}

/** 蝎子：暗甲身体 + 翘起的红毒尾 + 双螯，横向疾走步态 */
export function drawScorpion(ctx: CanvasRenderingContext2D, u: Unit, frame: number) {
  const px = u.dpx ?? (u.rx ?? u.x) * 2;
  const py = u.dpy ?? (u.ry ?? u.y) * 2;
  const f = u.flip ? -1 : 1;
  // 疾走步态：身体每 4 帧上下 1px（比骆驼快的小碎步）
  const bob = Math.floor(frame / 4) % 2 === 0 ? 0 : 1;
  const y = py - bob;
  const dark = u.hurt > 0 ? '#ff6b5e' : '#1f1d24';
  const mid = u.hurt > 0 ? '#ff6b5e' : '#3a342c';
  // 翘起的毒尾（尾节 + 红毒刺，在身体后上方）
  ctx.fillStyle = mid;
  ctx.fillRect(px - 2 * f, y - 2, 1, 1);
  ctx.fillRect(px - 1 * f, y - 1, 1, 1);
  ctx.fillStyle = '#cf3f2e';
  ctx.fillRect(px - 3 * f, y - 3, 1, 1);
  // 头甲 + 双螯（朝向前方）
  ctx.fillStyle = dark;
  ctx.fillRect(px + 1 * f, y, 1, 1);
  ctx.fillStyle = mid;
  ctx.fillRect(px + 2 * f, y - 1, 1, 1);
  ctx.fillRect(px + 2 * f, y + 1, 1, 1);
  // 体节（暗甲 2x1）
  ctx.fillStyle = dark;
  ctx.fillRect(px - 1, y, 2, 1);
  // 细足（左右各一，随步态交替）
  ctx.fillStyle = mid;
  ctx.fillRect(px - 1, y + 1, 1, 1);
  ctx.fillRect(px, y + 1, 1, 1);
}

/** 蛇：绿色波纹身躯 S 形蜿蜒滑行 + 分叉吐信（红舌随帧伸缩） */
export function drawSnake(ctx: CanvasRenderingContext2D, u: Unit, frame: number) {
  const px = u.dpx ?? (u.rx ?? u.x) * 2;
  const py = u.dpy ?? (u.ry ?? u.y) * 2;
  const f = u.flip ? -1 : 1;
  // 蛇行相位：身体各节随帧交替升降 → S 形波动的滑行感
  const ph = Math.floor(frame / 5) % 4; // 0..3 循环
  const body = u.hurt > 0 ? '#ff6b5e' : '#4a8f3c';
  const dark = u.hurt > 0 ? '#ff6b5e' : '#2f5e26';
  // 身体 4 节（从尾到头），每节高度按正弦错开
  const wave = [0, 1, 0, -1];
  for (let seg = 0; seg < 4; seg++) {
    // 尾部在 -3*f，头部在 +0；节序 seg 0=尾
    const sx = px + (seg - 3) * f;
    const wy = (ph + seg) % 4;
    ctx.fillStyle = seg % 2 === 0 ? body : dark;
    ctx.fillRect(sx, py + wave[wy], 1, 1);
  }
  // 头部（深绿，比身体突出一格）
  ctx.fillStyle = dark;
  ctx.fillRect(px + 1 * f, py, 1, 1);
  // 吐信：每 3 帧伸出红色分叉舌（帧 0/3/6 前伸出）
  if (frame % 9 < 3) {
    ctx.fillStyle = '#cf3f2e';
    ctx.fillRect(px + 2 * f, py, 1, 1);
  }
  // 眼点（浅色，头部上方）
  ctx.fillStyle = '#f2ead8';
  ctx.fillRect(px + 1 * f, py - 1, 1, 1);
}

/** 殖民船：木壳 + 桅杆 + 王国色船帆，随浪起伏 + 船尾白色尾迹 */
export function drawBoat(ctx: CanvasRenderingContext2D, u: Unit, civColor: [number, number, number] | null, frame: number) {
  const px = u.dpx ?? (u.rx ?? u.x) * 2;
  const py = u.dpy ?? (u.ry ?? u.y) * 2;
  const f = u.flip ? -1 : 1;
  // 随浪起伏：每 9 帧船体抬升 1px
  const bob = Math.floor(frame / 9) % 2;
  const oy = py - bob;
  // 尾迹（船后两段白色像素，位置随帧摆动模拟水花）
  const wk = Math.floor(frame / 5) % 2;
  ctx.fillStyle = 'rgba(240,248,255,0.65)';
  ctx.fillRect(px - 5 * f, py + 1, 3, 1);
  ctx.fillStyle = 'rgba(240,248,255,0.40)';
  ctx.fillRect(px - (wk ? 9 : 8) * f, py + 1, 3, 1);
  // 船体（木壳：下深上浅两层，宽 5px）
  ctx.fillStyle = u.hurt > 0 ? '#ff6b5e' : '#6e4a2b';
  ctx.fillRect(px - 2, oy + 1, 5, 1);
  ctx.fillStyle = u.hurt > 0 ? '#ff6b5e' : '#9c6a3c';
  ctx.fillRect(px - 2, oy, 5, 1);
  // 船艏（朝向侧上翘 1px）
  ctx.fillStyle = '#9c6a3c';
  ctx.fillRect(px + 2 * f, oy - 1, 1, 1);
  // 桅杆（深色 1x3）
  ctx.fillStyle = '#3a342c';
  ctx.fillRect(px, oy - 3, 1, 3);
  // 船帆（王国色 2x2 + 白色高光条纹）
  ctx.fillStyle = civColor ? rgb(civColor) : '#f2ead8';
  ctx.fillRect(px + f, oy - 3, 2, 2);
  ctx.fillStyle = '#f7f9fb';
  ctx.fillRect(px + f, oy - 3, 1, 2);
  // 桅顶小旗（王国色 1px）
  ctx.fillStyle = civColor ? rgb(civColor) : '#ffd93d';
  ctx.fillRect(px, oy - 4, 1, 1);
  // 低血量警示（与人员一致的红色血条）
  if (u.hp < u.maxHp * 0.4) {
    ctx.fillStyle = '#cf3f2e';
    ctx.fillRect(px - 2, oy - 5, 5, 1);
  }
}

/** 贸易商队：驮马货车（马+货箱+麻袋+王国尖旗），轮辐随帧转动，满载奔赴伙伴市场 */
export function drawCaravan(ctx: CanvasRenderingContext2D, u: Unit, civColor: [number, number, number] | null, frame: number) {
  const px = u.dpx ?? (u.rx ?? u.x) * 2;
  const py = u.dpy ?? (u.ry ?? u.y) * 2;
  const f = u.flip ? -1 : 1;
  const bob = Math.floor(frame / 6) % 2;
  // 地面阴影（行进中的车辙暗影）
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(px - 3, py + 2, 7, 1);
  // —— 挽马（前侧）：棕马身 + 深鬃 + 跨步腿 ——
  const hx = px - 4 * f;
  ctx.fillStyle = '#7a4a26';
  ctx.fillRect(hx - 1, py - 2 + bob, 3, 2); // 马身
  ctx.fillStyle = '#5b3620';
  ctx.fillRect(hx - f, py - 3 + bob, 1, 1); // 马头
  ctx.fillRect(hx - 1, py - 3 + bob, 1, 1); // 鬃毛
  const step = Math.floor(frame / 4) % 2;
  ctx.fillStyle = '#4a2c18';
  ctx.fillRect(hx - 1 + step * f, py + bob, 1, 2); // 腿
  ctx.fillRect(hx + 1 - step * f, py + bob, 1, 2);
  // 挽绳（马与车之间 1px 深色）
  ctx.fillStyle = '#3a342c';
  ctx.fillRect(hx + 2 * f, py - 1 + bob, 2 * f, 1);
  // —— 货车：车轮（转动辐条）+ 货箱 + 麻袋货物 ——
  const cx = px + 1 * f;
  const hurt = u.hurt > 0;
  // 车轮：深色圆块 + 辐条随帧旋转（2 帧相位）
  ctx.fillStyle = '#3a2a1a';
  ctx.fillRect(cx - 2, py + 1, 2, 2);
  ctx.fillRect(cx + 1, py + 1, 2, 2);
  ctx.fillStyle = '#8a6a42';
  if (bob === 0) { ctx.fillRect(cx - 1, py + 1, 1, 1); ctx.fillRect(cx + 2, py + 2, 1, 1); }
  else { ctx.fillRect(cx - 2, py + 2, 1, 1); ctx.fillRect(cx + 1, py + 1, 1, 1); }
  // 货箱（木板色 + 受击泛红）
  ctx.fillStyle = hurt ? '#ff6b5e' : '#9c6a3c';
  ctx.fillRect(cx - 2, py - 2, 5, 3);
  ctx.fillStyle = hurt ? '#e05a50' : '#7a4f2e';
  ctx.fillRect(cx - 2, py, 5, 1); // 箱底
  ctx.fillRect(cx, py - 2, 1, 3); // 箱板缝
  // 麻袋货物（两枚：金黄 + 米白，堆在箱顶）
  ctx.fillStyle = '#d9a94e';
  ctx.fillRect(cx - 1, py - 3, 2, 1);
  ctx.fillStyle = '#e8d9b0';
  ctx.fillRect(cx + 1, py - 3, 1, 1);
  // 王国尖旗（货箱上插杆 + 三角旗）
  ctx.fillStyle = '#3a342c';
  ctx.fillRect(cx - 2 * f, py - 5, 1, 3);
  ctx.fillStyle = civColor ? rgb(civColor) : '#ffd93d';
  ctx.fillRect(cx - 1 * f + (f < 0 ? -1 : 0), py - 5, 2, 1);
  ctx.fillRect(cx - 1 * f + (f < 0 ? -1 : 0), py - 4, 1, 1);
  // 低血量警示
  if (u.hp < u.maxHp * 0.4) {
    ctx.fillStyle = '#cf3f2e';
    ctx.fillRect(px - 3, py - 6, 6, 1);
  }
}

/** 骷髅：骨白骨架（骷髏头/胸腔肋骨/摆动臂骨/跨步腿骨）+ 暗红瞳火，行走时骨头咔哒摆动 */
export function drawSkeleton(ctx: CanvasRenderingContext2D, u: Unit, frame: number) {
  const px = u.dpx ?? (u.rx ?? u.x) * 2;
  const py = u.dpy ?? (u.ry ?? u.y) * 2;
  const f = u.flip ? -1 : 1;
  const isMoving = u.lx !== undefined && (u.lx !== u.x || u.ly !== u.y);
  const step = isMoving ? ((frame >> 2) & 1) : 0;
  const bob = isMoving && step === 1 ? 1 : 0;
  const y = py - bob;
  const bone = u.hurt > 0 ? '#ff6b5e' : '#e8e4da';
  const dark = '#3a342c';
  // 地面阴影
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.fillRect(px - 1, y + 3, 3, 1);
  // 腿骨：两条分叉交替跨步
  ctx.fillStyle = bone;
  if (isMoving && step === 1) {
    ctx.fillRect(px - 1, y + 1, 1, 2);
    ctx.fillRect(px, y + 2, 1, 1);
  } else if (isMoving) {
    ctx.fillRect(px - 1, y + 2, 1, 1);
    ctx.fillRect(px, y + 1, 1, 2);
  } else {
    ctx.fillRect(px - 1, y + 1, 1, 2);
    ctx.fillRect(px, y + 1, 1, 2);
  }
  // 胸腔：交替骨色/暗色肋骨（2 行）
  ctx.fillStyle = bone;
  ctx.fillRect(px - 1, y - 1, 2, 1);
  ctx.fillStyle = dark;
  ctx.fillRect(px - 1, y, 1, 1);
  ctx.fillStyle = bone;
  ctx.fillRect(px, y, 1, 1);
  // 臂骨：摆动（攻击时前挥持械）
  ctx.fillStyle = bone;
  if ((u.atk ?? 0) > 0) {
    ctx.fillRect(px + 2 * f, y - 3, 1, 2);
    ctx.fillRect(px - 2 * f + (f > 0 ? 1 : 0), y - 1, 1, 2);
  } else if (isMoving && step === 1) {
    ctx.fillRect(px - 2, y - 1, 1, 1);
    ctx.fillRect(px + 1, y, 1, 2);
  } else if (isMoving) {
    ctx.fillRect(px - 2, y, 1, 2);
    ctx.fillRect(px + 1, y - 1, 1, 1);
  } else {
    ctx.fillRect(px - 2, y - 1, 1, 2);
    ctx.fillRect(px + 1, y - 1, 1, 2);
  }
  // 骷髏头（骨白 2x2 + 黑眼窝 + 暗红瞳火明灭）
  ctx.fillStyle = bone;
  ctx.fillRect(px - 1, y - 3, 2, 2);
  ctx.fillStyle = dark;
  ctx.fillRect(px - 1, y - 2, 2, 1);
  ctx.fillStyle = frame % 14 < 7 ? '#cf3f2e' : '#8c2317';
  ctx.fillRect(px + (f > 0 ? 0 : -1), y - 2, 1, 1);
  // 持械：骨手指剑（亡灵武士，攻击时前挥 + 白刃光）
  if (u.wep) {
    ctx.fillStyle = u.wep === 'sword3' ? '#ffd93d' : u.wep === 'sword2' ? '#e8e8e8' : bone;
    if ((u.atk ?? 0) > 0) {
      ctx.fillRect(px + 3 * f, y - 3, 1, 2);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(px + 4 * f, y - 2, 1, 1);
    } else {
      ctx.fillRect(px + 2 * f, y - 2, 1, 2);
    }
  }
  // 低血量警示
  if (u.hp < u.maxHp * 0.4) {
    ctx.fillStyle = '#cf3f2e';
    ctx.fillRect(px - 1, y - 5, 4, 1);
  }
}

/** 恶魔：肌肉魔躯 + 双角 + 背后双翼扑动 + 黄瞳 + 尾刺摇摆，身形比人高大（4x4 核心体块） */
export function drawDemon(ctx: CanvasRenderingContext2D, u: Unit, frame: number) {
  const px = u.dpx ?? (u.rx ?? u.x) * 2;
  const py = u.dpy ?? (u.ry ?? u.y) * 2;
  const f = u.flip ? -1 : 1;
  // 呼吸起伏：每 10 帧身体膨胀 1px
  const swell = Math.floor(frame / 10) % 2;
  // 翼拍：每 6 帧交替上下
  const flap = Math.floor(frame / 6) % 2;
  const body = u.hurt > 0 ? '#ff6b5e' : '#a82a1e';
  const dark = '#5c120c';
  // 地面阴影（庞大身躯）
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(px - 3, py + 2, 7, 1);
  // 背后双翼（暗色膜翼，拍动时上下扇）
  ctx.fillStyle = '#1f1d24';
  ctx.fillRect(px - 4, py - 1 - flap, 1, 3);
  ctx.fillRect(px - 3, py - 2 - flap, 1, 2);
  ctx.fillRect(px + 3, py - 1 - flap, 1, 3);
  ctx.fillRect(px + 2, py - 2 - flap, 1, 2);
  // 双角（黑角从头顶两侧斜出）
  ctx.fillStyle = '#1f1d24';
  ctx.fillRect(px - 1, py - 3 - swell, 1, 1);
  ctx.fillRect(px + 2, py - 3 - swell, 1, 1);
  // 头（暗红）+ 黄瞳（朝向前方，随帧明灭）
  ctx.fillStyle = body;
  ctx.fillRect(px, py - 2 - swell, 3, 2);
  ctx.fillStyle = frame % 8 < 4 ? '#ffd93d' : '#ffb347';
  ctx.fillRect(px + (u.flip ? 0 : 2), py - 2 - swell, 1, 1);
  // 躯干（主色 4x2 + 暗色下沿）
  ctx.fillStyle = body;
  ctx.fillRect(px - 1, py - swell, 4, 2);
  ctx.fillStyle = dark;
  ctx.fillRect(px - 1, py + 1 - swell, 4, 1);
  // 尾刺（身后翘起，随帧摇摆）
  ctx.fillStyle = dark;
  const tailUp = ((frame >> 3) & 1) === 1;
  ctx.fillRect(px - 2 * f, py - 1 - swell, 1, 1);
  ctx.fillRect(px - 3 * f, tailUp ? py - 2 - swell : py - swell, 1, 1);
  // 蹄足
  ctx.fillStyle = '#1f1d24';
  ctx.fillRect(px, py + 2 - swell, 1, 1);
  ctx.fillRect(px + 2, py + 2 - swell, 1, 1);
  // 低血量警示
  if (u.hp < u.maxHp * 0.4) {
    ctx.fillStyle = '#cf3f2e';
    ctx.fillRect(px - 2, py - 5, 6, 1);
  }
}

/** 巨魔：耸肩佝背的山岭巨怪（5 宽 8 高）——苔藓肩斑/长臂及地/獠牙/再生微光 */
export function drawTroll(ctx: CanvasRenderingContext2D, u: Unit, frame: number) {
  const px = u.dpx ?? (u.rx ?? u.x) * 2;
  const py = u.dpy ?? (u.ry ?? u.y) * 2;
  const f = u.flip ? -1 : 1;
  const isMoving = u.lx !== undefined && (u.lx !== u.x || u.ly !== u.y);
  const step = isMoving ? ((frame >> 2) & 1) : 0;
  const bob = isMoving && step === 1 ? 1 : 0;
  const breath = !isMoving && ((frame >> 4) & 1) === 1 ? 1 : 0;
  const y = py - bob - breath;
  const body = u.hurt > 0 ? '#ff6b5e' : '#4a7c3a';
  const dark = '#2c5e24';
  const moss = '#6b8f4e';
  // 地面阴影
  ctx.fillStyle = 'rgba(0,0,0,0.32)';
  ctx.fillRect(px - 3, y + 3, 7, 1);
  // 短腿跨步
  ctx.fillStyle = dark;
  if (isMoving && step === 1) {
    ctx.fillRect(px - 2, y + 2, 1, 2);
    ctx.fillRect(px + 1, y + 2, 1, 1);
  } else if (isMoving) {
    ctx.fillRect(px - 2, y + 2, 1, 1);
    ctx.fillRect(px + 1, y + 2, 1, 2);
  } else {
    ctx.fillRect(px - 2, y + 2, 1, 2);
    ctx.fillRect(px + 1, y + 2, 1, 2);
  }
  // 长臂：及地的巨臂（攻击时双臂高举过头）
  ctx.fillStyle = body;
  if ((u.atk ?? 0) > 0) {
    ctx.fillRect(px - 4, y - 5, 1, 4);
    ctx.fillRect(px + 3, y - 5, 1, 4);
    // 挥击白光
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(px + 4 * f, y - 4, 1, 1);
  } else if (isMoving && step === 1) {
    ctx.fillRect(px - 4, y - 1, 1, 4);
    ctx.fillRect(px + 3, y, 1, 3);
  } else if (isMoving) {
    ctx.fillRect(px - 4, y, 1, 3);
    ctx.fillRect(px + 3, y - 1, 1, 4);
  } else {
    ctx.fillRect(px - 4, y - 1, 1, 4);
    ctx.fillRect(px + 3, y - 1, 1, 4);
  }
  // 佝背躯干（5 宽 4 高）
  ctx.fillStyle = body;
  ctx.fillRect(px - 2, y - 3, 5, 4);
  ctx.fillStyle = dark;
  ctx.fillRect(px - 2, y, 5, 1);
  // 苔藓肩斑（再生微光闪烁）
  ctx.fillStyle = frame % 20 < 10 ? moss : '#7fa93c';
  ctx.fillRect(px - 2, y - 3, 1, 1);
  ctx.fillRect(px + 2, y - 3, 1, 1);
  ctx.fillRect(px + 1, y - 2, 1, 1);
  // 头（前伸低垂 + 独眼 + 下颌獠牙）
  ctx.fillStyle = body;
  ctx.fillRect(px + (f > 0 ? 0 : -2), y - 5, 3, 2);
  ctx.fillStyle = '#ffd93d';
  ctx.fillRect(px + (f > 0 ? 1 : -2), y - 4, 1, 1);
  ctx.fillStyle = '#f2ead8';
  ctx.fillRect(px + (f > 0 ? 0 : -1), y - 3, 1, 1);
  ctx.fillRect(px + (f > 0 ? 2 : -3), y - 3, 1, 1);
  // 低血量警示
  if (u.hp < u.maxHp * 0.4) {
    ctx.fillStyle = '#cf3f2e';
    ctx.fillRect(px - 2, y - 7, 6, 1);
  }
}

/** 食人魔：大腹便便的饕餮巨怪（5 宽 7 高）——巨棒挥击/小圆耳/鼻环/腰布 */
export function drawOgre(ctx: CanvasRenderingContext2D, u: Unit, frame: number) {
  const px = u.dpx ?? (u.rx ?? u.x) * 2;
  const py = u.dpy ?? (u.ry ?? u.y) * 2;
  const f = u.flip ? -1 : 1;
  const isMoving = u.lx !== undefined && (u.lx !== u.x || u.ly !== u.y);
  const step = isMoving ? ((frame >> 2) & 1) : 0;
  const bob = isMoving && step === 1 ? 1 : 0;
  const breath = !isMoving && ((frame >> 4) & 1) === 1 ? 1 : 0;
  const y = py - bob - breath;
  const skin = u.hurt > 0 ? '#ff6b5e' : '#c98d5a';
  const dark = '#6e4a2b';
  const belly = '#e3b98a';
  // 地面阴影
  ctx.fillStyle = 'rgba(0,0,0,0.32)';
  ctx.fillRect(px - 3, y + 3, 7, 1);
  // 粗短双腿
  ctx.fillStyle = dark;
  if (isMoving && step === 1) {
    ctx.fillRect(px - 2, y + 2, 1, 2);
    ctx.fillRect(px + 1, y + 2, 1, 1);
  } else if (isMoving) {
    ctx.fillRect(px - 2, y + 2, 1, 1);
    ctx.fillRect(px + 1, y + 2, 1, 2);
  } else {
    ctx.fillRect(px - 2, y + 2, 1, 2);
    ctx.fillRect(px + 1, y + 2, 1, 2);
  }
  // 巨腹躯体（5 宽 4 高：大腹 + 腰布）
  ctx.fillStyle = skin;
  ctx.fillRect(px - 2, y - 3, 5, 4);
  ctx.fillStyle = belly;
  ctx.fillRect(px - 1, y - 1, 3, 2);
  ctx.fillStyle = '#3a342c';
  ctx.fillRect(px - 2, y + 1, 5, 1);
  // 巨臂 + 骨棒（攻击时抡过头顶）
  ctx.fillStyle = skin;
  ctx.fillRect(px - 3, y - 2, 1, 3);
  ctx.fillRect(px + 2, y - 2, 1, 3);
  ctx.fillStyle = '#8a6a4a';
  if ((u.atk ?? 0) > 0) {
    ctx.fillRect(px + 3 * f, y - 6, 1, 4);
    ctx.fillRect(px + 2 * f, y - 6, 1, 1);
    ctx.fillStyle = '#f2ead8';
    ctx.fillRect(px + 3 * f, y - 6, 1, 1);
  } else {
    ctx.fillRect(px + 3 * f, y - 3, 1, 4);
  }
  // 小圆头 + 双耳 + 鼻环 + 獠牙
  ctx.fillStyle = skin;
  ctx.fillRect(px - 1, y - 5, 3, 2);
  ctx.fillStyle = dark;
  ctx.fillRect(px - 1, y - 4, 1, 1);
  ctx.fillRect(px + 1, y - 4, 1, 1);
  ctx.fillStyle = '#ffd93d';
  ctx.fillRect(px, y - 3, 1, 1);
  ctx.fillStyle = '#f2ead8';
  ctx.fillRect(px - 2, y - 4, 1, 1);
  ctx.fillRect(px + 2, y - 4, 1, 1);
  // 低血量警示
  if (u.hp < u.maxHp * 0.4) {
    ctx.fillStyle = '#cf3f2e';
    ctx.fillRect(px - 2, y - 7, 6, 1);
  }
}

/** 白行者：寒冰之主（3 宽 7 高）——冰晶王冠/蓝焰瞳/霜纹长袍/周身飘雪 */
export function drawWhiteWalker(ctx: CanvasRenderingContext2D, u: Unit, frame: number) {
  const px = u.dpx ?? (u.rx ?? u.x) * 2;
  const py = u.dpy ?? (u.ry ?? u.y) * 2;
  const f = u.flip ? -1 : 1;
  const isMoving = u.lx !== undefined && (u.lx !== u.x || u.ly !== u.y);
  const step = isMoving ? ((frame >> 2) & 1) : 0;
  const bob = isMoving && step === 1 ? 1 : 0;
  const y = py - bob;
  const ice = u.hurt > 0 ? '#ff6b5e' : '#bfe3f2';
  const robe = '#2b6fae';
  const dark = '#1d4e89';
  // 地面阴影
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(px - 2, y + 3, 5, 1);
  // 长袍下摆跨步（袍脚交替）
  ctx.fillStyle = robe;
  if (isMoving && step === 1) {
    ctx.fillRect(px - 1, y + 1, 1, 2);
    ctx.fillRect(px, y + 1, 1, 1);
  } else if (isMoving) {
    ctx.fillRect(px - 1, y + 1, 1, 1);
    ctx.fillRect(px, y + 1, 1, 2);
  } else {
    ctx.fillRect(px - 1, y + 1, 1, 2);
    ctx.fillRect(px, y + 1, 1, 2);
  }
  // 长袍躯干（3 宽 3 高 + 暗色滚边）
  ctx.fillStyle = robe;
  ctx.fillRect(px - 1, y - 2, 3, 3);
  ctx.fillStyle = dark;
  ctx.fillRect(px - 1, y, 1, 1);
  ctx.fillRect(px + 1, y, 1, 1);
  // 双臂（攻击时前挥招霜）
  ctx.fillStyle = robe;
  if ((u.atk ?? 0) > 0) {
    ctx.fillRect(px + 2 * f, y - 3, 2, 1);
    ctx.fillStyle = '#f7f9fb';
    ctx.fillRect(px + 3 * f, y - 4, 1, 1);
    ctx.fillRect(px + 4 * f, y - 3, 1, 1);
  } else if (isMoving && step === 1) {
    ctx.fillRect(px - 2, y - 2, 1, 1);
    ctx.fillRect(px + 2, y - 1, 1, 2);
  } else if (isMoving) {
    ctx.fillRect(px - 2, y - 1, 1, 2);
    ctx.fillRect(px + 2, y - 2, 1, 1);
  } else {
    ctx.fillRect(px - 2, y - 2, 1, 2);
    ctx.fillRect(px + 2, y - 2, 1, 2);
  }
  // 面色苍蓝 + 蓝焰双瞳（随帧明灭）
  ctx.fillStyle = ice;
  ctx.fillRect(px - 1, y - 4, 3, 2);
  ctx.fillStyle = frame % 10 < 5 ? '#4d9fd6' : '#9ad4e8';
  ctx.fillRect(px + (f > 0 ? 0 : -2), y - 3, 1, 1);
  ctx.fillRect(px + (f > 0 ? 1 : -1), y - 3, 1, 1);
  // 冰晶王冠（三尖刺）
  ctx.fillStyle = '#f7f9fb';
  ctx.fillRect(px - 1, y - 6, 1, 2);
  ctx.fillRect(px, y - 7, 1, 3);
  ctx.fillRect(px + 1, y - 6, 1, 2);
  // 周身飘雪（哈希门控 3 点随帧下落）
  ctx.fillStyle = 'rgba(247,249,251,0.7)';
  for (let k = 0; k < 3; k++) {
    const h = ((u.id * 97 + k * 131 + frame * 7) >>> 0) % 16;
    ctx.fillRect(px - 3 + (h % 7), y - 7 + ((h >> 2) % 9), 1, 1);
  }
  // 低血量警示
  if (u.hp < u.maxHp * 0.4) {
    ctx.fillStyle = '#cf3f2e';
    ctx.fillRect(px - 2, y - 8, 6, 1);
  }
}

/** 吸血鬼：永夜贵族（5 宽 7 高）——燕尾发际/猩红瞳/高领斗篷（绯红内衬）/离地悬浮 + 斗篷飘动 */
export function drawVampire(ctx: CanvasRenderingContext2D, u: Unit, frame: number) {
  const px = u.dpx ?? (u.rx ?? u.x) * 2;
  const py = u.dpy ?? (u.ry ?? u.y) * 2;
  const f = u.flip ? -1 : 1;
  // 悬浮：无跨步，缓慢上下漂 1px + 斗篷随行飘动
  const hover = ((frame >> 3) & 1) === 1 ? 1 : 0;
  const y = py - 1 - hover;
  const cape = u.hurt > 0 ? '#ff6b5e' : '#37333b';
  const face = '#e8e0d8';
  const inner = '#8c2317';
  // 地面阴影（悬浮者阴影更小更淡）
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.fillRect(px - 1, py + 3, 3, 1);
  // 斗篷主体（身后 5 宽，尾部随帧分叉飘动）
  ctx.fillStyle = cape;
  ctx.fillRect(px - 2, y - 1, 5, 3);
  const flutter = ((frame >> 2) & 1) === 1;
  ctx.fillRect(px - 3, flutter ? y : y + 1, 1, 2);
  ctx.fillRect(px + 2, flutter ? y + 1 : y, 1, 2);
  // 绯红内衬（领口露出 1px）
  ctx.fillStyle = inner;
  ctx.fillRect(px - 1, y - 1, 1, 1);
  // 高领 + 苍白面容 + 猩红瞳（随帧明灭）
  ctx.fillStyle = cape;
  ctx.fillRect(px - 2, y - 4, 1, 2);
  ctx.fillRect(px + 2, y - 4, 1, 2);
  ctx.fillStyle = face;
  ctx.fillRect(px - 1, y - 4, 3, 2);
  ctx.fillStyle = frame % 12 < 6 ? '#cf3f2e' : '#8c2317';
  ctx.fillRect(px + (f > 0 ? 0 : -2), y - 4, 1, 1);
  // 攻击：露尖牙 + 猩红残影挥击
  if ((u.atk ?? 0) > 0) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(px + (f > 0 ? 0 : -1), y - 3, 1, 1);
    ctx.fillRect(px + (f > 0 ? 1 : -2), y - 3, 1, 1);
    ctx.fillStyle = 'rgba(207,63,46,0.6)';
    ctx.fillRect(px + 3 * f, y - 3, 1, 2);
  }
  // 燕尾发际（黑发 V 型）
  ctx.fillStyle = '#14100c';
  ctx.fillRect(px - 1, y - 5, 3, 1);
  ctx.fillRect(px, y - 4, 1, 1);
  // 低血量警示
  if (u.hp < u.maxHp * 0.4) {
    ctx.fillStyle = '#cf3f2e';
    ctx.fillRect(px - 2, y - 7, 6, 1);
  }
}

/** 克拉肯：深海巨怪 —— 半浮水面的钟形巨胴 + 六条相位错开的蠕动触手 + 巨眼凝视 + 涟漪环 */
export function drawKraken(ctx: CanvasRenderingContext2D, u: Unit, frame: number) {
  const px = u.dpx ?? (u.rx ?? u.x) * 2;
  const py = u.dpy ?? (u.ry ?? u.y) * 2;
  const f = u.flip ? -1 : 1;
  const isMoving = u.lx !== undefined && (u.lx !== u.x || u.ly !== u.y);
  const bob = isMoving ? ((frame >> 2) & 1) : 0;
  const breath = !isMoving && ((frame >> 4) & 1) === 1 ? 1 : 0;
  const y = py - bob - breath;
  const body = u.hurt > 0 ? '#ff6b5e' : '#7a2f9e';
  const dark = '#4a1a63';
  const light = '#a86cc9';
  // 水面涟漪环（呼吸式扩散）
  ctx.fillStyle = 'rgba(220,240,255,0.4)';
  const ripple = ((frame >> 3) % 3);
  if (ripple === 0) ctx.fillRect(px - 3, y + 3, 7, 1);
  else if (ripple === 1) { ctx.fillRect(px - 4, y + 3, 3, 1); ctx.fillRect(px + 2, y + 3, 3, 1); }
  else { ctx.fillRect(px - 5, y + 3, 2, 1); ctx.fillRect(px + 4, y + 3, 2, 1); }
  // 六条触手：相位错开蠕动（每条 2 段，随帧交替摆动；攻击时前侧触手猛然前甩）
  const atk = (u.atk ?? 0) > 0;
  for (let k = 0; k < 6; k++) {
    const phase = ((frame >> 2) + k) & 3;
    const bx = px - 5 + k * 2;
    ctx.fillStyle = k % 2 === 0 ? body : dark;
    if (atk && (k === 1 || k === 4)) {
      // 前甩猛击（长触手抽向面朝方向 + 白色水花）
      ctx.fillRect(bx + (f > 0 ? 1 : -1), y + 2, 1, 2);
      ctx.fillRect(bx + (f > 0 ? 3 : -3), y, 1, 2);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(bx + (f > 0 ? 4 : -4), y - 1, 1, 1);
    } else {
      // 平时蠕动：首段固定 + 尾段随相位抬落
      ctx.fillRect(bx, y + 2, 1, 2);
      const lift = phase === 0 ? 0 : phase === 1 ? 1 : phase === 2 ? 2 : 1;
      ctx.fillRect(bx, y + 3 - lift, 1, 1);
    }
  }
  // 钟形巨胴（头囊 6 宽 3 高 + 暗斑）
  ctx.fillStyle = body;
  ctx.fillRect(px - 3, y - 3, 6, 5);
  ctx.fillStyle = light;
  ctx.fillRect(px - 3, y - 3, 6, 1);
  ctx.fillStyle = dark;
  ctx.fillRect(px - 2, y + 1, 2, 1);
  ctx.fillRect(px + 1, y, 1, 1);
  // 巨眼（白底 + 朝向瞳孔 + 周期性眨眼）
  const blink = frame % 47 < 2;
  ctx.fillStyle = '#f2ead8';
  ctx.fillRect(px - 2, y - 2, 3, 2);
  if (!blink) {
    ctx.fillStyle = '#14100c';
    ctx.fillRect(px - 1 + (f > 0 ? 1 : 0), y - 2, 1, 1);
    ctx.fillStyle = '#ffd93d';
    ctx.fillRect(px - 1 + (f > 0 ? 1 : 0), y - 2, 1, 1);
  }
  // 低血量警示
  if (u.hp < u.maxHp * 0.4) {
    ctx.fillStyle = '#cf3f2e';
    ctx.fillRect(px - 3, y - 5, 7, 1);
  }
}

const light_c = '#dcc28a'; // 沙虫高光

/** 沙虫：沙海巨虫 —— 波动的分节巨躯 + 环形巨口（攻击时张开露齿）+ 沙尘尾迹 */
export function drawSandworm(ctx: CanvasRenderingContext2D, u: Unit, frame: number) {
  const px = u.dpx ?? (u.rx ?? u.x) * 2;
  const py = u.dpy ?? (u.ry ?? u.y) * 2;
  const f = u.flip ? -1 : 1;
  const isMoving = u.lx !== undefined && (u.lx !== u.x || u.ly !== u.y);
  const seg = (frame >> 2) & 3; // 分节波动相位
  const hide = ((frame >> 3) & 1) === 1 ? 1 : 0; // 半埋呼吸：整体沉降 1px
  const y = py - 2 - hide;
  const body = u.hurt > 0 ? '#ff6b5e' : '#c4ad74';
  const dark = '#8c7345';
  const ridge = '#a88a55';
  // 地面尘环（扬沙）
  ctx.fillStyle = 'rgba(196,173,116,0.45)';
  ctx.fillRect(px - 5, y + 4, 11, 1);
  // 尾迹沙尘（移动时向后方喷洒）
  if (isMoving && (frame & 7) < 4) {
    ctx.fillStyle = 'rgba(222,203,141,0.55)';
    ctx.fillRect(px - 6 * f, y + 3, 2, 1);
    ctx.fillRect(px - 8 * f, y + 2, 1, 1);
  }
  // 分节巨躯：5 节，交替上下错位波动（蠕行的波浪感）
  for (let k = 0; k < 5; k++) {
    const wave = ((seg + k) & 3) < 2 ? 0 : 1;
    const bx = px - f * (k + 1) * 2 - (f > 0 ? -1 : 1);
    ctx.fillStyle = k === 4 ? dark : body;
    const h = 4 - (k > 2 ? 1 : 0);
    ctx.fillRect(bx, y + 1 + wave, 2, h);
    // 背脊环节纹
    if (k < 4) {
      ctx.fillStyle = ridge;
      ctx.fillRect(bx, y + 1 + wave, 1, 1);
    }
  }
  // 头部：环形巨口（平时闭合竖缝；攻击时张开 3x3 黑洞 + 环状尖牙）
  const atk = (u.atk ?? 0) > 0;
  ctx.fillStyle = body;
  ctx.fillRect(px - 1 + f, y, 3, 5);
  ctx.fillStyle = light_c;
  ctx.fillRect(px - 1 + f, y, 3, 1);
  if (atk) {
    // 张开的深渊巨口
    ctx.fillStyle = '#14100c';
    ctx.fillRect(px + (f > 0 ? 1 : -1), y + 1, 2, 3);
    ctx.fillStyle = '#f2ead8';
    ctx.fillRect(px + (f > 0 ? 1 : -1), y + 1, 1, 1);
    ctx.fillRect(px + (f > 0 ? 2 : -1), y + 2, 1, 1);
    ctx.fillRect(px + (f > 0 ? 1 : -1), y + 3, 1, 1);
  } else {
    // 闭合口缝 + 头部感觉毛
    ctx.fillStyle = dark;
    ctx.fillRect(px + (f > 0 ? 1 : 0), y + 2, 2, 1);
    ctx.fillStyle = ridge;
    ctx.fillRect(px + (f > 0 ? 2 : -1), y - 1, 1, 1);
  }
  // 低血量警示
  if (u.hp < u.maxHp * 0.4) {
    ctx.fillStyle = '#cf3f2e';
    ctx.fillRect(px - 3, y - 2, 7, 1);
  }
}

/** 蛇怪：秘境蛇王 —— S 型波动的长躯 + 猩红冠翼 + 竖瞳凝视（石化）+ 分叉信子 */
export function drawBasilisk(ctx: CanvasRenderingContext2D, u: Unit, frame: number) {
  const px = u.dpx ?? (u.rx ?? u.x) * 2;
  const py = u.dpy ?? (u.ry ?? u.y) * 2;
  const f = u.flip ? -1 : 1;
  const isMoving = u.lx !== undefined && (u.lx !== u.x || u.ly !== u.y);
  const und = (frame >> 2) & 3; // 蛇躯波动相位
  const atk = (u.atk ?? 0) > 0;
  const rise = atk ? 2 : isMoving ? ((frame >> 3) & 1) : 0;
  const y = py - 1 - rise;
  const body = u.hurt > 0 ? '#ff6b5e' : '#5a7a2c';
  const dark = '#3a5218';
  const belly = '#9ad06a';
  // 地面阴影
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.fillRect(px - 4, py + 3, 8, 1);
  // S 型长躯：4 节，交替上下波动（蛇行波传导）
  for (let k = 0; k < 4; k++) {
    const wave = ((und + k) & 1) === 0 ? 0 : 1;
    const bx = px - f * (k + 1) * 2 - (f > 0 ? -1 : 1);
    ctx.fillStyle = k % 2 === 0 ? body : dark;
    ctx.fillRect(bx, y + 2 + wave, 2, 2);
    if (k === 1) { ctx.fillStyle = belly; ctx.fillRect(bx, y + 3 + wave, 2, 1); }
  }
  // 尾尖（分叉）
  ctx.fillStyle = dark;
  const tw = ((und >> 1) & 1) === 0 ? 0 : 1;
  ctx.fillRect(px - f * 9, y + 2 + tw, 1, 1);
  ctx.fillRect(px - f * 10, y + 3 - tw, 1, 1);
  // 前躯挺立 + 头颈（攻击时上身猛烈前倾）
  ctx.fillStyle = body;
  ctx.fillRect(px + (atk ? f : 0), y + 1, 2, 3);
  ctx.fillStyle = dark;
  ctx.fillRect(px + (atk ? f : 0), y + 2, 1, 2);
  // 头（3 宽 + 竖瞳金眼凝视 + 猩红冠翼）
  const hx = px + (atk ? f * 2 : f);
  ctx.fillStyle = body;
  ctx.fillRect(hx, y - 2, 3, 2);
  ctx.fillStyle = belly;
  ctx.fillRect(hx + (f > 0 ? 1 : 0), y - 1, 2, 1);
  // 竖瞳（金色 — 石化凝视的凝视点，随帧微微收缩放大）
  ctx.fillStyle = frame % 24 < 12 ? '#ffd93d' : '#ffb020';
  ctx.fillRect(hx + (f > 0 ? 1 : 0), y - 2, 1, 1);
  ctx.fillStyle = '#14100c';
  ctx.fillRect(hx + (f > 0 ? 1 : 0), y - 2, 1, 1);
  // 猩红冠翼（头后三根尖刺，攻击时竖起泛光）
  ctx.fillStyle = atk ? '#ff6b5e' : '#cf3f2e';
  ctx.fillRect(hx - f, y - 3, 1, 1);
  ctx.fillRect(hx - f * 2, y - 4, 1, 1);
  ctx.fillRect(hx - f * 3, y - 3, 1, 1);
  // 分叉信子（平时吐信 — 攻击时前探）
  if (frame % 18 < 6 || atk) {
    ctx.fillStyle = '#d556c0';
    ctx.fillRect(hx + (f > 0 ? 3 : -2), y - 1, 1, 1);
    if (atk) {
      ctx.fillRect(hx + (f > 0 ? 4 : -3), y - 1, 1, 1);
      ctx.fillRect(hx + (f > 0 ? 4 : -3), y - 2, 1, 1);
    }
  }
  // 低血量警示
  if (u.hp < u.maxHp * 0.4) {
    ctx.fillStyle = '#cf3f2e';
    ctx.fillRect(hx - 1, y - 5, 5, 1);
  }
}

/** 法师：紫袍 + 尖帽 + 金杖尖，袍摆行走飘动，施法后短暂亮袍 */
export function drawMage(ctx: CanvasRenderingContext2D, u: Unit, frame: number) {
  const px = u.dpx ?? (u.rx ?? u.x) * 2;
  const py = u.dpy ?? (u.ry ?? u.y) * 2;
  const f = u.flip ? -1 : 1;
  const isMoving = u.lx !== undefined && (u.lx !== u.x || u.ly !== u.y);
  const step = isMoving ? ((frame >> 2) & 1) : 0;
  const bob = isMoving && step === 1 ? 1 : 0;
  const breath = !isMoving && ((frame >> 4) & 1) === 1 ? 1 : 0;
  const y = py - bob - breath;
  const robe = u.hurt > 0 ? '#ff6b5e' : u.cd > 18 ? '#c98af5' : '#8a4fd0';
  const dark = '#4c2a78';
  // 地面阴影
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.fillRect(px - 1, y + 3, 4, 1);
  // 尖帽（紫色两阶，顶点 1px + 帽尖随行走偏摆）
  ctx.fillStyle = robe;
  ctx.fillRect(px + (isMoving && step === 1 ? f : 0), y - 4, 1, 1);
  ctx.fillRect(px, y - 3, 2, 1);
  ctx.fillRect(px - 1, y - 2, 4, 1);
  // 面部（苍白）+ 紫瞳
  ctx.fillStyle = '#e8d5c0';
  ctx.fillRect(px, y - 1, 2, 1);
  ctx.fillStyle = '#9b59d0';
  ctx.fillRect(px + (f > 0 ? 1 : 0), y - 1, 1, 1);
  // 袍身（紫袍 4x2，下摆暗紫 + 行走袍摆交替）
  ctx.fillStyle = robe;
  ctx.fillRect(px - 1, y, 4, 2);
  ctx.fillStyle = dark;
  if (isMoving && step === 1) {
    ctx.fillRect(px - 1, y + 2, 2, 1);
    ctx.fillRect(px + 1, y + 2, 2, 1);
  } else {
    ctx.fillRect(px - 1, y + 2, 3, 1);
    ctx.fillRect(px, y + 2, 2, 1);
  }
  // 持杖袖臂（施法时前挥）
  ctx.fillStyle = robe;
  if ((u.atk ?? 0) > 0) {
    ctx.fillRect(px + 2 * f, y - 2, 2, 1);
  } else {
    ctx.fillRect(px + 2, y - 1, 1, 2);
  }
  // 金杖（前方竖杖 + 杖尖金光随帧闪烁）
  ctx.fillStyle = '#c98d5a';
  ctx.fillRect(px + 2 * f, y - 1, 1, 3);
  ctx.fillStyle = frame % 6 < 3 ? '#ffd93d' : '#ffb347';
  ctx.fillRect(px + 2 * f, y - 2, 1, 1);
  // 低血量警示
  if (u.hp < u.maxHp * 0.4) {
    ctx.fillStyle = '#cf3f2e';
    ctx.fillRect(px - 1, y - 5, 5, 1);
  }
}

// ---------- 地面物品（宝物：按槽位形制 + 稀有度配色） ----------
import { ITEM_DEFS, RARITY_META } from './items';

/** 地面物品：悬浮呼吸 + 稀有度辉光 + 史诗/传说星点（102 件通用渲染） */
export function drawItem(ctx: CanvasRenderingContext2D, item: GroundItem, frame: number) {
  const def = ITEM_DEFS[item.kind as string];
  const px = Math.round(item.x * 2);
  const py = Math.round(item.y * 2);
  const bob = Math.floor(frame / 12) % 2;
  const y = py - bob;
  if (!def) return;
  const main = RARITY_META[def.rarity].color;
  const accent = def.rarity >= 3 ? '#ffd93d' : def.rarity === 2 ? '#e8f0ff' : '#8a9098';
  switch (def.slot) {
    case 'wep': {
      if (def.art === 'bow') {
        // 弓：弧形 + 弦
        ctx.fillStyle = main;
        ctx.fillRect(px - 1, y - 2, 1, 4);
        ctx.fillRect(px, y - 3, 1, 1);
        ctx.fillRect(px, y + 2, 1, 1);
        ctx.fillStyle = accent;
        ctx.fillRect(px + 1, y - 2, 1, 4);
      } else if (def.art === 'staff') {
        // 杖：竖杆 + 顶珠
        ctx.fillStyle = '#6e4a2b';
        ctx.fillRect(px, y - 3, 1, 5);
        ctx.fillStyle = main;
        ctx.fillRect(px, y - 4, 1, 1);
        ctx.fillRect(px - 1, y - 3, 1, 1);
        ctx.fillRect(px + 1, y - 3, 1, 1);
      } else {
        // 剑/斧：斜插姿态
        ctx.fillStyle = main;
        ctx.fillRect(px, y - 3, 1, 3);
        ctx.fillRect(px + 1, y - 2, 1, 1);
        ctx.fillStyle = accent;
        ctx.fillRect(px - 1, y, 3, 1);
        ctx.fillStyle = '#6e4a2b';
        ctx.fillRect(px, y + 1, 1, 1);
      }
      break;
    }
    case 'arm': {
      // 甲：胸甲轮廓
      ctx.fillStyle = main;
      ctx.fillRect(px - 1, y - 2, 3, 2);
      ctx.fillRect(px, y, 2, 1);
      ctx.fillStyle = accent;
      ctx.fillRect(px - 1, y, 1, 1);
      break;
    }
    case 'hlm': {
      // 盔：圆顶 + 缨
      ctx.fillStyle = main;
      ctx.fillRect(px - 1, y - 2, 3, 2);
      ctx.fillStyle = accent;
      ctx.fillRect(px, y - 3, 1, 1);
      break;
    }
    case 'shd': {
      // 盾：方盾 + 纹章
      ctx.fillStyle = main;
      ctx.fillRect(px - 1, y - 2, 3, 3);
      ctx.fillStyle = accent;
      ctx.fillRect(px, y - 1, 1, 1);
      break;
    }
    case 'bts': {
      // 靴：两只并排
      ctx.fillStyle = main;
      ctx.fillRect(px - 1, y - 1, 1, 2);
      ctx.fillRect(px + 1, y - 1, 1, 2);
      ctx.fillStyle = accent;
      ctx.fillRect(px - 1, y + 1, 2, 1);
      break;
    }
    case 'rng': {
      // 戒：环 + 宝石
      ctx.fillStyle = main;
      ctx.fillRect(px, y - 1, 1, 1);
      ctx.fillRect(px - 1, y, 1, 1);
      ctx.fillRect(px + 1, y, 1, 1);
      ctx.fillRect(px, y + 1, 1, 1);
      ctx.fillStyle = accent;
      ctx.fillRect(px, y - 2, 1, 1);
      break;
    }
    case 'amu': {
      // 符：吊坠菱形
      ctx.fillStyle = main;
      ctx.fillRect(px, y - 2, 1, 1);
      ctx.fillRect(px - 1, y - 1, 3, 1);
      ctx.fillRect(px, y, 1, 1);
      ctx.fillStyle = accent;
      ctx.fillRect(px, y - 1, 1, 1);
      break;
    }
  }
  // 宝物微光：稀有度越高闪灼越频繁
  const sparkleEvery = def.rarity >= 3 ? 10 : def.rarity === 2 ? 18 : 28;
  if ((frame + item.id * 3) % sparkleEvery < 4) {
    ctx.fillStyle = def.rarity >= 3 ? 'rgba(255,220,120,0.95)' : 'rgba(255,240,200,0.85)';
    ctx.fillRect(px + 2, y - 4, 1, 1);
    if (def.rarity >= 4) ctx.fillRect(px - 2, y - 2, 1, 1);
  }
  // 掉落阴影
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.fillRect(px - 1, py + 2, 3, 1);
}

// ---------- terrain props (on props canvas, 2px per tile) ----------
export function drawTree(ctx: CanvasRenderingContext2D, x: number, y: number, variant: number, season = 1) {
  // —— 超细粒度树（4px/格基准）：三层树冠 + 受光高光 + 双像素树干 + 根影 ——
  const px = x * 4;
  const py = y * 4;
  const dark = variant % 3 === 0;
  // 根部阴影（所有季节共有 —— 树"站"在地上）
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.fillRect(px, py + 3, 4, 1);
  if (season === 3) {
    // 冬：落叶林光秃 —— 深褐枝干分叉 + 枝头积雪
    ctx.fillStyle = '#4a3826';
    ctx.fillRect(px + 1, py - 1, 2, 5); // 主干
    ctx.fillRect(px, py - 2, 1, 2); // 左枝
    ctx.fillRect(px + 3, py - 1, 1, 2); // 右枝
    ctx.fillRect(px + 1, py - 3, 1, 1); // 顶梢
    if (variant % 3 === 0) {
      ctx.fillStyle = 'rgba(238,244,248,0.95)';
      ctx.fillRect(px + 1, py - 3, 2, 1); // 枝头积雪
      ctx.fillRect(px, py - 2, 1, 1);
    }
    return;
  }
  if (season === 2) {
    // 秋：红/金两个种群 + 满地落叶
    const gold = (variant & 1) === 0;
    const c1 = gold ? (dark ? '#b8862f' : '#c9a13b') : (dark ? '#a04426' : '#c96a2d');
    const c2 = gold ? (dark ? '#a5761f' : '#b8904a') : (dark ? '#8c3818' : '#b5502a');
    const hi = gold ? '#e0b84f' : '#e08a4a';
    ctx.fillStyle = c1;
    ctx.fillRect(px - 1, py - 1, 6, 4); // 冠底层
    ctx.fillStyle = c2;
    ctx.fillRect(px, py - 2, 4, 2); // 冠顶
    ctx.fillRect(px + 3, py + 1, 2, 2); // 冠右暗面
    ctx.fillStyle = hi;
    ctx.fillRect(px, py - 2, 2, 1); // 高光
    // 树下落叶环
    ctx.fillStyle = gold ? 'rgba(201,161,59,0.85)' : 'rgba(201,106,45,0.85)';
    if (variant % 7 !== 1) {
      ctx.fillRect(px - 1 + (variant & 2 ? 2 : 0), py + 3, 1, 1);
      ctx.fillRect(px + 4 - (variant & 1 ? 1 : 0), py + 4, 1, 1);
    }
    ctx.fillStyle = '#5d3f22';
    ctx.fillRect(px + 1, py + 2, 2, 2);
    return;
  }
  if (season === 0) {
    // 春：嫩绿返青 + 粉白花树（樱）
    if (variant % 9 === 0) {
      ctx.fillStyle = '#e8a8c8';
      ctx.fillRect(px - 1, py - 1, 6, 4);
      ctx.fillStyle = '#f4c8dc';
      ctx.fillRect(px, py - 2, 4, 2);
      ctx.fillStyle = '#fce4f0';
      ctx.fillRect(px + 1, py - 2, 2, 1);
      ctx.fillStyle = '#fff0f6';
      ctx.fillRect(px - 1, py + 1, 1, 1);
      ctx.fillRect(px + 5, py, 1, 1); // 飘落花瓣
    } else {
      ctx.fillStyle = dark ? '#4a8f34' : '#63a844';
      ctx.fillRect(px - 1, py - 1, 6, 4);
      ctx.fillStyle = dark ? '#57a03e' : '#7cc254';
      ctx.fillRect(px, py - 2, 4, 2);
      ctx.fillStyle = '#8fd66a';
      ctx.fillRect(px, py - 2, 2, 1);
    }
    ctx.fillStyle = '#6e4a2b';
    ctx.fillRect(px + 1, py + 2, 2, 2);
    return;
  }
  // 夏（默认）：盛绿
  ctx.fillStyle = dark ? '#2c5e24' : '#3f7a2e';
  ctx.fillRect(px - 1, py - 1, 6, 4);
  ctx.fillStyle = dark ? '#376e2b' : '#4c8c38';
  ctx.fillRect(px, py - 2, 4, 2);
  ctx.fillStyle = variant % 5 === 0 ? '#6fc04a' : '#55a03c';
  ctx.fillRect(px, py - 2, 2, 1);
  ctx.fillStyle = '#24501c';
  ctx.fillRect(px + 3, py + 1, 2, 2); // 右下暗面
  ctx.fillStyle = '#6e4a2b';
  ctx.fillRect(px + 1, py + 2, 2, 2);
}


export function drawMountainProp(ctx: CanvasRenderingContext2D, x: number, y: number, variant: number) {
  // —— 超细粒度山峰（4px/格基准）：梯形峰体 + 东南受光 + 西北背光 + 雪线 ——
  const px = x * 4;
  const py = y * 4;
  // 底部岩壁
  ctx.fillStyle = '#575757';
  ctx.fillRect(px - 1, py + 1, 6, 3);
  // 峰体主体
  ctx.fillStyle = '#7d7d82';
  ctx.fillRect(px, py - 1, 4, 4);
  // 峰顶（窄台）
  ctx.fillStyle = '#8d8d8d';
  ctx.fillRect(px + 1, py - 2, 2, 2);
  // 东南受光面
  ctx.fillStyle = '#a5a5a9';
  ctx.fillRect(px + 2, py, 2, 4);
  ctx.fillRect(px + 3, py - 1, 1, 1);
  // 西北背光裂隙
  ctx.fillStyle = '#44444a';
  ctx.fillRect(px, py + 1, 1, 3);
  ctx.fillRect(px + 1, py + 2, 1, 2);
  // 岩纹（variant 确定性）
  if (variant % 5 === 0) {
    ctx.fillStyle = 'rgba(30,30,34,0.6)';
    ctx.fillRect(px + 2, py + 3, 1, 1);
    ctx.fillRect(px - 1, py + 2, 1, 1);
  }
  // 雪线
  if (variant > 150) {
    ctx.fillStyle = '#f7f9fb';
    ctx.fillRect(px + 1, py - 2, 2, 1);
    ctx.fillRect(px, py - 1, 1, 1);
    ctx.fillStyle = '#dce8f0';
    ctx.fillRect(px + 1, py - 1, 2, 1);
  }
}


// ---------- fire (flickering) ----------
const FIRE_COLORS = ['#ff9b2d', '#ffd93d', '#cf3f2e', '#ffce6a'];
export function drawFire(ctx: CanvasRenderingContext2D, x: number, y: number, i: number, frame: number) {
  const px = x * 2;
  const py = y * 2;
  const h = (i * 2654435761) >>> 0;
  for (let dy = 0; dy < 2; dy++) {
    for (let dx = 0; dx < 2; dx++) {
      const f = (h + ((frame * 7) << 8) + dx * 3 + dy * 11) % 11;
      if (f < 7) {
        ctx.fillStyle = FIRE_COLORS[f % FIRE_COLORS.length];
        ctx.fillRect(px + dx, py + dy - ((f > 3 && dy === 0) ? 1 : 0), 1, 1);
      }
    }
  }
}

// ---------- tornado (world-canvas swirl) ----------
export function drawTornado(ctx: CanvasRenderingContext2D, e: Effect, frame: number) {
  const px = e.x * 2;
  const py = e.y * 2;
  for (let s = 0; s < 9; s++) {
    const yy = py - s * 2;
    const w = 1 + Math.floor(s / 2);
    const spin = Math.floor(frame / 3 + s) % 3;
    ctx.fillStyle = s < 3 ? 'rgba(120,115,105,0.95)' : 'rgba(160,155,145,0.8)';
    ctx.fillRect(px - w + spin, yy, w * 2 - 1, 1);
  }
  // debris
  const df = frame % 5;
  ctx.fillStyle = '#3a342c';
  ctx.fillRect(px - 3 + df, py - 2, 1, 1);
  ctx.fillRect(px + 3 - df, py - 5, 1, 1);
}

// ===========================================================================
// ============ Task 33 超细粒度精灵（×4 坐标：1 tile = 4 精细像素） ============
// 仅在 zoom ≥ 8 且屏上单位数受控时启用（render.ts FINE_TIER 门控）——
// 近景观看时每个生物获得 2 倍线性分辨率（4 倍像素数）：面部五官/发丝/
// 衣袍明暗/腰带扣/武器护手/四相步态，全部逐像素手绘。
// ============================================================================

/** 武器族判定（轻量前缀表：不依赖 items.ts 反向导入） */
function wepFamily(w: string | null | undefined): 'sword' | 'axe' | 'spear' | 'musket' | 'rifle' | 'laser' | 'bow' | 'none' {
  if (!w) return 'none';
  if (w === 'musket') return 'musket';
  if (w === 'rifle') return 'rifle';
  if (w === 'laser_rifle') return 'laser';
  if (w.includes('sword') || w.includes('blade') || w.includes('dagger') || w.includes('katana')) return 'sword';
  if (w.includes('axe') || w.includes('hammer') || w.includes('mace') || w.includes('club')) return 'axe';
  if (w.includes('spear') || w.includes('lance') || w.includes('pike') || w.includes('staff')) return 'spear';
  if (w.includes('bow') || w.includes('crossbow')) return 'bow';
  return 'sword';
}

/** 剑刃色阶（圣剑金/烈焰橙/寒冰青/名刃银/凡铁青铜） */
function bladeColor(w: string | null | undefined): string {
  if (!w) return '#9a8f7a';
  if (w === 'excalibur' || w === 'sword3' || w === 'holy_sword') return '#ffd93d';
  if (w === 'flame_sword') return '#ff8c42';
  if (w === 'ice_sword') return '#8be9ff';
  if (w === 'katana' || w === 'elf_blade' || w === 'sword2') return '#e8e8e8';
  return '#b0a48c';
}

/**
 * ×4 精绘人形（总高 14 精细像素 = 3.5 tile，与 ×2 版身形一致）。
 * 分层：阴影→靴→双腿(四相步态)→腰带(扣)→躯干(受光/背阴)→双臂(反相摆)→
 * 项链/护甲→颈→头(瞳孔/种族五官)→发型(顶+背垂)→头盔→持械(攻击姿势)。
 */
export function drawPersonFine(ctx: CanvasRenderingContext2D, u: Unit, civColor: [number, number, number] | null, t = 0) {
  const fx = Math.round(u.rx ?? u.x);
  const fy = Math.round(u.ry ?? u.y) + 1; // 脚底基线
  const f = u.flip ? -1 : 1;
  const race = u.race;
  const vis = RACES[race]?.vis;
  const skin = vis ? shiftRgb(SKIN[vis.root] ?? SKIN[0], vis) : (SKIN[race] ?? SKIN[0]);
  const skinDark = mix(skin, [24, 20, 16], 0.3);
  const goblin = race === R.GOBLIN;
  const zombie = race === R.ZOMBIE;
  const dwarf = race === R.DWARF;
  const bandit = race === R.BANDIT && !civColor;
  const isMoving = u.lx !== undefined && (u.lx !== u.x || u.ly !== u.y);
  const ph = isMoving ? ((t >> 2) & 3) : -1; // 四相步态
  const bob = isMoving && (ph === 1 || ph === 3) ? 1 : 0;
  const breath = !isMoving && ((t >> 4) & 1) === 1 ? 1 : 0;
  const dy = fy - bob - breath;

  // —— 衣布配色（王国色披身 + 背阴列） ——
  let cloth: [number, number, number];
  if (race === R.GOBLIN) cloth = [90, 122, 44];
  else if (race === R.LIZARD) cloth = [58, 52, 44];
  else if (civColor) cloth = mix(civColor, [30, 30, 30], 0.25);
  else cloth = [120, 90, 70];
  const clothDark = mix(cloth, [18, 16, 12], 0.4);
  const pants = mix(cloth, [20, 18, 14], 0.55);
  const hairBase = race === R.ELF ? '#e8d5a0' : race === R.DWARF ? '#b5651d' : race === R.ORC || race === R.BANDIT ? '#14100c' : race === R.ZOMBIE ? '#3a342c' : race === R.LIZARD ? '#2c5e24' : race === R.GOBLIN ? '#2c5e24' : '#5b3a1e';
  // Task 48-B3 长者灰发：年逾 78% 寿限头发染霜（岁月可见；僵尸保持腐色）
  const hairCol = race !== R.ZOMBIE && u.age > u.maxAge * 0.78 ? (vis ? shiftColor('#c9c5bd', vis) : '#c9c5bd') : vis ? shiftColor(hairBase, vis) : hairBase;
  const hurt = u.hurt > 0;

  // —— 0. 地面阴影（椭圆感：中段全宽两端收窄） ——
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(fx - 2, fy + 1, 5, 1);
  ctx.fillRect(fx - 3, fy + 1, 1, 1);
  ctx.fillRect(fx + 3, fy + 1, 1, 1);

  // —— 1. 双腿（四相步态：前后腿交替伸缩 + 前后错位） ——
  const legTop = dy - 3;
  ctx.fillStyle = rgb(pants);
  const l1 = ph === 1 || ph === 2 ? 3 : 2; // 左腿
  const l2 = ph === 3 || ph === 0 ? 3 : 2; // 右腿
  ctx.fillRect(fx - 2, dy + 1 - l1, 2, l1);
  ctx.fillRect(fx + 1 + (ph === 1 ? 1 : 0), dy + 1 - l2, 2, l2);
  // 靴
  ctx.fillStyle = '#3a2c1c';
  ctx.fillRect(fx - 2, dy, 2, 1);
  ctx.fillRect(fx + 1 + (ph === 1 ? 1 : 0), dy, 2, 1);

  // —— 2. 腰带（暗革 + 金扣朝前） ——
  ctx.fillStyle = '#4a3421';
  ctx.fillRect(fx - 2, dy - 4, 5, 1);
  ctx.fillStyle = '#d9a941';
  ctx.fillRect(fx + (f > 0 ? 1 : -2), dy - 4, 1, 1);

  // —— 3. 躯干（受光面/背阴面双色 + 下摆） ——
  const torsoW = dwarf ? 6 : 5;
  const tx = fx - (torsoW >> 1);
  ctx.fillStyle = hurt ? '#ff3b30' : rgb(cloth);
  ctx.fillRect(tx, dy - 7, torsoW, 3);
  ctx.fillStyle = hurt ? '#c73028' : rgb(clothDark);
  ctx.fillRect(f > 0 ? tx : tx + torsoW - 1, dy - 7, 1, 3); // 背阴列
  ctx.fillStyle = hurt ? '#ff6b5e' : rgb(mix(cloth, [235, 230, 220], 0.18));
  ctx.fillRect(f > 0 ? tx + torsoW - 1 : tx, dy - 7, 1, 2); // 受光缘

  // —— 4. 护甲（胸甲板 + 双肩垫） ——
  if (u.arm) {
    const steel = u.arm === 'armor2' || u.arm === 'armor3';
    ctx.fillStyle = steel ? '#cfd4da' : '#b58a5a';
    ctx.fillRect(tx + 1, dy - 7, torsoW - 2, 2);
    ctx.fillStyle = steel ? '#eef2f6' : '#d8b078';
    ctx.fillRect(tx + 1, dy - 7, 1, 1); // 甲面高光
    ctx.fillStyle = steel ? '#9aa2ac' : '#8a6238';
    ctx.fillRect(tx - 1, dy - 7, 1, 2); // 肩垫 ×2
    ctx.fillRect(tx + torsoW, dy - 7, 1, 2);
  }

  // —— 5. 双臂（反相摆动；僵尸双臂前伸平举两行） ——
  ctx.fillStyle = hurt ? '#ff6b5e' : rgb(skin);
  const atk = (u.atk ?? 0) > 0;
  if (zombie) {
    ctx.fillRect(fx + (f > 0 ? 2 : -4), dy - 7, 2, 1);
    ctx.fillRect(fx + (f > 0 ? 3 : -4), dy - 6, 2, 1);
  } else if (atk) {
    ctx.fillRect(fx + 2 * f, dy - 9, 1, 3); // 持械臂高举
    ctx.fillRect(fx - 3 * f + (f > 0 ? 1 : 1), dy - 6, 1, 2); // 后臂保持
  } else {
    const swing = ph === 1 || ph === 2 ? 1 : 0;
    ctx.fillRect(fx - 3, dy - 7 + (isMoving && swing ? 0 : 1), 1, 2);
    ctx.fillRect(fx + 2 + (isMoving && swing ? 1 : 0), dy - 7 + (isMoving && swing ? 1 : 0), 1, 2);
  }

  // —— 6. 颈 ——
  ctx.fillStyle = rgb(skinDark);
  ctx.fillRect(fx - 1, dy - 8, 2, 1);

  // —— 7. 头部（4 宽 ×3 高：发际线/双眼瞳/种族五官） ——
  const hy = dy - 11;
  ctx.fillStyle = hurt ? '#ff6b5e' : u.infected ? '#9fd68f' : rgb(skin);
  ctx.fillRect(fx - 2, hy, 4, 3);
  // 眼睛（朝向偏移；荧光瞳按视觉基因组）
  const eyeCol = vis?.glow ? '#7df9ff' : zombie ? '#d9f2c0' : '#1c1710';
  ctx.fillStyle = eyeCol;
  const ex = fx - 1 + (f > 0 ? 1 : 0); // 首眼（朝向前半脸）
  ctx.fillRect(ex, hy + 1, 1, 1);
  ctx.fillRect(ex + 1, hy + 1, 1, 1);
  // 嘴/吻部
  if (race === R.LIZARD) {
    ctx.fillStyle = rgb(skinDark);
    ctx.fillRect(fx - 1 + (f > 0 ? 2 : -2), hy + 2, 1, 1); // 吻部前伸
  }
  // 种族五官
  if (race === R.ORC) {
    ctx.fillStyle = '#f2ead8';
    ctx.fillRect(fx - 1, hy + 2, 1, 1); // 獠牙 ×2
    ctx.fillRect(fx + 1, hy + 2, 1, 1);
  }
  if (race === R.ELF) {
    ctx.fillStyle = rgb(skin);
    ctx.fillRect(fx - 3, hy + 1, 1, 1); // 尖耳外伸
    ctx.fillRect(fx + 2, hy + 1, 1, 1);
  }
  if (goblin) {
    ctx.fillStyle = rgb(skinDark);
    ctx.fillRect(fx - 3, hy + 1, 1, 1); // 大耳 ×2（更外扩）
    ctx.fillRect(fx + 2, hy + 1, 1, 1);
  }
  // 矮人胡须（垂至胸口）
  if (dwarf) {
    ctx.fillStyle = hairCol;
    ctx.fillRect(fx - 2, hy + 3, 4, 2);
    ctx.fillRect(fx - 1, hy + 5, 2, 1);
  }
  // 强盗兜帽（罩发 + 面部阴影只露双眼）
  if (bandit) {
    ctx.fillStyle = '#2a2620';
    ctx.fillRect(fx - 2, hy - 1, 4, 3);
    ctx.fillRect(fx - 2, hy + 2, 4, 1);
    ctx.fillStyle = '#14100c';
    ctx.fillRect(fx - 1, hy + 1, 3, 1);
  }

  // —— 8. 发型（顶部两行 + 面缘刘海 + 背侧垂发；精灵长发及肩） ——
  if (!bandit) {
    ctx.fillStyle = hairCol;
    ctx.fillRect(fx - 2, hy - 2, 4, 2);
    ctx.fillRect(fx + (f > 0 ? -3 : 2), hy - 1, 1, 2); // 额前鬓角
    const backX = f > 0 ? fx - 3 : fx + 2;
    ctx.fillRect(backX, hy - 1, 1, race === R.ELF ? 5 : 3); // 背侧垂发
    ctx.fillStyle = 'rgba(255,255,240,0.25)';
    ctx.fillRect(fx - 1, hy - 2, 2, 1); // 发丝高光
    if (race === R.LIZARD) {
      ctx.fillStyle = '#2c5e24';
      ctx.fillRect(fx - 1, hy - 3, 2, 1); // 蜥蜴脊冠
    }
  }

  // —— 9. 涌现标记（视觉基因组：头角/头冠/荧光瞳已在眼色处理） ——
  if (vis) {
    if (vis.horns >= 1) {
      ctx.fillStyle = '#e8dcc0';
      ctx.fillRect(fx - 2, hy - 3, 1, 1);
      ctx.fillRect(fx + 1, hy - 3, 1, 1);
      if (vis.horns >= 2) {
        ctx.fillRect(fx - 3, hy - 4, 1, 1);
        ctx.fillRect(fx + 2, hy - 4, 1, 1);
      }
    }
    if (vis.crest) {
      ctx.fillStyle = vis.glow ? '#7df9ff' : '#ff8c42';
      ctx.fillRect(fx - 1, hy - 3 - (vis.horns >= 1 ? 1 : 0), 2, 1);
    }
    if (vis.pattern === 1) {
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(fx - 1, dy - 7, 1, 3); // 躯干条纹
      ctx.fillRect(fx + 1, dy - 7, 1, 3);
    }
  }

  // —— 10. 头盔（罩发 + 鼻梁护条） ——
  if (u.hlm) {
    const steel = u.hlm === 'hlm2' || u.hlm === 'hlm3';
    ctx.fillStyle = steel ? '#cfd4da' : '#b58a5a';
    ctx.fillRect(fx - 2, hy - 2, 4, 2);
    ctx.fillRect(fx - 2, hy, 1, 1);
    ctx.fillRect(fx + 1, hy, 1, 1);
    ctx.fillStyle = steel ? '#eef2f6' : '#d8b078';
    ctx.fillRect(fx - 1, hy - 2, 2, 1);
    ctx.fillStyle = steel ? '#9aa2ac' : '#8a6238';
    ctx.fillRect(fx + (f > 0 ? 1 : -2), hy, 1, 2); // 鼻梁护条朝前
  }

  // —— 11. 持械（攻击姿势：举过肩） ——
  const fam = wepFamily(u.wep);
  if (fam !== 'none') {
    const wx = fx + 2 * f; // 持械手前方位
    const wy = atk ? dy - 10 : dy - 7; // 攻击时举高
    if (fam === 'sword') {
      const bc = bladeColor(u.wep);
      ctx.fillStyle = '#5a4028';
      ctx.fillRect(wx, wy + 4, 1, 2); // 握柄
      ctx.fillStyle = '#8a6238';
      ctx.fillRect(wx - 1, wy + 3, 3, 1); // 护手
      ctx.fillStyle = bc;
      ctx.fillRect(wx, wy - 1, 1, 4); // 剑身
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillRect(wx, wy, 1, 1); // 刃光
      if (u.wep === 'flame_sword' && ((t >> 2) & 1) === 1) {
        ctx.fillStyle = '#ff8c42';
        ctx.fillRect(wx, wy - 2, 1, 1); // 燃焰余烬
      }
    } else if (fam === 'axe') {
      ctx.fillStyle = '#5a4028';
      ctx.fillRect(wx, wy, 1, 6); // 柄
      ctx.fillStyle = u.wep === 'berserker_axe' ? '#c9463d' : '#b0a48c';
      ctx.fillRect(wx + (f > 0 ? 0 : -2), wy, 3, 2); // 斧刃
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.fillRect(wx + (f > 0 ? 2 : -2), wy, 1, 1);
    } else if (fam === 'spear') {
      ctx.fillStyle = '#6e4a2b';
      ctx.fillRect(wx, wy - 2, 1, 8); // 长杆
      ctx.fillStyle = '#d8d8d8';
      ctx.fillRect(wx, wy - 4, 1, 2); // 枪尖
    } else if (fam === 'bow') {
      ctx.strokeStyle = '#6e4a2b';
      ctx.lineWidth = 1;
      ctx.strokeRect(wx, wy - 1, 2, 5); // 弓身轮廓
      ctx.fillStyle = 'rgba(240,240,230,0.7)';
      ctx.fillRect(wx + 1, wy, 1, 3); // 弦
    } else {
      // 火器：枪托/机匣/枪管 三段 + 瞄具
      const fut = fam === 'laser';
      ctx.fillStyle = fut ? '#1d2b36' : fam === 'rifle' ? '#3a3f4a' : '#4a4038';
      ctx.fillRect(wx - (f > 0 ? 0 : 4), wy, 5, 1); // 枪管
      ctx.fillStyle = fut ? '#2e4456' : '#6e4a2b';
      ctx.fillRect(wx - (f > 0 ? 1 : 3), wy, 1, 1); // 枪托
      if (fam === 'rifle') {
        ctx.fillStyle = '#565e6a';
        ctx.fillRect(wx + (f > 0 ? 1 : -3), wy - 1, 2, 1); // 瞄具
      }
      if (fut) {
        const glow = ((t >> 3) & 1) === 1 ? '#7df9ff' : '#3ec6d8';
        ctx.fillStyle = glow;
        ctx.fillRect(wx + (f > 0 ? 2 : -3), wy, 1, 1); // 能量槽呼吸
      }
      if (atk) {
        ctx.fillStyle = fut ? '#a5f3fc' : '#fff3c4';
        ctx.fillRect(wx + (f > 0 ? 5 : -6), wy, 1, 1); // 枪口焰
        if (!fut) {
          ctx.fillStyle = '#ffb347';
          ctx.fillRect(wx + (f > 0 ? 6 : -7), wy, 1, 1);
        }
      }
    }
  }
}

/**
 * ×4 精绘四足兽（wolf/snowwolf/sheep/bear/deer）：背部受光脊线 + 腹部背阴 /
 * 四腿对角步态 / 头部（耳/眼/吻/鼻尖）/ 摆尾 / 物种质感（羊毛疙瘩/熊峰/鹿角白臀）。
 */
export function drawQuadFine(ctx: CanvasRenderingContext2D, u: Unit, kind: 'wolf' | 'snowwolf' | 'sheep' | 'bear' | 'deer', t = 0) {
  const fx = Math.round(u.rx ?? u.x);
  const fy = Math.round(u.ry ?? u.y) + 1;
  const f = u.flip ? -1 : 1;
  const isMoving = u.lx !== undefined && (u.lx !== u.x || u.ly !== u.y);
  const ph = isMoving ? ((t >> 2) & 3) : -1;
  const hurt = u.hurt > 0;
  const infected = u.infected;

  // 物种基色
  let body: [number, number, number], dark: [number, number, number], light: [number, number, number];
  if (kind === 'sheep') { body = [242, 234, 216]; dark = [70, 66, 60]; light = [255, 250, 240]; }
  else if (kind === 'bear') { body = [110, 74, 43]; dark = [58, 38, 20]; light = [154, 111, 69]; }
  else if (kind === 'deer') { body = [165, 121, 79]; dark = [91, 61, 36]; light = [209, 168, 120]; }
  else if (kind === 'snowwolf') { body = [238, 242, 245]; dark = [176, 188, 196]; light = [255, 255, 255]; }
  else { body = [141, 141, 141]; dark = [58, 52, 44]; light = [200, 200, 200]; }
  if (hurt) { body = [255, 107, 94]; dark = [207, 63, 46]; light = [255, 196, 184]; }
  if (infected) { body = [159, 214, 143]; dark = [96, 140, 84]; light = [200, 235, 180]; }

  const bulk = kind === 'bear';
  const slender = kind === 'deer';
  const bw = bulk ? 10 : slender ? 7 : 8; // 身长
  const bh = bulk ? 4 : slender ? 2 : 3; // 身高
  const bx = fx - (bw >> 1);
  const by = fy - 1 - bh; // 身体顶行

  // —— 阴影 ——
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.fillRect(bx + 1, fy + 1, bw - 2, 1);
  ctx.fillRect(bx, fy + 1, 1, 1);
  ctx.fillRect(bx + bw - 1, fy + 1, 1, 1);

  // —— 四腿（对角步态：左前+右后 与 右前+左后 交替；鹿腿细长 3 高） ——
  ctx.fillStyle = rgb(mix(dark, [0, 0, 0], 0.15));
  const legH = slender ? 3 : 2;
  const legXs = [bx + 1, Math.round(bx + bw * 0.4), Math.round(bx + bw * 0.6), bx + bw - 2];
  for (let li = 0; li < 4; li++) {
    const pair = li === 0 || li === 3 ? 0 : 1; // 对角组
    const lift = isMoving && ((ph >> (pair === 0 ? 0 : 1)) & 1) === 1;
    const h = lift ? legH - 1 : legH;
    ctx.fillRect(legXs[li], fy + 1 - h, 1, h);
  }
  if (bulk) {
    // 熊爪白尖
    ctx.fillStyle = '#e8e0d0';
    for (const lx of legXs) ctx.fillRect(lx, fy, 1, 1);
  }

  // —— 躯干（背光脊线 + 腹部暗缘） ——
  ctx.fillStyle = rgb(body);
  ctx.fillRect(bx, by, bw, bh);
  ctx.fillStyle = rgb(light);
  ctx.fillRect(bx + 1, by, bw - 2, 1); // 背部受光
  ctx.fillStyle = rgb(dark);
  ctx.fillRect(bx + 1, by + bh - 1, bw - 2, 1); // 腹部背阴
  if (kind === 'wolf' || kind === 'snowwolf') {
    ctx.fillStyle = rgb(dark);
    ctx.fillRect(bx + 2, by, 1, 1);
    ctx.fillRect(bx + 5, by, 1, 1); // 狼背纹
  }
  if (kind === 'sheep') {
    // 羊毛疙瘩：棋盘亮暗交替
    ctx.fillStyle = rgb(dark);
    for (let i = 0; i < bw; i += 2) ctx.fillRect(bx + i, by + 1 + ((i >> 1) & 1), 1, 1);
  }
  if (bulk) {
    ctx.fillStyle = rgb(dark);
    ctx.fillRect(bx + bw - 4, by - 1, 3, 1); // 熊肩峰
  }

  // —— 头部（前方：额/眼/吻/鼻尖/耳） ——
  const hx = f > 0 ? bx + bw : bx - 3;
  ctx.fillStyle = rgb(body);
  ctx.fillRect(hx, by - 1, 3, 3);
  ctx.fillRect(hx + (f > 0 ? 3 : -1), by, 1, 1); // 吻部
  ctx.fillStyle = '#14100c';
  ctx.fillRect(hx + (f > 0 ? 3 : -1), by, 1, 1); // 鼻尖
  ctx.fillStyle = hurt ? '#ffd93d' : '#14100c';
  ctx.fillRect(hx + (f > 0 ? 1 : 1), by - 1, 1, 1); // 眼
  // 耳
  ctx.fillStyle = rgb(dark);
  if (kind === 'bear') {
    ctx.fillRect(hx + 1, by - 2, 1, 1);
    ctx.fillRect(hx + (f > 0 ? 2 : 0), by - 2, 1, 1); // 圆耳 ×2
  } else if (kind === 'deer') {
    // 鹿角（分枝）
    ctx.fillStyle = '#8a6a42';
    ctx.fillRect(hx + 1, by - 3, 1, 2);
    ctx.fillRect(hx + (f > 0 ? 2 : 0), by - 4, 1, 3);
    ctx.fillRect(hx + (f > 0 ? 3 : -1), by - 3, 1, 1);
  } else {
    ctx.fillRect(hx + (f > 0 ? 1 : 1), by - 2, 1, 1); // 竖耳
    ctx.fillRect(hx + (f > 0 ? 2 : 0), by - 2, 1, 1);
  }
  if (kind === 'deer') {
    // 白臀斑
    ctx.fillStyle = '#f2ead8';
    ctx.fillRect(f > 0 ? bx : bx + bw - 2, by + 1, 2, 1);
  }

  // —— 尾巴（摆动相位） ——
  if (kind !== 'bear' && kind !== 'deer') {
    const tx = f > 0 ? bx - 1 : bx + bw;
    const wag = ((t >> 3) & 1) === 1 ? -1 : 0;
    ctx.fillStyle = kind === 'sheep' ? rgb(dark) : rgb(mix(body, dark, 0.35));
    ctx.fillRect(tx, by + wag, 1, 1);
    if (kind === 'wolf' || kind === 'snowwolf') ctx.fillRect(tx - f, by + 1 + wag, 1, 1);
  } else if (kind === 'deer') {
    ctx.fillStyle = '#f2ead8';
    ctx.fillRect(f > 0 ? bx - 1 : bx + bw, by, 1, 1); // 小白尾
  }
}

/**
 * 涌现巨怪形态（×2 坐标）：水生触手环 / 沙泳分节蠕体 / 蛇形蜿蜒 ——
 * 种化自克拉肯/沙虫/蛇怪/巨龙的动态物种不再退化为四足兽形。
 */
export function drawEmergentMonster(ctx: CanvasRenderingContext2D, u: Unit, vc: VisCache, shape: 'aquatic' | 'worm' | 'serpent', t = 0) {
  const px = u.dpx ?? (u.rx ?? u.x) * 2;
  const py = u.dpy ?? (u.ry ?? u.y) * 2;
  const f = u.flip ? -1 : 1;
  const hurt = u.hurt > 0;
  const body = hurt ? '#ff6b5e' : u.infected ? '#9fd68f' : vc.body;
  const dark = hurt ? '#cf3f2e' : vc.dark;
  const light = hurt ? '#ffc4b8' : vc.light;
  const accent = hurt ? '#ffd93d' : vc.accent;
  const scale = Math.max(0.9, Math.min(1.5, vc.size));
  const scaled = Math.abs(scale - 1) > 0.06;
  if (scaled) {
    ctx.save();
    ctx.translate(px, py + 2);
    ctx.scale(scale, scale);
    ctx.translate(-px, -(py + 2));
  }

  if (shape === 'aquatic') {
    // —— 克拉肯形：穹顶头 + 8 条相位触手 ——
    ctx.fillStyle = 'rgba(0,0,20,0.25)';
    ctx.fillRect(px - 3, py + 2, 7, 1);
    // 穹顶（2 行圆顶 + 顶点高光）
    ctx.fillStyle = body;
    ctx.fillRect(px - 2, py - 4, 5, 2);
    ctx.fillRect(px - 1, py - 5, 3, 1);
    ctx.fillStyle = light;
    ctx.fillRect(px - 1, py - 5, 2, 1);
    // 头角/背棘（基因组）
    if (vc.horns >= 1) {
      ctx.fillStyle = light;
      ctx.fillRect(px - 2, py - 6, 1, 1);
      ctx.fillRect(px + 2, py - 6, 1, 1);
    }
    if (vc.spikes) {
      ctx.fillStyle = dark;
      ctx.fillRect(px - 1, py - 6, 1, 1);
    }
    // 眼（荧光/暗瞳）
    ctx.fillStyle = vc.glow ? '#7df9ff' : dark;
    ctx.fillRect(px - 1, py - 3, 1, 1);
    ctx.fillRect(px + 1, py - 3, 1, 1);
    // 花纹（穹顶条/斑）
    if (vc.pattern === 1) {
      ctx.fillStyle = dark;
      ctx.fillRect(px - 2, py - 4, 1, 1);
      ctx.fillRect(px + 2, py - 4, 1, 1);
    } else if (vc.pattern === 2) {
      ctx.fillStyle = accent;
      ctx.fillRect(px, py - 4, 1, 1);
    }
    // 触手 ×8（两波相位交替卷伸）
    ctx.fillStyle = dark;
    for (let i = 0; i < 8; i++) {
      const side = i < 4 ? -1 : 1;
      const k = i % 4;
      const curl = ((t >> 3) + i) % 4 < 2 ? 1 : 0;
      const bx = px + side * (2 + (k >> 1));
      ctx.fillRect(bx, py - 2, 1, 2 + (k & 1));
      if (curl) ctx.fillRect(bx + side, py + (k & 1), 1, 1);
    }
  } else if (shape === 'worm') {
    // —— 沙虫形：分段蠕体（头节大 + 3-4 体节渐小 + 环纹）+ 张合巨口 ——
    ctx.fillStyle = 'rgba(80,60,30,0.3)';
    ctx.fillRect(px - 4, py + 2, 9, 1);
    const segs = 4 + (vc.bulk >= 0.6 ? 1 : 0);
    const maw = ((t >> 3) & 1) === 1;
    for (let i = 0; i < segs; i++) {
      const w = i === 0 ? 4 : 3 - Math.min(1, i >> 1);
      const sx = f > 0 ? px - i * 2 : px - w + 2 + i * 2 - 2;
      const sy = py - 2 - (i === 0 ? 1 : 0) + (i % 2 === 1 ? 1 : 0);
      ctx.fillStyle = i === 0 ? body : mix3(body, dark, 0.12 * i);
      ctx.fillRect(sx, sy, w, 3 - (i >> 1));
      if (i > 0) {
        ctx.fillStyle = dark;
        ctx.fillRect(sx, sy, 1, 3 - (i >> 1)); // 体节环纹
      }
    }
    // 头节：眼 + 巨口（张合相位 + 齿）
    const hxx = f > 0 ? px : px - 4;
    ctx.fillStyle = vc.glow ? '#7df9ff' : dark;
    ctx.fillRect(hxx + (f > 0 ? 1 : 1), py - 3, 1, 1);
    ctx.fillStyle = '#1c0f08';
    ctx.fillRect(hxx + (f > 0 ? 2 : -1), py - 2, 2, maw ? 2 : 1);
    ctx.fillStyle = '#f2ead8';
    if (maw) {
      ctx.fillRect(hxx + (f > 0 ? 2 : -1), py - 2, 1, 1); // 口齿
      ctx.fillRect(hxx + (f > 0 ? 3 : 0), py - 1, 1, 1);
    }
    // 背棘（基因组）
    if (vc.spikes) {
      ctx.fillStyle = dark;
      ctx.fillRect(px - 1, py - 4, 1, 1);
      ctx.fillRect(px - 3, py - 3, 1, 1);
    }
    if (vc.crest) {
      ctx.fillStyle = accent;
      ctx.fillRect(px, py - 4, 2, 1);
    }
  } else {
    // —— 蛇形（蛇怪/巨龙种化）：S 蜿蜒躯体 + �颈部立起 + 兜帽/翅 ——
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fillRect(px - 4, py + 2, 8, 1);
    // S 形体（三段错位）
    ctx.fillStyle = body;
    ctx.fillRect(px - 4, py + 1, 4, 1);
    ctx.fillRect(px - 2, py, 3, 1);
    ctx.fillRect(px - 1, py - 1, 3, 1);
    ctx.fillRect(px, py - 2, 3, 2);
    // 立起的头颈
    ctx.fillStyle = body;
    ctx.fillRect(px + 1, py - 4, 2, 2);
    ctx.fillStyle = light;
    ctx.fillRect(px + 1, py - 4, 2, 1); // 颈背受光
    // 兜帽（蛇怪特化：头后延展的暗色皮褶）
    if (vc.crest || vc.horns >= 1) {
      ctx.fillStyle = mix3(body, dark, 0.35);
      ctx.fillRect(px - 1, py - 4, 2, 2);
    }
    // 头：眼 + 吐信
    ctx.fillStyle = vc.glow ? '#7df9ff' : '#ffd93d';
    ctx.fillRect(px + 2, py - 4, 1, 1);
    if (((t >> 4) & 1) === 1) {
      ctx.fillStyle = '#e05a5a';
      ctx.fillRect(px + 3, py - 3, 1, 1); // 吐信
    }
    // 花纹（沿 S 体）
    if (vc.pattern === 1) {
      ctx.fillStyle = dark;
      ctx.fillRect(px - 3, py + 1, 1, 1);
      ctx.fillRect(px - 1, py, 1, 1);
      ctx.fillRect(px + 1, py - 1, 1, 1);
    } else if (vc.pattern === 2) {
      ctx.fillStyle = accent;
      ctx.fillRect(px - 2, py + 1, 1, 1);
      ctx.fillRect(px, py - 1, 1, 1);
    }
    // 背棘列
    if (vc.spikes) {
      ctx.fillStyle = dark;
      ctx.fillRect(px - 3, py, 1, 1);
      ctx.fillRect(px - 1, py - 1, 1, 1);
      ctx.fillRect(px + 1, py - 2, 1, 1);
    }
    // 尾尖
    ctx.fillStyle = mix3(body, dark, 0.2);
    ctx.fillRect(px - 5, py + 1, 1, 1);
  }
  if (scaled) ctx.restore();
}

/** hex → rgb 三元组（巨怪形态分段渐暗用） */
function mix3(hex: string, hex2: string, t: number): string {
  const p = (h: string) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)] as [number, number, number];
  const a = p(hex);
  const b = p(hex2);
  return rgb([Math.round(a[0] + (b[0] - a[0]) * t), Math.round(a[1] + (b[1] - a[1]) * t), Math.round(a[2] + (b[2] - a[2]) * t)]);
}
