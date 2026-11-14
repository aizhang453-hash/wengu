// 国际象棋复盘 v1.83: 开局谱、棋局等级、四个方面、教练按自己的口气讲、图标
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from '../js/vendor/chess.js';
import { readPgn, positionsOf, judgeGame, keyMoments, skillsOfMove, cleanChess, mergeChess, matePattern, MATE_PATTERNS, materialOf, KINDS, ratingForLoss, RATING_LOSS, gameRating, areasOf, areaGrades, areaKind, pieceCount, AREAS, MATE } from '../js/chess.js';
import { bookKey, hashText, parseBook, bookMoves } from '../js/chessbook.js';
import * as bookData from '../js/chessbook-data.js';
import { VOICES, moveFacts, coachLine, bestLine, summaryLine, fillLine, mainAct, speakable, keepMoves, TRIVIA, triviaLine, whyText, punishFacts } from '../js/chessvoice.js';
import { COACHES } from '../js/chesspeople.js';
import { moveOf } from '../js/chesscoach.js';
import { GLYPHS } from '../js/views/chessicons.js';
import { SKILLS, SKILL_CATS, openSkills, claimSkill, skillPoints, emptySkills, cleanSkills, mergeSkills } from '../js/chessskills.js';

const book = parseBook(bookData);
const gameOf = (pgn) => {
  const g = readPgn(pgn);
  return { g, fens: positionsOf(g.moves).fens };
};

test('开局谱: 局面的钥匙不看步数, 认得常见开局', () => {
  assert.equal(hashText('abc'), hashText('abc'));
  assert.notEqual(hashText('abc'), hashText('abd'));
  const a = 'rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq - 0 1';
  assert.equal(bookKey(a), bookKey(a.replace(' 0 1', ' 5 9')));
  assert.ok(book.map.size > 5000);
  assert.ok(book.names.includes('西西里防御'));
  // 你截图里那盘: d4、马f6、象f4 在谱上, 马h5 以后不在了
  const { fens } = gameOf('1. d4 Nf6 2. Bf4 Nh5 3. Bg3 Nxg3');
  const b = bookMoves(book, fens);
  assert.deepEqual(b.map((x) => x.book), [true, true, true, false, false, false]);
  assert.equal(b[0].name, '后兵开局');
  // 离开谱以后又回到谱上的局面 (换了走法次序) 也不算
  const s = bookMoves(book, gameOf('1. e4 c5 2. Nf3 d6').fens);
  assert.ok(s.every((x) => x.book));
  assert.equal(s[1].name, '西西里防御');
  const odd = bookMoves(book, gameOf('1. a4 h5 2. e4 c5').fens);
  assert.equal(odd[2].book, false);
});

test('开局谱着: 在谱上、又没走坏的才算; 列在好坏里', () => {
  assert.ok(KINDS.some((k) => k.key === 'book' && k.name === '开局谱'));
  const { g, fens } = gameOf('1. e4 e5 2. Nf3 Nc6');
  const review = { ev: [20, 30, 25, 30, 28], bm: ['e2e4', 'e7e5', 'g1f3', 'b8c6', ''], ev2: [10, 20, 15, 20, null] };
  const j = judgeGame(g.moves, review, { book: bookMoves(book, fens) });
  assert.deepEqual(j.map((x) => x.kind), ['book', 'book', 'book', 'book']);
  assert.equal(j[2].open, '王马开局');
  // 谱上的走法, 引擎说走坏了 (掉了 10 以上): 照引擎的算
  const bad = judgeGame(g.moves, { ...review, ev: [20, 30, 25, -400, -380] }, { book: bookMoves(book, fens) });
  assert.notEqual(bad[2].kind, 'book');
  // 没给开局谱: 照旧
  assert.ok(!judgeGame(g.moves, review).some((x) => x.kind === 'book'));
});

