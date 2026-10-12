import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeShare, decodeShare, shareUrl } from '../js/share.js';

const set = {
  title: '托福 **核心词**',
  description: '第一单元',
  termLang: 'en-US',
  defLang: 'zh-CN',
  cards: Array.from({ length: 50 }, (_, i) => ({ id: `c${i}`, term: `word${i}`, def: `意思 ${i}, 还有逗号`, image: 'm_local' })),
};

test('分享: 编码再解码, 文字都在 (本机的图片不带)', async () => {
  const code = await encodeShare(set);
  assert.equal(code[0], 'z');
  assert.match(code, /^[A-Za-z0-9_-]+$/); // 能放进网址
  const back = await decodeShare(code);
  assert.equal(back.title, set.title);
  assert.equal(back.description, '第一单元');
  assert.equal(back.termLang, 'en-US');
  assert.equal(back.cards.length, 50);
  assert.deepEqual(back.cards[7], { term: 'word7', def: '意思 7, 还有逗号' });
});

test('压缩以后短很多', async () => {
  const code = await encodeShare(set);
  assert.ok(code.length < JSON.stringify(set.cards.map((c) => [c.term, c.def])).length / 2, `${code.length}`);
});

test('从 Quizlet 搬来的图片网址能带上, 不是 https 的不要', async () => {
  const back = await decodeShare(
    await encodeShare({
      title: 't',
      cards: [
        { term: 'a', def: 'b', imageUrl: 'https://o.quizlet.com/x.jpg' },
        { term: 'c', def: 'd', imageUrl: 'javascript:alert(1)' },
      ],
    }),
  );
  assert.equal(back.cards[0].imageUrl, 'https://o.quizlet.com/x.jpg');
  assert.equal(back.cards[1].imageUrl, undefined);
});

test('坏的链接返回 null, 不出错', async () => {
  assert.equal(await decodeShare('zzzz!!'), null);
  assert.equal(await decodeShare('x123'), null);
  assert.equal(await decodeShare(''), null);
  assert.equal(await decodeShare(`j${btoa('{"hello":1}')}`), null);
});

test('链接的样子', () => {
  assert.equal(shareUrl('zABC', 'https://aizhang453-hash.github.io/wengu/'), 'https://aizhang453-hash.github.io/wengu/#/share/zABC');
});
