'use client';
// ============ 神谕速启按钮（Task 55 · OpenAI intelligent UI 式内联 AI 动作） ============
// 一等公民原语：任何面板/卡片/菜单都能一行接入神谕——
//   <OracleAskBtn prompt="分析这个王国" icon={Crown} label="神谕诊断" />
// 点击 → oraclePending 注入 + openOracle()（神谕面板自动以对应模式发送该指令）。
// 尺寸三档：sm（行内）/ icon（纯图标）/ row（整行卡片）。
import { useCallback } from 'react';
import { useGameStore } from '@/store/gameStore';
import { sfx } from '@/lib/game/sfx';
import type { LucideIcon } from 'lucide-react';
import { Sparkles } from 'lucide-react';

export function OracleAskBtn({
  prompt,
  label,
  icon: Icon = Sparkles,
  size = 'sm',
  title,
  className = '',
}: {
  /** 注入神谕的完整指令（自带上下文，神谕零猜测直达目标） */
  prompt: string;
  /** 按钮文案（icon 档不显示） */
  label?: string;
  icon?: LucideIcon;
  size?: 'sm' | 'icon' | 'row';
  title?: string;
  className?: string;
}) {
  const setOraclePending = useGameStore((s) => s.setOraclePending);
  const openOracle = useGameStore((s) => s.openOracle);

  const onClick = useCallback(() => {
    sfx.ui('open');
    setOraclePending(prompt);
    openOracle();
  }, [prompt, setOraclePending, openOracle]);

  if (size === 'icon') {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={title ?? label ?? '询问神谕'}
        title={title ?? label ?? '询问神谕'}
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-sm border border-fuchsia-400/40 bg-fuchsia-400/10 text-fuchsia-300 transition-colors hover:border-fuchsia-300 hover:bg-fuchsia-400/25 hover:text-fuchsia-100 ${className}`}
      >
        <Icon className="h-3 w-3" aria-hidden />
      </button>
    );
  }
  if (size === 'row') {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={title ?? label ?? '询问神谕'}
        title={title ?? prompt}
        className={`flex w-full items-center gap-1.5 rounded-sm border-2 border-fuchsia-400/30 bg-fuchsia-400/5 px-2 py-1.5 text-left text-[10px] font-bold text-fuchsia-200 transition-colors hover:border-fuchsia-400/60 hover:bg-fuchsia-400/15 ${className}`}
      >
        <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span className="min-w-0 flex-1 truncate">{label ?? '询问神谕'}</span>
        <Sparkles className="h-3 w-3 shrink-0 opacity-60" aria-hidden />
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={title ?? label ?? '询问神谕'}
      title={title ?? prompt}
      className={`flex h-6 shrink-0 items-center gap-1 rounded-sm border border-fuchsia-400/40 bg-fuchsia-400/10 px-1.5 text-[9px] font-bold text-fuchsia-300 transition-colors hover:border-fuchsia-300 hover:bg-fuchsia-400/25 hover:text-fuchsia-100 ${className}`}
    >
      <Icon className="h-3 w-3 shrink-0" aria-hidden />
      {label && <span className="max-w-24 truncate">{label}</span>}
    </button>
  );
}

/** 预设上下文指令构造器（各面板注入实况上下文用——保持指令自包含） */
export const oracleCtx = {
  unit: (id: number, name: string) =>
    `用 get_unit/get_unit_brain 深入检视单位 ${name}（id:${id}）：属性、装备、神经状态、社会关系与家族，然后给出一段它的「英雄志」评传与命运预言。`,
  unitEnhance: (id: number, name: string) =>
    `强化单位 ${name}（id:${id}）：先 get_unit 看实况，再把它的生命与攻击拉到三倍、赐一个相称的新名字，然后跟随镜头锁定它。`,
  civ: (name: string) =>
    `诊断王国「${name}」：get_kingdom 看财政/军备/科技/稳定/战争实况，指出它当前最大的危机与机遇，并给出神谕的三条干预处方（等造物主点头再执行）。`,
  civWar: (name: string) =>
    `为王国「${name}」制定战争方略：get_kingdom 与 get_wars 看它与邻国的实力对比，选一个最值得开战的目标（含战争理由），但先陈述方略等造物主批准，不要直接宣战。`,
  world: () => '分析当前世界局势：列国力量平衡、进行中的战争、生态健康度与社会情绪，然后预言未来 50 年最可能发生的三件大事。',
  eco: () => '生态诊断：get_ecology 检查各物种种群与承载力，找出濒危与泛滥物种，给出一份生态干预方案（等造物主批准再执行）。',
  nature: () => '检视自然引擎实况（get_nature）：当前季节、风暴、板块应力与深时系统，然后做一次戏剧性的天气事件（你选最应景的）。',
  chronicle: () => '纵览近代世界史：get_chronicle 拉取最近 60 年大事，写一段编年史官风格的史书总结（有起承转合）。',
  race: () => '解读种族关系：get_races 查看各性格种族的关系矩阵与人口，指出最深的世仇与最铁的同盟，预言下一个融合奇点。',
  evo: () => '检视演化图谱（get_evo）：五系谱系最近发生了什么分化与融合？挑一个你最看好的新兴支系，助它一臂之力。',
  societal: () => '检视社会涌现（get_societal）：恐慌、血仇、家族三螺旋当前形态如何？哪里最可能爆发雪崩？给出预判。',
  neuro: () => '检视 NeuroCore（get_neuro）：战或逃头的训练水位与最近决策质量如何？讲讲这个世界的生物正在集体学会什么。',
  ww: () => '终极世界大战态势：get_world_war 看战况，为弱势方设计一场翻盘行动（先陈述方案等批准）。',
  triggers: () => '用 create_law 书写一条有意思的事件触发机制（你自己设计主题与触发器——要有戏剧性），写完汇报它的运转方式。',
};
