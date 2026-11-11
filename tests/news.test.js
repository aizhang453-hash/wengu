import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHtml, decode, blocksFrom, parseRss, itemFrom, cctvItems, isVideo, isOpinion, voaArticle, guardianItem, merge, collect, wirePhoto, idOf, options, SOURCES, RFA_CREDIT, wikiText, otdText, otdOf, picOf, zhPicPage } from '../tools/news.mjs';
import { validIndex, loadIndex, loadArticle, newsBases, NEWS_BASES, guardianExpired, visibleItems, itemsFor, liveItems, longItems, brokenMinutes, ownsSite, ACTIONS_URL, byDay, dayLabel, agoText, itemHref, langHref, inlineText, spokenParts, seenIds, markSeen, SEEN_KEY, todayOf, localDay } from '../js/news.js';

options.gap = 0; // 测试不用等

// ---- 拿新闻的程序 (tools/news.mjs) ----

test('新闻: 网页拆成树 (实体、CDATA、空元素、样式不要)', () => {
  assert.equal(decode('a&amp;b&#95;c&#x41;&nbsp;&lt;'), 'a&b_cA <');
  const root = parseHtml('<p class="x">一<br>二<img src="a.png"/><style>p{}</style><b>三</b><![CDATA[四&五]]></p>');
  const p = root.children[0];
  assert.equal(p.attrs.class, 'x');
  assert.deepEqual(
    p.children.map((c) => (typeof c === 'string' ? c : c.tag)),
    ['一', 'br', '二', 'img', 'style', 'b', '四&五'],
  );
});

test('新闻: 网页 → 能安全显示的块 — 段落 (链接、粗体)、小标题、列表、引文、图; 视频和表格换成「到原网站看」; 字一个不改', () => {
  const html = `华盛顿 —<p>第一段<a href="https://x.org/a">链接</a>，<b>粗</b>和<em>斜</em>。<script>alert(1)</script></p>
    <h4>小标题</h4><ul><li>甲</li><li><a href="javascript:x">乙</a></li></ul><ol><li>一</li></ol>
    <blockquote><p>引文</p></blockquote>
    <figure><img src="//img.org/a.jpg" alt="说明"><figcaption>图：说明（美联社）</figcaption></figure>
    <figure><img data-src="https://img.org/b.jpg" alt="自己的图"></figure>
    <iframe src="https://video"></iframe><table><tr><td>表</td></tr></table>
    <aside>相关链接</aside><div><p>里面的段落<br>换行</p></div>`;
  assert.deepEqual(blocksFrom(html, { dropImage: wirePhoto }), [
    { p: ['华盛顿 — 第一段', { a: 'https://x.org/a', t: '链接' }, '，', { b: '粗' }, '和', { i: '斜' }, '。'] },
    { h: '小标题' },
    { li: [['甲'], ['乙']] },
    { li: [['一']], o: true },
    { q: ['引文'] },
    { img: { src: 'https://img.org/b.jpg', cap: '自己的图' } }, // 美联社的那张不要
    { more: true }, // 视频、表格连着的只写一次
    { p: ['里面的段落\n换行'] },
  ]);
  // 不挑图的时候 (卫报): 通讯社的图也照放
  assert.equal(blocksFrom('<figure><img src="https://i.guim.co.uk/a.jpg"><figcaption>Photograph: AFP</figcaption></figure>')[0].img.cap, 'Photograph: AFP');
  assert.equal(wirePhoto('图取自AFP'), true);
  assert.equal(wirePhoto('（美联社照片）'), true);
  assert.equal(wirePhoto('Photograph: Reuters'), true);
  assert.equal(wirePhoto('资料照片：民众在台北参与急救训练'), false);
  assert.equal(wirePhoto('APPLE 新品发布'), false); // 「AP」得是一个单独的词
});

const rss = (items) => `<?xml version="1.0"?><rss xmlns:media="http://search.yahoo.com/mrss/" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/"><channel><title>X</title>${items}</channel></rss>`;

