import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanDiagram, pinnedCards, pinOf, nearestPin, diagramQuestions } from '../js/diagram.js';
import { Store, makeCard } from '../js/store.js';
import { mergeData } from '../js/merge.js';
import { setMediaIds } from '../js/media.js';

function memoryStorage() {
  const map = new Map();
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k) };
}

test('标注图整理: 图片 id 不对就没有; 点要对得上卡片, 一张一个, 位置在 0~1', () => {
  const ids = new Set(['a', 'b']);
  assert.equal(cleanDiagram(null, ids), null);
  assert.equal(cleanDiagram({ image: 'javascript:x', pins: [] }, ids), null);
  assert.deepEqual(
    cleanDiagram({ image: 'm_map', pins: [{ cardId: 'a', x: 0.2, y: 1.7 }, { cardId: 'zz', x: 0.5, y: 0.5 }, { cardId: 'a', x: 0.9, y: 0.9 }, { cardId: 'b', x: 'nope', y: 0 }, null] }, ids),
    { image: 'm_map', pins: [{ cardId: 'a', x: 0.2, y: 1 }] },
  );
});

test('标注图: 编号、找最近的点、出题', () => {
  const cards = [makeCard('北京', '首都'), makeCard('上海', '直辖市'), makeCard('广州', '广东省会'), makeCard('不在图上', '')];
  const set = { cards, diagram: { image: 'm_map', pins: [{ cardId: cards[1].id, x: 0.8, y: 0.5 }, { cardId: cards[0].id, x: 0.7, y: 0.2 }, { cardId: cards[2].id, x: 0.6, y: 0.9 }] } };
  const pins = pinnedCards(set);
  assert.deepEqual(pins.map((p) => [p.number, p.card.term]), [[1, '上海'], [2, '北京'], [3, '广州']]);
  assert.equal(pinOf(set, cards[3].id), null);
  assert.equal(pinOf(set, cards[0].id).number, 2);
  assert.equal(nearestPin(pins, 0.72, 0.22).card.term, '北京');
  assert.equal(nearestPin(pins, 0.1, 0.1), null); // 离得太远
  const qs = diagramQuestions(set, { rng: () => 0.3 });
  assert.equal(qs.length, 6);
  const name = qs.filter((q) => q.kind === 'name');
  assert.equal(name.length, 3);
  for (const q of name) {
    assert.equal(q.options[q.correctIndex], q.card.term);
    assert.equal(new Set(q.options).size, q.options.length);
    assert.ok(!q.options.includes('不在图上'));
  }
  assert.equal(qs.filter((q) => q.kind === 'locate').length, 3);
  assert.deepEqual(pinnedCards({ cards }), []);
});

test('存起来: 标注图跟着卡片集; 删了卡片点也没了; 同步听改过的; 图片算用到的', async () => {
  const store = new Store(memoryStorage());
  const cards = [makeCard('a', '一'), makeCard('b', '二', { image: 'm_card' })];
  const set = store.putSet({ title: '地图', cards, diagram: { image: 'm_map', pins: [{ cardId: cards[0].id, x: 0.1, y: 0.2 }, { cardId: cards[1].id, x: 0.3, y: 0.4 }] } });
  assert.equal(new Store(store.storage).getSet(set.id).diagram.pins.length, 2);
  assert.deepEqual(setMediaIds(store.getSet(set.id)).sort(), ['m_card', 'm_map']);
  const old = structuredClone(store.data);
  await new Promise((r) => setTimeout(r, 5));
  store.putSet({ ...store.getSet(set.id), cards: [store.getSet(set.id).cards[1]] });
  assert.deepEqual(store.getSet(set.id).diagram.pins.map((p) => p.cardId), [cards[1].id]);
  assert.equal(mergeData(old, store.data).sets[0].diagram.pins.length, 1);
  // 老数据没有 diagram 也行
  const plain = store.putSet({ title: '没有图', cards: [makeCard('x', 'y')] });
  assert.equal(plain.diagram, null);
  assert.deepEqual(setMediaIds(plain), []);
});

test('同步: 标注图的图也传上去、拿下来', async () => {
  const { syncOnce, b64ToUtf8 } = await import('../js/sync.js');
  const files = new Map();
  let n = 0;
  const repo = {
    async readText(path) {
      const f = files.get(path);
      return f ? { sha: f.sha, text: b64ToUtf8(f.data) } : null;
    },
    async readBlob(path) {
      const f = files.get(path);
      return f ? new Blob([Uint8Array.from(atob(f.data), (c) => c.charCodeAt(0))], { type: 'image/png' }) : null;
    },
    async list(dir) {
      return [...files.keys()].filter((p) => p.startsWith(`${dir}/`)).map((p) => p.slice(dir.length + 1));
    },
    async write(path, data) {
      files.set(path, { sha: `s${++n}`, data });
      return `s${n}`;
    },
  };
  const media = (entries = {}) => {
    const map = new Map(Object.entries(entries));
    return { map, get: async (id) => map.get(id) ?? null, put: async (blob, id) => map.set(id, blob) };
  };
  const a = new Store(memoryStorage());
  const card = makeCard('北京', '首都');
  a.putSet({ title: '地图', cards: [card], diagram: { image: 'm_map1', pins: [{ cardId: card.id, x: 0.5, y: 0.5 }] } });
  await syncOnce({ store: a, repo, media: media({ m_map1: new Blob(['MAPPNG'], { type: 'image/png' }) }) });
  assert.ok(files.has('media/m_map1.png'));
  const b = new Store(memoryStorage());
  const mb = media();
  const r = await syncOnce({ store: b, repo, media: mb });
  assert.equal(r.downloaded, 1);
  assert.equal(await mb.map.get('m_map1').text(), 'MAPPNG');
  assert.equal(b.allSets()[0].diagram.pins.length, 1);
});
