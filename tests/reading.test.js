import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Store, cleanData } from '../js/store.js';
import { mergeData } from '../js/merge.js';
import { BOOKS, bookOf, loadBook, pieceId, parsePieceId, clauses, makeCards, setTitle, DAILY_BOOK, dailyIndex, searchLibrary, cleanReading, mergeReading, isFav, favList, recentBooks } from '../js/reading.js';

function memoryStorage() {
  const map = new Map();
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k) };
}

// 常见的繁体字: 简体的书里不该有
const TRAD = /[們這個來時為爲說國學對開後裏雲風東書詩長門見無與會從問間點總義聖訓謹愛親餘歲禮將學經憂樂聲啓興龍鳥]/;

test('书库: 每本书都拿得到, 篇数跟书目一样; 简体、繁体一篇对一篇; 简体里没有繁体字', async () => {
  assert.equal(BOOKS.length, 11);
  assert.deepEqual(BOOKS.slice(0, 2).map((b) => b.title), ['唐诗三百首', '宋词三百首']);
  for (const b of BOOKS) {
    const hans = await loadBook(b.id);
    const hant = await loadBook(b.id, { hant: true });
    assert.equal(hans.id, b.id);
    assert.equal(hans.pieces.length, b.count, b.id);
    assert.equal(hant.pieces.length, b.count, b.id);
    assert.equal(hans.title, b.title);
    for (const [i, p] of hans.pieces.entries()) {
      assert.ok(p.t && p.p.length && p.p.every((l) => l.trim()), `${b.id} 第 ${i} 篇是空的`);
      assert.equal(hant.pieces[i].p.length, p.p.length, `${b.id} 第 ${i} 篇简繁不一样长`);
      if (b.kind === 'poem') assert.ok(p.a, `${b.id} 第 ${i} 首没有作者`); // 朝代可以没有 (无名氏的《题壁》)
      if (hans.groups.length) assert.ok(hans.groups[p.g], `${b.id} 第 ${i} 篇不在哪一组里`);
      const text = [p.t, ...p.p].join('');
      assert.ok(!TRAD.test(text), `${b.id}「${p.t}」里有繁体字: ${text.match(TRAD)}`);
      // 没有很多字体里没有的少见字 (会显示成方框), 句子里没夹着版本注释的括号
      assert.ok(![...text].some((ch) => ch.codePointAt(0) > 0xffff), `${b.id}「${p.t}」里有少见字`);
      assert.ok(!/[（(][^）)]*一作/.test(text), `${b.id}「${p.t}」句子里有注释`);
    }
    assert.ok(/[聖詩學經書]|[^\x00-\x7f]/.test(hant.pieces.map((p) => p.p.join('')).join('')), b.id);
  }
  assert.equal(await loadBook('nope'), null);
  // 整理过标点: 千字文两句一对, 弟子规三字一顿
  assert.equal((await loadBook('qianziwen')).pieces[0].p[0], '天地玄黄，宇宙洪荒。');
  assert.equal((await loadBook('dizigui')).pieces[0].p[0], '弟子规，圣人训。首孝弟，次谨信。');
  assert.equal((await loadBook('qianjiashi')).pieces[0].p[0], '春眠不觉晓，处处闻啼鸟。');
});

test('唐诗三百首: 版本注释拿到正文外面; 宋词三百首: 题目是「词牌·第一句」, 按词人分组, 资料丢的字补回来了', async () => {
  const tang = await loadBook('tangshi');
  assert.equal(tang.groups.length, 7);
  const songbie = tang.pieces.find((p) => p.t === '山中送别');
  assert.deepEqual(songbie.p, ['山中相送罢，日暮掩柴扉。', '春草明年绿，王孙归不归？']);
  assert.deepEqual(songbie.n, ['明年 一作：年年']);
  assert.ok(tang.pieces.some((p) => p.t === '静夜思' && p.a === '李白' && p.p[0].startsWith('床前明月光')));
  const tangHant = await loadBook('tangshi', { hant: true });
  assert.deepEqual(tangHant.pieces[tang.pieces.indexOf(songbie)].n, ['明年 一作：年年']);

  const song = await loadBook('songci');
  assert.equal(song.pieces.length, 280);
  const shuidiao = song.pieces.find((p) => p.t === '水调歌头·明月几时有');
  assert.equal(shuidiao.a, '苏轼');
  assert.equal(song.groups[shuidiao.g], '苏轼');
  // 同一个词人的排在一起
  const order = song.pieces.map((p) => p.g);
  assert.deepEqual(order, [...order].sort((x, y) => x - y));
  // 词牌「凤栖梧・蝶恋花」用正名
  assert.ok(!song.pieces.some((p) => /[・]/.test(p.t)));
  assert.ok(song.pieces.some((p) => p.t === '江城子·十年生死两茫茫'));
  // 资料里丢的字、丢了字的作者
  const all = song.pieces.flatMap((p) => p.p).join('');
  for (const s of ['花悰暗省', '紞如三鼓', '揾英雄泪', '青楼薄幸名存', '露漙幽草', '回首向来萧瑟处']) assert.ok(all.includes(s), s);
  const authors = new Set(song.pieces.map((p) => p.a));
  for (const a of ['张镃', '韩疁', '赵令畤']) assert.ok(authors.has(a), a);
  for (const a of ['张', '韩', '赵令']) assert.ok(!authors.has(a), a);
  // 原文是简体: 繁体是转回去的
  const songHant = await loadBook('songci', { hant: true });
  assert.equal(songHant.pieces[song.pieces.indexOf(shuidiao)].p[0], '明月幾時有，把酒問青天。');
});

