import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hintOf, answeredLast } from '../js/views/cards.js';
import { Store, makeCard } from '../js/store.js';
import { DAY } from '../js/srs.js';

test('显示提示: 每个词只露第一个字', () => {
  assert.equal(hintOf('apple'), 'a____');
  assert.equal(hintOf('apple pie'), 'a____ p__');
  assert.equal(hintOf("don't stop!"), "d__'_ s___!");
  assert.equal(hintOf('中华人民共和国'), '中______');
  assert.equal(hintOf('a'), '_');
  assert.equal(hintOf('狗'), '_'); // 只有一个字, 不能露出来
  assert.equal(hintOf('I am'), '_ a_');
});

test('单词卡撤销: 标了以后这张又背过 (今日复习、几天前背到一半的这一轮), 不把复习进度退回去', () => {
  const map = new Map();
  const store = new Store({ getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k) });
  const set = store.putSet({ title: 't', cards: [makeCard('apple', '苹果')] });
  const id = set.cards[0].id;
  const monday = Date.now() - 3 * DAY;
  store.recordAnswer(set.id, id, true, { selfRated: true, now: monday });
  const stat = () => store.getSet(set.id).stats[id];
  assert.equal(answeredLast(stat(), monday), true); // 刚标的: 能撤销
  // 同一秒又标了一次 (记的时间往后挪了一秒), 还算刚标的
  store.recordAnswer(set.id, id, true, { selfRated: true, now: monday });
  assert.equal(answeredLast(stat(), monday + 1000), true);
  // 后来在今日复习里又背了
  store.recordAnswer(set.id, id, true, { selfRated: true, now: monday + 2 * DAY });
  assert.equal(answeredLast(stat(), monday), false);
  assert.equal(answeredLast(stat(), monday + 1000), false);
  assert.equal(answeredLast(null, monday), false);
  assert.equal(answeredLast(stat(), 0), true); // 老版本存的 (没记时间)
});
