// 生成书库里的长篇小说。书太大 (《西游记》五六十万字), 不能一打开就整本下载, 所以一回一个文件, 读到哪回才下载哪回 (js/reading.js 的 loadChapter):
//   js/library/<书>.js           目录: { id, title, author, groups: [], pieces: [{ t 回目 }] } (简体; 繁体在 js/library/hant/<书>.js)
//   js/library/<书>/001.js …     一回的正文: { p: [一段一段], v?: [哪几段是诗句 (第几段, 从 0 数)], n?: [版本不同的字], note?: 说明 } (繁体在 js/library/hant/<书>/)
// 书目 (js/library/books.js) 还是 tools/library.mjs 写: 先跑这个, 再跑 library.mjs。
//
// 现在只有《西游记》:
//   底本: 维基文库《西遊記》https://zh.wikisource.org/wiki/西遊記 (一百回), 用 API 拿每回的 wikitext, 存成 <文件夹>/ws/001.json … 100.json:
//         https://zh.wikisource.org/w/api.php?action=parse&page=西遊記/第001回&prop=wikitext|revid&format=json (下快了会被限速, 一回隔几秒)
//   对照: 古登堡计划 (Project Gutenberg) #23962《西遊記》https://www.gutenberg.org/ebooks/23962 , 存成 <文件夹>/pg23962.txt
//   两份是同一个本子 (清代流传的排法: 第九回「陈光蕊赴任逢灾」讲唐僧出身, 是清康熙年间汪象旭、黄周星加进去的;
//   现在常见的人民文学出版社版以明代世德堂本为底本, 把这一回放在附录), 各有小毛病: 古登堡丢了生僻字 (「栰」「帓」), 第一回把一百多字重抄了一遍;
//   维基文库标着「校对程度 25%」。照维基文库; 两份连续四个字以上不一样的地方印出来 (compare.txt), 一处一处看, 维基文库错了的写进 FIX 改。
//   异体字 (「裡 / 裏」) 这种小差别照维基文库, 不列。
//   繁体照原样, 简体用 OpenCC (opencc-js 1.4.2, 跟 library.mjs 一样) 转。
//
//   node tools/novel.mjs <放原文的文件夹> [opencc-js 的 dist/esm/full.js]

import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const [src, openccPath = 'opencc-js'] = process.argv.slice(2);
if (!src) {
  console.error('用法: node tools/novel.mjs <放原文的文件夹> [opencc-js 的 full.js]');
  process.exit(1);
}
const OpenCC = await import(openccPath.startsWith('/') ? pathToFileURL(openccPath).href : openccPath);
const convert = OpenCC.Converter({ from: 't', to: 'cn' });
// 繁体转简体; 转出来是很少见的字 (多数字体里没有, 会显示成方框) 就留原来的字 (跟 library.mjs 一样)
function t2s(text) {
  const from = [...text];
  const to = [...convert(text)];
  if (from.length !== to.length) return to.join('');
  return to.map((ch, i) => (ch.codePointAt(0) > 0xffff && from[i].codePointAt(0) <= 0xffff ? from[i] : ch)).join('');
}
const root = new URL('..', import.meta.url).pathname;
const HAN = /[㐀-鿿豈-﫿\u{20000}-\u{3134f}]/u;

