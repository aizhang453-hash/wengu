// 新闻 (v1.74): 像新闻网站那样的几页 (新闻从哪来、怎么存见 ../news.js)
//   #/news               首页: 头条 (第一条大图)、正在发生、按日子列的新闻、最近逝世; 上面一排栏目
//   #/news/sec/<栏目>    只看一个栏目
//   #/news/s/<编号>      一条新闻: 标题、导语、图、正文 (这件事的维基百科条目)、原始报道、新闻里的人和机构、这件事的其他新闻; 朗读
//   #/news/topic/<条目>  正在发生的一件事 (俄乌战争……): 简介和讲到它的新闻
// 先画存着的 (马上就有), 再去拿新的; 拿来的跟画着的不一样才重画 (停在原来的地方)

import { h, fill, icon, toast } from '../dom.js';
import { loadNews, cachedNews, beijingToday, dayLabel, agoText, storyHref, sectionHref, topicHref, wikiUrl, storyOf, articleOf, imageOf, smallImage, headline, topStories, byDay, sectionCounts, sameEvent, topicOf, topicStories, peopleOf, spokenParts } from '../news.js';
import { canSpeak, speakLines, stopSpeaking } from '../speech.js';

const ext = (href, ...children) => h('a', { href, target: '_blank', rel: 'noopener' }, ...children);

// 一页的架子: 先画「正在拿」, 有存着的画存着的, 拿来新的再画; draw(rec, box) 画进 box
function newsPage(cls, draw) {
  const box = h('section', { class: `news-page ${cls}`, 'aria-live': 'polite' }, h('p', { class: 'muted news-wait' }, '正在拿新闻……'));
  let shown = null; // 画着的是哪一份 (data.at)
  const paint = (rec) => {
    if (!box.isConnected && shown !== null) return;
    const y = window.scrollY;
    fill(box, draw(rec, { refresh }));
    if (shown !== null) window.scrollTo(0, y);
    shown = rec.data?.at ?? '';
  };
  const refresh = (force = false) =>
    loadNews({ force }).then((rec) => {
      if (!box.isConnected) return;
      if (!rec.data) return fill(box, offline(() => refresh(true)));
      const same = shown === rec.data.at;
      if (!same || rec.stale !== lastStale) paint(rec);
      lastStale = rec.stale;
      if (force) toast(rec.stale ? '没连上网，还是上次的新闻' : same ? '已经是最新的了' : '新闻更新好了');
    });
  let lastStale = null;
  cachedNews().then((rec) => {
    if (rec && box.isConnected && shown === null) {
      lastStale = false;
      paint({ ...rec, stale: false });
    }
    refresh();
  });
  return box;
}

function offline(retry) {
  return h(
    'div',
    { class: 'empty' },
    h('h1', {}, '新闻'),
    h('p', {}, '还没拿到新闻。请连上网再试一次（拿到过一次以后，断网也能看上次的）。'),
    h('button', { class: 'btn primary', type: 'button', onclick: retry }, '再试一次'),
  );
}

// 图: 拿不到 (断网) 就不占地方
function picture(img, { small = false, alt = '', cls = '' } = {}) {
  if (!img?.src) return null;
  return h('img', {
    class: cls,
    src: small ? smallImage(img.src) : img.src,
    alt,
    loading: 'lazy',
    decoding: 'async',
    width: img.w || null,
    height: img.h || null,
    onerror: (e) => e.target.closest('.news-pic, .news-thumb, .news-lead-pic, .news-card-pic')?.remove() ?? e.target.remove(),
  });
}

// 图下面: 作者、授权、维基共享资源
function credit(img) {
  const who = [img.by, img.lic].filter(Boolean).join(' · ');
  return h('figcaption', { class: 'news-credit' }, '图：', who ? `${who} · ` : '', img.page ? ext(img.page, '维基共享资源') : '维基共享资源');
}

const tag = (s, { top = false } = {}) => h('span', { class: 'news-tag' }, s.sec, top && s.top ? ' · 头条' : '');

