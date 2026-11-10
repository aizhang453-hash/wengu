// 新闻 (v1.74): 像新闻网站那样的几页 (新闻从哪来、怎么存见 ../news.js)
//   #/news          中文新闻 (美国之音、自由亚洲电台、中新网)   #/news/en  英文新闻 (卫报、NASA、BBC、NPR)
//                   最上面是头条 (最新的一条大图), 下面几格, 其余的按日子列; 可以只看一家
//   #/news/live     快讯: 24 小时内的标题, 中文、英文分两栏 (手机上一次看一栏: #/news/live/en 是英文那栏); 开着时几分钟自己刷新一次
//   #/news/a/<编号> 一篇全文: 标题、作者、图、正文、原文链接、出处; 可以朗读
// 中新网、BBC、NPR 只有标题和摘要, 点了在新的网页里打开原网站
// 卫报的规定: 放卫报内容的页面上要有「Powered by The Guardian」标志 (链到卫报), 放在卫报的内容旁边; 卫报的内容只给个人、非商业阅读

import { h, fill, icon, toast } from '../dom.js';
import { loadIndex, cachedIndex, loadArticle, LANGS, itemsFor, liveItems, sourcesFor, frontPage, byDay, localDay, clock, dayLabel, agoText, itemHref, langHref, liveHref, itemOf, spokenParts, lastSeen, markSeen } from '../news.js';
import { canSpeak, speakLines, stopSpeaking } from '../speech.js';

const LIVE_REFRESH_MS = 3 * 60 * 1000; // 快讯页开着时多久刷新一次

const ext = (href, ...children) => h('a', { href, target: '_blank', rel: 'noopener' }, ...children);

// 卫报的标志: 浅色时黑字、深色时白字; 链到卫报 (href: 这篇文章的原文, 或者卫报首页)
function guardianLogo(href = 'https://www.theguardian.com/') {
  return h(
    'a',
    { class: 'news-gu-logo', href, target: '_blank', rel: 'noopener', title: 'The Guardian' },
    h('picture', {}, h('source', { srcset: 'img/guardian-powered-white.png', media: '(prefers-color-scheme: dark)' }), h('img', { src: 'img/guardian-powered-black.png', alt: 'Powered by The Guardian', width: 140, height: 45 })),
  );
}

