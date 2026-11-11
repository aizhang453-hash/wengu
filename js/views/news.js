// 新闻 (v1.74, v1.75 重新排过): 像新闻网站那样的几页 (新闻从哪来、怎么存见 ../news.js)
//   #/news          中文 (#/news/en 英文): 最上面一个大方块「快讯」(24 小时内各家的标题, 点了去原网站),
//                   下面「报道」(美国之音、自由亚洲电台 / 卫报、NASA, 在温故里读全文); 开着时几分钟自己刷新一次
//                   (v1.74 的 #/news/live 快讯页去掉了, 那个网址现在也打开这一页)
//   #/news/a/<编号> 一篇全文: 标题、作者、图、正文、原文链接、出处; 可以朗读
// 用户要页面简洁 (v1.75): 不写「在温故里读全文」「点了去原网站看」这种说明, 快讯、报道都不按来源分
// v1.81: 「长文章」改叫「报道」(用户说怪, 选的; 跟「快讯」配对)
// 卫报的规定: 放卫报内容的页面上要有「Powered by The Guardian」标志 (链到卫报), 放在卫报的内容旁边 (报道的标题旁边)
// v1.81 (用户拿报纸、新闻网站比了以后挑的): 报头像报纸头版 (「邸报」居中, 两条线夹着日期、农历、天气);
//   报道下面「今日一图」「历史上的今天」(维基百科, 见 tools/news.mjs 的 wikiDays); 评论文章标「评论」; 点过的变灰;
//   文章页能调字号; 英文文章点一个词看中文意思、加进卡片 (wordpop.js)

import { h, fill, icon, toast, openDialog } from '../dom.js';
import { loadConfig } from '../sync.js';
import { loadIndex, cachedIndex, loadArticle, LANGS, brokenMinutes, ownsSite, ACTIONS_URL, liveItems, longItems, localDay, clock, dayLabel, agoText, itemHref, langHref, itemOf, spokenParts, seenIds, markSeen, todayOf } from '../news.js';
import { lunarText, solarTermOn } from '../lunar.js';
import { wordLookup } from './wordpop.js';
import { canSpeak, speakLines, stopSpeaking } from '../speech.js';
import { savedPlace, savePlace, loadWeather, loadWorld, locate, searchPlaces, weatherLine, weatherText, windText, uvText, aqiText, moonPhase, lifeTips } from '../weather.js';
import { dayIndex, TRIES } from '../wordle.js';

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
  return h('div', { class: 'empty' }, h('h1', {}, '邸报'), h('p', {}, '还没拿到新闻，连上网再试一次。'), h('button', { class: 'btn primary', type: 'button', onclick: retry }, '再试一次'));
}

// 图: 拿不到 (断网) 就不占地方
function picture(src, { alt = '' } = {}) {
  if (!src) return null;
  return h('img', { src, alt, loading: 'lazy', decoding: 'async', referrerpolicy: 'no-referrer', onerror: (e) => (e.target.closest('.news-pic-box') ?? e.target).remove() });
}

const srcName = (data, x) => data.sources[x.src]?.name ?? x.src;
// 来源有说明的 (Global Voices: 志愿者撰稿, v1.81) 台名后面跟一个灰色小字
const srcTag = (s) => (s?.tag ? h('span', { class: 'news-src-tag' }, s.tag) : null);
const meta = (data, x) => h('span', { class: 'news-meta-line' }, h('span', { class: 'news-src' }, srcName(data, x)), srcTag(data.sources[x.src]), x.op ? h('span', { class: 'news-op' }, '评论') : null, ` · ${agoText(x.at)}`);

// 中文 | English
const langTabs = (lang, href) => h('nav', { class: 'news-langs', 'aria-label': '语言' }, Object.entries(LANGS).map(([k, name]) => h('a', { class: `news-lang${k === lang ? ' on' : ''}`, href: href(k), 'aria-current': k === lang ? 'page' : null }, name)));

