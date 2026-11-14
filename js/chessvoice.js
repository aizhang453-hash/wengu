// 国际象棋复盘时教练说的话 (v1.83): 用户 2026-11-14 说 chess.com 的教练按自己的性格说话、每一步都有话说, 温故的不如它。
// 做法: 程序先看懂这一步做了什么 (moveFacts: 出子、吃回来、将军、捉双、送了子、错过了将死……),
// 再按教练挑他自己的说法 (VOICES: 每个教练每种情况几句, 句子里的 {mv} 这种空换成这一步的东西)。
// 句子都是温故自己写的; 换教练、念出来的口气也跟着换 (tts: 语速、音高)。

import { Chess } from './vendor/chess.js';
import { PIECE_ZH, VALUE, zhSan, mateIn, BAD, matePattern, MATE_PATTERNS } from './chess.js';
import { moveOf, forkTargets, hanging } from './chesscoach.js';
import { pickLine } from './chesspeople.js';

const NAME = (p) => PIECE_ZH[p] ?? '';
const CENTER = new Set(['d4', 'e4', 'd5', 'e5']);

function tryGame(fen) {
  try {
    return new Chess(fen);
  } catch {
    return null;
  }
}

// 这个格子上 color 的子是不是「危险」(被打到, 又没人保护或者被更便宜的子打到)
function inDanger(g, sq, color) {
  const p = g.get(sq);
  if (!p || p.color !== color || p.type === 'k' || p.type === 'p') return false;
  const them = color === 'w' ? 'b' : 'w';
  const by = g.attackers(sq, them);
  if (!by.length) return false;
  return by.some((a) => VALUE[g.get(a).type] < VALUE[p.type]) || !g.isAttacked(sq, color);
}

// 为什么那步好 (跟在走法后面的半句, 带逗号): 「，直接将死」「，3 步就能将死」「，吃掉对手的车」「，将军」「，同时打到对手的王和车」
//   mv: moveOf 的结果; mate: 走的人走这步以后几步杀 (0: 不是杀棋); them: 对方怎么称呼
export function whyText(mv, { mate = 0, them = '对手' } = {}) {
  if (!mv) return '';
  if (mv.mate) return '，直接将死';
  if (mate > 0) return `，${mate} 步就能将死`;
  const fork = forkTargets(mv);
  if (fork.length >= 2) return `，同时打到${them}的${[...new Set(fork)].map(NAME).join('和')}`;
  if (mv.captured && VALUE[mv.captured] >= 1) return `，吃掉${them}的${NAME(mv.captured)}`;
  if (mv.san.includes('+')) return '，将军';
  return '';
}

// 一步棋做了什么 (从走的人看)。
//   m: chess.js 的走法 (带 before / after); kind: 好坏; ply: 第几步 (从 0 数); before / after: 走前、走后打分 (白方看);
//   best: 走前引擎最想走的 (uci); reply: 走完以后对方最好的应着 (uci); prev: 上一步 (chess.js 的走法, 认「吃回来」);
//   book: 开局谱 ({ book, name }); them: 对方怎么称呼 (算「为什么」那半句用)
// 返回 { kind, mv, piece, took, acts: [做了什么, 要紧的在前], bad: 走坏了吃什么亏, best, why, reply, lose, n, … }
export function moveFacts({ m, kind, ply = 0, before = 0, after = 0, best = '', reply = '', prev = null, book = null, them = '对手' }) {
  const color = m.color;
  const sgn = color === 'w' ? 1 : -1;
  const other = color === 'w' ? 'b' : 'w';
  const f = { kind, mv: zhSan(m.san), piece: NAME(m.piece), took: m.captured ? NAME(m.captured) : '', acts: [] };
  const g = tryGame(m.after);
  if (g?.isCheckmate()) {
    f.acts.push('mate');
    const pat = MATE_PATTERNS[matePattern(m, ply)];
    if (pat) {
      f.pattern = pat.name;
      f.desc = pat.desc;
    }
    return f;
  }
  if (kind === 'forced') f.acts.push('forced');
  if (book?.book) {
    f.acts.push(book.name ? 'book' : 'bookPlain');
    f.open = book.name;
  }
  if (m.san.startsWith('O-O')) f.acts.push('castle');
  if (m.promotion) {
    f.acts.push('promote');
    f.promo = NAME(m.promotion);
  }
  const fork = forkTargets(m);
  if (fork.length >= 2) {
    f.acts.push('fork');
    f.targets = [...new Set(fork)].map(NAME).join('和');
  }
  if (m.captured) {
    const back = g ? g.isAttacked(m.to, other) : true; // 对方能不能吃回来
    if (prev?.captured && prev.to === m.to) f.acts.push('recapture');
    else if (!back || VALUE[m.captured] > VALUE[m.piece]) f.acts.push(VALUE[m.captured] >= 1 ? 'winPiece' : 'capture');
    else if (VALUE[m.captured] === VALUE[m.piece]) f.acts.push('trade');
    else f.acts.push('capture');
  }
  if (m.san.includes('+') && !f.acts.includes('fork')) f.acts.push('check');
  if (tryGame(m.before)?.inCheck()) f.acts.push('evade');
  if (fork.length === 1 && fork[0] !== 'k') {
    f.acts.push('threat');
    f.targets = NAME(fork[0]);
  }
  const was = tryGame(m.before);
  if (was && !m.captured && inDanger(was, m.from, color) && g && !inDanger(g, m.to, color)) f.acts.push('escape');
  if (m.piece === 'p' && CENTER.has(m.to) && ply < 16) f.acts.push('center');
  if ((m.piece === 'n' || m.piece === 'b') && /[18]/.test(m.from[1]) && ply < 24) f.acts.push('develop');
  if (m.piece === 'p') f.acts.push('pawn');
  f.acts.push('quiet');

  // 走完能逼杀
  const myMate = mateIn(after) * sgn;
  if (myMate > 0) {
    f.n = myMate;
    f.soon = myMate === 1 ? '下一步' : `再走 ${myMate} 步`;
  }

  // 更好的走法
  const played = m.from + m.to + (m.promotion ?? '');
  const hadMate = mateIn(before) * sgn;
  const bm = best && best !== played ? moveOf(m.before, best) : null;
  if (bm) {
    f.best = bm.zh;
    f.why = whyText(bm, { mate: hadMate > 0 ? hadMate : 0, them });
  }

  // 走坏了: 吃什么亏
  if (BAD.has(kind)) {
    const theirMate = mateIn(after) * -sgn;
    const r = reply ? moveOf(m.after, reply) : null;
    if (theirMate > 0) {
      f.bad = theirMate === 1 && r ? 'allowMate1' : 'allowMate';
      f.n = theirMate;
      f.reply = r?.zh ?? '';
    } else if (hadMate > 0 && kind !== 'inaccuracy') {
      f.bad = 'missedMate';
      f.n = hadMate;
    } else if (r && r.captured && VALUE[r.captured] >= 3 && !(m.captured && VALUE[m.captured] >= VALUE[r.captured])) {
      f.bad = 'losePiece';
      f.reply = r.zh;
      f.lose = NAME(r.captured);
    } else if (r && !r.captured && hanging(r.after, color)) {
      f.bad = 'danger';
      f.reply = r.zh;
      f.lose = NAME(hanging(r.after, color));
    } else if (kind === 'miss') f.bad = 'missChance';
    else f.bad = 'worse';
  }
  return f;
}

