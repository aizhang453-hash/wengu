import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHtml, decode, itnFrom, daysFrom, pickMain, titleOf, isEvent, sectionOf, bodyFrom, introLine, placeIntro, noteWanted, eventLine, dropGloss, alike, buildStories, finish, hashId, todayIn } from '../tools/news.mjs';
import { validNews, loadNews, newsUrls, NEWS_URLS, dayLabel, agoText, byDay, sectionCounts, topStories, sameEvent, topicStories, topicOf, peopleOf, smallImage, headline, imageOf, spokenParts, storyHref, wikiUrl } from '../js/news.js';

// 照维基百科真的网页的样子写的一小段 (首页「新闻动态」)
const ITN = `<div class="mw-content-ltr mw-parser-output" lang="zh-Hans-CN"><div id="column-itn" class="knoblock">
<figure class="mw-halign-right" typeof="mw:File"><a href="/wiki/File:2026_Krakow_shooting_CCTV.webp" class="mw-file-description"><img src="//thumb.wikimedia.org/x.webp" /></a><figcaption></figcaption></figure>
<ul><li>波兰<a href="/wiki/%E5%85%8B%E6%8B%89%E7%A7%91%E5%A4%AB" title="克拉科夫">克拉科夫</a>发生<b><a href="/wiki/2026%E5%B9%B4%E6%B3%A2%E5%85%B0%E5%85%8B%E6%8B%89%E7%A7%91%E5%A4%AB%E6%9E%AA%E5%87%BB%E6%A1%88" title="2026年波兰克拉科夫枪击案">大规模枪击事件</a></b><small>（图）</small>，造成至少9人死亡。</li>
<li><a href="/wiki/%E5%B7%B4%E6%8B%89%E5%9C%AD%E6%80%BB%E7%BB%9F" title="巴拉圭总统">巴拉圭总统</a><b><a href="/wiki/%E5%9C%A3%E5%9C%B0%E4%BA%9A%E5%93%A5%C2%B7%E5%9F%B9%E5%B0%BC%E4%BA%9A" title="圣地亚哥·培尼亚">圣地亚哥·培尼亚</a></b>因银行倒闭宣布请辞不果，遭参议院弹劾免职。</li>
<li>香港高等法院裁定<b><a href="/wiki/%E9%BB%83%E4%B9%8B%E9%8B%92" title="黄之锋">黄之锋</a></b>罪成，判处10年监禁。</li>
<li>未见于大事记的<b><a href="/wiki/2026%E5%B9%B4%E6%9F%90%E5%9C%B0%E5%9C%B0%E9%9C%87" title="2026年某地地震">地震</a></b>造成伤亡。</li></ul>
</div>
<div id="column-feature-more">&#160;<span class="column-feature-more-header"><b><a href="/wiki/Portal:%E6%96%B0%E8%81%9E%E5%8B%95%E6%85%8B" title="Portal:新闻动态">正在发生</a></b>：</span><a href="/wiki/%E4%BF%84%E7%83%8F%E6%88%B0%E7%88%AD_(2022%E5%B9%B4%E8%87%B3%E4%BB%8A)" title="俄乌战争 (2022年至今)">俄乌战争</a>（<a href="/wiki/A" title="俄乌战争过程">过程</a> · <a href="/wiki/B" title="谈判">谈判</a>）－<a href="/wiki/%E4%BC%8A%E6%9C%97%E6%88%B0%E7%88%AD_(2026%E5%B9%B4)" title="伊朗战争 (2026年)">伊朗战争</a></div>
<div id="column-feature-more" style="margin-top: 0em;">&#160;<span class="column-feature-more-header"><b><a href="/wiki/2026%E5%B9%B411%E6%9C%88%E9%80%9D%E4%B8%96%E4%BA%BA%E7%89%A9%E5%88%97%E8%A1%A8" title="2026年11月逝世人物列表">最近逝世</a></b>：</span><a href="/wiki/%E9%A1%A7%E5%AE%89%E7%94%9F" title="顾安生">顾安生</a>－<a href="/w/index.php?title=X&amp;action=edit&amp;redlink=1" class="new" title="X（页面不存在）">X</a></div>
<style>.mw-parser-output .x{color:red}</style></div>`;

