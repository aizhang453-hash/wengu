import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadBook, loadYizhu, entryOf, notesOf, readingsOf, makeCards, bookOf, YIZHU_BOOKS } from '../js/reading.js';

// 课程标准「古诗文背诵推荐篇目」里小学、初中的, 书库有的 (第几首, 从 1 数): 都要有注释和译文
const KEBEN = {
  tangshi: [71, 277, 2, 18, 34, 278, 30, 6, 282, 33, 11, 39, 40, 68, 61, 319, 313, 95, 20, 24, 81, 272, 91, 290, 202, 227, 117, 254, 57, 58, 46, 173],
  qianjiashi: [6, 145, 29, 98, 166, 114, 27, 101, 104, 90, 156, 134, 85, 162, 154, 89, 139, 140, 155, 48, 192, 173],
  songci: [185, 56],
};

test('唐诗宋词千家诗的注释: 每首都在书里、注释都找得到 (按顺序不重叠)、译文一行对一行; 读音不跨注释; 繁体标得上', async () => {
  assert.deepEqual(YIZHU_BOOKS, ['guwen', 'tangshi', 'songci', 'qianjiashi']);
  assert.equal(await loadYizhu('lunyu'), null);
  for (const id of ['tangshi', 'songci', 'qianjiashi']) {
    const book = await loadBook(id);
    const hant = await loadBook(id, { hant: true });
    const yizhu = await loadYizhu(id);
    const keys = Object.keys(yizhu);
    assert.equal(keys.length, KEBEN[id].length, `${id} 有 ${keys.length} 首, 应该是 ${KEBEN[id].length} 首`);
    for (const [t, e] of Object.entries(yizhu)) {
      // 键是「题目」或者「题目|作者」(书里有同名的要写作者)
      const [title, author] = t.split('|');
      const list = book.pieces.filter((p) => p.t === title && (!author || p.a === author));
      assert.equal(list.length, 1, `「${t}」在 ${id} 里不是正好一首`);
      const p = list[0];
      const i = book.pieces.indexOf(p);
      assert.ok(KEBEN[id].includes(i + 1), `「${t}」(${id} 第 ${i + 1} 首) 不在课本清单里`);
      assert.equal(entryOf(yizhu, p), e);
      assert.equal(e.yi.length, p.p.length, `「${t}」译文 ${e.yi.length} 行, 原文 ${p.p.length} 行`);
      for (const y of e.yi) assert.ok(y.trim() && !/[a-z]{3}/i.test(y), `「${t}」译文: ${y.slice(0, 20)}`);
      const marks = notesOf(p, e);
      assert.equal(marks.length, e.notes.length, `「${t}」有注释找不到: ${e.notes.filter((x, j) => !marks.some((m) => m.n === j + 1)).map((x) => x.at).join('、')}`);
      const reads = readingsOf(id, p);
      marks.forEach((m, j) => {
        const x = e.notes[j];
        assert.ok(x.note && x.note.length > 1, `「${t}」${x.at} 没写解释`);
        assert.ok(/[。！？」）]$/.test(x.note), `「${t}」${x.at} 的解释没有句末标点: ${x.note}`);
        const text = m.line < 0 ? p.t : p.p[m.line];
        assert.equal(text.slice(m.at, m.at + m.len), x.w ?? x.at);
        if (j) {
          const prev = marks[j - 1];
          assert.ok(m.line > prev.line || (m.line === prev.line && m.at >= prev.at + prev.len), `「${t}」${x.at} 跟上一条重叠或倒序`);
        }
        const tt = hant.pieces[i];
        assert.equal((m.line < 0 ? tt.t : tt.p[m.line]).length, text.length, `「${t}」第 ${m.line} 行繁简不一样长`);
        for (const r of reads.filter((r) => r.line === m.line)) {
          const inside = r.at >= m.at && r.at + r.len <= m.at + m.len;
          const outside = r.at + r.len <= m.at || r.at >= m.at + m.len;
          assert.ok(inside || outside, `「${t}」读音「${r.ch}」跨了注释「${x.at}」`);
        }
      });
      // 题目里的注释标在题目上 (不跑到正文去)
      assert.ok(marks.length >= 4, `「${t}」注释太少`);
    }
    // 课本清单里的每首都有
    for (const n of KEBEN[id]) assert.ok(entryOf(yizhu, book.pieces[n - 1]), `${id} 第 ${n} 首《${book.pieces[n - 1].t}》没有注释`);
  }
});

test('唐诗宋词千家诗的注释: 两本书都有的诗 (登鹳雀楼……) 千家诗用唐诗那边的; 题目不一样的换掉题目的注释', async () => {
  const ts = await loadYizhu('tangshi');
  const qj = await loadYizhu('qianjiashi');
  assert.equal(qj['静夜思'], ts['静夜思']);
  assert.equal(qj['黄鹤楼'], ts['登黄鹤楼']);
  // 渭城曲 / 送元二使安西: 正文注释、译文一样, 题目的注释不一样
  assert.deepEqual(qj['送元二使安西'].yi, ts['渭城曲'].yi);
  assert.deepEqual(qj['送元二使安西'].notes.slice(3), ts['渭城曲'].notes.slice(1));
  assert.equal(qj['送元二使安西'].notes[0].w, '元二');
  const qjBook = await loadBook('qianjiashi');
  const qinhuai = qjBook.pieces.find((p) => p.t === '秦淮夜泊');
  const marks = notesOf(qinhuai, entryOf(qj, qinhuai));
  assert.deepEqual(marks.slice(0, 2).map((m) => [m.line, m.w]), [[-1, '秦淮'], [-1, '夜泊']]);
});

test('唐诗宋词千家诗的注释: 做成「字词」卡片; 《千家诗》整本做只做有注释的', async () => {
  const book = bookOf('tangshi');
  const data = await loadBook('tangshi');
  const yizhu = await loadYizhu('tangshi');
  const dg = data.pieces.find((p) => p.t === '登鹳雀楼');
  const cards = makeCards(book, [dg], 'zhu', yizhu);
  assert.equal(cards.length, yizhu['登鹳雀楼'].notes.length);
  assert.ok(cards.some((c) => c.term.includes('穷') && c.def.includes('尽')));
  const all = makeCards(book, data.pieces, 'zhu', yizhu);
  assert.equal(all.length, Object.values(yizhu).reduce((n, e) => n + e.notes.length, 0));
});

test('千家诗: 资料写错的作者、朝代、字改过来 (对照维基文库)', async () => {
  const qj = await loadBook('qianjiashi');
  const hant = await loadBook('qianjiashi', { hant: true });
  const at = (first) => qj.pieces.find((p) => p.p[0].startsWith(first));
  // 「毕竟西湖」: 资料写成苏轼《西湖》, 千家诗题作《晓出净慈寺送林子方》, 杨万里的
  assert.deepEqual([at('毕竟西湖').t, at('毕竟西湖').a, at('毕竟西湖').e], ['晓出净慈寺送林子方', '杨万里', '宋']);
  // 「绿遍山原」: 千家诗原书写成范成大, 其实是翁卷 (题目照书里的)
  assert.deepEqual([at('绿遍山原').t, at('绿遍山原').a], ['村居即事', '翁卷']);
  assert.equal(at('天街小雨').e, '唐');
  assert.equal(at('子规啼彻').e, '宋');
  const hhl = qj.pieces.find((p) => p.t === '黄鹤楼');
  assert.ok(hhl.p[2].includes('鹦鹉洲'));
  assert.ok(hant.pieces[qj.pieces.indexOf(hhl)].p[2].includes('鸚鵡洲'));
});
