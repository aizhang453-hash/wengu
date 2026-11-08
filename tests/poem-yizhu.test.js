import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadBook, loadYizhu, entryOf, notesOf, readingsOf, makeCards, bookOf, orderOf, searchLibrary, idiomsOf, CY_KINDS, YIZHU_BOOKS } from '../js/reading.js';

// 课程标准「古诗文背诵推荐篇目」里小学、初中、高中的, 书库有的 (第几首, 从 1 数): 都要有注释和译文
// 《千家诗》v1.61 起全书都做, 做完的卷写在 DONE 里 (第几首到第几首, 从 1 数): 这几卷每首都要有
const DONE = { qianjiashi: [[1, 220]], tangshi: [[1, 80]] }; // 《唐诗三百首》v1.64 起一卷一卷做: 卷一 五言绝句 1–29, 卷二 七言绝句 30–80
const KEBEN = {
  tangshi: [71, 277, 2, 18, 34, 278, 30, 6, 282, 33, 11, 39, 40, 68, 61, 319, 313, 95, 20, 24, 81, 272, 91, 290, 202, 227, 117, 254, 57, 58, 46, 173, /* 高中 */ 89, 298, 257, 293, 314, 192, 193, 190, 109, 251, 179],
  qianjiashi: [6, 145, 29, 98, 166, 114, 27, 101, 104, 90, 156, 134, 85, 162, 154, 89, 139, 140, 155, 48, 192, 173, /* 高中 */ 64],
  songci: [185, 56, /* 高中 */ 33, 62, 222, 280, 83, 88, 91, 158],
};

