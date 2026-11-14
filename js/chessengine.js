// 干鳕鱼 (Stockfish 19) 引擎 (v1.82): 在 Web Worker 里跑, 用 UCI 协议说话 (发 "position fen …"、"go depth 14", 它回 "info …"、"bestmove e2e4")。
// 默认用轻量版 (vendor/stockfish/stockfish-19-lite-single.*, 1.8 MB); 设置里可以换成完整版 (99 MB, 点了才从 unpkg 下载,
// 核对指纹后存在这台设备的浏览器里, 不同步)。两种都是单线程的: 多线程要网站发特别的设置, GitHub Pages 发不了。

import { evalOf } from './chessdata.js';

const DIR = new URL('./vendor/stockfish/', import.meta.url).href;
export const LITE_JS = `${DIR}stockfish-19-lite-single.js`;
export const FULL_JS = `${DIR}stockfish-19-single.js`;
export const FULL_WASM_URL = 'https://unpkg.com/stockfish@19.0.1/bin/stockfish-19-single.wasm';
export const FULL_WASM_SHA256 = 'mRvt4vJT67CP8B/MSCcPS5yOZrEtW9X41vUus+Ozp0A=';
export const FULL_WASM_SIZE = 99169054;
const FULL_CACHE = 'wengu-stockfish-full';
const CHOICE_KEY = 'wengu:chess-engine'; // 'full' 用完整版; 没写是轻量版

// ---- 读引擎说的话 ----

// "info depth 12 seldepth 18 multipv 1 score cp 34 nodes … pv e2e4 e7e5 …" → { depth, multipv, cp | mate, pv: [...] }; 不是这种是 null
export function parseInfo(line) {
  if (!line.startsWith('info ') || !line.includes(' score ') || !line.includes(' pv ')) return null;
  const num = (key) => {
    const m = new RegExp(` ${key} (-?\\d+)`).exec(line);
    return m ? Number(m[1]) : null;
  };
  if (/ (lowerbound|upperbound)/.test(line)) return null; // 还没算准的
  const out = { depth: num('depth') ?? 0, multipv: num('multipv') ?? 1, pv: line.slice(line.indexOf(' pv ') + 4).trim().split(/\s+/) };
  const mate = /score mate (-?\d+)/.exec(line);
  const cp = /score cp (-?\d+)/.exec(line);
  if (mate) out.mate = Number(mate[1]);
  else if (cp) out.cp = Number(cp[1]);
  else return null;
  return out;
}

// "bestmove e2e4 ponder e7e5" → 'e2e4'; 没有可走的 ("bestmove (none)") → ''
export function parseBest(line) {
  const m = /^bestmove (\S+)/.exec(line);
  if (!m) return null;
  return /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(m[1]) ? m[1] : '';
}

// ---- 引擎 ----

export class Engine {
  // makeWorker: 测试时换成假的
  constructor({ js = LITE_JS, wasm = '', makeWorker = (url) => new Worker(url) } = {}) {
    this.url = wasm ? `${js}#${encodeURIComponent(wasm)}` : js;
    this.makeWorker = makeWorker;
    this.worker = null;
    this.listener = null; // 现在这件事在听什么
    this.chain = Promise.resolve();
    this.gen = 0; // cancel() 一次加一, 排着队的旧事不做了
    this.started = null;
    this.dead = null; // 引擎出错了 (下载不了、浏览器不支持……)
  }

  start() {
    if (this.started) return this.started;
    this.started = new Promise((resolve, reject) => {
      try {
        this.worker = this.makeWorker(this.url);
      } catch (e) {
        this.dead = e;
        reject(e);
        return;
      }
      const timer = setTimeout(() => fail(new Error('引擎加载太久了')), 60000);
      const fail = (e) => {
        clearTimeout(timer);
        this.dead = e;
        this.listener?.fail?.(e);
        reject(e);
      };
      this.worker.onmessage = (e) => {
        for (const line of String(e.data ?? '').split('\n')) if (line) this.listener?.line(line);
      };
      this.worker.onerror = (e) => fail(new Error(e?.message || '引擎出错了'));
      this.listener = {
        line: (line) => {
          if (line === 'uciok') this.send('isready');
          if (line === 'readyok') {
            clearTimeout(timer);
            this.listener = null;
            resolve();
          }
        },
        fail,
      };
      this.send('uci');
    });
    return this.started;
  }

  send(cmd) {
    this.worker?.postMessage(cmd);
  }

