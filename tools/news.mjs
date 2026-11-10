// 新闻 (v1.74): 每 15 分钟从几家新闻来源拿最新的新闻, 写成 news/latest.json (所有新闻的标题、摘要) 和
// news/a/<编号>.json (能放全文的那几家, 一篇一个文件)。温故的「新闻」「快讯」页 (js/views/news.js) 读这些。
// GitHub Actions 跑 (.github/workflows/news.yml), 放到仓库的 news 分支。
//
// 来源和规矩 (2026 年 11 月逐家打开条款原文核对过):
//   全文 (在温故里读整篇):
//     美国之音 VOA 中文  美国政府的作品。条款写明用它的资讯「无需再征得我们的许可」, 要注明出处是美国之音, 引用不能删改;
//                       美联社的照片和稿件除外 → 图的说明写着美联社、路透社、法新社……的不要。RSS 只有摘要, 全文到文章页拿 (robots.txt 允许)
//     自由亚洲电台 RFA   条款允许为个人、非商业、一般资讯和教育用途转载 RFA 自己的内容, 要醒目地写固定的署名 (RFA_CREDIT), 不能改;
//                       图取自法新社这些的不要。RSS 带全文
//     卫报 The Guardian 开放平台 (Open Platform) 的 API, 要密钥 (环境变量 GUARDIAN_API_KEY, 放在 GitHub 的 secret 里)。开发者密钥给全文, 只能非商业;
//                       内容最多留 24 小时 (所以每小时整批重新拿一次, 温故里拿来超过 24 小时的不显示), 原样显示、标题作者都留着、链回原文、
//                       旁边放「Powered by The Guardian」标志; 不许拿去做 AI、文本挖掘 (栏目用卫报自己分的, 不分析文字);
//                       标了「法律敏感」(多是英国正在审的案子, 法庭对报道有限制) 的照放, 页面上写明「这篇涉及正在进行的诉讼, 内容可能会被修改」;
//                       卫报改了、撤了的, 下一次整批重新拿 (最多一小时) 时跟着改、跟着没
//     NASA              美国政府的作品, RSS 带全文
//   只放标题和链接 (点了去原网站): 中新网 (即时新闻、要闻)、BBC、NPR
// 快讯页用所有来源的标题, 留最近 24 小时; 中新网的即时新闻一次只给 30 条 (两个小时左右), 所以跟上次的合起来。
//
// 跑法: node tools/news.mjs            (读上次的 news/, 写新的)
//       node tools/news.mjs --dry      (只打出来看, 不写)
// 要 Node 22 以上 (自带 fetch)。在要走代理的机器上加 NODE_USE_ENV_PROXY=1。没有 GUARDIAN_API_KEY 就不拿卫报
// 写明是谁在拿 (User-Agent): GitHub Actions 里用 NEWS_UA 写上仓库的网址

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

const UA = process.env.NEWS_UA || 'WenguNews/1.0 (personal study app)';
// 两次请求之间等多久 (毫秒); 测试里改成 0
export const options = { gap: 800 };
const KEEP_H = 48; // 只有标题的新闻留多久 (小时; 快讯页只显示 24 小时内的)
const KEEP_FULL_H = 7 * 24; // 能读全文的留一个星期 (RFA 一天才两三篇)
const GUARDIAN_KEEP_H = 24; // 卫报的规定: 最多留 24 小时
const GUARDIAN_EVERY_MIN = 55; // 卫报多久重新拿一次 (每天 500 次的额度, 每小时一次足够)
const VOA_PAGES_PER_RUN = 12; // 每次最多去 VOA 拿几篇文章页 (别催人家)
const SUMMARY_MAX = 140;

export const RFA_CREDIT = 'Copyright © 1998-2023, RFA. Used with the permission of Radio Free Asia, 2025 M St. NW, Suite 300, Washington DC 20036.';

