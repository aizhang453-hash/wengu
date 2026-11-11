import { test } from 'node:test';
import assert from 'node:assert/strict';
import { candidates, lookupEn, formText } from '../js/endict.js';
import { addWordCard, WORDS_SET } from '../js/views/wordpop.js';
import { Store } from '../js/store.js';

// 假的词表 (照 tools/en-dict.mjs 写的样子)
const FAKE = {
  g: { go: ['gəʊ', 'vi. 去, 走'] },
  w: { went: '=go:p' },
  l: { left: ['left', 'a. 左边的', 'leave', 'dp'], leave: ['li:v', 'v. 离开'] },
  c: { China: ['tʃaɪnə', 'n. 中国'], city: ['siti', 'n. 城市'], cities: '=city:s' },
  s: { stop: ['stɒp', 'v. 停止'] },
  t: { tariff: ['tærɪf', 'n. 关税'] },
};
const importer = async (letter) => ({ default: FAKE[letter] ?? {} });

test('点词查意思: 拿去查的写法 — 原样、小写、去掉 \'s、规则变形', () => {
  assert.deepEqual(candidates("China's").slice(0, 3), ["China's", "china's", 'China']);
  assert.ok(candidates('Stopped').includes('stop')); // 双写的辅音
  assert.ok(candidates('tariffs').includes('tariff'));
  assert.ok(candidates('cities').includes('city'));
  assert.ok(candidates('well-known').includes('known'));
  assert.deepEqual(candidates('“'), []);
  assert.equal(formText('dp'), '过去分词、过去式');
  assert.equal(formText('3s'), '第三人称单数、复数');
});

test('点词查意思: 变形指到原形; 自己有意思的也写上原形; 查不到是 null', async () => {
  assert.deepEqual(await lookupEn('Went', { importer }), { word: 'go', ph: 'gəʊ', tr: 'vi. 去, 走', from: 'went', kind: '过去式' });
  assert.deepEqual(await lookupEn('left', { importer }), { word: 'left', ph: 'left', tr: 'a. 左边的', base: { word: 'leave', kind: '过去分词、过去式', tr: 'v. 离开' } });
  assert.equal((await lookupEn("China's", { importer })).word, 'China');
  assert.equal((await lookupEn('Stopped', { importer })).word, 'stop');
  assert.equal((await lookupEn('tariffs', { importer })).word, 'tariff');
  assert.equal(await lookupEn('zzzz', { importer }), null);
  // 「constructor」这种跟程序里的名字一样的词不会查错
  assert.equal(await lookupEn('constructor', { importer }), null);
  // 断网 (下载不了词表): 抛错; 下次再试
  let fail = true;
  const flaky = async (letter) => {
    if (fail) throw new Error('offline');
    return importer(letter);
  };
  await assert.rejects(lookupEn('xenon', { importer: flaky }));
  fail = false;
  assert.equal(await lookupEn('xenon', { importer: flaky }), null);
});

test('点词查意思: 真的词表 (js/endict/) 里常用词、变形、新闻常见的词都有', async () => {
  for (const [w, word] of [
    ['went', 'go'],
    ['children', 'children'],
    ['tariffs', 'tariff'],
    ['ceasefire', 'ceasefire'],
    ['impeachment', 'impeachment'],
    ['Lawmakers', 'lawmaker'],
    ["Ukraine's", 'ukraine'],
    ['NATO', 'NATO'],
    ['Kremlin', 'Kremlin'],
  ]) {
    const got = await lookupEn(w);
    assert.equal(got?.word, word, w);
    assert.ok(got.tr && /[一-鿿]/.test(got.tr), `${w} 有中文意思`);
    assert.ok(got.tr.split('\n').length <= 3);
  }
});

function memoryStorage() {
  const map = new Map();
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k) };
}

test('点词查意思: 「加进卡片」放进「邸报生词」卡片集 (没有就新做一个); 同一个词不加两次', () => {
  const store = new Store(memoryStorage());
  const a = addWordCard(store, 'go', 'vi. 去, 走');
  assert.equal(a.added, true);
  assert.equal(a.set.title, WORDS_SET);
  assert.equal(a.set.termLang, 'en-US');
  assert.equal(a.set.defLang, 'zh-CN');
  const b = addWordCard(store, 'tariff', 'n. 关税');
  assert.equal(b.set.id, a.set.id);
  assert.deepEqual(store.getSet(a.set.id).cards.map((c) => [c.term, c.def]), [
    ['go', 'vi. 去, 走'],
    ['tariff', 'n. 关税'],
  ]);
  assert.equal(addWordCard(store, 'Go', 'x').added, false);
  assert.equal(store.allSets().length, 1);
});