test('棋局等级: 平均每步掉得越多分越低; 能算的步少就往平常的分靠', () => {
  for (let i = 1; i < RATING_LOSS.length; i++) {
    assert.ok(RATING_LOSS[i][0] > RATING_LOSS[i - 1][0]);
    assert.ok(RATING_LOSS[i][1] < RATING_LOSS[i - 1][1]);
  }
  assert.equal(ratingForLoss(20), 100);
  assert.equal(ratingForLoss(0), 2900);
  assert.ok(ratingForLoss(6) > ratingForLoss(8));
  assert.equal(ratingForLoss(5.68) % 50, 0);
  // 一盘假的棋: 白方每步掉 5.68 (约 1000 分), 局面一直接近
  const moves = Array.from({ length: 40 }, (_, i) => ({ color: i % 2 ? 'b' : 'w' }));
  const review = { ev: Array(41).fill(0) };
  const judged = moves.map((m) => ({ kind: 'good', loss: m.color === 'w' ? 5.68 : 2.2 }));
  const w = gameRating(moves, review, judged, 'w');
  const b = gameRating(moves, review, judged, 'b');
  assert.ok(Math.abs(w - 1050) <= 50, `白 ${w}`);
  assert.ok(b > w);
  // 平常 2000 分: 往 2000 靠一些
  const pulled = gameRating(moves, review, judged, 'w', 2000);
  assert.ok(pulled > w && pulled < 2000);
  // 局面早就一边倒 (胜率 > 80) 的步不算: 只剩平常的分
  const won = { ev: Array(41).fill(900) };
  assert.equal(gameRating(moves, won, judged, 'w', 1200), 1200);
  assert.equal(gameRating(moves, won, judged, 'w'), null);
});

test('四个方面: 开局头 10 回合、子少了是残局、吃子将军是战术; 平均掉多少换成图标', () => {
  assert.equal(pieceCount('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'), 14);
  assert.equal(pieceCount('8/5k2/8/8/8/8/2R5/4K3 w - - 0 1'), 1);
  assert.deepEqual(AREAS.map((a) => a.name), ['开局', '战术', '战略', '残局']);
  assert.equal(areaKind(0), 'best');
  assert.equal(areaKind(1), 'excellent');
  assert.equal(areaKind(3), 'good');
  assert.equal(areaKind(7), 'inaccuracy');
  assert.equal(areaKind(15), 'mistake');
  assert.equal(areaKind(30), 'blunder');
  const { g } = gameOf('1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Bxc6 dxc6 5. O-O f6 6. d4 exd4 7. Nxd4 c5 8. Nb3 Qxd1 9. Rxd1 Bg4 10. f3 Be6 11. Nc3 Bd6 12. Be3 b6');
  const n = g.moves.length;
  const review = { ev: Array(n + 1).fill(10), bm: Array(n + 1).fill(''), ev2: Array(n + 1).fill(0) };
  const judged = g.moves.map(() => ({ kind: 'good', loss: 1 }));
  const tags = areasOf(g.moves, review, judged);
  assert.ok(tags[0].includes('opening'));
  assert.ok(tags[6].includes('tactics')); // 4. 象×c6 吃子
  assert.ok(tags[20].includes('strategy') || tags[20].includes('tactics'));
  assert.ok(!tags.some((t) => t.includes('endgame')));
  const grades = areaGrades(g.moves, review, judged, 'w');
  assert.equal(grades.opening, 'excellent');
  assert.equal(grades.endgame, null);
});

test('教练的话: 每个教练每种情况都有说法, 空都填得上', () => {
  const slots = Object.keys(VOICES.isabella).filter((k) => k !== 'tts');
  for (const c of COACHES) {
    const v = VOICES[c.id];
    assert.ok(v, `${c.name} 没有说法`);
    assert.ok(v.tts?.rate > 0 && v.tts?.pitch > 0);
    for (const s of slots) assert.ok(v[s]?.length, `${c.name} 没有「${s}」`);
    for (const k of KINDS) assert.ok(c.say[k.key]?.length, `${c.name} 没有「${k.name}」的话`);
  }
  // 句子里只用认得的空
  const KNOWN = new Set(['mv', 'who', 'whose', 'took', 'piece', 'targets', 'open', 'promo', 'n', 'soon', 'reply', 'lose', 'best', 'why', 'acc', 'wacc', 'bacc', 'phase', 'k', 'bad', 'skill', 'pattern', 'desc']);
  for (const v of Object.values(VOICES))
    for (const [slot, lines] of Object.entries(v)) {
      if (slot === 'tts') continue;
      for (const line of lines) for (const [, k] of line.matchAll(/\{(\w+)\}/g)) assert.ok(KNOWN.has(k), `「${line}」里的 {${k}}`);
    }
  assert.equal(fillLine('{mv}，吃{took}。', { mv: '后×h7', took: '兵' }), '后×h7，吃兵。');
  assert.equal(fillLine('{a}{b}', { a: 1 }), '1');
});

