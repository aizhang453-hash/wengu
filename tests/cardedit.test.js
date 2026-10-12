import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Store, makeCard, FOLDER_PREFIX } from '../js/store.js';
import { makeQuestion, refreshQuestion } from '../js/questions.js';
import { mergeData } from '../js/merge.js';

function memoryStorage() {
  const map = new Map();
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k) };
}

test('学着学着改卡片: 改了字, 卡片集算改过 (updatedAt), 进度不动', async () => {
  const store = new Store(memoryStorage());
  const set = store.putSet({ title: 't', cards: [makeCard('aple', '苹果'), makeCard('pear', '梨')] });
  const card = set.cards[0];
  store.recordAnswer(set.id, card.id, true);
  const before = store.getSet(set.id).updatedAt;
  await new Promise((r) => setTimeout(r, 5));
  const out = store.updateCard(set.id, card.id, { term: 'apple' });
  assert.equal(out.term, 'apple');
  const after = store.getSet(set.id);
  assert.equal(after.cards[0].term, 'apple');
  assert.equal(after.cards[0].def, '苹果');
  assert.ok(after.updatedAt > before);
  assert.equal(after.stats[card.id].right, 1);
  assert.equal(store.updateCard(set.id, 'nope', { term: 'x' }), null);
  // 存进 localStorage 了
  const again = new Store(store.storage);
  assert.equal(again.getSet(set.id).cards[0].term, 'apple');
});

test('合起来学的时候改: 改回卡片原来的卡片集', () => {
  const store = new Store(memoryStorage());
  const a = store.putSet({ title: 'A', cards: [makeCard('a', '一')] });
  const b = store.putSet({ title: 'B', cards: [makeCard('b', '二')] });
  const folder = store.putFolder({ name: 'F', setIds: [a.id, b.id] });
  const virtual = store.getSet(FOLDER_PREFIX + folder.id);
  store.updateCard(virtual.id, b.cards[0].id, { def: '二 (改过)' });
  assert.equal(store.getSet(b.id).cards[0].def, '二 (改过)');
  assert.equal(store.getSet(a.id).cards[0].def, '一');
});

test('改过的卡片同步时听改过的那边', async () => {
  const phone = new Store(memoryStorage());
  const set = phone.putSet({ title: 't', cards: [makeCard('aple', '苹果')] });
  const old = structuredClone(phone.data);
  await new Promise((r) => setTimeout(r, 5));
  phone.updateCard(set.id, set.cards[0].id, { term: 'apple' });
  assert.equal(mergeData(old, phone.data).sets[0].cards[0].term, 'apple');
  assert.equal(mergeData(phone.data, old).sets[0].cards[0].term, 'apple');
});

test('题目跟着改过的卡片换字 (选择题对的选项、判断题)', () => {
  const cards = [makeCard('apple', '苹果'), makeCard('pear', '梨'), makeCard('peach', '桃'), makeCard('plum', '李')];
  const rng = () => 0.1;
  const mc = makeQuestion('mc', cards[0], cards, { answerWith: 'def', rng });
  cards[0].def = '苹果 (水果)';
  refreshQuestion(mc);
  assert.equal(mc.answer, '苹果 (水果)');
  assert.equal(mc.options[mc.correctIndex], '苹果 (水果)');
  assert.equal(mc.options.filter((o) => o === '苹果').length, 0);
  const tf = makeQuestion('tf', cards[1], cards, { answerWith: 'def', rng: () => 0.1 });
  assert.equal(tf.isTrue, true);
  cards[1].def = '梨子';
  refreshQuestion(tf);
  assert.equal(tf.shown, '梨子');
  const w = makeQuestion('written', cards[2], cards, { answerWith: 'term', rng });
  cards[2].term = 'Peach';
  refreshQuestion(w);
  assert.deepEqual([w.prompt, w.answer], ['桃', 'Peach']);
});
