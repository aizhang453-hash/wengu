import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from '../js/vendor/chess.js';
import {
  zhSan,
  evalOf,
  winPct,
  winFor,
  evalText,
  mateIn,
  MATE,
  moveAccuracy,
  gameAccuracy,
  classify,
  sacrificeValue,
  readPgn,
  judgeGame,
  countKinds,
  turningPoint,
  cleanChess,
  mergeChess,
  gameRecord,
  gameList,
  gameIdOf,
  resultText,
  nextRating,
  KINDS,
} from '../js/chess.js';
import { explainMove, forkTargets, moveOf, MOOD, summary, threatText, hanging } from '../js/chesscoach.js';
import { OPPONENTS, COACHES, personOf, coachOf, coachesFor, ratingText } from '../js/chesspeople.js';
import { botParams, pickMove, bookMove, styleBonus, STYLES, OPENINGS, ANCHORS } from '../js/chessbot.js';
import { parseInfo, parseBest, Engine } from '../js/chessengine.js';
import { gameOf, recentGames, ccRating } from '../js/chesscom.js';

const CC_PGN = `[Event "Live Chess"]
[Site "Chess.com"]
[Date "2026.11.13"]
[White "Alice_1"]
[Black "bob-2"]
[Result "1-0"]
[UTCDate "2026.11.13"]
[Link "https://www.chess.com/game/live/187092552140"]

1. e4 {[%clk 0:03:00]} 1... e5 {[%clk 0:03:00]} 2. Bc4 {[%clk 0:02:59.4]} 2... Nc6 {[%clk 0:02:59]} 3. Qh5 {[%clk 0:02:58]} 3... Nf6 {[%clk 0:02:57]} 4. Qxf7# {[%clk 0:02:56]} 1-0`;

test('国际象棋: 走法写成中文', () => {
  assert.equal(zhSan('Nf3'), '马f3');
  assert.equal(zhSan('exd5'), 'e×d5');
  assert.equal(zhSan('Qxf7#'), '后×f7#');
  assert.equal(zhSan('e8=Q+'), 'e8=后+');
  assert.equal(zhSan('O-O-O'), 'O-O-O');
  assert.equal(zhSan('Rae1'), '车ae1');
  assert.equal(zhSan('Kxh2'), '王×h2');
  assert.equal(zhSan('Bb5'), '象b5');
});

test('国际象棋: 打分从白方看, 杀棋, 胜率', () => {
  assert.equal(evalOf({ cp: 50 }, 'w'), 50);
  assert.equal(evalOf({ cp: 50 }, 'b'), -50); // 黑走、黑好 50 → 白方看 -50
  assert.equal(evalOf({ mate: 3 }, 'w'), MATE - 3);
  assert.equal(evalOf({ mate: -2 }, 'w'), -(MATE - 2));
  assert.equal(evalOf({ mate: 2 }, 'b'), -(MATE - 2)); // 黑 2 步杀
  assert.equal(evalOf({ mate: 0 }, 'w'), -MATE); // 白被将死了
  assert.equal(mateIn(MATE - 3), 3);
  assert.equal(mateIn(-(MATE - 2)), -2);
  assert.equal(mateIn(120), 0);
  assert.equal(winPct(0), 50);
  assert.ok(winPct(300) > 70 && winPct(300) < 80);
  assert.equal(winPct(MATE - 5), 100);
  assert.equal(winFor(300, 'b'), 100 - winPct(300));
  assert.equal(evalText(134), '+1.3');
  assert.equal(evalText(-80), '−0.8');
  assert.equal(evalText(0), '0.0');
  assert.equal(evalText(MATE - 3), 'M3');
  assert.equal(evalText(-(MATE - 1)), '−M1');
});

test('国际象棋: 准确率', () => {
  assert.equal(moveAccuracy(60, 60), 100);
  assert.equal(moveAccuracy(60, 70), 100);
  assert.ok(moveAccuracy(60, 55) > 75 && moveAccuracy(60, 55) < 85);
  assert.equal(moveAccuracy(90, 0), 0);
  // 一直 +0.2 的棋, 两边都差不多 100
  const flat = Array.from({ length: 21 }, () => 20);
  assert.ok(gameAccuracy(flat, 'w') > 99);
  // 白走第 3 回合 (第 5 步) 送了后: 白方准确率比黑方低
  const evals = [20, 20, 25, 20, 30, -880, -900, -880, -900, -890, -900];
  assert.ok(gameAccuracy(evals, 'w') < gameAccuracy(evals, 'b'));
  assert.equal(gameAccuracy([20], 'w'), null);
});

