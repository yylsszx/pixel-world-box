// 极简 DOM 桩：canvas 2D 上下文全走 Proxy（任何方法可调用、任何属性可读写）
const ctxProxy: unknown = new Proxy(function () { return ctxProxy; } as unknown as Record<string, unknown>, {
  get: (_t, prop) => {
    if (prop === Symbol.toPrimitive) return () => 0;
    if (prop === 'width' || prop === 'height') return 0;
    return ctxProxy;
  },
  set: () => true,
  apply: () => ctxProxy,
});
const makeCanvas = (): unknown => ({
  width: 0,
  height: 0,
  getContext: () => ctxProxy,
  toDataURL: () => '',
  style: {},
  appendChild: () => {},
});
const g = globalThis as unknown as Record<string, unknown>;
g.document = {
  createElement: (tag: string) => (tag === 'canvas' ? makeCanvas() : { style: {}, appendChild: () => {}, getContext: () => ctxProxy }),
  documentElement: { style: {} },
  body: { appendChild: () => {}, style: {} },
  addEventListener: () => {},
  removeEventListener: () => {},
};
g.window = g;
g.devicePixelRatio = 1;
g.requestAnimationFrame = () => 0;
g.cancelAnimationFrame = () => {};
g.addEventListener = () => {};
g.removeEventListener = () => {};
g.HTMLCanvasElement = function HTMLCanvasElement() {};
g.OffscreenCanvas = function OffscreenCanvas() {};
const localStorageStub = {
  getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {}, key: () => null, length: 0,
};
g.localStorage = localStorageStub;
g.AudioContext = function AudioContext() { return { createOscillator: () => ({ connect: () => {}, start: () => {}, stop: () => {}, frequency: { value: 0, setValueAtTime: () => {} }, type: '' }), createGain: () => ({ connect: () => {}, gain: { value: 0, setValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} }, }), destination: {}, currentTime: 0, state: 'running', resume: () => {}, close: () => {} }; };
g.webkitAudioContext = g.AudioContext;
