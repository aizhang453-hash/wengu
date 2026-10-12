import { test } from 'node:test';
import assert from 'node:assert/strict';
import { grab, bookmarkletCode } from '../js/quizlet.js';
import { decodeShare } from '../js/share.js';
import { normalizeLang } from '../js/speech.js';

// 假的网页: 只有 __NEXT_DATA__, 没有别的
function fakeDoc({ nextData = null, title = '' } = {}) {
  return {
    title,
    getElementById: (id) => (id === '__NEXT_DATA__' && nextData ? { textContent: JSON.stringify(nextData) } : null),
    querySelectorAll: () => [],
    querySelector: () => null,
  };
}

// 老的样子: dehydratedReduxStateKey 是一串 JSON, 里面 setPage.termIdToTermsMap (顺序乱的, 看 rank)
const oldStyle = {
  props: {
    pageProps: {
      dehydratedReduxStateKey: JSON.stringify({
        setPage: {
          set: { id: 40497324, title: 'Basic Spanish Colors', wordLang: 'es', defLang: 'en', numTerms: 3 },
          termIdToTermsMap: {
            t3: { id: 't3', word: 'azul', definition: 'blue', rank: 2, _imageUrl: '//o.quizlet.com/abc_m.jpg' },
            t1: { id: 't1', word: 'rojo', definition: 'red', rank: 0, _imageUrl: null },
            t2: { id: 't2', word: 'verde', definition: 'green\nalso: unripe', rank: 1 },
          },
        },
      }),
    },
  },
};

// 新的样子: studyModesCommon.studiableDocumentData.studiableItems → cardSides
const side = (label, text, lang, image) => ({ label, media: [{ type: 1, plainText: text, languageCode: lang, richText: null }, ...(image ? [{ type: 2, url: image, width: 100 }] : [])] });
const newStyle = {
  props: {
    pageProps: {
      studyModesCommon: {
        studiableDocumentData: {
          studiableItems: [
            { id: 1, cardSides: [side('word', '猫', 'zh-CN'), side('definition', 'cat', 'en', 'https://o.quizlet.com/cat_m.jpg')] },
            { id: 2, cardSides: [side('word', '狗', 'zh-CN'), side('definition', 'dog', 'en')] },
            { id: 3, cardSides: [side('word', '', 'zh-CN'), side('definition', '', 'en')] },
          ],
        },
      },
    },
  },
};

test('Quizlet 老的网页数据: 按 rank 排好, 图片网址补上 https, 标题和语言', () => {
  const r = grab(fakeDoc({ nextData: oldStyle }), {});
  assert.equal(r.title, 'Basic Spanish Colors');
  assert.equal(r.termLang, 'es');
  assert.equal(r.defLang, 'en');
  assert.deepEqual(r.cards, [
    { term: 'rojo', def: 'red', imageUrl: '' },
    { term: 'verde', def: 'green\nalso: unripe', imageUrl: '' },
    { term: 'azul', def: 'blue', imageUrl: 'https://o.quizlet.com/abc_m.jpg' },
  ]);
});

test('Quizlet 新的网页数据: cardSides 里的字和图片; 标题从网页标题来; 空卡片不要', () => {
  const r = grab(fakeDoc({ nextData: newStyle, title: '中文动物 Flashcards | Quizlet' }), {});
  assert.equal(r.title, '中文动物');
  assert.equal(r.termLang, 'zh-CN');
  assert.equal(r.defLang, 'en');
  assert.deepEqual(r.cards, [
    { term: '猫', def: 'cat', imageUrl: 'https://o.quizlet.com/cat_m.jpg' },
    { term: '狗', def: 'dog', imageUrl: '' },
  ]);
});