test('新闻: RSS — CDATA、各种时间写法、图 (media:content、enclosure、media:thumbnail)、作者', () => {
  const xml = rss(`
    <item><title><![CDATA[黄乐做的是什么生意？]]></title><link>https://www.rfa.org/mandarin/a/1/</link><pubDate>Tue, 10 Nov 2026 16:16:26 +0000</pubDate>
      <description><![CDATA[<p>美国人工智能芯片龙头……</p>]]></description><content:encoded><![CDATA[<p>全文<b>重点</b></p>]]></content:encoded>
      <media:content url="https://www.rfa.org/resizer/a.jpg?x=1&amp;y=2" type="image/jpeg"><media:credit role="author">图取自AFP</media:credit><media:description><![CDATA[黄乐出席晚宴]]></media:description></media:content><dc:creator>记者：Alan Lu</dc:creator></item>
    <item><title>纳吉布开始居家服刑</title><link>https://www.chinanews.com.cn/gj/2026/11-11/1.shtml</link><pubDate>Wed, 11 Nov 2026 00:01:07 +0800</pubDate><description>中新社吉隆坡11月10日电……</description></item>
    <item><title>台湾立委访美</title><link>https://www.voachinese.com/a/x/1.html</link><pubDate>Wed, 11 Nov 2026 03:33:06 +0800</pubDate><author>chinese@voanews.com (锺辰芳)</author><enclosure url="https://gdb.voanews.com/a_w800_h450.jpg" type="image/jpeg"/></item>
    <item><title>US soldier arrested</title><link>https://www.bbc.co.uk/news/articles/c1?at_medium=RSS</link><pubDate>Tue, 10 Nov 2026 20:20:04 GMT</pubDate><media:thumbnail width="240" url="https://ichef.bbci.co.uk/240/a.png"/></item>
    <item><title>没有日子的</title><link>https://x</link></item>`);
  const r = parseRss(xml);
  assert.equal(r.length, 5);
  assert.deepEqual(
    r.map((x) => x.at),
    ['2026-11-10T16:16:26.000Z', '2026-11-10T16:01:07.000Z', '2026-11-10T19:33:06.000Z', '2026-11-10T20:20:04.000Z', null],
  );
  assert.equal(r[0].title, '黄乐做的是什么生意？');
  assert.equal(r[0].content, '<p>全文<b>重点</b></p>');
  assert.deepEqual(r[0].image, { src: 'https://www.rfa.org/resizer/a.jpg?x=1&y=2', cap: '黄乐出席晚宴', credit: '图取自AFP' });
  assert.equal(r[0].author, '记者：Alan Lu');
  assert.equal(r[2].author, '锺辰芳');
  assert.equal(r[2].image.src, 'https://gdb.voanews.com/a_w800_h450.jpg');
  assert.equal(r[3].image.src, 'https://ichef.bbci.co.uk/240/a.png');

  // 变成列表里的一条: 能放全文的来源, 通讯社的图不要; 快讯 (只有标题的, 像 BBC) 只要标题、链接、时间; 没有日子的不要
  const rfa = itemFrom('rfa', r[0]);
  assert.equal(rfa.img, undefined);
  assert.equal(rfa.s, '美国人工智能芯片龙头……');
  assert.equal(rfa.lang, 'zh');
  assert.equal(rfa.id, idOf('rfa', 'https://www.rfa.org/mandarin/a/1/'));
  assert.equal(itemFrom('voa', r[2]).img.src, 'https://gdb.voanews.com/a_w800_h450.jpg');
  assert.deepEqual(itemFrom('npr', r[3]), { id: idOf('npr', 'https://www.bbc.co.uk/news/articles/c1'), src: 'npr', lang: 'en', t: 'US soldier arrested', u: 'https://www.bbc.co.uk/news/articles/c1?at_medium=RSS', at: '2026-11-10T20:20:04.000Z' });
  assert.equal(itemFrom('npr', r[3]).id, idOf('npr', 'https://www.bbc.co.uk/news/articles/c1')); // 网址后面的 ?at_medium 不算
  // 视频页不要 (快讯只要能读的文章)
  assert.equal(itemFrom('cbs', { ...r[3], link: 'https://www.cbsnews.com/video/abc/' }), null);
  assert.equal(itemFrom('abc', { ...r[3], title: 'WATCH: Rescue in Oregon' }), null);
  assert.equal(isVideo('https://www.aljazeera.com/video/newsfeed/2026/11/11/x'), true);
  assert.equal(isVideo('https://www.aljazeera.com/news/2026/11/11/x?ref=video/'), false);
  assert.equal(itemFrom('cns', r[4]), null);
});

test('新闻: 繁体的那几家标题转简体, BBC 中文的链接换成简体版; 央视的新闻列表 (news_1.jsonp)', () => {
  const r = { title: '美國眾議院', link: 'https://www.bbc.com/zhongwen/articles/c1/trad?at_medium=RSS', at: '2026-11-11T00:00:00.000Z', desc: '摘要' };
  const hans = { tw: (s) => `简:${s}`, hk: (s) => `港:${s}` };
  const bbc = itemFrom('bbczh', r, hans);
  assert.equal(bbc.t, '简:美國眾議院');
  assert.equal(bbc.u, 'https://www.bbc.com/zhongwen/articles/c1/simp?at_medium=RSS');
  assert.equal(itemFrom('rthk', { ...r, link: 'https://news.rthk.hk/1.htm' }, hans).t, '港:美國眾議院');
  assert.equal(itemFrom('cna', r).t, '美國眾議院'); // 没有转换的工具: 照繁体放
  assert.equal(itemFrom('cns', r, hans).t, '美國眾議院'); // 本来就是简体的那几家不转
  const list = cctvItems('news({"data":{"total":2,"list":[{"title":"中东部快速升温","url":"https://news.cctv.com/2026/11/11/ARTI1.shtml","focus_date":"2026-11-11 08:53:31","brief":"……"},{"title":"","url":"https://news.cctv.com/2"},{"title":"没有时间","url":"https://news.cctv.com/3","focus_date":""}]}})');
  assert.deepEqual(list, [{ id: idOf('cctv', 'https://news.cctv.com/2026/11/11/ARTI1.shtml'), src: 'cctv', lang: 'zh', t: '中东部快速升温', u: 'https://news.cctv.com/2026/11/11/ARTI1.shtml', at: '2026-11-11T00:53:31.000Z' }]);
});

