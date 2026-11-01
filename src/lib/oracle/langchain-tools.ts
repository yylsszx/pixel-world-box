// ============ 神谕 LangChain 工具适配层 ============
// 把 src/lib/oracle/tools.ts 中的 AGENT_TOOLS 转为 LangChain 工具定义。
// 注意：服务端无活引擎实例，这里只负责“工具名 + 描述 + 参数 Schema”输出，
// 供 LangChain ChatModel 做 tool_calls 决策；真正的执行仍在前端 gameStore 引擎上完成。
import { DynamicTool } from '@langchain/core/tools';
import { z } from 'zod';
import { AGENT_TOOLS, type ToolDef } from './tools';

/** 把 ToolDef.args 转为 Zod schema */
function argsToZod(args: Record<string, import('./tools').ToolArgDef>): z.ZodTypeAny {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const [name, arg] of Object.entries(args)) {
    let base: z.ZodTypeAny;
    switch (arg.type) {
      case 'string':
        base = arg.enum ? z.enum(arg.enum as [string, ...string[]]) : z.string();
        break;
      case 'number':
        base = z.number();
        break;
      case 'boolean':
        base = z.boolean();
        break;
      case 'string[]':
        base = z.array(z.string());
        break;
      case 'object':
        base = z.record(z.string(), z.any());
        break;
      default:
        base = z.string();
    }
    shape[name] = arg.required ? base : base.optional();
  }
  return z.object(shape);
}

/** 把 AGENT_TOOLS 渲染为 LangChain 风格的工具说明文本（注入 System Prompt） */
export function renderLangChainToolCatalog(): string {
  return AGENT_TOOLS.map((t) => {
    const args = Object.entries(t.args).map(([n, a]) => {
      const t2 = a.enum ? a.enum.join('|') : a.type;
      return `${n}${a.required ? '' : '?'}:${t2}`;
    });
    return `- ${t.name}(${args.join(', ')}): ${t.desc}`;
  }).join('\n');
}

/** 构建 LangChain DynamicTool 列表（服务端仅用于定义，func 返回标记供前端执行） */
export function buildLangChainTools(): DynamicTool[] {
  return AGENT_TOOLS.map((t) => {
    return new DynamicTool({
      name: t.name,
      description: t.desc,
      func: async (input: string) => {
        // 服务端无活引擎，返回结构化标记，由前端真实执行
        return JSON.stringify({ __tool_call__: true, name: t.name, args: input });
      },
    });
  });
}