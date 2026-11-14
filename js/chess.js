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
  { key: 'book', name: '开局谱', mark: '' }, // v1.83: 开局谱上的标准走法 (chessbook.js)
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

// 复盘过的一盘棋, 每一步: { kind 好坏, acc 准确率, loss 胜率掉了多少, open 开局名 (开局谱着才有) }
//   moves: chess.js 的走法 (readPgn 的); review: { ev, bm, ev2 } (每个局面一个, 比走法多一个)
//   book: chessbook.js 的 bookMoves (每一步在不在开局谱上); 在谱上、又没走坏 (掉的胜率不到 10) 的算「开局谱」
export function judgeGame(moves, review, { book = null } = {}) {
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
    let kind = classify({ before, after, turn: m.color, played, best: review.bm[i], second: review.ev2?.[i] ?? null, legal, sac, prev });
    const wb = winFor(before, m.color);
    const wa = winFor(after, m.color);
    const loss = Math.max(0, wb - wa);
    const bk = book?.[i];
    if (bk?.book && kind !== 'forced' && loss < 10) kind = 'book';
    out.push({ kind, acc: moveAccuracy(wb, wa), loss, ...(kind === 'book' ? { open: bk.name } : {}) });
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

// 「下一页」停的关键的步 (v1.84, 照 chess.com 的「对局回顾」): 最后一步开局谱着 (从这里离开开局谱)、双方的妙着和好棋、
// 双方的失误、大错、错失良机、「这边」的不太好 (不知道哪边是自己就两边都算), 还有最后一步。返回走法的下标 (从 0 数), 从小到大
export function keyMoments(moves, judged, me = '') {
  const out = new Set();
  const lastBook = judged.map((j) => j.kind).lastIndexOf('book');
  if (lastBook >= 0) out.add(lastBook);
  judged.forEach((j, i) => {
    if (['brilliant', 'great', 'mistake', 'miss', 'blunder'].includes(j.kind)) out.add(i);
    else if (j.kind === 'inaccuracy' && (!me || moves[i].color === me)) out.add(i);
  });
  if (moves.length) out.add(moves.length - 1);
  return [...out].sort((a, b) => a - b);
}

// ---- 棋局等级 (v1.83): 这盘棋下得像多少分的人 ----
// 照 Lichess 公开的真人快棋 (2026 年 10 月, 约 97 万盘): 局面还接近 (走之前胜率 20–80) 时, 各个分数的人平均每步掉多少胜率;
// 分数用 ChessGoals 的对照表 (2026 年 7 月) 换成 chess.com 的分。分越高掉得越少。[chess.com 的分, 平均掉多少]
export const RATING_LOSS = [
  [100, 10.5],
  [121, 10.34],
  [249, 9.15],
  [378, 8.22],
  [506, 7.26],
  [635, 6.86],
  [764, 6.44],
  [892, 6.08],
  [1030, 5.68],
  [1163, 5.42],
  [1301, 5.02],
  [1435, 4.83],
  [1580, 4.41],
  [1716, 4.09],
  [1849, 3.77],
  [1977, 3.53],
  [2098, 3.2],
  [2220, 2.8],
  [2342, 2.64],
  [2464, 2.23],
  [2587, 1.52],
  [2900, 0.8],
];

// 平均每步掉多少胜率 → 多少分 (表里两个点中间按直线算, 50 分一档)
export function ratingForLoss(loss) {
  const t = RATING_LOSS;
  if (loss >= t[0][1]) return t[0][0];
  if (loss <= t.at(-1)[1]) return t.at(-1)[0];
  for (let i = 1; i < t.length; i++) {
    const [r1, l1] = t[i];
    if (loss >= l1) {
      const [r0, l0] = t[i - 1];
      return Math.round((r0 + ((l0 - loss) / (l0 - l1)) * (r1 - r0)) / 50) * 50;
    }
  }
  return t.at(-1)[0];
}

// 一方这盘的棋局等级: 照真人资料的算法, 只算第 4 回合以后、走之前胜率 20–80 的步 (局面早就一边倒的步, 走好走坏胜率都不怎么变, 看不出水平)。
// prior: 这个人平常的分 (chess.com 棋谱里写的分、电脑对手的分、你现在的分; 不知道是 0)。能算的步少的时候往平常的分靠
// (一盘只有几步能算, 说明不了多少; chess.com 的也是这样, 一盘一盘看会往平常的分靠)。没有能算的步、也不知道平常的分: null
export const RATING_PULL = 8; // 平常的分算几步的分量
export function gameRating(moves, review, judged, color, prior = 0) {
  const list = [];
  moves.forEach((m, i) => {
    if (m.color !== color || i < 6 || !judged[i]) return;
    const wb = winFor(review.ev[i], color);
    if (wb < 20 || wb > 80) return;
    list.push(judged[i].kind === 'book' ? 0 : judged[i].loss);
  });
  const n = list.length;
  if (!prior && n < 3) return null;
  if (!n) return Math.round(prior / 50) * 50;
  const est = ratingForLoss(list.reduce((a, b) => a + b, 0) / n);
  if (!prior) return est;
  return Math.round((n * est + RATING_PULL * prior) / (n + RATING_PULL) / 50) * 50;
}

// ---- 四个方面 (v1.83): 开局、战术、战略、残局各下得怎样 ----
// 开局: 头 10 回合 (残局来得早的到残局为止); 残局: 双方的马、象、车、后加起来不到 7 个以后;
// 战术: 开局谱着以外, 吃子、将军、捉双的步, 还有「走对走错差很多」的步 (最好和第二好的走法差 10 以上, 或者这步掉了 10 以上);
// 战略: 开局和残局中间, 不算战术的安静的步。
export const AREAS = [
  { key: 'opening', name: '开局' },
  { key: 'tactics', name: '战术' },
  { key: 'strategy', name: '战略' },
  { key: 'endgame', name: '残局' },
];

// 局面里双方的马、象、车、后一共几个
export function pieceCount(fen) {
  return (String(fen).split(' ')[0].match(/[nbrqNBRQ]/g) ?? []).length;
}

// 每一步属于哪几个方面: [['opening'], ['tactics', 'strategy'] ...] (一步可以既是开局又是战术)
export function areasOf(moves, review, judged) {
  const end = moves.findIndex((m) => pieceCount(m.before) <= 6);
  const endAt = end < 0 ? moves.length : end;
  const openAt = Math.min(20, endAt);
  return moves.map((m, i) => {
    const out = [];
    if (i < openAt) out.push('opening');
    if (i >= endAt) out.push('endgame');
    const j = judged[i];
    if (j && j.kind !== 'book' && j.kind !== 'forced') {
      const wb = winFor(review.ev[i], m.color);
      const second = review.ev2?.[i];
      const sharp = second !== null && second !== undefined && wb - winFor(second, m.color) >= 10;
      const tactical = Boolean(m.captured) || m.san.includes('+') || sharp || j.loss >= 10 || j.kind === 'brilliant' || j.kind === 'great';
      if (tactical) out.push('tactics');
      else if (i >= openAt && i < endAt) out.push('strategy');
    }
    return out;
  });
}

// 平均每步掉多少胜率 → 用哪个好坏的图标 (跟每一步的门槛一样: 2 / 5 / 10 / 20)
export function areaKind(avgLoss) {
  if (avgLoss < 0.5) return 'best';
  if (avgLoss < 2) return 'excellent';
  if (avgLoss < 5) return 'good';
  if (avgLoss < 10) return 'inaccuracy';
  if (avgLoss < 20) return 'mistake';
  return 'blunder';
}

// 一方四个方面各下得怎样: { opening: 'best' / … / null (这盘没有这种步), … }
export function areaGrades(moves, review, judged, color) {
  const tags = areasOf(moves, review, judged);
  const out = {};
  for (const a of AREAS) {
    const losses = [];
    moves.forEach((m, i) => {
      if (m.color === color && judged[i] && tags[i].includes(a.key)) losses.push(judged[i].kind === 'book' ? 0 : judged[i].loss);
    });
    out[a.key] = losses.length ? areaKind(losses.reduce((x, y) => x + y, 0) / losses.length) : null;
  }
  return out;
}

// ---- 认技巧 (v1.85, chessskills.js 的清单) ----
const VAL = VALUE;
const SKILL_CENTER = new Set(['d4', 'e4', 'd5', 'e5']);
const FILES = 'abcdefgh';
const tryGame = (fen) => {
  try {
    return new Chess(fen);
  } catch {
    return null;
  }
};
const material = (g, color) => g.board().flat().reduce((n, sq) => n + (sq && sq.color === color ? VAL[sq.type] : 0), 0);
// 离棋盘正中间几步 (王走过去要几步)
const fromCenter = (sq) => Math.max(Math.abs(FILES.indexOf(sq[0]) - 3.5), Math.abs(Number(sq[1]) - 4.5));

// color 的两个车是不是连着 (同一行或同一列, 中间没有别的子)
function rooksConnected(g, color) {
  const rooks = [];
  for (const row of g.board()) for (const sq of row) if (sq && sq.color === color && sq.type === 'r') rooks.push(sq.square);
  if (rooks.length !== 2) return false;
  const [a, b] = rooks;
  const fa = FILES.indexOf(a[0]);
  const fb = FILES.indexOf(b[0]);
  const ra = Number(a[1]);
  const rb = Number(b[1]);
  if (ra === rb) {
    for (let f = Math.min(fa, fb) + 1; f < Math.max(fa, fb); f++) if (g.get(`${FILES[f]}${ra}`)) return false;
    return true;
  }
  if (fa === fb) {
    for (let r = Math.min(ra, rb) + 1; r < Math.max(ra, rb); r++) if (g.get(`${a[0]}${r}`)) return false;
    return true;
  }
  return false;
}

// 这个兵是不是通路兵 (前面和左右两列都没有对方的兵)
function isPassed(g, sq, color) {
  const f = FILES.indexOf(sq[0]);
  const r = Number(sq[1]);
  for (const row of g.board())
    for (const p of row) {
      if (!p || p.type !== 'p' || p.color === color) continue;
      const pf = FILES.indexOf(p.square[0]);
      const pr = Number(p.square[1]);
      if (Math.abs(pf - f) <= 1 && (color === 'w' ? pr > r : pr < r)) return false;
    }
  return true;
}

// 一步棋练到了哪些技巧 (只看这步本身, 不管开没开、是不是自己走的)。
//   m: chess.js 的走法 (带 before / after); i: 第几步 (从 0 数); prev: 上一步; bad: 这步是不是走坏了 (走坏了的不算)
export function skillsOfMove(m, { i = 0, prev = null, bad = false } = {}) {
  if (bad || !m) return [];
  const before = tryGame(m.before);
  const after = tryGame(m.after);
  if (!before || !after) return [];
  const me = m.color;
  const them = me === 'w' ? 'b' : 'w';
  const out = [];
  if (m.captured) {
    if (prev?.captured && prev.to === m.to) out.push('recapture');
    else if (VAL[m.captured] >= 3 && (!after.isAttacked(m.to, them) || VAL[m.captured] > VAL[m.piece])) out.push('freePiece');
  }
  if (!m.captured && m.piece !== 'k' && m.piece !== 'p') {
    // 被打的子 (被便宜的子打、或者没人保护) 挪到了没危险的地方
    const danger = (g, sq) => {
      const by = g.attackers(sq, them);
      return by.length > 0 && (by.some((a) => VAL[g.get(a).type] < VAL[m.piece]) || !g.isAttacked(sq, me));
    };
    if (danger(before, m.from) && !danger(after, m.to)) out.push('savePiece');
  }
  if (m.piece === 'p' && SKILL_CENTER.has(m.to) && i < 16) out.push('center');
  if ((m.piece === 'n' || m.piece === 'b') && m.from[1] === (me === 'w' ? '1' : '8') && i < 20) out.push('develop');
  if (m.san.startsWith('O-O') && i < 24) out.push('castle');
  if (after.isCheckmate()) out.push('mate');
  else if (m.san.includes('+')) out.push('check');
  // 捉双: 走的子同时打到对方两个值钱的子 (王, 比它值钱的, 或者没人保护的; 兵不算)
  if (m.piece !== 'k') {
    let n = 0;
    for (const row of after.board())
      for (const sq of row) {
        if (!sq || sq.color !== them || sq.type === 'p') continue;
        if (!after.attackers(sq.square, me).includes(m.to)) continue;
        if (sq.type === 'k' || VAL[sq.type] > VAL[m.piece] || !after.isAttacked(sq.square, them)) n++;
      }
    if (n >= 2) out.push('fork');
  }
  if (m.captured && VAL[m.captured] === VAL[m.piece] && VAL[m.piece] >= 3 && after.isAttacked(m.to, them) && material(before, me) - material(before, them) >= 2) out.push('tradeAhead');
  if (m.piece === 'r' && !m.captured && m.from[0] !== m.to[0] && !after.board().some((row) => row.some((sq) => sq && sq.type === 'p' && sq.square[0] === m.to[0]))) out.push('openFile');
  if (!rooksConnected(before, me) && rooksConnected(after, me)) out.push('connectRooks');
  if (m.promotion) out.push('promote');
  if (m.piece === 'k' && !m.san.startsWith('O-O') && !before.inCheck() && pieceCount(m.before) <= 6 && fromCenter(m.to) < fromCenter(m.from)) out.push('kingActive');
  if (m.piece === 'p' && !m.captured && !m.promotion && isPassed(after, m.to, me)) out.push('passedPawn');
  return out;
}

// ---- 吃掉的子、多几分 (v1.85, 照 chess.com 棋盘上下名字旁边那样) ----
const START_COUNT = { p: 8, n: 2, b: 2, r: 2, q: 1 };
const CAPTURE_ORDER = ['p', 'b', 'n', 'r', 'q'];
// 局面里双方各吃掉了对方哪些子 (跟开局时比少了哪些; 兵变成后的, 少了的兵也算进去), 和子力多几分 (兵 1、马象 3、车 5、后 9)
//   返回 { took: { w: ['p', 'p', 'n', …] 白方吃掉的黑子, b: […] }, lead: { w: 白方多几分 (少了是负的), b } }
export function materialOf(fen) {
  const count = { w: { p: 0, n: 0, b: 0, r: 0, q: 0 }, b: { p: 0, n: 0, b: 0, r: 0, q: 0 } };
  for (const ch of String(fen).split(' ')[0]) {
    if (!/[pnbrqPNBRQ]/.test(ch)) continue;
    count[ch === ch.toUpperCase() ? 'w' : 'b'][ch.toLowerCase()]++;
  }
  const took = { w: [], b: [] };
  for (const c of ['w', 'b']) {
    const them = c === 'w' ? 'b' : 'w';
    for (const t of CAPTURE_ORDER) for (let i = count[them][t]; i < START_COUNT[t]; i++) took[c].push(t);
  }
  const score = (c) => Object.entries(count[c]).reduce((n, [t, k]) => n + VALUE[t] * k, 0);
  const d = score('w') - score('b');
  return { took, lead: { w: d, b: 0 - d } };
}

// ---- 将死的名字 (v1.85, 用户拿 chess.com 终局的截图要的: 它说「教科书式的梯子杀」) ----
export const MATE_PATTERNS = {
  fool: { name: '愚人杀', desc: '开局才走两步就被将死，最快的将死。' },
  scholar: { name: '学者杀', desc: '后和象一起打 f7（黑方是 f2）这个最弱的格子。' },
  smothered: { name: '闷杀', desc: '王被自己的子围得动不了，马跳过来将死。' },
  backRank: { name: '底线杀', desc: '王被自己的兵挡在底线上，车或后沿着底线将死。' },
  ladder: { name: '梯子杀', desc: '两个大子一个看住一条线，另一个在边上将军，把王一步一步赶到边上。' },
  kiss: { name: '贴身杀', desc: '后贴着王将军，后面有自己的子保护着后。' },
};

const FILES_ = 'abcdefgh';
const neighbors = (sq) => {
  const f = FILES_.indexOf(sq[0]);
  const r = Number(sq[1]);
  const out = [];
  for (let df = -1; df <= 1; df++)
    for (let dr = -1; dr <= 1; dr++) {
      if ((df || dr) && f + df >= 0 && f + df < 8 && r + dr >= 1 && r + dr <= 8) out.push(`${FILES_[f + df]}${r + dr}`);
    }
  return out;
};

// 这步将死的是哪种杀法 (MATE_PATTERNS 的键); 不是将死、认不出来: null。i: 第几步 (从 0 数)
export function matePattern(m, i = 99) {
  let g;
  try {
    g = new Chess(m.after);
  } catch {
    return null;
  }
  if (!g.isCheckmate()) return null;
  const loser = g.turn();
  const winner = m.color;
  const k = g.findPiece({ type: 'k', color: loser })[0];
  const checkers = g.attackers(k, winner);
  if (i <= 3 && loser === 'w') return 'fool';
  if (i <= 9 && m.piece === 'q' && m.captured && (m.to === 'f7' || m.to === 'f2')) return 'scholar';
  const around = neighbors(k);
  if (checkers.length === 1 && g.get(checkers[0]).type === 'n' && around.every((sq) => g.get(sq)?.color === loser)) return 'smothered';
  if (checkers.length === 1) {
    const c = checkers[0];
    const heavy = (sq) => {
      const p = g.get(sq);
      return p && p.color === winner && (p.type === 'q' || p.type === 'r');
    };
    if (heavy(c)) {
      // 底线杀: 王在自己的底线上, 前面一排挡着自己的子, 车或后在底线上将军
      const back = loser === 'w' ? '1' : '8';
      const front = loser === 'w' ? '2' : '7';
      if (k[1] === back && c[1] === back && around.filter((sq) => sq[1] === front && g.get(sq)?.color === loser).length >= 2) return 'backRank';
      // 梯子杀: 王在边上, 将军的大子跟王在同一条边线上, 另一个大子在里面挨着的那条线上
      const onRank = (r) => FILES_.split('').some((f) => `${f}${r}` !== c && heavy(`${f}${r}`));
      const onFile = (f) => [1, 2, 3, 4, 5, 6, 7, 8].some((r) => `${f}${r}` !== c && heavy(`${f}${r}`));
      if ((k[1] === '8' || k[1] === '1') && c[1] === k[1] && onRank(k[1] === '8' ? '7' : '2')) return 'ladder';
      if ((k[0] === 'a' || k[0] === 'h') && c[0] === k[0] && onFile(k[0] === 'a' ? 'b' : 'g')) return 'ladder';
    }
    if (g.get(c).type === 'q' && around.includes(c) && g.isAttacked(c, winner)) return 'kiss';
  }
  return null;
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
