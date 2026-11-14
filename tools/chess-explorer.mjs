// 算开局浏览器的统计 (v1.86): 每个局面大家怎么走、每步走过几盘、白赢 / 黑赢各几成, 写成 js/explorer/<资料库>/<00–ff>.js。
// 资料 (都不放进仓库, 算完就删; 下载办法见 ~/.local/share/claude-tools/README.txt):
//   大师 master: KingBase Lite 2019 (archive.org, 2000–2019 年 2200 分以上的正式比赛)、
//               Lichess 比赛直播棋局 (database.lichess.org/broadcast, CC BY-SA 4.0)、
//               PGN Mentor 的名人棋局 (pgnmentor.com, 写明免费下载)。双方都 2200 分以上 (没写分的老棋局照收), 同一盘棋只算一次
//   lo / mid / hi: Lichess 网上的计分棋 (database.lichess.org, CC0), 3 分钟以上的; 双方平均分换成 chess.com 的分
//               (ChessGoals 2026-07 的对照表) 分三档: 1000 以下 / 1000–1600 / 1600 以上
// 分两步 (第一步慢, 算一次; 第二步快, 可以改门槛重来):
//   node tools/chess-explorer.mjs count <资料库> <输出.txt> <资料文件…>     .zip (里面是 pgn)、.pgn.zst、.pgn 都认
//   node tools/chess-explorer.mjs build <资料库> <count 的输出.txt…>          写 js/explorer/<资料库>/
// 只算开头几步 (大师 24 步、别的 20 步; 一步 = 一方走一下); 局面要有够多的棋走过才留 (MIN_POS), 走法也是 (MIN_MOVE)。

import { createReadStream, writeFileSync, mkdirSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { createZstdDecompress } from 'node:zlib';
import { createInterface } from 'node:readline';
import { PassThrough } from 'node:stream';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Chess } from '../js/vendor/chess.js';
import { exKey } from '../js/chessexplorer.js';

const MAX_PLY = { master: 24, lo: 20, mid: 20, hi: 20 };
// 门槛 (试的时候能用 EX_MIN_POS、EX_MIN_MOVE 改)
const MIN_POS = { master: 8, lo: 20, mid: 20, hi: 20 };
const MIN_MOVE = { master: 3, lo: 5, mid: 5, hi: 5 };
if (process.env.EX_MIN_POS) for (const k in MIN_POS) MIN_POS[k] = Number(process.env.EX_MIN_POS);
if (process.env.EX_MIN_MOVE) for (const k in MIN_MOVE) MIN_MOVE[k] = Number(process.env.EX_MIN_MOVE);

// chess.com 快棋分 ↔ Lichess 快棋分 (ChessGoals 2026-07, 跟 chess-calib 用的同一张表): Lichess 分换成 chess.com 的分
const CC = [[815, 1290], [905, 1360], [995, 1425], [1085, 1490], [1170, 1555], [1255, 1615], [1340, 1680], [1420, 1740], [1500, 1795], [1580, 1850], [1655, 1905], [1730, 1960], [1800, 2015], [1870, 2065], [1935, 2115], [1995, 2165], [2055, 2215], [2110, 2260]];
export function ccFromLichess(L) {
  const seg = L <= CC[0][1] ? [CC[0], CC[1]] : L >= CC.at(-1)[1] ? [CC.at(-2), CC.at(-1)] : CC.slice(1).map((p, i) => [CC[i], p]).find(([, q]) => L <= q[1]);
  const [[a, x], [b, y]] = seg;
  return a + ((L - x) * (b - a)) / (y - x);
}
export const bandOf = (cc) => (cc < 1000 ? 'lo' : cc < 1600 ? 'mid' : 'hi');

// 棋谱正文 → 走法 (去掉注释、变着、回合数、!? 记号、结果)
export function sanTokens(body, max = 99) {
  let s = String(body).replace(/\{[^}]*\}/g, ' ').replace(/;[^\n]*/g, ' ');
  // 变着 ( … ), 可能套好几层
  let prev;
  do {
    prev = s;
    s = s.replace(/\([^()]*\)/g, ' ');
  } while (s !== prev);
  const out = [];
  for (let t of s.split(/\s+/)) {
    t = t.replace(/^\d+\.+/, '').replace(/[?!]+$/, '');
    if (!t || /^\$\d+$/.test(t) || /^(1-0|0-1|1\/2-1\/2|\*)$/.test(t)) continue;
    out.push(t);
    if (out.length >= max) break;
  }
  return out;
}

