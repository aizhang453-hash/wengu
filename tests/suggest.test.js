import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Store, makeSet, makeCard, makeFolder } from '../js/store.js';
import { newMistake } from '../js/mistakes.js';
import { snippet, localSuggestions, libraryGroup, authorGroup } from '../js/views/suggest.js';
import { chunks } from '../js/speech.js';

function memoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

test('搜索框边打边出结果 (v1.71): 文件夹、卡片集、卡片、题目各列几个; 长的只取找到的那一段', () => {
  const store = new Store(memoryStorage());
  const u37 = store.putSet({ ...makeSet({ title: 'Unit 3.7 经典条件反射' }), cards: [makeCard('Classical conditioning', '经典条件反射：把中性刺激和无条件刺激配对'), makeCard('Pavlov', '巴甫洛夫')] });
  const u38 = store.putSet({ ...makeSet({ title: 'Unit 3.8 操作条件反射' }), cards: [makeCard('Operant conditioning', '操作条件反射')] });
  const psy = store.putFolder({ ...makeFolder('心理学') });
  store.putFolder({ ...makeFolder('第三单元', psy.id), setIds: [u37.id, u38.id] });
  store.putMistake({ ...newMistake('m1'), question: '巴甫洛夫的狗听到铃声流口水，这是哪一种学习？', options: ['甲', '乙'], correct: 0 });

  const groups = (q) => Object.fromEntries(localSuggestions(store, q).map((g) => [g.title, g.items]));
  // 文件夹: 里面的写出在哪
  const f = groups('第三');
  assert.deepEqual(f['文件夹'].map((x) => [x.main, x.sub]), [['第三单元', '心理学 › 第三单元']]);
  assert.equal(groups('心理学')['文件夹'][0].sub, '2 个卡片集');
  // 卡片集、卡片 (大小写不管), 几个字都要有
  const u = groups('unit 3');
  assert.deepEqual(u['卡片集'].map((x) => x.main).sort(), ['Unit 3.7 经典条件反射', 'Unit 3.8 操作条件反射']);
  const c = groups('CONDITIONING');
  assert.equal(c['卡片'].length, 2);
  assert.ok(c['卡片'].every((x) => x.href.startsWith('#/set/')));
  // 题目: 去它的题目集
  const m = groups('巴甫洛夫');
  assert.equal(m['卡片'][0].main, 'Pavlov');
  assert.equal(m['题目'].length, 1);
  assert.ok(m['题目'][0].href.startsWith('#/mistakes/set/'));
  // 没有的、空的
  assert.deepEqual(localSuggestions(store, '没有这个词'), []);
  assert.deepEqual(localSuggestions(store, '   '), []);
  // 每类最多几个
  for (let i = 0; i < 8; i++) store.putSet({ ...makeSet({ title: `Unit 9.${i}` }), cards: [makeCard(`word ${i}`, 'x'), makeCard(`word b${i}`, 'y')] });
  const many = groups('unit 9');
  assert.equal(many['卡片集'].length, 3);
  assert.ok(groups('word')['卡片'].length <= 4);

  // 长的字: 取找到的那一段, 前后省略
  const long = '一二三四五六七八九十'.repeat(5) + '琵琶行' + '甲乙丙丁'.repeat(10);
  const s = snippet(long, '琵琶');
  assert.ok(s.startsWith('⋯') && s.endsWith('⋯') && s.includes('琵琶行'));
  assert.equal(snippet('Unit 3.7 经典条件反射 (Classical Conditioning) 第一张', '条件'), 'Unit 3.7 经典条件反射 (Classical Condition⋯'); // 找到的字看得见, 就从头开始
  assert.ok(s.length <= 38);
  assert.equal(snippet('短的', '短'), '短的');

  // 书斋: 题目、作者找到的不另写句子; 句子找到的写上那一句
  const lib = libraryGroup([
    { book: 'tangshi', i: 250, piece: { t: '琵琶行', a: '白居易', e: '唐' }, where: 'title', line: '浔阳江头夜送客' },
    { book: 'tangshi', i: 3, piece: { t: '静夜思', a: '李白', e: '唐' }, where: 'line', line: '床前明月光，疑是地上霜。' },
  ]);
  assert.equal(lib.items[0].href, '#/read/tangshi/251');
  assert.equal(lib.items[0].sub, '唐诗三百首 · 〔唐〕白居易');
  assert.ok(lib.items[1].sub.endsWith('床前明月光，疑是地上霜。'));
});

test('作者一组: 点了到作者页', () => {
  const g = authorGroup([{ name: '李白', era: '唐', count: 43 }, { name: '李商隐', era: '唐', count: 24 }, { name: '李贺', era: '唐', count: 3 }, { name: '李益', era: '唐', count: 2 }]);
  assert.equal(g.items.length, 3);
  assert.equal(g.items[0].href, '#/read/author/%E6%9D%8E%E7%99%BD');
  assert.equal(g.items[0].sub, '〔唐〕书斋里有 43 篇');
});

test('朗读一句一句念 (v1.71): 太长的一段按句子拆开, 字一个不少', () => {
  assert.deepEqual(chunks('床前明月光，疑是地上霜。'), ['床前明月光，疑是地上霜。']);
  const long = '诗曰：混沌未分天地乱，茫茫渺渺无人见。自从盘古破鸿蒙，开辟从兹清浊辨。覆载群生仰至仁，发明万物皆成善。欲知造化会元功，须看西游释厄传。盖闻天地之数，有十二万九千六百岁为一元。将一元分为十二会，乃子、丑、寅、卯、辰、巳、午、未、申、酉、戌、亥之十二支也。';
  const parts = chunks(long, 40);
  assert.ok(parts.length > 3);
  assert.equal(parts.join(''), long);
  assert.ok(parts.every((x) => x.length <= 60));
  assert.ok(parts.slice(0, -1).every((x) => /[。！？；」]$/.test(x)));
  // 一句就超长的不拆 (没有句号)
  assert.deepEqual(chunks('一'.repeat(100), 40), ['一'.repeat(100)]);
});