// 走一盘, 每一步都让每个教练说一遍: 没有空着的 {…}, 不会是空的
test('教练一步一步讲: 认得出走法做了什么, 换教练说法不一样', () => {
  const pgn = '1. e4 e5 2. Nf3 Nc6 3. Bc4 Nd4 4. Nxe5 Qg5 5. Nxf7 Qxg2 6. Rf1 Qxe4+ 7. Be2 Nf3#';
  const { g, fens } = gameOf(pgn);
  const bk = bookMoves(book, fens);
  const facts = g.moves.map((m, i) =>
    moveFacts({ m, kind: i === 3 ? 'blunder' : 'best', ply: i, before: 0, after: i === 3 ? 300 : 0, best: i === 3 ? 'g8f6' : '', prev: g.moves[i - 1] ?? null, book: bk[i] }),
  );
  assert.equal(mainAct(facts[0]), 'book');
  assert.equal(facts[0].open, '王兵开局');
  assert.equal(mainAct(facts[8]), 'fork'); // 5. 马×f7: 同时打后和车
  assert.ok(facts.at(-1).acts.includes('mate'));
  assert.equal(facts[3].best, '马f6');
  for (const c of COACHES)
    facts.forEach((f, i) => {
      const line = coachLine(c, f, { mine: i % 2 === 0, who: i % 2 === 0 ? '你' : '对手', whose: i % 2 === 0 ? '对手' : '你', seed: i });
      assert.ok(line.length > 2, `${c.name} 第 ${i + 1} 步没话`);
      assert.ok(!/[{}]|undefined|null/.test(line), `${c.name}: ${line}`);
    });
  // 同一步, 程老师和皮埃尔说得不一样
  assert.notEqual(coachLine(COACHES.find((c) => c.id === 'cheng'), facts[4], { seed: 1 }), coachLine(COACHES.find((c) => c.id === 'pierre'), facts[4], { seed: 1 }));
});

test('教练讲走坏了的步: 说吃什么亏、该怎么走', () => {
  // 1. e4 e5 2. 后h5 马c6 3. 象c4 马f6?? 4. 后×f7# (黑方第三步走坏了: 让白一步杀)
  const { g } = gameOf('1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6');
  const m = g.moves[5];
  const f = moveFacts({ m, kind: 'blunder', ply: 5, before: 0, after: MATE - 1, best: 'd8e7', reply: 'h5f7' });
  assert.equal(f.bad, 'allowMate1');
  assert.equal(f.reply, '后×f7#');
  assert.equal(f.best, '后e7');
  const isa = COACHES.find((c) => c.id === 'isabella');
  const line = coachLine(isa, f, { mine: true, who: '你', whose: '对手', seed: 0 });
  assert.ok(line.includes('后×f7#') && line.includes('后e7'), line);
  assert.ok(bestLine(isa, f).includes('后e7'));
  // 对手走错: 教练说这时候你该怎么走
  const p = punishFacts(m.after, 'h5f7', MATE - 1, 'w');
  assert.equal(p.why, '，直接将死');
  const opp = coachLine(isa, f, { mine: false, who: '对手', whose: '你', punish: p, seed: 0 });
  assert.ok(opp.includes('后×f7#'), opp);
  assert.equal(whyText(moveOf(g.moves[5].after, 'h5f7')), '，直接将死');
});

test('教练的总结、小知识、念出来的字', () => {
  const isa = COACHES.find((c) => c.id === 'isabella');
  const s = summaryLine(isa, { acc: { w: 86, b: 81.8 }, me: 'w', result: '1-0', grades: { w: { opening: 'best', tactics: 'good', strategy: 'mistake', endgame: null } }, bad: 1, turning: 12 });
  assert.ok(s.includes('86.0') && s.includes('开局') && s.includes('战略') && s.includes('第 7 回合'), s);
  const none = summaryLine(isa, { acc: { w: 70, b: null }, me: '', result: '1-0' });
  assert.ok(none.includes('70.0') && none.includes('—'));
  assert.ok(TRIVIA.length >= 20);
  for (const c of COACHES) assert.ok(TRIVIA.some((t) => triviaLine(c, 3).endsWith(t)));
  assert.equal(speakable('e×d5，O-O-O，e8=后+，后×f7#'), 'e吃d5，长易位，e8变后，后吃f7');
  // 显示时走法中间不换行; 念的时候去掉
  const kept = keepMoves('这时候走 后×g8+，就赢了。');
  assert.equal(kept, '这时候走 后\u2060×\u2060g\u20608\u2060+，就赢了。');
  assert.equal(speakable(kept), '这时候走 后吃g8，就赢了。');
});

test('好坏的图标: 每一种都画了', () => {
  for (const k of KINDS) assert.ok(GLYPHS[k.key], `${k.name} 没有图标`);
});