// 来源: full 能放全文; home 原网站; note 写在文章下面的出处
export const SOURCES = {
  voa: { name: '美国之音', lang: 'zh', full: true, home: 'https://www.voachinese.com/', rss: ['https://www.voachinese.com/api/zm_yql-vomx-tpeybti'], note: '来源：美国之音（voanews.com）' },
  rfa: { name: '自由亚洲电台', lang: 'zh', full: true, home: 'https://www.rfa.org/mandarin/', rss: ['https://www.rfa.org/mandarin/rss'], note: RFA_CREDIT },
  cns: { name: '中新网', lang: 'zh', full: false, home: 'https://www.chinanews.com.cn/', rss: ['https://www.chinanews.com.cn/rss/scroll-news.xml', 'https://www.chinanews.com.cn/rss/importnews.xml'] },
  guardian: { name: 'The Guardian', lang: 'en', full: true, home: 'https://www.theguardian.com/', note: '© Guardian News & Media Limited. Powered by The Guardian Open Platform; for personal, non-commercial reading only.' },
  nasa: { name: 'NASA', lang: 'en', full: true, home: 'https://www.nasa.gov/news/', rss: ['https://www.nasa.gov/news-release/feed/'], note: 'Source: NASA (nasa.gov)' },
  bbc: { name: 'BBC News', lang: 'en', full: false, home: 'https://www.bbc.co.uk/news', rss: ['https://feeds.bbci.co.uk/news/rss.xml'] },
  npr: { name: 'NPR', lang: 'en', full: false, home: 'https://www.npr.org/sections/news/', rss: ['https://feeds.npr.org/1001/rss.xml'] },
};

// 通讯社的照片 (VOA、RFA 用了也不许别人转): 图的说明、作者里有这些字的不要
const WIRE = /美联社|美聯社|路透|法新社|欧新社|歐新社|彭博|共同社|韩联社|韓聯社|盖帝|蓋帝|AP Photo|\bAP\b|Associated Press|Reuters|\bAFP\b|Getty|\bEPA\b|Bloomberg|Kyodo|Yonhap/i;
export const wirePhoto = (text) => WIRE.test(String(text ?? ''));

// ---------- 网页 (HTML) 拆成一棵树: { tag, attrs, children }, 字是字符串 ----------

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

export function decode(s) {
  return String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, e) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return n === 160 ? ' ' : String.fromCodePoint(n);
    }
    return ENT[e.toLowerCase()] ?? all;
  });
}