test('Quizlet: 网页里还有「相关卡片集」的标题时, 用词数对得上的那个', () => {
  const related = { props: { pageProps: { related: [{ title: '别人的卡片集', wordLang: 'en', defLang: 'fr', numTerms: 50 }], dehydratedReduxStateKey: JSON.stringify({ setPage: { set: { title: '我的卡片集', wordLang: 'es', defLang: 'en', numTerms: 2 }, termIdToTermsMap: { a: { word: 'uno', definition: 'one', rank: 0 }, b: { word: 'dos', definition: 'two', rank: 1 } } } }) } } };
  const r = grab(fakeDoc({ nextData: related, title: '我的卡片集 Flashcards | Quizlet' }), {});
  assert.deepEqual([r.title, r.termLang, r.defLang, r.cards.length], ['我的卡片集', 'es', 'en', 2]);
  // 词数都对不上: 用网页标题
  const odd = structuredClone(related);
  odd.props.pageProps.dehydratedReduxStateKey = odd.props.pageProps.dehydratedReduxStateKey.replace('"numTerms":2', '"numTerms":9');
  assert.equal(grab(fakeDoc({ nextData: odd, title: '我的卡片集 Flashcards | Quizlet' }), {}).title, '我的卡片集');
});

test('Quizlet: 找不到就是空的', () => {
  assert.deepEqual(grab(fakeDoc({ title: 'Quizlet' }), {}).cards, []);
  assert.deepEqual(grab(fakeDoc({ nextData: { props: { pageProps: { x: '{bad json "word"' } } } }), {}).cards, []);
});

test('语言代码: Quizlet 的 en、es、zh-TW 换成温故有的', () => {
  assert.equal(normalizeLang('en'), 'en-US');
  assert.equal(normalizeLang('es'), 'es-ES');
  assert.equal(normalizeLang('zh-TW'), 'zh-CN');
  assert.equal(normalizeLang('ja-JP'), 'ja-JP');
  assert.equal(normalizeLang('chem'), 'auto');
  assert.equal(normalizeLang(''), 'auto');
});

// 真的跑一遍书签代码: 网址解码 → 在「Quizlet 的页面」上运行 → 打开的网址能导入
async function runBookmarklet(doc) {
  const code = bookmarkletCode('https://aizhang453-hash.github.io/wengu/');
  assert.ok(code.startsWith('javascript:'));
  assert.ok(!/[#\s]{2}|#/.test(code.slice(11)), '网址里不能有 #');
  assert.ok(!/[^\x20-\x7e]/.test(code), '网址里只有 ASCII');
  let opened = null;
  let alerted = null;
  const win = { open: (url) => ((opened = url), {}), location: {} };
  new Function('document', 'window', 'alert', decodeURIComponent(code.slice('javascript:'.length)))(doc, win, (m) => (alerted = m));
  for (let i = 0; i < 50 && !opened && !alerted; i++) await new Promise((r) => setTimeout(r, 10));
  return { opened, alerted };
}

test('书签: 在 Quizlet 页面上点了, 打开温故的分享链接, 卡片都在', async () => {
  const { opened } = await runBookmarklet(fakeDoc({ nextData: oldStyle }));
  assert.match(opened, /^https:\/\/aizhang453-hash\.github\.io\/wengu\/#\/share\/z[A-Za-z0-9_-]+$/);
  const data = await decodeShare(opened.split('#/share/')[1]);
  assert.equal(data.title, 'Basic Spanish Colors');
  assert.equal(data.termLang, 'es');
  assert.equal(data.from, 'quizlet');
  assert.deepEqual(data.cards.map((c) => [c.term, c.def, c.imageUrl]), [
    ['rojo', 'red', undefined],
    ['verde', 'green\nalso: unripe', undefined],
    ['azul', 'blue', 'https://o.quizlet.com/abc_m.jpg'],
  ]);
});

test('书签: 不是卡片集页面就提示, 不打开', async () => {
  const { opened, alerted } = await runBookmarklet(fakeDoc({ title: 'Quizlet' }));
  assert.equal(opened, null);
  assert.match(alerted, /没找到卡片/);
});
