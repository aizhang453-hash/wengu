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
//     RFA English (v1.81) 自由亚洲电台的英文版, 条款跟中文版一样 (署名 RFA_CREDIT 放在最上面); RSS 带全文
//     KFF Health News (v1.81) 美国的健康新闻, CC BY-NC-ND 4.0, 写明谁都能免费转载整篇: 要写记者和 KFF Health News、留着链接、链回原文、不能改;
//                       美联社、Getty 这些通讯社的照片不在许可里 → 说明、署名写着通讯社的图不要。RSS 带全文
//     Global Voices (v1.81) 世界各地的公民媒体, CC BY 3.0 (写作者、出处、链回原文就能转)。作者大多是志愿者、不是专职记者 →
//                       页面上台名后面标「志愿者撰稿」(tag; 用户要的)。文章里的图很多是别人的、不在许可里 → 图都不放 (noImages)
//   查过不用的 (2026-11): ProPublica、The Conversation (条款写明不许自动整批转载)、美国之音英文版 (2025 年 3 月起停更)、Grist (照片和改动的规定不清楚)
//   卫报一次只拿最新的 15 篇 (v1.81: 用户说英文长文章被卫报占满了)
//   快讯 (只放标题和链接, 点了去原网站; v1.75 加了很多家, 都是不用付费、没有付费墙的, 2026-11 在美国打开看过):
//     中文: 中新网 (要闻)、央视新闻、界面新闻、BBC 中文、德国之声、法广、香港电台、中央社
//     英文: NPR、Al Jazeera、PBS NewsHour、DW、France 24、CBS News、ABC News
//     BBC 英文版 2025 年 6 月起在美国有付费墙, 不要了 (BBC 中文这些语言版不收费); 视频页 (/video/) 不要, 只要能读的文章
//     央视没有正式的 RSS, 用它自己网页拿新闻列表的那个地址 (news_1.jsonp); 央视改了网站可能就拿不到了 (拿不到的那家用上次的, 别的照常)
//     香港电台、中央社、BBC 中文给的是繁体: 标题用 opencc-js 转成简体 (BBC 的链接也换成简体版 /simp)
//   人民网 (2025 年 6 月停更)、新华网、澎湃、环球网、光明网、新京报、凤凰网没有能用的 RSS (2026-11 查的)
// 快讯只列 24 小时内的, 所以只有标题的留 24 小时; 各家 RSS 一次只给二三十条, 跟上次的合起来。
//
// 跑法: node tools/news.mjs            (读上次的 news/, 写新的)
//       node tools/news.mjs --dry      (只打出来看, 不写)
// 要 Node 22 以上 (自带 fetch)。在要走代理的机器上加 NODE_USE_ENV_PROXY=1。没有 GUARDIAN_API_KEY 就不拿卫报
// 繁转简要 opencc-js 1.4.2: GitHub Actions 里先 npm install; 自己电脑上没装的话, OPENCC_JS=<opencc-js 的 dist/esm/full.js> (都没有就照繁体放)
// 写明是谁在拿 (User-Agent): GitHub Actions 里用 NEWS_UA 写上仓库的网址

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const UA = process.env.NEWS_UA || 'WenguNews/1.0 (personal study app)';
// 两次请求之间等多久 (毫秒); 测试里改成 0
export const options = { gap: 800 };
const KEEP_H = 24; // 只有标题的新闻留多久 (小时; 快讯只列 24 小时内的)
const KEEP_FULL_H = 7 * 24; // 能读全文的留一个星期 (RFA 一天才两三篇)
const GUARDIAN_KEEP_H = 24; // 卫报的规定: 最多留 24 小时
const GUARDIAN_EVERY_MIN = 55; // 卫报多久重新拿一次 (每天 500 次的额度, 每小时一次足够)
const GUARDIAN_COUNT = 15; // 卫报一次拿几篇 (v1.81: 原来 50 篇, 把别家都挤到后面了)
const VOA_PAGES_PER_RUN = 12; // 每次最多去 VOA 拿几篇文章页 (别催人家)
const SUMMARY_MAX = 140;