// 每月的大事记: 一天一节, 后面附着出处 (引用模板里有整齐的 COinS)
const coins = (title, site, url, date) => `<span title="ctx&#95;ver=Z39.88-2004&amp;rft.atitle=${encodeURIComponent(title)}&amp;rft.jtitle=${encodeURIComponent(site)}&amp;rft.date=${date}&amp;rft&#95;id=${encodeURIComponent(url)}" class="Z3988"></span>`;
const MONTH = `<div class="mw-content-ltr mw-parser-output" lang="zh-Hans-CN">
<div class="mw-heading mw-heading2"><h2 id="11月5日">11月5日</h2></div>
<ul><li><a href="/wiki/%E5%B7%B4%E6%8B%89%E5%9C%AD%E7%B8%BD%E7%B5%B1" title="巴拉圭总统">巴拉圭总统</a><a href="/wiki/%E8%81%96%E5%9C%B0%E7%89%99%E5%93%A5%C2%B7%E6%BD%98%E5%B0%BC%E4%BA%9E" class="mw-redirect" title="圣地亚哥·潘尼亚">圣地亚哥·潘尼亚</a>因银行破产表示辞职，后被众议院弹劾。<sup id="cite&#95;ref-1" class="reference"><a href="#cite_note-1">[1]</a></sup></li>
<li>香港众志前秘书长<a href="/wiki/%E9%BB%83%E4%B9%8B%E9%8B%92" title="黄之锋">黄之锋</a>，<a href="/wiki/%E9%BB%83%E4%B9%8B%E9%8B%92%E4%B8%B2%E8%AC%80%E5%8B%BE%E7%B5%90%E6%A1%88" title="黄之锋串谋勾结案">被控串谋</a>罪名成立，被判处10年监禁<sup class="reference"><a href="#cite_note-2">[2]</a></sup>。</li>
<li><span class="ilh-all"><span class="ilh-page"><a href="/w/index.php?title=Y&amp;redlink=1" class="new" title="防灾大臣（页面不存在）">防灾大臣</a></span><span class="noprint ilh-comment"><span class="ilh-paren">（</span><span class="ilh-lang">日语</span>：防災大臣<span class="ilh-paren">）</span></span></span>上任。</li></ul>
<div class="mw-heading mw-heading2"><h2 id="11月7日">11月7日</h2></div>
<ul><li>波兰<a href="/wiki/%E5%85%8B%E6%8B%89%E7%A7%91%E5%A4%AB" title="克拉科夫">克拉科夫</a>发生<a href="/wiki/2026%E5%B9%B4%E6%B3%A2%E5%85%B0%E5%85%8B%E6%8B%89%E7%A7%91%E5%A4%AB%E6%9E%AA%E5%87%BB%E6%A1%88" title="2026年波兰克拉科夫枪击案">枪击事件</a>，致至少6人死亡。<sup class="reference"><a href="#cite_note-3">[3]</a></sup></li>
<li>美国大选：<ul><li>民主党赢得众议院。</li><li>民主党赢得参议院。</li></ul></li></ul>
<div class="mw-heading mw-heading2"><h2 id="10月31日">10月31日</h2></div>
<ul><li>别的月份的一天，不要。</li></ul>
<div class="mw-references-wrap"><ol class="references">
<li id="cite&#95;note-1"><span class="reference-text"><cite class="citation news"><a rel="nofollow" class="external text" href="https://www.npr.org/x">Paraguay's president is impeached</a>. NPR.</cite>${coins("Paraguay's president is impeached", 'NPR', 'https://www.npr.org/x', '2026-11-05')}</span></li>
<li id="cite&#95;note-2"><span class="reference-text"><cite class="citation web"><a rel="nofollow" class="external text" href="https://www.zaobao.com.sg/y">黄之锋串谋勾结外国势力罪成判监10年</a>. [[联合早报]].</cite>${coins('黄之锋串谋勾结外国势力罪成判监10年', '[[联合早报]]', 'https://www.zaobao.com.sg/y', '2026-11-05')}</span></li>
<li id="cite&#95;note-3"><span class="reference-text"><cite class="citation web"><a rel="nofollow" class="external text" href="https://www.bbc.com/z">Six killed in Krakow</a>.</cite></span></li>
</ol></div></div>`;