// 一页的架子: 先画存着的, 再去拿新的; 拿来的跟画着的不一样才重画 (停在原来的地方)
function newsPage(cls, draw, { maxAge } = {}) {
  const box = h('section', { class: `news-page ${cls}`, 'aria-live': 'polite' }, h('p', { class: 'muted news-wait' }, '正在拿新闻……'));
  let shown = null; // 画着的是哪一份 (data.at)
  let shownStale = null;
  const paint = (rec) => {
    const y = window.scrollY;
    const first = shown === null;
    fill(box, draw(rec, { refresh }));
    if (!first) window.scrollTo(0, y);
    shown = rec.data.at;
    shownStale = rec.stale;
  };
  const refresh = (force = false) =>
    loadIndex({ force, maxAge }).then((rec) => {
      if (!box.isConnected && shown !== null) return;
      if (!rec.data) return shown === null && fill(box, offline(() => refresh(true)));
      const same = shown === rec.data.at;
      if (!same || rec.stale !== shownStale) paint(rec);
      if (force === true) toast(rec.stale ? '没连上网，还是上次的新闻' : same ? '已经是最新的了' : '新闻更新好了');
    });
  cachedIndex().then((rec) => {
    if (rec && shown === null) paint({ ...rec, stale: false });
    refresh();
  });
  return { box, refresh };
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
function picture(src, { alt = '', cls = '' } = {}) {
  if (!src) return null;
  return h('img', { class: cls, src, alt, loading: 'lazy', decoding: 'async', referrerpolicy: 'no-referrer', onerror: (e) => (e.target.closest('.news-thumb, .news-lead-pic, .news-card-pic') ?? e.target).remove() });
}

const srcName = (data, x) => data.sources[x.src]?.name ?? x.src;
const tag = (data, x, { time = true } = {}) => h('span', { class: 'news-tag' }, srcName(data, x), x.sec ? ` · ${x.sec}` : '', time ? h('span', { class: 'news-time' }, ` · ${agoText(x.at)}`) : null);
// 只有标题的: 在新的网页里打开原网站
const linkProps = (x, cls) => (x.full ? { class: cls, href: itemHref(x) } : { class: `${cls} external`, href: itemHref(x), target: '_blank', rel: 'noopener' });
const outMark = (x) => (x.full ? null : h('span', { class: 'news-out', 'aria-label': '（打开原网站）' }, ' ↗'));

function row(data, x) {
  return h(
    'li',
    {},
    h('a', linkProps(x, 'news-row'), h('span', { class: 'news-row-text' }, tag(data, x), h('strong', { class: 'news-row-title' }, x.t, outMark(x)), x.s ? h('span', { class: 'news-row-sum' }, x.s) : null), x.img ? h('span', { class: 'news-thumb' }, picture(x.img.src)) : null),
  );
}

function lead(data, x) {
  return h('a', linkProps(x, 'news-lead'), h('span', { class: 'news-lead-pic' }, picture(x.img.src, { alt: x.t })), h('span', { class: 'news-lead-text' }, tag(data, x), h('strong', { class: 'news-lead-title' }, x.t), x.s ? h('span', { class: 'news-lead-sum' }, x.s) : null));
}

function card(data, x) {
  return h('a', linkProps(x, 'news-card'), h('span', { class: 'news-card-pic' }, picture(x.img.src)), tag(data, x), h('strong', { class: 'news-card-title' }, x.t));
}

function head(data, rec, refresh, lang) {
  return [
    h(
      'div',
      { class: 'page-head news-head' },
      h('h1', {}, '新闻'),
      h(
        'span',
        { class: 'news-head-tools' },
        h('a', { class: 'btn small news-live-btn', href: liveHref(lang) }, '快讯'),
        h('span', { class: 'news-updated muted small' }, `${agoText(data.at)}更新`),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': '看看有没有新的', title: '看看有没有新的', onclick: () => refresh(true) }, icon('refresh', 18)),
      ),
    ),
    rec.stale ? h('p', { class: 'news-stale' }, `没连上网，这是上次拿到的新闻（${agoText(data.at)}更新）。`) : null,
  ];
}

// 中文 | English
const langTabs = (lang, href) => h('nav', { class: 'news-langs', 'aria-label': '语言' }, Object.entries(LANGS).map(([k, name]) => h('a', { class: `news-lang${k === lang ? ' on' : ''}`, href: href(k), 'aria-current': k === lang ? 'page' : null }, name)));

// 页面最下面: 各家的出处、授权
function sourceNote(data, lang) {
  const list = Object.entries(data.sources).filter(([, s]) => s.lang === lang);
  return h(
    'footer',
    { class: 'news-source muted small' },
    h('p', {}, '新闻每 15 分钟更新一次。', lang === 'zh' ? '美国之音、自由亚洲电台的文章在温故里读全文；中新网只有标题和摘要，点了去中新网看。' : '卫报、NASA 的文章在温故里读全文（卫报的文章只留 24 小时，仅供个人、非商业阅读）；BBC、NPR 只有标题和摘要，点了去原网站看。'),
    h(
      'p',
      {},
      list.map(([, s], i) => [i ? ' · ' : '', ext(s.home, s.name)]),
    ),
  );
}

// ---- 新闻首页 (一种语言) ----
export function renderNews(ctx, lang = 'zh') {
  let only = null; // 只看一家
  const { box } = newsPage('news-home', ({ data, ...rec }, { refresh }) => {
    const all = itemsFor(data, lang);
    const srcs = sourcesFor(data, lang);
    if (only && !srcs.some((s) => s.id === only)) only = null;
    const today = localDay(new Date().toISOString());
    const chips = () =>
      h(
        'nav',
        { class: 'news-secs', 'aria-label': '来源' },
        [{ id: null, name: '全部', n: all.length }, ...srcs].map((s) =>
          h(
            'button',
            {
              class: `chip${only === s.id ? ' on' : ''}`,
              type: 'button',
              'aria-pressed': String(only === s.id),
              onclick: () => {
                only = s.id;
                fill(box, draw());
              },
            },
            s.name,
            h('span', { class: 'news-n' }, ` ${s.n}`),
          ),
        ),
      );
    const draw = () => {
      const items = only ? all.filter((x) => x.src === only) : all;
      const { lead: top, cards, rest } = frontPage(items);
      return [
        head(data, rec, refresh, lang),
        langTabs(lang, langHref),
        chips(),
        // 卫报的标志放在卫报的内容旁边 (英文页的最上面)
        lang === 'en' && srcs.some((s) => s.id === 'guardian') && (!only || only === 'guardian') ? h('p', { class: 'news-gu-note muted small' }, guardianLogo(), '卫报的文章来自卫报开放平台，只留 24 小时，仅供个人、非商业阅读。') : null,
        top ? h('section', { class: 'news-top', 'aria-label': '头条' }, lead(data, top), cards.length ? h('div', { class: 'news-cards' }, cards.map((x) => card(data, x))) : null) : null,
        byDay(rest).map((d) => [h('div', { class: 'list-head' }, h('h2', {}, dayLabel(d.day, today)), h('span', { class: 'muted small' }, `${d.items.length} 条`)), h('ul', { class: 'news-list' }, d.items.map((x) => row(data, x)))]),
        items.length ? null : h('p', { class: 'muted' }, '现在没有新闻。'),
        sourceNote(data, lang),
      ];
    };
    return draw();
  });
  return { title: lang === 'en' ? 'English · 新闻' : '新闻', el: box };
}

// ---- 快讯 ----
export function renderLive(ctx, lang = 'zh') {
  const seen = lastSeen(); // 上次看到哪: 之后来的标「新」
  let newest = '';
  const column = (data, l) => {
    const items = liveItems(data, l);
    const today = localDay(new Date().toISOString());
    const hasGuardian = items.some((x) => x.src === 'guardian');
    return h(
      'section',
      { class: `news-live-col${l === lang ? ' on' : ''}`, 'aria-label': LANGS[l] },
      h('h2', { class: 'news-live-head' }, LANGS[l], h('span', { class: 'muted small' }, ` ${items.length} 条`)),
      hasGuardian ? h('p', { class: 'news-gu-note muted small' }, guardianLogo()) : null,
      items.length
        ? byDay(items).map((d) => [
            h('h3', { class: 'news-live-day' }, dayLabel(d.day, today)),
            h(
              'ul',
              { class: 'news-live-list' },
              d.items.map((x) => {
                if (x.at > newest) newest = x.at;
                const fresh = seen && x.at > seen;
                return h('li', { class: fresh ? 'fresh' : null }, h('a', linkProps(x, 'news-live-row'), h('time', { class: 'news-live-time', datetime: x.at }, clock(x.at)), h('span', { class: 'news-live-src' }, srcName(data, x)), h('span', { class: 'news-live-title' }, fresh ? h('span', { class: 'news-new' }, '新') : null, x.t, outMark(x))));
              }),
            ),
          ])
        : h('p', { class: 'muted' }, '24 小时内没有新闻。'),
    );
  };
  const page = newsPage(
    'news-live',
    ({ data, ...rec }, { refresh }) => {
      newest = '';
      const cols = [column(data, 'zh'), column(data, 'en')];
      markSeen(newest);
      return [
        h('a', { class: 'back', href: langHref(lang) }, '← 新闻'),
        h(
          'div',
          { class: 'page-head news-head' },
          h('h1', {}, '快讯'),
          h(
            'span',
            { class: 'news-head-tools' },
            h('span', { class: 'news-updated muted small' }, `每 15 分钟更新 · ${agoText(data.at)}更新`),
            h('button', { class: 'icon-btn', type: 'button', 'aria-label': '看看有没有新的', title: '看看有没有新的', onclick: () => refresh(true) }, icon('refresh', 18)),
          ),
        ),
        rec.stale ? h('p', { class: 'news-stale' }, `没连上网，这是上次拿到的快讯（${agoText(data.at)}更新）。`) : null,
        // 手机上一次看一栏
        langTabs(lang, liveHref),
        h('div', { class: 'news-live-cols' }, cols),
        h('p', { class: 'news-source muted small' }, '24 小时内各家的新闻标题，新的在上面。美国之音、自由亚洲电台、卫报、NASA 的在温故里读全文，带 ↗ 的打开原网站。'),
      ];
    },
    { maxAge: LIVE_REFRESH_MS - 10000 },
  );
  // 开着时几分钟自己刷新一次
  const timer = setInterval(() => page.box.isConnected && page.refresh(), LIVE_REFRESH_MS);
  return { title: '快讯', el: page.box, cleanup: () => clearInterval(timer) };
}

// ---- 一篇全文 ----

// 段落里的一段段: 字 (换行照留)、链接、粗体、斜体
function inline(parts) {
  return (parts ?? []).map((x) => {
    if (typeof x === 'string') return x.split('\n').flatMap((line, i) => (i ? [h('br'), line] : [line]));
    if (x.a) return ext(x.a, x.t);
    if (x.b) return h('strong', {}, x.b);
    if (x.i) return h('em', {}, x.i);
    return null;
  });
}

function bodyBlocks(body, url) {
  return (body ?? []).map((b, i) => {
    if (b.p) return h('p', { 'data-k': i }, inline(b.p));
    if (b.h) return h('h2', { 'data-k': i }, b.h);
    if (b.li) return h(b.o ? 'ol' : 'ul', { 'data-k': i }, b.li.map((li) => h('li', {}, inline(li))));
    if (b.q) return h('blockquote', { 'data-k': i }, inline(b.q));
    if (b.img) return h('figure', { class: 'news-pic' }, picture(b.img.src, { alt: b.img.cap ?? '' }), b.img.cap ? h('figcaption', { class: 'news-credit' }, b.img.cap) : null);
    if (b.more) return h('p', { class: 'news-more muted' }, '（这里有视频或互动内容，', ext(url, '到原网站看'), '）');
    return null;
  });
}

// 朗读: 按钮在标题下面; 念到的那段变色, 看不见了就滚过去; 念的时候屏幕下面浮着「停止朗读」
function speaker(article, parts, lang) {
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
    const ok = speakLines(parts(), lang === 'en' ? 'en-US' : 'zh-CN', {
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

export function renderArticle(ctx, id) {
  const box = h('section', { class: 'news-page news-story', 'aria-live': 'polite' }, h('p', { class: 'muted news-wait' }, '正在拿这篇文章……'));
  const back = (lang) => h('a', { class: 'back', href: langHref(lang) }, '← 新闻');
  Promise.all([cachedIndex().then((rec) => rec ?? loadIndex()), loadArticle(id)]).then(([rec, a]) => {
    if (!box.isConnected) return;
    const data = rec?.data ?? null;
    const x = itemOf(data, id);
    const lang = x?.lang ?? (a?.src && data?.sources[a.src]?.lang) ?? 'zh';
    if (!a) {
      // 卫报过了 24 小时、新闻已经撤下来、断网又没存着
      return fill(
        box,
        back(lang),
        h('h1', {}, x?.t ?? '看不到这篇文章'),
        h('p', { class: 'muted' }, x?.src === 'guardian' ? '卫报的文章按卫报的规定只留 24 小时，这篇已经撤下来了。' : '这篇文章可能已经撤下来了，或者现在没连上网（打开过的文章断网也能看）。'),
        x?.u ? h('p', {}, ext(x.u, `到${srcName(data, x)}网站看原文 ↗`)) : null,
      );
    }
    const s = data?.sources[a.src] ?? { name: a.src, note: '' };
    document.title = `${a.t} · 温故`;
    const article = h(
      'article',
      { class: 'news-article', lang: lang === 'en' ? 'en' : 'zh-CN' },
      h('p', { class: 'news-meta' }, h('span', { class: 'news-tag' }, s.name, a.sec ? ` · ${a.sec}` : ''), h('span', { class: 'muted' }, ` · ${dayLabel(localDay(a.at))} ${clock(a.at)}`)),
      h('h1', { 'data-k': 'title' }, a.t),
      // 作者 (RFA 写的是「记者：……」这样, 自己带着身份的不再加「作者：」)
      a.by ? h('p', { class: 'news-by muted' }, /[：:]/.test(a.by) || /^by\s/i.test(a.by) ? a.by : lang === 'en' ? `By ${a.by}` : `作者：${a.by}`) : null,
      // 卫报: 标志放在文章旁边, 链到这篇的原文; RFA: 署名要醒目, 放在最上面
      a.src === 'guardian' ? h('p', { class: 'news-gu-note' }, guardianLogo(a.u)) : null,
      a.src === 'rfa' && s.note ? h('p', { class: 'news-credit-box' }, s.note) : null,
      // 卫报标了「法律敏感」的 (多是英国正在审的案子)
      a.legal ? h('p', { class: 'news-legal' }, '这篇涉及正在进行的诉讼，内容可能会被修改。') : null,
      a.lede?.length ? h('p', { class: 'news-lede', 'data-k': 'lede' }, inline(a.lede)) : null,
    );
    const { button, bar } = speaker(article, () => spokenParts(a), lang);
    article.append(
      ...[
        button ? h('div', { class: 'news-tools' }, button) : null,
        a.img ? h('figure', { class: 'news-pic' }, picture(a.img.src, { alt: a.t }), a.img.cap ? h('figcaption', { class: 'news-credit' }, a.img.cap) : null) : null,
        ...bodyBlocks(a.body, a.u),
        h('p', { class: 'news-original' }, ext(a.u, `在${s.name}网站上看原文 ↗`)),
        s.note ? h('p', { class: 'news-credit-box muted small' }, s.note) : null,
      ].filter(Boolean),
    );
    fill(box, back(lang), article, bar);
  });
  return { title: '新闻', el: box, cleanup: () => stopSpeaking() };
}