// 对方走错以后, 这边该怎么抓住: reply 是轮到这边时引擎最想走的 (uci); after: 这时候的打分 (白方看); color: 这边是哪方
export function punishFacts(fen, reply, after, color, them = '对手') {
  const r = reply ? moveOf(fen, reply) : null;
  if (!r) return null;
  const mate = mateIn(after) * (color === 'w' ? 1 : -1);
  return { reply: r.zh, why: whyText(r, { mate: mate > 0 ? mate : 0, them }) };
}

// ---- 每个教练的说法 ----
// 空: {mv} 这步 · {who} 走的人 · {whose} 对方 · {took} 吃到的子 · {piece} 走的子 · {targets} 打到的子 · {open} 开局名 · {promo} 变成的子 ·
//     {n} 几步杀 · {soon} 「下一步」「再走 3 步」 · {reply} 对方的应着 · {lose} 丢的子 · {best} 更好的走法 · {why} 「，吃掉对手的车」这种 ·
//     {acc} 准确率 · {wacc} {bacc} 白方、黑方准确率 · {phase} 开局、战术、战略、残局 · {k} 第几回合 · {bad} 几步走错
// 讲一步的 (who 可以是「你」「对手」「白方」……, 句子要都说得通):
//   mate 将死 · forced 只能这样 · book / bookPlain 开局谱着 (有没有开局名) · castle 王车易位 · promote 升变 · recapture 吃回来 ·
//   winPiece 吃白给的子 · trade 兑子 · capture 吃子 · fork 捉双 · threat 打对方的子 · check 将军 · evade 被将军了躲开 · escape 被打的子躲开 ·
//   center 兵占中心 · develop 出马出象 · pawn 挺兵 · quiet 别的 · mateNext 走完能逼杀 · brilliant 妙着 · great 好棋
// 走坏了的: allowMate1 对方一步杀 · allowMate 对方几步杀 · missedMate 错过将死 · losePiece 丢子 · danger 子危险 · missChance 没抓住对方的错 ·
//   worse 变差了 · better 更好的走法
// 对手的步 (复盘自己的棋时): oppBad 对手走错 · punish 这时候该怎么走 · oppGood 对手走得好 · oppMate 对手将死你
// 总结: sumWin / sumLose / sumDraw 赢输和 · sumOther 不是自己的棋 · sumGoodPhase 哪方面最好 · sumBadPhase 哪方面要练 · sumClean 没大错 · sumBad 走错几步 · sumTurn 关键回合
// 别的: analyse 开始看棋 · trivia 讲小知识前面那句 · showBest 「正着」按钮按了以后 ·
//   thinking 「解析」等引擎算的时候 · lineStart 解析第一步前面那句 · lineEnd 解析最后一步后面那句 (v1.84) ·
//   mastered 学会了一个技巧 · unlocked 下一个技巧打开了 ({skill} 技巧的名字, v1.85) ·
//   matePattern / oppMatePattern 认得出是哪种将死 (梯子杀、底线杀……) · patternNote 那种杀法是怎么回事 ({pattern} 名字, {desc} 一句话)
export const VOICES = {
  isabella: {
    tts: { rate: 0.95, pitch: 1.1 },
    analyse: ['我先把这盘棋从头到尾看一遍，{n} 步，别着急。', '让我慢慢看一遍这 {n} 步棋，你先喝口水。'],
    trivia: ['趁我看棋，讲个小故事：', '你知道吗？'],
    mate: ['{mv}，将死。这盘棋画上了句号。', '{mv}，将死！干净利落。'],
    forced: ['{mv}，只能这样走，没有别的选择。'],
    book: ['{mv}，{open}的走法。前人走过很多遍的路，放心走。', '{mv}，这是{open}，书上写着的走法。'],
    bookPlain: ['{mv}，开局谱上的走法，很稳妥。', '{mv}，书上也是这么走的。'],
    castle: ['{mv}，王车易位。先让国王住进安全的城堡，再去打仗。', '{mv}，王车易位，王安全了，车也出来了。'],
    promote: ['{mv}，小兵走到了底，变成了{promo}。一路走来不容易。'],
    recapture: ['{mv}，把{took}吃了回来，子力又扯平了。', '{mv}，吃回来，这是应该的。'],
    winPiece: ['{mv}，{whose}的{took}没人保护，{who}把它收下了。', '{mv}，白白吃到了{whose}的{took}。'],
    trade: ['{mv}，用子换子，换掉一个{took}。', '{mv}，兑掉一个{took}，局面简单了一些。'],
    capture: ['{mv}，{who}吃掉了{whose}的{took}。'],
    fork: ['{mv}，一个子同时打到{whose}的{targets}，这叫双重攻击。', '{mv}，双重攻击！{targets}只能救一个。'],
    threat: ['{mv}，{piece}盯上了{whose}的{targets}。', '{mv}，这步在打{whose}的{targets}，要好好应对。'],
    check: ['{mv}，将军。', '{mv}，将军，{whose}的王得先躲一躲。'],
    evade: ['{mv}，先把王从危险里救出来。', '{mv}，王先躲一躲。'],
    escape: ['{mv}，把被打的{piece}挪到了安全的地方。', '{mv}，{piece}躲开了，没让它白白丢掉。'],
    center: ['{mv}，兵走到中心。中心就像棋盘的大厅，谁占住谁说了算。', '{mv}，占中心，还给后面的子让出了路。'],
    develop: ['{mv}，把{piece}请出来了。棋子在家里待着，可帮不上忙。', '{mv}，出{piece}，一个一个把子出动起来。'],
    pawn: ['{mv}，挺兵。', '{mv}，兵往前走了一步。'],
    quiet: ['{mv}，安静的一步，把{piece}放到了更好的位置。', '{mv}，不急不躁，调整了一下{piece}。'],
    mateNext: ['{soon}就能将死了。', '注意，{soon}就能将死。'],
    brilliant: ['{mv}！看着像白送一个子，其实是最好的一步。', '{mv}，弃子！这需要勇气，也需要算得很清楚。'],
    great: ['{mv}，只有这一步能撑住，找到了它。', '{mv}，关键的一步，别的走法都会吃亏。'],
    allowMate1: ['可是这样{whose}走 {reply} 就将死了。'],
    allowMate: ['这样一来，{whose}有 {n} 步杀，王很危险。'],
    missedMate: ['其实这里 {n} 步就能将死{whose}，错过了。'],
    losePiece: ['走完以后，{whose}可以走 {reply}，吃掉{who}的{lose}。'],
    danger: ['{whose}走 {reply} 以后，{who}的{lose}就危险了。'],
    missChance: ['{whose}刚才走错了，这里本来能占到便宜。'],
    worse: ['局面变得难下了一些。', '这步让局面差了一点。'],
    better: ['更好的是 {best}{why}。', '我们看看 {best}{why}，会更好。'],
    oppBad: ['{mv}，对手走错了，机会来了。', '{mv}，对手这步有漏洞。'],
    punish: ['现在走 {reply}{why}。', '这时候走 {reply}{why}，就能抓住它。'],
    oppGood: ['{mv}，对手这步很厉害，我们要认真应对。'],
    oppMate: ['{mv}，将死。没关系，我们一起看看哪里出了问题。'],
    thinking: ['让我想想……', '我看看这里最好怎么走……'],
    lineStart: ['我们看看这里最好怎么走。', '来，一步一步看。'],
    lineEnd: ['就是这样，慢慢体会。', '这几步连起来看，是不是清楚多了？'],
    mastered: ['你学会了「{skill}」！我真为你高兴。', '「{skill}」学会了，这是好习惯。'],
    unlocked: ['下一个要练的是「{skill}」。'],
    matePattern: ['{mv}，漂亮的{pattern}，将死！'],
    oppMatePattern: ['{mv}，对手用{pattern}将死了你。没关系，我们看看哪里出了问题。'],
    patternNote: ['记住它：{desc}'],
    showBest: ['应该这样走：{best}{why}。'],
    sumWin: ['你赢了这盘棋，准确率 {acc}。', '这盘赢得漂亮，准确率 {acc}。'],
    sumLose: ['这盘输了，准确率 {acc}。输棋是最好的老师。'],
    sumDraw: ['和棋，准确率 {acc}。'],
    sumOther: ['白方准确率 {wacc}，黑方 {bacc}。'],
    sumGoodPhase: ['{phase}下得最好。'],
    sumBadPhase: ['{phase}还可以更细心。'],
    sumClean: ['没有大的失误，下得很稳。'],
    sumBad: ['有 {bad} 步走错了，我们一步一步看。'],
    sumTurn: ['最关键的是第 {k} 回合。'],
  },
  priya: {
    tts: { rate: 1.05, pitch: 1 },
    analyse: ['分析 {n} 步，稍等。', '我先用引擎过一遍，{n} 步。'],
    trivia: ['顺便说个知识点：', '小知识：'],
    mate: ['{mv}，将死。'],
    forced: ['{mv}，唯一合法的走法。'],
    book: ['{mv}，{open}，理论走法。', '{mv}，{open}的标准走法。'],
    bookPlain: ['{mv}，开局理论里的走法。'],
    castle: ['{mv}，易位。王安全了，车也连起来了。', '{mv}，及时易位，很好。'],
    promote: ['{mv}，升变成{promo}。'],
    recapture: ['{mv}，吃回{took}，子力平衡。'],
    winPiece: ['{mv}，赢得一个{took}。', '{mv}，{whose}的{took}没有保护，直接吃掉。'],
    trade: ['{mv}，兑换{took}。', '{mv}，等价交换。'],
    capture: ['{mv}，吃{took}。'],
    fork: ['{mv}，双重攻击，打{targets}。', '{mv}，捉双：{targets}。'],
    threat: ['{mv}，攻击{whose}的{targets}。'],
    check: ['{mv}，将军。', '{mv}，将军，争取先手。'],
    evade: ['{mv}，应将。'],
    escape: ['{mv}，{piece}脱离攻击。'],
    center: ['{mv}，控制中心。', '{mv}，兵占中心，抢空间。'],
    develop: ['{mv}，出子。', '{mv}，{piece}出动，加快出子。'],
    pawn: ['{mv}，挺兵。', '{mv}，兵的推进。'],
    quiet: ['{mv}，调整{piece}的位置。', '{mv}，改善子力位置。'],
    mateNext: ['{soon}将死。'],
    brilliant: ['{mv}，精彩的弃子，计算准确。'],
    great: ['{mv}，唯一能保持局面的走法。'],
    allowMate1: ['对方 {reply} 直接将死。'],
    allowMate: ['对方有 {n} 步杀。'],
    missedMate: ['这里有 {n} 步杀，没看到。'],
    losePiece: ['对方 {reply}，丢{lose}。'],
    danger: ['对方 {reply} 之后，{lose}受到攻击。'],
    missChance: ['对方失误了，这里应该惩罚。'],
    worse: ['评估下降了。', '局面变差。'],
    better: ['正着是 {best}{why}。', '应该走 {best}{why}。'],
    oppBad: ['{mv}，对手失误。', '{mv}，对手出错了。'],
    punish: ['应着是 {reply}{why}。'],
    oppGood: ['{mv}，对手走得准确。'],
    oppMate: ['{mv}，被将死。复盘找原因。'],
    thinking: ['计算中。'],
    lineStart: ['看引擎的主线。'],
    lineEnd: ['主线到这里。', '记住这个思路。'],
    mastered: ['「{skill}」掌握了。'],
    unlocked: ['下一项：「{skill}」。'],
    matePattern: ['{mv}，标准的{pattern}。'],
    oppMatePattern: ['{mv}，被{pattern}。复盘找原因。'],
    patternNote: ['要点：{desc}'],
    showBest: ['正着：{best}{why}。'],
    sumWin: ['赢了，准确率 {acc}。'],
    sumLose: ['输了，准确率 {acc}。'],
    sumDraw: ['和棋，准确率 {acc}。'],
    sumOther: ['白方 {wacc}，黑方 {bacc}。'],
    sumGoodPhase: ['{phase}是这盘的强项。'],
    sumBadPhase: ['{phase}需要加强。'],
    sumClean: ['全盘没有重大失误。'],
    sumBad: ['{bad} 步失误，逐一看。'],
    sumTurn: ['转折点在第 {k} 回合。'],
  },
  pierre: {
    tts: { rate: 1, pitch: 1.05 },
    analyse: ['我去煮壶咖啡，顺便把这 {n} 步看一遍。', '稍等，我一边擦杯子一边看棋，{n} 步。'],
    trivia: ['咖啡还没好，先听个故事：', '咖啡馆里的老主顾都知道：'],
    mate: ['{mv}，将死！今天的咖啡我请！', '{mv}，将死！干杯！'],
    forced: ['{mv}，没得选，就像咖啡馆只剩最后一个座位。'],
    book: ['{mv}，{open}！老主顾都爱点这个。', '{mv}，{open}，经典菜单上的一道菜。'],
    bookPlain: ['{mv}，菜单上有这道菜，放心点。'],
    castle: ['{mv}，王车易位，国王回房间喝下午茶去了。', '{mv}，易位！国王躲进了包厢。'],
    promote: ['{mv}，小兵变成了{promo}！就像学徒当上了大厨。'],
    recapture: ['{mv}，吃回来！有借有还。', '{mv}，{took}吃回来了，账结平了。'],
    winPiece: ['{mv}，{whose}的{took}没人看着，顺手拿走了！', '{mv}，免费的{took}！跟送上门的牛角面包一样。'],
    trade: ['{mv}，换一个{took}，一杯换一杯。', '{mv}，兑子，你一口我一口。'],
    capture: ['{mv}，{who}吃了{whose}的{took}。'],
    fork: ['{mv}，双重攻击！一叉子叉两块蛋糕：{targets}！', '{mv}，叉！{targets}只能保一个。'],
    threat: ['{mv}，{piece}盯着{whose}的{targets}，像猫盯着鱼。'],
    check: ['{mv}，将军！敲敲国王的门。', '{mv}，将军！'],
    evade: ['{mv}，国王赶紧躲开了！'],
    escape: ['{mv}，{piece}溜走了，没被抓到。'],
    center: ['{mv}，兵占中心，抢到了咖啡馆最好的位置。', '{mv}，中心！靠窗的好座位。'],
    develop: ['{mv}，{piece}出门上班去了。', '{mv}，把{piece}请出来，别让它在家睡懒觉。'],
    pawn: ['{mv}，小兵往前挪了挪。', '{mv}，挺兵，慢慢来。'],
    quiet: ['{mv}，{piece}换了个舒服的座位。', '{mv}，安静的一步，像搅了搅咖啡。'],
    mateNext: ['{soon}就能将死，香槟准备好！'],
    brilliant: ['{mv}！弃子！这一步值一整盒马卡龙！', '{mv}，敢这样送子，太有胆量了！'],
    great: ['{mv}，只有这道菜能救场，点对了！'],
    allowMate1: ['糟糕，{whose}走 {reply} 就将死了！'],
    allowMate: ['小心，{whose}有 {n} 步杀，咖啡要洒了。'],
    missedMate: ['刚才 {n} 步就能将死，蛋糕放在桌上没吃！'],
    losePiece: ['{whose}走 {reply}，{who}的{lose}就被端走了。'],
    danger: ['{whose}走 {reply} 以后，{lose}就要被端走了。'],
    missChance: ['{whose}刚才失手，送上门的点心没拿。'],
    worse: ['嗯……咖啡有点凉了。', '这步有点苦，像没加糖的咖啡。'],
    better: ['换成 {best}{why}，味道会更好。', '{best}{why}，这才是招牌菜。'],
    oppBad: ['{mv}，对手手一抖，咖啡洒了！', '{mv}，对手走错了，机会来了！'],
    punish: ['快，{reply}{why}！'],
    oppGood: ['{mv}，对手这步不错，给他加块糖。'],
    oppMate: ['{mv}，被将死了。没关系，再来一杯，再来一盘。'],
    thinking: ['让我想想，像挑一块最好的蛋糕……'],
    lineStart: ['来，看看这道菜怎么做。'],
    lineEnd: ['这道菜就做好了！', '完美，可以端上桌了！'],
    mastered: ['「{skill}」学会了！这得开一瓶香槟！'],
    unlocked: ['菜单上新添了一道：「{skill}」。'],
    matePattern: ['{mv}，教科书一样的{pattern}，干杯！'],
    oppMatePattern: ['{mv}，被{pattern}了，咖啡全洒了。没关系，再来一盘。'],
    patternNote: ['这道菜的做法：{desc}'],
    showBest: ['招牌菜是这道：{best}{why}。'],
    sumWin: ['赢啦！准确率 {acc}，今天的咖啡我请。'],
    sumLose: ['输了，准确率 {acc}。没关系，咖啡馆明天照常开门。'],
    sumDraw: ['和棋，准确率 {acc}，两杯咖啡一起喝。'],
    sumOther: ['白方准确率 {wacc}，黑方 {bacc}，两位都辛苦了。'],
    sumGoodPhase: ['{phase}下得最香。'],
    sumBadPhase: ['{phase}还差点火候。'],
    sumClean: ['一个大错都没有，像刚出炉的面包一样完美。'],
    sumBad: ['有 {bad} 步走错了，我们一块一块看。'],
    sumTurn: ['好戏在第 {k} 回合。'],
  },
  cheng: {
    tts: { rate: 1.05, pitch: 0.8 },
    analyse: ['看一遍。{n} 步。等着。'],
    trivia: ['记住：', '这个要知道：'],
    mate: ['{mv}，将死。'],
    forced: ['{mv}，只能这样。'],
    book: ['{mv}，{open}。谱上的。', '{mv}，{open}，要背熟。'],
    bookPlain: ['{mv}，谱上的。'],
    castle: ['{mv}，易位。早该这样。', '{mv}，易位。对。'],
    promote: ['{mv}，升变。'],
    recapture: ['{mv}，吃回来。应该的。'],
    winPiece: ['{mv}，吃掉白给的{took}。看见了，好。'],
    trade: ['{mv}，兑{took}。'],
    capture: ['{mv}，吃{took}。'],
    fork: ['{mv}，捉双。{targets}。', '{mv}，双重攻击。好。'],
    threat: ['{mv}，打{targets}。'],
    check: ['{mv}，将军。'],
    evade: ['{mv}，应将。'],
    escape: ['{mv}，{piece}跑了。'],
    center: ['{mv}，占中心。', '{mv}，中心。对。'],
    develop: ['{mv}，出{piece}。', '{mv}，出子。继续。'],
    pawn: ['{mv}，挺兵。'],
    quiet: ['{mv}，调{piece}。'],
    mateNext: ['{soon}将死。别算错。'],
    brilliant: ['{mv}，弃子。算清楚了，好。'],
    great: ['{mv}，只有这步。找到了。'],
    allowMate1: ['对方 {reply}，将死。'],
    allowMate: ['对方 {n} 步杀。'],
    missedMate: ['{n} 步杀，没看见。'],
    losePiece: ['对方 {reply}，丢{lose}。'],
    danger: ['对方 {reply}，{lose}危险。'],
    missChance: ['对方错了，没抓住。'],
    worse: ['局面变差。'],
    better: ['走 {best}{why}。', '应该 {best}{why}。'],
    oppBad: ['{mv}，对方错了。'],
    punish: ['走 {reply}{why}。'],
    oppGood: ['{mv}，对方这步准。'],
    oppMate: ['{mv}，被将死。回去复盘。'],
    thinking: ['等一下。'],
    lineStart: ['看好。'],
    lineEnd: ['记住。', '自己再摆一遍。'],
    mastered: ['「{skill}」，过关。'],
    unlocked: ['下一个：「{skill}」。'],
    matePattern: ['{mv}，{pattern}。将死。'],
    oppMatePattern: ['{mv}，被{pattern}。回去复盘。'],
    patternNote: ['{desc}记住。'],
    showBest: ['看好：{best}{why}。'],
    sumWin: ['赢了。准确率 {acc}。'],
    sumLose: ['输了。准确率 {acc}。'],
    sumDraw: ['和。准确率 {acc}。'],
    sumOther: ['白 {wacc}，黑 {bacc}。'],
    sumGoodPhase: ['{phase}可以。'],
    sumBadPhase: ['{phase}要练。'],
    sumClean: ['没有大错。保持。'],
    sumBad: ['错了 {bad} 步。一步一步看。'],
    sumTurn: ['第 {k} 回合是关键。'],
  },
  kai: {
    tts: { rate: 1.15, pitch: 1 },
    analyse: ['好，我先把这 {n} 步过一遍，弹幕先刷起来！', '稍等稍等，{n} 步，我快速看一眼。'],
    trivia: ['趁这会儿，讲个冷知识：', '来个冷知识：'],
    mate: ['{mv}，将死！游戏结束！', '{mv}！将死！太干净了！'],
    forced: ['{mv}，只有这一步，没啥好想的。'],
    book: ['{mv}，{open}！标准操作。', '{mv}，{open}，这个我熟，背过的。'],
    bookPlain: ['{mv}，谱上的，稳。'],
    castle: ['{mv}，易位！王先藏好，再开打。', '{mv}，易位，安全第一。'],
    promote: ['{mv}，升变{promo}！小兵逆袭！'],
    recapture: ['{mv}，吃回来，没毛病。', '{mv}，拿回来，扯平。'],
    winPiece: ['{mv}，白捡一个{took}！谢谢老板！', '{mv}，{took}没人保护，直接吃！'],
    trade: ['{mv}，换掉，简单化。', '{mv}，兑子，干脆。'],
    capture: ['{mv}，吃{took}。'],
    fork: ['{mv}，捉双！{targets}二选一！', '{mv}——双重攻击！来了来了！'],
    threat: ['{mv}，{piece}瞄准了{targets}！'],
    check: ['{mv}，将军！', '{mv}，将军，给点压力！'],
    evade: ['{mv}，先解将。'],
    escape: ['{mv}，{piece}溜了，好反应。'],
    center: ['{mv}，中心拿下！', '{mv}，兵占中心，舒服。'],
    develop: ['{mv}，{piece}出来了，好习惯。', '{mv}，出子出子，节奏不错。'],
    pawn: ['{mv}，挺兵。', '{mv}，兵往前拱一拱。'],
    quiet: ['{mv}，{piece}换个好位置，细节。', '{mv}，安静的一步，但有想法。'],
    mateNext: ['{soon}将死，大家看出来了吗？'],
    brilliant: ['{mv}！弃子！这步我直播都要截图！', '{mv}，送！送得好！'],
    great: ['{mv}，唯一解！找到了！'],
    allowMate1: ['不不不，{whose}走 {reply} 直接将死！'],
    allowMate: ['危险！{whose}有 {n} 步杀！'],
    missedMate: ['啊——这里 {n} 步杀啊！错过了！'],
    losePiece: ['{whose}走 {reply}，{lose}就没了。'],
    danger: ['{whose}走 {reply}，{lose}就悬了。'],
    missChance: ['{whose}刚送了机会，没接住啊！'],
    worse: ['嗯……差点意思。', '这步有点亏。'],
    better: ['这里 {best}{why}，才是正解。', '{best}{why}！这才帅。'],
    oppBad: ['{mv}，对手失误！机会来了！', '{mv}？对手送了！'],
    punish: ['{reply}{why}，抓住它！'],
    oppGood: ['{mv}，对手这步可以啊。'],
    oppMate: ['{mv}，被将死了。没事，下一盘！'],
    thinking: ['我算一下……', '稍等，我看看引擎怎么说……'],
    lineStart: ['来，我给大家拆解一下。', '好，正解是这样的。'],
    lineEnd: ['就这么简单！', '看懂了吧？'],
    mastered: ['「{skill}」学会啦！这就是这么下的！', '恭喜！「{skill}」拿下！'],
    unlocked: ['新技巧解锁：「{skill}」！'],
    matePattern: ['{mv}，教科书级别的{pattern}！GG！'],
    oppMatePattern: ['{mv}，被{pattern}了。没事，下一盘！'],
    patternNote: ['简单说：{desc}'],
    showBest: ['正解来了：{best}{why}！'],
    sumWin: ['赢了！准确率 {acc}，漂亮！'],
    sumLose: ['这盘输了，准确率 {acc}。复盘完就会更强。'],
    sumDraw: ['和了，准确率 {acc}。'],
    sumOther: ['白方 {wacc}，黑方 {bacc}，打得有来有回。'],
    sumGoodPhase: ['{phase}打得最好。'],
    sumBadPhase: ['{phase}还能再提升。'],
    sumClean: ['全盘没大错，稳！'],
    sumBad: ['有 {bad} 步走岔了，来，一个一个看。'],
    sumTurn: ['胜负手在第 {k} 回合。'],
  },
  wenwen: {
    tts: { rate: 0.9, pitch: 1.5 },
    analyse: ['我、我慢慢看一遍，{n} 步……', '嘿咻，{n} 步，我爬着看完。'],
    trivia: ['那个……我知道一个小知识：', '嘿嘿，告诉你一件事：'],
    mate: ['{mv}，将死！哇！', '{mv}，将死啦～'],
    forced: ['{mv}，只能这样走啦。'],
    book: ['{mv}，这是{open}！书上有的～', '{mv}，{open}，我在书上见过！'],
    bookPlain: ['{mv}，书上有的走法～'],
    castle: ['{mv}，王车易位～国王缩进壳里，安全啦。', '{mv}，易位！跟我缩壳一样安全。'],
    promote: ['{mv}，小兵变成{promo}啦！'],
    recapture: ['{mv}，吃回来啦。', '{mv}，嗯嗯，吃回来了。'],
    winPiece: ['{mv}，{took}是白送的诶，吃掉啦！'],
    trade: ['{mv}，换掉一个{took}。'],
    capture: ['{mv}，吃掉了{whose}的{took}。'],
    fork: ['{mv}，一下打到两个：{targets}！好厉害！'],
    threat: ['{mv}，{piece}在看着{whose}的{targets}哦。'],
    check: ['{mv}，将军！', '{mv}，将军～'],
    evade: ['{mv}，王躲开啦。'],
    escape: ['{mv}，{piece}躲开啦，好险。'],
    center: ['{mv}，兵走到中间啦。', '{mv}，占中心～'],
    develop: ['{mv}，{piece}出来啦～', '{mv}，{piece}出门啦。'],
    pawn: ['{mv}，小兵往前爬了一格。'],
    quiet: ['{mv}，{piece}挪了挪。'],
    mateNext: ['{soon}就能将死啦！'],
    brilliant: ['{mv}！送、送掉了？原来是妙招！'],
    great: ['{mv}，只有这一步，找到啦！'],
    allowMate1: ['呜，{whose}走 {reply} 就将死了……'],
    allowMate: ['{whose}有 {n} 步杀，好可怕……'],
    missedMate: ['刚才 {n} 步就能将死的……'],
    losePiece: ['{whose}走 {reply}，{lose}就被吃掉了……'],
    danger: ['{whose}走 {reply} 以后，{lose}有危险哦。'],
    missChance: ['{whose}刚才走错了，机会溜走了……'],
    worse: ['嗯……好像变难了。'],
    better: ['走 {best}{why}，会更好哦。'],
    oppBad: ['{mv}，咦，对手走错了！'],
    punish: ['现在走 {reply}{why}！'],
    oppGood: ['{mv}，对手好厉害……'],
    oppMate: ['{mv}，被将死了……没关系，摸摸。'],
    thinking: ['嗯……我想想……'],
    lineStart: ['我们一起看看～'],
    lineEnd: ['就是这样哦。'],
    mastered: ['哇，学会「{skill}」啦！'],
    unlocked: ['下一个是「{skill}」哦～'],
    matePattern: ['{mv}，{pattern}！将死啦～'],
    oppMatePattern: ['{mv}，被{pattern}了……没关系，摸摸。'],
    patternNote: ['这个杀法是这样的：{desc}'],
    showBest: ['这样走哦：{best}{why}。'],
    sumWin: ['赢啦！准确率 {acc}！'],
    sumLose: ['输了……准确率 {acc}。没关系，慢慢来。'],
    sumDraw: ['和棋，准确率 {acc}～'],
    sumOther: ['白方 {wacc}，黑方 {bacc}。'],
    sumGoodPhase: ['{phase}下得最好哦。'],
    sumBadPhase: ['{phase}可以再慢一点、多想想。'],
    sumClean: ['一个大错都没有！'],
    sumBad: ['有 {bad} 步走错了，我们一起看。'],
    sumTurn: ['最要紧的是第 {k} 回合。'],
  },
};