test('新闻: 网页拆成树 (实体、空元素、样式不要)', () => {
  assert.equal(decode('a&amp;b&#95;c&#x41;&nbsp;&#160;&lt;'), 'a&b_cA  <');
  const root = parseHtml('<p class="x">一<br>二<img src="a.png"/><style>p{}</style><b>三</b></p>');
  const p = root.children[0];
  assert.equal(p.tag, 'p');
  assert.equal(p.attrs.class, 'x');
  assert.deepEqual(
    p.children.map((c) => (typeof c === 'string' ? c : c.tag)),
    ['一', 'br', '二', 'img', 'style', 'b'],
  );
  assert.equal(p.children[5].children[0], '三');
});

test('新闻: 首页的「新闻动态」— 头条、加粗的链接、配图、正在发生 (括号里的不要)、最近逝世 (红链不要)', () => {
  const itn = itnFrom(ITN);
  assert.equal(itn.image, '2026 Krakow shooting CCTV.webp');
  assert.equal(itn.items.length, 4);
  assert.equal(itn.items[0].text, '波兰克拉科夫发生大规模枪击事件，造成至少9人死亡。');
  assert.equal(itn.items[0].pic, true);
  assert.equal(itn.items[1].pic, false);
  assert.deepEqual(
    itn.items[0].links.map((l) => [l.page, l.name, Boolean(l.b)]),
    [
      ['克拉科夫', '克拉科夫', false],
      ['2026年波兰克拉科夫枪击案', '2026年波兰克拉科夫枪击案', true],
    ],
  );
  assert.deepEqual(
    itn.ongoing.map((l) => l.name),
    ['俄乌战争 (2022年至今)', '伊朗战争 (2026年)'],
  );
  assert.deepEqual(
    itn.deaths.map((l) => l.name),
    ['顾安生'],
  );
});

test('新闻: 每月大事记 — 按天分, 出处 (COinS)、外语原名的小字和红链不要、下一层拆开、别的月份的不要', () => {
  const days = daysFrom(MONTH, 2026, 11);
  assert.deepEqual(
    days.map((d) => [d.date, d.text]),
    [
      ['2026-11-05', '巴拉圭总统圣地亚哥·潘尼亚因银行破产表示辞职，后被众议院弹劾。'],
      ['2026-11-05', '香港众志前秘书长黄之锋，被控串谋罪名成立，被判处10年监禁。'],
      ['2026-11-05', '防灾大臣上任。'],
      ['2026-11-07', '波兰克拉科夫发生枪击事件，致至少6人死亡。'],
      ['2026-11-07', '美国大选：民主党赢得众议院。'],
      ['2026-11-07', '美国大选：民主党赢得参议院。'],
    ],
  );
  assert.deepEqual(days[0].src, [{ t: "Paraguay's president is impeached", u: 'https://www.npr.org/x', s: 'NPR', d: '2026-11-05' }]);
  assert.equal(days[1].src[0].s, '联合早报'); // 去掉 [[ ]]
  assert.deepEqual(days[3].src, [{ t: 'Six killed in Krakow', u: 'https://www.bbc.com/z', s: 'bbc.com' }]); // 没有 COinS: 用链接和网站
  assert.deepEqual(days[2].links, []); // 红链不算
  assert.equal(days[0].links[1].page, '聖地牙哥·潘尼亞'); // 页面名照网址 (拿条目时用), 显示的是简体
  assert.equal(days[0].links[1].name, '圣地亚哥·潘尼亚');
});

test('新闻: 主条目 — 年份开头、像一件事的、加粗的; 标题去掉年份和括号', () => {
  assert.equal(isEvent('2026年美國選舉'), true);
  assert.equal(isEvent('黃之鋒串謀勾結案'), true);
  assert.equal(isEvent('2026年格林納達大選'), true);
  assert.equal(isEvent('新西兰大選'), true);
  assert.equal(isEvent('黄之锋'), false);
  assert.equal(isEvent('伊朗战争 (2026年)'), true);
  const links = (...xs) => xs.map(([name, b]) => ({ page: name, name, b }));
  assert.equal(pickMain(links(['基米·安东内利'], ['2026年墨西哥城大奖赛'], ['一级方程式世界车手冠军列表'])).name, '2026年墨西哥城大奖赛');
  assert.equal(pickMain(links(['巴拉圭总统'], ['圣地亚哥·培尼亚', true])).name, '圣地亚哥·培尼亚');
  assert.equal(pickMain(links(['日本'], ['细野豪志'])), null);
  assert.equal(titleOf({ name: '2026年波兰克拉科夫枪击案' }), '波兰克拉科夫枪击案');
  assert.equal(titleOf({ name: '伊朗战争 (2026年)' }), '伊朗战争');
  assert.equal(titleOf({ name: '黄之锋' }), null);
  assert.equal(titleOf({ name: '2026年' }), '2026年');
});