test('国际象棋: 每步好坏的分法', () => {
  const base = { turn: 'w', played: 'e2e4', best: 'd2d4', legal: 20 };
  assert.equal(classify({ ...base, before: 30, after: 30, played: 'd2d4' }), 'best');
  assert.equal(classify({ ...base, before: 30, after: 25 }), 'excellent');
  assert.equal(classify({ ...base, before: 30, after: 0 }), 'good');
  assert.equal(classify({ ...base, before: 30, after: -60 }), 'inaccuracy');
  assert.equal(classify({ ...base, before: 30, after: -150 }), 'mistake');
  assert.equal(classify({ ...base, before: 30, after: -500 }), 'blunder');
  // 黑走: 从黑方看
  assert.equal(classify({ ...base, turn: 'b', before: -30, after: 500 }), 'blunder');
  assert.equal(classify({ ...base, turn: 'b', before: -30, after: -30, played: 'd2d4' }), 'best');
  // 只有一步可走
  assert.equal(classify({ ...base, before: 30, after: -500, legal: 1 }), 'forced');
  // 只有这步好, 第二好的差很多: 好棋
  assert.equal(classify({ ...base, before: 200, after: 200, played: 'd2d4', second: -200 }), 'great');
  // 本来就赢定了, 第二好也还是赢: 只是最佳
  assert.equal(classify({ ...base, before: 900, after: 900, played: 'd2d4', second: 600 }), 'best');
  // 弃子还是最好的: 妙着; 弃了子但走坏了: 不算
  assert.equal(classify({ ...base, before: 50, after: 60, played: 'd2d4', sac: 3 }), 'brilliant');
  assert.equal(classify({ ...base, before: 50, after: -300, sac: 3 }), 'blunder');
  // 本来赢定的局面 (胜率 97 以上) 弃子不算妙着; 弃了子能逼杀、别的走法没这么好: 算 (后b8+ 那种)
  assert.equal(classify({ ...base, before: 1500, after: 1500, played: 'd2d4', sac: 3 }), 'best');
  assert.equal(classify({ ...base, before: MATE - 2, after: MATE - 1, played: 'd2d4', sac: 9, second: 500 }), 'brilliant');
  assert.equal(classify({ ...base, before: MATE - 2, after: MATE - 1, played: 'd2d4', sac: 9, second: MATE - 4 }), 'best');
  assert.equal(classify({ ...base, turn: 'b', before: -(MATE - 2), after: -(MATE - 1), played: 'd2d4', sac: 9 }), 'brilliant');
  // 将死对方的那步: 最佳 (第二好的差很多也不说「好棋」)
  assert.equal(classify({ ...base, before: MATE - 1, after: MATE, played: 'd2d4', second: -300 }), 'best');
  // 对手刚失误, 没抓住机会
  assert.equal(classify({ ...base, before: 400, after: 60, prev: 'blunder' }), 'miss');
  assert.equal(classify({ ...base, before: 400, after: 60 }), 'blunder');
  assert.equal(KINDS.length, 11);
});

test('国际象棋: 认弃子', () => {
  // 希腊礼物: 象×h7+, 象会被王吃掉 (只换回一个兵)
  const greek = 'rnbq1rk1/pppn1ppp/4p3/3pP3/1b1P4/2NB1N2/PPP2PPP/R1BQK2R w KQ - 0 7';
  assert.equal(sacrificeValue(greek, 'Bxh7+'), 2);
  // 平常的出子不是弃子
  assert.equal(sacrificeValue('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1', 'Nf6'), 0);
  // 换后 (有车保护): 不是弃子
  assert.equal(sacrificeValue('3q3k/8/8/8/7Q/8/8/3RK3 w - - 0 1', 'Qd4'), 0);
  // 后走到王旁边没人保护: 白送
  assert.equal(sacrificeValue('3qk3/8/8/8/8/8/8/3QK2R w K - 0 1', 'Qd7+'), 9);
  // 后走到没人保护、马能吃的地方: 白送 9
  assert.equal(sacrificeValue('4k3/8/5n2/8/8/8/8/3QK3 w - - 0 1', 'Qd5'), 9);
  // 走不了的: 0
  assert.equal(sacrificeValue('4k3/8/8/8/8/8/8/4K3 w - - 0 1', 'Qd5'), 0);
});

