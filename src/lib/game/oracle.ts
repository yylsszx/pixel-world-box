// ============ 神谕之眼（Oracle Sight） ============
// 把整个像素世界压缩成一份给 AI 大模型阅读的「世界实况」：
// 纪元/列国/战火/终极世界大战/生态/亚种/近期纪事——数据全部锚定引擎实时状态，绝不虚构。
import { RACES, CASUS_META } from './types';
import { GameEngine } from './engine';
import { SEASON_YEARS } from './nature';

/** 食草/食肉分类（与引擎生态采样一致：绵羊/鹿/企鹅/骆驼为食草，其余野生动物按 predator 判定） */
const ECO_HERBIVORES = new Set(['sheep', 'deer', 'penguin', 'camel']);

/**
 * 构建世界实况文本（神谕 API 的 world 字段）。
 * 紧凑中文结构化（非 JSON）：token 高效、LLM 理解力强、数据可点名。
 */
export function buildOracleContext(eng: GameEngine): string {
  const year = Math.floor(eng.yearF);
  const alive = eng.civs.filter((c) => c.alive);

  // —— 总览：人口 / 种族分布 / 文明 / 野生动物 / 军团 ——
  const byRace = new Map<string, number>();
  let totalPop = 0;
  let wild = 0;
  let herb = 0;
  let pred = 0;
  for (const u of eng.units) {
    if (u.dead) continue;
    const def = RACES[u.race];
    if (!def) continue;
    if (def.isCiv) {
      totalPop++;
      byRace.set(def.name, (byRace.get(def.name) ?? 0) + 1);
    } else {
      wild++;
      if (ECO_HERBIVORES.has(def.key)) herb++;
      else if (def.predator) pred++;
    }
  }
  const raceLine = [...byRace.entries()].map(([n, c]) => `${n}${c}`).join('·');
  const armies = eng.armies.length;

  const L: string[] = [];
  L.push(`【界域 · 第${year}年】`);
  L.push(
    `文明${alive.length}国 · 总人口${totalPop}${raceLine ? `（${raceLine}）` : ''} · 野生动物${wild}头（食草${herb}/食肉${pred}） · 现役军团${armies}支`
  );

  // —— 列国：政体/人口/领土/军队/财富/科技/军备时代/稳定度/交战对象 ——
  L.push('【列国】');
  if (alive.length === 0) {
    L.push('（无文明国家：世界尚处蛮荒，或诸国皆已湮灭）');
  } else {
    alive
      .slice()
      .sort((a, b) => b.pop - a.pop)
      .slice(0, 10)
      .forEach((c, i) => {
        const info = eng.getCivInfo(c.id);
        if (!info) return;
        const warList = info.wars.length ? `⚔交战:${info.wars.join('、')}` : '和平';
        L.push(
          `${i + 1}. ${c.name}（${info.raceName}·${info.govName}）王「${c.kingName}」： 人口${c.pop} 领土${info.tiles}格 军队${info.army} 财富${info.gold}金 科技${info.techCount}项[${info.armamentName}] 稳定度${info.stability} 军国主义${info.militarism} · ${warList}`
        );
      });
    if (alive.length > 10) L.push(`（另有 ${alive.length - 10} 国从略）`);
  }

  // —— 战火：进行中的战争（理由/年限/伤亡/战果） ——
  L.push('【战火】');
  const wars = [...eng.warData.values()];
  if (wars.length === 0) {
    L.push('天下太平：无进行中的战争');
  } else {
    for (const w of wars.slice(0, 8)) {
      const ca = eng.civs[w.a];
      const cb = eng.civs[w.b];
      if (!ca?.alive || !cb?.alive) continue;
      const reason = CASUS_META[w.reason]?.label ?? '战争';
      const years = Math.max(1, year - w.startYear);
      L.push(
        `- ${ca.name} ↔ ${cb.name}：${reason}（第${years}年） 会战${w.battles}次 伤亡${Math.round(w.casA)}/${Math.round(w.casB)} 战果分${Math.round(w.scoreA)}:${Math.round(w.scoreB)}${w.total ? ' 【灭国战争】' : ''}`
      );
    }
  }

  // —— 终极世界大战（开发者引燃的不死不休） ——
  const ww = eng.worldWar;
  if (ww && ww.phase !== 'idle') {
    L.push('【终极世界大战】');
    if (ww.phase === 'running') {
      const years = Math.max(1, year - ww.startYear);
      const aliveB = ww.belligerents.filter((id) => eng.civs[id]?.alive).length;
      L.push(
        `燃烧中：第${years}年，${ww.belligerents.length}国参战尚存${aliveB}，阵亡${ww.kills}；核弹${ww.nukes} 激光${ww.lasers} 蜂群${ww.drones} 轨道${ww.orbitals} 等离子${ww.plasmas} 反物质${ww.antimatters}；停战${ww.truces}次${ww.fallen.length ? `；已灭：${ww.fallen.map((f) => f.name).join('、')}` : ''}`
      );
    } else {
      L.push(ww.endText || '已终战');
    }
  }

  // —— 联盟（阵营实体：成员/凝聚力/共同战争） ——
  L.push('【联盟】');
  if (eng.alliances.length === 0) {
    L.push('世无盟约：列国各自为战');
  } else {
    for (const al of eng.alliances) {
      const members = al.members.map((m) => eng.civs[m]?.name).filter(Boolean);
      const leaderName = eng.civs[al.leader]?.name ?? '?';
      const coh = al.cohesion >= 70 ? '坚如磐石' : al.cohesion >= 40 ? '尚称稳固' : '貌合神离';
      L.push(`- 「${al.name}」盟主${leaderName} 成员${members.length}国（${members.join('、')}） 凝聚力${Math.round(al.cohesion)}[${coh}] 缔约于第${al.formedYear}年 共同参战${al.warsTogether}次`);
    }
  }

  // —— 种族关系（世仇与盟好的外交底色） ——
  const civRaceIds = new Set<number>(alive.map((c) => c.race));
  const relPairs: string[] = [];
  const relIds = [...civRaceIds].sort((a, b) => a - b);
  for (let i = 0; i < relIds.length; i++) {
    for (let j = i + 1; j < relIds.length; j++) {
      const v = eng.raceRelOf(relIds[i], relIds[j]);
      if (Math.abs(v) >= 20) {
        const tag = v <= -40 ? '世仇' : v < 0 ? '敌意' : v >= 40 ? '盟好' : '友善';
        relPairs.push(`${RACES[relIds[i]]?.name}↔${RACES[relIds[j]]?.name}[${tag}]`);
      }
    }
  }
  if (relPairs.length > 0) L.push(`【种族关系】${relPairs.join(' · ')}`);


  // —— 生态：平衡态 + 进化亚种 ——
  L.push(`【生态】${ecoLabel(eng.ecoState)} · 野生动物${wild}头（食草${herb}/食肉${pred}）`);
  const subs = [...eng.speciesBase.entries()]
    .filter(([, v]) => v.sub)
    .map(([race, v]) => `${RACES[race]?.name ?? '?'}·${v.sub}（第${v.gen}代）`);
  if (subs.length) L.push(`进化亚种：${subs.join('、')}`);

  // —— 涌现层：动态种化新物种 + 涌现武器谱系（不可预测发展的证据链） ——
  if (eng.dynRaces.size > 0) {
    const dyn = [...eng.dynRaces.entries()].map(([id, info]) => {
      const def = RACES[id];
      const n = eng.units.reduce((m, u) => m + (u.dead || u.race !== id ? 0 : 1), 0);
      return `${def?.name ?? '?'}（源自${RACES[info.parent]?.name ?? '?'}，现存${n}头${def?.dynTint ? '，头顶异色标记' : ''}）`;
    });
    L.push(`【演化奇点】种化诞生的全新物种：${dyn.join('；')}`);
  }
  const emWeapons = [...eng.emergentWeapons.values()].filter((w) => !w.retired).sort((a, b) => b.kills - a.kills).slice(0, 6);
  if (emWeapons.length > 0) {
    const wLines = emWeapons.map(
      (w) => `「${w.name}」（${eng.civs[w.civ]?.name ?? '?'} · 架构${GameEngine.WC_PAYLOAD[w.pl ?? 1].name}弹×${GameEngine.WC_DELIVERY[w.dl ?? 0].name}投×${GameEngine.WC_GUIDE[w.gd ?? 1].name}导×${GameEngine.WC_POWER[w.pw ?? 0].name}能 · 威力${Math.round(w.dmg)} · 已发射${w.fired}次/杀敌${w.kills}${w.inter ? `/被拦${w.inter}` : ''}${w.wonder ? ' · 奇迹武器' : ''}${w.gen > 1 ? ` · 第${w.gen}代迭代` : ''}）`
    );
    L.push(`【涌现武器】四槽组件架构拼装的非预设武器：${wLines.join('；')}`);
  }
  // —— 军备学说 + 防御演化（武器架构 v2：攻防螺旋的实时状态） ——
  const doctrineCivs = eng.civs.filter((c) => c.alive && eng.emergentWeapons.size > 0).slice(0, 6);
  if (doctrineCivs.length > 0) {
    const dLines = doctrineCivs.map((c) => {
      const doc = eng.doctrineOf(c.id);
      const def = eng.defenseOf(c.id);
      const dom = doc.terror > doc.saturation && doc.terror > doc.precision && doc.terror > doc.attrition ? '恐吓' : doc.saturation > doc.precision && doc.saturation > doc.attrition ? '饱和压制' : doc.precision > doc.attrition ? '精确打击' : '消耗磨损';
      return `${c.name}（${dom}学说：精${doc.precision.toFixed(2)}/饱${doc.saturation.toFixed(2)}/恐${doc.terror.toFixed(2)}/耗${doc.attrition.toFixed(2)}；防御——点防${Math.round(def.point)}/装甲${Math.round(def.armor)}/疏散${Math.round(def.evade)}）`;
    });
    L.push(`【军备竞赛】各国学说与防御演化：${dLines.join('；')}`);
  }

  // —— 自然之力：季节/板块/风暴/地质（自然引擎实况） ——
  const nat = eng.nature;
  const natParts = [`【自然之力】${['春', '夏', '秋', '冬'][nat.season]}季（每季${SEASON_YEARS}年）`, `${nat.plateN}大板块漂移中（地震风险${['平静', '酝酿', '高危', '临界'][nat.quakeRisk]}）`];
  if (nat.ash > 0.1) natParts.push(`火山灰遮蔽天光${Math.round(nat.ash * 100)}%（无夏之年，霜线南侵）`);
  if (nat.storms.length > 0) {
    natParts.push(`活跃风暴：${nat.storms.map((st) => `「${st.name}」${st.kind === 'blizzard' ? '冰暴' : '气旋'}强度${st.strength.toFixed(2)}${st.landed ? '已登陆' : '在洋面'}`).join('、')}`);
  }
  const geoC = nat.counters;
  if (geoC.quakes + geoC.eruptions + geoC.cyclones + geoC.tsunamis + geoC.uplifts > 0) {
    natParts.push(`地质纪事：地震${geoC.quakes}次/强震${geoC.quakesBig}次/喷发${geoC.eruptions}次/造山${geoC.uplifts}次/海啸${geoC.tsunamis}次`);
  }
  if (nat.recentQuakes.length > 0) {
    natParts.push(`近震：${nat.recentQuakes.slice(0, 3).map((q) => `${q.year}年M${q.m.toFixed(1)}`).join('、')}`);
  }
  L.push(natParts.join(' · '));

  // —— 深度打磨：商路与贸易（道路网络 + 在途商队实况） ——
  const caravans = eng.units.filter((u) => !u.dead && (u.caravan ?? 0) > 0);
  let roadTiles = 0;
  for (let i = 0; i < eng.road.length; i++) if (eng.road[i] > 0) roadTiles++;
  const tradeParts: string[] = [];
  if (roadTiles > 0) tradeParts.push(`各国修筑道路共${roadTiles}格（行军提速45%）`);
  if (caravans.length > 0) {
    const tl = caravans.slice(0, 6).map((u) => {
      const home = u.civ >= 0 ? eng.civs[u.civ] : null;
      const to = eng.civs[u.caravan!];
      return `「${home?.name ?? '浪人'}」→「${to?.name ?? '未知邦'}」`;
    });
    tradeParts.push(`在途商队${caravans.length}支：${tl.join('、')}`);
  }
  if (tradeParts.length > 0) L.push(`【商路与贸易】${tradeParts.join(' · ')}`);

  // —— 传奇：击杀榜前三的英雄单位 ——
  const legends = eng.units
    .filter((u) => !u.dead && u.kills >= 5)
    .sort((a, b) => b.kills - a.kills)
    .slice(0, 3);
  if (legends.length > 0) {
    const lg = legends.map((u) => {
      const rd = RACES[u.race];
      const cv = u.civ >= 0 ? eng.civs[u.civ] : null;
      return `${u.name ?? '无名者'}（${rd?.name ?? '?'}${cv ? `·${cv.name}` : '·野外'}，${u.kills}杀${u.trait ? `，${u.trait === 'strong' ? '强壮' : u.trait === 'tough' ? '坚韧' : u.trait === 'swift' ? '迅捷' : u.trait === 'berserk' ? '狂暴' : '异禀'}` : ''}）`;
    });
    L.push(`【传奇】击杀榜：${lg.join('、')}`);
  }

  // —— 近期纪事：最近 12 条世界事件 ——
  const recent = eng.worldEvents.slice(-12).reverse();
  if (recent.length) {
    L.push('【近期纪事】');
    for (const e of recent) L.push(`- ${e.year}年 ${e.text}`);
  }

  return L.join('\n');
}

function ecoLabel(s: string): string {
  switch (s) {
    case 'overgrass':
      return '植被富余（草木繁盛，载畜充足）';
    case 'overgraze':
      return '过牧（食草逼近承载力，草木衰减）';
    case 'collapse':
      return '生态崩溃（植被枯竭，饥荒蔓延）';
    default:
      return '平衡态';
  }
}

/** 神谕模式 → 用户侧展示名（气泡徽章 / 快捷按钮共用） */
export const ORACLE_MODES: { key: 'narrate' | 'analyze' | 'prophesy' | 'ask'; label: string; hint: string }[] = [
  { key: 'narrate', label: '史官纪事', hint: '把近况写成史诗编年史' },
  { key: 'analyze', label: '局势研判', hint: '战略分析师：国力对比与战争走向' },
  { key: 'prophesy', label: '神谕预言', hint: '先知外推：崛起 / 衰落 / 危机' },
  { key: 'ask', label: '自由问答', hint: '向神谕提出任何问题' },
];
