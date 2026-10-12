import { test } from 'node:test';
import assert from 'node:assert/strict';
import { grade, normalize, editDistance, alternatives } from '../js/grade.js';

const ok = (r) => r.correct && !r.close;
const close = (r) => r.correct && r.close;
const wrong = (r) => !r.correct;

test('大小写、标点、空格不算错', () => {
  assert.ok(ok(grade('  Apple ', 'apple')));
  assert.ok(ok(grade('hello world', 'Hello, world!')));
  assert.ok(ok(grade('苹果', '苹果。')));
  assert.equal(normalize('Ｈｅｌｌｏ　Ｗｏｒｌｄ'), 'hello world');
});

test('空的、答错的', () => {
  assert.ok(wrong(grade('', 'apple')));
  assert.ok(wrong(grade('   ', 'apple')));
  assert.ok(wrong(grade('banana', 'apple')));
  assert.ok(wrong(grade('梨', '苹果')));
});

test('括号里的可以不写', () => {
  assert.ok(ok(grade('河', '河 (一条河)')));
  assert.ok(ok(grade('run', 'run（跑）')));
  assert.ok(ok(grade('河 一条河', '河 (一条河)')));
});

test('有几个意思, 写出一个就行', () => {
  assert.ok(ok(grade('奔跑', '跑, 奔跑')));
  assert.ok(ok(grade('跑', '跑；奔跑')));
  assert.ok(ok(grade('quick', 'fast / quick')));
  assert.deepEqual(alternatives('km/h'), ['km']);
  assert.ok(wrong(grade('h', 'km/h')));
});

test('打错一两个字母算对, 但提醒', () => {
  assert.ok(close(grade('aple', 'apple')));
  assert.ok(close(grade('elefant', 'elephant')));
  assert.ok(wrong(grade('cat', 'car'))); // 太短不容错
  assert.ok(wrong(grade('apricot', 'apple')));
});

test('中文放得严: 短的不容错', () => {
  assert.ok(wrong(grade('苹菓', '苹果')));
  assert.ok(close(grade('中华人民共和过', '中华人民共和国')));
});

test('少了重音符号、词的顺序不一样, 算对但提醒', () => {
  assert.ok(close(grade('cafe', 'café')));
  assert.ok(close(grade('ecole', 'école')));
  assert.ok(close(grade('world hello', 'hello world')));
});

test('关掉智能判分就只认一模一样的 (大小写标点照样不管)', () => {
  assert.ok(ok(grade('APPLE!', 'apple', { smart: false })));
  assert.ok(wrong(grade('aple', 'apple', { smart: false })));
  assert.ok(wrong(grade('河', '河 (一条河)', { smart: false })));
});

test('编辑距离按字算', () => {
  assert.equal(editDistance('kitten', 'sitting'), 3);
  assert.equal(editDistance('苹果', '苹菓'), 1);
  assert.equal(editDistance('', 'abc'), 3);
});

test('英文解释里的逗号是一句话, 只写半句不算对', () => {
  assert.ok(wrong(grade('especially in fear', 'to run quickly, especially in fear')));
  assert.ok(wrong(grade('a large', 'a large, gray animal')));
  assert.ok(ok(grade('a large, gray animal', 'a large, gray animal')));
  // 一个词一个词列出来的才是几个意思
  assert.ok(ok(grade('large', 'big, large, huge')));
  assert.ok(ok(grade('飞奔', '跑，奔跑，飞奔')));
  // 中文长句子里的逗号也不拆
  assert.ok(wrong(grade('经常在害怕的时候', '很快地跑开，经常在害怕的时候')));
  // 分号、斜杠照样是几个意思
  assert.ok(ok(grade('to sprint', 'to run quickly; to sprint')));
});