test('国际象棋: 读 chess.com 的棋谱 (带时间注释)', () => {
  const g = readPgn(CC_PGN);
  assert.equal(g.moves.length, 7);
  assert.equal(g.headers.White, 'Alice_1');
  assert.equal(g.checkmate, true);
  assert.equal(g.moves[6].san, 'Qxf7#');
  assert.ok(g.moves[0].before.startsWith('rnbqkbnr/pppppppp'));
  assert.equal(readPgn('不是棋谱'), null);
  assert.equal(readPgn(''), null);
});

test('国际象棋: 整盘复盘 → 每步好坏、计数、关键一步', () => {
  const g = readPgn(CC_PGN);
  // 假的复盘: 黑第 3 步 Nf6 走错 (该走 g6), 被一步杀
  const ev = [30, 30, 30, 40, 50, 300, MATE - 1, MATE];
  const bm = ['e2e4', 'e7e5', 'f1c4', 'b8c6', 'd1h5', 'g7g6', 'h5f7', ''];
  const judged = judgeGame(g.moves, { ev, bm, ev2: ev.map(() => null) });
  assert.equal(judged.length, 7);
  assert.equal(judged[0].kind, 'best');
  assert.equal(judged[5].kind, 'blunder'); // Nf6??
  assert.equal(judged[6].kind, 'best'); // 后×f7# 是最佳
  const counts = countKinds(g.moves, judged);
  assert.equal(counts.b.blunder, 1);
  assert.equal(counts.w.best, 4);
  assert.equal(turningPoint(judged), 5);
  assert.equal(turningPoint(judged.slice(0, 4)), null);
});