export const voiceOf = (id) => VOICES[id] ?? VOICES.isabella;

// 句子里的 {空} 换成东西; 没有的空换成空字符串
export function fillLine(line, vars) {
  return String(line ?? '').replace(/\{(\w+)\}/g, (_, k) => (vars[k] === undefined || vars[k] === null ? '' : String(vars[k])));
}

const ACT_ORDER = ['mate', 'forced', 'book', 'bookPlain', 'castle', 'promote', 'fork', 'recapture', 'winPiece', 'trade', 'capture', 'check', 'evade', 'threat', 'escape', 'center', 'develop', 'pawn', 'quiet'];
export const mainAct = (f) => ACT_ORDER.find((a) => f.acts.includes(a)) ?? 'quiet';

// 教练讲一步: coach (chesspeople 的教练); f: moveFacts; mine: 是不是「这边」走的 (复盘自己的棋时, 对手的步说法不一样);
//   who / whose: 走的人、对方怎么称呼; punish: 对手走错时这边该怎么走 (punishFacts); seed: 挑哪一句 (同一步每次说一样的)
//   plain: 只说这步做了什么 (「解析」一步一步讲引擎想的走法时用, 不说「很好」「这步不行」)
export function coachLine(coach, f, { mine = true, who = '你', whose = '对手', punish = null, seed = 0, plain = false } = {}) {
  const v = voiceOf(coach.id);
  // 一步换一句 (同一种情况连着出现时不说一样的)
  const pick = (slot, k = 0) => {
    const list = v[slot] ?? [];
    return list.length ? list[(seed + k) % list.length] : '';
  };
  const vars = { ...f, who, whose, best: f.best, why: f.why ?? '' };
  const say = (slot, k = 0) => fillLine(pick(slot, k), vars);
  const act = mainAct(f);
  if (act === 'mate') {
    if (!f.pattern) return say(mine ? 'mate' : 'oppMate');
    return `${say(mine ? 'matePattern' : 'oppMatePattern')}${say('patternNote')}`;
  }
  const out = [];
  if (!mine) {
    // 对手的步
    if (BAD.has(f.kind)) {
      out.push(say('oppBad'));
      if (punish) out.push(fillLine(pick('punish'), { ...vars, ...punish }));
    } else if (f.kind === 'brilliant' || f.kind === 'great') out.push(say('oppGood'));
    else out.push(say(act));
    return out.join('');
  }
  if (act === 'forced') return say('forced');
  if (plain) {
    out.push(say(act));
    if (f.soon) out.push(say('mateNext'));
    return out.join('');
  }
  if (f.kind === 'brilliant' || f.kind === 'great') out.push(say(f.kind));
  else {
    if (f.kind !== 'book') {
      const lead = pickLine(coach.say?.[f.kind], ((seed * 3) % 10) / 10);
      // 好棋、平常的步: 一半的时候不说前面那句 (不然每步都「很好，就是这步」)
      if (lead && (BAD.has(f.kind) || seed % 2 === 0)) out.push(lead);
    }
    out.push(say(act));
  }
  if (f.soon && !BAD.has(f.kind)) out.push(say('mateNext'));
  if (BAD.has(f.kind)) {
    if (f.bad) out.push(say(f.bad));
    if (f.best) out.push(say('better', 1));
  }
  return out.join('');
}

