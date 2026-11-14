// 电脑对手怎么走 (v1.82): 按分数 (相当于 chess.com 快棋的分) 下, 每个人物有自己的爱好 (style) 和爱走的开局 (OPENINGS)。
//
// 怎么变弱: 引擎先列出它觉得最好的几步 (multipv) 和每步的打分, 对手在里面挑 ——
//   越差的走法越不容易挑到 (差多少: 走完以后胜率掉多少; tau 越大越容易挑差的), 另外有 slip 的机会随手走一步 (粗心)。
//   分数越高, 想得越深 (depth)、tau 和 slip 越小。最强 (西萨): 引擎全力下。
// 这些数 (ANCHORS) 是拿 Lichess 公开的真人棋局和对手之间互相下棋校准的 (工具在 ~/.local/share/claude-tools/chess-calib/,
//   结果见 CHANGELOG v1.82)。看见一步杀就走、已经赢定了就少乱走 (不然弱的对手一直赢不下来)。
// 人物的爱好只在「不差」的几步里加分 (走完胜率掉不到 8), 不会因为爱好多送子 —— 小豆除外: 他看见能吃的就想吃。

import { winFor, VALUE, MATE } from './chess.js';

// 校准好的几个点 (分数 → 参数), 中间的分数照两边插。2026-11-13 校准 (见 CHANGELOG v1.82), 分两步:
//   1. 拿 Lichess 公开的真人棋局, 按分数段算真人在局面还接近时「掉的胜率、大错和失误的比例」, 每个分数挑最像的参数
//      —— 每步犯错像真人了, 可是让相邻的对手互相下, 强弱拉不开 (800 对 500 只赢一半): 真人犯错不是随机的, 电脑随手错伤害小。
//   2. 所以用户选了「再调一轮」: 1400 (真人资料最多) 照第 1 步不动, 往上往下一级一级调, 让相邻的互相下时,
//      强的得分跟分差对上 (差 300 分得八成五左右, 差 400 分九成左右)。低分的几个因此比同分的真人更「乱」一些 (随手走的多)。
//   最后相邻的互相下各 60–80 盘, 强的得分: 250→500 75%、500→800 86%、800→1100 84%、1100→1400 78%、1400→1800 88%、1800→2200 90%
//   (差 250 分该 81%, 差 300 分该 85%, 差 400 分该 91%; 每个结果有 ±4–5% 的误差)。
//   分越高想得越深 (depth); tau、slip 不一定越来越小。
export const ANCHORS = [
  { rating: 250, depth: 1, multipv: 8, tau: 16, slip: 0.85 },
  { rating: 500, depth: 3, multipv: 8, tau: 8, slip: 0.7 },
  { rating: 800, depth: 4, multipv: 8, tau: 8, slip: 0.4 },
  { rating: 1100, depth: 5, multipv: 8, tau: 8, slip: 0.2 },
  { rating: 1400, depth: 8, multipv: 6, tau: 8, slip: 0.1 },
  { rating: 1800, depth: 10, multipv: 6, tau: 4, slip: 0.04 },
  { rating: 2200, depth: 12, multipv: 5, tau: 1.5, slip: 0.01 },
];
export const FULL = { depth: 18, movetime: 1500, full: true };

// 某个分数的参数 (0 或者比最高的点还高很多: 全力)
export function botParams(rating) {
  const r = Number(rating) || 0;
  if (!r || r >= 2800) return FULL;
  const a = ANCHORS;
  const exact = a.find((x) => x.rating === r);
  if (exact) return { ...exact };
  if (r <= a[0].rating) return { ...a[0] };
  for (let i = 1; i < a.length; i++) {
    if (r <= a[i].rating) {
      const t = (r - a[i - 1].rating) / (a[i].rating - a[i - 1].rating);
      const mix = (k) => a[i - 1][k] + (a[i][k] - a[i - 1][k]) * t;
      return { rating: r, depth: Math.round(mix('depth')), multipv: Math.round(mix('multipv')), tau: mix('tau'), slip: mix('slip') };
    }
  }
  // 2200 到 2800 之间: 照最后两个点往外推一点, 不低于 0
  const [p, q] = a.slice(-2);
  const t = (r - q.rating) / (q.rating - p.rating);
  return { rating: r, depth: Math.min(16, Math.round(q.depth + (q.depth - p.depth) * t)), multipv: q.multipv, tau: Math.max(0.5, q.tau + (q.tau - p.tau) * t), slip: Math.max(0, q.slip + (q.slip - p.slip) * t) };
}

// 人物的爱好 (乘在挑中的机会上)
export const STYLES = {
  xiaodou: { capture: 3, greedy: true }, // 看见能吃的就吃 (包括不该吃的)
  thomas: { knight: 2.2, forward: 1.5 }, // 爱用马, 往前冲
  xiaoyu: { check: 2.2, capture: 1.5 }, // 爱将军、爱进攻
  zhou: { trade: 2.2 }, // 爱兑子
  lucas: { forward: 1.4, check: 1.4 },
  hassan: { quiet: 1.5 }, // 不急, 慢慢调动
  natasha: {},
  sissa: {},
};

