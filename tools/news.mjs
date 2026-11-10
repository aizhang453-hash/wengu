// 新闻 (v1.74): 从中文维基百科的「新闻动态」拿最近几天的新闻, 写成 news/latest.json, 温故的「新闻」页 (js/views/news.js) 读这个。
//
// 为什么是维基百科: 新闻网站的文章不许整篇转载; 维基百科的文字按 CC BY-SA 4.0 授权, 写明出处就能转载 (中文维基新闻 2026 年 5 月关站了)。
// 图片只用维基共享资源 (Commons) 上的 (自由授权), 写明作者和授权; 中文维基自己存的图多是「合理使用」的, 不用。
//
// 拿哪些 (都让维基百科先转成简体: variant=zh-cn):
//   - 首页的「新闻动态」(Template:Itn): 编辑挑出来的五六条大新闻 (头条), 每条加粗的链接是这件事的条目, 第一条配图;
//     下面还有「正在发生」(俄乌战争……) 和「最近逝世」
//   - 每个月的大事记 (「2026年11月」这样的条目): 一天一节, 一条一两句话, 后面附着原始报道 (路透社、联合早报……) 的出处
//   - 有专门条目的新闻 (像「2026年波兰克拉科夫枪击案」): 拿条目的正文当报道的正文, 条目的图当新闻图片
//
// 跑法: node tools/news.mjs            (写 news/latest.json; GitHub Actions 每天跑几次, 见 .github/workflows/news.yml)
//       node tools/news.mjs --dry      (只打出来看, 不写)
// 要 Node 22 以上 (自带 fetch)。在要走代理的机器上加 NODE_USE_ENV_PROXY=1
// 维基百科要求写明是谁在拿 (User-Agent): GitHub Actions 里用 NEWS_UA 写上仓库的网址

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

const API = 'https://zh.wikipedia.org/w/api.php';
const UA = process.env.NEWS_UA || 'WenguNews/1.0 (personal study app)';
const DAYS = 14; // 留最近几天的
const BODY_MAX = 5000; // 一篇正文最多多少字 (再长的到维基百科上读全文)
const GAP = 1000; // 两次请求之间等多久 (毫秒), 别催维基百科
// fmt: 改了正文、简介的做法就加一, 上次的文件里存着的正文、简介就不照用了 (重新拿)。
// v 是给温故看的文件格式 (js/news.js 认 v: 1), 字段改得温故看不懂了才加
export const V = 2;

// ---------- 网页 (HTML) 拆成一棵树: { tag, attrs, children }, 字是字符串 ----------

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