// 列表里的一条: 栏目、标题、(有标题的) 那一句话, 右边小图
function row(data, s, today) {
  const img = imageOf(data, s);
  return h(
    'li',
    {},
    h(
      'a',
      { class: 'news-row', href: storyHref(s) },
      h('span', { class: 'news-row-text' }, tag(s), h('strong', { class: `news-row-title${s.title ? '' : ' plain'}` }, headline(s)), s.title ? h('span', { class: 'news-row-sum' }, s.text) : null, today ? h('span', { class: 'muted small' }, dayLabel(s.date, today)) : null),
      img ? h('span', { class: 'news-thumb' }, picture(img, { small: true })) : null,
    ),
  );
}

// 头条的第一条: 大图、大标题
function lead(data, s, today) {
  const img = imageOf(data, s);
  return h(
    'a',
    { class: `news-lead${img ? '' : ' no-pic'}`, href: storyHref(s) },
    img ? h('span', { class: 'news-lead-pic' }, picture(img, { alt: headline(s) })) : null,
    h('span', { class: 'news-lead-text' }, h('span', { class: 'news-tag' }, `头条 · ${s.sec}`), h('strong', { class: 'news-lead-title' }, headline(s)), s.title ? h('span', { class: 'news-lead-sum' }, s.text) : null, h('span', { class: 'muted small' }, dayLabel(s.date, today))),
  );
}

// 头条的其他几条: 一格一条
function card(data, s, today) {
  const img = imageOf(data, s);
  return h(
    'a',
    { class: `news-card${img ? '' : ' no-pic'}`, href: storyHref(s) },
    img ? h('span', { class: 'news-card-pic' }, picture(img, { small: true })) : null,
    tag(s),
    h('strong', { class: 'news-card-title' }, headline(s)),
    s.title ? h('span', { class: 'news-card-sum' }, s.text) : null,
    h('span', { class: 'muted small' }, dayLabel(s.date, today)),
  );
}

// 页面最下面: 从哪来、什么授权
function sourceNote(data, extra = null) {
  return h(
    'footer',
    { class: 'news-source muted small' },
    '新闻来自',
    ext(data.source?.url ?? wikiUrl('Portal:新闻动态'), '维基百科「新闻动态」'),
    extra,
    '，按 ',
    ext(data.source?.licenseUrl ?? 'https://creativecommons.org/licenses/by-sa/4.0/deed.zh-hans', data.source?.license ?? 'CC BY-SA 4.0'),
    ' 授权转载，温故只做了排版和分类（分类是按字自动分的，不一定准）；每天自动更新几次，只留最近两个星期的。',
  );
}

function head(data, rec, refresh, title = '新闻') {
  return [
    h(
      'div',
      { class: 'page-head news-head' },
      h('h1', {}, title),
      h(
        'span',
        { class: 'news-updated muted small' },
        `${agoText(data.at)}更新`,
        h('button', { class: 'icon-btn news-refresh', type: 'button', 'aria-label': '看看有没有新的', title: '看看有没有新的', onclick: () => refresh(true) }, icon('refresh', 18)),
      ),
    ),
    rec.stale ? h('p', { class: 'news-stale' }, `没连上网，这是上次拿到的新闻（${agoText(data.at)}更新）。`) : null,
  ];
}

// 栏目: 全部、时政、军事……(只列有新闻的)
function sections(data, on) {
  return h(
    'nav',
    { class: 'news-secs', 'aria-label': '栏目' },
    h('a', { class: `chip${on ? '' : ' on'}`, href: sectionHref(null), 'aria-current': on ? null : 'page' }, '全部'),
    sectionCounts(data).map(({ sec, n }) => h('a', { class: `chip${on === sec ? ' on' : ''}`, href: sectionHref(sec), 'aria-current': on === sec ? 'page' : null }, sec, h('span', { class: 'news-n' }, ` ${n}`))),
  );
}

