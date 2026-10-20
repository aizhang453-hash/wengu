import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Store, makeSet, makeCard, cleanData, KEY } from '../js/store.js';
import { mergeData } from '../js/merge.js';
import { historyOf } from '../js/revlog.js';
import { reviewsOf, toAnkiText } from '../js/anki.js';
import { replay, DAY, startOfDay, daysLater, isDue } from '../js/srs.js';
import { retentionStats } from '../js/stats.js';
import { addReviews } from '../js/revlog.js';

function memoryStorage({ quota = Infinity } = {}) {
  const map = new Map();
  return {
    map,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => {
      if (String(v).length > quota) throw Object.assign(new Error('QuotaExceededError'), { name: 'QuotaExceededError' });
      map.set(k, String(v));
    },
    removeItem: (k) => map.delete(k),
  };
}

const now = new Date(2026, 9, 20, 10, 0).getTime();

test('同一秒里忘了又忘了、撤销了马上又点: 复习记录不丢 (往后挪一秒), 撤销的也不会把新的那次去掉', () => {
  const store = new Store(memoryStorage());
  const set = store.putSet(makeSet({ cards: [makeCard('a', 'b')] }));
  const id = set.cards[0].id;
  store.recordAnswer(set.id, id, false, { selfRated: true, now });
  store.recordAnswer(set.id, id, false, { selfRated: true, now: now + 300 });
  assert.equal(historyOf(store.data.revlog, id).length, 2);
  // 撤销第二次, 同一秒又点了一次
  const s = store.getSet(set.id).stats[id];
  const before = structuredClone(s);
  const code = store.recordAnswer(set.id, id, true, { selfRated: true, now: now + 500 });
  store.restoreStat(set.id, id, before, code);
  store.recordAnswer(set.id, id, true, { selfRated: true, now: now + 600 });
  const back = cleanData(JSON.parse(JSON.stringify(store.data)));
  assert.equal(historyOf(back.revlog, id).length, 3);
  assert.equal(back.sets[0].stats[id].n, 3);
});

test('撤销了的那一题不算今天答的 (打卡)', () => {
  const store = new Store(memoryStorage());
  const set = store.putSet(makeSet({ cards: [makeCard('a', 'b')] }));
  store.recordAnswer(set.id, set.cards[0].id, true, { selfRated: true, now });
  store.untouchActivity(now);
  assert.deepEqual(store.data.activity, {});
});

test('没同步的设备上「明天再说」/ 暂停, 不会把另一台设备后来的复习盖掉; 暂停照样同步过去', () => {
  const a = new Store(memoryStorage());
  const set = a.putSet(makeSet({ cards: [makeCard('a', 'b')] }));
  const id = set.cards[0].id;
  const b = cleanData(structuredClone(a.data));
  // A 9 点背了 (排到一个月以后); B (没同步) 9 点半说明天再说、暂停
  a.recordAnswer(set.id, id, true, { selfRated: true, now });
  a.recordAnswer(set.id, id, true, { selfRated: true, now: now + 3 * DAY });
  const storeB = new Store(memoryStorage());
  storeB.replaceData(b);
  storeB.suspend(set.id, [id], true, now + 3 * DAY + 1800e3);
  const merged = cleanData(mergeData(a.data, storeB.data));
  const stat = merged.sets[0].stats[id];
  assert.equal(stat.n, 2); // A 的复习还在
  assert.ok(stat.sus > 0); // B 的暂停也在
  assert.equal(cleanData(mergeData(storeB.data, a.data)).sets[0].stats[id].n, 2);
});

test('存不下的时候 (浏览器空间满了): 改卡片、记错题都退回去, 不留在内存里', () => {
  const storage = memoryStorage();
  const store = new Store(storage);
  const set = store.putSet(makeSet({ cards: [makeCard('apple', '苹果')] }));
  storage.setItem = () => {
    throw new Error('QuotaExceededError');
  };
  assert.throws(() => store.updateCard(set.id, set.cards[0].id, { term: 'APPLE' }));
  assert.equal(store.getSet(set.id).cards[0].term, 'apple');
  assert.throws(() => store.putMistake({ question: '1+1?', options: ['1', '2'], correct: 1 }));
  assert.equal(store.data.mistakes.length, 0);
});

test('读不出来的数据: 当成空的, 记下 loadError, 坏了的另存一份 (不清图片录音)', () => {
  const storage = memoryStorage();
  storage.setItem(KEY, '{"sets": [坏了');
  const store = new Store(storage);
  assert.equal(store.loadError, true);
  assert.equal(store.data.sets.length, 0);
  assert.ok([...storage.map.keys()].some((k) => k.startsWith(`${KEY}:broken-`)));
  assert.equal(new Store(memoryStorage()).loadError, false);
});

test('Anki: 忘了几次按记录的类型数 (复习时重来才算); 老版本「忘掉」没记的, 从最后一段学习算起', () => {
  const T = now - 400 * DAY;
  const at = (d, h = 0) => T + d * DAY + h * 3600e3;
  // 学习步骤 10 分钟、1 天: 第二天的学习步骤里重来不算; 两次复习时忘了 (没有重学步骤) 算两次
  const rows = [
    { id: at(0), type: 0, ease: 3 },
    { id: at(1), type: 0, ease: 1 },
    { id: at(1, 1), type: 0, ease: 3 },
    { id: at(5), type: 1, ease: 1 },
    { id: at(9), type: 1, ease: 1 },
    { id: at(20), type: 1, ease: 3 },
  ];
  assert.equal(replay(reviewsOf(rows)).lapses, 2);
  // 复习了几次, 隔了 200 天又从学习开始 (重置过): 只算后面那段
  const reset = [...rows, { id: at(220), type: 0, ease: 1 }, { id: at(220, 1), type: 0, ease: 3 }];
  assert.deepEqual(reviewsOf(reset).map((r) => r.at), [at(220), at(220, 1)]);
});

test('导出给 Anki 的文字: # 开头的词加引号 (不然 Anki 当注释丢掉)', () => {
  const text = toAnkiText({ cards: [{ term: '#1 rule', def: '第一条' }, { term: 'plain', def: 'x' }] });
  assert.ok(text.includes('"#1 rule"\t第一条'));
  assert.ok(text.includes('\nplain\tx'));
});

test('从 Anki 搬来、早就到日子了的: 不因为今天积压多就往后推', () => {
  const store = new Store(memoryStorage());
  const cards = Array.from({ length: 200 }, (_, i) => makeCard(`w${i}`, ''));
  const set = store.putSet(makeSet({ cards }));
  // 都是 100 天前复习、隔十来天的: 早就到日子了
  const entries = cards.map((c) => [c.id, [{ at: now - 110 * DAY, rating: 3 }, { at: now - 108 * DAY, rating: 3 }, { at: now - 100 * DAY, rating: 3 }]]);
  store.importReviews(set.id, entries, now);
  const due = cards.filter((c) => isDue(store.getSet(set.id).stats[c.id], now)).length;
  assert.equal(due, 200);
});

test('记住率按日历往前数 (换夏令时那几天也对)', () => {
  const set = makeSet({ cards: [makeCard('a', '')] });
  const id = set.cards[0].id;
  const log = {};
  const t = now;
  addReviews(log, id, [
    { at: daysLater(t, -7) - 1800e3, rating: 3 }, // 第 8 天前一晚: 不算
    { at: daysLater(t, -6) + 3600e3, rating: 1 },
  ]);
  const [, week] = retentionStats([set], log, t);
  assert.deepEqual([week.n, week.ok], [1, 0]);
  assert.equal(startOfDay(daysLater(t, -6)), daysLater(t, -6));
});
