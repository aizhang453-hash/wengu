import { test } from 'node:test';
import assert from 'node:assert/strict';
import { guessLang, guessLangOf, autoLang, setLang, LANGS, normalizeLang } from '../js/speech.js';

test('「自动」朗读时按字猜语言', () => {
  assert.equal(guessLang('apple'), 'en-US');
  assert.equal(guessLang('苹果'), 'zh-CN');
  assert.equal(guessLang('りんご'), 'ja-JP');
  assert.equal(guessLang('林檎 (りんご)'), 'ja-JP');
  assert.equal(guessLang('사과'), 'ko-KR');
  assert.equal(guessLang('яблоко'), 'ru-RU');
});

test('「自动」看特别的字母: ñ ¿ ¡ 西班牙语, ß ä ö ü 德语, œ 法语, ã õ 葡萄牙语, 还有波兰语、土耳其语、越南语; 别的文字一看就知道', () => {
  const cases = {
    niño: 'es-ES', '¿Dónde está?': 'es-ES', '¡Hola!': 'es-ES', straße: 'de-DE', grüß: 'de-DE', œuvre: 'fr-FR', pão: 'pt-BR',
    człowiek: 'pl-PL', teşekkür: 'tr-TR', 'cảm ơn': 'vi-VN', مرحبا: 'ar-SA', שלום: 'he-IL', สวัสดี: 'th-TH', γεια: 'el-GR', नमस्ते: 'hi-IN',
    // 单看一个词看不出来的当英语
    perro: 'en-US', café: 'en-US',
  };
  for (const [text, lang] of Object.entries(cases)) assert.equal(guessLang(text), lang, text);
});

test('「自动」看整个卡片集: 西班牙语、法语、德语、意大利语、葡萄牙语的卡片集都认得出来; 英语卡片集里有几个 café、naïve 还是英语', () => {
  assert.equal(guessLangOf(['perro', 'gato', 'casa', 'niño', 'canción', 'árbol', 'mesa', 'libro', 'agua', 'corazón', 'feliz', 'rojo']), 'es-ES');
  assert.equal(guessLangOf(['chien', 'chat', 'maison', 'être', 'français', 'garçon', 'fenêtre', 'cœur', 'très', 'où', 'livre', 'eau']), 'fr-FR');
  assert.equal(guessLangOf(['Hund', 'Katze', 'Haus', 'Mädchen', 'Straße', 'schön', 'Brücke', 'groß', 'Tür', 'Buch', 'Wasser', 'über']), 'de-DE');
  assert.equal(guessLangOf(['cane', 'gatto', 'casa', 'città', 'perché', 'libro', 'acqua', 'più', 'caffè', 'così', 'bello', 'però']), 'it-IT');
  assert.equal(guessLangOf(['cão', 'gato', 'casa', 'pão', 'coração', 'irmã', 'livro', 'água', 'você', 'avó', 'feliz', 'mãe']), 'pt-BR');
  assert.equal(guessLangOf(['abate', 'café', 'naïve', 'benevolent', 'candid', 'déjà vu', 'eloquent', 'frugal', 'gregarious', 'hubris', 'jalapeño', 'zealous']), 'en-US');
  assert.equal(guessLangOf(['苹果', '狗', '猫']), 'zh-CN');
  assert.equal(guessLangOf(['the dog is big', 'el perro']), 'en-US'); // 只有一张有西班牙语的样子: 不够
  assert.equal(guessLangOf([]), 'en-US');
});

test('「自动」念一张卡片: 听卡片集的 (西班牙语卡片集里的 perro 念西班牙语), 这个词有特别明显的字母、别的文字的除外', () => {
  assert.equal(autoLang('perro', 'es-ES'), 'es-ES');
  assert.equal(autoLang('naïve', 'en-US'), 'en-US');
  assert.equal(autoLang('jalapeño', 'en-US'), 'es-ES');
  assert.equal(autoLang('狗', 'es-ES'), 'zh-CN');
  assert.equal(autoLang('niño'), 'es-ES');
  // 卡片集的猜测记着, 卡片变了才重算
  const set = { id: 's', updatedAt: 1, cards: ['perro', 'niño', 'canción', 'árbol', 'mesa', 'corazón'].map((term) => ({ term, def: '狗' })) };
  assert.equal(setLang(set, 'term'), 'es-ES');
  assert.equal(setLang(set, 'def'), 'zh-CN');
  set.cards = ['Hund', 'Mädchen', 'Straße', 'schön', 'groß', 'Tür'].map((term) => ({ term, def: '' }));
  assert.equal(setLang(set, 'term'), 'de-DE');
});

test('朗读能选的语言: 代码不重复, 都认得自己', () => {
  assert.ok(LANGS.length >= 25);
  assert.equal(new Set(LANGS.map(([code]) => code)).size, LANGS.length);
  for (const [code] of LANGS) assert.equal(normalizeLang(code), code);
});