// ---- 维基文库的 wikitext → 一段一段 ----
// 模板: {{另|甲|乙}} 版本不同 (取甲, 记成「甲 一作：乙」), {{CJK-New-Char|字|…}} 生僻字 (取字); header / footer / 版权模板去掉。
// 「:」开头的行是缩进的诗句, 一行一段; 别的连着的几行是一段, 空行分段
// verses: 给了的话, 把「:」开头的诗句是第几段记进去 (读的时候居中排)
function cleanWiki(text, variants, verses = null) {
  let t = text.replace(/\{\{header[\s\S]*?\n\}\}/i, '');
  t = t.replace(/<!--[\s\S]*?-->/g, '').replace(/<ref[^>]*\/>/g, '').replace(/<ref[\s\S]*?<\/ref>/g, '');
  t = t.replace(/\{\{另\|([^|}]*)\|([^}]*)\}\}/g, (_, a, b) => {
    variants.push(`${a} 一作：${b.split('|').join('、')}`);
    return a;
  });
  t = t.replace(/\{\{CJK-New-Char\|([^|}]*)[^}]*\}\}/gi, '$1');
  // 简繁转换标记 -{zh-hans:徵;zh-hant:徵}- (第六十八回「魏徵」): 取繁体那个; 只有一个字的 -{字}- 取那个字
  t = t.replace(/-\{([^}]*)\}-/g, (_, x) => (/zh-hant:([^;]*)/.exec(x) ?? /zh-tw:([^;]*)/.exec(x) ?? /zh-hans:([^;]*)/.exec(x) ?? [, x])[1]);
  t = t.replace(/\{\{[^}]*\}\}/g, '');
  t = t.replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1').replace(/'''?/g, '').replace(/<br\s*\/?>/gi, '').replace(/<[^>]+>/g, '');
  const out = [];
  let cur = '';
  const flush = () => {
    if (cur.trim()) out.push({ s: cur.trim() });
    cur = '';
  };
  for (const raw of t.split('\n')) {
    const line = raw.replace(/\s+$/, '');
    if (!line.trim()) flush();
    else if (/^[:：]/.test(line)) {
      flush();
      out.push({ s: line.replace(/^[:：]+\s*/, '').trim(), v: true });
    } else cur += line.trim();
  }
  flush();
  const kept = out.filter((x) => HAN.test(x.s));
  if (verses) kept.forEach((x, i) => x.v && verses.push(i));
  return kept.map((x) => tidyLine(x.s));
}

// 一段里: 画表格的线「──」换成破折号「——」, 空格去掉, 半角标点换成全角 (「(上有寶印九顆)」「去來?」「．」)
const tidyLine = (s) =>
  s
    .replace(/─/g, '—')
    .replace(/[ 　]+/g, '')
    .replace(/\(/g, '（')
    .replace(/\)/g, '）')
    .replace(/\?/g, '？')
    .replace(/:/g, '：')
    .replace(/;/g, '；')
    .replace(/．/g, '。');

// ---- 古登堡那份: 按「第X回」切开, 去掉换行和缩进 (只拿来补字, 分段照维基文库) ----
function pgChapters(text) {
  const start = text.indexOf('*** START OF');
  const end = text.indexOf('*** END OF');
  const body = text.slice(text.indexOf('\n', start) + 1, end);
  const heads = [...body.matchAll(/^[ 　]*第[一二三四五六七八九十百〇零]+回[^\n]*$/gm)]; // 第八十三回前面多一个空格
  return heads.map((m, k) => body.slice(m.index + m[0].length, heads[k + 1]?.index ?? body.length).replace(/[\s　]+/g, '').replace(/﹔/g, '；').replace(/﹖/g, '？').replace(/﹗/g, '！'));
}

