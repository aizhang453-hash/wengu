import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BOOKS, SHELVES, bookOf, loadBook, loadChapter, loadWithPiece, searchLibrary, readingsOf, parsePieceId, pieceId } from '../js/reading.js';

// 常见的繁体字: 简体里不该有 (跟 reading.test.js 一样)
const TRAD = /[們這個來時為爲說國學對開後裏雲風東書詩長門見無與會從問間點總義聖訓謹愛親餘歲禮將學經憂樂聲啓興龍鳥]/;
// 正文只有汉字和中文标点 (维基文库的 {{模板}}、[[链接]]、<标签>、'''粗体''' 都清掉了)
// 小说里有扩展区的生僻字 (「扑𧈢蜡」), 原文就是这样, 不能删 (有的字体显示不出来)
const LINE = /^[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\u{20000}-\u{3134f}，。；：？！、“”‘’「」『』《》〈〉·—…□（）]+$/u;

test('西游记: 书目、书架 (古典小说)、目录只有回目', async () => {
  const b = bookOf('xiyouji');
  assert.ok(b);
  assert.deepEqual([b.title, b.author, b.era, b.kind, b.unit, b.cat, b.count], ['西游记', '吴承恩', '明', 'novel', '回', 'novel', 100]);
  assert.ok(SHELVES.some((s) => s.key === 'novel' && s.name === '古典小说'));
  assert.deepEqual(BOOKS.filter((x) => x.cat === 'novel').map((x) => x.id), ['xiyouji']);
  assert.ok(b.intro.includes('清代') && b.intro.includes('世德堂本'));
  assert.deepEqual(b.src.map((x) => x.name), ['维基文库', '古登堡计划']);
  const idx = await loadBook('xiyouji');
  const hidx = await loadBook('xiyouji', { hant: true });
  assert.equal(idx.pieces.length, 100);
  assert.equal(hidx.pieces.length, 100);
  for (const p of idx.pieces) {
    assert.ok(p.t && !p.p, '目录里只有回目, 没有正文');
    assert.ok(!TRAD.test(p.t), p.t);
  }
  assert.equal(idx.pieces[0].t, '灵根育孕源流出　心性修持大道生');
  assert.ok(idx.pieces[8].t.startsWith('陈光蕊赴任逢灾'));
  assert.equal(idx.pieces[99].t, '径回东土　五圣成真');
  assert.equal(hidx.pieces[0].t, '靈根育孕源流出　心性修持大道生');
  // 目录文件很小 (正文不在里面)
  assert.ok(readFileSync(new URL('../js/library/xiyouji.js', import.meta.url)).length < 20000);
});

test('西游记: 一百回都拿得到, 简繁一段对一段、一样长, 简体里没有繁体字, 没有网页标记', async () => {
  let chars = 0;
  for (let i = 0; i < 100; i++) {
    const c = await loadChapter('xiyouji', i);
    const h = await loadChapter('xiyouji', i, { hant: true });
    assert.ok(c.p.length > 10, `第 ${i + 1} 回只有 ${c.p.length} 段`);
    assert.equal(h.p.length, c.p.length, `第 ${i + 1} 回简繁段数不一样`);
    c.p.forEach((line, j) => {
      assert.ok(LINE.test(line), `第 ${i + 1} 回第 ${j + 1} 段: ${line.slice(0, 40)}`);
      assert.ok(!TRAD.test(line), `第 ${i + 1} 回有繁体字: ${line.match(TRAD)} (${line.slice(0, 20)})`);
      assert.ok(!/[{}[\]<>|']/.test(h.p[j]), `第 ${i + 1} 回繁体有网页标记`);
      chars += line.length;
    });
  }
  assert.ok(chars > 500000 && chars < 900000, `一共 ${chars} 字`);
  assert.equal(await loadChapter('xiyouji', 100), null);
  assert.equal(await loadChapter('tangshi', 0), null, '不是小说的书没有分回的文件');
});

test('西游记: 照维基文库 (对照古登堡核对过, 古登堡重抄的那段不跟); 第九回写明是清代加进去的', async () => {
  const one = (await loadChapter('xiyouji', 0)).p.join('');
  // 古登堡第一回把「子会将终……阴阳交合」重抄了一遍, 维基文库是对的: 只出现一次
  assert.equal(one.split('子会将终').length - 1, 1);
  assert.ok(one.includes('至此，天清地爽'));
  assert.ok(one.includes('混沌未分天地乱'));
  // 第十二回通行本有、古登堡那份删掉的段落还在; 第一百回「天竺国印」还在
  assert.ok((await loadChapter('xiyouji', 11)).p.join('').includes('九环杖有甚好处'));
  assert.ok((await loadChapter('xiyouji', 99)).p.join('').includes('天竺国印'));
  const nine = await loadChapter('xiyouji', 8);
  assert.ok(nine.note.includes('清代') && nine.note.includes('附录'));
  assert.ok(nine.p.join('').includes('陈光蕊'));
  assert.equal((await loadChapter('xiyouji', 0)).note, undefined);
});

test('西游记: 读一回 (loadWithPiece) 带正文, 别的回不带; 搜索只搜回目; 收藏、读到哪的编号照旧', async () => {
  const data = await loadWithPiece('xiyouji', 26);
  assert.ok(data.pieces[26].p.length > 10);
  assert.ok(data.pieces[26].t.includes('尸魔三戏唐三藏'));
  assert.equal(data.pieces[25].p, undefined);
  const hant = await loadWithPiece('xiyouji', 26, { hant: true });
  assert.ok(hant.pieces[26].t.includes('屍魔三戲唐三藏'));
  // 别的书照旧整本拿
  const ts = await loadWithPiece('tangshi', 1);
  assert.ok(ts.pieces[0].p.length && ts.pieces[1].p.length);
  // 搜回目找得到; 搜正文里的句子不会出错 (小说的正文不搜)
  const hits = await searchLibrary('三打白骨精');
  assert.ok(Array.isArray(hits));
  const t = await searchLibrary('尸魔三戏');
  assert.deepEqual(t.map((x) => [x.book, x.i, x.where]), [['xiyouji', 26, 'title']]);
  assert.equal(t[0].line, '第 27 回');
  // 读音: 正文里也标 (不写书的那几条, 像「曾子」), 不出错
  const c = await loadWithPiece('xiyouji', 0);
  assert.ok(Array.isArray(readingsOf('xiyouji', c.pieces[0])));
  assert.deepEqual(parsePieceId(pieceId('xiyouji', 99)), { book: 'xiyouji', i: 99 });
  assert.equal(parsePieceId('xiyouji:100'), null);
});