// 「正着」按钮: 应该怎么走
export function bestLine(coach, f, seed = 0) {
  return f.best ? fillLine(pickLine(voiceOf(coach.id).showBest, (seed % 10) / 10), { best: f.best, why: f.why ?? '' }) : '';
}

// 总结: acc 双方准确率; me 'w' / 'b' / ''; result: '1-0' 这种; grades: 双方四个方面 (areaGrades); bad: 这边走错几步 (失误、大错、错失良机); turning: 关键的一步 (从 0 数) 或 null
export function summaryLine(coach, { acc, me = '', result = '*', grades = null, bad = 0, turning = null, seed = 0 }) {
  const v = voiceOf(coach.id);
  const pick = (slot) => pickLine(v[slot], (seed % 10) / 10);
  const out = [];
  const fmt = (x) => (x === null || x === undefined ? '—' : x.toFixed(1));
  if (me) {
    const won = (result === '1-0' && me === 'w') || (result === '0-1' && me === 'b');
    const lost = (result === '1-0' && me === 'b') || (result === '0-1' && me === 'w');
    const slot = won ? 'sumWin' : lost ? 'sumLose' : result === '1/2-1/2' ? 'sumDraw' : 'sumWin';
    out.push(fillLine(slot === 'sumWin' && !won ? pick('sumOther') : pick(slot), { acc: fmt(acc[me]), wacc: fmt(acc.w), bacc: fmt(acc.b) }));
    const g = grades?.[me];
    if (g) {
      const order = ['best', 'excellent', 'good', 'inaccuracy', 'mistake', 'blunder'];
      const rank = (k) => (g[k] ? order.indexOf(g[k]) : -1);
      const areas = [['opening', '开局'], ['tactics', '战术'], ['strategy', '战略'], ['endgame', '残局']].filter(([k]) => g[k]);
      if (areas.length >= 2) {
        const best = areas.reduce((a, b) => (rank(b[0]) < rank(a[0]) ? b : a));
        const worst = areas.reduce((a, b) => (rank(b[0]) > rank(a[0]) ? b : a));
        if (rank(best[0]) <= 2 && rank(best[0]) < rank(worst[0])) out.push(fillLine(pick('sumGoodPhase'), { phase: best[1] }));
        if (rank(worst[0]) >= 3) out.push(fillLine(pick('sumBadPhase'), { phase: worst[1] }));
      }
    }
    out.push(bad ? fillLine(pick('sumBad'), { bad }) : pick('sumClean'));
  } else out.push(fillLine(pick('sumOther'), { wacc: fmt(acc.w), bacc: fmt(acc.b) }));
  if (turning !== null && turning !== undefined) out.push(fillLine(pick('sumTurn'), { k: Math.floor(turning / 2) + 1 }));
  return out.join('');
}

