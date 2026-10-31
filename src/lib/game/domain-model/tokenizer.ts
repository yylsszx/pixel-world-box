// ============ DomainModel — 游戏领域分词器 ============
export interface TokenizerConfig {
  vocabSize: number;
  special: {
    pad: number; bos: number; eos: number; unk: number;
    civ: number; unit: number; terrain: number; event: number; war: number; action: number;
  };
}

export const DEFAULT_TOKENIZER_CONFIG: TokenizerConfig = {
  vocabSize: 32000,
  special: {
    pad: 0, bos: 1, eos: 2, unk: 3,
    civ: 100, unit: 101, terrain: 102, event: 103, war: 104, action: 105,
  },
};

export class DomainTokenizer {
  readonly config: TokenizerConfig;
  private idToToken: Map<number, string>;
  private tokenToId: Map<string, number>;

  constructor(config: TokenizerConfig = DEFAULT_TOKENIZER_CONFIG) {
    this.config = config;
    this.idToToken = new Map();
    this.tokenToId = new Map();
    this._initDomainVocab();
  }

  private _initDomainVocab() {
    const { special } = this.config;
    const specials: [string, number][] = [
      ['<pad>', special.pad], ['<bos>', special.bos], ['<eos>', special.eos], ['<|unk|>', special.unk],
      ['<CIV>', special.civ], ['<UNIT>', special.unit], ['<TERRAIN>', special.terrain],
      ['<EVENT>', special.event], ['<WAR>', special.war], ['<ACTION>', special.action],
    ];
    for (const [t, id] of specials) { this.idToToken.set(id, t); this.tokenToId.set(t, id); }

    let nextId = 200;
    const addWords = (words: string[]) => {
      for (const w of words) {
        if (nextId >= this.config.vocabSize - 100) break;
        this.idToToken.set(nextId, w);
        this.tokenToId.set(w, nextId);
        nextId++;
      }
    };
    addWords(['人类', '精灵', '矮人', '兽人', '蜥蜴人', '哥布林', '巨魔', '食人魔', '白行者', '吸血鬼']);
    addWords(['建国', '扩张', '宣战', '议和', '结盟', '建房', '科技', '灭国', '统一']);
    addWords(['步兵', '弓手', '法师', '骑士', '农民', '英雄', '怪物', '巨龙', '克拉肯', '沙虫', '蛇怪', '天使', '凤凰', '树人']);
    addWords(['深海', '浅海', '沙滩', '草原', '森林', '丘陵', '山地', '雪原', '岩浆', '焦土', '冰面', '沼泽']);
    addWords(['天灾', '战争', '建国', '灭国', '发现', '瘟疫', '火灾', '地震', '陨石', '海啸', '暴雪', '蝗灾', '干旱']);
    addWords(['移动', '攻击', '繁衍', '迁徙', '建造', '摧毁', '召唤', '治疗', '诅咒', '祝福']);

    for (let i = nextId; i < this.config.vocabSize; i++) {
      const tok = `<t${i}>`;
      this.idToToken.set(i, tok);
      this.tokenToId.set(tok, i);
    }
  }

  encode(text: string, maxLen?: number): Int32Array {
    const ids: number[] = [this.config.special.bos];
    const tokens = text.split(/[\s、,，。！!？?]+/).filter(Boolean);
    for (const t of tokens) {
      const id = this.tokenToId.get(t) ?? this.config.special.unk;
      ids.push(id);
    }
    ids.push(this.config.special.eos);
    if (maxLen && ids.length > maxLen) ids.length = maxLen;
    return new Int32Array(ids);
  }

  decode(ids: number[] | Int32Array): string {
    const parts: string[] = [];
    for (const id of ids) {
      const t = this.idToToken.get(id) ?? `<${this.config.special.unk}>`;
      if (t === '<eos>') break;
      if (t !== '<pad>' && t !== '<bos>') parts.push(t);
    }
    return parts.join(' ');
  }

  get vocabSize(): number { return this.config.vocabSize; }
  get bos(): number { return this.config.special.bos; }
  get eos(): number { return this.config.special.eos; }
  get pad(): number { return this.config.special.pad; }
}

export interface WorldStateSnapshot {
  year: number;
  civs: { name: string; race: string; pop: number; tiles: number; gold: number; tech: number; stability: number; wars: string[] }[];
  units: { race: string; hp: number; kills: number; x: number; y: number; civ?: string }[];
  terrain: { type: string; x: number; y: number }[];
  events: { kind: string; text: string; year: number }[];
}

export function encodeWorldState(snap: WorldStateSnapshot, tok: DomainTokenizer): Int32Array {
  const parts: string[] = [];
  parts.push(`<bos> 年:${snap.year}`);
  for (const c of snap.civs) {
    parts.push(`<CIV> ${c.name} 种族:${c.race} 人口:${c.pop} 领土:${c.tiles} 财富:${c.gold} 科技:${c.tech} 稳定:${c.stability}`);
    for (const w of c.wars) parts.push(`<WAR> 交战:${w}`);
  }
  for (const u of snap.units) {
    const civ = u.civ ? ` 文明:${u.civ}` : '';
    parts.push(`<UNIT> ${u.race} hp:${u.hp} 击杀:${u.kills} 坐标:(${u.x},${u.y})${civ}`);
  }
  for (const t of snap.terrain) parts.push(`<TERRAIN> ${t.type} 位置:(${t.x},${t.y})`);
  for (const e of snap.events) parts.push(`<EVENT> ${e.kind}:${e.text} 第${e.year}年`);
  parts.push('<eos>');
  return tok.encode(parts.join(' '));
}

export interface ModelAction {
  type: 'move' | 'attack' | 'declare_war' | 'make_peace' | 'spawn' | 'build' | 'cast' | 'wait';
  target?: string;
  params: Record<string, string | number>;
}

export function decodeModelAction(ids: number[] | Int32Array, tok: DomainTokenizer): ModelAction {
  const text = tok.decode(ids).trim();
  const params: Record<string, string | number> = {};
  let type: ModelAction['type'] = 'wait';
  let target: string | undefined;
  const mType = text.match(/^(移动|攻击|宣战|议和|生成|建造|施法|等待|wait)/);
  if (mType) {
    const t = mType[1];
    if (t === '移动') type = 'move';
    else if (t === '攻击') type = 'attack';
    else if (t === '宣战') type = 'declare_war';
    else if (t === '议和') type = 'make_peace';
    else if (t === '生成') type = 'spawn';
    else if (t === '建造') type = 'build';
    else if (t === '施法') type = 'cast';
    else type = 'wait';
  }
  const mTarget = text.match(/目标[:：]\s*(\S+)/);
  if (mTarget) target = mTarget[1];
  const mNum = text.match(/数值[:：]\s*(\d+)/);
  if (mNum) params.value = parseInt(mNum[1], 10);
  return { type, target, params };
}