// 报头 (v1.81, 像报纸头版): 上面一行 中文 | English、几分钟前更新、刷新; 「邸报」两个大字居中;
// 下面两条线夹着日期、农历 (节气那天写上节气)、天气
function masthead(data, rec, refresh, lang, href, weather = null) {
  const now = new Date();
  const day = localDay(now.toISOString());
  const lunar = lunarText(day);
  const term = solarTermOn(day);
  return [
    h(
      'header',
      { class: 'news-mast' },
      h(
        'div',
        { class: 'news-mast-top' },
        langTabs(lang, href),
        h('span', { class: 'news-head-tools' }, h('span', { class: 'news-updated muted small' }, `${agoText(data.at)}更新`), h('button', { class: 'icon-btn', type: 'button', 'aria-label': '刷新', title: '刷新', onclick: () => refresh(true) }, icon('refresh', 18))),
      ),
      h('h1', { class: 'news-mast-title' }, '邸报'),
      h(
        'div',
        { class: 'news-mast-line' },
        h('span', { class: 'news-mast-date' }, h('span', {}, `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日 星期${WEEK[now.getDay()]}`), lunar ? h('span', {}, `农历${lunar}`) : null, term ? h('span', { class: 'news-mast-term' }, term) : null),
        weather,
      ),
    ),
    rec.stale ? h('p', { class: 'news-stale' }, '没连上网，这是上次的新闻。') : null,
    brokenNote(data, rec),
  ];
}

// 自动更新断了 (一个小时没有新的): 只提醒网站的主人, 给去 GitHub 接上的链接
function brokenNote(data, rec) {
  const min = rec.stale ? 0 : brokenMinutes(data);
  if (!min || !ownsSite(loadConfig())) return null;
  return h('p', { class: 'news-broken' }, `新闻已经 ${min < 120 ? `${min} 分钟` : `${Math.floor(min / 60)} 小时`}没更新了，自动更新可能断了。`, ext(ACTIONS_URL, '去 GitHub 点「Run workflow」接上'));
}

// 评论文章 (v1.81): 台名后面一个「评论」
const opTag = (x) => (x.op ? h('span', { class: 'news-op' }, '评论') : null);
// 点过的 (v1.81): 记下来, 马上变灰
const seenClick = (x) => (e) => {
  markSeen(x.id);
  e.currentTarget.classList.add('seen');
};

// 快讯的一条: 时间、哪家、标题 (在新的网页里打开原网站)
function liveRow(data, x, seen) {
  return h(
    'li',
    {},
    h('a', { class: `news-live-row${seen.has(x.id) ? ' seen' : ''}`, href: itemHref(x), target: '_blank', rel: 'noopener', onclick: seenClick(x) }, h('time', { class: 'news-live-time', datetime: x.at }, clock(x.at)), h('span', { class: 'news-live-text' }, h('span', { class: 'news-live-src' }, h('span', { class: 'news-src' }, srcName(data, x)), opTag(x)), h('span', { class: 'news-live-title' }, x.t))),
  );
}

// 报道: 第一篇大一点 (有摘要、大图), 其余一行一篇 (右边小图)
function longRow(data, x, big, seen) {
  return h(
    'li',
    { class: big ? 'news-long-lead' : null },
    h('a', { class: `news-long-row${seen.has(x.id) ? ' seen' : ''}`, href: itemHref(x), onclick: seenClick(x) }, h('span', { class: 'news-long-text' }, meta(data, x), h('strong', { class: 'news-long-title' }, x.t), big && x.s ? h('span', { class: 'news-long-sum' }, x.s) : null), x.img ? h('span', { class: 'news-pic-box' }, picture(x.img.src, { alt: big ? x.t : '' })) : null),
  );
}

// ---- 天气 (v1.76): 邸报页右上角一小块; 先自动定位, 不给位置就自己填城市 ----
// v1.80: 邸报页上还有一块「天气栏」(weatherBox), 照报纸的天气版; 两个一起拿、一起更新
const round = (x) => Math.round(Number(x));
const WEEK = '日一二三四五六';
const dayName = (iso, i) => {
  const [y, m, d] = String(iso).split('-').map(Number);
  if (!y) return '';
  return `${i === 0 ? '明天' : `周${WEEK[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]}`} ${d}日`;
};
const md = (date) => `${date.getMonth() + 1}月${date.getDate()}日`;