// ---- 两份对照 (Myers 差分, 只比汉字): 返回维基文库那份补好的段落和补了什么 ----
function diffOps(a, b) {
  const n = a.length;
  const m = b.length;
  const max = n + m;
  const off = max + 1;
  const v = new Int32Array(2 * max + 3);
  const trace = [];
  for (let d = 0; d <= max; d++) {
    trace.push(v.slice(off - d - 1, off + d + 2));
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && v[off + k - 1] < v[off + k + 1]) ? v[off + k + 1] : v[off + k - 1] + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) {
        x++;
        y++;
      }
      v[off + k] = x;
      if (x >= n && y >= m) return backtrack(trace, n, m);
    }
  }
  throw new Error('差分算不出来');
}
function backtrack(trace, n, m) {
  const ops = []; // ['=', ai, bi] | ['-', ai] | ['+', bi], 从后往前
  let x = n;
  let y = m;
  for (let d = trace.length - 1; d >= 0; d--) {
    const snap = trace[d]; // 第 d 步之前的 v, k 从 -d-1 到 d+1
    const at = (k) => snap[k + d + 1];
    const k = x - y;
    const prevK = k === -d || (k !== d && at(k - 1) < at(k + 1)) ? k + 1 : k - 1;
    const prevX = d === 0 ? 0 : at(prevK);
    const prevY = prevX - prevK;
    while (x > prevX && y > prevY) ops.push(['=', --x, --y]);
    if (d > 0) ops.push(x === prevX ? ['+', --y] : ['-', --x]);
    x = prevX;
    y = prevY;
  }
  return ops.reverse();
}

// 两份不一样的地方 (只比汉字): 连续 min 个字以上的列出来 (前后各带几个字, 方便找), 给人一处一处看; 程序不自己改
function compareChapter(paras, pg, min = 4) {
  const w = [...paras.join('')].filter((ch) => HAN.test(ch));
  const g = [...pg].filter((ch) => HAN.test(ch));
  const ops = diffOps(w, g);
  const out = [];
  for (let k = 0; k < ops.length; ) {
    if (ops[k][0] === '=') {
      k++;
      continue;
    }
    let j = k;
    const del = [];
    const ins = [];
    while (j < ops.length && ops[j][0] !== '=') (ops[j][0] === '-' ? del : ins).push(ops[j][1]), j++;
    if (del.length >= min || ins.length >= min) {
      const at = ops[k - 1]?.[1] ?? 0;
      out.push({ before: w.slice(Math.max(0, at - 5), at + 1).join(''), wiki: del.map((i) => w[i]).join(''), pg: ins.map((i) => g[i]).join('') });
    }
    k = j;
  }
  return out;
}

// ---- 维基文库的错, 一条一条看过才改 (第几回, 原来的一小段, 改成) ----
// 跟古登堡对出来、连续四个字以上不一样的地方 (程序印出来), 看上下文定哪边对。2026-11-07 一百回对下来只有 10 处, 都是维基文库对:
// 第一回古登堡把「子會將終……陰陽交合」重抄了一遍; 第十二回维基文库多的几段 (太宗做法事、问锡杖) 是通行本有、古登堡那份删掉的;
// 第十四回「我就做不到『齊天大聖』了」古登堡改成「是」; 第四十七回古登堡把回目后半截混进正文; 第一百回古登堡丢了「天竺國印」。所以现在一条也不用改
const FIX = [];
function fixChapter(n, paras) {
  let out = paras;
  for (const [cn, a, b] of FIX) {
    if (cn !== n) continue;
    const hits = out.filter((p) => p.includes(a)).length;
    if (hits !== 1) throw new Error(`第 ${n} 回要改的「${a}」找到 ${hits} 处 (应该正好一处)`);
    out = out.map((p) => p.replace(a, b));
  }
  return out;
}

// ---- 《西游记》 ----
const NOVEL = { id: 'xiyouji', title: '西遊記', author: '吳承恩', count: 100 };
const pg = pgChapters(readFileSync(join(src, 'pg23962.txt'), 'utf8'));
if (pg.length !== NOVEL.count) throw new Error(`古登堡那份切出 ${pg.length} 回, 应该是 ${NOVEL.count} 回 (回目的写法变了?)`);

