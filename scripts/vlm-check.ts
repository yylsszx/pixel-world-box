import ZAI from 'z-ai-web-dev-sdk';
import fs from 'fs';

const [,, prompt, ...imgs] = process.argv;
async function main() {
  const zai = await ZAI.create();
  const content: any[] = [{ type: 'text', text: prompt }];
  for (const p of imgs) {
    const b64 = fs.readFileSync(p).toString('base64');
    content.push({ type: 'image_url', image_url: { url: `data:image/png;base64,${b64}` } });
  }
  const r = await zai.chat.completions.createVision({ messages: [{ role: 'user', content }], thinking: { type: 'disabled' } });
  console.log(r.choices[0]?.message?.content);
}
main().catch(e => { console.error('ERR', e.message); process.exit(1); });