test('新闻: VOA 的文章页 — 正文在 wsw 里, 开头的地点并进第一段, 主图的说明写着通讯社的不要', () => {
  const page = (cap) => `<html><body><div class="cover-media"><figure><img src="https://gdb.voanews.com/50b2_w250_r1_s.jpg" alt="${cap}"><figcaption><span class="caption">${cap}</span></figcaption></figure></div>
    <ul><li class="links__item"><a class="links__item-link" href="/author/x">锺辰芳</a></li></ul>
    <div class="wsw"><span class="dateline">华盛顿 —&nbsp;</span><p>第一段。</p><p>第二段<a href="https://www.voachinese.com/a/2.html">相关</a>。</p></div><div class="footer-toolbar">分享</div></body></html>`;
  const a = voaArticle(page('资料照片：民众参与急救训练'));
  assert.deepEqual(a.body, [{ p: ['华盛顿 — 第一段。'] }, { p: ['第二段', { a: 'https://www.voachinese.com/a/2.html', t: '相关' }, '。'] }]);
  assert.deepEqual(a.img, { src: 'https://gdb.voanews.com/50b2_w800_r1.jpg', cap: '资料照片：民众参与急救训练' });
  assert.equal(a.by, '锺辰芳');
  assert.equal(voaArticle(page('2026年11月10日，示威者在街头（美联社照片）')).img, null);
  assert.equal(voaArticle('<html><p>没有正文</p></html>'), null);
});

const guardianResult = ({ fields = {}, ...over } = {}) => ({
  id: 'world/2026/nov/10/x',
  type: 'article',
  sectionName: 'World news',
  webTitle: 'Headline',
  webUrl: 'https://www.theguardian.com/world/2026/nov/10/x',
  webPublicationDate: '2026-11-10T20:28:47Z',
  fields: { headline: 'Headline', standfirst: '<p>Standfirst <a href="https://www.theguardian.com/y">link</a></p>', trailText: 'Trail <strong>text</strong>', byline: 'Lucy Campbell', body: '<p>Para one.</p><p>Para two.</p>', main: '<figure><img src="https://i.guim.co.uk/main.jpg" alt="m"><figcaption>Caption. Photograph: AFP</figcaption></figure>', thumbnail: 'https://media.guim.co.uk/t/500.jpg', firstPublicationDate: '2026-11-10T20:20:00Z', legallySensitive: 'false', ...fields },
  ...over,
});

test('新闻: 卫报 API 的一篇 — 直播不要, 法律敏感的照放但记上 legal; 栏目用卫报自己的; 记着什么时候拿的 (24 小时后撤下)', () => {
  const got = '2026-11-10T21:00:00.000Z';
  const { item, article } = guardianItem(guardianResult(), got);
  assert.deepEqual(item, { id: idOf('guardian', 'https://www.theguardian.com/world/2026/nov/10/x'), src: 'guardian', lang: 'en', t: 'Headline', s: 'Trail text', u: 'https://www.theguardian.com/world/2026/nov/10/x', at: '2026-11-10T20:20:00.000Z', sec: 'World news', img: { src: 'https://media.guim.co.uk/t/500.jpg' }, by: 'Lucy Campbell', full: true, got });
  assert.deepEqual(article.lede, ['Standfirst ', { a: 'https://www.theguardian.com/y', t: 'link' }]);
  assert.deepEqual(article.img, { src: 'https://i.guim.co.uk/main.jpg', cap: 'Caption. Photograph: AFP' });
  assert.deepEqual(article.body, [{ p: ['Para one.'] }, { p: ['Para two.'] }]);
  assert.equal(article.got, got);
  assert.equal(guardianItem(guardianResult({ type: 'liveblog' }), got), null);
  assert.equal(item.legal, undefined);
  const legal = guardianItem(guardianResult({ fields: { legallySensitive: 'true' } }), got);
  assert.equal(legal.item.legal, true);
  assert.equal(legal.article.legal, true);
  assert.deepEqual(legal.article.body, [{ p: ['Para one.'] }, { p: ['Para two.'] }]);
});

test('新闻: 跟上次的合起来 — 这次的为准; 只有标题的留 24 小时、能读全文的留一个星期; 卫报拿来超过 24 小时的不要', () => {
  const now = Date.parse('2026-11-11T12:00:00Z');
  const h = (n) => new Date(now - n * 3600000).toISOString();
  const prev = [
    { id: 'cns-old', src: 'cns', at: h(30), t: '太旧' },
    { id: 'cns-a', src: 'cns', at: h(20), t: '上次的' },
    { id: 'rfa-a', src: 'rfa', at: h(100), t: '四天前的全文' },
    { id: 'rfa-old', src: 'rfa', at: h(200), t: '八天前' },
    { id: 'guardian-a', src: 'guardian', at: h(2), got: h(25), t: '过期' },
    { id: 'guardian-b', src: 'guardian', at: h(2), got: h(1), t: '还新' },
    { id: 'cns-b', src: 'cns', at: h(1), t: '旧标题' },
  ];
  const fresh = [
    { id: 'cns-b', src: 'cns', at: h(1), t: '新标题' },
    { id: 'npr-future', src: 'npr', at: new Date(now + 3 * 3600000).toISOString(), t: '时间写错了' },
    { id: 'bbc-a', src: 'bbc', at: h(1), t: '不要了的来源' },
    { id: 'cbs-v', src: 'cbs', at: h(1), t: '视频', u: 'https://www.cbsnews.com/video/x/' },
  ];
  assert.deepEqual(
    merge({ prev, fresh, now }).map((x) => `${x.id}:${x.t}`),
    ['cns-b:新标题', 'guardian-b:还新', 'cns-a:上次的', 'rfa-a:四天前的全文'],
  );
});