// ---- 分析时讲的小知识 (都是公认的史实、规则) ----
export const TRIVIA = [
  '国际象棋的老祖宗叫「恰图兰卡」，大约一千五百年前出现在印度。',
  '以前的「后」一次只能斜走一格，是最弱的子之一；15 世纪末在西班牙一带才变成现在这么厉害。',
  '「象」在古代真的是一头大象，阿拉伯语叫它 al-fil，就是「大象」的意思。',
  '「将死」这个说法来自波斯语「沙阿·马特」，大意是「王没路可走了」。',
  '最快的将死只要两步，叫「愚人杀」：白方走 f3、g4，黑方的后走到 h4 就将死了。',
  '1997 年，IBM 的电脑「深蓝」在六盘比赛里赢了当时的世界冠军卡斯帕罗夫。',
  '一盘棋所有可能的下法，比整个宇宙里的原子还多：数学家香农估计大约有 10 的 120 次方种。',
  '摆棋盘的时候，自己右手边的角上要是白格。',
  '开局时白后站在白格上，黑后站在黑格上：后站在跟自己一样颜色的格子上。',
  '第一位公认的世界冠军是斯坦尼茨，1886 年拿到的。',
  '1851 年，伦敦办了第一次国际象棋国际比赛。',
  '1991 年，谢军成为中国第一位国际象棋世界冠军（女子）。',
  '2023 年，丁立人成为中国第一位男子国际象棋世界冠军。',
  '国际棋联（FIDE）1924 年在巴黎成立。',
  '兵走到底可以变成后、车、象、马里的任何一个，所以一盘棋里可能同时有好几个后。',
  '兵第一步能一次走两格以后，才有了「吃过路兵」这条规矩。',
  '马跳遍棋盘上 64 个格子、每格只到一次，叫「马的周游」，一千多年前就有人研究了。',
  '在棋盘上摆 8 个后、谁也吃不到谁，一共有 92 种摆法。',
  '我们用的引擎叫「干鳕鱼」（Stockfish），是世界各地很多人一起写的免费程序。',
  '50 回合里双方都没吃子、没动过兵，就可以要求和棋。',
  '同一个局面出现三次，也可以要求和棋。',
  '王车易位一盘棋只能做一次，而且王和那个车都不能动过。',
  '1972 年，菲舍尔在冰岛雷克雅未克赢得世界冠军，那场比赛被叫作「世纪之战」。',
  '卡尔森的等级分最高到过 2882 分，是历史上最高的。',
];

export function triviaLine(coach, i) {
  const v = voiceOf(coach.id);
  return `${pickLine(v.trivia, ((i * 3) % 10) / 10)}${TRIVIA[((i % TRIVIA.length) + TRIVIA.length) % TRIVIA.length]}`;
}

// 显示的字: 走法 (后×g8+、O-O-O) 中间不让换行 (字之间加看不见的「连字」U+2060)
const MOVE_RE = /O-O(?:-O)?|[王后车象马]?[a-h]?[1-8]?×?[a-h][1-8](?:=[后车象马])?[+#]?/g;
export const keepMoves = (text) => String(text).replace(MOVE_RE, (m) => [...m].join('\u2060'));

// 念出来的字: 棋谱的记号换成念得出来的 (×→吃, +→将军, =后→变后, O-O→短易位)
export function speakable(text) {
  return String(text)
    .replace(/\u2060/g, '')
    .replace(/O-O-O/g, '长易位')
    .replace(/O-O/g, '短易位')
    .replace(/×/g, '吃')
    .replace(/=([后车象马])/g, '变$1')
    .replace(/([a-h1-8后车象马])[+#]+/g, '$1')
    .replace(/～/g, '');
}