export function decode(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, e) => {
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
  const re = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][\w-]*)((?:\s+[^\s=>/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?)>|([^<]+)|</g;
  let m;
  while ((m = re.exec(html))) {
    const top = stack[stack.length - 1];
    if (m[0].startsWith('<!--')) continue;
    if (m[5] !== undefined) {
      top.children.push(decode(m[5]));
      continue;
    }
    if (m[0] === '<') {
      top.children.push('<');
      continue;
    }
    const tag = m[2].toLowerCase();
    if (m[1]) {
      for (let i = stack.length - 1; i > 0; i--) {
        if (stack[i].tag === tag) {
          stack.length = i;
          break;
        }
      }
      continue;
    }
    const node = { tag, attrs: attrsOf(m[3]), children: [] };
    top.children.push(node);
    if (tag === 'style' || tag === 'script') {
      // 里面的样式、代码不要
      const end = html.indexOf(`</${tag}`, re.lastIndex);
      re.lastIndex = end < 0 ? html.length : html.indexOf('>', end) + 1 || html.length;
      continue;
    }
    if (!VOID.has(tag) && !m[4]) stack.push(node);
  }
  return root;
}

const isEl = (c) => typeof c !== 'string';
const kids = (n) => n.children.filter(isEl);
function* walk(n) {
  yield n;
  for (const c of n.children) if (isEl(c)) yield* walk(c);
}
const hasClass = (n, c) => (n.attrs.class ?? '').split(/\s+/).includes(c);
const find = (n, pred) => {
  for (const x of walk(n)) if (pred(x)) return x;
  return null;
};
const findAll = (n, pred) => [...walk(n)].filter(pred);
const textOf = (n) => n.children.map((c) => (isEl(c) ? (c.tag === 'style' || c.tag === 'script' ? '' : textOf(c)) : c)).join('');

// 字收拾干净: 空白并成一个, 中文标点前后不留空格, 去掉空的括号
export function clean(s) {
  return String(s ?? '')
    .replace(/\s+/g, ' ')
    .replace(/\s*([，。、；：！？）」』”》])/g, '$1')
    .replace(/([（「『“《])\s*/g, '$1')
    .replace(/（\s*）|\(\s*\)/g, '')
    .trim();
}

// ---------- 维基百科的链接 ----------

const SKIP_NS = /^(File|Image|文件|檔案|Category|分类|分類|Help|帮助|Wikipedia|维基百科|Portal|主题|Template|模板|Special|特殊|Talk|User|用户|Module|模块|Draft|草稿)[:：]/i;

// <a href="/wiki/…">: 页面名 (照网址, 拿条目时用) 和显示的名字 (简体, title=)。红链 (还没有这个条目)、文件、分类不算
export function linkOf(a) {
  const href = a.attrs.href ?? '';
  if (!href.startsWith('/wiki/') || hasClass(a, 'new')) return null;
  let page;
  try {
    page = decodeURIComponent(href.slice(6).split('#')[0]).replace(/_/g, ' ');
  } catch {
    return null;
  }
  if (!page || SKIP_NS.test(page)) return null;
  return { page, name: clean(a.attrs.title || page) };
}

export const wikiUrl = (page) => `https://zh.wikipedia.org/zh-cn/${encodeURIComponent(page.replace(/ /g, '_'))}`;

// 一条新闻 (<li>): 字、里面的链接 (b: 加粗的)、出处的编号; 「（图）」、外语原名的小字、下一层的列表不要
export function itemOf(li) {
  const links = [];
  const refs = [];
  let text = '';
  let pic = false;
  const visit = (n, bold) => {
    for (const c of n.children) {
      if (!isEl(c)) {
        text += c;
        continue;
      }
      if (c.tag === 'sup' && hasClass(c, 'reference')) {
        const a = find(c, (x) => x.tag === 'a');
        const id = (a?.attrs.href ?? '').replace(/^#/, '');
        if (id && !refs.includes(id)) refs.push(id);
        continue;
      }
      if (c.tag === 'small' && /^[（(][图圖][片]?[)）]$/.test(textOf(c).trim())) {
        pic = true;
        continue;
      }
      if (['style', 'script', 'link', 'ul', 'ol', 'sup'].includes(c.tag) || hasClass(c, 'ilh-comment') || hasClass(c, 'noprint') || hasClass(c, 'mw-ref')) continue;
      if (c.tag === 'a') {
        const l = linkOf(c);
        const shown = textOf(c);
        if (l && !links.some((x) => x.page === l.page)) links.push({ ...l, b: bold || undefined });
        text += shown;
        continue;
      }
      visit(c, bold || c.tag === 'b' || c.tag === 'strong');
    }
  };
  visit(li, false);
  return { text: clean(text), links, refs, pic };
}

// 出处 (页面底下的参考资料): 编号 → { t 标题, u 网址, s 哪家, d 日期 }。引用模板里藏着一份整齐的 (COinS: class="Z3988")
export function refsFrom(root) {
  const map = {};
  for (const li of findAll(root, (n) => n.tag === 'li' && /^cite_note-/.test(n.attrs.id ?? ''))) {
    const coins = find(li, (n) => hasClass(n, 'Z3988'));
    const q = coins ? new URLSearchParams(coins.attrs.title ?? '') : null;
    const ext = find(li, (n) => n.tag === 'a' && hasClass(n, 'external'));
    const u = q?.get('rft_id') || ext?.attrs.href || '';
    if (!/^https?:\/\//.test(u)) continue;
    const t = clean(q?.get('rft.atitle') || q?.get('rft.btitle') || (ext ? textOf(ext) : ''));
    const s = clean(q?.get('rft.jtitle') || q?.get('rft.pub') || '') || hostOf(u);
    const d = /^\d{4}-\d{2}-\d{2}/.exec(q?.get('rft.date') ?? '')?.[0];
    map[li.attrs.id] = { t: t || hostOf(u), u, s: s.replace(/^\[\[|\]\]$/g, '').replace(/^www\./, ''), ...(d ? { d } : {}) };
  }
  return map;
}

function hostOf(u) {
  try {
    return new URL(u).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

// ---------- 首页的「新闻动态」 ----------

// 头条 (items)、第一条的图 (image: 文件名)、正在发生 (ongoing)、最近逝世 (deaths)
export function itnFrom(html) {
  const root = parseHtml(html);
  const box = find(root, (n) => n.attrs.id === 'column-itn') ?? root;
  const fileA = find(box, (n) => n.tag === 'a' && /^\/wiki\/(File|文件|檔案):/.test(n.attrs.href ?? ''));
  const image = fileA ? fileName(fileA.attrs.href) : null;
  const ul = find(box, (n) => n.tag === 'ul');
  const items = ul ? kids(ul).filter((n) => n.tag === 'li').map(itemOf) : [];
  let ongoing = [];
  let deaths = [];
  for (const d of findAll(root, (n) => n.attrs.id === 'column-feature-more')) {
    const head = find(d, (n) => hasClass(n, 'column-feature-more-header'));
    const label = head ? textOf(head) : '';
    // 只要最外层的 (「俄乌战争（过程 · 谈判）」括号里的不要)
    const links = [];
    let depth = 0;
    const visit = (n) => {
      for (const c of n.children) {
        if (!isEl(c)) {
          for (const ch of c) depth += ch === '（' || ch === '(' ? 1 : ch === '）' || ch === ')' ? -1 : 0;
          continue;
        }
        if (c === head) continue;
        if (c.tag === 'a') {
          const l = linkOf(c);
          if (l && depth <= 0 && !links.some((x) => x.page === l.page)) links.push(l);
          continue;
        }
        visit(c);
      }
    };
    visit(d);
    if (/正在发生|正在發生/.test(label)) ongoing = links;
    else if (/逝世/.test(label)) deaths = links;
  }
  return { items, image, ongoing, deaths };
}

function fileName(href) {
  try {
    return decodeURIComponent(href.replace(/^\/wiki\/[^:]+:/, '')).replace(/_/g, ' ');
  } catch {
    return null;
  }
}

// ---------- 每月的大事记 ----------

// 「2026年11月」的网页 → [{ date: '2026-11-01', text, links, src: [出处] }]; 有下一层的 (一件事下面几条) 拆开, 前面加上这件事
export function daysFrom(html, year, month) {
  const root = parseHtml(html);
  const refs = refsFrom(root);
  const top = find(root, (n) => hasClass(n, 'mw-parser-output')) ?? root;
  const out = [];
  let date = null;
  const pad = (n) => String(n).padStart(2, '0');
  const take = (li, prefix = null) => {
    const it = itemOf(li);
    const sub = kids(li).filter((n) => n.tag === 'ul' || n.tag === 'ol');
    if (sub.length) {
      for (const u of sub) for (const c of kids(u).filter((n) => n.tag === 'li')) take(c, it);
      return;
    }
    if (!it.text) return;
    const text = prefix?.text ? `${prefix.text.replace(/[：:]$/, '')}：${it.text}` : it.text;
    const links = [...(prefix?.links ?? []), ...it.links].filter((l, k, all) => all.findIndex((x) => x.page === l.page) === k);
    const src = [...(prefix?.refs ?? []), ...it.refs].map((id) => refs[id]).filter(Boolean);
    out.push({ date, text, links, src: src.filter((s, k) => src.findIndex((x) => x.u === s.u) === k) });
  };
  for (const n of kids(top)) {
    const h = n.tag === 'h2' ? n : hasClass(n, 'mw-heading') ? find(n, (x) => /^h[2-4]$/.test(x.tag)) : null;
    if (h) {
      const m = /(\d{1,2})月(\d{1,2})日/.exec(textOf(h));
      if (h.tag === 'h2') date = m && Number(m[1]) === month ? `${year}-${pad(month)}-${pad(Number(m[2]))}` : null;
      continue;
    }
    if (!date || (n.tag !== 'ul' && n.tag !== 'ol')) continue;
    for (const li of kids(n).filter((x) => x.tag === 'li')) take(li);
  }
  return out;
}

// ---------- 一条新闻讲的是哪件事 ----------

// 是「一件事」的条目 (不是人、地方): 前面有年份 (2026年……), 或者以「事故」「选举」「案」这些结尾
const EVENT = new RegExp(
  `(${[
    '事件', '事故', '空难|空難', '坠机|墜機', '坠毁|墜毀', '惨案|慘案', '血案', '命案', '案', '地震', '海啸|海嘯', '飓风|颶風', '台风|颱風', '风暴|風暴', '洪水', '水灾|水災', '火灾|火災', '山火', '爆炸',
    '选举|選舉', '大选|大選', '公投', '战争|戰爭', '冲突|衝突', '袭击|襲擊', '空袭|空襲', '攻势|攻勢', '战役|戰役', '危机|危機', '峰会|峰會', '会议|會議', '运动|運動', '示威', '抗议|抗議', '骚乱|騷亂', '暴动|暴動', '政变|政變', '罢工|罷工',
    '大奖赛|大獎賽', '锦标赛|錦標賽', '奥运会|奧運會', '残奥会|殘奧會', '世界杯|世界盃', '联赛|聯賽', '赛季|賽季', '颁奖典礼|頒獎典禮', '发射|發射', '任务|任務', '疫情', '丑闻|醜聞', '谈判|談判', '协议|協議', '停火',
  ].join('|')})$`,
);
const bare = (name) => name.replace(/\s*[（(][^）)]*[)）]\s*$/, '');
export const isEvent = (name) => /^\d{4}年/.test(name) || EVENT.test(bare(name));

// 选一个链接当这条新闻的「主条目」: 头条里加粗的那个最准; 不然挑最像「一件事」的 (前面有年份的最好)
export function pickMain(links) {
  let best = null;
  let bestScore = 0;
  for (const l of links) {
    let s = 0;
    if (/^\d{4}年/.test(l.name)) s += 3;
    if (EVENT.test(bare(l.name))) s += 2;
    if (l.b) s += 2;
    if (s > bestScore) {
      best = l;
      bestScore = s;
    }
  }
  return bestScore >= 2 ? best : null;
}

// 标题: 主条目是「一件事」的, 去掉前面的年份和后面的括号 (「2026年波兰克拉科夫枪击案」→「波兰克拉科夫枪击案」)
export function titleOf(main) {
  if (!main || !isEvent(main.name)) return null;
  const t = bare(main.name).replace(/^\d{4}年(?=.{4})/, '');
  return t || null;
}

// ---------- 栏目 ----------

// 照主条目的分类 (繁简都有) 和这条新闻的字分; 先对上哪个算哪个, 都对不上的是「时政」
export const SECTIONS = ['时政', '军事', '财经', '科技', '社会', '体育', '文娱'];
const POLITICS = ['时政', /[辞辭]职|[辞辭]呈|[弹彈][劾]|就任|[当當][选選]|[连連]任|提名|[组組][阁閣]|任命|下台|[选選][举舉]|大[选選]|公投|不信任|政[变變]/];
const RULES = [
  ['体育', /[体體]育|足球|[篮籃]球|网球|網球|排球|棒球|田[径徑]|游泳|[赛賽][车車]|一[级級]方程式|\bF1\b|奥[运運]|奧[运運]|[残殘][奥奧]|世界杯|世界盃|[锦錦]标[赛賽]|[錦]標賽|大[奖獎][赛賽]|[联聯][赛賽]|夺冠|奪冠|[冠]军|[冠]軍|赛季|賽季|[马馬]拉松|拳[击擊]|高[尔爾]夫|斯[诺諾]克|[电電]竞|[电電]子竞技|NBA|MLB|NFL/],
  ['科技', /科[学學]|科技|太空|航天|火箭|[卫衛]星|探[测測]器|天文|物理|化[学學]|生物[学學]|人工智能|人工智慧|软件|軟體|互[联聯][网網]|[计計]算机|[电電][脑腦]|芯片|晶片|半[导導]体|[发發]射|登月|月球|火星|空[间間]站|NASA|[网網][络絡]攻[击擊]|[黑]客|[疫]苗/],
  ['军事', /[战戰][争爭]|武[装裝][冲衝]突|[军軍]事[冲衝]突|[边邊]境[冲衝]突|空[袭襲]|[军軍][队隊]|[军軍]事|[导導][弹彈]|无人机|無人機|攻[势勢]|停火|武[装裝]|部[队隊]|士兵|[轰轟]炸|核武|[战戰][役]|[战戰]斗|[战戰]鬥|入侵|[军軍]演/],
  ['社会', /事故|空[难難]|坠[机毁]|墜[機毀]|地震|海[啸嘯]|[飓颶]风|[台颱]风|[风風]暴|洪水|[暴]雨|山火|火[灾災]|[爆]炸|[枪槍][击擊]|[袭襲][击擊]|恐[怖]|[谋謀]杀|[謀]殺|命案|血案|[伤傷]人|遇[难難]|罹[难難]|[灾災][难難]|疫情|传染|傳染|疾病|罪案|[刑]案|[绑綁]架|失[踪蹤]|[车車][祸禍]|出[轨軌]|沉[船没沒]|[踩]踏|[坍]塌/],
  ['财经', /[经經][济濟]|[财財][经經]|金融|[银銀]行|股市|股票|[证證]券|[货貨][币幣]|通[胀脹]|利率|央行|[贸貿]易|[关關][税稅]|企[业業]|公司|收[购購]|[并併][购購]|破[产產]|上市|GDP|油[价價]|[汇匯]率|[债債]/],
  ['文娱', /[电電]影|[电電][视視]|[音]樂|音[乐樂]|[歌]手|演唱|[专專][辑輯]|[艺藝]术|[艺藝]術|文[学學]|小[说說]|[诺諾]贝[尔爾]文学|[颁頒][奖獎]|金[马馬][奖獎]|奥斯卡|[戏戲]剧|[戲]劇|博物[馆館]|[电電]子游[戏戲]|[动動][画畫]|漫[画畫]|[综綜][艺藝]|[选選]秀|[时時]装|[時]裝/],
];
// 先看主条目的分类 (分类比字准: 「Category:2026年體育」), 再看字
// 字里有「辞职」「弹劾」「当选」这些的先算时政 (「银行倒闭, 总统辞职」不算财经)
export function sectionOf(text, cats = [], title = '') {
  const rules = [RULES[0], POLITICS, ...RULES.slice(1)];
  const catText = cats.join(' ');
  for (const [sec, re] of rules) if (re.test(catText)) return sec;
  const all = `${title} ${text}`;
  for (const [sec, re] of rules) if (re.test(all)) return sec;
  return '时政';
}

// ---------- 条目的正文 ----------

// 维基百科给的纯文字 (== 小标题 == 一行一个) → [段落, { h: 小标题 }, { h, s: 1 } 小一号的, { li: [列表] }, ……]
// 参见、注释、参考资料、外部链接这些节不要; 表格拿不到, 只剩小标题的节去掉; 连着几行短的、句末没有标点的是列表 (单独一行的是小标题);
// 太长的截断 (cut: true)
const SKIP_SEC = /^(参见|参看|相关条目|相关词条|另见|注释|注解|脚注|备注|参考|参考资料|参考文献|参考来源|参考书目|资料来源|来源|引用|外部链接|外部连结|延伸阅读|扩展阅读|图集|画廊|相关链接)$/;
// 第一段里的外文原名、读音 (「（西班牙语：Santiago Peña…，发音：[san'tjaɣo…]；1978年11月16日—）」) 去掉, 读起来乱
export const dropGloss = (t) => clean(t.replace(/[（(][^（()）]*(语|語|文)[：:][^（()）]*[)）]/g, ''));
const shortLine = (t) => t.length <= 40 && !/[。！？；…：:」』”’）)]$/.test(t);
export function bodyFrom(extract, max = BODY_MAX) {
  const raw = [];
  let skipLv = 0;
  for (const line0 of String(extract ?? '').split('\n')) {
    const line = clean(line0);
    if (!line) continue;
    const m = /^(=+)\s*(.*?)\s*=+$/.exec(line);
    if (m) {
      const lv = m[1].length;
      if (skipLv && lv > skipLv) continue; // 不要的那节里的小节
      skipLv = SKIP_SEC.test(m[2]) ? lv : 0;
      if (!skipLv && m[2]) raw.push({ h: m[2], lv });
      continue;
    }
    if (!skipLv) raw.push({ p: raw.some((x) => x.p) ? line : dropGloss(line) });
  }
  // 短行: 连着两行以上的并成列表, 单独一行 (后面跟着段落) 的当小标题
  const blocks = [];
  for (let k = 0; k < raw.length; k++) {
    const x = raw[k];
    if (x.p && shortLine(x.p)) {
      let j = k;
      while (j + 1 < raw.length && raw[j + 1].p && shortLine(raw[j + 1].p)) j++;
      if (j > k) {
        blocks.push({ li: raw.slice(k, j + 1).map((y) => y.p) });
        k = j;
        continue;
      }
      if (k + 1 < raw.length && raw[k + 1].p) {
        blocks.push({ h: x.p, lv: 9 });
        continue;
      }
    }
    blocks.push(x);
  }
  // 后面没有内容的小标题去掉 (下一个是同一层或者更大的标题, 或者到底了)
  const kept = blocks.filter((x, k) => {
    if (!x.h) return true;
    for (let j = k + 1; j < blocks.length; j++) {
      if (!blocks[j].h) return true;
      if (blocks[j].lv <= x.lv) return false;
    }
    return false;
  });
  // 截到 max 个字 (列表太长的只留前 12 项)
  const out = [];
  let n = 0;
  let cut = false;
  for (const x of kept) {
    const len = x.p ? x.p.length : x.li ? x.li.join('').length : 0;
    if (n > 0 && len && n + len > max) {
      cut = true;
      break;
    }
    n += len;
    if (x.p) out.push(x.p);
    else if (x.li) out.push({ li: x.li.length > 12 ? [...x.li.slice(0, 12), '……'] : x.li });
    else out.push(x.lv <= 2 ? { h: x.h } : { h: x.h, s: 1 });
  }
  while (out.length && out[out.length - 1].h) out.pop(); // 截断后最后剩个小标题
  return { body: out, cut };
}

// 括号里的 (外文原名、读音、生卒年、又译) 都去掉: 一句话简介里不要
const unparen = (s) => {
  let x = String(s ?? '');
  for (let i = 0; i < 3; i++) x = x.replace(/[（(][^（()）]*[)）]/g, '');
  return x;
};

// 人物、专题只要开头一段的第一句 (「巴尔特·德韦弗，比利时政治人物，……自2025年2月3日起担任比利时首相。」)
export function introLine(extract, max = 90) {
  const first = String(extract ?? '').split('\n').find((l) => l.trim()) ?? '';
  let s = clean(unparen(first)).replace(/^([^，。]{1,30})，(又称|又譯|又译|简称|簡稱|通称|通稱)[^，。]*，/, '$1，');
  const end = s.search(/。/);
  if (end > 0) s = s.slice(0, end + 1);
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

// 新闻里提到的人、机构配一句简介 (「巴尔特·德韦弗，比利时政治人物……」); 国家、城市这些地方和「总统」「议会」这些职位不要
const OFFICE = /(总统|總統|总理|總理|首相|国家主席|國家主席|主席|国王|國王|女王|部长|部長|大臣|幕僚长|幕僚長|总书记|總書記|秘书长|秘書長|议会|議會|国会|國會|参议院|參議院|众议院|眾議院|议员|議員|政治局|政府|列表)$/;
const PLACE = /(是|为|為|位于|位於|的一个|的一個|之一)[^。]{0,40}?(国家|國家|城市|都市|首都|首府|省会|省會|省份|省|地级市|县级市|直辖市|市辖区|自治区|特别行政区|行政区|州|县|縣|岛屿|岛|地区|共和国|王国|大洲|海域|河流)[。，、；]/;
export const eventLine = (line) => /^([^，。]{0,8}时间)?\d{4}年\d{1,2}月/.test(line);
export const noteWanted = (name) => !OFFICE.test(bare(name)) && !/^\d{4}年/.test(name);
// 是不是讲一个地方 (照开头一段, 括号去掉以后看)
export const placeIntro = (extract) => PLACE.test(clean(unparen(String(extract ?? '').slice(0, 400))));

// ---------- 拿 ----------

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(params) {
  const body = new URLSearchParams({ format: 'json', formatversion: '2', variant: 'zh-cn', ...params });
  const url = `${API}?${body}`;
  // 一次问几十个条目时网址太长: 改成 POST (维基百科的接口两种都收)
  const long = url.length > 1800;
  for (let i = 0; ; i++) {
    const res = await fetch(long ? API : url, long ? { method: 'POST', body, headers: { 'User-Agent': UA } } : { headers: { 'User-Agent': UA } });
    // 太快了、维基百科一时忙: 等一会儿再拿 (它说等多久和 10、20、40…… 秒里挑长的), 最多试 6 次
    if ((res.status === 429 || res.status >= 500) && i < 5) {
      const wait = Math.max(Number(res.headers.get('retry-after')) || 0, 10 * 2 ** i);
      console.error(`维基百科回 ${res.status}, 等 ${wait} 秒`);
      await sleep(wait * 1000);
      continue;
    }
    if (!res.ok) throw new Error(`${res.status} ${url}`);
    const data = await res.json();
    if (data.error) throw new Error(`${data.error.code}: ${data.error.info}`);
    await sleep(GAP);
    return data;
  }
}

const parsePage = async (page) => (await api({ action: 'parse', page, prop: 'text', disablelimitreport: '1', disableeditsection: '1' })).parse.text;

// 一次问好几个条目 (最多 50 个): 现在的版本号、首图、分类; 跟着 continue 拿全
async function pagesInfo(titles) {
  const out = {};
  const redirects = {};
  for (let k = 0; k < titles.length; k += 50) {
    let cont = {};
    for (;;) {
      const d = await api({ action: 'query', titles: titles.slice(k, k + 50).join('|'), redirects: '1', prop: 'info|pageimages|categories', inprop: 'varianttitles', piprop: 'name', clshow: '!hidden', cllimit: 'max', ...cont });
      for (const r of [...(d.query?.normalized ?? []), ...(d.query?.redirects ?? [])]) redirects[r.from] = r.to;
      for (const p of d.query?.pages ?? []) {
        if (p.missing || p.invalid) continue;
        const o = (out[p.title] ??= { rev: p.lastrevid, name: p.varianttitles?.['zh-cn'] || p.title, image: null, cats: [] });
        if (p.pageimage) o.image = p.pageimage.replace(/_/g, ' ');
        for (const c of p.categories ?? []) o.cats.push(c.title.replace(/^[^:]+:/, ''));
      }
      if (!d.continue) break;
      cont = d.continue;
    }
  }
  const resolve = (t) => {
    let x = t;
    for (let i = 0; i < 5 && redirects[x]; i++) x = redirects[x];
    return x;
  };
  return { pages: out, resolve };
}

// 整篇的纯文字 (一次只能拿一篇)
async function fullText(title) {
  const d = await api({ action: 'query', titles: title, redirects: '1', prop: 'extracts', explaintext: '1', exsectionformat: 'wiki' });
  return d.query?.pages?.[0]?.extract ?? '';
}

// 开头一段 (一次最多 20 篇); 问的名字是重定向的, 用原来的名字也查得到
// alias: 顺便记下重定向 (问的名字 → 真正的条目名)
async function intros(titles, chars = 400, alias = null) {
  const out = {};
  for (let k = 0; k < titles.length; k += 20) {
    const d = await api({ action: 'query', titles: titles.slice(k, k + 20).join('|'), redirects: '1', prop: 'extracts', exintro: '1', explaintext: '1', exchars: String(chars), exlimit: '20' });
    for (const p of d.query?.pages ?? []) if (p.extract) out[p.title] = p.extract;
    for (const r of [...(d.query?.normalized ?? []), ...(d.query?.redirects ?? [])]) if (out[r.to] && !out[r.from]) out[r.from] = out[r.to];
    for (const r of [...(d.query?.normalized ?? [])]) for (const x of d.query?.redirects ?? []) if (x.from === r.to && out[x.to]) out[r.from] = out[x.to];
    if (alias) for (const r of [...(d.query?.normalized ?? []), ...(d.query?.redirects ?? [])]) alias[r.from] = r.to;
  }
  return out;
}

// 图: 只要维基共享资源上的 (imagerepository: shared), 不要 svg (多是旗子、标志、地图); 拿 960 宽的图、作者、授权
async function imagesInfo(files) {
  const out = {};
  for (let k = 0; k < files.length; k += 50) {
    const d = await api({ action: 'query', titles: files.slice(k, k + 50).map((f) => `File:${f}`).join('|'), prop: 'imageinfo', iiprop: 'url|extmetadata|size', iiurlwidth: '960', iiextmetadatafilter: 'Artist|LicenseShortName|Credit', iiextmetadatalanguage: 'zh-cn' });
    for (const p of d.query?.pages ?? []) {
      const ii = p.imageinfo?.[0];
      if (!ii || p.imagerepository !== 'shared' || /\.svg$/i.test(p.title)) continue;
      const meta = ii.extmetadata ?? {};
      const by = clean(decode(String(meta.Artist?.value ?? '').replace(/<[^>]*>/g, ' ')));
      out[p.title.replace(/^[^:]+:/, '')] = {
        src: ii.thumburl || ii.url,
        w: ii.thumbwidth || ii.width,
        h: ii.thumbheight || ii.height,
        by: by.length > 60 ? `${by.slice(0, 59)}…` : by,
        lic: clean(decode(String(meta.LicenseShortName?.value ?? ''))),
        page: ii.descriptionurl,
      };
    }
  }
  return out;
}

// ---------- 合起来 ----------

// 短的、跨天不变的编号 (同一件事、同一句话每次都一样)
export function hashId(s) {
  let x = 0x811c9dc5;
  for (const ch of String(s)) {
    x ^= ch.codePointAt(0);
    x = Math.imul(x, 0x01000193) >>> 0;
  }
  return x.toString(36);
}

// 北京时间的今天 'YYYY-MM-DD'
export function todayIn(tz = 'Asia/Shanghai', now = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}

const addDays = (day, n) => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

// 两句话有多像: 两个字两个字地比, 一样的占短的那句的多少 (0 ~ 1)
export function alike(a, b) {
  const grams = (t) => {
    const x = String(t).replace(/[\s，。、；：！？“”《》（）·\d]/g, '');
    const out = new Set();
    for (let i = 0; i < x.length - 1; i++) out.add(x.slice(i, i + 2));
    return out;
  };
  const ga = grams(a);
  const gb = grams(b);
  if (!ga.size || !gb.size) return 0;
  let n = 0;
  for (const g of ga) if (gb.has(g)) n++;
  return n / Math.min(ga.size, gb.size);
}

// 每月大事记里的一条 + 首页头条 → 新闻 (还没有正文、图): 头条跟大事记里同一件事的并成一条 (用头条的字, 编辑改得更新)
export function buildStories({ days, itn, prev = null, today }) {
  const keyOf = (main, text) => (main ? `m:${main.page}` : `t:${text}`);
  const stories = [];
  const byKey = new Map();
  for (const it of days) {
    const main = pickMain(it.links);
    const key = `${it.date}|${keyOf(main, it.text)}`;
    if (byKey.has(key)) continue; // 同一天同一件事写了两条: 留第一条
    const s = { id: `${it.date.replace(/-/g, '').slice(2)}-${hashId(keyOf(main, it.text))}`, date: it.date, text: it.text, main, links: it.links, src: it.src };
    byKey.set(key, s);
    stories.push(s);
  }
  // 头条: 找大事记里讲同一件事的: 主条目或者加粗的那个链接也在那条里; 好几条都像的, 挑一样的链接多的、日子近的
  const prevTop = new Map((prev?.stories ?? []).filter((s) => s.top).map((s) => [s.key, s]));
  const top = [];
  itn.items.forEach((it, k) => {
    const main = pickMain(it.links);
    const bold = it.links.filter((l) => l.b).map((l) => l.page);
    let same = null;
    let best = 0;
    for (const s of stories) {
      if (s.top) continue;
      const ps = new Set([s.main?.page, ...s.links.map((l) => l.page)].filter(Boolean));
      // 译名不一样 (「培尼亚」「潘尼亚」) 时链接对不上: 字差不多一样的 (最近七天的) 也算
      const hit = (main && ps.has(main.page)) || bold.some((b) => ps.has(b)) || (s.date >= addDays(today, -7) && alike(it.text, s.text) >= 0.4);
      if (!hit) continue;
      const n = it.links.filter((l) => ps.has(l.page)).length + (main && s.main?.page === main.page ? 3 : 0);
      if (!same || n > best || (n === best && s.date > same.date)) {
        same = s;
        best = n;
      }
    }
    if (same) {
      same.text = it.text;
      // 头条加粗的是人 (「黄之锋」), 大事记里有这件事的条目 (「黄之锋串谋勾结案」): 用大事记的
      if (main && (isEvent(main.name) || !same.main)) same.main = main;
      same.top = k + 1;
      same.pic = it.pic;
      top.push(same);
      return;
    }
    // 大事记里还没写的: 第一次看见是哪天就算哪天 (上次的文件里有就照上次的)
    const key = keyOf(main, it.text);
    const date = prevTop.get(key)?.date ?? today;
    const s = { id: `${date.replace(/-/g, '').slice(2)}-${hashId(key)}`, date, text: it.text, main, links: it.links, src: [], top: k + 1, pic: it.pic, key };
    stories.push(s);
    top.push(s);
  });
  for (const s of stories) s.key ??= keyOf(s.main, s.text);
  return { stories, top };
}

export async function collect({ today = todayIn(), prev: last = null, log = console.error } = {}) {
  const prev = last?.fmt === V ? last : null;
  const from = addDays(today, -(DAYS - 1));
  // 这个月的大事记; 月初几天再加上个月的
  const months = [...new Set([today, from].map((d) => d.slice(0, 7)))];
  const days = [];
  for (const ym of months) {
    const [y, m] = ym.split('-').map(Number);
    log(`拿 ${y}年${m}月 的大事记`);
    try {
      days.push(...daysFrom(await parsePage(`${y}年${m}月`), y, m));
    } catch (e) {
      log(`  拿不到: ${e.message}`);
    }
  }
  const recent = days.filter((d) => d.date >= from && d.date <= today);
  log(`拿首页的新闻动态`);
  const itn = itnFrom(await parsePage('Template:Itn'));
  const { stories, top } = buildStories({ days: recent, itn, prev, today });

  // 相关的人、机构的一句话简介 (上次有的照用)
  const topics = itn.ongoing.map((l) => l.page);
  const people = itn.deaths.map((l) => l.page);
  const firstMains = new Set(stories.map((s) => s.main?.page).filter(Boolean));
  const named = new Map(stories.flatMap((s) => s.links).map((l) => [l.page, l.name]));
  const relPages = [...named.keys()].filter((p) => !firstMains.has(p) && !topics.includes(p) && noteWanted(named.get(p)));
  const prevNotes = prev?.notes ?? {};
  const need = relPages.filter((p) => !(p in prevNotes));
  log(`拿 ${need.length} 个相关条目的简介`);
  // 重定向记在文件里 (下次简介照用, 不再问, 也就不知道重定向了): 新闻里的人和机构跟主条目是同一个的 (译名不同) 不列
  const alias = Object.fromEntries(Object.entries(prev?.alias ?? {}).filter(([from]) => relPages.includes(from)));
  const got = need.length ? await intros(need, 300, alias) : {};
  const notes = {};
  for (const p of relPages) {
    if (p in prevNotes) notes[p] = prevNotes[p];
    else {
      const line = introLine(got[p] ?? '', 80);
      notes[p] = line && !placeIntro(got[p]) ? line : null; // null: 不要 (记着, 下次不用再问)
    }
  }
  // 简介是「2026年10月30日，……」这样从日子讲起的, 是讲这件事的条目 (名字里没有年份, 上面没认出来): 当主条目
  const eventPages = new Set();
  for (const s of stories) {
    if (s.main) continue;
    const l = s.links.find((x) => notes[x.page] && eventLine(notes[x.page]));
    if (l) {
      s.main = l;
      eventPages.add(l.page);
    }
  }

  // 条目: 新闻的主条目、正在发生的专题
  const mains = [...new Set(stories.map((s) => s.main?.page).filter(Boolean))];
  log(`问 ${mains.length + topics.length} 个条目的版本、图、分类`);
  const { pages, resolve } = await pagesInfo([...new Set([...mains, ...topics])]);

  const prevArts = prev?.articles ?? {};
  const articles = {};
  const nameOf = Object.fromEntries(stories.filter((s) => s.main).map((s) => [s.main.page, s.main.name]));
  for (const page of mains) {
    const title = resolve(page);
    const info = pages[title];
    if (!info || articles[title]) continue;
    const event = eventPages.has(page) || isEvent(nameOf[page] ?? title);
    const old = prevArts[title];
    // 版本没变的不再拿正文
    if (old && old.rev === info.rev && Boolean(old.intro) === !event) {
      articles[title] = { ...old, name: info.name, cats: info.cats, image: info.image, ...(event ? { event: true } : {}) };
      continue;
    }
    log(`  拿正文: ${title}`);
    try {
      if (event) {
        const { body, cut } = bodyFrom(await fullText(title));
        articles[title] = { rev: info.rev, name: info.name, body, ...(cut ? { cut: true } : {}), cats: info.cats, image: info.image, event: true };
      } else {
        // 人物这些 (头条里加粗的是人): 只要开头一段当背景
        const text = (await intros([title], 500))[title] ?? '';
        articles[title] = { rev: info.rev, name: info.name, body: bodyFrom(text, 500).body, intro: true, cats: info.cats, image: info.image };
      }
    } catch (e) {
      // 一篇拿不到不要紧: 有上次的用上次的, 没有就这次先不放正文
      log(`  拿不到 (${e.message}), ${old ? '用上次的' : '先不放正文'}`);
      if (old) articles[title] = { ...old, name: info.name, cats: info.cats, image: info.image, ...(event ? { event: true } : {}) };
    }
  }
  // 专题: 开头一段
  const topicIntro = await intros(topics.map(resolve).filter((t) => pages[t]), 600);
  const topicList = itn.ongoing
    .map((l) => {
      const title = resolve(l.page);
      if (!pages[title]) return null;
      return { title, name: bare(pages[title].name), body: bodyFrom(topicIntro[title] ?? '', 600).body, image: pages[title].image };
    })
    .filter(Boolean);
  // 最近逝世: 一句话
  const deathIntro = people.length ? await intros(people, 200) : {};
  const deathList = itn.deaths.map((l) => ({ page: l.page, name: l.name, line: introLine(deathIntro[resolve(l.page)] ?? deathIntro[l.page] ?? '') }));

  // 图
  const files = [...new Set([itn.image, ...Object.values(articles).map((a) => a.image), ...topicList.map((t) => t.image)].filter(Boolean))];
  log(`问 ${files.length} 张图的作者、授权`);
  const imgs = files.length ? await imagesInfo(files) : {};

  return finish({ stories, top, articles, topicList, deathList, imgs, itnImage: itn.image, resolve, today, notes, alias });
}

// 拼成写进文件的样子
export function finish({ stories, top, articles, topicList, deathList, imgs, itnImage, resolve = (t) => t, today, notes = {}, alias = {} }) {
  const final = (page) => {
    let x = page;
    for (let i = 0; i < 5 && alias[x]; i++) x = alias[x];
    return resolve(x);
  };
  const outArts = {};
  for (const [title, a] of Object.entries(articles)) {
    const img = a.image ? imgs[a.image] : null;
    outArts[title] = { rev: a.rev, name: a.name ?? title, body: a.body, ...(a.cut ? { cut: true } : {}), ...(a.intro ? { intro: true } : {}), ...(img ? { img } : {}), cats: a.cats?.slice(0, 30) ?? [] };
  }
  const outStories = stories
    .map((s) => {
      const art = s.main ? resolve(s.main.page) : null;
      const a = art ? outArts[art] : null;
      // 标题用条目的名字 (简体; 链接上写的可能是重定向的名字)
      const title = a && !a.intro ? (titleOf({ name: a.name }) ?? (articles[art]?.event ? bare(a.name) : null)) : null;
      // 头条配的图 (首页那张) 给它那一条
      const img = s.top && s.pic && itnImage && imgs[itnImage] ? imgs[itnImage] : null;
      return {
        id: s.id,
        date: s.date,
        sec: sectionOf(s.text, a?.cats ?? [], title ?? ''),
        ...(title ? { title } : {}),
        text: s.text,
        ...(a ? { art } : {}),
        ...(img ? { img } : {}),
        ...(s.top ? { top: s.top, key: s.key } : {}),
        links: s.links
          .filter((l) => l.page !== s.main?.page && (!art || final(l.page) !== art)) // 主条目 (译名不同的也算) 不列
          .map((l) => ({ page: l.page, name: bare(l.name) }))
          .slice(0, 10),
        src: s.src.slice(0, 6),
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date) || (a.top ?? 99) - (b.top ?? 99));
  // 没用上的条目不写 (分类只是拿来分栏目的, 也不写)
  const used = new Set(outStories.map((s) => s.art).filter(Boolean));
  for (const t of Object.keys(outArts)) if (!used.has(t)) delete outArts[t];
  for (const a of Object.values(outArts)) delete a.cats;
  // 简介也只留用得上的
  const linked = new Set(outStories.flatMap((s) => s.links.map((l) => l.page)));
  const outNotes = Object.fromEntries(Object.entries(notes).filter(([p]) => linked.has(p)));
  const outAlias = Object.fromEntries(Object.entries(alias).filter(([from, to]) => from !== to && from in notes));
  return {
    v: 1,
    fmt: V,
    day: today,
    source: { name: '维基百科「新闻动态」', url: 'https://zh.wikipedia.org/zh-cn/Portal:新闻动态', license: 'CC BY-SA 4.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/deed.zh-hans' },
    top: top.map((s) => s.id),
    stories: outStories,
    articles: outArts,
    topics: topicList.map((t) => ({ title: t.title, name: t.name, body: t.body, ...(t.image && imgs[t.image] ? { img: imgs[t.image] } : {}) })),
    deaths: deathList,
    notes: outNotes,
    alias: outAlias,
  };
}

// 内容跟上次一样的话不改文件 (免得每次都多一个提交): 比的时候不看「什么时候拿的」
export const sameNews = (a, b) => JSON.stringify({ ...a, at: 0 }) === JSON.stringify({ ...b, at: 0 });

async function main() {
  const root = new URL('..', import.meta.url).pathname;
  const file = join(root, 'news/latest.json');
  const dry = process.argv.includes('--dry');
  let prev = null;
  try {
    prev = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
  } catch {
    prev = null;
  }
  const news = await collect({ prev });
  if (!news.stories.length) throw new Error('一条新闻都没拿到, 不写 (留着上次的)');
  const out = { ...news, at: new Date().toISOString() };
  if (dry) {
    console.log(JSON.stringify(out, null, 1));
    return;
  }
  if (prev && sameNews(prev, out)) {
    console.error('跟上次一样, 不改');
    return;
  }
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(out)}\n`);
  console.error(`写好 news/latest.json: ${out.stories.length} 条新闻, ${Object.keys(out.articles).length} 篇正文, ${(JSON.stringify(out).length / 1024).toFixed(0)} KB`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