test('开局谱的资料: 只有中文名, 编号都对得上', () => {
  const ids = new Set(book.map.values());
  for (const id of ids) assert.ok(id >= 0 && id < book.names.length);
  for (const n of book.names) assert.ok(!/[A-Za-z]/.test(n), n);
  // 下一个局面都是合法走出来的 (随便挑开局走一遍, 每步都在谱上)
  const g = new Chess();
  for (const san of ['d4', 'd5', 'c4', 'e6', 'Nc3', 'Nf6']) {
    g.move(san);
    assert.ok(book.map.has(bookKey(g.fen())), san);
  }
});

test('下一页停的步: 最后一步开局谱着、好棋、走坏了的、最后一步', () => {
  const moves = Array.from({ length: 12 }, (_, i) => ({ color: i % 2 ? 'b' : 'w' }));
  const kinds = ['book', 'book', 'book', 'best', 'inaccuracy', 'inaccuracy', 'great', 'mistake', 'good', 'blunder', 'best', 'best'];
  const judged = kinds.map((kind) => ({ kind }));
  // 我执白: 黑方的「不太好」(第 6 步) 不停
  assert.deepEqual(keyMoments(moves, judged, 'w'), [2, 4, 6, 7, 9, 11]);
  // 不知道哪边是自己: 两边的「不太好」都停
  assert.deepEqual(keyMoments(moves, judged, ''), [2, 4, 5, 6, 7, 9, 11]);
  assert.deepEqual(keyMoments([], [], 'w'), []);
});

test('解析时教练只说这步做了什么, 不评价', () => {
  const { g } = gameOf('1. e4 e5 2. Nf3 Nc6 3. Bb5');
  const f = moveFacts({ m: g.moves[2], kind: 'best', ply: 2, before: 30, after: 30, prev: g.moves[1] });
  for (const c of COACHES) {
    const plain = coachLine(c, f, { plain: true, seed: 0 });
    assert.ok(plain.startsWith('马f3'), `${c.name}: ${plain}`);
    for (const k of ['lineStart', 'lineEnd', 'thinking']) assert.ok(VOICES[c.id][k]?.length);
  }
});

test('技巧: 15 个, 五类各三个; 每个的例子棋盘都认得出这个技巧', () => {
  assert.equal(SKILLS.length, 15);
  for (const c of SKILL_CATS) assert.equal(SKILLS.filter((s) => s.cat === c.key).length, 3, c.name);
  for (const s of SKILLS) {
    const g = new Chess(s.example.fen);
    const m = g.move({ from: s.example.move.slice(0, 2), to: s.example.move.slice(2, 4), promotion: s.example.move[4] });
    const prev = s.id === 'recapture' ? { captured: 'p', to: 'd4' } : null;
    assert.ok(skillsOfMove(m, { i: s.cat === 'opening' ? 4 : 30, prev }).includes(s.id), s.name);
    assert.ok(s.need >= 3 && s.desc.length > 5);
  }
  // 走坏了的不算; 开局的过了回合数不算
  const g = new Chess();
  const m = g.move('e4');
  assert.deepEqual(skillsOfMove(m, { i: 0, bad: true }), []);
  assert.ok(skillsOfMove(m, { i: 0 }).includes('center'));
  assert.ok(!skillsOfMove(m, { i: 30 }).includes('center'));
});

test('技巧: 一类先开第一个, 攒够分学会, 开下一个; 同一步不加两次', () => {
  let st = emptySkills();
  assert.deepEqual([...openSkills(st)].sort(), ['center', 'check', 'promote', 'recapture', 'tradeAhead']);
  // 没开的领不到
  assert.equal(claimSkill(st, 'fork', 'cc1:3').got, false);
  for (let i = 0; i < 4; i++) {
    const r = claimSkill(st, 'check', `cc1:${i}`);
    assert.ok(r.got && !r.mastered);
    st = r.state;
  }
  assert.equal(claimSkill(st, 'check', 'cc1:2').got, false); // 同一步
  assert.equal(skillPoints(st, 'check'), 4);
  const r = claimSkill(st, 'check', 'cc2:7', 1000);
  assert.ok(r.mastered);
  assert.equal(r.unlocked, 'fork');
  st = r.state;
  assert.equal(st.mastered.check, 1000);
  assert.equal(st.claims.check, undefined);
  assert.equal(skillPoints(st, 'check'), 5);
  assert.ok(openSkills(st).has('fork') && openSkills(st).has('check') && !openSkills(st).has('mate'));
  assert.equal(claimSkill(st, 'check', 'cc3:1').got, false); // 学会了的不再加
});