// 一行一行读一个资料文件, 每盘棋交给 onGame({ headers, body })
async function eachGame(file, onGame) {
  let input;
  if (file.endsWith('.zip')) input = spawn('unzip', ['-p', file], { stdio: ['ignore', 'pipe', 'ignore'] }).stdout;
  else if (file.endsWith('.zst')) {
    // 只下了开头一截的文件: 解压到断的地方就当读完了
    const z = createReadStream(file).pipe(createZstdDecompress());
    input = new PassThrough();
    z.on('error', () => input.end());
    z.pipe(input);
  } else input = createReadStream(file);
  const rl = createInterface({ input, crlfDelay: Infinity });
  let headers = {};
  let body = [];
  const flush = () => {
    if (body.length) onGame({ headers, body: body.join(' ') });
    headers = {};
    body = [];
  };
  for await (const raw of rl) {
    const line = raw.trim();
    if (line.startsWith('[')) {
      if (body.length) flush();
      const m = /^\[(\w+)\s+"(.*)"\]$/.exec(line);
      if (m) headers[m[1]] = m[2];
    } else if (line) body.push(line);
  }
  flush();
}

// 这盘棋算不算进这个资料库
function accept(db, h, file) {
  if ((h.Variant ?? 'Standard') !== 'Standard' || h.FEN || h.SetUp === '1') return false;
  if (!['1-0', '0-1', '1/2-1/2'].includes(h.Result)) return false;
  const we = Number(h.WhiteElo) || 0;
  const be = Number(h.BlackElo) || 0;
  if (db === 'master') {
    if (/pgnmentor|mentor/i.test(file) && (!we || !be)) return true; // 老棋局没写分: 照收 (都是名人)
    return we >= 2200 && be >= 2200;
  }
  if (!/^Rated /.test(h.Event ?? '') || /Bullet|Correspondence/.test(h.Event)) return false;
  const base = Number(String(h.TimeControl ?? '').split('+')[0]) || 0;
  if (base < 180 || !we || !be) return false;
  return bandOf(ccFromLichess((we + be) / 2)) === db;
}

const fnv = (s, h = 0x811c9dc5) => {
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
};

async function count(db, out, files) {
  const maxPly = MAX_PLY[db];
  // 一条「局面 → 走法」一个格子: 用 53 位的数当钥匙 (够大, 几千万条也几乎不会撞), 数字存在几个一直变长的数组里
  let index = new Map();
  let cap = 1 << 20;
  let W = new Uint32Array(cap);
  let D = new Uint32Array(cap);
  let L = new Uint32Array(cap);
  let ply = new Uint8Array(cap);
  let pos = new Array(cap);
  let mv = new Array(cap);
  let n = 0;
  const grow = () => {
    cap *= 2;
    const g = (A) => {
      const B = new A.constructor(cap);
      B.set(A);
      return B;
    };
    W = g(W);
    D = g(D);
    L = g(L);
    ply = g(ply);
    pos.length = cap;
    mv.length = cap;
  };
  // 只出现过一次、又在比较深的地方的: 定期扔掉 (不然内存不够; 这种局面最后也到不了门槛)
  const prune = () => {
    const keep = new Map();
    let m = 0;
    for (const [k, i] of index) {
      if (W[i] + D[i] + L[i] < 2 && ply[i] >= 8) continue;
      W[m] = W[i];
      D[m] = D[i];
      L[m] = L[i];
      ply[m] = ply[i];
      pos[m] = pos[i];
      mv[m] = mv[i];
      keep.set(k, m++);
    }
    index = keep;
    n = m;
  };
  const seen = new Set(); // 同一盘棋 (日子 + 前 30 步一样) 只算一次
  const game = new Chess();
  let games = 0;
  let used = 0;
  let bad = 0;
  for (const file of files) {
    await eachGame(file, ({ headers: h, body }) => {
      games++;
      if (!accept(db, h, file)) return;
      const toks = sanTokens(body, 30);
      if (toks.length < 2) return;
      if (db === 'master') {
        const id = fnv(`${h.Date ?? ''}|${toks.join(' ')}`) * 4096 + (fnv(toks.join(' '), 0x2b992ddf) & 4095);
        if (seen.has(id)) return;
        seen.add(id);
      }
      used++;
      const res = h.Result === '1-0' ? 0 : h.Result === '0-1' ? 2 : 1;
      game.reset();
      let key = exKey(game.fen()).key;
      for (let p = 0; p < Math.min(maxPly, toks.length); p++) {
        let m;
        try {
          m = game.move(toks[p]);
        } catch {
          bad++;
          break;
        }
        const uci = m.from + m.to + (m.promotion ?? '');
        const k = fnv(uci, fnv(key)) * 2097152 + (fnv(key + uci, 0x2b992ddf) >>> 11);
        let i = index.get(k);
        if (i === undefined) {
          if (n >= cap) grow();
          i = n++;
          index.set(k, i);
          W[i] = D[i] = L[i] = 0;
          ply[i] = p;
          pos[i] = key;
          mv[i] = uci;
        }
        if (res === 0) W[i]++;
        else if (res === 1) D[i]++;
        else L[i]++;
        key = exKey(game.fen()).key;
      }
      if (used % 100000 === 0) {
        prune();
        console.error(`${db}: 读了 ${games} 盘, 算了 ${used} 盘, ${index.size} 条`);
      }
    });
  }
  prune();
  const lines = [];
  for (const [, i] of index) if (W[i] + D[i] + L[i] >= 2) lines.push(`${pos[i]} ${mv[i]} ${W[i]} ${D[i]} ${L[i]}`);
  writeFileSync(out, `${lines.join('\n')}\n`);
  console.error(`${db}: 完了。读了 ${games} 盘, 算了 ${used} 盘 (走法读不懂的 ${bad} 盘), 留下 ${lines.length} 条 → ${out}`);
}