function weatherBoxBody(place, w, world, change) {
  if (!place) return [h('div', { class: 'wx-head' }, h('h2', {}, '天气')), h('button', { class: 'btn small', type: 'button', onclick: change }, '填城市看天气')];
  if (!w) return [h('div', { class: 'wx-head' }, h('h2', {}, '天气'), h('button', { class: 'link-btn', type: 'button', onclick: change }, `${place.name} · 换城市`)), h('p', { class: 'muted' }, '天气拿不到，等一下再看。')];
  const t = w.today ?? {};
  const moon = moonPhase();
  const fact = (k, v) => (v ? h('div', {}, h('dt', {}, k), h('dd', {}, v)) : null);
  const tips = lifeTips(t);
  return [
    h('div', { class: 'wx-head' }, h('h2', {}, '天气'), h('button', { class: 'link-btn', type: 'button', onclick: change }, `${place.name} · 换城市`)),
    h(
      'div',
      { class: 'wx-main' },
      h(
        'div',
        { class: 'wx-today' },
        h('div', { class: 'wx-now' }, h('span', { class: 'wx-temp' }, `${round(w.now.t)}°`), h('span', { class: 'wx-now-text' }, h('strong', {}, weatherText(w.now.code) || weatherText(t.code)), h('span', { class: 'muted' }, [w.now.feels !== null && w.now.feels !== undefined ? `体感 ${round(w.now.feels)}°` : '', `今天 ${round(t.min)}° ～ ${round(t.max)}°`].filter(Boolean).join(' · ')))),
        h(
          'dl',
          { class: 'wx-facts' },
          fact('降水概率', t.rain !== null && t.rain !== undefined ? `${round(t.rain)}%` : ''),
          fact('风', windText(w.now.wind, w.now.windDir)),
          fact('湿度', w.now.humidity !== null && w.now.humidity !== undefined ? `${round(w.now.humidity)}%` : ''),
          fact('紫外线', t.uv !== null && t.uv !== undefined ? `${uvText(t.uv)}（${round(t.uv)}）` : ''),
          fact('空气', w.air ? `${aqiText(w.air.aqi)}（AQI ${w.air.aqi}${w.air.pm25 !== null ? `，PM2.5 ${round(w.air.pm25)}` : ''}）` : ''),
          fact('日出 · 日落', t.sunrise && t.sunset ? `${t.sunrise} · ${t.sunset}` : ''),
          fact('月相', `${moon.name} · ${md(moon.nextFull)}满月`),
          fact('昨天', w.yesterday ? `${round(w.yesterday.min)}° ～ ${round(w.yesterday.max)}°` : ''),
        ),
        tips.length ? h('p', { class: 'wx-tips' }, tips.map(([k, v]) => h('span', {}, h('b', {}, k), v))) : null,
      ),
      w.days?.length
        ? h(
            'ol',
            { class: 'wx-days', 'aria-label': '未来几天' },
            w.days.map((d, i) => h('li', {}, h('span', { class: 'wx-day' }, dayName(d.date, i)), h('span', { class: 'wx-day-text' }, weatherText(d.code)), h('span', { class: 'wx-day-temp' }, `${round(d.min)}° ～ ${round(d.max)}°`), h('span', { class: 'wx-day-rain muted' }, d.rain !== null && d.rain !== undefined ? `${round(d.rain)}%` : ''))),
          )
        : null,
    ),
    world?.length ? h('div', { class: 'wx-world' }, h('h3', {}, '世界各地'), h('ul', {}, world.map((c) => h('li', {}, h('span', { class: 'wx-city' }, c.name), h('span', { class: 'muted' }, weatherText(c.code)), h('span', {}, `${round(c.min)}° ～ ${round(c.max)}°`))))) : null,
  ];
}

