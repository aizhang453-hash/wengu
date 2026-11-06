import { test } from 'node:test';
import assert from 'node:assert/strict';
import { guessLang, guessLangOf, autoLang, setLang, LANGS, normalizeLang, bestVoice } from '../js/speech.js';

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

test('挑朗读的声音: 不挑苹果的趣味声音 (Eddy、Grandma 读中文很怪); 默认的、增强版的、本机的优先; 念普通话时台湾的比粤语的好', () => {
  const v = (name, lang, extra = {}) => ({ name, lang, localService: true, default: false, ...extra });
  // 苹果电脑上的 Chrome: 中文列表里 Eddy 排第一, 婷婷排最后 (以前挑的是 Eddy)
  const mac = [
    ...['Eddy', 'Flo', 'Grandma', 'Grandpa', 'Reed', 'Rocko', 'Sandy', 'Shelley'].map((n) => v(`${n} (Chinese (China mainland))`, 'zh-CN')),
    v('Tingting', 'zh-CN'),
    v('Google 普通话（中国大陆）', 'zh-CN', { localService: false }),
    v('Meijia', 'zh-TW'),
    v('Sinji', 'zh-HK'),
    v('Albert', 'en-US'),
    v('Bad News', 'en-US'),
    v('Samantha', 'en-US', { default: true }),
  ];
  assert.equal(bestVoice(mac, 'zh-CN').name, 'Tingting');
  assert.equal(bestVoice(mac, 'en-US').name, 'Samantha');
  assert.equal(bestVoice(mac, 'zh-TW').name, 'Meijia');
  assert.equal(bestVoice(mac, 'zh-HK').name, 'Sinji');
  // 粤语写成 yue-HK 也认; 念普通话时不挑它
  const yue = [v('Meijia', 'zh-TW'), v('Sinji', 'yue-HK')];
  assert.equal(bestVoice(yue, 'zh-HK').name, 'Sinji');
  assert.equal(bestVoice(yue, 'zh-CN').name, 'Meijia');
  // 没有大陆的正常声音: 台湾的 > 粤语的 > 趣味声音
  const noMainland = mac.filter((x) => x.lang !== 'zh-CN' || x.name.startsWith('Eddy'));
  assert.equal(bestVoice(noMainland, 'zh-CN').name, 'Meijia');
  assert.equal(bestVoice(noMainland.filter((x) => x.name !== 'Meijia'), 'zh-CN').name, 'Sinji');
  // 只有趣味声音也比没声音好
  assert.equal(bestVoice([v('Eddy (Chinese (China mainland))', 'zh-CN')], 'zh-CN').name, 'Eddy (Chinese (China mainland))');
  // 增强版、系统默认的优先; 本机的比联网的好
  assert.equal(bestVoice([v('Tingting', 'zh-CN'), v('Tingting (Enhanced)', 'zh-CN')], 'zh-CN').name, 'Tingting (Enhanced)');
  assert.equal(bestVoice([v('Lili', 'zh-CN'), v('Tingting', 'zh-CN', { default: true })], 'zh-CN').name, 'Tingting');
  assert.equal(bestVoice([v('Google 普通话（中国大陆）', 'zh-CN', { localService: false }), v('Microsoft Huihui', 'zh-CN')], 'zh-CN').name, 'Microsoft Huihui');
  // 安卓写成 zh_CN; 没有这种语言返回 null; 名字像但不是趣味声音的不误伤
  assert.equal(bestVoice([v('普通话', 'zh_CN')], 'zh-CN').name, '普通话');
  assert.equal(bestVoice([v('Samantha', 'en-US')], 'zh-CN'), null);
  assert.equal(bestVoice([v('Flora', 'en-US'), v('Albert', 'en-US')], 'en-US').name, 'Flora');
});