// 假的网站: 照网址回 RSS、文章页、卫报的 API
function fakeWeb(now, { failRfa = false } = {}) {
  const at = (h) => new Date(now - h * 3600000).toUTCString();
  const calls = [];
  const pages = {
    'https://www.voachinese.com/api/zm_yql-vomx-tpeybti': rss(`<item><title>VOA 一</title><link>https://www.voachinese.com/a/1.html</link><pubDate>${at(1)}</pubDate><description>摘要</description><enclosure url="https://gdb.voanews.com/1_w800_h450.jpg" type="image/jpeg"/></item>`),
    'https://www.voachinese.com/a/1.html': '<div class="wsw"><p>VOA 全文。</p></div>',
    'https://www.rfa.org/mandarin/rss': rss(`<item><title>RFA 一</title><link>https://www.rfa.org/mandarin/1/</link><pubDate>${at(2)}</pubDate><content:encoded><![CDATA[<p>RFA 全文</p>]]></content:encoded></item>`),
    'https://www.chinanews.com.cn/rss/importnews.xml': rss(`<item><title>中新 一</title><link>https://www.chinanews.com.cn/1.shtml</link><pubDate>${at(0.5)}</pubDate></item>`),
    'https://www.nasa.gov/news-release/feed/': rss(`<item><title>NASA one</title><link>https://www.nasa.gov/1/</link><pubDate>${at(3)}</pubDate><content:encoded><![CDATA[<figure><img src="https://www.nasa.gov/p.jpg"></figure><p>NASA text</p>]]></content:encoded></item>`),
    'https://feeds.npr.org/1001/rss.xml': rss(`<item><title>NPR one</title><link>https://www.npr.org/1</link><pubDate>${at(0.2)}</pubDate></item>`),
  };
  const fetch = async (url, init) => {
    calls.push(url);
    if (url.startsWith('https://content.guardianapis.com/search')) {
      assert.equal(init.headers['api-key'], 'k'); // 密钥放在请求头里
      assert.match(url, /page-size=15&/); // 卫报一次只拿最新的 15 篇 (v1.81)
      return new Response(JSON.stringify({ response: { status: 'ok', results: [guardianResult({ fields: { firstPublicationDate: new Date(now - 3600000).toISOString() } })] } }));
    }
    if (failRfa && url.includes('rfa.org')) return new Response('', { status: 404 });
    return pages[url] !== undefined ? new Response(pages[url]) : new Response('', { status: 404 });
  };
  return { fetch, calls };
}

test('新闻: 拿一次 — 全文的放进 articles; 卫报一小时内不再拿; 一家拿不到时用上次的', async () => {
  const realFetch = globalThis.fetch;
  const log = () => {};
  try {
    const now = Date.parse('2026-11-11T12:00:00Z');
    let web = fakeWeb(now);
    globalThis.fetch = web.fetch;
    const first = await collect({ now, guardianKey: 'k', log });
    const srcs = first.index.items.map((x) => x.src);
    assert.deepEqual(srcs, ['npr', 'cns', 'voa', 'guardian', 'rfa', 'nasa']); // 新的在前
    assert.equal(first.index.v, 2);
    assert.equal(first.index.guardianAt, new Date(now).toISOString());
    assert.deepEqual(Object.keys(first.index.sources), Object.keys(SOURCES));
    assert.equal(first.index.sources.rfa.note, RFA_CREDIT);
    const full = first.index.items.filter((x) => x.full).map((x) => x.src);
    assert.deepEqual(full.sort(), ['guardian', 'nasa', 'rfa', 'voa']);
    const voa = first.index.items.find((x) => x.src === 'voa');
    assert.deepEqual(first.articles[voa.id].body, [{ p: ['VOA 全文。'] }]);
    const nasa = first.index.items.find((x) => x.src === 'nasa');
    assert.equal(nasa.img.src, 'https://www.nasa.gov/p.jpg'); // RSS 没给图: 用正文里的第一张
    assert.ok(web.calls.some((u) => u.includes('guardianapis')));

    // 半小时后再拿: 卫报照用上次的 (不请求), VOA 的文章页拿过了也不再拿; RFA 拿不到 → 上次的留着
    const later = now + 30 * 60000;
    web = fakeWeb(later, { failRfa: true });
    globalThis.fetch = web.fetch;
    const second = await collect({ prev: first.index, prevArticles: first.articles, now: later, guardianKey: 'k', log });
    assert.ok(!web.calls.some((u) => u.includes('guardianapis')));
    assert.ok(!web.calls.includes('https://www.voachinese.com/a/1.html'));
    assert.ok(second.index.items.some((x) => x.src === 'rfa' && x.full));
    assert.ok(second.articles[second.index.items.find((x) => x.src === 'guardian').id]);

    // 没有密钥: 不放卫报
    globalThis.fetch = fakeWeb(now).fetch;
    const noKey = await collect({ now, guardianKey: '', log });
    assert.ok(!noKey.index.items.some((x) => x.src === 'guardian'));
    assert.equal(noKey.index.guardianAt, null);
  } finally {
    globalThis.fetch = realFetch;
  }
});

