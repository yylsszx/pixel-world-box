// ============ WebAudio 音频系统 — 本地振荡器合成：SFX 库 + 环境生成式音乐，零资源文件 ============
import type { SoundKind } from './types';

/** UI 事件音类型（组件直接调用 sfx.ui()，不走世界音效通道） */
export type UiSoundKind = 'open' | 'close' | 'tab' | 'toggle';

/** 双通道音量（0-1）：master 总线 × sfx 音效通道 / music 音乐通道 */
export interface VolumeSettings {
  master: number;
  sfx: number;
  music: number;
}

/** 音乐情绪（引擎侧随昼夜/季节/战争/暂停调用 setMood；接口先就位供后续接线） */
export interface MoodSettings {
  /** 夜晚：只留和声垫，更稀疏更暗 */
  night?: boolean;
  /** 季节 0-3（春/夏/秋/冬）：根音移调 */
  season?: number;
  /** 战争：和声小调进行 + 拨弦密度加倍 + 根音下移 */
  war?: boolean;
  /** 暂停：master 渐出静音，但调度器不停（恢复即渐回） */
  paused?: boolean;
}

/** 音量持久化 key（JSON {master,sfx,music}） */
const VOL_KEY = 'wb_vol';
/** 音量缺省 */
const DEFAULT_VOLUMES: VolumeSettings = { master: 0.5, sfx: 0.8, music: 0.5 };

/** 同类音效节流间隔（毫秒），默认 90ms；成段的音乐性事件加长，防止快速重复叠成一团 */
const PLAY_THROTTLE: Partial<Record<SoundKind, number>> = {
  horn: 500,
  achieve: 300,
  era: 700,
  dragon: 500,
  shield: 250,
  coin: 90,
};

// ============ 环境音乐素材表（频率写死，全合成零素材） ============

/** 和平进行：Dorian 色彩的小进行（Dm → F → C → Am 感觉），每和弦 3 音 */
const PROG_CALM: number[][] = [
  [146.83, 174.61, 220.0], // Dm（D3 F3 A3）
  [174.61, 220.0, 261.63], // F（F3 A3 C4）
  [130.81, 196.0, 261.63], // C（C3 G3 C4）
  [110.0, 130.81, 164.81], // Am（A2 C3 E3）
];

/** 战争进行：和声小调色彩（E 和弦带 G# 导音）+ 空五度强力和弦，整体低沉 */
const PROG_WAR: number[][] = [
  [110.0, 130.81, 164.81], // Am（A2 C3 E3）
  [87.31, 130.81, 174.61], // F 空五度（F2 C3 F3）
  [82.41, 103.83, 164.81], // E（E2 G#2 E3 —— 和声小调特征导音）
  [110.0, 130.81, 164.81], // Am
];

/** 季节 → 根音移调（半音）：春 0 / 夏 +2 / 秋 -1 / 冬 -2 */
const SEASON_SHIFT: number[] = [0, 2, -1, -2];

/** 拨弦音池：D 小调五声音阶（D F G A C） */
const PENTATONIC: number[] = [146.83, 174.61, 196.0, 220.0, 261.63];

/** 读取持久化音量：损坏存档（非法 JSON / 非数值 / NaN）逐字段回默认 */
function loadVolumes(): VolumeSettings {
  const clamp = (x: unknown, d: number): number =>
    typeof x === 'number' && Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : d;
  try {
    const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(VOL_KEY);
    if (!raw) return { ...DEFAULT_VOLUMES };
    const v = JSON.parse(raw) as Partial<VolumeSettings> | null;
    return {
      master: clamp(v?.master, DEFAULT_VOLUMES.master),
      sfx: clamp(v?.sfx, DEFAULT_VOLUMES.sfx),
      music: clamp(v?.music, DEFAULT_VOLUMES.music),
    };
  } catch {
    return { ...DEFAULT_VOLUMES }; // 整条损坏：整体回默认
  }
}