// 几个 count 的结果合起来, 按门槛挑, 写成 256 个小文件
function build(db, inputs) {
  const posMap = new Map(); // 局面 → Map(走法 → [白赢, 和, 黑赢])
  for (const f of inputs) {
    for (const line of readFileSync(f, 'utf8').split('\n')) {
      const [p, uci, w, d, l] = line.split(' ');
      if (!l) continue;
      let moves = posMap.get(p);
      if (!moves) posMap.set(p, (moves = new Map()));
      const c = moves.get(uci) ?? [0, 0, 0];
      c[0] += Number(w);
      c[1] += Number(d);
      c[2] += Number(l);
      moves.set(uci, c);
    }
  }
  const shards = new Map();
  let kept = 0;
  for (const [p, moves] of posMap) {
    const total = [...moves.values()].reduce((s, c) => s + c[0] + c[1] + c[2], 0);
    if (total < MIN_POS[db]) continue;
    const list = [...moves]
      .map(([uci, c]) => ({ uci, n: c[0] + c[1] + c[2], c }))
      .filter((x) => x.n >= MIN_MOVE[db])
      .sort((a, b) => b.n - a.n)
      .slice(0, 12);
    if (!list.length) continue;
    kept++;
    // 钥匙最后两位十六进制… 小文件按钥匙第一个数的低 8 位分; 钥匙前 7 位是那个数的 36 进制
    const a = parseInt(p.slice(0, -4), 36);
    const shard = (a & 0xff).toString(16).padStart(2, '0');
    const row = `${p} ${list.map((x) => `${x.uci},${x.n},${Math.round((x.c[0] / x.n) * 100)},${Math.round((x.c[2] / x.n) * 100)}`).join(' ')}`;
    if (!shards.has(shard)) shards.set(shard, []);
    shards.get(shard).push(row);
  }
  const dir = new URL(`../js/explorer/${db}/`, import.meta.url).pathname;
  if (existsSync(dir)) rmSync(dir, { recursive: true });
  mkdirSync(dir, { recursive: true });
  let bytes = 0;
  for (let i = 0; i < 256; i++) {
    const shard = i.toString(16).padStart(2, '0');
    const rows = (shards.get(shard) ?? []).sort();
    const text = `// 自动生成, 别手改: node tools/chess-explorer.mjs build ${db} …\nexport default ${JSON.stringify(rows.join('\n'))};\n`;
    bytes += text.length;
    writeFileSync(join(dir, `${shard}.js`), text);
  }
  console.error(`${db}: ${posMap.size} 个局面里留了 ${kept} 个, 一共 ${(bytes / 1048576).toFixed(1)} MB`);
}

// 直接跑才动手 (测试只引用上面的小函数)
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [cmd, db, ...rest] = process.argv.slice(2);
  if (!MAX_PLY[db] || !['count', 'build'].includes(cmd)) {
    console.error('用法: node tools/chess-explorer.mjs count <master|lo|mid|hi> <输出.txt> <资料文件…>\n      node tools/chess-explorer.mjs build <master|lo|mid|hi> <count 的输出.txt…>');
    process.exit(1);
  }
  if (cmd === 'count') await count(db, rest[0], rest.slice(1));
  else build(db, rest);
}