test('国际象棋: 讲解', () => {
  const g = readPgn(CC_PGN);
  const m = g.moves;
  // 黑 Nf6 送杀
  const blunder = explainMove({ m: m[5], kind: 'blunder', ply: 5, before: 50, after: MATE - 1, best: 'g7g6', reply: 'h5f7', who: '你', whose: '对手' });
  assert.match(blunder.join(''), /对手一步就能将死你：后×f7#/);
  assert.match(blunder.join(''), /更好的是 g6/);
  // 弃后逼杀 (歌剧院对局 16. 后b8+)
  const opera = new Chess('4kb1r/p2n1ppp/4q3/4p1B1/4P3/1Q6/PPP2PPP/2KR4 w k - 1 17').move('Qb8+');
  assert.match(explainMove({ m: opera, kind: 'brilliant', ply: 30, before: MATE - 2, after: MATE - 1, best: 'b3b8' }).join(''), /弃子！.*将军。下一步就能将死。/);
  // 将死的那步
  assert.deepEqual(explainMove({ m: m[6], kind: 'best', ply: 6, before: MATE - 1, after: MATE, best: 'h5f7' }), ['后×f7#，将死！']);
  // 开局出子
  assert.match(explainMove({ m: m[3], kind: 'best', ply: 3, before: 40, after: 40, best: 'b8c6' }).join(''), /把马走出来/);
  assert.match(explainMove({ m: m[0], kind: 'best', ply: 0, before: 30, after: 30, best: 'e2e4' }).join(''), /兵占中心/);
  // 吃子
  const cap = readPgn('1. e4 d5 2. exd5 *').moves[2];
  assert.match(explainMove({ m: cap, kind: 'best', ply: 2, before: 30, after: 30, best: 'e4d5', whose: '对手' }).join(''), /吃掉了对手的兵/);
  // 错过吃后
  const fen = 'rnb1kbnr/pppp1ppp/8/4p3/4P2q/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 3';
  const miss = new Chess(fen).move('a3');
  assert.match(explainMove({ m: miss, kind: 'blunder', ply: 4, before: 900, after: 0, best: 'f3h4', who: '你', whose: '对手' }).join(''), /更好的是 马×h4（吃掉对手的后）/);
});

test('国际象棋: 走错了以后哪个子危险 (对手的应着不直接吃子时)', () => {
  // 1. e4 马c6 2. 后g4?? d5: 黑象 c8 打到 g4 的后
  const g = new Chess();
  for (const san of ['e4', 'Nc6']) g.move(san);
  const fen = g.fen();
  const m = g.move('Qg4');
  assert.equal(hanging(new Chess(m.after).move('d5').after, 'w'), 'q');
  assert.match(explainMove({ m, kind: 'blunder', ply: 2, before: 30, after: -500, best: 'd2d4', reply: 'd7d5', who: '你', whose: '对方' }).join(''), /对方走 d5 以后，你的后就危险了。更好的是 d4。/);
  assert.equal(hanging(fen, 'w'), ''); // 开局时谁都不危险
  // 有保护、又是被更贵的子打到: 不算危险
  assert.equal(hanging('4k3/8/8/3q4/8/3N4/4P3/4K3 w - - 0 1', 'w'), '');
});

test('国际象棋: 双重攻击 (马叉王和车)', () => {
  const fork = new Chess('r3k3/8/8/1N6/8/8/8/4K3 w - - 0 1').move('Nc7+');
  assert.deepEqual(forkTargets(fork).sort(), ['k', 'r']);
  assert.match(explainMove({ m: fork, kind: 'best', ply: 30, before: 400, after: 400, best: 'b5c7', whose: '对手' }).join(''), /同时打到对手的(王和车|车和王)（双重攻击）/);
  assert.equal(moveOf('r3k3/8/8/1N6/8/8/8/4K3 w - - 0 1', 'b5c7').zh, '马c7+');
  assert.equal(moveOf('r3k3/8/8/1N6/8/8/8/4K3 w - - 0 1', 'b5b7'), null);
});

test('国际象棋: 人物 (对手 8 个从弱到强, 教练 5 个 + 温温)', () => {
  assert.equal(OPPONENTS.length, 8);
  assert.deepEqual(OPPONENTS.map((p) => p.rating), [250, 500, 800, 1100, 1400, 1800, 2200, 0]); // 0: 最强
  assert.equal(ratingText(OPPONENTS[7]), '最强');
  assert.equal(COACHES.length, 6);
  const ids = new Set([...OPPONENTS, ...COACHES].map((p) => p.id));
  assert.equal(ids.size, 14);
  for (const p of OPPONENTS) {
    assert.match(p.id, /^[a-z0-9-]{1,24}$/);
    for (const k of ['hi', 'good', 'bad', 'take', 'lost', 'check', 'win', 'lose', 'draw']) assert.ok(p.lines[k]?.length, `${p.name} 没有 ${k}`);
    assert.ok(p.intro && p.style && p.place && p.era && p.look);
    assert.ok(STYLES[p.id], `${p.name} 没写下法`);
  }
  for (const c of COACHES) {
    for (const k of KINDS) assert.ok(c.say[k.key]?.length, `${c.name} 没有「${k.name}」的话`);
    for (const k of ['hi', 'warn', 'back', 'win', 'lose', 'draw']) assert.ok(c[k]?.length, `${c.name} 没有 ${k}`);
    assert.ok(c.teach && c.intro && c.look);
  }
  for (const k of KINDS) assert.ok(MOOD[k.key]);
  // 温温: 复盘完一盘以后才出现
  assert.ok(!coachesFor(false).some((c) => c.id === 'wenwen'));
  assert.ok(coachesFor(true).some((c) => c.id === 'wenwen'));
  assert.equal(personOf('lucas').name, '卢卡斯');
  assert.equal(personOf('kai').name, '凯');
  assert.equal(coachOf('没有这个人').id, COACHES[0].id);
  assert.match(summary({ acc: { w: 82.34, b: 60 }, counts: { w: { great: 1, blunder: 1 }, b: {} }, turning: 21, me: 'w' }).join(''), /你这盘的准确率是 82.3。.*1 步好棋.*第 11 回合/);
});

test('国际象棋对手: 按分数的参数 (分越高想得越深; 中间的分数照两边插)', () => {
  assert.ok(botParams(0).full);
  assert.ok(botParams(3000).full);
  for (const a of ANCHORS) assert.deepEqual(botParams(a.rating), { ...a });
  const mid = botParams(950); // 800 和 1100 的正中间
  assert.equal(mid.depth, 5);
  assert.ok(Math.abs(mid.tau - (botParams(800).tau + botParams(1100).tau) / 2) < 1e-9);
  assert.ok(Math.abs(mid.slip - (botParams(800).slip + botParams(1100).slip) / 2) < 1e-9);
  assert.equal(botParams(50).rating, 250); // 比最低的还低: 按最低的
  for (let r = 300; r <= 2600; r += 100) {
    const a = botParams(r);
    const b = botParams(r + 100);
    assert.ok(b.depth >= a.depth && b.tau > 0 && b.slip >= 0 && b.slip <= 1, String(r));
  }
});

test('国际象棋对手: 挑一步 (差的走法不容易挑到; 粗心时随手走; 爱好加分)', () => {
  const fen = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2';
  const g = new Chess(fen);
  const legal = g.moves({ verbose: true }).map((m) => ({ ...m, uci: m.from + m.to + (m.promotion ?? '') }));
  const cands = [
    { uci: 'b8c6', ev: 30 },
    { uci: 'd7d6', ev: 45 },
    { uci: 'f7f6', ev: 250 },
  ];
  let seed = 7;
  const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const count = (params, style = null) => {
    const n = {};
    for (let i = 0; i < 2000; i++) {
      const u = pickMove({ cands, legal, turn: 'b', params, style, rng });
      n[u] = (n[u] ?? 0) + 1;
    }
    return n;
  };
  const strong = count({ tau: 1, slip: 0 });
  assert.ok(strong.b8c6 > 1500 && !strong.f7f6); // 强的几乎总走最好的
  const weak = count({ tau: 15, slip: 0 });
  assert.ok(weak.f7f6 > 100 && weak.b8c6 > weak.f7f6); // 弱的也会走差的, 但还是好的多
  const careless = count({ tau: 1, slip: 0.5 });
  assert.ok(Object.keys(careless).length > 5); // 粗心: 什么都可能走
  assert.equal(pickMove({ cands, legal, turn: 'b', params: { full: true }, rng }), 'b8c6');
  // 一步杀: 再粗心的也几乎总会走
  const mateFen = '6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1';
  const mLegal = new Chess(mateFen).moves({ verbose: true }).map((m) => ({ ...m, uci: m.from + m.to + (m.promotion ?? '') }));
  let mates = 0;
  for (let i = 0; i < 500; i++) if (pickMove({ cands: [{ uci: 'a1a8', ev: MATE }, { uci: 'g1f1', ev: 0 }], legal: mLegal, turn: 'w', params: { tau: 16, slip: 0.9 }, rng }) === 'a1a8') mates++;
  assert.ok(mates > 330, String(mates));
  assert.equal(pickMove({ cands: [], legal: [], turn: 'b', params: { tau: 1, slip: 0 }, rng }), null);
  // 爱好: 托马斯爱用马
  const knight = legal.find((m) => m.uci === 'b8c6');
  const pawn = legal.find((m) => m.uci === 'd7d6');
  assert.ok(styleBonus(STYLES.thomas, knight) > styleBonus(STYLES.thomas, pawn));
  const cap = new Chess('4k3/8/8/3p4/4P3/8/8/4K3 w - - 0 1').move('exd5');
  assert.equal(styleBonus(STYLES.xiaodou, cap), 3);
  assert.equal(styleBonus(null, cap), 1);
});

test('国际象棋对手: 爱走的开局', () => {
  const seq = [0, 0.99];
  let i = 0;
  const rng = () => seq[i++ % seq.length];
  assert.equal(bookMove('lucas', 'w', [], rng), 'e4');
  assert.equal(bookMove('lucas', 'w', [], rng), 'd4'); // 三条里随便挑一条
  assert.equal(bookMove('lucas', 'w', ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5']), 'b4'); // 埃文斯弃兵
  assert.equal(bookMove('lucas', 'b', ['d4']), 'Nf6');
  assert.equal(bookMove('lucas', 'b', ['d4', 'Nf6', 'c4']), 'e5'); // 布达佩斯弃兵
  assert.equal(bookMove('lucas', 'w', ['e4', 'c5']), null); // 对手不照着走: 交给引擎
  assert.equal(bookMove('xiaodou', 'w', []), null); // 小豆没有开局
  for (const [id, book] of Object.entries(OPENINGS)) {
    for (const side of ['w', 'b']) {
      for (const line of book[side] ?? []) {
        const g = new Chess();
        for (const san of line) assert.ok(g.move(san), `${id} ${line.join(' ')}`); // 每条都走得通
      }
    }
  }
});

test('国际象棋: 我的分 (Elo)', () => {
  assert.equal(nextRating(800, 20, 800, 1), 816);
  assert.equal(nextRating(800, 20, 800, 0), 784);
  assert.equal(nextRating(800, 20, 800, 0.5), 800);
  assert.equal(nextRating(800, 0, 800, 1), 830); // 前 10 盘变得快
  assert.ok(nextRating(800, 20, 250, 1) - 800 < 3); // 赢了弱很多的, 几乎不涨
  assert.ok(nextRating(800, 20, 0, 0) >= 799); // 输给最强的, 几乎不掉
  assert.equal(nextRating(100, 20, 2000, 0), 100); // 最低 100
});

test('国际象棋教练: 提醒对手的威胁', () => {
  // 白马在 f3 没人保护, 黑后从 d5... 轮到白走; 假装黑再走一步: 后×f3
  const fen = '4k3/8/8/3q4/8/5N2/8/4K3 w - - 0 1';
  assert.equal(threatText(fen, 'd5f3'), '对方想走 后×f3，吃掉你的马。');
  assert.equal(threatText(fen, 'd5d4'), ''); // 不吃子: 不说
  assert.match(threatText(fen, 'd5d1', { mate: 1 }), /直接将死你/);
  assert.equal(threatText(fen, ''), '');
});

test('国际象棋: 存的棋局 (清理、合并、删掉的不回来)', () => {
  const now = Date.UTC(2026, 10, 13);
  const rec = gameRecord({ pgn: CC_PGN, src: 'cc', me: 'w', url: 'https://www.chess.com/game/live/187092552140', now });
  const cpu = gameRecord({ pgn: CC_PGN, src: 'cpu', me: 'b', rating: 1400, who: 'lucas', mode: 'bot', now });
  assert.equal(cpu.rating, 1400);
  assert.equal(cpu.mode, 'bot');
  assert.equal(cpu.who, 'lucas');
  assert.equal(gameRecord({ pgn: CC_PGN, src: 'cpu', rating: 0, who: 'sissa', mode: 'bot', now }).rating, 0); // 最强
  assert.equal(rec.id, 'cc187092552140');
  assert.equal(rec.white, 'Alice_1');
  assert.equal(rec.result, '1-0');
  assert.equal(rec.date, '2026-11-13');
  assert.equal(rec.me, 'w');
  assert.equal(gameRecord({ pgn: '乱写', src: 'pgn' }), null);
  assert.match(gameIdOf({ src: 'cpu', now }), /^cpu[a-z0-9]+$/);

  const review = { depth: 14, ev: [30, 30, 30, 40, 50, 300, MATE - 1, MATE], bm: ['e2e4', 'e7e5', 'f1c4', 'b8c6', 'd1h5', 'g7g6', 'h5f7', ''], ev2: [null, null, null, null, null, null, null, null] };
  const a = cleanChess({ user: { name: 'Alice_1', at: now }, games: { [rec.id]: { ...rec, review } } }, now);
  assert.equal(a.games[rec.id].review.ev.length, 8);
  assert.equal(a.user.name, 'Alice_1');
  // 乱七八糟的不要
  assert.equal(cleanChess({ games: { x: { id: '../x', at: now, pgn: 'x' } }, user: { name: '<script>', at: now } }, now), null);
  assert.equal(cleanChess(null), null);
  // 另一台设备删掉了 (后删的): 合起来是删掉的, 列表里没有
  const b = cleanChess({ games: { [rec.id]: { id: rec.id, at: now + 10, gone: 1 } }, coach: { id: 'zhou', at: now } }, now);
  const merged = mergeChess(a, b);
  assert.equal(merged.games[rec.id].gone, 1);
  assert.equal(gameList(merged).length, 0);
  assert.equal(merged.coach.id, 'zhou');
  assert.equal(merged.user.name, 'Alice_1');
  // 删掉的记号 90 天以后不要了
  assert.equal(cleanChess({ games: { [rec.id]: { id: rec.id, at: now, gone: 1 } } }, now + 91 * 86400000), null);
  // 最多留 60 盘 (新的留着)
  const many = {};
  for (let i = 0; i < 70; i++) many[`pgn${i}x`] = { ...rec, id: `pgn${i}x`, at: now + i };
  const kept = cleanChess({ games: many }, now);
  assert.equal(Object.keys(kept.games).length, 60);
  assert.ok(kept.games.pgn69x && !kept.games.pgn5x);
  // 正在下的: 新的赢
  const c1 = cleanChess({ current: { moves: 'e2e4 e7e5 xx', color: 'b', mode: 'coach', diff: 'hard', rating: 1050, who: 'kai', at: now } }, now);
  assert.equal(c1.current.moves, 'e2e4 e7e5');
  assert.deepEqual([c1.current.mode, c1.current.diff, c1.current.rating], ['coach', 'hard', 1050]);
  const c2 = mergeChess(c1, cleanChess({ current: { moves: 'd2d4', color: 'w', mode: 'bot', rating: 500, who: 'thomas', at: now + 5 } }, now));
  assert.equal(c2.current.moves, 'd2d4');
  assert.equal(c2.current.diff, undefined);
  // 我的分: 后算的赢
  const e1 = cleanChess({ elo: { rating: 900, games: 3, at: now } }, now);
  const e2 = cleanChess({ elo: { rating: 950, games: 4, cc: 1, at: now + 9 } }, now);
  assert.deepEqual(mergeChess(e1, e2).elo, { rating: 950, games: 4, cc: 1, at: now + 9 });
  assert.equal(cleanChess({ elo: { rating: 'x', at: now } }, now), null);
});

test('国际象棋: 结果写成中文', () => {
  assert.equal(resultText('1-0', 'w'), '赢了');
  assert.equal(resultText('1-0', 'b'), '输了');
  assert.equal(resultText('0-1', ''), '黑胜');
  assert.equal(resultText('1/2-1/2', 'w'), '和棋');
  assert.equal(resultText('*', 'w'), '没下完');
});

test('国际象棋引擎: 读 UCI 的话', () => {
  assert.deepEqual(parseInfo('info depth 12 seldepth 18 multipv 1 score cp 34 nodes 12345 nps 1000 pv e2e4 e7e5 g1f3'), { depth: 12, multipv: 1, cp: 34, pv: ['e2e4', 'e7e5', 'g1f3'] });
  assert.deepEqual(parseInfo('info depth 9 multipv 2 score mate -3 pv a2a3'), { depth: 9, multipv: 2, mate: -3, pv: ['a2a3'] });
  assert.equal(parseInfo('info depth 9 score cp 20 lowerbound pv e2e4'), null);
  assert.equal(parseInfo('info string NNUE evaluation using nn.nnue'), null);
  assert.equal(parseBest('bestmove e2e4 ponder e7e5'), 'e2e4');
  assert.equal(parseBest('bestmove e7e8q'), 'e7e8q');
  assert.equal(parseBest('bestmove (none)'), '');
  assert.equal(parseBest('readyok'), null);
});

// 假引擎: 收到 go 就回两条分析和 bestmove
function fakeWorker(log) {
  const w = {
    onmessage: null,
    postMessage(cmd) {
      log.push(cmd);
      const say = (s) => setTimeout(() => w.onmessage?.({ data: s }), 0);
      if (cmd === 'uci') say('uciok');
      if (cmd === 'isready') say('readyok');
      if (cmd.startsWith('go')) {
        say('info depth 10 multipv 1 score cp 25 pv d2d4 d7d5');
        say('info depth 10 multipv 2 score cp -40 pv a2a4 e7e5');
        say('bestmove d2d4 ponder d7d5');
      }
    },
    terminate() {},
  };
  return w;
}

test('国际象棋引擎: 排队、分析', async () => {
  const log = [];
  const engine = new Engine({ makeWorker: () => fakeWorker(log) });
  const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1';
  const [a, b] = await Promise.all([engine.analyse(fen, { depth: 10, multipv: 2 }), engine.analyse(fen, { depth: 4, movetime: 900 })]);
  assert.deepEqual(a, { ev: -25, best: 'd2d4', ev2: 40, pv: ['d2d4', 'd7d5'], depth: 10, lines: [{ uci: 'd2d4', ev: -25, pv: ['d2d4', 'd7d5'] }, { uci: 'a2a4', ev: 40, pv: ['a2a4', 'e7e5'] }] }); // 黑走: 分数反过来
  assert.equal(b.best, 'd2d4');
  assert.ok(log.includes('setoption name MultiPV value 2'));
  assert.ok(log.includes('go depth 10'));
  assert.ok(log.includes('go depth 4 movetime 900'));
  // 取消以后排队的不做
  engine.cancel();
  const p = engine.analyse(fen);
  engine.cancel();
  assert.equal(await p, null);
  assert.equal(log.filter((x) => x === 'uci').length, 1);
});

const API_GAME = {
  url: 'https://www.chess.com/game/live/187092552140',
  pgn: CC_PGN,
  end_time: 1794533309,
  time_class: 'blitz',
  rules: 'chess',
  accuracies: { white: 87.18, black: 76.09 },
  white: { rating: 1200, result: 'win', username: 'Alice_1' },
  black: { rating: 1150, result: 'checkmated', username: 'bob-2' },
};

test('chess.com: 一盘棋 → 温故用的', () => {
  const g = gameOf(API_GAME, 'alice_1');
  assert.equal(g.me, 'w');
  assert.equal(g.opponent, 'bob-2');
  assert.equal(g.result, '1-0');
  assert.equal(g.how, '被将死');
  assert.equal(g.kind, '快棋');
  assert.equal(g.accuracy, 87.18);
  assert.equal(g.end, 1794533309000);
  assert.equal(gameOf({ ...API_GAME, rules: 'chess960' }, 'alice_1'), null);
  assert.equal(gameOf(API_GAME, 'someone').me, '');
  assert.equal(gameOf({ ...API_GAME, white: { ...API_GAME.white, result: 'agreed' }, black: { ...API_GAME.black, result: 'agreed' } }, 'bob-2').result, '1/2-1/2');
});

test('chess.com: 拿最近的棋 (最近两个月, 新的在前)', async () => {
  const asked = [];
  const fetchFn = async (url) => {
    asked.push(url);
    if (url.endsWith('/archives')) return { ok: true, status: 200, json: async () => ({ archives: ['https://api.chess.com/pub/player/alice_1/games/2026/10', 'https://api.chess.com/pub/player/alice_1/games/2026/11'] }) };
    if (url.endsWith('/2026/11')) return { ok: true, status: 200, json: async () => ({ games: [API_GAME, { ...API_GAME, end_time: 1794533400, url: 'https://www.chess.com/game/live/2' }] }) };
    return { ok: true, status: 200, json: async () => ({ games: [{ ...API_GAME, end_time: 1790000000, url: 'https://www.chess.com/game/live/1' }] }) };
  };
  const games = await recentGames(' Alice_1 ', { fetchFn });
  assert.equal(asked[0], 'https://api.chess.com/pub/player/alice_1/games/archives');
  assert.deepEqual(games.map((g) => g.url.split('/').pop()), ['2', '187092552140', '1']);
  assert.equal((await recentGames('Alice_1', { fetchFn, limit: 2 })).length, 2);
  await assert.rejects(recentGames('a b', { fetchFn }), /用户名不对/);
  await assert.rejects(recentGames('nobody', { fetchFn: async () => ({ ok: false, status: 404 }) }), /找不到这个用户/);
});

test('chess.com: 拿一个人的分 (快棋优先)', async () => {
  const stats = (s) => async (url) => (assert.equal(url, 'https://api.chess.com/pub/player/alice_1/stats'), { ok: true, status: 200, json: async () => s });
  assert.equal(await ccRating('Alice_1', { fetchFn: stats({ chess_rapid: { last: { rating: 812 } }, chess_blitz: { last: { rating: 640 } } }) }), 812);
  assert.equal(await ccRating('Alice_1', { fetchFn: stats({ chess_blitz: { last: { rating: 640 } } }) }), 640);
  assert.equal(await ccRating('Alice_1', { fetchFn: stats({}) }), 0);
  assert.equal(await ccRating('a b'), 0);
  assert.equal(await ccRating('Alice_1', { fetchFn: async () => ({ ok: false, status: 500 }) }), 0);
});