test('唐诗宋词千家诗的注释: 每首都在书里、注释都找得到 (按顺序不重叠)、译文一行对一行; 读音不跨注释; 繁体标得上', async () => {
  assert.deepEqual(YIZHU_BOOKS, ['guwen', 'tangshi', 'songci', 'qianjiashi']);
  assert.equal(await loadYizhu('lunyu'), null);
  for (const id of ['tangshi', 'songci', 'qianjiashi']) {
    const book = await loadBook(id);
    const hant = await loadBook(id, { hant: true });
    const yizhu = await loadYizhu(id);
    for (const [t, e] of Object.entries(yizhu)) {
      // 键是「题目」或者「题目|作者」(书里有同名的要写作者)
      const [title, author] = t.split('|');
      const list = book.pieces.filter((p) => p.t === title && (!author || p.a === author || p.p[0].startsWith(author)));
      assert.equal(list.length, 1, `「${t}」在 ${id} 里不是正好一首`);
      const p = list[0];
      const i = book.pieces.indexOf(p);
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
      // 创作背景: 一段或几段话, 句末有标点
      for (const x of [e.bg ?? []].flat()) assert.ok(x.length > 10 && /[。！？」）]$/.test(x), `「${t}」的创作背景: ${x.slice(0, 20)}`);
    }
    // 课本清单里的每首、做完的卷里的每首都有
    const want = [...KEBEN[id], ...(DONE[id] ?? []).flatMap(([a, b]) => Array.from({ length: b - a + 1 }, (_, j) => a + j))];
    for (const n of want) assert.ok(entryOf(yizhu, book.pieces[n - 1]), `${id} 第 ${n} 首《${book.pieces[n - 1].t}》没有注释`);
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

test('千家诗的创作背景: 四卷大多有; 跟唐诗三百首共用的 (春晓 / 春眠) 两边一样', async () => {
  const qj = await loadYizhu('qianjiashi');
  const ts = await loadYizhu('tangshi');
  const book = await loadBook('qianjiashi');
  const bgs = book.pieces.slice(0, 39).filter((p) => entryOf(qj, p).bg);
  assert.ok(bgs.length >= 25, `五言绝句有创作背景的只有 ${bgs.length} 首`);
  const bgs2 = book.pieces.slice(39, 83).filter((p) => entryOf(qj, p).bg);
  assert.ok(bgs2.length >= 35, `五言律诗有创作背景的只有 ${bgs2.length} 首`);
  const bgs3 = book.pieces.slice(83, 175).filter((p) => entryOf(qj, p).bg);
  assert.ok(bgs3.length >= 70, `七言绝句有创作背景的只有 ${bgs3.length} 首`);
  const bgs4 = book.pieces.slice(175, 219).filter((p) => entryOf(qj, p).bg);
  assert.ok(bgs4.length >= 35, `七言律诗有创作背景的只有 ${bgs4.length} 首`);
  assert.ok(qj['新秋'].bg.includes('孙仅'));
  assert.equal(qj['乌衣巷'], ts['乌衣巷']);
  assert.ok(ts['寒食'].bg.includes('本事诗'));
  assert.equal(qj['临洞庭'].yi, ts['望洞庭湖赠张丞相'].yi);
  assert.equal(qj['破山寺后禅院'], ts['题破山寺后禅院']);
  assert.equal(qj['春眠'].bg, ts['春晓'].bg);
  assert.equal(qj['春眠'].notes[0].at, '春眠');
  assert.deepEqual(qj['春眠'].yi, ts['春晓'].yi);
  assert.equal(qj['伊州歌'].bg, ts['春怨|金昌绪'].bg);
  assert.equal(qj['秋夜寄丘员外'].notes[0].at, '丘员外');
  // 题目、作者有别的说法的写在注释或创作背景里
  assert.ok(qj['江行望匡庐'].bg.includes('钱珝'));
  assert.ok(ts['寻隐者不遇'].bg.includes('孙革'));
});

test('唐诗千家诗的成语和名句: 每条在原文里找得到 (两本书都有的两边都找得到)、不重复、有说明; 千家诗够多', async () => {
  const plain = (str) => str.replace(/[，。；、？！]/g, '');
  let qjCount = 0;
  for (const id of ['tangshi', 'songci', 'qianjiashi']) {
    const book = await loadBook(id);
    const yizhu = await loadYizhu(id);
    for (const p of book.pieces) {
      const e = entryOf(yizhu, p);
      if (!e?.cy) continue;
      const ws = new Set();
      for (const x of idiomsOf(p, e)) {
        const raw = e.cy[x.n - 1];
        const t = `${id}《${p.t}》${x.w}`;
        if (id === 'qianjiashi') qjCount++;
        assert.ok(x.w && !ws.has(x.w), `${t} 重复或空`);
        ws.add(x.w);
        assert.ok(CY_KINDS.includes(x.kind), `${t} 的 kind: ${x.kind}`);
        assert.ok(/[。！？」]$/.test(x.note), `${t} 的说明没有句末标点`);
        assert.ok(raw.at, `${t} 没写 at`);
        assert.notEqual(x.line, null, `${t}: 原文里找不到「${raw.at}」`);
        assert.equal(p.p[x.line].slice(x.at, x.at + x.len), raw.at);
        // 名句就是原文; 成语跟原文不一样的, 说明里写清楚从哪句来、原文怎么写
        if (x.kind === '名句' && plain(raw.at) !== plain(x.w)) assert.ok(x.note.includes('原文'), `${t} 名句跟原文不一样`);
        if (plain(raw.at) !== plain(x.w)) assert.ok(raw.at.includes(x.w) || x.note.includes(raw.at) || x.note.includes('原文'), `${t} 和原文「${raw.at}」不一样, 说明里要写清楚`);
      }
    }
  }
  assert.ok(qjCount >= 100, `千家诗只有 ${qjCount} 条成语和名句`);
  const qj = await loadYizhu('qianjiashi');
  const ts = await loadYizhu('tangshi');
  // 两本书题目不一样的共用一份 (黄鹤楼 / 登黄鹤楼), 成语名句也一起带过来
  assert.deepEqual(qj['黄鹤楼'].cy, ts['登黄鹤楼'].cy);
  assert.deepEqual(qj['送元二使安西'].cy, ts['渭城曲'].cy);
  assert.ok(qj['游小园不值'].cy.some((x) => x.w === '春色满园关不住，一枝红杏出墙来'));
  assert.ok(qj['曲江二首'].cy.some((x) => x.w === '人生七十古来稀'));
  // 搜成语找得到出处
  const hits = await searchLibrary('平分秋色');
  assert.ok(hits.some((x) => x.book === 'qianjiashi' && x.piece?.t === '中秋'), JSON.stringify(hits.slice(0, 3)));
});

test('唐诗三百首卷一 五言绝句: 大多有创作背景和名句; 资料改过的、作者有别的说法的写清楚', async () => {
  const ts = await loadYizhu('tangshi');
  const book = await loadBook('tangshi');
  const juan1 = book.pieces.slice(0, 29);
  assert.ok(juan1.every((p) => p.g === 0));
  assert.ok(juan1.filter((p) => entryOf(ts, p).bg).length >= 15);
  assert.ok(juan1.filter((p) => entryOf(ts, p).cy?.length).length >= 20);
  assert.equal(book.pieces[10].p[0], '床前明月光，疑是地上霜。'); // 资料第一联末尾是逗号
  assert.ok(ts['渡汉江'].bg.includes('李频'));
  assert.ok(ts['听弹琴'].notes[0].note.includes('幽琴'));
  assert.ok(ts['送上人'].cy.some((x) => x.w === '孤云野鹤'));
});

test('唐诗三百首卷二 七言绝句: 资料放错的两首换回原书选的; 改过的字; 同一作者两首同名的分得开', async () => {
  const ts = await loadYizhu('tangshi');
  const book = await loadBook('tangshi');
  const juan2 = book.pieces.slice(29, 80);
  assert.ok(juan2.every((p) => p.g === 1));
  assert.ok(juan2.filter((p) => entryOf(ts, p).bg).length >= 25);
  assert.ok(juan2.filter((p) => entryOf(ts, p).cy?.length).length >= 30);
  const at = (t, a) => book.pieces.find((p) => p.t === t && (!a || p.a === a));
  assert.equal(at('金陵图').p[0], '江雨霏霏江草齐，六朝如梦鸟空啼。'); // 资料原来是另一首「谁谓伤心画不成」
  assert.equal(at('宫词', '顾况').p[0], '玉楼天半起笙歌，风送宫嫔笑语和。'); // 原来是「长乐宫连上苑春」
  assert.equal(at('遣怀', '杜牧').p[0], '落魄江湖载酒行，楚腰纤细掌中轻。');
  assert.deepEqual(at('遣怀', '杜牧').n, ['江湖 一作：江南；纤细 一作：肠断']); // 版本注释跟着改
  assert.ok(at('题金陵渡').p[1].endsWith('是瓜洲。'));
  assert.ok(at('马嵬坡').p[0].includes('云雨难忘'));
  // 李商隐两首《隋宫》: 七绝的有注释, 七律的还没做 (卷四)
  const [s1, s2] = book.pieces.filter((p) => p.t === '隋宫');
  assert.equal(entryOf(ts, s1), ts['隋宫|乘兴南游']);
  assert.equal(entryOf(ts, s2), null);
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
  // 《宫词》: 资料把王建「金殿当头」和林洪「殿上衮衣」合成一篇、都写成林洪; 拆开, 林洪那首放在最后 (编号不动), 读的时候排在王建那首后面
  const gc = qj.pieces.map((p, i) => [i, p]).filter(([, p]) => p.t === '宫词');
  assert.deepEqual(gc.map(([i, p]) => [i, p.a, p.e, p.p[0], Boolean(p.k)]), [
    [93, '王建', '唐', '金殿当头紫阁重，仙人掌上玉芙蓉。', false],
    [219, '林洪', '宋', '殿上衮衣明日月，砚中旗影动龙蛇。', false],
  ]);
  assert.equal(hant.pieces[219].a, '林洪');
  assert.deepEqual(bookOf('qianjiashi').after, [[219, 93]]);
  const order = orderOf(bookOf('qianjiashi'));
  assert.equal(order.length, 220);
  assert.deepEqual(order.slice(92, 96), [92, 93, 219, 94]);
  assert.equal(order[219], 218);
  assert.deepEqual(orderOf(bookOf('tangshi')), [...Array(320).keys()]);
  // 搜「宫词」: 两首挨着, 王建的在前
  const hits = (await searchLibrary('宫词')).filter((x) => x.book === 'qianjiashi');
  assert.deepEqual(hits.map((x) => x.i), [93, 219]);
  // 「游人五陵去」: 资料写成王维、「避人」; 是孟浩然的 (《全唐诗》卷一六〇)。「双双鸣玉珂」资料写成口字旁的「呜」
  assert.deepEqual([at('游人五陵去').t, at('游人五陵去').a], ['送朱大入秦', '孟浩然']);
  assert.ok(!qj.pieces.some((p) => p.p.join('').includes('避人五陵')));
  assert.equal(at('大道直如发').p[1], '五陵贵公子，双双鸣玉珂。');
  assert.equal(hant.pieces[qj.pieces.indexOf(at('大道直如发'))].p[1], '五陵貴公子，雙雙鳴玉珂。');
  // 卷二 五言律诗 (v1.61, 对照维基文库、古诗文网): 题目、作者、错字
  assert.deepEqual(qj.pieces.slice(39, 83).filter((p, i) => [1, 16, 21, 28, 34, 43].includes(i)).map((p) => [p.t, p.a]), [
    ['和晋陵陆丞早春游望', '杜审言'],
    ['送杜少府之任蜀州', '王勃'],
    ['玉台观', '杜甫'],
    ['题松汀驿', '张祜'],
    ['秋登宣城谢朓北楼', '李白'],
    ['幽州夜饮', '张说'],
  ]);
  const text = qj.pieces.slice(39, 83).map((p) => p.p.join('')).join('');
  for (const w of ['云标金阙迥', '升沉应已定', '沣水映园林', '满壁画沧洲', '坐觉烟尘扫', '老去恨空闻', '行矣慎风波', '江声走白沙', '客有归欤叹', '古木丛青霭']) assert.ok(text.includes(w), w);
  assert.ok(hant.pieces.find((p) => p.t === '春日偶成').p.join('').includes('時人不識余心樂'));
  // 卷三 七言绝句: 作者、题目、错字
  const by = (n) => [qj.pieces[n - 1].t, qj.pieces[n - 1].a, qj.pieces[n - 1].e];
  assert.deepEqual([93, 95, 102, 106, 119, 121, 132, 137, 141, 146, 159, 160].map(by), [
    ['打球图', '晁说之', '宋'],
    ['咏华清宫', '杜常', '宋'],
    ['社日', '王驾', '唐'],
    ['绝句', '僧志南', '宋'],
    ['春晴', '王驾', '唐'],
    ['落花', '朱淑真', '宋'],
    ['有约', '赵师秀', '宋'],
    ['晚楼闲坐', '黄庭坚', '宋'],
    ['题榴花', '韩愈', '唐'],
    ['与史郎中饮听黄鹤楼上吹笛', '李白', '唐'],
    ['直玉堂作', '洪咨夔', '宋'],
    ['竹楼', '李嘉祐', '唐'],
  ]);
  const text3 = qj.pieces.slice(83, 175).map((p) => p.p.join('')).join('');
  for (const w of ['秋千院落夜沉沉', '与梅并作十分春', '丝丝天棘出莓墙']) assert.ok(text3.includes(w), w);
  // 卷四 七言律诗
  assert.deepEqual([181, 188].map(by), [
    ['上元应制', '王珪', '宋'],
    ['清明', '高翥', '宋'],
  ]);
  const text4 = qj.pieces.slice(175, 219).map((p) => p.p.join('')).join('');
  for (const w of ['花板润沾红杏雨', '落落疏帘邀月影', '云物凄凉拂曙流', '传语风光共流转']) assert.ok(text4.includes(w), w);
  const hhl = qj.pieces.find((p) => p.t === '黄鹤楼');
  assert.ok(hhl.p[2].includes('鹦鹉洲'));
  assert.ok(hant.pieces[qj.pieces.indexOf(hhl)].p[2].includes('鸚鵡洲'));
});