function attrsOf(s) {
  const out = {};
  for (const m of s.matchAll(/([^\s=/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) out[m[1].toLowerCase()] = decode(m[2] ?? m[3] ?? m[4] ?? '');
  return out;
}

export function parseHtml(html) {
  const root = { tag: '#root', attrs: {}, children: [] };
  const stack = [root];
  const re = /<!--[\s\S]*?-->|<!\[CDATA\[([\s\S]*?)\]\]>|<(\/?)([a-zA-Z][\w:-]*)((?:\s+[^\s=>/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?)>|([^<]+)|</g;
  let m;
  while ((m = re.exec(html))) {
    const top = stack[stack.length - 1];
    if (m[0].startsWith('<!--')) continue;
    if (m[1] !== undefined) {
      top.children.push(m[1]);
      continue;
    }
    if (m[6] !== undefined) {
      top.children.push(decode(m[6]));
      continue;
    }
    if (m[0] === '<') {
      top.children.push('<');
      continue;
    }
    const tag = m[3].toLowerCase();
    if (m[2]) {
      for (let i = stack.length - 1; i > 0; i--) {
        if (stack[i].tag === tag) {
          stack.length = i;
          break;
        }
      }
      continue;
    }
    const node = { tag, attrs: attrsOf(m[4]), children: [] };
    top.children.push(node);
    if (tag === 'style' || tag === 'script') {
      const end = html.indexOf(`</${tag}`, re.lastIndex);
      re.lastIndex = end < 0 ? html.length : html.indexOf('>', end) + 1 || html.length;
      continue;
    }
    if (!VOID.has(tag) && !m[5]) stack.push(node);
  }
  return root;
}

const isEl = (c) => typeof c !== 'string';
function* walk(n) {
  yield n;
  for (const c of n.children) if (isEl(c)) yield* walk(c);
}
const hasClass = (n, c) => (n.attrs.class ?? '').split(/\s+/).includes(c);
const find = (n, pred) => {
  for (const x of walk(n)) if (pred(x)) return x;
  return null;
};
const textOf = (n) => n.children.map((c) => (isEl(c) ? (['style', 'script'].includes(c.tag) ? '' : c.tag === 'br' ? '\n' : textOf(c)) : c)).join('');

// 空白并成一个 (换行留着), 中文标点前后不留空格
export function clean(s) {
  return String(s ?? '')
    .replace(/[ \t\r\f\v 　]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{2,}/g, '\n')
    .replace(/ ?([，。、；：！？）」』”》]) ?/g, '$1')
    .trim();
}

export const plain = (html) => clean(textOf(parseHtml(String(html ?? '')))).replace(/\n/g, ' ');
const cut = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

// ---------- 网页 → 温故能安全显示的块 ----------
// 不放网页代码 (温故用 textContent 画, 别人的网页代码不会跑): 段落、小标题、列表、引文、图; 视频、互动这些换成 { more: true }
//   段落 { p: [字, { a: 网址, t: 字 }, { b: 字 }, { i: 字 }] }   小标题 { h: 字 }   列表 { li: [[...], [...]], o: 有序 }   引文 { q: [...] }
//   图 { img: { src, cap } }
// 字一个不改 (卫报、VOA、RFA 都不许改), 只是不要网页代码; dropImage(说明): 不要的图 (通讯社的照片)

const BLOCK = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'blockquote', 'figure', 'img', 'div', 'section', 'article', 'table', 'iframe', 'video', 'audio', 'embed', 'object', 'svg', 'aside', 'header', 'footer', 'nav', 'form', 'picture', 'hr', 'main', 'center', 'dl']);
const EMBED = new Set(['iframe', 'video', 'audio', 'embed', 'object', 'table', 'form']);

function inlineOf(node) {
  const out = [];
  const push = (x) => {
    if (typeof x === 'string' && typeof out[out.length - 1] === 'string') out[out.length - 1] += x;
    else out.push(x);
  };
  const visit = (n) => {
    for (const c of n.children) {
      if (!isEl(c)) {
        push(c);
        continue;
      }
      if (c.tag === 'br') push('\n');
      else if (c.tag === 'a') {
        const t = clean(textOf(c)).replace(/\n/g, ' ');
        const href = c.attrs.href ?? '';
        if (t) push(/^https?:\/\//.test(href) ? { a: href, t } : t);
      } else if (c.tag === 'b' || c.tag === 'strong') {
        const t = clean(textOf(c));
        if (t) push({ b: t });
      } else if (c.tag === 'i' || c.tag === 'em') {
        const t = clean(textOf(c));
        if (t) push({ i: t });
      } else if (!['script', 'style', 'svg', 'img', 'sup'].includes(c.tag)) visit(c);
    }
  };
  visit(node);
  // 头尾的空白去掉, 中间的空白并成一个
  const parts = out.map((x) => (typeof x === 'string' ? x.replace(/[ \t\r\f\v 　]+/g, ' ').replace(/ *\n */g, '\n') : x));
  while (typeof parts[0] === 'string' && !parts[0].trim()) parts.shift();
  while (typeof parts[parts.length - 1] === 'string' && !parts[parts.length - 1].trim()) parts.pop();
  if (typeof parts[0] === 'string') parts[0] = parts[0].replace(/^\s+/, '');
  if (typeof parts[parts.length - 1] === 'string') parts[parts.length - 1] = parts[parts.length - 1].replace(/\s+$/, '');
  return parts.filter((x) => x !== '');
}

function imgOf(node) {
  const img = node.tag === 'img' ? node : find(node, (x) => x.tag === 'img');
  if (!img) return null;
  let src = img.attrs.src || img.attrs['data-src'] || '';
  // srcset 里挑 1000 宽左右的
  const set = (img.attrs.srcset || img.attrs['data-srcset'] || '')
    .split(',')
    .map((s) => s.trim().split(/\s+/))
    .filter((x) => x[0])
    .map(([u, w]) => [u, parseInt(w, 10) || 0])
    .sort((a, b) => Math.abs(a[1] - 1000) - Math.abs(b[1] - 1000));
  if (set[0] && (!src || /^data:/.test(src))) src = set[0][0];
  if (src.startsWith('//')) src = `https:${src}`;
  if (!/^https:\/\//.test(src)) return null;
  const capNode = node.tag === 'figure' ? find(node, (x) => x.tag === 'figcaption') : null;
  const cap = clean(capNode ? textOf(capNode) : img.attrs.alt || '').replace(/\n/g, ' ');
  return { src, ...(cap ? { cap } : {}) };
}

export function blocksFrom(html, { dropImage = () => false } = {}) {
  const root = parseHtml(String(html ?? ''));
  const out = [];
  let pending = null; // 容器里直接放的字 (VOA 的「华盛顿 —」): 并进下一段
  const more = () => {
    if (!out.length || !out[out.length - 1].more) out.push({ more: true });
  };
  const para = (parts) => {
    if (pending) {
      // 「华盛顿 —」这样的开头跟后面的字中间留个空格
      const last = pending[pending.length - 1];
      if (parts.length && typeof last === 'string' && !/\s$/.test(last)) pending = [...pending.slice(0, -1), `${last} `];
      parts = [...pending, ...parts].reduce((a, x) => (typeof x === 'string' && typeof a[a.length - 1] === 'string' ? [...a.slice(0, -1), a[a.length - 1] + x] : [...a, x]), []);
      pending = null;
    }
    if (parts.some((x) => (typeof x === 'string' ? x.trim() : true))) out.push({ p: parts });
  };
  const visit = (n) => {
    for (const c of n.children) {
      if (!isEl(c) || !BLOCK.has(c.tag)) {
        // 段落外面的字、行内的元素: 先攒着
        const parts = inlineOf({ children: [c] });
        if (parts.length) pending = [...(pending ?? []), ...parts];
        continue;
      }
      const t = c.tag;
      if (t === 'p') para(inlineOf(c));
      else if (/^h[1-6]$/.test(t)) {
        const h = clean(textOf(c)).replace(/\n/g, ' ');
        if (h) out.push({ h });
      } else if (t === 'ul' || t === 'ol') {
        const li = c.children.filter((x) => isEl(x) && x.tag === 'li').map(inlineOf).filter((x) => x.length);
        if (li.length) out.push({ li, ...(t === 'ol' ? { o: true } : {}) });
      } else if (t === 'blockquote') {
        const q = inlineOf(c);
        if (q.length) out.push({ q });
      } else if (t === 'figure' || t === 'img' || t === 'picture') {
        if (find(c, (x) => EMBED.has(x.tag))) more();
        else {
          const img = imgOf(c);
          if (img && !dropImage(img.cap ?? '')) out.push({ img });
        }
      } else if (EMBED.has(t)) more();
      else if (['aside', 'nav', 'form', 'header', 'footer', 'svg', 'hr'].includes(t)) continue; // 相关链接、分享按钮这些
      else visit(c); // div、section……
    }
  };
  visit(root);
  if (pending) para([]);
  return out;
}

// 全文的字数 (估计多长)
export const bodyLength = (body) => body.reduce((n, b) => n + (b.p ?? b.q ?? []).reduce((m, x) => m + (typeof x === 'string' ? x.length : (x.t ?? x.b ?? x.i ?? '').length), 0) + (b.h?.length ?? 0), 0);

// ---------- RSS ----------

const xmlText = (s) =>
  decode(
    String(s ?? '')
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, (all, x) => x.replace(/&/g, '&amp;'))
      .trim(),
  );
const tagIn = (x, t) => {
  const m = new RegExp(`<${t}(?:\\s[^>]*)?>([\\s\\S]*?)</${t}>`).exec(x);
  return m ? xmlText(m[1]) : '';
};
const attrIn = (x, t, a) => {
  const m = new RegExp(`<${t}\\s[^>]*${a}="([^"]*)"`).exec(x);
  return m ? decode(m[1]) : '';
};

// RSS → [{ title, link, at, desc (网页), content (网页, 全文), author, image: { src, cap, credit } }]
export function parseRss(xml) {
  return [...String(xml).matchAll(/<item[\s>][\s\S]*?<\/item>/g)].map(([x]) => {
    const at = Date.parse(tagIn(x, 'pubDate') || tagIn(x, 'dc:date'));
    const media = /<media:content\s[^>]*>/.exec(x)?.[0] ?? '';
    const encl = /<enclosure\s[^>]*>/.exec(x)?.[0] ?? '';
    const thumb = /<media:thumbnail\s[^>]*>/.exec(x)?.[0] ?? '';
    const pick = (tag) => (tag && /url="([^"]+)"/.exec(tag)?.[1]) || '';
    let src = decode(pick(media) || (/image/.test(encl) ? pick(encl) : '') || pick(thumb));
    if (src.startsWith('//')) src = `https:${src}`;
    const image = /^https:\/\//.test(src) ? { src, cap: tagIn(x, 'media:description'), credit: tagIn(x, 'media:credit') } : null;
    return {
      title: plain(tagIn(x, 'title')),
      link: tagIn(x, 'link') || tagIn(x, 'guid'),
      at: Number.isFinite(at) ? new Date(at).toISOString() : null,
      desc: tagIn(x, 'description'),
      content: tagIn(x, 'content:encoded'),
      author: plain(tagIn(x, 'dc:creator') || tagIn(x, 'author').replace(/^\S+@\S+\s*\((.*)\)$/, '$1')),
      image,
    };
  });
}

// ---------- 各家 ----------

export function hashId(s) {
  let x = 0x811c9dc5;
  for (const ch of String(s)) {
    x ^= ch.codePointAt(0);
    x = Math.imul(x, 0x01000193) >>> 0;
  }
  return x.toString(36);
}
export const idOf = (src, link) => `${src}-${hashId(String(link).replace(/[?#].*$/, ''))}`;

// RSS 的一条 → 列表里的一条 (还没有全文)
export function itemFrom(src, r) {
  if (!r.title || !r.link || !r.at) return null;
  const s = SOURCES[src];
  const summary = cut(plain(r.desc), SUMMARY_MAX);
  const img = r.image && !(s.full && wirePhoto(`${r.image.cap} ${r.image.credit}`)) ? { src: r.image.src } : null;
  return { id: idOf(src, r.link), src, lang: s.lang, t: r.title, ...(summary && summary !== r.title ? { s: summary } : {}), u: r.link, at: r.at, ...(img ? { img } : {}), ...(r.author ? { by: r.author } : {}) };
}

// VOA 的文章页 → 全文 (正文在 <div class="wsw">, 主图在 cover-media, 说明里写着通讯社的不要)
export function voaArticle(html) {
  const root = parseHtml(html);
  const wsw = find(root, (n) => hasClass(n, 'wsw'));
  if (!wsw) return null;
  const body = blocksFrom(serialize(wsw), { dropImage: wirePhoto });
  const cover = find(root, (n) => hasClass(n, 'cover-media'));
  const img = cover ? imgOf(find(cover, (n) => n.tag === 'figure') ?? cover) : null;
  const by = find(root, (n) => hasClass(n, 'links__item-link'));
  return { body, img: img && !wirePhoto(img.cap) ? { ...img, src: img.src.replace(/_w\d+_r\d+(_s)?\.jpg$/, '_w800_r1.jpg') } : null, by: by ? clean(textOf(by)) : '' };
}

// 拆好的树再变回网页 (只要里面的)
function serialize(n) {
  return n.children
    .map((c) => {
      if (!isEl(c)) return c.replace(/&/g, '&amp;').replace(/</g, '&lt;');
      const attrs = Object.entries(c.attrs)
        .map(([k, v]) => ` ${k}="${String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"`)
        .join('');
      return VOID.has(c.tag) ? `<${c.tag}${attrs}>` : `<${c.tag}${attrs}>${serialize(c)}</${c.tag}>`;
    })
    .join('');
}

// 卫报 API 的一篇 → [列表里的一条, 全文]; 直播不要; 标了法律敏感的记上 legal (页面上写一句)
export function guardianItem(r, got) {
  const f = r.fields ?? {};
  if (r.type !== 'article' || !f.body) return null;
  const legal = f.legallySensitive === 'true' ? { legal: true } : {};
  const id = idOf('guardian', r.webUrl);
  const t = plain(f.headline || r.webTitle);
  const main = f.main ? blocksFrom(f.main).find((b) => b.img)?.img : null;
  const thumb = f.thumbnail ? { src: f.thumbnail } : null;
  const item = { id, src: 'guardian', lang: 'en', t, s: cut(plain(f.trailText || f.standfirst), SUMMARY_MAX), u: r.webUrl, at: new Date(f.firstPublicationDate || r.webPublicationDate).toISOString(), sec: r.sectionName, ...(thumb ? { img: thumb } : {}), ...(f.byline ? { by: f.byline } : {}), full: true, got, ...legal };
  const article = { id, src: 'guardian', t, u: r.webUrl, at: item.at, sec: r.sectionName, by: f.byline || '', lede: f.standfirst ? blocksFrom(f.standfirst).flatMap((b) => b.p ?? []) : [], img: main ?? null, body: blocksFrom(f.body), got, ...legal };
  return { item, article };
}

// ---------- 拿 ----------

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url, { headers = {}, json = false } = {}) {
  for (let i = 0; ; i++) {
    const res = await fetch(url, { headers: { 'User-Agent': UA, ...headers } });
    if ((res.status === 429 || res.status >= 500) && i < 3) {
      const wait = Math.max(Number(res.headers.get('retry-after')) || 0, 10 * 2 ** i);
      console.error(`  ${new URL(url).host} 回 ${res.status}, 等 ${wait} 秒`);
      await sleep(options.gap ? wait * 1000 : 0);
      continue;
    }
    if (!res.ok) throw new Error(`${res.status} ${url}`);
    const out = json ? await res.json() : await res.text();
    await sleep(options.gap);
    return out;
  }
}

// 一家 RSS → { items, articles }; 全文的: RFA、NASA 从 RSS 里拿, VOA 去文章页拿 (上次拿过的照用)
async function fromRss(src, prevArticles, log) {
  const s = SOURCES[src];
  const items = [];
  const articles = {};
  let pages = 0;
  for (const url of s.rss) {
    for (const r of parseRss(await get(url))) {
      const item = itemFrom(src, r);
      if (!item || items.some((x) => x.id === item.id)) continue;
      if (s.full) {
        let art = prevArticles[item.id] ?? null;
        if (!art && src === 'voa' && pages < VOA_PAGES_PER_RUN) {
          pages++;
          try {
            const page = voaArticle(await get(item.u));
            if (page?.body.length) art = { body: page.body, img: page.img, by: page.by || item.by || '' };
          } catch (e) {
            log(`  VOA 文章页拿不到: ${e.message}`);
          }
        } else if (!art && r.content) {
          const imgOk = r.image && !wirePhoto(`${r.image.cap} ${r.image.credit}`);
          art = { body: blocksFrom(r.content, { dropImage: wirePhoto }), img: imgOk ? { src: r.image.src, ...(r.image.cap ? { cap: r.image.cap } : {}) } : null, by: item.by ?? '' };
        }
        if (art?.body?.length) {
          articles[item.id] = { id: item.id, src, t: item.t, u: item.u, at: item.at, by: art.by ?? '', img: art.img ?? null, body: art.body };
          item.full = true;
          // 列表里的小图: RSS 没给的, 用文章的图, 再没有就用正文里的第一张 (NASA)
          const first = art.img ?? art.body.find((b) => b.img)?.img;
          if (!item.img && first) item.img = { src: first.src };
        }
      }
      items.push(item);
    }
  }
  return { items, articles };
}

async function fromGuardian(key, got) {
  const q = new URLSearchParams({ 'order-by': 'newest', 'page-size': '50', 'show-fields': 'headline,standfirst,trailText,byline,body,main,thumbnail,firstPublicationDate,legallySensitive' });
  const d = await get(`https://content.guardianapis.com/search?${q}`, { headers: { 'api-key': key }, json: true });
  if (d.response?.status !== 'ok') throw new Error(d.response?.message ?? '卫报的 API 出错');
  const items = [];
  const articles = {};
  for (const r of d.response.results ?? []) {
    const x = guardianItem(r, got);
    if (!x) continue;
    items.push(x.item);
    articles[x.item.id] = x.article;
  }
  return { items, articles };
}

// 跟上次的合起来: 这次拿到的为准, 上次有、这次 RSS 里已经挤掉的留着 (还在时限内的); 卫报只用这次的 (或者还没到一小时, 用上次的)
export function merge({ prev = [], fresh = [], now = Date.now() }) {
  const byId = new Map();
  for (const x of prev) byId.set(x.id, x);
  for (const x of fresh) byId.set(x.id, x);
  return [...byId.values()]
    .filter((x) => now - Date.parse(x.at) < (SOURCES[x.src]?.full ? KEEP_FULL_H : KEEP_H) * 3600000 && Date.parse(x.at) <= now + 3600000)
    .filter((x) => x.src !== 'guardian' || now - Date.parse(x.got) < GUARDIAN_KEEP_H * 3600000)
    .sort((a, b) => b.at.localeCompare(a.at));
}

export async function collect({ prev = null, prevArticles = {}, now = Date.now(), guardianKey = process.env.GUARDIAN_API_KEY, log = console.error } = {}) {
  const fresh = [];
  const articles = {};
  const failed = [];
  for (const src of Object.keys(SOURCES).filter((x) => SOURCES[x].rss)) {
    log(`拿 ${SOURCES[src].name}`);
    try {
      const got = await fromRss(src, prevArticles, log);
      fresh.push(...got.items);
      Object.assign(articles, got.articles);
    } catch (e) {
      failed.push(src);
      log(`  拿不到: ${e.message} (用上次的)`);
    }
  }
  // 上次的: 这次 RSS 里已经挤掉的、这次拿不到的那家的, 还在时限内的都留着 (合起来时这次拿到的为准)
  let prevItems = (prev?.items ?? []).filter((x) => x.src !== 'guardian');
  // 卫报: 没到一小时用上次的, 不然整批重新拿 (没有密钥就不放)
  let guardianAt = prev?.guardianAt ?? null;
  const prevGuardian = (prev?.items ?? []).filter((x) => x.src === 'guardian');
  if (!guardianKey) {
    log('没有 GUARDIAN_API_KEY, 不拿卫报');
    guardianAt = null;
  } else if (guardianAt && now - Date.parse(guardianAt) < GUARDIAN_EVERY_MIN * 60000) {
    prevItems = [...prevItems, ...prevGuardian];
  } else {
    log('拿 卫报');
    try {
      const got = new Date(now).toISOString();
      const g = await fromGuardian(guardianKey, got);
      fresh.push(...g.items);
      Object.assign(articles, g.articles);
      guardianAt = got;
    } catch (e) {
      log(`  拿不到: ${e.message} (上次的还没过 24 小时的照用)`);
      prevItems = [...prevItems, ...prevGuardian];
    }
  }
  if (failed.length) log(`这次拿不到: ${failed.join('、')}`);
  const items = merge({ prev: prevItems, fresh, now });
  // 全文: 这次拿到的, 加上还在列表里、上次有的
  const outArticles = {};
  for (const x of items) {
    if (!x.full) continue;
    const a = articles[x.id] ?? prevArticles[x.id];
    if (a) outArticles[x.id] = a;
    else delete x.full;
  }
  if (!items.length) throw new Error('一条新闻都没拿到');
  const sources = Object.fromEntries(Object.entries(SOURCES).map(([k, s]) => [k, { name: s.name, lang: s.lang, full: s.full, home: s.home, ...(s.note ? { note: s.note } : {}) }]));
  return { index: { v: 2, sources, guardianAt, items }, articles: outArticles };
}

// ---------- 读上次的、写这次的 ----------

function readPrev(dir) {
  const file = join(dir, 'latest.json');
  let prev = null;
  try {
    prev = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
  } catch {
    prev = null;
  }
  if (prev?.v !== 2) return { prev: null, prevArticles: {} };
  const prevArticles = {};
  const adir = join(dir, 'a');
  if (existsSync(adir)) {
    for (const f of readdirSync(adir)) {
      if (!f.endsWith('.json')) continue;
      try {
        const a = JSON.parse(readFileSync(join(adir, f), 'utf8'));
        if (a?.id) prevArticles[a.id] = a;
      } catch {
        // 坏了的不要
      }
    }
  }
  return { prev, prevArticles };
}

// 内容跟上次一样就不改 (「什么时候拿的」也不改, GitHub Actions 看见没变就不推)
export const sameIndex = (a, b) => JSON.stringify({ ...a, at: 0 }) === JSON.stringify({ ...b, at: 0 });

async function main() {
  const dir = join(new URL('..', import.meta.url).pathname, 'news');
  const dry = process.argv.includes('--dry');
  const { prev, prevArticles } = readPrev(dir);
  const { index, articles } = await collect({ prev, prevArticles });
  const out = { ...index, at: prev && sameIndex(prev, index) ? prev.at : new Date().toISOString() };
  const counts = Object.keys(SOURCES)
    .map((k) => `${SOURCES[k].name} ${out.items.filter((x) => x.src === k).length}`)
    .join('、');
  if (dry) {
    console.log(JSON.stringify(out, null, 1).slice(0, 4000));
    console.error(counts);
    return;
  }
  mkdirSync(join(dir, 'a'), { recursive: true });
  writeFileSync(join(dir, 'latest.json'), `${JSON.stringify(out)}\n`);
  for (const [id, a] of Object.entries(articles)) {
    const file = join(dir, 'a', `${id}.json`);
    const text = `${JSON.stringify(a)}\n`;
    if (!existsSync(file) || readFileSync(file, 'utf8') !== text) writeFileSync(file, text);
  }
  // 不在列表里的全文删掉 (卫报的规定: 不能留超过 24 小时)
  for (const f of readdirSync(join(dir, 'a'))) if (f.endsWith('.json') && !articles[f.slice(0, -5)]) unlinkSync(join(dir, 'a', f));
  console.error(`写好: ${out.items.length} 条 (${counts}), ${Object.keys(articles).length} 篇全文`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
