// 激活度自检：每场景目标分支的关键指纹
const g = JSON.parse((await import('node:fs')).readFileSync(new URL('./golden-units-warinfo.json', import.meta.url)));
const F = (d) => { const dv = new DataView(new ArrayBuffer(8)); for (let i = 0; i < 8; i++) dv.setUint8(i, parseInt(d.substr(i * 2, 2), 16)); return dv.getFloat64(0, true); };
let bad = 0;
const ck = (name, cond, detail) => { if (!cond) { bad++; console.log('FAIL', name, detail); } else console.log('ok  ', name, detail); };
for (const c of g.cases) {
  const last = c.steps[c.steps.length - 1];
  switch (c.name) {
    case 'fin-drain': {
      const s2 = c.steps[2];
      ck(c.name, s2.draws === 0, 'draws=' + s2.draws);
      ck(c.name, c.steps[1].stabs[1] !== null && Math.abs(F(c.steps[1].stabs[1]) - 69.2) < 1e-12, 'stab1=' + F(c.steps[1].stabs[1]));
      ck(c.name, Math.abs(F(c.steps[3].exps[0]) - 18) < 1e-12, 'exp0=' + F(c.steps[3].exps[0]));
      ck(c.name, last.warData.length === 1 && last.warData[0].wearA !== null, 'wearA=' + F(last.warData[0].wearA));
      break;
    }
    case 'goal-border': {
      ck(c.name, c.steps[2].probe === 6, 'goalnow=' + c.steps[2].probe);
      ck(c.name, c.steps[3].probe === 1, 'goalmet=' + c.steps[3].probe);
      const s4 = c.steps[4];
      ck(c.name, s4.warData.length === 0, 'wd=' + s4.warData.length);
      ck(c.name, s4.evts.some((e) => e.kind === 'cession') && s4.evts.some((e) => e.kind === 'peace'), 'evts=' + s4.evts.map((e) => e.kind).join(','));
      ck(c.name, s4.draws === 0, 'draws=' + s4.draws);
      break;
    }
    case 'plunder-loot': {
      ck(c.name, c.steps[19].probe === 36, 'goalnow=' + c.steps[19].probe);
      const s20 = c.steps[20];
      const lootEvt = s20.evts.find((e) => e.kind === 'loot');
      ck(c.name, !!lootEvt && lootEvt.text.includes('70'), 'loot=' + (lootEvt && lootEvt.text));
      const g0 = F(s20.golds[0]), g1 = F(s20.golds[1]);
      // civ0: 100 - 12(动员) - 10(财政) + 70(索赔) = 148；civ1: 90 - 7(财政) - 70 = 13
      // （动员费仅挑起方支付——declareWar ca.gold 段）
      ck(c.name, Math.abs(g0 - 148) < 1e-9 && Math.abs(g1 - 13) < 1e-9, 'golds=' + g0 + '/' + g1);
      break;
    }
    case 'cede-border': {
      const s4 = c.steps[4];
      ck(c.name, s4.tilesN[0] === 7 && s4.tilesN[1] === 0, 'tilesN=' + s4.tilesN);
      ck(c.name, s4.housesN[0] === 1 && s4.housesN[1] === 0, 'houses=' + s4.housesN);
      ck(c.name, s4.fxNew.length === 1 && s4.fxNew[0].kind === 'smoke', 'fx=' + s4.fxNew.length);
      ck(c.name, s4.draws === 2, 'draws=' + s4.draws);  // fx smoke 2 抽（seed+dir）——concludeByScore 无掷
      ck(c.name, s4.evts.some((e) => e.kind === 'collapse') && s4.evts.some((e) => e.kind === 'cession'), 'evts=' + s4.evts.map((e) => e.kind).join(','));
      ck(c.name, last.warShame.length === 1, 'shame=' + last.warShame.length);
      ck(c.name, s4.buildings.length === 1 && s4.buildings[0].civ === 0, 'bldSurv=' + JSON.stringify(s4.buildings));
      break;
    }
    case 'cede-whitepeace': {
      const s2 = c.steps[2];
      ck(c.name, s2.tilesN[0] === 3 && s2.tilesN[1] === 4, 'tilesN=' + s2.tilesN);
      ck(c.name, s2.draws === 0, 'draws=' + s2.draws);
      ck(c.name, s2.evts.some((e) => e.kind === 'peace') && !s2.evts.some((e) => e.kind === 'cession'), 'evts=' + s2.evts.map((e) => e.kind).join(','));
      ck(c.name, last.warShame.length === 1, 'shame=' + last.warShame.length);
      break;
    }
    case 'sustain-broken': {
      const p = F(c.steps[3].probe);
      ck(c.name, p < 25, 'sustain=' + p);
      const s5 = c.steps[4];
      ck(c.name, s5.draws === 2, 'draws=' + s5.draws);   // 0.5 拒割 + 0.4 白平过
      ck(c.name, s5.evts.some((e) => e.kind === 'collapse') && s5.evts.some((e) => e.kind === 'peace') && !s5.evts.some((e) => e.kind === 'cession'), 'evts=' + s5.evts.map((e) => e.kind).join(','));
      ck(c.name, s5.warData.length === 0 && F(s5.rel[0][1]) === 5, 'rel=' + (s5.rel[0] && F(s5.rel[0][1])));
      break;
    }
    case 'total-giveup': {
      const s2 = c.steps[2];
      ck(c.name, s2.warData.length === 0 && s2.totalWars.length === 0, 'wd=' + s2.warData.length + ' tw=' + s2.totalWars.length);
      ck(c.name, s2.evts.some((e) => e.kind === 'peace') && s2.evts.some((e) => e.kind === 'collapse'), 'evts=' + s2.evts.map((e) => e.kind).join(','));
      ck(c.name, s2.draws === 0, 'draws=' + s2.draws);
      ck(c.name, F(last.rel[0][1]) === -5, 'rel=' + F(last.rel[0][1]));
      break;
    }
    case 'escalate-total': {
      const s2 = c.steps[2];
      ck(c.name, s2.totalWars.length === 1 && s2.warData[0].total === true, 'tw=' + s2.totalWars.length);
      ck(c.name, s2.warData[0].reason === 'annex' && s2.warData[0].reasonText.includes('灭国战争'), 'reason=' + s2.warData[0].reason);
      ck(c.name, s2.evts.some((e) => e.kind === 'totalwar'), 'evts=' + s2.evts.map((e) => e.kind).join(','));
      ck(c.name, s2.warData[0].giveUpAt === 2400 + 3600, 'giveUpAt=' + s2.warData[0].giveUpAt);
      break;
    }
    case 'silence-950': {
      const s2 = c.steps[2];
      ck(c.name, s2.warData.length === 0, 'wd=' + s2.warData.length);
      ck(c.name, s2.draws === 0, 'draws=' + s2.draws);
      ck(c.name, s2.evts.some((e) => e.kind === 'peace' && e.text.includes('劳师糜饷')), 'peace=' + (s2.evts.find((e) => e.kind === 'peace') || {}).text);
      break;
    }
    case 'settle-front': {
      const s3 = c.steps[3];
      ck(c.name, s3.tilesN[0] === 4 && s3.tilesN[1] === 4, 'tilesN=' + s3.tilesN);  // 败方 stale 项保留（claimTile 只 push）
      ck(c.name, s3.occ.length === 0, 'occ=' + s3.occ.length);
      ck(c.name, s3.frontierN[0] === 2, 'frontier0=' + s3.frontierN[0]);  // 邻接 x±1 已有主（civ0/civ1）——仅 y±1 两格入 frontier
      ck(c.name, s3.draws === 1, 'draws=' + s3.draws);   // 摩擦 0.5 抽
      ck(c.name, s3.evts.some((e) => e.kind === 'occupy') && s3.evts.some((e) => e.kind === 'peace'), 'evts=' + s3.evts.map((e) => e.kind).join(','));
      ck(c.name, s3.tension.length === 1 && Math.abs(F(s3.tension[0][1]) - 2) < 1e-12, 'tension=' + (s3.tension[0] && F(s3.tension[0][1])));
      ck(c.name, s3.dirtyN === 5, 'dirty=' + s3.dirtyN);
      break;
    }
    case 'warkill-sig': {
      const s1 = c.steps[1];
      const wa0 = F(s1.warData[0].wearA), wb0 = F(s1.warData[0].wearB);
      ck(c.name, Math.abs(wa0 - 2.2) < 1e-12 && Math.abs(wb0 - 2.2) < 1e-12, 'wear0=' + wa0 + '/' + wb0);
      ck(c.name, s1.warData[0].sigMark === 0, 'sigMark0=' + s1.warData[0].sigMark);
      const s4 = c.steps[4];
      const wa = F(s4.warData[0].wearA), wb = F(s4.warData[0].wearB);
      ck(c.name, Math.abs(wa - 2.2) < 1e-12 && Math.abs(wb - 5.6) < 1e-12, 'wear=' + wa + '/' + wb);
      const s5 = c.steps[5];
      const wa2 = F(s5.warData[0].wearA), wb2 = F(s5.warData[0].wearB);
      ck(c.name, Math.abs(wa2 - 4.4) < 1e-12 && Math.abs(wb2 - 7.8) < 1e-12, 'wear2=' + wa2 + '/' + wb2);
      ck(c.name, s4.warData[0].sigMark === 2, 'sigMark=' + s4.warData[0].sigMark);
      break;
    }
    case 'backfill-dead': {
      const s1 = c.steps[1];
      ck(c.name, s1.warData.length === 1 && s1.warData[0].aggressor === 2, 'agg=' + (s1.warData[0] || {}).aggressor);
      ck(c.name, s1.statWars === 1, 'statWars=' + s1.statWars);
      const s4 = c.steps[4];
      ck(c.name, s4.warData.length === 1 && s4.warData[0].key === '0-2', 'wd=' + s4.warData.length);
      ck(c.name, s4.draws === 0, 'draws=' + s4.draws);
      break;
    }
  }
}
console.log(bad === 0 ? 'ALL ACTIVATION OK' : bad + ' FAILURES');
