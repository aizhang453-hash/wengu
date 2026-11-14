// 国际象棋的讲解 (v1.82): 每一步说什么 (吃了什么、送了什么、该怎么走、几步能杀), 是程序看棋盘算出来的;
// 人物 (chesspeople.js) 只是在前面加一句自己的口头禅、换个表情。

import { Chess } from './vendor/chess.js';
import { PIECE_ZH, VALUE, zhSan, mateIn, winFor, BAD } from './chess.js';

// 这种好坏, 讲解的人是什么表情 (views/chessface.js 画)
export const MOOD = { brilliant: 'wow', great: 'happy', best: 'happy', excellent: 'smile', good: 'smile', forced: 'normal', inaccuracy: 'hmm', mistake: 'worried', miss: 'worried', blunder: 'shock' };

// ---- 看棋盘 ----

const NAME = (p) => PIECE_ZH[p] ?? '';

function tryGame(fen) {
  try {
    return new Chess(fen);
  } catch {
    return null;
  }
}

// uci (e2e4) → 这个局面里的走法 (带中文写法), 走不了是 null
export function moveOf(fen, uci) {
  const g = tryGame(fen);
  if (!g || !uci) return null;
  try {
    const m = g.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
    return m ? { ...m, zh: zhSan(m.san), mate: g.isCheckmate() } : null;
  } catch {
    return null;
  }
}

// 这步走完, 走的子同时打到对方几个值钱的子 (含王): 双重攻击
//   (打到的: 王, 比走的子值钱的, 或者没人保护的; 兵不算)
export function forkTargets(m) {
  const g = tryGame(m.after);
  if (!g || m.piece === 'k') return [];
  const them = m.color === 'w' ? 'b' : 'w';
  const out = [];
  for (const row of g.board()) {
    for (const sq of row) {
      if (!sq || sq.color !== them || sq.type === 'p') continue;
      if (!g.attackers(sq.square, m.color).includes(m.to)) continue;
      if (sq.type === 'k' || VALUE[sq.type] > VALUE[m.piece] || !g.isAttacked(sq.square, them)) out.push(sq.type);
    }
  }
  return out;
}

const CENTER = new Set(['d4', 'e4', 'd5', 'e5']);

// 这个局面里, color 这一方最值钱的「危险的子」(被对方打到, 又没人保护或者被更便宜的子打到; 马、象、车、后): 没有是 ''
export function hanging(fen, color) {
  const g = tryGame(fen);
  if (!g) return '';
  const them = color === 'w' ? 'b' : 'w';
  let worst = '';
  for (const row of g.board()) {
    for (const sq of row) {
      if (!sq || sq.color !== color || sq.type === 'p' || sq.type === 'k') continue;
      const by = g.attackers(sq.square, them);
      if (!by.length) continue;
      const cheap = by.some((a) => VALUE[g.get(a).type] < VALUE[sq.type]);
      if ((cheap || !g.isAttacked(sq.square, color)) && (!worst || VALUE[sq.type] > VALUE[worst])) worst = sq.type;
    }
  }
  return worst;
}