// ---- 温故这边 (js/news.js) ----

const NOW = Date.parse('2026-11-11T12:00:00Z');
const ago = (h) => new Date(NOW - h * 3600000).toISOString();
const DATA = {
  v: 2,
  at: ago(0.1),
  guardianAt: ago(0.5),
  sources: { voa: { name: '美国之音', lang: 'zh', full: true }, cns: { name: '中新网', lang: 'zh', full: false }, guardian: { name: 'The Guardian', lang: 'en', full: true }, bbc: { name: 'BBC News', lang: 'en', full: false }, npr: { name: 'NPR', lang: 'en', full: false } },
  items: [
    { id: 'cns-1', src: 'cns', lang: 'zh', t: '中新一', u: 'https://cns/1', at: ago(0.5) },
    { id: 'voa-1', src: 'voa', lang: 'zh', t: 'VOA 一', u: 'https://voa/1', at: ago(1), full: true, img: { src: 'https://img/1' } },
    { id: 'guardian-old', src: 'guardian', lang: 'en', t: 'Old', u: 'https://g/old', at: ago(2), full: true, got: ago(25) },
    { id: 'guardian-1', src: 'guardian', lang: 'en', t: 'Guardian one', u: 'https://g/1', at: ago(3), full: true, got: ago(0.5), img: { src: 'https://img/g' } },
    { id: 'bbc-1', src: 'bbc', lang: 'en', t: 'BBC one', u: 'https://bbc/1', at: ago(5) },
    { id: 'voa-2', src: 'voa', lang: 'zh', t: 'VOA 二', u: 'https://voa/2', at: ago(30), full: true, img: { src: 'https://img/2' } },
    { id: 'voa-3', src: 'voa', lang: 'zh', t: 'VOA 三', u: 'https://voa/3', at: ago(50), full: true },
  ],
};

test('新闻页: 卫报过了 24 小时不显示; 按语言、按来源; 快讯是 24 小时内只有标题的, 报道是能读全文的', () => {
  assert.equal(validIndex(DATA), true);
  assert.equal(validIndex({ ...DATA, v: 1 }), false);
  assert.equal(validIndex({ ...DATA, items: [] }), false);
  assert.equal(guardianExpired(DATA.items[2], NOW), true);
  assert.equal(guardianExpired(DATA.items[3], NOW), false);
  assert.equal(guardianExpired({ src: 'guardian' }, NOW), true); // 不知道什么时候拿的: 也当过期
  assert.equal(guardianExpired(DATA.items[0], NOW), false);
  assert.deepEqual(
    visibleItems(DATA, NOW).map((x) => x.id),
    ['cns-1', 'voa-1', 'guardian-1', 'bbc-1', 'voa-2', 'voa-3'],
  );
  assert.deepEqual(
    itemsFor(DATA, 'en', { now: NOW }).map((x) => x.id),
    ['guardian-1', 'bbc-1'],
  );
  assert.deepEqual(
    itemsFor(DATA, 'zh', { src: 'voa', now: NOW }).map((x) => x.id),
    ['voa-1', 'voa-2', 'voa-3'],
  );
  assert.deepEqual(
    liveItems(DATA, 'zh', NOW).map((x) => x.id),
    ['cns-1'],
  );
  assert.deepEqual(
    liveItems(DATA, 'en', NOW).map((x) => x.id),
    ['bbc-1'],
  );
  assert.deepEqual(
    longItems(DATA, 'zh', NOW).map((x) => x.id),
    ['voa-1', 'voa-2', 'voa-3'],
  ); // 报道不只 24 小时
  assert.deepEqual(
    longItems(DATA, 'en', NOW).map((x) => x.id),
    ['guardian-1'],
  );
});

test('新闻页: 点了去哪、日子、几小时前、朗读的内容', () => {
  assert.equal(itemHref(DATA.items[1]), '#/news/a/voa-1');
  assert.equal(itemHref(DATA.items[0]), 'https://cns/1'); // 只有标题的: 原网站
  assert.equal(langHref('en'), '#/news/en');
  assert.equal(langHref('zh'), '#/news');
  assert.deepEqual(
    byDay([{ at: '2026-11-11T09:00:00' }, { at: '2026-11-11T08:00:00' }, { at: '2026-11-10T23:00:00' }]).map((d) => [d.day, d.items.length]),
    [
      ['2026-11-11', 2],
      ['2026-11-10', 1],
    ],
  );
  assert.equal(dayLabel('2026-11-11', '2026-11-11'), '今天');
  assert.equal(dayLabel('2026-11-10', '2026-11-11'), '昨天');
  assert.equal(dayLabel('2026-11-08', '2026-11-11'), '11月8日 星期日');
  assert.equal(dayLabel('2025-12-31', '2026-01-02'), '2025年12月31日 星期三');
  assert.equal(agoText(ago(0.01), NOW), '刚刚');
  assert.equal(agoText(ago(0.5), NOW), '30 分钟前');
  assert.equal(agoText(ago(3), NOW), '3 小时前');
  assert.equal(agoText(ago(49), NOW), '2 天前');
  assert.equal(inlineText(['甲', { a: 'https://x', t: '乙' }, { b: '丙' }, { i: '丁' }]), '甲乙丙丁');
  assert.deepEqual(spokenParts({ t: '标题', lede: ['导语'], body: [{ p: ['一段'] }, { img: { src: 'x' } }, { h: '小标题' }, { li: [['甲'], ['乙']] }, { q: ['引文'] }, { more: true }] }), [
    { k: 'title', text: '标题' },
    { k: 'lede', text: '导语' },
    { k: 0, text: '一段' },
    { k: 2, text: '小标题' },
    { k: 3, text: '甲；乙' },
    { k: 4, text: '引文' },
  ]);
});