// ---- 首页 (sec: 只看一个栏目) ----
export function renderNews(ctx, sec = null) {
  return {
    title: sec ? `${sec} · 新闻` : '新闻',
    el: newsPage('news-home', ({ data, ...rec }, { refresh }) => {
      const today = beijingToday();
      const tops = sec ? [] : topStories(data);
      const topIds = new Set(tops.map((s) => s.id));
      const days = byDay(data, sec)
        .map((d) => ({ ...d, stories: d.stories.filter((s) => !topIds.has(s.id)) }))
        .filter((d) => d.stories.length);
      return [
        head(data, rec, refresh, sec ? `新闻 · ${sec}` : '新闻'),
        sections(data, sec),
        tops.length
          ? h(
              'section',
              { class: 'news-top', 'aria-label': '头条' },
              lead(data, tops[0], today),
              tops.length > 1 ? h('div', { class: 'news-cards' }, tops.slice(1).map((s) => card(data, s, today))) : null,
            )
          : null,
        !sec && data.topics?.length
          ? h(
              'div',
              { class: 'news-topics' },
              h('span', { class: 'news-topics-label' }, '正在发生'),
              data.topics.map((t) => h('a', { class: 'chip', href: topicHref(t) }, t.name)),
            )
          : null,
        days.length
          ? days.map((d) => [h('div', { class: 'list-head' }, h('h2', {}, dayLabel(d.date, today, { long: true })), h('span', { class: 'muted small' }, `${d.stories.length} 条`)), h('ul', { class: 'news-list' }, d.stories.map((s) => row(data, s)))])
          : h('p', { class: 'muted' }, sec ? `最近两个星期没有「${sec}」的新闻。` : '没有别的新闻了。'),
        !sec && data.deaths?.length
          ? [
              h('div', { class: 'list-head' }, h('h2', {}, '最近逝世')),
              h(
                'ul',
                { class: 'news-people' },
                data.deaths.map((x) => h('li', {}, ext(wikiUrl(x.page), h('strong', {}, x.name)), x.line ? h('span', { class: 'muted' }, ` ${x.line}`) : null)),
              ),
            ]
          : null,
        sourceNote(data),
      ];
    }),
  };
}

// 正文: 段落、小标题、列表; 每块记着第几块 (朗读时标出念到哪)
function bodyBlocks(body = []) {
  return body.map((b, i) => {
    if (typeof b === 'string') return h('p', { 'data-k': i }, b);
    if (b.h) return h(b.s ? 'h3' : 'h2', { 'data-k': i }, b.h);
    if (b.li) return h('ul', { 'data-k': i }, b.li.map((x) => h('li', {}, x)));
    return null;
  });
}

// 朗读: 按钮在标题下面; 念到的那段变色, 看不见了就滚过去; 念的时候屏幕下面浮着「停止朗读」
function speaker(article, parts) {
  if (!canSpeak()) return { button: null, bar: null };
  let speaking = false;
  const lit = (k) => {
    article.querySelectorAll('.news-speaking').forEach((x) => x.classList.remove('news-speaking'));
    const el = k === null ? null : article.querySelector(`[data-k="${k}"]`);
    if (!el) return;
    el.classList.add('news-speaking');
    const r = el.getBoundingClientRect();
    if (r.top < 70 || r.bottom > innerHeight - 90) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };
  const draw = () => {
    fill(button, icon(speaking ? 'stop' : 'volume', 16), speaking ? ' 停' : ' 朗读');
    button.classList.toggle('on', speaking);
    button.setAttribute('aria-pressed', String(speaking));
    bar.hidden = !speaking;
  };
  const start = () => {
    const ok = speakLines(parts(), 'zh-CN', {
      onLine: lit,
      onEnd: () => {
        speaking = false;
        lit(null);
        draw();
      },
    });
    if (ok) {
      speaking = true;
      draw();
    }
  };
  const button = h('button', { class: 'btn small news-say', type: 'button', 'aria-pressed': 'false', onclick: () => (speaking ? stopSpeaking() : start()) });
  const bar = h('button', { class: 'read-stop', type: 'button', hidden: true, onclick: () => stopSpeaking() }, icon('stop', 16), ' 停止朗读');
  draw();
  return { button, bar };
}