/**
 * 音效设计（全部实时合成，走 sfxGain 通道）：
 * - boom    爆炸/陨石撞击：白噪声 + lowpass 衰减
 * - nuke    核爆：更长的低频噪声 + 次声轰鸣
 * - thunder 雷击：锯齿波瞬响（频率快速下滑）+ 噪声尾巴
 * - place   放置单位：短促方波两连音
 * - quake   地震：低频噪声隆隆
 * - heal    治疗：柔和上行琶音（正弦）
 * - volcano 火山 / blizzard 暴风雪 / tsunami 海啸：噪声塑形
 * - horn    战争号角：双支锯齿上滑齐鸣（110→220Hz）
 * - achieve 成就达成：明亮大调上行琶音（正弦 4 音）
 * - era     纪元跃迁：深沉钟声（正弦 + 泛音，长衰减 2s）
 * - dragon  巨龙咆哮：低频锯齿下滑（90→45Hz）+ 噪声粗化
 * - shield  护盾结界：正弦颤音（vibrato LFO）
 * - coin    拾取金币：双音方波叮当（高音短促两连）
 */
export class SfxEngine {
  /** AudioContext 懒创建：浏览器策略要求用户手势后才能出声 */
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  /** 双通道总线：sfxGain（音效）/ musicGain（音乐），都汇入 master */
  private sfxGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  /** 全局开关（默认开启，UI 可切换并持久化；外部直接赋值，播放/调度时被动检查） */
  enabled = true;
  /** 双通道音量（localStorage wb_vol 持久化，损坏容错回默认） */
  private volumes: VolumeSettings = loadVolumes();
  /** 同类音效节流表：8x 速度下大量爆炸时不至于爆音 */
  private lastPlay: Partial<Record<SoundKind | 'click' | `ui:${UiSoundKind}`, number>> = {};

  // ---- 环境音乐状态 ----
  /** 音乐总开关（startMusic 置位；AudioContext 尚未就绪时先记账，ensureInit 后自动起调） */
  private musicOn = false;
  /** lookahead 调度器句柄（250ms 轮询，排未来 ~600ms 内的音符） */
  private musicTimer: ReturnType<typeof setInterval> | null = null;
  /** 下一个和弦 / 拨弦的调度时点（ctx.currentTime 域） */
  private nextChordTime = 0;
  private nextPluckTime = 0;
  /** 和弦进行游标 */
  private chordIndex = 0;
  /** 已排音符账本（stopMusic 时统一释放） */
  private activeMusic: Array<{ src: AudioScheduledSourceNode; nodes: AudioNode[] }> = [];
  /** 音乐情绪（调度决策依据） */
  private mood: Required<MoodSettings> = { night: false, season: 0, war: false, paused: false };