const chapters = [];
const report = []; // 两份不一样的地方 (写进 <文件夹>/compare.txt, 改 FIX 时看)
for (let n = 1; n <= NOVEL.count; n++) {
  const num = String(n).padStart(3, '0');
  const parse = JSON.parse(readFileSync(join(src, 'ws', `${num}.json`), 'utf8')).parse;
  const wiki = parse.wikitext['*'];
  const head = /\|[ \t]*section[ \t]*=[ \t]*([^\n]*)/.exec(wiki)?.[1] ?? '';
  const variants = [];
  // 回目两句中间隔一个全角空格 (资料里有的是半角空格); 先换成「｜」免得被 tidyLine 去掉空格
  const title = cleanWiki(head.replace(/^.*?<br\s*\/?>/i, '').trim().replace(/[ 　]+/g, '｜'), variants)[0]?.replace(/｜/g, '　');
  if (!title) throw new Error(`第 ${n} 回找不到回目`);
  const notes = /\|[ \t]*notes[ \t]*=[ \t]*([^\n]*)/.exec(wiki)?.[1]?.trim() ?? '';
  const verses = [];
  const paras = cleanWiki(wiki, variants, verses);
  for (const d of compareChapter(paras, pg[n - 1])) report.push(`第 ${n} 回 …${d.before}｜维基文库「${d.wiki}」｜古登堡「${d.pg}」`);
  const merged = fixChapter(n, paras);
  // 维基文库在第九回注明「清康熙年間汪象旭、黃周星加入附錄於此回」: 写一句我们自己的说明 (简繁都用这句, 是温故的话不是原文)
  if (notes && !notes.includes('汪象旭')) throw new Error(`第 ${n} 回有没见过的说明: ${notes}`);
  const note = notes ? '这一回讲唐僧的身世（陈光蕊遇难、江流儿报仇），是清代康熙年间汪象旭、黄周星加进去的。现在常见的人民文学出版社版以明代世德堂本为底本，把这段放在第八回后面的附录里。' : '';
  chapters.push({ t: title, p: merged, v: verses, n: variants.map((v) => v.replace(/｜/g, '　')), note });
}
writeFileSync(join(src, 'compare.txt'), `${report.join('\n')}\n`);
console.log(`《西游记》: ${NOVEL.count} 回; 跟古登堡连续四个字以上不一样的 ${report.length} 处 (列在 ${join(src, 'compare.txt')}), 照 FIX 改了 ${FIX.length} 处`);

// 写出来: 目录 + 一回一个文件, 简体、繁体各一份
const write = (path, text) => {
  mkdirSync(join(root, path, '..'), { recursive: true });
  writeFileSync(join(root, path), text);
};
const head = (hant) => `// 《西游记》: tools/novel.mjs 从维基文库 (对照古登堡计划) 生成, 别手改。${hant ? '繁体原文' : '繁体原文自动转的简体'}`;
for (const hant of [false, true]) {
  const tx = hant ? (s) => s : t2s;
  const dir = `js/library/${hant ? 'hant/' : ''}${NOVEL.id}`;
  rmSync(join(root, dir), { recursive: true, force: true });
  const index = { id: NOVEL.id, title: tx(NOVEL.title), author: tx(NOVEL.author), groups: [], pieces: chapters.map((c) => ({ t: tx(c.t) })) };
  write(`${dir}.js`, `${head(hant)}。目录 (回目), 正文一回一个文件在 ${NOVEL.id}/ 里\nexport default ${JSON.stringify(index, null, 2)};\n`);
  chapters.forEach((c, k) => {
    const body = { p: c.p.map(tx), ...(c.v.length ? { v: c.v } : {}), ...(c.n.length ? { n: c.n.map(tx) } : {}), ...(c.note ? { note: c.note } : {}) };
    write(`${dir}/${String(k + 1).padStart(3, '0')}.js`, `${head(hant)}。第 ${k + 1} 回\nexport default {\n  p: [\n${body.p.map((l) => `    ${JSON.stringify(l)},`).join('\n')}\n  ],${body.v ? `\n  v: ${JSON.stringify(body.v)},` : ''}${body.n ? `\n  n: ${JSON.stringify(body.n)},` : ''}${body.note ? `\n  note: ${JSON.stringify(body.note)},` : ''}\n};\n`);
  });
}
