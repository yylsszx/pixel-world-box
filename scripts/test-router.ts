// @ts-nocheck
// 语义路由筛选质量验证：典型指令 → 筛选结果
import { selectRelevantTools } from '../src/lib/oracle/router';
import { effectiveOracleTools } from '../src/lib/oracle/plugins';

const CASES = [
  '放一颗核弹，威力最大',
  '把所有的羊变成不死僵尸羊，然后告诉我现在有多少只',
  '让狼群变得凶猛三倍',
  '统计各种族的数量并给我排名',
  '创造一个全新的冰霜巨兽，要吓人，保存到图鉴',
  '让人类和兽人爆发世界大战',
  '在北方建一座雪山王国',
  '世界现在是什么局势？',
  '给最强的英雄一把神剑',
  '这世界最近发生了什么大事',
  '帮我写一条规则：每当有王国覆灭就降下一颗陨石',
  '你好',
];

const tools = effectiveOracleTools();
console.log(`工具总数: ${tools.length}\n`);
for (const q of CASES) {
  const { selected, fallback } = selectRelevantTools(q, tools);
  const names = selected.map((t) => t.name);
  console.log(`「${q}」`);
  console.log(`  ${fallback ? '【回退全量】' : `筛选 ${selected.length} 个`}: ${fallback ? '(全部)' : names.join(', ')}`);
}
