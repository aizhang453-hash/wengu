// 新闻 (v1.74, v1.75 重新排过): 像新闻网站那样的几页 (新闻从哪来、怎么存见 ../news.js)
//   #/news          中文 (#/news/en 英文): 最上面一个大方块「快讯」(24 小时内各家的标题, 点了去原网站),
//                   下面「长文章」(美国之音、自由亚洲电台 / 卫报、NASA, 在温故里读全文); 开着时几分钟自己刷新一次
//                   (v1.74 的 #/news/live 快讯页去掉了, 那个网址现在也打开这一页)
//   #/news/a/<编号> 一篇全文: 标题、作者、图、正文、原文链接、出处; 可以朗读
// 用户要页面简洁 (v1.75): 不写「在温故里读全文」「点了去原网站看」这种说明, 快讯、长文章都不按来源分
// 卫报的规定: 放卫报内容的页面上要有「Powered by The Guardian」标志 (链到卫报), 放在卫报的内容旁边 (长文章的标题旁边)

import { h, fill, icon, toast } from '../dom.js';
import { loadIndex, cachedIndex, loadArticle, LANGS, liveItems, longItems, localDay, clock, dayLabel, agoText, itemHref, langHref, itemOf, spokenParts } from '../news.js';
import { canSpeak, speakLines, stopSpeaking } from '../speech.js';

const REFRESH_MS = 3 * 60 * 1000; // 新闻页开着时多久刷新一次

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
  return h('div', { class: 'empty' }, h('h1', {}, '新闻'), h('p', {}, '还没拿到新闻，连上网再试一次。'), h('button', { class: 'btn primary', type: 'button', onclick: retry }, '再试一次'));
}

// 图: 拿不到 (断网) 就不占地方
function picture(src, { alt = '' } = {}) {
  if (!src) return null;
  return h('img', { src, alt, loading: 'lazy', decoding: 'async', referrerpolicy: 'no-referrer', onerror: (e) => (e.target.closest('.news-pic-box') ?? e.target).remove() });
}

const srcName = (data, x) => data.sources[x.src]?.name ?? x.src;
const meta = (data, x) => h('span', { class: 'news-meta-line' }, h('span', { class: 'news-src' }, srcName(data, x)), ` · ${agoText(x.at)}`);

// 中文 | English
const langTabs = (lang, href) => h('nav', { class: 'news-langs', 'aria-label': '语言' }, Object.entries(LANGS).map(([k, name]) => h('a', { class: `news-lang${k === lang ? ' on' : ''}`, href: href(k), 'aria-current': k === lang ? 'page' : null }, name)));

// 最上面: 标题、中文 | English、几分钟前更新、刷新
function head(title, data, rec, refresh, lang, href) {
  return [
    h(
      'div',
      { class: 'news-head' },
      h('h1', {}, title),
      langTabs(lang, href),
      h(
        'span',
        { class: 'news-head-tools' },
        h('span', { class: 'news-updated muted small' }, `${agoText(data.at)}更新`),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': '刷新', title: '刷新', onclick: () => refresh(true) }, icon('refresh', 18)),
      ),
    ),
    rec.stale ? h('p', { class: 'news-stale' }, '没连上网，这是上次的新闻。') : null,
  ];
}

// 快讯的一条: 时间、哪家、标题 (在新的网页里打开原网站)
function liveRow(data, x) {
  return h('li', {}, h('a', { class: 'news-live-row', href: itemHref(x), target: '_blank', rel: 'noopener' }, h('time', { class: 'news-live-time', datetime: x.at }, clock(x.at)), h('span', { class: 'news-live-text' }, h('span', { class: 'news-src' }, srcName(data, x)), h('span', { class: 'news-live-title' }, x.t))));
}

// 长文章: 第一篇大一点 (有摘要、大图), 其余一行一篇 (右边小图)
function longRow(data, x, big = false) {
  return h(
    'li',
    { class: big ? 'news-long-lead' : null },
    h('a', { class: 'news-long-row', href: itemHref(x) }, h('span', { class: 'news-long-text' }, meta(data, x), h('strong', { class: 'news-long-title' }, x.t), big && x.s ? h('span', { class: 'news-long-sum' }, x.s) : null), x.img ? h('span', { class: 'news-pic-box' }, picture(x.img.src, { alt: big ? x.t : '' })) : null),
  );
}

// ---- 新闻 (一种语言) ----
// 快讯方块: 24 小时内各家的标题全列出来, 新的在上面, 不分来源 (用户 v1.75 说的); 方块里面上下翻, 不把长文章挤到老远
export function renderNews(ctx, lang = 'zh') {
  const page = newsPage(
    'news-home',
    ({ data, ...rec }, { refresh }) => {
      const live = liveItems(data, lang);
      const longs = longItems(data, lang);
      // 第一篇: 最新的有图的那篇放最上面
      const leadAt = Math.max(0, longs.findIndex((x) => x.img));
      const ordered = longs.length ? [longs[leadAt], ...longs.filter((_, i) => i !== leadAt)] : [];
      return [
        head('新闻', data, rec, refresh, lang, langHref),
        h('section', { class: 'news-flash', 'aria-label': '快讯' }, h('h2', { class: 'news-flash-head' }, '快讯'), live.length ? h('ul', { class: 'news-live-list news-flash-list' }, live.map((x) => liveRow(data, x))) : h('p', { class: 'muted' }, '24 小时内没有快讯。')),
        ordered.length
          ? h(
              'section',
              { class: 'news-long', 'aria-label': '长文章' },
              h('div', { class: 'news-long-head' }, h('h2', {}, '长文章'), longs.some((x) => x.src === 'guardian') ? guardianLogo() : null),
              h(
                'ul',
                { class: 'news-long-list' },
                ordered.map((x, i) => longRow(data, x, i === 0)),
              ),
            )
          : null,
      ];
    },
    { maxAge: REFRESH_MS - 10000 },
  );
  // 开着时几分钟自己刷新一次
  const timer = setInterval(() => page.box.isConnected && page.refresh(), REFRESH_MS);
  return { title: lang === 'en' ? 'English · 新闻' : '新闻', el: page.box, cleanup: () => clearInterval(timer) };
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
        h('p', { class: 'muted' }, x?.src === 'guardian' ? '这篇已经撤下来了。' : '这篇可能已经撤下来了，或者没连上网。'),
        x?.u ? h('p', {}, ext(x.u, `到${srcName(data, x)}网站看原文`)) : null,
      );
    }
    const s = data?.sources[a.src] ?? { name: a.src, note: '' };
    document.title = `${a.t} · 温故`;
    const article = h(
      'article',
      { class: 'news-article', lang: lang === 'en' ? 'en' : 'zh-CN' },
      h('p', { class: 'news-meta' }, h('span', { class: 'news-src' }, s.name, a.sec ? ` · ${a.sec}` : ''), h('span', { class: 'muted' }, ` · ${dayLabel(localDay(a.at))} ${clock(a.at)}`)),
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
        h('p', { class: 'news-original' }, ext(a.u, `在${s.name}网站上看原文`)),
        s.note ? h('p', { class: 'news-credit-box muted small' }, s.note) : null,
      ].filter(Boolean),
    );
    fill(box, back(lang), article, bar);
  });
  return { title: '新闻', el: box, cleanup: () => stopSpeaking() };
}