test('新闻: 栏目 — 先看分类 (繁体也认), 再看字; 辞职、弹劾的算时政; 都对不上的是时政', () => {
  assert.equal(sectionOf('某地发生枪击', ['2026年波蘭罪案', '槍擊案']), '社会');
  assert.equal(sectionOf('安东内利夺得车手总冠军', ['2026年一級方程式世界錦標賽']), '体育');
  assert.equal(sectionOf('巴拉圭总统因银行破产表示辞职，后被众议院弹劾。'), '时政');
  assert.equal(sectionOf('加密货币交易所遭黑客入侵，数码货币被盗。'), '科技');
  assert.equal(sectionOf('无人机空袭基辅'), '军事');
  assert.equal(sectionOf('央行宣布加息，股市大跌'), '财经');
  assert.equal(sectionOf('总统与法官发生肢体冲突'), '时政'); // 「冲突」不一定是打仗
  assert.equal(sectionOf('某电影获得金马奖'), '文娱');
  assert.equal(sectionOf('日本防灾厅成立'), '时政');
});

test('新闻: 正文 — 参见、参考资料不要; 空小标题去掉; 短行并成列表、单独一行是小标题; 第一段的外文原名去掉; 太长截断', () => {
  const text = [
    '2026年墨西哥城大奖赛（西班牙语：Formula 1 Gran Premio），是第19场。',
    '',
    '== 赛事背景 ==',
    '=== 时间表 ===',
    '== 车队名单 ==',
    '共有以下车手：',
    '甲代表A，代替B',
    '乙代表C，代替D',
    '== 赛前 ==',
    '冠军点',
    '他领先很多（英语：keep）。',
    '== 参见 ==',
    '别的条目',
    '=== 小节 ===',
    '也不要。',
    '== 反应 ==',
    '大家都说了话。',
  ].join('\n');
  assert.deepEqual(bodyFrom(text), {
    body: ['2026年墨西哥城大奖赛，是第19场。', { h: '车队名单' }, '共有以下车手：', { li: ['甲代表A，代替B', '乙代表C，代替D'] }, { h: '赛前' }, { h: '冠军点', s: 1 }, '他领先很多（英语：keep）。', { h: '反应' }, '大家都说了话。'],
    cut: false,
  });
  const long = bodyFrom(['一'.repeat(30) + '。', '== 二 ==', '二'.repeat(30) + '。', '三'.repeat(30) + '。'].join('\n'), 70);
  assert.deepEqual(long, { body: ['一'.repeat(30) + '。', { h: '二' }, '二'.repeat(30) + '。'], cut: true });
  // 截断后最后剩个小标题: 不要
  assert.deepEqual(bodyFrom(['一'.repeat(30) + '。', '== 二 ==', '二'.repeat(60) + '。'].join('\n'), 50), { body: ['一'.repeat(30) + '。'], cut: true });
  assert.equal(dropGloss('张三（英语：Zhang San，1970年—）是人。'), '张三是人。');
});

test('新闻: 人和机构的一句话简介 — 括号去掉、只要第一句; 地方、职位不要; 从日子讲起的是一件事', () => {
  assert.equal(introLine('巴尔特·德韦弗（荷兰语：Bart De Wever，1970年12月21日—），比利时政治人物，现任首相。他出生于……'), '巴尔特·德韦弗，比利时政治人物，现任首相。');
  assert.equal(introLine('比利时王国，通称比利时，是位于欧洲西北部的国家。'), '比利时王国，是位于欧洲西北部的国家。');
  assert.equal(introLine('甲'.repeat(100) + '。', 20).length, 20);
  assert.equal(placeIntro('比利时王国，通称比利时（法语：Belgique），是位于欧洲西北部的国家。'), true);
  assert.equal(placeIntro('曼谷，官方名称恭贴玛哈纳空（泰语：กรุงเทพ），是泰国的首都。'), true);
  assert.equal(placeIntro('山西省，简称晋，中华人民共和国华北地区的一个省份，地处黄土高原。'), true);
  assert.equal(placeIntro('维多利亚州，简称维州，是澳大利亚东岸南部的一个州，首府墨尔本。'), true);
  assert.equal(placeIntro('黄之锋，香港民主自决派政客，曾任香港众志秘书长。'), false);
  assert.equal(placeIntro('中央集市广场是波兰城市克拉科夫旧城区的主要广场。'), false);
  assert.equal(noteWanted('巴拉圭总统'), false);
  assert.equal(noteWanted('澳门立法会'), true);
  assert.equal(noteWanted('2026年美国选举'), false);
  assert.equal(eventLine('欧洲中部时间2026年10月30日，波兰宪法法院院长……'), true);
  assert.equal(eventLine('2026年10月底至11月期间，《纽约时报》揭露……'), true);
  assert.equal(eventLine('黄仁勋是台湾裔美国籍企业家。'), false);
});

