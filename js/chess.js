// 国际象棋 (v1.82): 规则 (vendor/chess.js)、局面打分、每一步的好坏、准确率、存的棋局。
// 引擎 (干鳕鱼 Stockfish) 的连接在 chessengine.js, chess.com 拿棋在 chesscom.js, 讲解的话在 chesscoach.js, 页面在 views/chess.js。
//
// 打分 (eval) 一律从白方看: 正数白好, 单位是「兵」的百分之一 (cp, 100 = 多一个兵)。
//   有杀棋时记成 ±(MATE - 几步杀), 比如白 3 步杀 = MATE - 3; 已经被将死的局面 = ±MATE。
// 胜率 (win%) 用 Lichess 公开的公式 (从打分换算成「这一方大概有几成赢面」, 0–100), 准确率也照它的公式。
// 每一步的好坏是温故自己定的分法: 看这步让走棋的一方的胜率掉了多少。

import { Chess } from './vendor/chess.js';
import { MATE, cleanGame, gameIdOf } from './chessdata.js';

export { MATE, evalOf, cleanRating, nextRating, START_RATING, GAMES_MAX, cleanGame, cleanChess, mergeChess, gameList, gameIdOf } from './chessdata.js';

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
export const PIECE_ZH = { k: '王', q: '后', r: '车', b: '象', n: '马', p: '兵' };
export const VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

// 走法写成中文棋书的样子: Nf3 → 马f3, exd5 → e×d5, e8=Q → e8=后; 王车易位照旧写 O-O
export function zhSan(san) {
  const s = String(san ?? '');
  if (s.startsWith('O-O')) return s;
  return s.replace(/^[KQRBN]/, (c) => PIECE_ZH[c.toLowerCase()]).replace(/=([QRBN])/, (_, c) => `=${PIECE_ZH[c.toLowerCase()]}`).replace('x', '×');
}

// ---- 打分 ----

export const isMate = (ev) => Math.abs(ev) >= MATE - 1000;
// 几步杀 (正数: 白杀; 负数: 黑杀; 不是杀棋: 0)
export const mateIn = (ev) => (isMate(ev) ? Math.sign(ev) * (MATE - Math.abs(ev)) : 0);


// 白方的胜率 (0–100); 有杀棋的直接 100 / 0
export function winPct(ev) {
  if (isMate(ev)) return ev > 0 ? 100 : 0;
  const cp = clamp(ev, -1000, 1000);
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
}
// 某一方的胜率
export const winFor = (ev, color) => (color === 'w' ? winPct(ev) : 100 - winPct(ev));

// 打分写成给人看的: +1.3、−0.8、白 3 步杀 (M3)
export function evalText(ev) {
  const m = mateIn(ev);
  if (m) return `${m > 0 ? '' : '−'}M${Math.abs(m)}`;
  if (Math.abs(ev) >= MATE) return ev > 0 ? '1-0' : '0-1';
  const x = ev / 100;
  return `${x > 0 ? '+' : x < 0 ? '−' : ''}${Math.abs(x).toFixed(1)}`;
}

// 一步棋的准确率 (0–100): 胜率掉得越多越低 (Lichess 的公式)
export function moveAccuracy(before, after) {
  if (after >= before) return 100;
  return clamp(103.1668 * Math.exp(-0.04354 * (before - after)) - 3.1669 + 1, 0, 100);
}

// 一方整盘的准确率: 每步的准确率, 局面变化大的那几步算得重一些, 再跟调和平均取个中 (照 Lichess)
// evals: 每个局面的打分 (第 0 个是开局, 第 i 个是走完第 i 步), color: 'w' / 'b'; startTurn: 第一步谁走
export function gameAccuracy(evals, color, startTurn = 'w') {
  const wins = evals.map(winPct);
  const n = wins.length - 1;
  if (n < 1) return null;
  const size = clamp(Math.floor(n / 10), 2, 8);
  const weights = [];
  for (let i = 0; i < n; i++) {
    const lo = clamp(i - Math.floor(size / 2), 0, Math.max(0, wins.length - size));
    const w = wins.slice(lo, lo + size);
    const mean = w.reduce((a, b) => a + b, 0) / w.length;
    const sd = Math.sqrt(w.reduce((a, b) => a + (b - mean) ** 2, 0) / w.length);
    weights.push(clamp(sd, 0.5, 12));
  }
  let sum = 0;
  let wsum = 0;
  let inv = 0;
  let count = 0;
  for (let i = 0; i < n; i++) {
    const mover = (i % 2 === 0) === (startTurn === 'w') ? 'w' : 'b';
    if (mover !== color) continue;
    const a = moveAccuracy(color === 'w' ? wins[i] : 100 - wins[i], color === 'w' ? wins[i + 1] : 100 - wins[i + 1]);
    sum += a * weights[i];
    wsum += weights[i];
    inv += 1 / Math.max(a, 0.5);
    count++;
  }
  if (!count) return null;
  return clamp((sum / wsum + count / inv) / 2, 0, 100);
}