  // 排队做一件事: 设好局面、go, 一直听到 bestmove
  run({ fen, moves = [], options = {}, go, onInfo }) {
    const gen = this.gen;
    const job = async () => {
      if (gen !== this.gen) return null; // 排队时被取消了
      await this.start();
      return new Promise((resolve, reject) => {
        const lines = new Map(); // 第几条 → 最新的那句
        let depth = 0;
        this.listener = {
          line: (line) => {
            const info = parseInfo(line);
            if (info) {
              lines.set(info.multipv, info);
              depth = Math.max(depth, info.depth);
              onInfo?.(info);
              return;
            }
            const best = parseBest(line);
            if (best === null) return;
            this.listener = null;
            resolve({ best, depth, lines: [...lines.entries()].sort((a, b) => a[0] - b[0]).map((x) => x[1]) });
          },
          fail: reject,
        };
        for (const [k, v] of Object.entries(options)) this.send(`setoption name ${k} value ${v}`);
        this.send(`position fen ${fen}${moves.length ? ` moves ${moves.join(' ')}` : ''}`);
        this.send(`go ${go}`);
      });
    };
    const p = this.chain.then(job, job);
    this.chain = p.catch(() => {});
    return p;
  }

  // 分析一个局面: 返回 { ev 打分 (白方看), best 最想走的, ev2 第二想走的那步走完的打分 (multipv 2 才有), pv 接下来的走法, depth }
  async analyse(fen, { depth = 14, movetime = 0, multipv = 1, onInfo } = {}) {
    const turn = fen.split(' ')[1] === 'b' ? 'b' : 'w';
    const go = `depth ${depth}${movetime ? ` movetime ${movetime}` : ''}`;
    const r = await this.run({ fen, options: { 'Skill Level': 20, MultiPV: multipv }, go, onInfo });
    if (!r) return null;
    const [first, second] = r.lines;
    return {
      ev: first ? evalOf(first, turn) : null,
      best: r.best || first?.pv[0] || '',
      ev2: second ? evalOf(second, turn) : null,
      pv: first?.pv ?? [],
      depth: r.depth,
      lines: r.lines.map((l) => ({ uci: l.pv[0], ev: evalOf(l, turn) })), // 每一条: 先走哪步、走完的打分 (白方看)
    };
  }

  // 正在算的停下, 排队的不做了
  cancel() {
    this.gen++;
    if (this.listener) this.send('stop');
  }

  quit() {
    this.cancel();
    this.worker?.terminate();
    this.worker = null;
    this.started = null;
  }
}

// ---- 用哪个引擎 (这台设备上) ----

const storage = () => {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
};
export const engineChoice = () => (storage()?.getItem(CHOICE_KEY) === 'full' ? 'full' : 'lite');
export function setEngineChoice(choice) {
  try {
    if (choice === 'full') storage()?.setItem(CHOICE_KEY, 'full');
    else storage()?.removeItem(CHOICE_KEY);
  } catch {}
}

async function fullCache() {
  return globalThis.caches ? caches.open(FULL_CACHE) : null;
}
export async function hasFull() {
  try {
    return Boolean(await (await fullCache())?.match(FULL_WASM_URL));
  } catch {
    return false;
  }
}
export async function removeFull() {
  setEngineChoice('lite');
  try {
    await globalThis.caches?.delete(FULL_CACHE);
  } catch {}
}

export async function sha256Base64(buf) {
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', buf));
  let s = '';
  for (const b of hash) s += String.fromCharCode(b);
  return btoa(s);
}

// 下载完整版 (onProgress(0–1)); 指纹对不上不要。signal: 中途取消
export async function downloadFull({ onProgress, signal, fetchFn = fetch } = {}) {
  const res = await fetchFn(FULL_WASM_URL, { signal });
  if (!res.ok || !res.body) throw new Error(`下载失败 (${res.status})`);
  const reader = res.body.getReader();
  const parts = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
    got += value.length;
    onProgress?.(Math.min(1, got / FULL_WASM_SIZE));
  }
  const blob = new Blob(parts, { type: 'application/wasm' });
  const buf = await blob.arrayBuffer();
  if ((await sha256Base64(buf)) !== FULL_WASM_SHA256) throw new Error('下载的文件跟官方的对不上，没有用');
  const cache = await fullCache();
  if (!cache) throw new Error('这个浏览器存不了');
  await cache.put(FULL_WASM_URL, new Response(blob, { headers: { 'Content-Type': 'application/wasm' } }));
  setEngineChoice('full');
}

// 按这台设备的选择开一个引擎 (选了完整版但还没下载好: 用轻量版)
let shared = null;
let sharedKind = '';
export async function getEngine() {
  const kind = engineChoice() === 'full' && (await hasFull()) ? 'full' : 'lite';
  if (shared && sharedKind === kind && !shared.dead) return shared;
  shared?.quit();
  shared = null;
  if (kind === 'full') {
    try {
      const res = await (await fullCache()).match(FULL_WASM_URL);
      shared = new Engine({ js: FULL_JS, wasm: URL.createObjectURL(await res.blob()) });
    } catch {}
  }
  sharedKind = shared ? 'full' : 'lite';
  shared ??= new Engine();
  return shared;
}
export const engineName = () => (engineChoice() === 'full' ? '干鳕鱼 19 完整版' : '干鳕鱼 19 轻量版');