test('新闻: 头条跟大事记里同一件事的并成一条 (主条目、加粗的、字差不多的); 对不上的算第一次看见那天', () => {
  assert.ok(alike('巴拉圭总统圣地亚哥·培尼亚因银行倒闭宣布请辞不果，遭参议院弹劾免职。', '巴拉圭总统圣地亚哥·潘尼亚因银行破产表示辞职，后被众议院弹劾。') >= 0.4);
  assert.ok(alike('波兰发生枪击事件', '日本防灾厅成立') < 0.1);
  const itn = itnFrom(ITN);
  const days = daysFrom(MONTH, 2026, 11);
  const { stories, top } = buildStories({ days, itn, today: '2026-11-10' });
  assert.deepEqual(
    top.map((s) => [s.date, s.main?.name, s.top]),
    [
      ['2026-11-07', '2026年波兰克拉科夫枪击案', 1], // 主条目一样
      ['2026-11-05', '圣地亚哥·培尼亚', 2], // 译名不一样, 字差不多
      ['2026-11-05', '黄之锋串谋勾结案', 3], // 加粗的是人, 大事记里有这件事的条目: 用大事记的
      ['2026-11-10', '2026年某地地震', 4], // 大事记里还没有: 今天
    ],
  );
  assert.equal(top[0].text, itn.items[0].text); // 用头条的字
  assert.equal(top[0].pic, true);
  assert.equal(stories.length, 7);
  // 编号跨天不变
  assert.equal(top[0].id, `261107-${hashId('m:2026年波兰克拉科夫枪击案')}`);
  // 上次的文件里有这条头条: 照上次的日子
  const again = buildStories({ days, itn, today: '2026-11-12', prev: { stories: [{ top: 4, key: top[3].key, date: '2026-11-10' }] } });
  assert.equal(again.top[3].date, '2026-11-10');
});

test('新闻: 拼成文件 — 标题用条目的简体名, 主条目 (译名不同也算) 不在相关里, 没用上的条目不写', () => {
  const itn = itnFrom(ITN);
  const days = daysFrom(MONTH, 2026, 11);
  const { stories, top } = buildStories({ days, itn, today: '2026-11-10' });
  const out = finish({
    stories,
    top,
    today: '2026-11-10',
    articles: {
      '2026年波兰克拉科夫枪击案': { rev: 1, name: '2026年波兰克拉科夫枪击案', body: ['枪击。'], cats: ['槍擊案'], image: 'a.jpg', event: true },
      圣地亚哥·培尼亚: { rev: 2, name: '圣地亚哥·培尼亚', body: ['政治人物。'], intro: true, cats: [] },
      没人用的: { rev: 3, name: '没人用的', body: [], cats: [] },
    },
    resolve: (t) => (t === '聖地牙哥·潘尼亞' ? '圣地亚哥·培尼亚' : t),
    imgs: { 'a.jpg': { src: 'https://x/960px-a.jpg', w: 960, h: 540 }, '2026 Krakow shooting CCTV.webp': { src: 'https://x/960px-b.webp', w: 960, h: 540 } },
    itnImage: '2026 Krakow shooting CCTV.webp',
    topicList: [],
    deathList: [],
    notes: { 巴拉圭总统: null, 黃之鋒: '黄之锋，香港政客。' },
    alias: {},
  });
  assert.ok(validNews(out));
  assert.deepEqual(Object.keys(out.articles).sort(), ['2026年波兰克拉科夫枪击案', '圣地亚哥·培尼亚']);
  assert.equal(out.articles['2026年波兰克拉科夫枪击案'].cats, undefined);
  const krakow = out.stories.find((s) => s.top === 1);
  assert.equal(krakow.title, '波兰克拉科夫枪击案');
  assert.equal(krakow.sec, '社会');
  assert.equal(krakow.img.src, 'https://x/960px-b.webp'); // 首页那张图给头条
  assert.deepEqual(
    krakow.links.map((l) => l.page),
    ['克拉科夫'],
  );
  const pena = out.stories.find((s) => s.top === 2);
  assert.equal(pena.title, undefined); // 主条目是人: 没有标题, 用那句话
  assert.equal(pena.art, '圣地亚哥·培尼亚');
  assert.deepEqual(
    pena.links.map((l) => l.page),
    ['巴拉圭總統'], // 「聖地牙哥·潘尼亞」重定向到主条目: 不列
  );
  assert.equal(out.stories[0].date, '2026-11-10'); // 新的在前
  assert.deepEqual(out.notes, { 黃之鋒: '黄之锋，香港政客。' }); // 只留用得上的
  assert.equal(todayIn('Asia/Shanghai', new Date('2026-11-10T17:00:00Z')), '2026-11-11');
});