test('新闻页: 从哪拿 — 先 GitHub 再 jsDelivr (自己电脑上先用本地的); 拿不到、格式不对的换下一个', async () => {
  assert.deepEqual(NEWS_BASES, ['https://raw.githubusercontent.com/aizhang453-hash/wengu/news/', 'https://cdn.jsdelivr.net/gh/aizhang453-hash/wengu@news/']);
  assert.deepEqual(newsBases({ hostname: 'aizhang453-hash.github.io', href: 'https://aizhang453-hash.github.io/wengu/' }), NEWS_BASES);
  assert.deepEqual(newsBases({ hostname: 'localhost', href: 'http://localhost:8000/#/news' }), ['http://localhost:8000/news/', ...NEWS_BASES]);
  // 这里没有 IndexedDB: 存不了、也没有存着的, 不要紧
  const tried = [];
  const got = await loadIndex({
    bases: ['b1/', 'b2/', 'b3/'],
    now: 1000,
    fetchOne: async (u) => {
      tried.push(u);
      if (u === 'b1/latest.json') throw new Error('断网');
      if (u === 'b2/latest.json') return { v: 2, sources: {}, items: [] };
      return DATA;
    },
  });
  assert.deepEqual(tried, ['b1/latest.json', 'b2/latest.json', 'b3/latest.json']);
  assert.equal(got.data, DATA);
  assert.equal(got.stale, false);
  const none = await loadIndex({
    bases: ['b1/'],
    fetchOne: async () => {
      throw new Error('断网');
    },
  });
  assert.equal(none.data, null);
  assert.equal(none.error.message, '断网');
  // 全文: 卫报过了 24 小时的不给
  const art = { id: 'g', src: 'guardian', t: 'x', body: [{ p: ['y'] }], got: ago(1) };
  assert.equal(await loadArticle('g', { bases: ['b/'], now: NOW, fetchOne: async () => art }), art);
  assert.equal(await loadArticle('g', { bases: ['b/'], now: NOW, fetchOne: async () => ({ ...art, got: ago(30) }) }), null);
  assert.deepEqual(await loadArticle('v', { bases: ['b/'], now: NOW, fetchOne: async (u) => (u === 'b/a/v.json' ? { id: 'v', src: 'voa', t: 'x', body: [] } : null) }), { id: 'v', src: 'voa', t: 'x', body: [] });
});

test('邸报: 新闻一个小时没变就算自动更新断了; 只提醒网站主人 (同步设置里的 GitHub 账号)', () => {
  const now = Date.parse('2026-11-11T12:00:00Z');
  assert.equal(brokenMinutes({ at: '2026-11-11T11:30:00Z' }, now), 0);
  assert.equal(brokenMinutes({ at: '2026-11-11T11:00:00Z' }, now), 0); // 正好一个小时还不算
  assert.equal(brokenMinutes({ at: '2026-11-11T10:45:00Z' }, now), 75);
  assert.equal(brokenMinutes({}, now), 0);
  assert.equal(brokenMinutes(null, now), 0);
  assert.equal(ownsSite({ owner: 'aizhang453-hash', repo: 'wengu-data', token: 't' }), true);
  assert.equal(ownsSite({ owner: 'AiZhang453-Hash', repo: 'x', token: 't' }), true);
  assert.equal(ownsSite({ owner: 'someone-else', repo: 'x', token: 't' }), false);
  assert.equal(ownsSite(null), false);
  assert.equal(ACTIONS_URL, 'https://github.com/aizhang453-hash/wengu/actions/workflows/news.yml');
});

test('新闻: WordPress 的图 (div.wp-caption) 跟说明一起算一张图; 不放图的来源连说明也不要 (v1.81, Global Voices)', () => {
  const html = '<p>Before.</p><div class="wp-caption"><img src="https://gv/x.jpg" alt="x"><p class="wp-caption-text">Screenshot from DW.</p></div><p>After.</p>';
  assert.deepEqual(blocksFrom(html), [{ p: ['Before.'] }, { img: { src: 'https://gv/x.jpg', cap: 'Screenshot from DW.' } }, { p: ['After.'] }]);
  assert.deepEqual(blocksFrom(html, { dropImage: () => true }), [{ p: ['Before.'] }, { p: ['After.'] }]);
  assert.equal(SOURCES.gv.noImages, true);
  assert.equal(SOURCES.gv.tag, '志愿者撰稿');
  assert.equal(itemFrom('gv', { title: 't', link: 'https://globalvoices.org/1', at: '2026-11-11T00:00:00.000Z', desc: 'd', image: { src: 'https://gv/x.jpg' } }).img, undefined);
});

