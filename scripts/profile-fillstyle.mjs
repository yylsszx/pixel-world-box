// GC 第二刀修前画像：fillStyle 赋值计数按串归因（5s 窗口 ×2 采样）
// 用法: bun scripts/profile-fillstyle.mjs <duration_ms>
const dur = parseInt(process.argv[2] || '5000', 10);

async function main() {
  const { default: agentBrowser } = await import('agent-browser');
  await agentBrowser.navigate('http://localhost:3000');
  await agentBrowser.wait(2500);

  const r = await agentBrowser.eval(`(async () => {
    // 进世界（标题屏须先点进入）
    const btn = document.querySelector('button');
    const enterBtn = [...document.querySelectorAll('button')].find(b => /进入/.test(b.textContent || ''));
    if (enterBtn) { enterBtn.click(); await new Promise(r => setTimeout(r, 1500)); }
    const e = window.__wbEngine;
    if (!e) return { err: 'no engine' };
    // 20 倍速
    e.speed = 20;
    // 包装 fillStyle setter 计数（原型上 defineProperty 一次）
    const proto = Object.getPrototypeOf(e.__ctx || null) || CanvasRenderingContext2D.prototype;
    // 直接在主 canvas ctx 上包装：从引擎拿 ctx 不一定可访问，改为包装原型 setter 统计所有 ctx
    let counting = false;
    const counts = new Map();
    if (!window.__fsHooked) {
      const desc = Object.getOwnPropertyDescriptor(CanvasRenderingContext2D.prototype, 'fillStyle');
      Object.defineProperty(CanvasRenderingContext2D.prototype, 'fillStyle', {
        get: desc.get,
        set(v) {
          if (counting) counts.set(v, (counts.get(v) || 0) + 1);
          desc.set.call(this, v);
        },
        configurable: true,
      });
      window.__fsHooked = true;
      window.__fsCounts = counts;
      window.__fsCounting = () => counting;
    } else {
      // 复用已挂钩子（二次运行）；counts 引用 window.__fsCounts
    }
    const C = window.__fsCounts;
    C.clear();
    counting = true;
    const t0 = performance.now();
    await new Promise(r => setTimeout(r, ${dur}));
    counting = false;
    const total = [...C.values()].reduce((a, b) => a + b, 0);
    const top = [...C.entries()].sort((a, b) => b[1] - a[1]).slice(0, 18)
      .map(([s, n]) => [s.slice(0, 40), n]);
    const uniq = C.size;
    return { total, uniq, perSec: Math.round(total / (${dur} / 1000)), top, units: e.units.length, frame: e.frameCount };
  })()`);
  console.log(JSON.stringify(r, null, 1));
  await agentBrowser.close();
}
main().catch(e => { console.error('FAIL', e.message); process.exit(1); });
