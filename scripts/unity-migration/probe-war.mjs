// probe-war.mjs —— gen-war 场景探针（逐场景容错跑 + dump 步进关键态）
import { buildScenario, scenarios } from './gen-war.mjs';

const keys = process.argv[2] ? process.argv[2].split(',') : scenarios.map((s) => s.key);
for (const key of keys) {
  const spec = scenarios.find((s) => s.key === key);
  if (!spec) { console.log(`${key}: NOT FOUND`); continue; }
  try {
    const g = buildScenario(spec, { ignoreSanity: true });
    const lines = [`S${g.key} [${g.name}] draws=${g.totalDraws}`];
    for (const st of g.steps) {
      lines.push(`  ${st.op} rngA=${st.rngA} rel=${JSON.stringify(st.rel.map(([k, v]) => k))} tension=${JSON.stringify(st.tension)} twars=${st.totalWars.length} wd=${st.warData.length} hist=[${st.warHistory}] lDA=${JSON.stringify(st.lastDeclareAt)} truce=${JSON.stringify(st.wwTruce)} fx=${st.fxCount} ww=${st.worldWar.phase}/k${st.worldWar.kills}/n${st.worldWar.nukes}/b${st.worldWar.belligerents.length}/w${st.worldWar.winner} statWars=${st.statWars} gold=${st.gold} shake=${st.shake} dead=${st.deadCount} toasts=${st.toasts.length}`);
      for (const e of st.events) lines.push(`    ev: ${e.kind} | ${e.text.slice(0, 60)}`);
      for (const f of st.fx.slice(0, 6)) lines.push(`    fx: ${f.kind} dmg=${f.dmg} nuke=${f.nuke} r=${f.r} ttl=${f.ttl} src=${f.src}`);
    }
    console.log(lines.join('\n'));
  } catch (e) {
    console.log(`S${key}: FAIL ${e.message.split('\n')[0].slice(0, 200)}`);
  }
}