// ---- 温故这边 (js/news.js) ----

const DATA = {
  v: 1,
  at: '2026-11-10T12:00:00Z',
  top: ['b'],
  stories: [
    { id: 'a', date: '2026-11-10', sec: '社会', text: '甲地火灾。', links: [{ page: '甲地', name: '甲地' }], src: [] },
    { id: 'b', date: '2026-11-09', sec: '时政', title: '某国大选', text: '某国举行大选。', art: '2026年某国大选', top: 1, links: [{ page: '张三', name: '张三' }, { page: '俄乌战争', name: '俄乌战争' }], src: [], img: { src: 'https://t/960px-x.jpg' } },
    { id: 'c', date: '2026-11-09', sec: '时政', text: '某国大选结果出炉。', art: '2026年某国大选', links: [], src: [] },
    { id: 'd', date: '2026-11-08', sec: '体育', text: '某队夺冠。', links: [], src: [] },
    { id: 'e', date: '2026-11-08', sec: '军事', text: '俄乌战争双方交换战俘。', links: [], src: [] },
  ],
  articles: { '2026年某国大选': { rev: 1, name: '2026年某国大选', body: ['开头。', { h: '结果' }, { li: ['甲', '乙', '……'] }], img: { src: 'https://t/y.jpg' } } },
  topics: [{ title: '俄乌战争', name: '俄乌战争', body: ['打仗。'] }],
  deaths: [],
  notes: { 张三: '张三，某国政治人物。', 甲地: null },
};