test('一篇的编号: 书:第几篇; 没有的书、超出的篇返回 null', () => {
  assert.equal(pieceId('qianjiashi', 3), 'qianjiashi:3');
  assert.deepEqual(parsePieceId('qianjiashi:3'), { book: 'qianjiashi', i: 3 });
  assert.equal(parsePieceId(`qianjiashi:${bookOf('qianjiashi').count}`), null);
  assert.equal(parsePieceId('nope:1'), null);
  assert.equal(parsePieceId('qianjiashi:-1'), null);
  assert.equal(parsePieceId('x'), null);
});

test('做卡片: 接下句 (诗一首一首, 第一张问第一句; 文章连着接), 整篇', async () => {
  assert.deepEqual(clauses(['春眠不觉晓，处处闻啼鸟。', '夜来风雨声，花落知多少。']), ['春眠不觉晓', '处处闻啼鸟', '夜来风雨声', '花落知多少']);
  assert.deepEqual(clauses(['人之初，性本善；性相近？习相远！']), ['人之初', '性本善', '性相近', '习相远']);
  const poems = await loadBook('qianjiashi');
  const book = bookOf('qianjiashi');
  const one = makeCards(book, [poems.pieces[0]]);
  assert.deepEqual(one, [
    { term: '《春眠》（孟浩然）第一句', def: '春眠不觉晓' },
    { term: '春眠不觉晓', def: '处处闻啼鸟' },
    { term: '处处闻啼鸟', def: '夜来风雨声' },
    { term: '夜来风雨声', def: '花落知多少' },
  ]);
  // 两首: 不跨首接 (第一首的末句不接第二首)
  const two = makeCards(book, poems.pieces.slice(0, 2));
  assert.equal(two.length, 8);
  assert.ok(!two.some((c) => c.term === '花落知多少'));
  assert.deepEqual(makeCards(book, [poems.pieces[0]], 'whole'), [{ term: '《春眠》（孟浩然）', def: '春眠不觉晓，处处闻啼鸟。\n夜来风雨声，花落知多少。' }]);
  // 宋词的题目里就有第一句: 不出「第一句」那张 (不然答案写在题目上)
  const song = await loadBook('songci');
  const sd = song.pieces.find((p) => p.t === '水调歌头·明月几时有');
  const sdCards = makeCards(bookOf('songci'), [sd]);
  assert.deepEqual(sdCards[0], { term: '明月几时有', def: '把酒问青天' });
  assert.ok(!sdCards.some((c) => c.term.includes('第一句')));
  // 文章: 整本时段和段连着接
  const szj = await loadBook('sanzijing');
  const sbook = bookOf('sanzijing');
  const all = makeCards(sbook, szj.pieces);
  const n = clauses(szj.pieces.flatMap((p) => p.p)).length;
  assert.equal(all.length, n - 1);
  assert.deepEqual(all[0], { term: '人之初', def: '性本善' });
  const lastOfFirst = clauses(szj.pieces[0].p).at(-1);
  const firstOfSecond = clauses(szj.pieces[1].p)[0];
  assert.ok(all.some((c) => c.term === lastOfFirst && c.def === firstOfSecond));
  assert.deepEqual(makeCards(sbook, [szj.pieces[0]], 'whole')[0].term, `三字经 · ${szj.pieces[0].t}`);
  assert.equal(setTitle(sbook), '三字经');
  assert.equal(setTitle(book, poems.pieces[0]), '春眠（孟浩然）');
  assert.equal(setTitle(sbook, szj.pieces[0]), `三字经 · ${szj.pieces[0].t}`);
  // 每本书每篇都做得出卡片, 卡片两面都不空
  for (const b of BOOKS) {
    const data = await loadBook(b.id);
    for (const style of ['next', 'whole']) {
      const cards = makeCards(b, data.pieces, style);
      assert.ok(cards.length > 0 && cards.every((c) => c.term && c.def), `${b.id} ${style}`);
    }
  }
});

test('每日一首: 一天一首, 哪台设备都一样; 一圈下来每首都轮到', () => {
  const n = bookOf(DAILY_BOOK).count;
  assert.equal(dailyIndex('2026-11-05', n), dailyIndex('2026-11-05', n));
  assert.notEqual(dailyIndex('2026-11-05', n), dailyIndex('2026-11-06', n));
  const seen = new Set();
  const start = Date.UTC(2026, 0, 1);
  for (let d = 0; d < n; d++) seen.add(dailyIndex(new Date(start + d * 86400000).toISOString().slice(0, 10), n));
  assert.equal(seen.size, n);
  for (const v of seen) assert.ok(v >= 0 && v < n);
  assert.equal(dailyIndex('2026-11-05', 5) < 5, true);
});

