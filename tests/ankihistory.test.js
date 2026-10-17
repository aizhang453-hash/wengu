import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readApkg, reviewsOf } from '../js/anki.js';
import { readCardFile, buildCards } from '../js/cardfile.js';
import { replay, schedule, isDue, DAY } from '../js/srs.js';
import { Store, makeSet, makeCard } from '../js/store.js';
import { historyOf } from '../js/revlog.js';

const fixture = (name) => new Uint8Array(readFileSync(new URL(`./fixtures/${name}`, import.meta.url)));
const fileOf = (name, bytes) => ({ name, size: bytes.length, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) });
function memoryStorage() {
  const map = new Map();
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k) };
}

const T0 = Date.UTC(2026, 0, 1);
const days = (r) => r.map((x) => [Math.round((x.at - T0) / DAY), x.rating]);

test('Anki 的复习记录: 手动改的、改排期的不算; 重置以前的不要; 从早到晚', () => {
  const rows = [
    { id: T0 + 5 * DAY, type: 1, ease: 3, ivl: 5 },
    { id: T0, type: 0, ease: 3, ivl: 1 },
    { id: T0 + 6 * DAY, type: 5, ease: 0, ivl: 30 }, // 改了日期
    { id: T0 + 7 * DAY, type: 3, ease: 0, ivl: 0 }, // 筛选牌组里没打分的
    { id: T0 + 9 * DAY, type: 1, ease: 2, ivl: 9 },
  ];
  assert.deepEqual(days(reviewsOf(rows)), [[0, 3], [5, 3], [9, 2]]);
  const reset = [...rows, { id: T0 + 10 * DAY, type: 4, ease: 0, ivl: 0 }, { id: T0 + 11 * DAY, type: 0, ease: 1, ivl: 0 }];
  assert.deepEqual(days(reviewsOf(reset)), [[11, 1]]);
});

test('读带学习进度的 .apkg: 每个笔记一份记录, 正反两张的用复习得多的那张', async () => {
  const { notes } = await readApkg(fixture('anki-history.apkg'));
  assert.deepEqual(days(notes[0].reviews), [[0, 3], [3, 2], [10, 4], [40, 3]]); // 反面那张 (4 次) 比正面 (2 次) 多
  assert.deepEqual(days(notes[1].reviews), [[20, 1], [20, 3], [22, 3]]); // 第 10 天重置过
  assert.deepEqual(days(notes[2].reviews), [[0, 3], [8, 1]]);
  assert.deepEqual(notes[3].reviews, []); // 新卡片
});

test('导入 .apkg 变成卡片时带着复习记录, 也告诉一共多少', async () => {
  const r = await readCardFile(fileOf('vocab.apkg', fixture('anki-history.apkg')));
  assert.deepEqual(r.history, { cards: 3, reviews: 9 });
  const cards = r.sheets.flatMap((s) => buildCards(s.rows, { term: 0, def: 1, html: true }));
  const apple = cards.find((c) => c.term.startsWith('apple'));
  assert.equal(apple.reviews.length, 4);
  assert.equal(cards.filter((c) => c.reviews).length, 3);
  // 没带学习进度的卡组
  const plain = await readCardFile(fileOf('vocab.apkg', fixture('anki-new.apkg')));
  assert.deepEqual(plain.history, { cards: 0, reviews: 0 });
});

test('按一遍复习记录 (四个键): 简单的排得远, 困难的近, 最后忘了的马上再来', () => {
  const base = [{ at: T0, rating: 3 }, { at: T0 + 2 * DAY, rating: 3 }];
  const good = replay([...base, { at: T0 + 12 * DAY, rating: 3 }]);
  const easy = replay([...base, { at: T0 + 12 * DAY, rating: 4 }]);
  const hard = replay([...base, { at: T0 + 12 * DAY, rating: 2 }]);
  assert.ok(easy.interval > good.interval && good.interval > hard.interval, `${hard.interval} ${good.interval} ${easy.interval}`);
  assert.deepEqual([good.right, good.wrong, good.at], [3, 0, T0 + 12 * DAY]);
  const forgot = replay([...base, { at: T0 + 12 * DAY, rating: 1 }]);
  assert.equal(forgot.due, T0 + 12 * DAY + 10 * 60 * 1000);
  assert.equal(forgot.wrong, 1);
  assert.equal(replay([]), null);
  // 跟一次一次答出来的一样 (只用记得 / 忘了时)
  let s = null;
  for (const [t, ok] of [[T0, true], [T0 + 2 * DAY, true], [T0 + 9 * DAY, false]]) s = { ...s, ...schedule(s, ok, t), at: t };
  const r = replay([{ at: T0, rating: 3 }, { at: T0 + 2 * DAY, rating: 3 }, { at: T0 + 9 * DAY, rating: 1 }]);
  assert.deepEqual([r.s, r.d, r.due], [s.s, s.d, s.due]);
  // 几个月没背: 早就该复习了
  assert.ok(isDue(good, T0 + 200 * DAY));
});

test('接上 Anki 的进度: 排好复习、记进复习记录; 这里已经复习过的不动排期; 别的卡片集的不管', () => {
  const store = new Store(memoryStorage());
  const set = store.putSet(makeSet({ cards: [makeCard('absolve', 'pardon'), makeCard('abate', 'lessen'), makeCard('new', 'new')] }));
  const [a, b, c] = set.cards;
  store.recordAnswer(set.id, b.id, true, { now: T0 + 50 * DAY, selfRated: true }); // 这里已经背过
  const before = structuredClone(store.getSet(set.id).stats[b.id]);
  const reviews = [{ at: T0, rating: 3 }, { at: T0 + 3 * DAY, rating: 4 }];
  const n = store.importReviews(set.id, [[a.id, reviews], [b.id, reviews], [c.id, []], ['not-here', reviews]]);
  assert.equal(n, 2);
  const stats = store.getSet(set.id).stats;
  assert.equal(stats[a.id].at, T0 + 3 * DAY);
  assert.ok(stats[a.id].interval > 3 && stats[a.id].s > 0);
  assert.deepEqual(stats[b.id], before);
  assert.equal(stats[c.id], undefined);
  assert.deepEqual(historyOf(store.data.revlog, a.id).map((r) => r.rating), [3, 4]);
  assert.equal(historyOf(store.data.revlog, b.id).length, 3); // Anki 的 2 次 + 这里的 1 次
});
