// ============ 共享沙箱执行器（Task 57 · 一切皆插件的统一运行时） ============
// run_script（L7 根权限）/ 插件工具（register_plugin 铸造）/ Mod 钩子（install_mod 安装）
// 三者共用同一沙箱纪律与辅助函数——「同一台虚拟机，同一种 bash」：
//   · 形参 (eng, W, H, args, raceId, byRace)：eng=引擎实例、W/H=世界尺寸、args=调用参数；
//   · 内置辅助 raceId('sheep')→数字 id / byRace('绵羊')→该种族全部存活单位
//     （u.race 是数字 id 不是名字——模型脚本最常犯的领域陷阱，辅助函数治本）；
//   · 静态拒绝 while(true)/for(;;)；执行错误附带「常用引擎 API 速查」让 LLM 自我修复。
import type { GameEngine } from './engine';
import { resolveRace } from './agentLaws';
import { W, H } from './constants';
import type { Unit } from './types';

/** 沙箱辅助函数（raceId/byRace 与 run_script v8 同款） */
export function makeSandboxHelpers(eng: GameEngine) {
  const raceId = (name: unknown): number => {
    try {
      const r = resolveRace(String(name));
      return typeof r === 'number' ? r : -1;
    } catch {
      return -1;
    }
  };
  const byRace = (name: unknown): Unit[] => eng.units.filter((u) => !u.dead && u.race === raceId(name));
  return { raceId, byRace };
}

/** 静态纪律检查（返回错误文案；null=通过） */
export function validateSandboxScript(script: string, maxLen: number): string | null {
  if (!script.trim()) return '脚本为空';
  if (script.length > maxLen) return `脚本过长（${script.length} > ${maxLen} 字符）`;
  if (/while\s*\(\s*(true|1)\s*\)|for\s*\(\s*;;/.test(script)) return '检测到死循环模式（while(true)/for(;;)）——禁止';
  return null;
}

/** LLM 自我修复用的引擎 API 速查（执行错误时附带） */
export const SANDBOX_CHEATSHEET =
  '常用引擎速记：eng.units 全部单位（u.dead/u.hp/u.race 数字id）；eng.civs 王国；eng.terrain[i] 地形（i=y*W+x）；eng.setTerrain(i,t)；eng.nuke(x,y,power)；eng.yearF 纪年；W=256 H=160；辅助 raceId("sheep")/byRace("绵羊")；参数从 args.x 取（不是裸 x）';

/** 执行一段沙箱脚本；永不吞错——错误消息带速查表（模型可据此自我修复） */
export function runSandbox(
  eng: GameEngine,
  script: string,
  args: Record<string, unknown> | undefined,
  maxLen: number,
): unknown {
  const invalid = validateSandboxScript(script, maxLen);
  if (invalid) throw new Error(invalid);
  const { raceId, byRace } = makeSandboxHelpers(eng);
  const fn = new Function(
    'eng', 'W', 'H', 'args', 'raceId', 'byRace',
    '"use strict";\n' + script,
  ) as (e: GameEngine, w: number, h: number, a: Record<string, unknown>, rid: (n: unknown) => number, br: (n: unknown) => Unit[]) => unknown;
  try {
    return fn(eng, W, H, args ?? {}, raceId, byRace);
  } catch (e) {
    throw new Error(`脚本执行出错：${e instanceof Error ? e.message : String(e)}。${SANDBOX_CHEATSHEET}`);
  }
}