function weatherParts() {
  // 先写「天气」: 等定位 (浏览器问要不要给位置的时候) 不是一个空框
  // v1.80.1: 点它跳到下面的天气栏 (像报纸头版报头旁边的天气, 里面才是完整的); 换城市只在天气栏里
  const box = h('section', { class: 'wx', 'aria-label': '天气' });
  const el = h('button', { class: 'news-weather', type: 'button', title: '看天气栏', onclick: () => box.scrollIntoView({ behavior: 'smooth', block: 'start' }) }, icon('cloud', 16), ' 天气');
  const show = (place, w, world) => {
    fill(el, icon(w && w.now.code <= 1 ? 'sun' : 'cloud', 16), ' ', place && w ? weatherLine(place, w) : place ? `${place.name} 天气拿不到` : '填城市看天气');
    fill(box, weatherBoxBody(place, w, world, () => placeDialog()));
  };
  const update = async (place) => {
    if (!place) return show(null, null, null);
    const [w, world] = await Promise.all([loadWeather(place), loadWorld()]);
    show(place, w, world);
  };
  // 自动定位的: 每次打开再定位一次 (换了地方会跟着变; 定位不了就用上次的地方)
  const start = async () => {
    const place = savedPlace();
    if (place && !place.auto) return update(place);
    try {
      const here = await locate();
      savePlace(here);
      update(here);
    } catch {
      update(place);
    }
  };
  function placeDialog() {
    const input = h('input', { type: 'search', class: 'input', placeholder: '城市名，比如 纽约、上海、London', enterkeyhint: 'search' });
    const list = h('div', { class: 'weather-results' });
    const pick = (place) => {
      savePlace(place);
      dialog.close();
      update(place);
    };
    const search = async () => {
      const q = input.value.trim();
      if (!q) return;
      fill(list, h('p', { class: 'muted' }, '正在找……'));
      try {
        const found = await searchPlaces(q);
        fill(list, found.length ? found.map((p) => h('button', { class: 'weather-place', type: 'button', onclick: () => pick({ name: p.name, lat: p.lat, lon: p.lon, auto: false }) }, h('strong', {}, p.name), p.detail ? h('span', { class: 'muted small' }, ` ${p.detail}`) : null)) : h('p', { class: 'muted' }, '没找到这个地方。'));
      } catch {
        fill(list, h('p', { class: 'muted' }, '没连上网，等一下再试。'));
      }
    };
    // 中文输入法正在选字时的回车不算 (不然拼音还没变成字就去搜了)
    input.addEventListener('keydown', (e) => e.key === 'Enter' && !e.isComposing && (e.preventDefault(), search()));
    const here = h('button', { class: 'btn small', type: 'button', onclick: async () => {
      fill(list, h('p', { class: 'muted' }, '正在定位……'));
      try {
        pick(await locate());
      } catch (e) {
        fill(list, h('p', { class: 'muted' }, e?.code === 1 ? '没有位置权限，可以在上面填城市。' : '定位不了，可以在上面填城市。'));
      }
    } }, '用我现在的位置');
    const place = savedPlace();
    const dialog = openDialog({
      title: '天气',
      // Open-Meteo 的数据是 CC BY 4.0, 要写出处
      body: [place ? h('p', { class: 'muted small' }, `现在是：${place.name}${place.auto ? '（自动定位）' : ''}`) : null, h('div', { class: 'row weather-search' }, input, h('button', { class: 'btn primary small', type: 'button', onclick: search }, '找')), here, list, h('p', { class: 'muted small weather-credit' }, '天气数据：', ext('https://open-meteo.com/', 'Open-Meteo.com'), '　地名：', ext('https://www.openstreetmap.org/copyright', '© OpenStreetMap'))],
    });
    input.focus();
  }
  start();
  return { chip: el, box };
}

// 每日猜词的入口: 今天猜没猜、猜中没有
function dailyWordCard() {
  let state = null;
  try {
    state = JSON.parse(localStorage.getItem('wengu:daily-word') ?? 'null');
  } catch {
    state = null;
  }
  const today = dayIndex();
  const guesses = state?.day === today ? (state.guesses ?? []) : [];
  const d = new Date();
  const status = guesses.length === 0 ? '今天的还没猜' : state.won ? '今天猜中了' : guesses.length >= TRIES ? '今天没猜出来' : `今天猜了 ${guesses.length} 次`;
  return h('a', { class: 'news-word', href: '#/news/word' }, h('span', { class: 'news-word-title' }, '每日猜词'), h('span', { class: 'muted small' }, `${d.getMonth() + 1}月${d.getDate()}日 · ${status}`), h('span', { class: 'news-word-go', 'aria-hidden': 'true' }, '→'));
}