// ---- 一条新闻 ----
export function renderStory(ctx, id) {
  return {
    title: '新闻',
    cleanup: () => stopSpeaking(),
    el: newsPage('news-story', ({ data, ...rec }) => {
      const s = storyOf(data, id);
      const back = h('a', { class: 'back', href: '#/news' }, '← 新闻');
      if (!s) return [back, h('h1', {}, '找不到这条新闻'), h('p', { class: 'muted' }, '新闻只留最近两个星期的，这条可能已经撤下来了。'), h('a', { class: 'btn primary', href: '#/news' }, '看今天的新闻')];
      document.title = `${headline(s)} · 温故`;
      const today = beijingToday();
      const a = articleOf(data, s);
      const img = imageOf(data, s);
      const people = peopleOf(data, s);
      const more = sameEvent(data, s);
      const article = h(
        'article',
        { class: 'news-article' },
        h('p', { class: 'news-meta' }, h('a', { class: 'news-tag', href: sectionHref(s.sec) }, s.sec), h('span', { class: 'muted' }, ` · ${dayLabel(s.date, today, { long: true })}${s.top ? ' · 头条' : ''}`)),
        // 没有专门条目的, 标题就是那一整句话: 字小一点
        h('h1', { class: s.title ? null : 'long', 'data-k': 'title' }, headline(s)),
        s.title ? h('p', { class: 'news-lede', 'data-k': 'lede' }, s.text) : null,
      );
      const { button, bar } = speaker(article, () => spokenParts(data, s));
      article.append(
        ...[
          button ? h('div', { class: 'news-tools' }, button) : null,
          img ? h('figure', { class: 'news-pic' }, picture(img, { alt: headline(s) }), credit(img)) : null,
          a ? (a.intro ? [h('h2', {}, `背景：${a.name}`), ...bodyBlocks(a.body)] : bodyBlocks(a.body)) : null,
          a?.cut ? h('p', { class: 'news-more' }, '后面还有，', ext(wikiUrl(s.art), `到维基百科读「${a.name}」全文 ↗`)) : null,
        ]
          .flat()
          .filter(Boolean),
      );
      return [
        back,
        article,
        bar,
        s.src?.length
          ? [
              h('h2', { class: 'news-sub' }, '原始报道'),
              h(
                'ul',
                { class: 'news-src' },
                s.src.map((x) => h('li', {}, ext(x.u, h('span', { class: 'news-src-site' }, x.s), h('span', { class: 'news-src-title' }, x.t)), x.d ? h('span', { class: 'muted small' }, ` ${x.d}`) : null)),
              ),
            ]
          : null,
        people.length
          ? [
              h('h2', { class: 'news-sub' }, '新闻里的人和机构'),
              h(
                'ul',
                { class: 'news-people' },
                people.map((p) => h('li', {}, ext(wikiUrl(p.page), h('strong', {}, p.name)), h('span', { class: 'muted' }, ` ${p.line}`))),
              ),
            ]
          : null,
        more.length ? [h('h2', { class: 'news-sub' }, '这件事的其他新闻'), h('ul', { class: 'news-list' }, more.map((x) => row(data, x, today)))] : null,
        sourceNote(data, a ? ['（这条的正文是条目', ext(wikiUrl(s.art), `「${a.name}」`), '）'] : null),
      ];
    }),
  };
}

// ---- 正在发生的一件事 ----
export function renderTopic(ctx, title) {
  return {
    title: '新闻',
    el: newsPage('news-story', ({ data }) => {
      const t = topicOf(data, title);
      const back = h('a', { class: 'back', href: '#/news' }, '← 新闻');
      if (!t) return [back, h('h1', {}, title), h('p', { class: 'muted' }, '首页的「正在发生」里已经没有这件事了。'), ext(wikiUrl(title), `到维基百科看「${title}」 ↗`)];
      document.title = `${t.name} · 温故`;
      const today = beijingToday();
      const list = topicStories(data, t);
      return [
        back,
        h(
          'article',
          { class: 'news-article' },
          h('p', { class: 'news-meta' }, h('span', { class: 'news-tag' }, '正在发生')),
          h('h1', {}, t.name),
          t.img ? h('figure', { class: 'news-pic' }, picture(t.img, { alt: t.name }), credit(t.img)) : null,
          bodyBlocks(t.body),
          h('p', { class: 'news-more' }, ext(wikiUrl(t.title), `到维基百科读「${t.name}」全文 ↗`)),
        ),
        h('h2', { class: 'news-sub' }, list.length ? `最近两个星期的新闻（${list.length} 条）` : '最近两个星期的新闻'),
        list.length ? h('ul', { class: 'news-list' }, list.map((s) => row(data, s, today))) : h('p', { class: 'muted' }, '最近两个星期的新闻里没有提到它。'),
        sourceNote(data),
      ];
    }),
  };
}