test('技巧: 存起来、两台设备合起来', () => {
  assert.equal(cleanSkills(null), null);
  assert.equal(cleanSkills({ claims: { nope: ['x'] } }), null);
  const a = cleanSkills({ claims: { check: ['cc1:1', 'cc1:2', 'bad key'] }, mastered: { recapture: 500 } });
  assert.deepEqual(a, { claims: { check: ['cc1:1', 'cc1:2'] }, mastered: { recapture: 500 } });
  const b = cleanSkills({ claims: { check: ['cc1:2', 'cc9:4', 'cc9:5'] }, mastered: { recapture: 300 } });
  const m = mergeSkills(a, b);
  assert.equal(m.mastered.recapture, 300);
  assert.equal(m.claims.check.length, 4);
  // 合起来够了: 算学会
  const c = mergeSkills(m, cleanSkills({ claims: { check: ['cc7:1'] } }));
  assert.ok(c.mastered.check);
  assert.equal(c.claims.check, undefined);
  // 跟着国际象棋的资料存、合并
  const chess = cleanChess({ skills: { mastered: { center: 9 } } });
  assert.deepEqual(chess.skills, { claims: {}, mastered: { center: 9 } });
  const merged = mergeChess(chess, cleanChess({ skills: { claims: { check: ['cc1:1'] } } }));
  assert.deepEqual(merged.skills, { claims: { check: ['cc1:1'] }, mastered: { center: 9 } });
});

test('将死的名字: 愚人杀、学者杀、闷杀、底线杀、梯子杀、贴身杀; 教练说出来', () => {
  const last = (pgn) => {
    const g = new Chess();
    g.loadPgn(pgn);
    const h = g.history({ verbose: true });
    return [h.at(-1), h.length - 1];
  };
  const one = (fen, san) => new Chess(fen).move(san);
  assert.equal(matePattern(...last('1. f3 e5 2. g4 Qh4#')), 'fool');
  assert.equal(matePattern(...last('1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7#')), 'scholar');
  assert.equal(matePattern(one('6rk/6pp/8/4N3/8/8/8/6K1 w - - 0 1', 'Nf7#')), 'smothered');
  assert.equal(matePattern(one('6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1', 'Ra8#')), 'backRank');
  assert.equal(matePattern(one('3k4/R7/8/8/8/8/8/1R4K1 w - - 0 1', 'Rb8#')), 'ladder');
  assert.equal(matePattern(one('k7/8/1K6/8/8/8/8/7Q w - - 0 1', 'Qb7#')), 'kiss');
  // 你截图里那盘的最后一步: 后eh7# 是梯子杀
  const user = one('6Q1/8/7k/3N4/3PQ3/P3P3/P1P3P1/R3KB2 w - - 0 40', 'Qeh7#');
  assert.equal(matePattern(user, 78), 'ladder');
  assert.equal(matePattern(one('4k3/8/8/8/8/8/8/R3K3 w - - 0 1', 'Ra8+')), null); // 不是将死
  for (const k of Object.keys(MATE_PATTERNS)) assert.ok(MATE_PATTERNS[k].name && MATE_PATTERNS[k].desc);
  const f = moveFacts({ m: user, kind: 'best', ply: 78, before: MATE - 1, after: MATE });
  assert.equal(f.pattern, '梯子杀');
  for (const c of COACHES) {
    const mine = coachLine(c, f, { mine: true, seed: 0 });
    const theirs = coachLine(c, f, { mine: false, who: '对手', whose: '你', seed: 0 });
    assert.ok(mine.includes('梯子杀') && mine.includes('赶到边上'), `${c.name}: ${mine}`);
    assert.ok(theirs.includes('梯子杀'), `${c.name}: ${theirs}`);
  }
});

test('吃掉的子、多几分: 跟 chess.com 一样', () => {
  const start = materialOf('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
  assert.deepEqual(start, { took: { w: [], b: [] }, lead: { w: 0, b: 0 } });
  // 你截图里那盘的最后: chess.com 写着 +35
  const end = materialOf('6Q1/8/7k/3N4/3PQ3/P3P3/P1P3P1/R3KB2 w - - 0 40');
  assert.equal(end.lead.w, 35);
  assert.equal(end.lead.b, -35);
  assert.deepEqual(end.took.w, ['p', 'p', 'p', 'p', 'p', 'p', 'p', 'p', 'b', 'b', 'n', 'n', 'r', 'r', 'q']);
  assert.deepEqual(end.took.b, ['p', 'p', 'b', 'n', 'r']);
});