// ---- 今日一图、历史上的今天 (v1.81): 维基百科每天的; 写明作者、许可、来自维基百科 ----
const LICENSES = { 'Public domain': '公有领域' };
function pictureBox(today, lang) {
  const p = today?.pic;
  if (!p?.src) return null;
  const cap = lang === 'en' ? p.en : p.zh;
  const lic = LICENSES[p.lic] ?? p.lic;
  return h(
    'section',
    { class: 'news-potd', 'aria-label': '今日一图' },
    h('h2', {}, '今日一图'),
    h(
      'figure',
      {},
      h('a', { class: 'news-potd-pic', href: p.page, target: '_blank', rel: 'noopener' }, h('img', { src: p.src, alt: cap ?? '', width: p.w, height: p.h, loading: 'lazy', decoding: 'async', referrerpolicy: 'no-referrer', onerror: (e) => e.target.closest('.news-potd')?.remove() })),
      h('figcaption', {}, cap ? h('p', { class: 'news-potd-cap' }, cap) : null, h('p', { class: 'news-credit' }, `图：${p.by ?? '佚名'} · `, p.licUrl ? ext(p.licUrl, lic) : lic, ' · ', ext(p.page, '维基共享资源'))),
    ),
  );
}

const EN_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
function historyBox(today, lang) {
  const list = today?.[lang];
  if (!list?.length) return null;
  const now = new Date();
  const [m, d] = [now.getMonth() + 1, now.getDate()];
  const page = lang === 'en' ? `https://en.wikipedia.org/wiki/${EN_MONTHS[m - 1]}_${d}` : `https://zh.wikipedia.org/wiki/${m}月${d}日`;
  return h(
    'section',
    { class: 'news-otd', 'aria-label': '历史上的今天', lang: lang === 'en' ? 'en' : null },
    h('div', { class: 'news-otd-head' }, h('h2', { lang: 'zh-CN' }, '历史上的今天'), h('span', { class: 'news-credit', lang: 'zh-CN' }, ext(page, '维基百科'), ' · CC BY-SA')),
    h('ul', { class: 'news-otd-list' }, list.map((x) => h('li', {}, h('span', { class: 'news-otd-year' }, x.y < 0 ? `前${-x.y}年` : `${x.y}年`), h('span', {}, x.t)))),
  );
}