test('新闻: 评论文章标出来 (v1.81) — 评论版的网址、标题开头写着「评论：」、分类叫 Opinion 的; 卫报看它自己分的', () => {
  assert.ok(isOpinion('https://www.aljazeera.com/opinions/2026/11/11/x'));
  assert.ok(isOpinion('https://www.theguardian.com/commentisfree/2026/nov/11/x'));
  assert.ok(isOpinion('https://www.rfa.org/mandarin/pinglun/2026/11/11/x/'));
  assert.ok(isOpinion('https://x/1', '观点：美国该怎么办'));
  assert.ok(isOpinion('https://x/1', '【评论】一件事'));
  assert.ok(isOpinion('https://x/1', 'Opinion: why it matters'));
  assert.ok(isOpinion('https://x/1', '标题', ['新闻', '评论']));
  assert.ok(!isOpinion('https://x/1', '标题', ['评论分析'])); // 德国之声的「评论分析」里也有分析, 不算
  assert.ok(!isOpinion('https://www.dw.com/zh/观点不同的两派/a-1', '两派的观点：不一样'));
  assert.ok(!isOpinion('https://www.npr.org/2026/11/11/1/opinion-poll-shows', 'Poll'));
  const [r] = parseRss(rss('<item><title>观点：一件事</title><link>https://www.dw.com/zh/a-1</link><pubDate>Wed, 11 Nov 2026 01:00:00 GMT</pubDate><category>评论</category></item>'));
  assert.deepEqual(r.cats, ['评论']);
  assert.equal(itemFrom('dwzh', r).op, true);
  assert.equal(itemFrom('dwzh', { ...r, title: '一件事', cats: [] }).op, undefined);
  const g = guardianItem(guardianResult({ pillarId: 'pillar/opinion', sectionId: 'commentisfree' }), new Date().toISOString());
  assert.equal(g.item.op, true);
  assert.equal(g.article.op, true);
  assert.equal(guardianItem(guardianResult(), new Date().toISOString()).item.op, undefined);
});

test('今日一图、历史上的今天 (v1.81): 维基的写法 → 字; 「（图）」、样式表去掉; 一天二十条的挑六条, 各个年代都有', () => {
  assert.equal(wikiText("[[君士坦丁八世]]安排讓'''[[羅曼努斯三世]]'''<small>（圖）</small>結婚"), '君士坦丁八世安排讓羅曼努斯三世結婚');
  assert.equal(wikiText('發起[[瓜達康納爾島戰役|反攻行動]]的'), '發起反攻行動的');
  assert.equal(wikiText("'''[[瓜達康納爾海戰|-{zh-tw:瓜達康納爾海戰; zh-hk:瓜達爾卡納爾島海戰; zh-cn:瓜达尔卡纳尔岛海战;}-]]'''"), '瓜达尔卡纳尔岛海战');
  assert.equal(wikiText('[[羅德西亞|-{zh-hans:罗得西亚;zh-hant:羅德西亞;}-]]總理'), '罗得西亚總理');
  assert.equal(wikiText('函數 {{math|1=y}}圖形<ref>注</ref>'), '函數 圖形');
  assert.equal(otdText('积分来求取函数 .mw-parser-output .texhtml{font-family:serif}.mw-parser-output .mvar{font-style:italic}@media(min-width:420px){.mw-parser-output span.texhtml{white-space:nowrap}}y = f(x)图形'), '积分来求取函数 y = f(x)图形');
  assert.equal(otdText('Philae (pictured) touched down near the comet (logo depicted).'), 'Philae touched down near the comet.');
  const many = Array.from({ length: 21 }, (_, i) => ({ year: 2020 - i * 30, text: `第 ${i} 件` }));
  const six = otdOf(many);
  assert.equal(six.length, 6);
  assert.equal(six[0].y, 2020 - 20 * 30); // 最早的
  assert.equal(six.at(-1).y, 2020); // 最近的
  assert.ok(six.every((x, i) => i === 0 || x.y > six[i - 1].y));
  assert.deepEqual(
    otdOf([{ year: -44, text: '凯撒遇刺（图）' }, { year: 1912, text: '民國' }, { text: '没有年份' }], (t) => t.replace('國', '国')),
    [
      { y: -44, t: '凯撒遇刺' },
      { y: 1912, t: '民国' },
    ],
  );
  assert.deepEqual(otdOf(null), []);
  const im = {
    title: 'File:Kościelec view 2.jpg',
    thumbnail: { source: 'https://thumb.wikimedia.org/x/960px-a.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo', width: 640, height: 427 },
    file_page: 'https://commons.wikimedia.org/wiki/File:K.jpg',
    artist: { text: 'kallerna' },
    license: { type: 'CC BY-SA 4.0', url: 'https://creativecommons.org/licenses/by-sa/4.0' },
    description: { text: 'Panoramic view.' },
  };
  assert.deepEqual(picOf(im, '全景'), { file: 'Kościelec view 2.jpg', src: 'https://thumb.wikimedia.org/x/960px-a.jpg', w: 640, h: 427, page: 'https://commons.wikimedia.org/wiki/File:K.jpg', by: 'kallerna', lic: 'CC BY-SA 4.0', licUrl: 'https://creativecommons.org/licenses/by-sa/4.0', en: 'Panoramic view.', zh: '全景' });
  assert.equal(picOf({ ...im, license: {} }), null); // 不知道许可的不放
  assert.deepEqual(zhPicPage('{{Featurepic/format\n| type = packed-hover\n| Image = Kościelec_view_2.jpg\n| Content = 從[[塔特拉山國家公園 (斯洛伐克)|塔特拉山國家公園]]眺望。\n}}'), { image: 'Kościelec view 2.jpg', text: '從塔特拉山國家公園眺望。' });
});

