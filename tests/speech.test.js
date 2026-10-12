import { test } from 'node:test';
import assert from 'node:assert/strict';
import { guessLang } from '../js/speech.js';

test('「自动」朗读时按字猜语言', () => {
  assert.equal(guessLang('apple'), 'en-US');
  assert.equal(guessLang('苹果'), 'zh-CN');
  assert.equal(guessLang('りんご'), 'ja-JP');
  assert.equal(guessLang('林檎 (りんご)'), 'ja-JP');
  assert.equal(guessLang('사과'), 'ko-KR');
  assert.equal(guessLang('яблоко'), 'ru-RU');
});
