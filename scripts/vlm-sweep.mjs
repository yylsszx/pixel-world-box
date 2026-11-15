// VLM 全截图内容分类（#102 标定配套）：glm-4.5v 逐张问答 → research/vlm-classify.json
import ZAI from 'z-ai-web-dev-sdk';
import fs from 'fs';

const SRC = '/home/z/my-project/research/worldbox-shots';
const OUT = '/home/z/my-project/research/vlm-classify.json';
const PROMPT = `这是 SuperWorldBox（WorldBox）官方宣传截图。请严格按以下格式回答（中文，简洁）：
1) 场景: [战斗/城市/自然风光/菜单UI/混合]
2) 镜头: [近景(单位大而清晰)/中景/远景(大范围地图)]
3) 可辨识元素（把能认出的都列上）: [人类/精灵/矮人/兽人/绵羊/狼/熊/马/鸡/其他动物/树/房屋/城堡/塔/船/桥/ UI面板 等]
4) 画面中数量最多的小型单位大概是什么、约多少个
5) 是否有清晰的单个单位特写（适合测量尺寸的）: [有(哪个位置)/无]`;

async function main() {
  const zai = await ZAI.create();
  const out = {};
  const files = fs.readdirSync(SRC).filter(f => f.endsWith('.png')).sort();
  for (const f of files) {
    const b64 = fs.readFileSync(`${SRC}/${f}`).toString('base64');
    try {
      const r = await zai.chat.completions.createVision({
        model: 'glm-4.5v',
        messages: [{ role: 'user', content: [
          { type: 'text', text: PROMPT },
          { type: 'image_url', image_url: { url: `data:image/png;base64,${b64}` } },
        ] }],
        thinking: { type: 'disabled' },
      });
      out[f] = r.choices[0]?.message?.content ?? '';
      console.error(f, 'done');
    } catch (e) {
      out[f] = 'ERR: ' + e.message;
      console.error(f, 'ERR', e.message);
    }
    fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
  }
  console.error('ALL DONE');
}
main().catch(e => { console.error('FATAL', e.message); process.exit(1); });