test('今日一图、历史上的今天: 拿 UTC 的昨天、今天、明天三天; 6 小时内不再拿; 中文说明要是同一张图才用', async () => {
  const realFetch = globalThis.fetch;
  const log = () => {};
  const now = Date.parse('2026-11-11T12:00:00Z');
  const asked = [];
  const wiki = (url, init) => {
    let m = /en\.wikipedia\.org\/api\/rest_v1\/feed\/featured\/(\d+)\/(\d+)\/(\d+)$/.exec(url);
    if (m) {
      asked.push(url);
      const day = `${m[1]}-${m[2]}-${m[3]}`;
      return { image: { title: `File:${day}.jpg`, thumbnail: { source: `https://thumb/${day}.jpg`, width: 960, height: 640 }, file_page: `https://commons/${day}`, artist: { text: 'A' }, license: { type: 'Public domain' }, description: { text: `Picture ${day}` } }, onthisday: [{ year: 1990, text: `English ${day}` }] };
    }
    m = /zh\.wikipedia\.org\/api\/rest_v1\/feed\/onthisday\/selected\/(\d+)\/(\d+)$/.exec(url);
    if (m) {
      asked.push(url);
      assert.equal(init.headers['Accept-Language'], 'zh-cn'); // 维基自己转简体
      return { selected: [{ year: 2000, text: `中文 ${m[1]}${m[2]}` }] };
    }
    if (url.startsWith('https://zh.wikipedia.org/w/api.php?')) {
      asked.push(url);
      const title = new URL(url).searchParams.get('titles');
      // 11 日的中文说明配的是另一张图: 不用
      const image = title.endsWith('11月11日') ? 'Other.jpg' : title.endsWith('11月10日') ? '2026-11-10.jpg' : '2026-11-12.jpg';
      return { query: { pages: [{ revisions: [{ slots: { main: { content: `{{Featurepic/format\n| Image = ${image}\n| Content = [[说明]]${title.slice(-6)}\n}}` } } }] }] } };
    }
    return null;
  };
  try {
    globalThis.fetch = async (url, init) => {
      const w = wiki(url, init);
      return w ? new Response(JSON.stringify(w)) : fakeWeb(now).fetch(url, init);
    };
    const { index } = await collect({ now, guardianKey: '', log });
    assert.deepEqual(Object.keys(index.days), ['2026-11-10', '2026-11-11', '2026-11-12']);
    const d = index.days['2026-11-11'];
    assert.equal(d.pic.src, 'https://thumb/2026-11-11.jpg');
    assert.equal(d.pic.zh, undefined); // 配的不是这张图
    assert.equal(index.days['2026-11-12'].pic.zh, '说明11月12日');
    assert.deepEqual(d.zh, [{ y: 2000, t: '中文 1111' }]);
    assert.deepEqual(d.en, [{ y: 1990, t: 'English 2026-11-11' }]);
    // 三个小时后: 不再拿
    asked.length = 0;
    const again = await collect({ prev: index, now: now + 3 * 3600000, guardianKey: '', log });
    assert.equal(asked.length, 0);
    assert.deepEqual(again.index.days, index.days);
    // 十三个小时后: 过了 UTC 半夜, 换成 11、12、13 日, 都重新拿
    const later = await collect({ prev: index, now: now + 13 * 3600000, guardianKey: '', log });
    assert.deepEqual(Object.keys(later.index.days), ['2026-11-11', '2026-11-12', '2026-11-13']);
    assert.ok(asked.some((u) => u.endsWith('/featured/2026/11/13')));
    // 维基拿不到: 新闻照样有, 上次的照用
    globalThis.fetch = fakeWeb(now).fetch;
    const down = await collect({ prev: index, now: now + 7 * 3600000, guardianKey: '', log });
    assert.ok(down.index.items.length > 0);
    assert.deepEqual(down.index.days['2026-11-11'], index.days['2026-11-11']);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('邸报: 点过的记在这台设备上, 三天后忘掉 (v1.81); 今日一图按这台设备的日期挑', () => {
  const map = new Map();
  const storage = { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, String(v)) };
  markSeen('a', { storage, now: NOW });
  markSeen('b', { storage, now: NOW + 1000 });
  assert.deepEqual([...seenIds(storage, NOW + 2000)].sort(), ['a', 'b']);
  assert.deepEqual([...seenIds(storage, NOW + 3 * 86400000 + 500)], ['b']);
  markSeen('c', { storage, now: NOW + 3 * 86400000 + 500 }); // 存的时候顺便把过期的扔掉
  assert.deepEqual(Object.keys(JSON.parse(map.get(SEEN_KEY))).sort(), ['b', 'c']);
  map.set(SEEN_KEY, '坏了');
  assert.deepEqual([...seenIds(storage, NOW)], []);
  assert.deepEqual([...seenIds(null, NOW)], []);
  const today = localDay(new Date(NOW).toISOString());
  assert.deepEqual(todayOf({ days: { [today]: { zh: [1] } } }, NOW), { zh: [1] });
  assert.equal(todayOf({ days: {} }, NOW), null);
  assert.equal(todayOf({}, NOW), null);
});