export const RFA_CREDIT = 'Copyright © 1998-2023, RFA. Used with the permission of Radio Free Asia, 2025 M St. NW, Suite 300, Washington DC 20036.';

// 来源: full 能放全文; home 原网站; note 写在文章下面的出处; rss 或 cctv (央视的新闻列表);
// hant 给的是繁体 ('hk' 香港、'tw' 台湾的写法, 转成简体); link 链接要改一下的
// 次序就是页面上来源按钮的次序
export const SOURCES = {
  voa: { name: '美国之音', lang: 'zh', full: true, home: 'https://www.voachinese.com/', rss: ['https://www.voachinese.com/api/zm_yql-vomx-tpeybti'], note: '来源：美国之音（voanews.com）' },
  rfa: { name: '自由亚洲电台', lang: 'zh', full: true, home: 'https://www.rfa.org/mandarin/', rss: ['https://www.rfa.org/mandarin/rss'], note: RFA_CREDIT },
  cns: { name: '中新网', lang: 'zh', full: false, home: 'https://www.chinanews.com.cn/', rss: ['https://www.chinanews.com.cn/rss/importnews.xml'] },
  cctv: { name: '央视新闻', lang: 'zh', full: false, home: 'https://news.cctv.com/', cctv: 'https://news.cctv.com/2019/07/gaiban/cmsdatainterface/page/news_1.jsonp' },
  jiemian: { name: '界面新闻', lang: 'zh', full: false, home: 'https://www.jiemian.com/', rss: ['https://a.jiemian.com/index.php?m=article&a=rss'] },
  bbczh: { name: 'BBC 中文', lang: 'zh', full: false, home: 'https://www.bbc.com/zhongwen/simp', rss: ['https://feeds.bbci.co.uk/zhongwen/simp/rss.xml'], hant: 'tw', link: (u) => u.replace(/\/trad(?=$|[?#])/, '/simp') },
  dwzh: { name: '德国之声', lang: 'zh', full: false, home: 'https://www.dw.com/zh/', rss: ['https://rss.dw.com/rdf/rss-chi-all'] },
  rfi: { name: '法广', lang: 'zh', full: false, home: 'https://www.rfi.fr/cn/', rss: ['https://www.rfi.fr/cn/rss'] },
  rthk: { name: '香港电台', lang: 'zh', full: false, home: 'https://news.rthk.hk/rthk/ch/', rss: ['https://rthk.hk/rthk/news/rss/c_expressnews_greaterchina.xml', 'https://rthk.hk/rthk/news/rss/c_expressnews_cinternational.xml'], hant: 'hk' },
  cna: { name: '中央社', lang: 'zh', full: false, home: 'https://www.cna.com.tw/', rss: ['https://feeds.feedburner.com/rsscna/mainland', 'https://feeds.feedburner.com/rsscna/intworld'], hant: 'tw' },
  guardian: { name: 'The Guardian', lang: 'en', full: true, home: 'https://www.theguardian.com/', note: '© Guardian News & Media Limited. Powered by The Guardian Open Platform; for personal, non-commercial reading only.' },
  nasa: { name: 'NASA', lang: 'en', full: true, home: 'https://www.nasa.gov/news/', rss: ['https://www.nasa.gov/news-release/feed/'], note: 'Source: NASA (nasa.gov)' },
  rfaen: { name: 'Radio Free Asia', lang: 'en', full: true, home: 'https://www.rfa.org/english/', rss: ['https://www.rfa.org/english/rss'], note: RFA_CREDIT },
  gv: { name: 'Global Voices', lang: 'en', full: true, home: 'https://globalvoices.org/', rss: ['https://globalvoices.org/feed/'], tag: '志愿者撰稿', noImages: true, note: 'Published by Global Voices (globalvoices.org) under CC BY 3.0. Most Global Voices writers are volunteers, not staff journalists.' },
  kff: { name: 'KFF Health News', lang: 'en', full: true, home: 'https://kffhealthnews.org/', rss: ['https://kffhealthnews.org/feed/'], note: 'Republished from KFF Health News (kffhealthnews.org) under CC BY-NC-ND 4.0. KFF Health News is a national newsroom that produces in-depth journalism about health issues.' },
  npr: { name: 'NPR', lang: 'en', full: false, home: 'https://www.npr.org/sections/news/', rss: ['https://feeds.npr.org/1001/rss.xml'] },
  aljazeera: { name: 'Al Jazeera', lang: 'en', full: false, home: 'https://www.aljazeera.com/', rss: ['https://www.aljazeera.com/xml/rss/all.xml'] },
  pbs: { name: 'PBS NewsHour', lang: 'en', full: false, home: 'https://www.pbs.org/newshour/', rss: ['https://www.pbs.org/newshour/feeds/rss/headlines'] },
  dwen: { name: 'DW', lang: 'en', full: false, home: 'https://www.dw.com/en/', rss: ['https://rss.dw.com/rdf/rss-en-all'] },
  f24: { name: 'France 24', lang: 'en', full: false, home: 'https://www.france24.com/en/', rss: ['https://www.france24.com/en/rss'] },
  cbs: { name: 'CBS News', lang: 'en', full: false, home: 'https://www.cbsnews.com/', rss: ['https://www.cbsnews.com/latest/rss/main'] },
  abc: { name: 'ABC News', lang: 'en', full: false, home: 'https://abcnews.go.com/', rss: ['https://feeds.abcnews.com/abcnews/topstories'] },
};

// 评论文章 (v1.81, 用户要的「分清新闻和评论」, 页面上标「评论」): 网址在评论版 (卫报 commentisfree、Al Jazeera opinions、RFA pinglun……)、
// 标题开头写着「评论：」「观点：」「社评：」、RSS 的分类就叫 Opinion / 评论的。卫报看它自己分的 (guardianItem)。
// 只认这些明确的; 「评论分析」这种 (德国之声, 分析和评论混在一起) 不算
const OP_URL = /\/(opinions?|commentisfree|commentary|op-ed|pinglun)(\/|$)/i;
const OP_WORDS = '(评论|評論|观点|觀點|社评|社評|社论|社論|时评|時評|短评|短評|opinion|commentary|op-ed)';
const OP_TITLE = new RegExp(`^\\s*(?:[【［[]\\s*${OP_WORDS}\\s*[】］\\]]|${OP_WORDS}\\s*[：:|｜])`, 'i'); // 「【评论】……」「观点：……」
const OP_CAT = /^(opinions?|commentary|op-ed|评论|評論|观点|觀點|社评|社評|社论|社論|时评|時評)$/i;
export const isOpinion = (u, t = '', cats = []) => OP_URL.test(String(u).replace(/[?#].*$/, '')) || OP_TITLE.test(String(t)) || cats.some((c) => OP_CAT.test(c.trim()));

// 视频页 (Al Jazeera、France 24、CBS、ABC 的 RSS 里一半是视频): 快讯只要能读的文章
export const isVideo = (u, t = '') => /\/videos?\//i.test(String(u).replace(/[?#].*$/, '')) || /^(watch|video)\s*:/i.test(String(t));

// 繁体 → 简体: { hk: 转换的函数, tw: …… } (拿不到 opencc-js 就是 null, 照繁体放)
async function loadHans(log) {
  try {
    const O = await import(process.env.OPENCC_JS ? pathToFileURL(process.env.OPENCC_JS).href : 'opencc-js');
    return { hk: O.Converter({ from: 'hk', to: 'cn' }), tw: O.Converter({ from: 'tw', to: 'cn' }) };
  } catch (e) {
    log(`没有 opencc-js, 繁体的标题照繁体放 (${e.message})`);
    return null;
  }
}

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
  // 图的说明: <figure> 里的 <figcaption>, 或者 WordPress 的 <div class="wp-caption"> 里的 <p class="wp-caption-text"> (Global Voices 这样写)
  const capNode = node.tag === 'figure' ? find(node, (x) => x.tag === 'figcaption') : hasClass(node, 'wp-caption') ? find(node, (x) => hasClass(x, 'wp-caption-text')) : null;
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
      } else if (t === 'figure' || t === 'img' || t === 'picture' || (t === 'div' && hasClass(c, 'wp-caption'))) {
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

// RSS → [{ title, link, at, desc (网页), content (网页, 全文), author, image: { src, cap, credit }, cats (分类) }]
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
      cats: [...x.matchAll(/<(category|dc:subject)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/g)].map((m) => plain(xmlText(m[2]))).filter(Boolean),
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

// RSS 的一条 → 列表里的一条 (还没有全文)。快讯 (只有标题的) 只要标题、链接、时间 (页面上只列标题);
// hans: loadHans 给的繁转简 (繁体的那几家用)
export function itemFrom(src, r, hans = null) {
  if (!r.title || !r.link || !r.at) return null;
  const s = SOURCES[src];
  const u = s.link ? s.link(r.link) : r.link;
  if (!s.full && isVideo(u, r.title)) return null;
  const op = isOpinion(u, r.title, r.cats) ? { op: true } : {};
  if (!s.full) return { id: idOf(src, u), src, lang: s.lang, t: s.hant && hans ? hans[s.hant](r.title) : r.title, u, at: r.at, ...op };
  const summary = cut(plain(r.desc), SUMMARY_MAX);
  const img = r.image && !s.noImages && !wirePhoto(`${r.image.cap} ${r.image.credit}`) ? { src: r.image.src } : null;
  return { id: idOf(src, u), src, lang: s.lang, t: r.title, ...(summary && summary !== r.title ? { s: summary } : {}), u, at: r.at, ...(img ? { img } : {}), ...(r.author ? { by: r.author } : {}), ...op };
}

// 央视新闻的新闻列表 (news_1.jsonp: news({"data":{"list":[{ title, url, focus_date: '2026-11-11 08:53:31' (北京时间) }]}})) → 快讯
export function cctvItems(text) {
  const s = String(text);
  const d = JSON.parse(s.slice(s.indexOf('(') + 1, s.lastIndexOf(')')));
  return (d?.data?.list ?? [])
    .map((x) => {
      const at = Date.parse(`${String(x.focus_date ?? '').replace(' ', 'T')}+08:00`);
      const t = plain(x.title ?? '');
      const u = String(x.url ?? '');
      return t && /^https:\/\//.test(u) && Number.isFinite(at) ? { id: idOf('cctv', u), src: 'cctv', lang: 'zh', t, u, at: new Date(at).toISOString() } : null;
    })
    .filter(Boolean);
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

// 卫报 API 的一篇 → [列表里的一条, 全文]; 直播不要; 标了法律敏感的记上 legal (页面上写一句); 评论版的 (卫报自己分的) 记上 op
export function guardianItem(r, got) {
  const f = r.fields ?? {};
  if (r.type !== 'article' || !f.body) return null;
  const flags = { ...(f.legallySensitive === 'true' ? { legal: true } : {}), ...(r.pillarId === 'pillar/opinion' || r.sectionId === 'commentisfree' ? { op: true } : {}) };
  const id = idOf('guardian', r.webUrl);
  const t = plain(f.headline || r.webTitle);
  const main = f.main ? blocksFrom(f.main).find((b) => b.img)?.img : null;
  const thumb = f.thumbnail ? { src: f.thumbnail } : null;
  const item = { id, src: 'guardian', lang: 'en', t, s: cut(plain(f.trailText || f.standfirst), SUMMARY_MAX), u: r.webUrl, at: new Date(f.firstPublicationDate || r.webPublicationDate).toISOString(), sec: r.sectionName, ...(thumb ? { img: thumb } : {}), ...(f.byline ? { by: f.byline } : {}), full: true, got, ...flags };
  const article = { id, src: 'guardian', t, u: r.webUrl, at: item.at, sec: r.sectionName, by: f.byline || '', lede: f.standfirst ? blocksFrom(f.standfirst).flatMap((b) => b.p ?? []) : [], img: main ?? null, body: blocksFrom(f.body), got, ...flags };
  return { item, article };
}

// ---------- 拿 ----------

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url, { headers = {}, json = false } = {}) {
  for (let i = 0; ; i++) {
    let res;
    try {
      res = await fetch(url, { headers: { 'User-Agent': UA, ...headers } });
    } catch (e) {
      // 连不上 (偶尔会): 等一下再试, 试三次
      if (i >= 2) throw e;
      await sleep(options.gap ? 3000 : 0);
      continue;
    }
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
async function fromRss(src, prevArticles, log, hans) {
  const s = SOURCES[src];
  const items = [];
  const articles = {};
  let pages = 0;
  if (s.cctv) return { items: cctvItems(await get(s.cctv)), articles };
  for (const url of s.rss) {
    for (const r of parseRss(await get(url))) {
      const item = itemFrom(src, r, hans);
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
          art = { body: blocksFrom(r.content, { dropImage: s.noImages ? () => true : wirePhoto }), img: imgOk && !s.noImages ? { src: r.image.src, ...(r.image.cap ? { cap: r.image.cap } : {}) } : null, by: item.by ?? '' };
        }
        if (art?.body?.length) {
          articles[item.id] = { id: item.id, src, t: item.t, u: item.u, at: item.at, by: art.by ?? '', img: art.img ?? null, body: art.body, ...(item.op ? { op: true } : {}) };
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
  const q = new URLSearchParams({ 'order-by': 'newest', 'page-size': String(GUARDIAN_COUNT), 'show-fields': 'headline,standfirst,trailText,byline,body,main,thumbnail,firstPublicationDate,legallySensitive' });
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

// ---------- 今日一图、历史上的今天 (v1.81, 邸报的报纸栏目; 用户挑的) ----------
// 维基百科 (免费不用注册):
//   今日一图     维基共享资源每天选的一张好照片: 英文维基的 featured 资料 (/api/rest_v1/feed/featured/年/月/日) 里的 image。
//                图各有各的许可 (多是 CC BY-SA、公有领域) → 页面上写作者、许可、链回图的页面。
//                中文说明: 中文维基的「Wikipedia:每日图片/2026年11月11日」(是同一张图才用; 繁简混着写, 用 opencc-js 转简体)
//   历史上的今天 维基百科编者挑的几件事 (文字是 CC BY-SA 4.0 → 写明来自维基百科、链回去)。
//                中文: /api/rest_v1/feed/onthisday/selected/月/日, 请求头写 Accept-Language: zh-cn, 维基自己转成简体
//                (featured 资料里的中文版会把「-{zh-cn:…}-」这种繁简写法里的字整个丢掉, 2026-11-11 试的, 不用它)
//                英文: featured 资料里的 onthisday (一天二十条, 挑六条)
// 时区: 拿 UTC 的昨天、今天、明天三天, 网页按这台设备的日期挑 (美国晚上已经是 UTC 的明天了)
// 英文的一份有 250 KB: 一天的拿过了, 6 小时内不再拿
const DAYS_EVERY_H = 6;
const OTD_COUNT = 6; // 历史上的今天最多几条

// 维基的写法 → 字: [[链接|字]] → 字; 繁简写法 -{zh-cn:简;zh-tw:繁}- 取简体; 粗体斜体的 ''' ''、{{模板}}、<ref>、<small>（圖）</small> 去掉
export function wikiText(s) {
  let t = String(s ?? '').replace(/<ref[^>]*\/>|<ref[\s\S]*?<\/ref>/g, '');
  t = t.replace(/-\{([\s\S]*?)\}-/g, (all, x) => {
    if (!/zh(-[a-z]+)?\s*:/i.test(x)) return x;
    const v = Object.fromEntries(x.split(';').map((p) => p.split(/:(.*)/s).map((q) => q.trim())).filter((p) => p[1]));
    return v['zh-cn'] ?? v['zh-hans'] ?? v['zh-sg'] ?? v.zh ?? Object.values(v)[0] ?? '';
  });
  for (let i = 0; i < 5 && /\{\{[^{}]*\}\}/.test(t); i++) t = t.replace(/\{\{[^{}]*\}\}/g, '');
  t = t.replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1').replace(/'{2,}/g, '');
  return otdText(plain(t));
}

// 一条的字: 维基资料里偶尔夹着样式表 (.mw-parser-output …{…}), 「（图）」「(pictured)」说的是维基页面上的图, 这里没有, 去掉
export function otdText(s) {
  return String(s ?? '')
    .replace(/@media[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '')
    .replace(/\.mw-parser-output[^{}]*\{[^{}]*\}/g, '')
    .replace(/\s*\([^()]*\b(pictured|depicted)\b[^()]*\)/gi, '')
    .replace(/[（(]\s*(左|右|上|下|中)?\s*[图圖]\s*[)）]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// 历史上的今天: [{ y 哪年 (公元前是负的), t }], 按年份从早到晚; 太多的话隔几条挑一条 (各个年代都有)
export function otdOf(list, conv = (x) => x, n = OTD_COUNT) {
  const all = (Array.isArray(list) ? list : [])
    .filter((x) => Number.isFinite(Number(x?.year)) && x?.text)
    .map((x) => ({ y: Number(x.year), t: conv(otdText(plain(x.text))) }))
    .filter((x) => x.t)
    .sort((a, b) => a.y - b.y);
  if (all.length <= n) return all;
  return Array.from({ length: n }, (_, i) => all[Math.round((i * (all.length - 1)) / (n - 1))]);
}

// 今日一图: { file, src (960 像素宽的), w, h, page (图的页面), by 作者, lic 许可, licUrl, en 英文说明, zh 中文说明 }
export function picOf(im, zh = '') {
  const src = im?.thumbnail?.source;
  if (!src || !im.file_page || !im.license?.type) return null;
  const by = cut(plain(im.artist?.text ?? '').replace(/\s+/g, ' ').trim(), 80);
  return {
    file: String(im.title ?? '').replace(/^File:/, ''),
    src: src.replace(/\?utm_.*$/, ''),
    w: im.thumbnail.width,
    h: im.thumbnail.height,
    page: im.file_page,
    ...(by ? { by } : {}),
    lic: im.license.type,
    ...(im.license.url ? { licUrl: im.license.url } : {}),
    ...(im.description?.text ? { en: cut(plain(im.description.text).replace(/\s+/g, ' ').trim(), 400) } : {}),
    ...(zh ? { zh } : {}),
  };
}

// 中文维基「每日图片」那一页 (维基的写法: {{Featurepic/format | Image = 文件名 | Content = 说明}}) → { image, text }
export function zhPicPage(wikitext) {
  const field = (k) => new RegExp(`\\|\\s*${k}\\s*=\\s*([\\s\\S]*?)(?=\\n\\s*\\||\\n?\\}\\}\\s*$)`, 'i').exec(String(wikitext ?? ''))?.[1]?.trim() ?? '';
  return { image: field('Image').replace(/^(File|Image|文件|檔案|图像):/i, '').replace(/_/g, ' '), text: wikiText(field('Content')) };
}

// 先问维基百科自己的地址, 不行再问 api.wikimedia.org (同一份资料)
async function wikiGet(lang, path, headers = {}) {
  let err;
  for (const base of [`https://${lang}.wikipedia.org/api/rest_v1/feed/`, `https://api.wikimedia.org/feed/v1/wikipedia/${lang}/`]) {
    try {
      return await get(base + path, { json: true, headers });
    } catch (e) {
      err = e;
    }
  }
  throw err;
}

// 一天的: { got, pic, zh: [历史上的今天], en: [...] }
async function fromWiki(day, hans, now) {
  const [y, m, d] = day.split('-');
  const toHans = hans ? hans.tw : (x) => x;
  const en = await wikiGet('en', `featured/${y}/${m}/${d}`);
  let zh = [];
  try {
    // 维基自己转好了简体; 万一没转 (备用的地址), 再用 opencc-js 转一遍 (简体的字不会变)
    zh = otdOf((await wikiGet('zh', `onthisday/selected/${m}/${d}`, { 'Accept-Language': 'zh-cn' }))?.selected, toHans);
  } catch {
    // 中文的拿不到: 只有英文的
  }
  let zhCap = '';
  const im = en?.image;
  if (im) {
    try {
      const q = new URLSearchParams({ action: 'query', titles: `Wikipedia:每日图片/${Number(y)}年${Number(m)}月${Number(d)}日`, prop: 'revisions', rvprop: 'content', rvslots: 'main', format: 'json', formatversion: '2' });
      const page = (await get(`https://zh.wikipedia.org/w/api.php?${q}`, { json: true }))?.query?.pages?.[0];
      const zp = zhPicPage(page?.revisions?.[0]?.slots?.main?.content);
      if (zp.text && zp.image === String(im.title ?? '').replace(/^File:/, '')) zhCap = toHans(zp.text);
    } catch {
      // 没有中文说明
    }
  }
  return { got: new Date(now).toISOString(), pic: im ? picOf(im, zhCap) : null, zh, en: otdOf(en?.onthisday) };
}

const utcDay = (t) => new Date(t).toISOString().slice(0, 10);

// UTC 的昨天、今天、明天; 上次拿过、不到 6 小时的照用; 拿不到的用上次的
export async function wikiDays(prevDays, hans, now, log) {
  const days = {};
  for (const day of [-1, 0, 1].map((k) => utcDay(now + k * 86400000))) {
    const old = prevDays?.[day];
    if (old && now - Date.parse(old.got) < DAYS_EVERY_H * 3600000) {
      days[day] = old;
      continue;
    }
    log(`拿 维基百科 ${day}`);
    try {
      days[day] = await fromWiki(day, hans, now);
    } catch (e) {
      log(`  拿不到: ${e.message}`);
      if (old) days[day] = old;
    }
  }
  return days;
}

// 跟上次的合起来: 这次拿到的为准, 上次有、这次 RSS 里已经挤掉的留着 (还在时限内的); 卫报只用这次的 (或者还没到一小时, 用上次的)
export function merge({ prev = [], fresh = [], now = Date.now() }) {
  const byId = new Map();
  for (const x of prev) byId.set(x.id, x);
  for (const x of fresh) byId.set(x.id, x);
  return [...byId.values()]
    .filter((x) => SOURCES[x.src] && (SOURCES[x.src].full || !isVideo(x.u, x.t))) // 不要了的来源、视频页 (上次存着的) 去掉
    .filter((x) => now - Date.parse(x.at) < (SOURCES[x.src]?.full ? KEEP_FULL_H : KEEP_H) * 3600000 && Date.parse(x.at) <= now + 3600000)
    .filter((x) => x.src !== 'guardian' || now - Date.parse(x.got) < GUARDIAN_KEEP_H * 3600000)
    .sort((a, b) => b.at.localeCompare(a.at));
}

export async function collect({ prev = null, prevArticles = {}, now = Date.now(), guardianKey = process.env.GUARDIAN_API_KEY, log = console.error } = {}) {
  const fresh = [];
  const articles = {};
  const failed = [];
  const hans = await loadHans(log);
  for (const src of Object.keys(SOURCES).filter((x) => SOURCES[x].rss || SOURCES[x].cctv)) {
    log(`拿 ${SOURCES[src].name}`);
    try {
      const got = await fromRss(src, prevArticles, log, hans);
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
  const days = await wikiDays(prev?.days, hans, now, log);
  const sources = Object.fromEntries(Object.entries(SOURCES).map(([k, s]) => [k, { name: s.name, lang: s.lang, full: s.full, home: s.home, ...(s.note ? { note: s.note } : {}), ...(s.tag ? { tag: s.tag } : {}) }]));
  return { index: { v: 2, sources, guardianAt, items, days }, articles: outArticles };
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