test('搜: 题目、作者、句子都能找到, 题目对上的排前面; 空的不找', async () => {
  const byTitle = await searchLibrary('春眠');
  assert.equal(byTitle[0].book, 'qianjiashi');
  assert.equal(byTitle[0].where, 'title');
  const byAuthor = await searchLibrary('孟浩然');
  assert.ok(byAuthor.filter((x) => x.where === 'author').length >= 2);
  assert.ok(byAuthor.some((x) => x.where === 'title' && x.piece.t.includes('送孟浩然'))); // 李白《黄鹤楼送孟浩然之广陵》: 题目里有, 排前面
  assert.equal(byAuthor[0].where, 'title');
  const byLine = await searchLibrary('一寸光阴');
  assert.ok(byLine.some((x) => x.book === 'zengguangxianwen' && x.line.includes('一寸光阴')));
  assert.ok((await searchLibrary('人之 初')).some((x) => x.book === 'sanzijing'));
  assert.deepEqual(await searchLibrary('  '), []);
  assert.deepEqual(await searchLibrary('不可能有这句话啊啊'), []);
  assert.ok((await searchLibrary('之', { limit: 5 })).length <= 5);
});

test('收藏、读到哪: 存、洗、同步合并 (听后改的)、备份', () => {
  assert.equal(cleanReading(null), null);
  assert.equal(cleanReading({ favs: { 'nope:1': { on: 1, at: 5 } }, last: { qianjiashi: { i: 9999, at: 5 } } }), null);
  const r = cleanReading({ favs: { 'qianjiashi:0': { on: true, at: 10 }, 'sanzijing:1': { on: 0, at: 20 }, bad: { on: 1, at: 1 } }, last: { qianjiashi: { i: 5, at: 30 }, dizigui: { i: -1, at: 1 } } });
  assert.deepEqual(r, { favs: { 'qianjiashi:0': { on: 1, at: 10 }, 'sanzijing:1': { on: 0, at: 20 } }, last: { qianjiashi: { i: 5, at: 30 } } });
  assert.equal(isFav(r, 'qianjiashi:0'), true);
  assert.equal(isFav(r, 'sanzijing:1'), false);
  assert.deepEqual(favList(r), [{ pid: 'qianjiashi:0', book: 'qianjiashi', i: 0, at: 10 }]);
  // 合并: 每篇、每本书听后改的
  const other = cleanReading({ favs: { 'qianjiashi:0': { on: 0, at: 50 }, 'qianjiashi:2': { on: 1, at: 40 } }, last: { qianjiashi: { i: 2, at: 25 }, sanzijing: { i: 3, at: 60 } } });
  const m = mergeReading(r, other);
  assert.equal(isFav(m, 'qianjiashi:0'), false);
  assert.equal(isFav(m, 'qianjiashi:2'), true);
  assert.deepEqual(recentBooks(m), [
    { book: 'sanzijing', i: 3, at: 60 },
    { book: 'qianjiashi', i: 5, at: 30 },
  ]);
  assert.equal(mergeReading(null, r), r);
  assert.equal(mergeReading(r, null), r);

  // 跟着数据存、同步、备份; 老数据没有是 null
  assert.equal(cleanData({ sets: [] }).reading, null);
  const store = new Store(memoryStorage());
  store.setFav('qianjiashi:7', true, 1000);
  store.markRead('qianjiashi', 7, 1000);
  store.markRead('qianjiashi', 7, 1500); // 一分钟里同一篇不再存
  assert.equal(store.data.reading.last.qianjiashi.at, 1000);
  store.markRead('qianjiashi', 8, 2000);
  assert.deepEqual(store.data.reading.last.qianjiashi, { i: 8, at: 2000 });
  store.setFav('qianjiashi:7', false, 900); // 时间往回走了也算后改的
  assert.equal(isFav(store.data.reading, 'qianjiashi:7'), false);
  assert.ok(store.data.reading.favs['qianjiashi:7'].at > 1000);
  const again = new Store(memoryStorage());
  again.replaceData(JSON.parse(JSON.stringify(store.data)));
  assert.deepEqual(again.data.reading, store.data.reading);
  // 同步: 老版本 (没有 reading) 合进来不会把这里的去掉
  assert.deepEqual(mergeData(store.data, { sets: [] }).reading, store.data.reading);
  // 备份恢复: 合起来
  const other2 = new Store(memoryStorage());
  other2.setFav('dizigui:0', true, 5000);
  other2.importBackup(store.exportBackup(), 6000);
  assert.equal(isFav(other2.data.reading, 'dizigui:0'), true);
  assert.deepEqual(other2.data.reading.last.qianjiashi, { i: 8, at: 2000 });
});