// ---- 每一步的好坏 ----

// 从好到坏; mark: 棋书上的记号; tone: 颜色 (css 的 .ck-<key>)
export const KINDS = [
  { key: 'brilliant', name: '妙着', mark: '!!' },
  { key: 'great', name: '好棋', mark: '!' },
  { key: 'best', name: '最佳', mark: '★' },
  { key: 'excellent', name: '很好', mark: '' },
  { key: 'good', name: '还行', mark: '' },
  { key: 'forced', name: '只能这样', mark: '' },
  { key: 'inaccuracy', name: '不太好', mark: '?!' },
  { key: 'mistake', name: '失误', mark: '?' },
  { key: 'miss', name: '错失良机', mark: '✕' },
  { key: 'blunder', name: '大错', mark: '??' },
];
export const kindOf = (key) => KINDS.find((k) => k.key === key) ?? null;
export const BAD = new Set(['inaccuracy', 'mistake', 'miss', 'blunder']);

// 走完这步以后, 对手马上能白吃多少子 (粗算: 吃没人保护的子, 或者拿小子换大子); 走这步时吃到的子要减掉
// 用来认「弃子」: 明知道会被吃还走, 而且引擎说这是好棋 → 妙着
export function sacrificeValue(fen, move) {
  let game;
  try {
    game = new Chess(fen);
  } catch {
    return 0;
  }
  const me = game.turn();
  let m;
  try {
    m = game.move(move);
  } catch {
    return 0;
  }
  if (!m || game.isCheckmate()) return 0;
  const took = m.captured ? VALUE[m.captured] : 0;
  let worst = 0;
  for (const r of game.moves({ verbose: true })) {
    if (!r.captured) continue;
    const v = VALUE[r.captured];
    if (v < 3) continue; // 只算丢了马、象、车、后 (丢兵不算弃子)
    // 吃完以后我方能不能吃回来 (这个格子有没有我方的子看着)
    game.move(r);
    const defended = game.isAttacked(r.to, me);
    game.undo();
    const gain = defended ? v - VALUE[r.piece] : v;
    worst = Math.max(worst, gain);
  }
  return Math.max(0, worst - took);
}

// 一步棋的好坏。
//   before / after: 走之前、走之后的打分 (从白方看); turn: 谁走的; played / best: 这步、引擎最想走的 (uci, 比如 e2e4)
//   second: 引擎第二想走的那步走完的打分 (没有就 null); legal: 有几步可走; sac: 弃了多少子 (sacrificeValue);
//   prev: 对手上一步的好坏 (认「错失良机」: 对手送了机会没抓住)
export function classify({ before, after, turn, played, best, second = null, legal = 2, sac = 0, prev = null }) {
  if (legal <= 1) return 'forced';
  const wb = winFor(before, turn);
  const wa = winFor(after, turn);
  const loss = Math.max(0, wb - wa);
  const top = played === best;
  const w2 = second === null ? null : winFor(second, turn);
  // 弃子还是好棋 (走完也没变差多少): 妙着。本来就赢定了的局面, 要弃了子能逼杀、别的走法没这么好才算 (像莫菲「歌剧院对局」的后b8+)
  if (sac >= 2 && (top || loss < 1.5) && wa >= 50) {
    const forcesMate = mateIn(after) * (turn === 'w' ? 1 : -1) > 0;
    if (wb < 97 || (forcesMate && (w2 === null || w2 < 97))) return 'brilliant';
  }
  if (top) {
    if (Math.abs(after) >= MATE) return 'best'; // 将死了: 最佳 (不说「只有这步」)
    // 别的走法都差很多, 只有这步能保住局面: 好棋
    if (w2 !== null && wb - w2 >= 15 && wb >= 30 && w2 < 85) return 'great';
    return 'best';
  }
  if (loss < 2) return 'excellent';
  if (loss < 5) return 'good';
  // 对手刚失误, 这步没抓住机会 (也没把自己走坏): 错失良机
  if ((prev === 'mistake' || prev === 'blunder') && loss >= 10 && wa >= 35) return 'miss';
  if (loss < 10) return 'inaccuracy';
  if (loss < 20) return 'mistake';
  return 'blunder';
}

