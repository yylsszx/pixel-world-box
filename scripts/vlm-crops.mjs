// VLM 认 13 号裁剪精灵：物种 + 像素洁净度
import ZAI from 'z-ai-web-dev-sdk';
import fs from 'fs';

const DIR = '/home/z/my-project/research/crops';
const files = fs.readdirSync(DIR).filter(f => f.startsWith('13-')).sort().slice(0, 14);
const PROMPT = `下面是同一张 WorldBox 截图里裁出并放大 8 倍的不同精灵（编号按顺序 1..N）。
请逐个回答，格式严格为：
编号: [物种名] | 像素块: [干净均匀(整齐的方块像素) / 轻微模糊 / 明显模糊] | 备注
物种名选项：人类/僵尸/绵羊/其他动物/树/灌木/房屋/城堡/塔/船/UI元素/其他(说明)
最后一行总结：这些精灵的像素艺术密度如何（每个精灵大约由多少像素宽×高组成）。`;

async function main() {
  const zai = await ZAI.create();
  const content = [{ type: 'text', text: PROMPT }];
  for (const f of files) {
    const b64 = fs.readFileSync(`${DIR}/${f}`).toString('base64');
    content.push({ type: 'image_url', image_url: { url: `data:image/png;base64,${b64}` } });
  }
  const r = await zai.chat.completions.createVision({
    model: 'glm-4.5v',
    messages: [{ role: 'user', content }],
    thinking: { type: 'disabled' },
  });
  console.log(r.choices[0]?.message?.content);
}
main().catch(e => { console.error('ERR', e.message); process.exit(1); });