test('新闻页: 文件像不像样、按日子分、栏目、头条、同一件事、正在发生、人和机构', () => {
  assert.equal(validNews(DATA), true);
  assert.equal(validNews({ ...DATA, v: 2 }), false);
  assert.equal(validNews({ ...DATA, stories: [] }), false);
  assert.equal(validNews(null), false);
  assert.deepEqual(
    byDay(DATA).map((d) => [d.date, d.stories.map((s) => s.id)]),
    [
      ['2026-11-10', ['a']],
      ['2026-11-09', ['b', 'c']],
      ['2026-11-08', ['d', 'e']],
    ],
  );
  assert.deepEqual(
    byDay(DATA, '时政').map((d) => d.date),
    ['2026-11-09'],
  );
  assert.deepEqual(sectionCounts(DATA), [
    { sec: '时政', n: 2 },
    { sec: '军事', n: 1 },
    { sec: '社会', n: 1 },
    { sec: '体育', n: 1 },
  ]);
  assert.deepEqual(
    topStories(DATA).map((s) => s.id),
    ['b'],
  );
  assert.deepEqual(
    sameEvent(DATA, DATA.stories[1]).map((s) => s.id),
    ['c'],
  );
  assert.deepEqual(sameEvent(DATA, DATA.stories[0]), []);
  assert.deepEqual(
    topicStories(DATA, topicOf(DATA, '俄乌战争')).map((s) => s.id),
    ['b', 'e'], // 链接对得上的、字里写着的
  );
  assert.deepEqual(peopleOf(DATA, DATA.stories[1]), [{ page: '张三', name: '张三', line: '张三，某国政治人物。' }]);
  assert.deepEqual(peopleOf(DATA, DATA.stories[0]), []); // 简介是 null 的 (地方) 不列
  assert.equal(headline(DATA.stories[0]), '甲地火灾。');
  assert.equal(headline(DATA.stories[1]), '某国大选');
  assert.equal(imageOf(DATA, DATA.stories[1]).src, 'https://t/960px-x.jpg');
  assert.equal(imageOf(DATA, DATA.stories[2]).src, 'https://t/y.jpg'); // 没有自己的图: 条目的
  assert.equal(imageOf(DATA, DATA.stories[0]), null);
  assert.equal(smallImage('https://t/thumb/a/ab/x.jpg/960px-x.jpg'), 'https://t/thumb/a/ab/x.jpg/330px-x.jpg');
  assert.equal(smallImage('https://t/a/ab/x.jpg'), 'https://t/a/ab/x.jpg');
  assert.deepEqual(spokenParts(DATA, DATA.stories[1]), [
    { k: 'title', text: '某国大选' },
    { k: 'lede', text: '某国举行大选。' },
    { k: 0, text: '开头。' },
    { k: 1, text: '结果' },
    { k: 2, text: '甲；乙' },
  ]);
  assert.equal(storyHref({ id: '261109-x' }), '#/news/s/261109-x');
  assert.equal(wikiUrl('俄乌战争 (2022年至今)'), `https://zh.wikipedia.org/zh-cn/${encodeURIComponent('俄乌战争_(2022年至今)')}`);
});

test('新闻页: 日子和「几小时前」', () => {
  assert.equal(dayLabel('2026-11-10', '2026-11-10'), '今天');
  assert.equal(dayLabel('2026-11-09', '2026-11-10'), '昨天');
  assert.equal(dayLabel('2026-11-09', '2026-11-10', { long: true }), '昨天 · 11月9日 星期一');
  assert.equal(dayLabel('2026-11-08', '2026-11-10'), '11月8日 星期日');
  assert.equal(dayLabel('2025-12-31', '2026-01-02'), '2025年12月31日 星期三');
  const now = Date.parse('2026-11-10T12:00:00Z');
  assert.equal(agoText('2026-11-10T11:59:30Z', now), '刚刚');
  assert.equal(agoText('2026-11-10T11:40:00Z', now), '20 分钟前');
  assert.equal(agoText('2026-11-10T09:00:00Z', now), '3 小时前');
  assert.equal(agoText('2026-11-08T12:00:00Z', now), '2 天前');
  assert.equal(agoText('不是时间', now), '');
});

test('新闻页: 从哪拿 — 先 GitHub 再 jsDelivr (自己电脑上先用本地的); 拿不到、格式不对的换下一个; 都拿不到: 没有', async () => {
  assert.deepEqual(NEWS_URLS, ['https://raw.githubusercontent.com/aizhang453-hash/wengu/news/latest.json', 'https://cdn.jsdelivr.net/gh/aizhang453-hash/wengu@news/latest.json']);
  assert.deepEqual(newsUrls({ hostname: 'aizhang453-hash.github.io', href: 'https://aizhang453-hash.github.io/wengu/' }), NEWS_URLS);
  assert.deepEqual(newsUrls({ hostname: 'localhost', href: 'http://localhost:8000/#/news' }), ['http://localhost:8000/news/latest.json', ...NEWS_URLS]);
  // 这里没有 IndexedDB: 存不了、也没有存着的, 不要紧
  const tried = [];
  const got = await loadNews({
    urls: ['u1', 'u2', 'u3'],
    now: 1000,
    fetchOne: async (u) => {
      tried.push(u);
      if (u === 'u1') throw new Error('断网');
      if (u === 'u2') return { v: 1, stories: [] }; // 格式不对
      return DATA;
    },
  });
  assert.deepEqual(tried, ['u1', 'u2', 'u3']);
  assert.equal(got.data, DATA);
  assert.equal(got.at, 1000);
  assert.equal(got.stale, false);
  const none = await loadNews({
    urls: ['u1'],
    fetchOne: async () => {
      throw new Error('断网');
    },
  });
  assert.equal(none.data, null);
  assert.equal(none.stale, true);
  assert.equal(none.error.message, '断网');
});
