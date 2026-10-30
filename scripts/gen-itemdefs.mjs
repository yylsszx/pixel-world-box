import { writeFileSync } from 'node:fs';
import { createJiti } from 'jiti';
const jiti = createJiti(import.meta.url, { alias: { '@': '/home/z/my-project/src' } });
const { ITEM_DEFS, SLOT_FIELD, RARITY_META } = await jiti.import('/home/z/my-project/src/lib/game/items.ts');
const lines = [];
lines.push('        // ---------------- ITEM_DEFS 消费切片（items.ts TABLE 全表机械转写 —— tryPickup 换装链消费：slot/rank/rarity/name/dmg/hp/speedMul） ----------------');
lines.push('        public sealed class WbItemDef');
lines.push('        {');
lines.push('            public string key, name, slot;');
lines.push('            public int rank, rarity;');
lines.push('            public double dmg, hp, speedMul;');
lines.push('            public WbItemDef(string key, string name, string slot, int rank, int rarity, double dmg = 0, double hp = 0, double speedMul = 0)');
lines.push('            { this.key = key; this.name = name; this.slot = slot; this.rank = rank; this.rarity = rarity; this.dmg = dmg; this.hp = hp; this.speedMul = speedMul; }');
lines.push('        }');
lines.push('        public static readonly System.Collections.Generic.Dictionary<string, WbItemDef> ItemDefs = new System.Collections.Generic.Dictionary<string, WbItemDef>');
lines.push('        {');
for (const [k, d] of Object.entries(ITEM_DEFS)) {
  lines.push('            { "' + k + '", new WbItemDef("' + k + '", "' + d.name + '", "' + d.slot + '", ' + d.rank + ', ' + d.rarity + ', ' + (d.dmg ?? 0) + ', ' + (d.hp ?? 0) + ', ' + (d.speedMul ?? 0) + ') },');
}
lines.push('        };');
lines.push('        public static readonly System.Collections.Generic.Dictionary<string, string> SlotField = new System.Collections.Generic.Dictionary<string, string>');
lines.push('        {');
for (const [k, v] of Object.entries(SLOT_FIELD)) lines.push('            { "' + k + '", "' + v + '" },');
lines.push('        };');
lines.push('        public static readonly string[] RarityNames = { ' + RARITY_META.map(r => '"' + r.name + '"').join(', ') + ' };');
writeFileSync('/tmp/itemdefs.cs', lines.join('\n'));
console.log('rows:', Object.keys(ITEM_DEFS).length);
