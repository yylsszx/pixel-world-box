// 诊断脚本 v3：完整复刻 @tailwindcss/postcss 生产路径
//   compile(不优化) -> @tailwindcss/node optimize({minify:true}) -> postcss.parse
// 失败时把完整压缩产物写入 /home/z/tw-minified.css 并打印出错点上下文。
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
import { optimize } from '@tailwindcss/node';
import fs from 'node:fs';

const file = '/home/z/my-project/src/app/globals.css';
const css = fs.readFileSync(file, 'utf8');

// 1. 正常编译（optimize:false 路径，产物 = 完整合法 CSS）
const r = await postcss([tailwind({ optimize: false })]).process(css, { from: file });
console.log('step1 compile OK, len:', r.css.length);

// 2. Lightning CSS 优化+压缩（复刻插件生产路径）
const out = optimize(r.css, { minify: true });
console.log('step2 optimize OK, code len:', out.code.length, 'warnings:', out.warnings?.length ?? 0);
fs.writeFileSync('/home/z/tw-minified.css', out.code);

// 3. postcss 重新解析（构建炸在这一步）
try {
  postcss.parse(out.code);
  console.log('step3 parse OK —— 未复现，错误依赖候选集差异');
} catch (e) {
  console.log('step3 PARSE ERROR:', e.message);
  if (e.input) {
    console.log('line:', e.input.line, 'column:', e.input.column);
    const src = out.code;
    const line1 = src.split('\n')[0];
    const off = (e.input.line === 1 ? 0 : line1.length + 1) + e.input.column;
    console.log('=== 350 chars BEFORE error ===');
    console.log(src.slice(Math.max(0, off - 350), off));
    console.log('>>> ERROR IS HERE <<<');
    console.log(src.slice(off, off + 150));
  }
}
