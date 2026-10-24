import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lookupWord, cardLookup, DICTS } from '../js/dict.js';

test('查词典: 从卡片的字里挑出要查的英语词', () => {
  const cases = {
    ubiquitous: 'ubiquitous',
    '**Ubiquitous**': 'Ubiquitous',
    'abandon (v.)': 'abandon',
    'abandon v.': 'abandon',
    'adj. ubiquitous': 'ubiquitous',
    'abandon; desert': 'abandon',
    'abandon, give up': 'abandon',
    'ubiquitous /juːˈbɪkwɪtəs/': 'ubiquitous',
    '1. abandon': 'abandon',
    'abandon 放弃': 'abandon',
    'abandon（放弃）': 'abandon',
    'give up': 'give up',
    'take something for granted': 'take something for granted',
    "can't": "can't",
    'can’t': "can't",
    'well-being': 'well-being',
    'naïve': 'naïve',
    'Hello!': 'Hello',
    'abandon\n放弃; 抛弃': 'abandon',
  };
  for (const [text, want] of Object.entries(cases)) assert.equal(lookupWord(text), want, text);
  // 一句话、中文、空的不查
  for (const text of ['', '   ', '放弃', 'existing or being everywhere at the same time, very common', '12345', 'ありがとう']) {
    assert.equal(lookupWord(text), null, text);
  }
});

test('查词典: 英语那面先填好, 英文解释整句也能换着查; 没有英语的卡片不放按钮', () => {
  const set = { id: 'd1', termLang: 'en-US', defLang: 'en-US', cards: [] };
  const card = { id: 'c1', term: 'ubiquitous (adj.)', def: 'existing or being everywhere at the same time' };
  assert.deepEqual(cardLookup(card, set), { word: 'ubiquitous', texts: ['ubiquitous', 'existing or being everywhere at the same time'] });

  // 正面中文、背面英语
  const zh = { id: 'd2', termLang: 'zh-CN', defLang: 'en-US', cards: [] };
  assert.deepEqual(cardLookup({ id: 'c2', term: '放弃', def: 'abandon' }, zh), { word: 'abandon', texts: ['abandon'] });

  // 「自动」: 按整个卡片集猜哪面是英语
  const cards = [
    { id: 'a', term: 'apple', def: '苹果' },
    { id: 'b', term: 'banana', def: '香蕉' },
    { id: 'c', term: 'cherry', def: '樱桃' },
  ];
  const auto = { id: 'd3', termLang: 'auto', defLang: 'auto', cards };
  assert.deepEqual(cardLookup(cards[0], auto), { word: 'apple', texts: ['apple'] });

  // 两面都不是英语
  const jp = { id: 'd4', termLang: 'ja-JP', defLang: 'zh-CN', cards: [] };
  assert.equal(cardLookup({ id: 'c4', term: 'りんご', def: '苹果' }, jp), null);
  // 西班牙语的卡片集不查英语词典
  const es = { id: 'd5', termLang: 'es-ES', defLang: 'zh-CN', cards: [] };
  assert.equal(cardLookup({ id: 'c5', term: 'perro', def: '狗' }, es), null);
});

test('查词典: 每家词典的网址', () => {
  const url = Object.fromEntries(DICTS.map((d) => [d.id, d.url]));
  assert.equal(url.oxford('ubiquitous'), 'https://www.oxfordlearnersdictionaries.com/search/english/?q=ubiquitous');
  assert.equal(url.oxford('give up'), 'https://www.oxfordlearnersdictionaries.com/search/english/?q=give%20up');
  assert.equal(url.cambridge('Give Up'), 'https://dictionary.cambridge.org/dictionary/english-chinese-simplified/give-up');
  assert.equal(url.youdao('a whole sentence.'), 'https://dict.youdao.com/result?word=a%20whole%20sentence.&lang=en');
  for (const d of DICTS) assert.ok(d.url('x&y=1').includes('x%26y%3D1'), d.id); // 字都转义了, 不会改掉网址
});
