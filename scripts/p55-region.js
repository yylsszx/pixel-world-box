// #55：运行时 dump arena 区域表（id→绝对字节区间），标注哪些区域落在给定页内
(function () {
  const WBB = window.__wbBatchCore, ex = WBB.ex;
  if (!ex) return 'NO EX';
  const base = ex.wb_arena_ptr();
  const names = { UX:0,UY:1,UPANIC:2,GVALS:3,UCIV:4,URACE:5,UID:6,UCELL:7,GIDS:8,RACE_FLAGS:11,DYN_PARENT:12,ATWAR:13,UDEAD:14,UHASPANIC:15,RESULT:16,UTX:18,UTY:19,UHP:20,UMAXHP:21,UDMG:22,USPEED:23,UAGE:24,UMAXAGE:25,UKILLS:26,UCD:27,UFD:28,UBREATH:29,ULX:30,ULY:31,USXK:32,USYK:33,USTK:34,UATK:35,UCHILL:36,UFLEET:37,UBLESS:38,UCURSE:39,UFERT:40,UDETOUR:41,UHURT:42,UJOB:43,UTRAIT:44,UINF:45,UFLIP:46,UPAR:47,UBOAT:48,UBTL:49,UCVN:50,UARMY:51,UGEAR:52,UGENE:53,UFAM:54,UFGN:55,UNAME:56,UGLN:57,UGIDS:58,UGVAL:59,TERR:60,FIREG:61,RAD:62,ROAD:63,BLDK:64,OWN:65,CIVN:67,CVPOP:68,CVHOU:69,CVGLD:70,CVCAP:71,CVAL:72,CVGOV:73,CVTECH:74,CVDIR:75,CVPC:76,CVMKT:77,FAMN:78,FMID:79,FMRACE:80,FMNUM:81,FMSEQ:82,FMNAME:83,BLDN:84,BLDI:85,BLDXY:86,BLDC:87,BLDHP:88,BLDDMG:89,ITMN:90,ITMK:91,ITMXY:92,NEUW:93,NCTL:94,RNGS:95,TICK:96,FRAME:97,PAR:98,USEQ:99,EPS:100,LAWS:101,FXP:102,FXLEN:103,FXMIN:104,FXMINN:105,WILD:106,GRASS:107,DAYPH:108,REPRM:109,PREY:110,SPB:111,SPBH:112,TRN:113,TRDMG:114,TRHP:115,TRSPD:116,TRREG:117,TRFL:118,CNT:119,ACT:120,ACTN:121,BAILK:122,BAILS:123,BAILL:124,BAILP:125,DIRTY:126,DLIST:127,DLISTN:128,BATCHR:129,TBR:130,TBF:131,TBJ:132,TBI:133,TBIN:134,FRSTOFF:135,FRSTN:136,FRSTP:137,FAMP:138,TBT:139,MLOOT:140,NEUCALL:141,COLEN:142,DMGL:143,DMGN:144,FIREN:145,WILDCAP:146,MONCAP:147,MISC:148,TBHP:149,GUNBM:150,BEAMBM:151 };
  const rows = [];
  for (const [name, id] of Object.entries(names)) {
    const off = base + ex.wb_off(id);
    rows.push({ name, id, off });
  }
  rows.sort((a, b) => a.off - b.off);
  for (let i = 0; i < rows.length; i++) rows[i].end = i + 1 < rows.length ? rows[i + 1].off : (base + ex.memory.buffer.byteLength);
  const total = ex.memory.buffer.byteLength;
  const page = 65536;
  const pg = typeof PAGE58 !== 'undefined' ? PAGE58 : 58;
  const p0 = pg * page, p1 = p0 + page;
  const hit = rows.filter(r => r.off < p1 && r.end > p0).map(r => r.name + '[' + (r.off - base) + ',' + (r.end - base) + ')');
  window.__p55regions = rows;
  return JSON.stringify({ total, base, page: pg, pRangeAbs: [p0, p1], hit: hit.slice(0, 24), nRegions: rows.length });
})()
