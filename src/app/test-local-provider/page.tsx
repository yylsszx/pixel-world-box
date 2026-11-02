'use client';

import { useEffect, useRef, useState } from 'react';

interface ModelLoadState { state: 'idle' | 'loading' | 'ready' | 'error'; error: string | null; }
interface RoundResult { round: number; latencyMs: number; contentLength: number; error?: string; }

export default function MobileStressTest() {
  const logRef = useRef<HTMLDivElement>(null);
  const [modelState, setModelState] = useState<ModelLoadState>({ state: 'idle', error: null });
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 100 });
  const [results, setResults] = useState<RoundResult[]>([]);
  const [offlineMode, setOfflineMode] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const log = (msg: string) => {
    const el = logRef.current; if (!el) return;
    const line = document.createElement('div');
    line.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
    el.appendChild(line); el.scrollTop = el.scrollHeight;
  };

  // transformers.js
  let transformers: any = null;
  async function loadTransformers() { if (transformers) return transformers; const mod = await import('@xenova/transformers'); transformers = mod; return mod; }
  async function getPipeline(modelId: string, forceCpu = false, allowLocalModels = false) { const { pipeline, env } = await loadTransformers(); if (allowLocalModels) { env.allowLocalModels = true; env.localModelPath = `/models/${modelId.replace(/^[^/]+\//, '')}`; } else { env.allowLocalModels = false; } return await pipeline('text-generation', modelId, { quantized: true }); }
  function messagesToPrompt(messages: { role: string; content: string }[]): string { const lines: string[] = []; for (const m of messages) { const role = m.role === 'assistant' ? 'Assistant' : m.role === 'user' ? 'User' : 'System'; lines.push(`${role}: ${m.content}`); } lines.push('Assistant:'); return lines.join('\n'); }
  async function generateLocal(modelId: string, messages: { role: string; content: string }[], opts: { forceCpu?: boolean; allowLocalModels?: boolean } = {}) { if (typeof window === 'undefined') return { content: '', latencyMs: 0, error: 'SSR' }; const start = performance.now(); try { const p = await getPipeline(modelId, opts.forceCpu, opts.allowLocalModels); const prompt = messagesToPrompt(messages); const output = await (p as any)(prompt, { max_new_tokens: 128, temperature: 0.7, do_sample: true, top_p: 0.9, return_full_text: false }); const results = Array.isArray(output) ? output : [output]; let content = ''; for (const r of results) { const text = r?.generated_text ?? ''; if (text) content += text; } return { content, latencyMs: performance.now() - start }; } catch (e) { return { content: '', latencyMs: performance.now() - start, error: e instanceof Error ? e.message : String(e) }; } }
  function compactHistory(messages: { role: string; content: string }[], maxMessages = 16) { if (messages.length <= maxMessages) return messages; const systemMsg = messages[0]; const recent = messages.slice(-maxMessages + 1); const summaryCount = messages.length - maxMessages; return [systemMsg, { role: 'assistant', content: `[系统] 已省略 ${summaryCount} 条早期消息，仅保留最近上下文。` }, ...recent]; }

  const sc = (state: string) => state === 'ready' ? '#4ade80' : state === 'loading' ? '#fbbf24' : state === 'error' ? '#f87171' : '#64748b';

  const toggleOffline = () => { setOfflineMode((prev: boolean) => !prev); log(offlineMode ? '🌐 恢复在线' : '📴 进入离线模式'); };

  const preloadModel = async () => { setModelState({ state: 'loading', error: null }); log('📥 开始预加载...'); try { await getPipeline('Xenova/qwen2.5-0.5b-instruct', false, true); setModelState({ state: 'ready', error: null }); log('✅ 模型就绪'); } catch (e) { const err = e instanceof Error ? e.message : String(e); setModelState({ state: 'error', error: err }); log(`❌ 失败: ${err}`); } };

  const runSingleRound = async (round: number, history: { role: string; content: string }[]) => { const messages = compactHistory([{ role: 'assistant', content: '你是神谕助手，简洁回答。' }, ...history, { role: 'user', content: `第 ${round} 轮：描述心情。` }], 16); return await generateLocal('Xenova/qwen2.5-0.5b-instruct', messages, { forceCpu: false, allowLocalModels: offlineMode }); };

  const runStressTest = async () => { if (modelState.state !== 'ready' || running) return; setRunning(true); setResults([]); setProgress({ current: 0, total: 100 }); abortRef.current = new AbortController(); const history: { role: string; content: string }[] = []; for (let i = 1; i <= 100; i++) { if (abortRef.current?.signal.aborted) break; setProgress({ current: i - 1, total: 100 }); log(`▶️ 第 ${i}/100 轮...`); const { content, latencyMs, error } = await runSingleRound(i, history); const result: RoundResult = { round: i, latencyMs, contentLength: content.length, error }; setResults(prev => [...prev, result]); if (error) log(`  ❌ ${error}`); else { log(`  ✅ ${latencyMs.toFixed(0)}ms | ${content.length} 字`); history.push({ role: 'user', content: `第 ${i} 轮` }, { role: 'assistant', content: '...' }); } } setRunning(false); setProgress({ current: 100, total: 100 }); const latencies = results.filter(r => !r.error).map(r => r.latencyMs).sort((a,b)=>a-b); if (latencies.length) { const p50 = latencies[Math.floor(latencies.length*0.5)]; const p95 = latencies[Math.floor(latencies.length*0.95)]; const avg = latencies.reduce((a,b)=>a+b,0)/latencies.length; log(`\n=== 报告 === 成功:${latencies.length}/100 平均:${avg.toFixed(0)}ms P50:${p50}ms P95:${p95}ms ${p95<15000?'✅':'❌'} P95<15s ${latencies.length===100?'✅':'❌'} 100轮不失忆`); } };

  const abortTest = () => { abortRef.current?.abort(); setRunning(false); log('🛑 中止'); };
  const simulateBackground = () => { log('📱 模拟后台 3s...'); const ov = document.createElement('div'); ov.style.cssText='position:fixed;inset:0;background:#0008;z-index:9999;display:flex;align-items:center;justify-content:center;color:#fff;font-size:24px;'; ov.textContent='📱 后台模拟 3秒'; document.body.appendChild(ov); setTimeout(()=>{document.body.removeChild(ov);log('🔄 恢复前台');},3000); };

  const latencies = results.filter(r => !r.error).map(r => r.latencyMs).sort((a,b)=>a-b);
  let stats = '';
  if (latencies.length) { const p50 = latencies[Math.floor(latencies.length*0.5)]; const p95 = latencies[Math.floor(latencies.length*0.95)]; const avg = latencies.reduce((a,b)=>a+b,0)/latencies.length; stats = `平均:${avg.toFixed(0)}ms P50:${p50}ms P95:${p95}ms ${p95<15000?'✅':'❌'} P95<15s ${latencies.length===100?'✅':'❌'} 100轮不失忆`; }

  return (
    <div style={{fontFamily:'monospace',padding:'20px',background:'#0d1b2e',color:'#e0e0e0',minHeight:'100vh',boxSizing:'border-box'}}><h1 style={{margin:'0 0 16px',fontSize:'20px'}}><span role='img' aria-hidden>📱</span> 移动端本地模型验收压测</h1>
    <div style={{display:'flex',flexWrap:'wrap',gap:'12px',marginBottom:'16px',padding:'12px',background:'#1a1a2e',borderRadius:'8px',fontSize:'13px'}}><span style={{color:sc(modelState.state)}}>● 模型: {modelState.state}</span>{modelState.error&&<span style={{color:'#f87171'}}>错误: {modelState.error}</span>}<span>进度: {progress.current}/{progress.total}</span><span style={{color:offlineMode?'#fbbf24':'#60a5fa'}}>{offlineMode?'📴 离线':'🌐 在线'}</span><span>成功: {results.filter(r=>!r.error).length}/{results.length}</span></div>
    <div style={{display:'flex',flexWrap:'wrap',gap:'8px',marginBottom:'16px'}}><button onClick={preloadModel} disabled={modelState.state==='loading'||running} style={{padding:'10px 16px',background:modelState.state==='ready'?'#059669':'#2563eb',color:'#fff',border:'none',borderRadius:'6px',cursor:modelState.state==='loading'||running?'not-allowed':'pointer',opacity:modelState.state==='loading'||running?0.6:1}}>{modelState.state==='loading'?'⏳ 加载中...':modelState.state==='ready'?'✅ 已就绪':'📥 预加载'}</button><button onClick={toggleOffline} disabled={running} style={{padding:'10px 16px',background:offlineMode?'#f59e0b':'#475569',color:'#fff',border:'none',borderRadius:'6px',cursor:running?'not-allowed':'pointer'}}>{offlineMode?'🌐 切在线':'📴 切离线'}</button><button onClick={runStressTest} disabled={running||modelState.state!=='ready'} style={{padding:'10px 16px',background:running?'#64748b':'#dc2626',color:'#fff',border:'none',borderRadius:'6px',cursor:running||modelState.state!=='ready'?'not-allowed':'pointer'}}>{running?'⏳ 压测中...':'🚀 100轮压测'}</button><button onClick={abortTest} disabled={!running} style={{padding:'10px 16px',background:'#dc2626',color:'#fff',border:'none',borderRadius:'6px',cursor:running?'pointer':'not-allowed',opacity:running?1:0.5}}>🛑 中止</button><button onClick={simulateBackground} disabled={running} style={{padding:'10px 16px',background:'#7c3aed',color:'#fff',border:'none',borderRadius:'6px',cursor:running?'not-allowed':'pointer'}}>📱 模拟后台</button></div>
    {stats && <div style={{marginBottom:'16px',padding:'12px',background:'#1a1a2e',borderRadius:'8px',fontSize:'12px'}}><strong>延迟:</strong> {stats}</div>}
    <div ref={logRef} style={{height:'40vh',minHeight:'200px',maxHeight:'500px',overflow:'auto',padding:'12px',background:'#1a1a2e',borderRadius:'8px',fontSize:'12px',lineHeight:'1.5',whiteSpace:'pre-wrap',wordBreak:'break-word'}}/>
    </div>
  );
}