  /** 用户手势后调用：创建 AudioContext（已存在则 resume） */
  ensureInit(): void {
    if (typeof window === 'undefined') return;
    if (!this.ctx) {
      const AC = window.AudioContext;
      if (!AC) return;
      this.ctx = new AC();
      // 双通道总线：sfxGain/musicGain → master → destination
      this.master = this.ctx.createGain();
      this.sfxGain = this.ctx.createGain();
      this.musicGain = this.ctx.createGain();
      this.sfxGain.connect(this.master);
      this.musicGain.connect(this.master);
      this.master.connect(this.ctx.destination);
      this.applyVolumes();
      // 音乐在 ctx 就绪前已被请求：现在补启动调度器
      if (this.musicOn) this.startScheduler();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  private ready(): boolean {
    return this.enabled && this.ctx !== null && this.ctx.state === 'running';
  }

  // ============ 双通道音量 API ============

  /** 设置音量（0-1，字段可选，缺省保持现值）：写 localStorage 并即时生效 */
  setVolumes(v: { master?: number; sfx?: number; music?: number }): void {
    if (!v) return;
    const clamp = (x: unknown, d: number): number =>
      typeof x === 'number' && Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : d;
    this.volumes = {
      master: clamp(v.master, this.volumes.master),
      sfx: clamp(v.sfx, this.volumes.sfx),
      music: clamp(v.music, this.volumes.music),
    };
    try {
      localStorage.setItem(VOL_KEY, JSON.stringify(this.volumes));
    } catch {
      /* 隐私模式等写入失败：仅本次会话生效 */
    }
    this.applyVolumes();
  }

  getVolumes(): VolumeSettings {
    return { ...this.volumes };
  }

  /** 把音量应用到节点（master 侧折算 enabled 全局静音与 paused 渐出） */
  private applyVolumes(): void {
    if (!this.ctx || !this.master || !this.sfxGain || !this.musicGain) return;
    const now = this.ctx.currentTime;
    this.sfxGain.gain.setTargetAtTime(this.volumes.sfx, now, 0.03);
    this.musicGain.gain.setTargetAtTime(this.volumes.music, now, 0.03);
    this.applyMasterGain();
  }

  /** master = 音量 ×（未全局静音 且 未暂停）；setTargetAtTime 实现渐出/渐回 */
  private applyMasterGain(): void {
    if (!this.ctx || !this.master) return;
    const target = this.enabled && !this.mood.paused ? this.volumes.master : 0;
    this.master.gain.setTargetAtTime(target, this.ctx.currentTime, 0.15);
  }

  // ============ 情绪接口 ============

  /** 音乐情绪（仅改状态，调度器下一轮生效；paused 渐出即时生效） */
  setMood(m: MoodSettings): void {
    if (!m) return;
    if (m.night !== undefined) this.mood.night = m.night;
    if (m.war !== undefined) {
      if (m.war !== this.mood.war) this.chordIndex = 0; // 切战争从主和弦重新起句
      this.mood.war = m.war;
    }
    if (m.paused !== undefined) this.mood.paused = m.paused;
    if (typeof m.season === 'number' && Number.isFinite(m.season)) {
      this.mood.season = ((Math.floor(m.season) % 4) + 4) % 4;
    }
    this.applyMasterGain();
  }

  getMood(): Required<MoodSettings> {
    return { ...this.mood };
  }

  // ============ 播放入口 ============

  /** 播放引擎上报的世界音效（走 sfxGain 通道） */
  play(kind: SoundKind): void {
    if (!this.ready()) return;
    // 同类音效节流：默认 90ms，音乐性事件按表加长（首次播放不节流）
    const now = performance.now();
    const last = this.lastPlay[kind];
    if (last !== undefined && now - last < (PLAY_THROTTLE[kind] ?? 90)) return;
    this.lastPlay[kind] = now;
    switch (kind) {
      case 'boom': this.boom(false); break;
      case 'nuke': this.boom(true); break;
      case 'thunder': this.thunder(); break;
      case 'place': this.place(); break;
      case 'quake': this.quake(); break;
      case 'heal': this.heal(); break;
      case 'volcano': this.volcano(); break;
      case 'blizzard': this.blizzard(); break;
      case 'tsunami': this.tsunami(); break;
      case 'horn': this.horn(); break;
      case 'achieve': this.achieve(); break;
      case 'era': this.era(); break;
      case 'dragon': this.dragon(); break;
      case 'shield': this.shield(); break;
      case 'coin': this.coin(); break;
    }
  }

  /** UI 事件音（组件直接调用，单独 60ms 节流，不走世界音效通道） */
  ui(kind: UiSoundKind): void {
    if (!this.ready()) return;
    const now = performance.now();
    const key = `ui:${kind}`;
    const last = this.lastPlay[key];
    if (last !== undefined && now - last < 60) return;
    this.lastPlay[key] = now;
    const t = this.ctx!.currentTime;
    switch (kind) {
      case 'open': // 上行双音
        this.blip(392, t, 0.09, 0.08);
        this.blip(587.33, t + 0.08, 0.1, 0.12);
        break;
      case 'close': // 下行双音
        this.blip(587.33, t, 0.09, 0.08);
        this.blip(392, t + 0.08, 0.12, 0.1);
        break;
      case 'tab': // 干脆滴
        this.blip(1567.98, t, 0.05, 0.07);
        break;
      case 'toggle': // 咔（频率骤降的短滴）
        this.blip(261.63, t, 0.045, 0.09, 150);
        break;
    }
  }

  /** UI 点击滴声（不走 90ms 世界节流，单独 60ms 节流） */
  click(): void {
    if (!this.ready()) return;
    const now = performance.now();
    const last = this.lastPlay.click;
    if (last !== undefined && now - last < 60) return;
    this.lastPlay.click = now;
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1250, t);
    osc.frequency.exponentialRampToValueAtTime(950, t + 0.05);
    gain.gain.setValueAtTime(0.16, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
    osc.connect(gain).connect(this.sfxGain!);
    osc.start(t);
    osc.stop(t + 0.08);
  }

  // ============ 环境生成式音乐（lookahead 调度器，走 musicGain 通道） ============

  /** 启动环境音乐（存在感极低的背景氛围，不是主题曲） */
  startMusic(): void {
    this.musicOn = true;
    this.ensureInit();
    this.startScheduler();
  }

  /** 停止环境音乐：清 interval + 已排音符快速淡出释放 */
  stopMusic(): void {
    this.musicOn = false;
    if (this.musicTimer) {
      clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
    const ctx = this.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    const dying = this.activeMusic;
    this.activeMusic = [];
    for (const rec of dying) {
      try {
        // 包络快速归零（已排过 stop 的节点二次 stop 会抛错，静音靠包络 + 稍后断链）
        for (const n of rec.nodes) {
          const p = (n as unknown as { gain?: AudioParam }).gain;
          if (p) {
            p.cancelScheduledValues(now);
            p.setTargetAtTime(0.0001, now, 0.03);
          }
        }
        rec.src.stop(now + 0.12);
      } catch {
        /* 该节点创建时已排定终点：包络归零已足够静音 */
      }
    }
    // 稍后断开图：即使包络被后续调度覆盖也不再出声
    setTimeout(() => {
      for (const rec of dying) {
        try {
          rec.src.disconnect();
          for (const n of rec.nodes) n.disconnect();
        } catch {
          /* 忽略已释放节点 */
        }
      }
    }, 300);
    // 相位归零：下次 startMusic 从头起句
    this.nextChordTime = 0;
    this.nextPluckTime = 0;
  }

  private startScheduler(): void {
    if (this.musicTimer || !this.ctx) return;
    const now = this.ctx.currentTime;
    if (this.nextChordTime <= 0) this.nextChordTime = now + 0.1; // 垫先行
    if (this.nextPluckTime <= 0) this.nextPluckTime = now + 1.5; // 拨弦稍晚，避免开场拥挤
    this.musicTimer = setInterval(() => this.musicTick(), 250);
  }

  /** lookahead 心跳：补齐未来 600ms 窗口内的音符 */
  private musicTick(): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    this.applyMasterGain(); // 被动同步 enabled 全局静音（外部直接改字段，无回调可用）
    const now = ctx.currentTime;
    const horizon = now + 0.6;
    // 长时间挂起后的追赶保护：错过太多的时点直接重排到眼前
    if (this.nextChordTime < now - 0.5) this.nextChordTime = now + 0.05;
    if (this.nextPluckTime < now - 0.5) this.nextPluckTime = now + 0.4;
    if (this.nextChordTime < horizon) {
      this.scheduleChord(this.nextChordTime);
      this.nextChordTime += this.chordDuration();
    }
    if (this.nextPluckTime < horizon) {
      if (!this.mood.night) this.schedulePluck(this.nextPluckTime); // 夜晚只留垫
      this.nextPluckTime += this.pluckRest();
    }
  }

  /** 当前和弦时长：和平 8s / 战争 6.5s（更不安）/ 夜晚 10s（更绵长） */
  private chordDuration(): number {
    return this.mood.war ? 6.5 : this.mood.night ? 10 : 8;
  }

  /** 拨弦休止：平均 3-6s 一音符；战争密度加倍（1.5-3s） */
  private pluckRest(): number {
    return this.mood.war ? 1.5 + Math.random() * 1.5 : 3 + Math.random() * 3;
  }

  /** 根音移调（半音 → 频率比）：季节移调 + 战争整体下移大二度 */
  private rootShift(): number {
    const semis = SEASON_SHIFT[this.mood.season] + (this.mood.war ? -2 : 0);
    return Math.pow(2, semis / 12);
  }

  /** 织体 1 · 和声垫：每和弦 3 只失谐锯齿/三角 → lowpass(800-1500Hz) → 缓起(2s)缓落(3s)包络 */
  private scheduleChord(t: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.musicGain) return;
    const prog = this.mood.war ? PROG_WAR : PROG_CALM;
    const chord = prog[this.chordIndex % prog.length];
    this.chordIndex++;
    const shift = this.rootShift();
    const dur = this.chordDuration();
    const peak = this.mood.night ? 0.04 : 0.04 + Math.random() * 0.03; // 0.04-0.07，存在感极低
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = this.mood.night ? 800 : 800 + Math.random() * 700;
    filter.Q.value = 0.6;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.linearRampToValueAtTime(peak, t + 2); // attack 2s
    env.gain.setValueAtTime(peak, t + dur);
    env.gain.linearRampToValueAtTime(0.0001, t + dur + 3); // release 3s（与下一和弦交叠）
    filter.connect(env);
    env.connect(this.musicGain);
    chord.forEach((f, i) => {
      const osc = ctx.createOscillator();
      osc.type = i % 2 === 0 ? 'sawtooth' : 'triangle'; // 锯齿与三角混排，更柔
      osc.frequency.value = f * shift;
      osc.detune.value = (Math.random() * 2 - 1) * 7; // ±7 音分微失谐
      osc.connect(filter);
      osc.start(t);
      osc.stop(t + dur + 3.05);
      this.trackMusic(osc, [filter, env]);
    });
  }

  /** 织体 2 · 稀疏拨弦：D 小调五声 triangle + 指数衰减（0.4-1.2s），随机八度点缀 */
  private schedulePluck(t: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.musicGain) return;
    const f = PENTATONIC[Math.floor(Math.random() * PENTATONIC.length)] * this.rootShift();
    const oct = [1, 1, 2, 2, 4][Math.floor(Math.random() * 5)]; // 偶尔高两个八度提亮
    const dur = 0.4 + Math.random() * 0.8;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = f * oct;
    gain.gain.setValueAtTime(0.06 + Math.random() * 0.04, t); // 0.06-0.1
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain);
    gain.connect(this.musicGain);
    osc.start(t);
    osc.stop(t + dur + 0.05);
    this.trackMusic(osc, [gain]);
  }

  /** 已排音符入账：自然结束时自动断链防泄漏 */
  private trackMusic(src: AudioScheduledSourceNode, nodes: AudioNode[]): void {
    const rec = { src, nodes };
    this.activeMusic.push(rec);
    src.onended = () => {
      try {
        src.disconnect();
        for (const n of nodes) n.disconnect();
      } catch {
        /* 忽略已释放节点 */
      }
      const i = this.activeMusic.indexOf(rec);
      if (i >= 0) this.activeMusic.splice(i, 1);
    };
  }

  // ============ SFX 合成（全部走 sfxGain 通道） ============

  /** 生成一段白噪声 buffer（复用 0.5s） */
  private noiseBuffer(): AudioBuffer {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * 0.5);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  /** 简短 UI 音符：正弦（可选频率骤降做「咔」质感） */
  private blip(f: number, st: number, dur: number, vol: number, fEnd?: number): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(f, st);
    if (fEnd !== undefined) osc.frequency.exponentialRampToValueAtTime(fEnd, st + dur);
    gain.gain.setValueAtTime(vol, st);
    gain.gain.exponentialRampToValueAtTime(0.0001, st + dur);
    osc.connect(gain).connect(this.sfxGain!);
    osc.start(st);
    osc.stop(st + dur + 0.02);
  }

  /** 爆炸：白噪声 + lowpass 滤波 + 指数衰减（核弹更长更深） */
  private boom(nuke: boolean): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const dur = nuke ? 1.1 : 0.45;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer();
    src.playbackRate.value = nuke ? 0.55 : 1;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(nuke ? 900 : 1800, t);
    filter.frequency.exponentialRampToValueAtTime(nuke ? 60 : 120, t + dur);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(nuke ? 0.7 : 0.5, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter).connect(gain).connect(this.sfxGain!);
    src.start(t);
    src.stop(t + dur + 0.05);
    // 核弹追加低频轰鸣层
    if (nuke) {
      const osc = ctx.createOscillator();
      const og = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(55, t);
      osc.frequency.exponentialRampToValueAtTime(24, t + 1.0);
      og.gain.setValueAtTime(0.5, t);
      og.gain.exponentialRampToValueAtTime(0.001, t + 1.0);
      osc.connect(og).connect(this.sfxGain!);
      osc.start(t);
      osc.stop(t + 1.05);
    }
  }

  /** 雷击：锯齿波瞬响（频率骤降）+ 短噪声尾巴 */
  private thunder(): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(1600, t);
    osc.frequency.exponentialRampToValueAtTime(90, t + 0.18);
    gain.gain.setValueAtTime(0.32, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    osc.connect(gain).connect(this.sfxGain!);
    osc.start(t);
    osc.stop(t + 0.24);
    // 噪声尾巴
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer();
    src.playbackRate.value = 0.8;
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 400;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.22, t + 0.05);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    src.connect(filter).connect(ng).connect(this.sfxGain!);
    src.start(t + 0.05);
    src.stop(t + 0.45);
  }

  /** 放置单位：短促方波两连音（低→高） */
  private place(): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    for (let k = 0; k < 2; k++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.value = k === 0 ? 620 : 880;
      const st = t + k * 0.07;
      gain.gain.setValueAtTime(0.12, st);
      gain.gain.exponentialRampToValueAtTime(0.001, st + 0.09);
      osc.connect(gain).connect(this.sfxGain!);
      osc.start(st);
      osc.stop(st + 0.1);
    }
  }

  /** 地震：低频噪声隆隆（bandpass 低频段） */
  private quake(): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer();
    src.playbackRate.value = 0.5;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(140, t);
    filter.frequency.exponentialRampToValueAtTime(60, t + 0.9);
    filter.Q.value = 1.2;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.5, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
    src.connect(filter).connect(gain).connect(this.sfxGain!);
    src.start(t);
    src.stop(t + 0.95);
  }

  /** 治疗：柔和上行琶音（正弦 3 音） */
  private heal(): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99]; // C5 E5 G5
    notes.forEach((f, k) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = f;
      const st = t + k * 0.08;
      gain.gain.setValueAtTime(0.1, st);
      gain.gain.exponentialRampToValueAtTime(0.001, st + 0.22);
      osc.connect(gain).connect(this.sfxGain!);
      osc.start(st);
      osc.stop(st + 0.24);
    });
  }

  /** 火山：深沉隆隆 + 高频喷发裂声（噪声双层） */
  private volcano(): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    // 深层隆隆（低频噪声）
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer();
    src.playbackRate.value = 0.4;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(200, t);
    filter.frequency.exponentialRampToValueAtTime(50, t + 1.4);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.6, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 1.5);
    src.connect(filter).connect(gain).connect(this.sfxGain!);
    src.start(t);
    src.stop(t + 1.55);
    // 岩浆喷发裂声（高频瞬响）
    const src2 = ctx.createBufferSource();
    src2.buffer = this.noiseBuffer();
    src2.playbackRate.value = 1.6;
    const f2 = ctx.createBiquadFilter();
    f2.type = 'highpass';
    f2.frequency.value = 900;
    const g2 = ctx.createGain();
    g2.gain.setValueAtTime(0.3, t + 0.15);
    g2.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
    src2.connect(f2).connect(g2).connect(this.sfxGain!);
    src2.start(t + 0.15);
    src2.stop(t + 0.85);
  }

  /** 暴风雪：风嚎（带通滤波噪声 + 频率摆动） */
  private blizzard(): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer();
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 2.5;
    // 风嚎：频率上下摆动模拟呼啸
    filter.frequency.setValueAtTime(600, t);
    filter.frequency.linearRampToValueAtTime(1400, t + 0.5);
    filter.frequency.linearRampToValueAtTime(700, t + 1.1);
    filter.frequency.linearRampToValueAtTime(1600, t + 1.6);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.001, t);
    gain.gain.linearRampToValueAtTime(0.28, t + 0.4);
    gain.gain.setValueAtTime(0.28, t + 1.2);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 2.0);
    src.connect(filter).connect(gain).connect(this.sfxGain!);
    src.start(t);
    src.stop(t + 2.05);
  }

  /** 海啸：巨浪拍岸（噪声涌起→轰然拍碎） */
  private tsunami(): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer();
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(300, t);
    filter.frequency.linearRampToValueAtTime(2200, t + 0.9); // 涌起：由沉到亮
    filter.frequency.exponentialRampToValueAtTime(90, t + 2.0); // 拍碎：轰然而下
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.001, t);
    gain.gain.linearRampToValueAtTime(0.55, t + 0.9);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 2.1);
    src.connect(filter).connect(gain).connect(this.sfxGain!);
    src.start(t);
    src.stop(t + 2.15);
  }

  /** 战争号角：双支锯齿上滑齐鸣（110→220Hz，第二支微失谐追入，号角感） */
  private horn(): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    for (let k = 0; k < 2; k++) {
      const st = t + k * 0.14;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const lp = ctx.createBiquadFilter();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(110 * (k === 1 ? 1.005 : 1), st); // 第二支微失谐
      osc.frequency.exponentialRampToValueAtTime(220, st + 0.5);
      lp.type = 'lowpass';
      lp.frequency.value = 1100; // 收掉锯齿毛刺，圆号质感
      gain.gain.setValueAtTime(0.001, st);
      gain.gain.linearRampToValueAtTime(0.2, st + 0.08);
      gain.gain.setValueAtTime(0.2, st + 0.45);
      gain.gain.exponentialRampToValueAtTime(0.001, st + 0.75);
      osc.connect(lp).connect(gain).connect(this.sfxGain!);
      osc.start(st);
      osc.stop(st + 0.8);
    }
  }

  /** 成就达成：明亮大调上行琶音（正弦 C5-E5-G5-C6，尾音延长） */
  private achieve(): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6
    notes.forEach((f, k) => {
      const last = k === notes.length - 1;
      const st = t + k * 0.09;
      const dur = last ? 0.55 : 0.22;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = f;
      gain.gain.setValueAtTime(last ? 0.16 : 0.11, st);
      gain.gain.exponentialRampToValueAtTime(0.001, st + dur);
      osc.connect(gain).connect(this.sfxGain!);
      osc.start(st);
      osc.stop(st + dur + 0.02);
    });
  }

  /** 纪元跃迁：深沉钟声（正弦 + 非谐泛音，低泛音衰减更慢，余韵 ~2s） */
  private era(): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const base = 130.81; // C3 钟基频
    const partials: Array<[number, number]> = [
      [1, 0.35],
      [2.0, 0.14],
      [2.98, 0.07],
      [4.2, 0.04],
    ];
    for (const [ratio, vol] of partials) {
      const dur = ratio === 1 ? 2.2 : Math.max(0.8, 2.2 - ratio * 0.25); // 高泛音先散
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = base * ratio;
      gain.gain.setValueAtTime(vol, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
      osc.connect(gain).connect(this.sfxGain!);
      osc.start(t);
      osc.stop(t + dur + 0.05);
    }
  }

  /** 巨龙咆哮：低频锯齿下滑（90→45Hz）+ 带通噪声粗化（喉音摩擦感） */
  private dragon(): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    // 低频锯齿咆哮主体
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const lp = ctx.createBiquadFilter();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(90, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + 1.3);
    lp.type = 'lowpass';
    lp.frequency.value = 500;
    gain.gain.setValueAtTime(0.001, t);
    gain.gain.linearRampToValueAtTime(0.4, t + 0.12);
    gain.gain.setValueAtTime(0.4, t + 0.9);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 1.4);
    osc.connect(lp).connect(gain).connect(this.sfxGain!);
    osc.start(t);
    osc.stop(t + 1.45);
    // 噪声粗化层
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer();
    src.loop = true;
    src.playbackRate.value = 0.6;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(300, t);
    bp.frequency.linearRampToValueAtTime(120, t + 1.2);
    bp.Q.value = 1.5;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.18, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 1.2);
    src.connect(bp).connect(ng).connect(this.sfxGain!);
    src.start(t);
    src.stop(t + 1.25);
  }

  /** 护盾结界：正弦颤音（5.5Hz LFO 调制载波频率，柔和起收） */
  private shield(): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 660;
    // vibrato LFO：频率 ±14Hz 摆动
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = 5.5;
    lfoGain.gain.value = 14;
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);
    gain.gain.setValueAtTime(0.001, t);
    gain.gain.linearRampToValueAtTime(0.14, t + 0.06);
    gain.gain.setValueAtTime(0.14, t + 0.5);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.75);
    osc.connect(gain).connect(this.sfxGain!);
    osc.start(t);
    osc.stop(t + 0.8);
    lfo.start(t);
    lfo.stop(t + 0.8);
  }

  /** 拾取金币：双音方波叮当（B5→E6 高音短促两连） */
  private coin(): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const freqs = [987.77, 1318.5]; // B5 → E6
    freqs.forEach((f, k) => {
      const st = t + k * 0.09;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.value = f;
      gain.gain.setValueAtTime(0.07, st); // 方波很响，音量压低
      gain.gain.exponentialRampToValueAtTime(0.001, st + 0.1);
      osc.connect(gain).connect(this.sfxGain!);
      osc.start(st);
      osc.stop(st + 0.12);
    });
  }
}

/** 全局单例（仅客户端使用） */
export const sfx = new SfxEngine();