// 爱走的开局 (白方、黑方各几条, 照走法写); 局面对得上就照着走, 走完了交给引擎
export const OPENINGS = {
  xiaoyu: { w: [['e4', 'e5', 'Nf3', 'Nc6', 'Bc4']], b: [['e4', 'c5'], ['d4', 'd5']] },
  zhou: { w: [['d4', 'd5', 'Bf4'], ['d4', 'Nf6', 'Bf4']], b: [['e4', 'e5', 'Nf3', 'Nc6'], ['d4', 'd5']] },
  lucas: {
    w: [
      ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'b4'], // 埃文斯弃兵
      ['e4', 'e5', 'f4'], // 王翼弃兵
      ['d4', 'd5', 'c4'], // 后翼弃兵
    ],
    b: [
      ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nf6'], // 双马防御
      ['d4', 'Nf6', 'c4', 'e5'], // 布达佩斯弃兵
    ],
  },
  hassan: { w: [['d4', 'Nf6', 'c4'], ['c4']], b: [['e4', 'c6', 'd4', 'd5'], ['d4', 'Nf6', 'c4', 'g6']] },
  natasha: {
    w: [
      ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6', 'O-O'], // 西班牙开局
      ['e4', 'c5', 'Nf3', 'd6', 'd4'],
      ['e4', 'e6', 'd4', 'd5', 'Nc3'],
    ],
    b: [['e4', 'e5', 'Nf3', 'Nc6'], ['d4', 'd5', 'c4', 'e6']],
  },
};

// 开局: 下过的 (走法列表) 对得上哪几条, 挑一条的下一步; 没有: null
export function bookMove(id, color, history, rng = Math.random) {
  const lines = OPENINGS[id]?.[color] ?? [];
  const n = history.length;
  const next = lines.filter((l) => l.length > n && history.every((san, i) => l[i] === san)).map((l) => l[n]);
  return next.length ? next[Math.floor(rng() * next.length) % next.length] : null;
}

// 这一步合不合人物的爱好 (move: chess.js 的走法)
export function styleBonus(style, move) {
  if (!style || !move) return 1;
  let k = 1;
  if (move.captured) {
    k *= style.capture ?? 1;
    if (style.trade && VALUE[move.captured] === VALUE[move.piece] && move.piece !== 'p') k *= style.trade;
  } else k *= style.quiet ?? 1;
  if (move.san?.includes('+')) k *= style.check ?? 1;
  if (move.piece === 'n') k *= style.knight ?? 1;
  if (style.forward && move.piece !== 'k') {
    const up = (Number(move.to[1]) - Number(move.from[1])) * (move.color === 'w' ? 1 : -1);
    if (up > 0) k *= style.forward;
  }
  return k;
}

// 挑一步。cands: 引擎列的几步 [{ uci, ev 走完的打分 (白方看) }] (第一个最好); legal: 所有能走的 (chess.js 的走法, 带 uci);
// turn: 谁走; params: botParams 的; style: STYLES 的; rng: 随机数 (测试时固定)
export function pickMove({ cands, legal, turn, params, style = null, rng = Math.random }) {
  const byUci = new Map(legal.map((m) => [m.uci, m]));
  const usable = cands.filter((c) => byUci.has(c.uci) && Number.isFinite(c.ev));
  if (!usable.length) return legal.length ? legal[Math.floor(rng() * legal.length)].uci : null;
  if (params.full) return usable[0].uci;
  const top = winFor(usable[0].ev, turn);
  // 一步就能将死: 看见了就走 (偶尔也会看漏)
  const mate = usable.find((c) => Math.abs(c.ev) >= MATE && winFor(c.ev, turn) === 100);
  if (mate && rng() >= params.slip * 0.3) return mate.uci;
  // 已经赢定了 (胜率 95 以上): 人会小心一点, 随手走、挑差的都少很多 (不然一直赢不下来)
  const calm = top >= 95;
  const slip = calm ? params.slip * 0.25 : params.slip;
  const tau = calm ? params.tau * 0.5 : params.tau;
  // 粗心: 随手走一步 (爱吃子的多半随手吃)
  if (legal.length > 1 && rng() < slip) {
    const w = legal.map((m) => (style?.greedy ? styleBonus(style, m) : 1));
    return weighted(legal, w, rng).uci;
  }
  const weights = usable.map((c) => {
    const loss = Math.max(0, top - winFor(c.ev, turn));
    const like = style && (loss < 8 || style.greedy) ? styleBonus(style, byUci.get(c.uci)) : 1;
    return Math.exp(-loss / Math.max(0.05, tau)) * like;
  });
  return weighted(usable, weights, rng).uci;
}

function weighted(list, weights, rng) {
  const sum = weights.reduce((a, b) => a + b, 0);
  let x = rng() * sum;
  for (let i = 0; i < list.length; i++) {
    x -= weights[i];
    if (x <= 0) return list[i];
  }
  return list[list.length - 1];
}