// 一步棋的讲解。
//   m: 这步 (chess.js 的走法, 带 before / after); kind: 好坏; ply: 第几步 (从 0 数);
//   before / after: 走前、走后打分 (白方看); best: 引擎在走前最想走的 (uci); reply: 走完以后对手最好的应着 (uci, 没有是 '');
//   who: 怎么称呼走这步的人 ('你' / '对手' / '白方'……); whose: 对方怎么称呼 ('对手' / '你'……)
// 返回几句话 (数组), 不带人物的口头禅
export function explainMove({ m, kind, ply = 0, before, after, best = '', reply = '', who = '你', whose = '对手' }) {
  const out = [];
  const me = m.color;
  const took = m.captured ? NAME(m.captured) : '';
  const after_ = tryGame(m.after);
  const mated = after_?.isCheckmate();
  if (mated) return [`${zhSan(m.san)}，将死！`];

  // 这步做了什么
  const did = [];
  if (m.san.startsWith('O-O')) did.push('王车易位，把王藏到了安全的地方');
  else if (m.promotion) did.push(`兵走到底，变成了${NAME(m.promotion)}`);
  else if (took) did.push(`吃掉了${whose}的${took}`);
  if (m.san.includes('+')) did.push('将军');
  const fork = forkTargets(m);
  if (fork.length >= 2) did.push(`同时打到${whose}的${[...new Set(fork)].map(NAME).join('和')}（双重攻击）`);
  if (!did.length && ply < 12 && !BAD.has(kind)) {
    if (m.piece === 'p' && CENTER.has(m.to)) did.push('兵占中心');
    else if ((m.piece === 'n' || m.piece === 'b') && /[18]/.test(m.from[1])) did.push(`把${NAME(m.piece)}走出来`);
  }

  const bestMove = best && moveOf(m.before, best);
  const bestText = () => {
    if (!bestMove) return '';
    const why = [];
    const mi = mateIn(before) * (me === 'w' ? 1 : -1);
    if (bestMove.mate) why.push('直接将死');
    else if (mi > 0) why.push(`${mi} 步就能将死`);
    else if (bestMove.captured) why.push(`吃掉${whose}的${NAME(bestMove.captured)}`);
    else if (bestMove.san.includes('+')) why.push('将军');
    return `更好的是 ${bestMove.zh}${why.length ? `（${why.join('，')}）` : ''}。`;
  };

  // 走完能逼杀
  const myMate = mateIn(after) * (me === 'w' ? 1 : -1);
  const mateNote = myMate > 0 ? (myMate === 1 ? '下一步就能将死。' : `再走 ${myMate} 步就能将死。`) : '';
  if (kind === 'forced') out.push(`只有 ${zhSan(m.san)} 能走。`);
  else if (kind === 'brilliant') out.push(`${zhSan(m.san)}：弃子！看着像白送，其实是最好的一步${did.length ? `，${did.join('，')}` : ''}。${mateNote}`);
  else if (kind === 'great') out.push(`${zhSan(m.san)}：只有这一步能${winFor(before, me) >= 60 ? '保住优势' : '撑住局面'}，别的走法都会吃亏${did.length ? `。${did.join('，')}` : ''}。${mateNote}`);
  else if (!BAD.has(kind)) {
    out.push(`${zhSan(m.san)}${did.length ? `，${did.join('，')}` : ''}。${mateNote}`);
    if (kind !== 'best' && bestMove && bestMove.san !== m.san && (kind === 'good' || ply >= 6)) out.push(`引擎最想走的是 ${bestMove.zh}，差不多。`);
  } else {
    if (did.length) out.push(`${zhSan(m.san)}，${did.join('，')}。`);
    // 走完以后吃什么亏
    const theirMate = mateIn(after) * (me === 'w' ? -1 : 1);
    const r = reply && moveOf(m.after, reply);
    const hadMate = mateIn(before) * (me === 'w' ? 1 : -1);
    if (theirMate > 0) out.push(theirMate === 1 ? `这下${whose}一步就能将死${who === '你' ? '你' : who}：${r ? r.zh : ''}。` : `这下${whose}有 ${theirMate} 步杀。`);
    else if (hadMate > 0 && kind !== 'inaccuracy') out.push(`本来 ${hadMate} 步就能将死${whose}，错过了。`);
    else if (r && r.captured && VALUE[r.captured] >= 3 && !(m.captured && VALUE[m.captured] >= VALUE[r.captured])) out.push(`${whose}可以走 ${r.zh}，吃掉${who === '你' ? '你' : who}的${NAME(r.captured)}。`);
    else if (r && !r.captured && hanging(r.after, me)) out.push(`${whose}走 ${r.zh} 以后，${who === '你' ? '你' : who}的${NAME(hanging(r.after, me))}就危险了。`);
    else if (kind === 'miss') out.push(`${whose}刚才走错了，这里本来能占到便宜。`);
    const bt = bestText();
    if (bt) out.push(bt);
  }
  return out;
}

// 整盘的总结: 准确率、几步好几步坏、最关键的一步
export function summary({ acc, counts, turning = null, me = '' }) {
  const out = [];
  const meAcc = me ? acc[me] : null;
  if (meAcc !== null && meAcc !== undefined) out.push(`你这盘的准确率是 ${meAcc.toFixed(1)}。`);
  else out.push(`白方准确率 ${acc.w?.toFixed(1) ?? '—'}，黑方 ${acc.b?.toFixed(1) ?? '—'}。`);
  const side = me || 'w';
  const c = counts[side] ?? {};
  const good = (c.brilliant ?? 0) + (c.great ?? 0);
  const bad = (c.mistake ?? 0) + (c.blunder ?? 0) + (c.miss ?? 0);
  if (good) out.push(`${me ? '你' : '白方'}走出了 ${good} 步好棋${c.brilliant ? `（其中 ${c.brilliant} 步妙着）` : ''}。`);
  if (bad) out.push(`有 ${bad} 步失误或大错，我们一起看看。`);
  else out.push('没有大的失误，下得很稳。');
  if (turning !== null) out.push(`最关键的是第 ${Math.floor(turning / 2) + 1} 回合。`);
  return out;
}

// 对手下一步想干什么 (教练提醒你): 假装轮到对手再走一步, 引擎最想走的那步 (uci) 是吃子或者能将死 → 一句提醒; 没有: ''
//   fen: 现在的局面 (轮到你走); threat: 对手最想走的 (uci); mate: 对手几步能杀 (0: 不能); whose: 怎么称呼你 ('你')
export function threatText(fen, threat, { mate = 0 } = {}) {
  if (!threat) return '';
  const parts = fen.split(' ');
  parts[1] = parts[1] === 'w' ? 'b' : 'w';
  parts[3] = '-';
  const m = moveOf(parts.join(' '), threat);
  if (!m) return '';
  if (mate === 1 || m.mate) return `对方想走 ${m.zh}，直接将死你！`;
  if (mate > 1) return `对方有 ${mate} 步杀的棋，先看好你的王。`;
  if (m.captured && VALUE[m.captured] >= 3) return `对方想走 ${m.zh}，吃掉你的${NAME(m.captured)}。`;
  return '';
}