// ---- 新闻 (一种语言) ----
// 快讯方块: 24 小时内各家的标题全列出来, 新的在上面, 不分来源 (用户 v1.75 说的); 方块里面上下翻, 不把报道挤到老远
export function renderNews(ctx, lang = 'zh') {
  const weather = weatherParts(); // 一直用同一个 (重画新闻时不重新定位、不重新拿天气)
  const page = newsPage(
    'news-home',
    ({ data, ...rec }, { refresh }) => {
      const live = liveItems(data, lang);
      const longs = longItems(data, lang);
      // 第一篇: 最新的有图的那篇放最上面
      const leadAt = Math.max(0, longs.findIndex((x) => x.img));
      const ordered = longs.length ? [longs[leadAt], ...longs.filter((_, i) => i !== leadAt)] : [];
      const seen = seenIds();
      const today = todayOf(data);
      return [
        masthead(data, rec, refresh, lang, langHref, weather.chip),
        h('section', { class: 'news-flash', 'aria-label': '快讯' }, h('h2', { class: 'news-flash-head' }, '快讯'), live.length ? h('ul', { class: 'news-live-list news-flash-list' }, live.map((x) => liveRow(data, x, seen))) : h('p', { class: 'muted' }, '24 小时内没有快讯。')),
        dailyWordCard(),
        weather.box,
        ordered.length
          ? h(
              'section',
              { class: 'news-long', 'aria-label': '报道' },
              h('div', { class: 'news-long-head' }, h('h2', {}, '报道'), longs.some((x) => x.src === 'guardian') ? guardianLogo() : null),
              h(
                'ul',
                { class: 'news-long-list' },
                ordered.map((x, i) => longRow(data, x, i === 0, seen)),
              ),
            )
          : null,
        pictureBox(today, lang),
        historyBox(today, lang),
      ];
    },
    { maxAge: REFRESH_MS - 10000 },
  );
  // 开着时几分钟自己刷新一次
  const timer = setInterval(() => page.box.isConnected && page.refresh(), REFRESH_MS);
  return { title: lang === 'en' ? 'English · 邸报' : '邸报', el: page.box, cleanup: () => clearInterval(timer) };
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

// 字号 (v1.81): 0 小 1 中 2 大, 这台设备上记着 (跟书斋的分开)
const SIZE_KEY = 'wengu:news-size';
function loadSize() {
  try {
    const n = Number(localStorage.getItem(SIZE_KEY) ?? 1);
    return [0, 1, 2].includes(n) ? n : 1;
  } catch {
    return 1;
  }
}
function sizeButtons(article) {
  let size = loadSize();
  article.classList.add(`size-${size}`);
  const btn = (d, label, name) =>
    h(
      'button',
      {
        class: 'btn small news-size',
        type: 'button',
        'aria-label': name,
        title: name,
        onclick: () => {
          size = Math.max(0, Math.min(2, size + d));
          article.classList.remove('size-0', 'size-1', 'size-2');
          article.classList.add(`size-${size}`);
          try {
            localStorage.setItem(SIZE_KEY, String(size));
          } catch {
            // 存不下就只管这次
          }
        },
      },
      label,
    );
  return [btn(-1, 'A−', '字小一点'), btn(1, 'A+', '字大一点')];
}

export function renderArticle(ctx, id) {
  const box = h('section', { class: 'news-page news-story', 'aria-live': 'polite' }, h('p', { class: 'muted news-wait' }, '正在拿这篇文章……'));
  markSeen(id); // 从别处 (搜索、书签) 打开的也算读过
  let lookup = null;
  const back = (lang) => h('a', { class: 'back', href: langHref(lang) }, '← 邸报');
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
      h('p', { class: 'news-meta' }, h('span', { class: 'news-src' }, s.name, a.sec ? ` · ${a.sec}` : ''), srcTag(s), a.op || x?.op ? h('span', { class: 'news-op' }, '评论') : null, h('span', { class: 'muted' }, ` · ${dayLabel(localDay(a.at))} ${clock(a.at)}`)),
      h('h1', { 'data-k': 'title' }, a.t),
      // 作者 (RFA 写的是「记者：……」这样, 自己带着身份的不再加「作者：」)
      a.by ? h('p', { class: 'news-by muted' }, /[：:]/.test(a.by) || /^by\s/i.test(a.by) ? a.by : lang === 'en' ? `By ${a.by}` : `作者：${a.by}`) : null,
      // 卫报: 标志放在文章旁边, 链到这篇的原文; RFA: 署名要醒目, 放在最上面
      a.src === 'guardian' ? h('p', { class: 'news-gu-note' }, guardianLogo(a.u)) : null,
      (a.src === 'rfa' || a.src === 'rfaen') && s.note ? h('p', { class: 'news-credit-box' }, s.note) : null,
      // 卫报标了「法律敏感」的 (多是英国正在审的案子)
      a.legal ? h('p', { class: 'news-legal' }, '这篇涉及正在进行的诉讼，内容可能会被修改。') : null,
      a.lede?.length ? h('p', { class: 'news-lede', 'data-k': 'lede' }, inline(a.lede)) : null,
    );
    const { button, bar } = speaker(article, () => spokenParts(a), lang);
    article.append(
      ...[
        h('div', { class: 'news-tools' }, button, ...sizeButtons(article)),
        a.img ? h('figure', { class: 'news-pic' }, picture(a.img.src, { alt: a.t }), a.img.cap ? h('figcaption', { class: 'news-credit' }, a.img.cap) : null) : null,
        ...bodyBlocks(a.body, a.u),
        h('p', { class: 'news-original' }, ext(a.u, `在${s.name}网站上看原文`)),
        s.note ? h('p', { class: 'news-credit-box muted small' }, s.note) : null,
      ].filter(Boolean),
    );
    fill(box, back(lang), article, bar);
    // 英文文章: 点一个词看中文意思 (链接、按钮上的不算)
    if (lang === 'en') lookup = wordLookup(article, ctx);
  });
  return {
    title: '邸报',
    el: box,
    cleanup: () => {
      stopSpeaking();
      lookup?.close();
    },
  };
}