// 复盘过的一盘棋, 每一步: { kind 好坏, acc 准确率, loss 胜率掉了多少 }
//   moves: chess.js 的走法 (readPgn 的); review: { ev, bm, ev2 } (每个局面一个, 比走法多一个)
export function judgeGame(moves, review) {
  const out = [];
  let prev = null;
  for (let i = 0; i < moves.length; i++) {
    const m = moves[i];
    const before = review.ev[i];
    const after = review.ev[i + 1];
    if (before === undefined || after === undefined) break;
    const played = m.from + m.to + (m.promotion ?? '');
    let legal = 2;
    try {
      legal = new Chess(m.before).moves().length;
    } catch {}
    const sac = sacrificeValue(m.before, m.san);
    const kind = classify({ before, after, turn: m.color, played, best: review.bm[i], second: review.ev2?.[i] ?? null, legal, sac, prev });
    const wb = winFor(before, m.color);
    const wa = winFor(after, m.color);
    out.push({ kind, acc: moveAccuracy(wb, wa), loss: Math.max(0, wb - wa) });
    prev = kind;
  }
  return out;
}

// 各方每种好坏有几步: { w: { best: 3, … }, b: { … } }
export function countKinds(moves, judged) {
  const counts = { w: {}, b: {} };
  judged.forEach((j, i) => {
    const c = counts[moves[i].color];
    c[j.kind] = (c[j.kind] ?? 0) + 1;
  });
  return counts;
}

// 最关键的一步: 胜率变化最大的那步 (变化不到 15 的不算), 没有是 null
export function turningPoint(judged) {
  let at = null;
  let most = 15;
  judged.forEach((j, i) => {
    if (j.loss > most) {
      most = j.loss;
      at = i;
    }
  });
  return at;
}

// ---- 一盘棋 ----

// 读棋谱 (PGN), 读不了返回 null。chess.com 的棋谱里有 {[%clk ...]} 这种时间注释, 不影响
export function readPgn(text) {
  const game = new Chess();
  try {
    game.loadPgn(String(text ?? '').trim());
  } catch {
    return null;
  }
  const headers = game.getHeaders();
  const moves = game.history({ verbose: true });
  if (!moves.length) return null;
  return { headers, moves, start: moves[0].before, end: game.fen(), over: game.isGameOver(), checkmate: game.isCheckmate() };
}

// 一盘棋的每一个局面 (第 0 个是开局) 和每一步 (uci、中文写法)
export function positionsOf(moves) {
  const fens = [moves[0]?.before ?? START_FEN, ...moves.map((m) => m.after)];
  return { fens, ucis: moves.map((m) => m.from + m.to + (m.promotion ?? '')) };
}

// 结果写成中文: 从「我」看 (me: 'w' / 'b' / ''), 不知道我是哪方就写谁赢
export function resultText(result, me = '') {
  if (result === '1/2-1/2') return '和棋';
  const white = result === '1-0';
  if (result !== '1-0' && result !== '0-1') return '没下完';
  if (!me) return white ? '白胜' : '黑胜';
  return (white ? 'w' : 'b') === me ? '赢了' : '输了';
}

// 一盘棋 → 存的记录 (headers 从棋谱里读; 白、黑、结果、日子)
export function gameRecord({ pgn, src, me = '', url = '', rating = 0, who = '', mode = '', now = Date.now(), id = null }) {
  const g = readPgn(pgn);
  if (!g) return null;
  const hd = g.headers;
  const date = (hd.UTCDate ?? hd.Date ?? '').replace(/\./g, '-');
  return cleanGame({
    id: id ?? gameIdOf({ src, url, now }),
    at: now,
    src,
    pgn,
    white: hd.White ?? '',
    black: hd.Black ?? '',
    result: hd.Result ?? '*',
    date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : '',
    me,
    url,
    rating,
    who,
    mode,
  });
}
