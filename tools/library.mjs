// 生成书库 (阅读) 的书: js/library/<书>.js (简体)、js/library/hant/<书>.js (繁体原文)、js/library/books.js (书目)。
// 原文来自开源项目 chinese-poetry (https://github.com/chinese-poetry/chinese-poetry, MIT, 见 js/library/LICENSE-chinese-poetry.txt) 的「蒙学」和宋词三百首,
// 蒙学那里是繁体, 简体用 OpenCC (opencc-js) 自动转; 宋词三百首那里是简体, 繁体用 OpenCC 转回去。只在更新书库时跑, 网页和 App 不用 OpenCC。
//   node tools/library.mjs <放原文的文件夹> [opencc-js 的 dist/esm/full.js]
//   文件夹里要有: 蒙学的那些 json,「宋词/宋词三百首.json」(改名成 songci300.json), 和放《全宋词》(宋词/ci.song.*.json) 的 ci 文件夹 (补字用)
// 每本书的篇目顺序别改: 收藏、读到哪记的是「书:第几篇」

import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const [src, openccPath = 'opencc-js'] = process.argv.slice(2);
if (!src) {
  console.error('用法: node tools/library.mjs <放原文的文件夹> [opencc-js 的 full.js]');
  process.exit(1);
}
const OpenCC = await import(openccPath.startsWith('/') ? pathToFileURL(openccPath).href : openccPath);
const convert = OpenCC.Converter({ from: 't', to: 'cn' });
// 繁体转简体; 转出来是很少见的字 (像「紞」转成「𬘘」, 很多字体里没有, 会显示成方框) 就留原来的字
function t2s(text) {
  const from = [...text];
  const to = [...convert(text)];
  if (from.length !== to.length) return to.join('');
  return to.map((ch, i) => (ch.codePointAt(0) > 0xffff && from[i].codePointAt(0) <= 0xffff ? from[i] : ch)).join('');
}
const s2t = OpenCC.Converter({ from: 'cn', to: 't' });

const root = new URL('..', import.meta.url).pathname;
const read = (name) => JSON.parse(readFileSync(join(src, name), 'utf8'));
const tidy = (s) => String(s).replace(/\s+/g, ' ').trim();

// 没分篇的长文切成一段一段 (每段 n 句), 段名是这段的头一句
function chunk(lines, n) {
  const out = [];
  for (let i = 0; i < lines.length; i += n) out.push(lines.slice(i, i + n));
  return out.map((p) => ({ t: firstClause(p[0]), p }));
}
const firstClause = (line) => line.split(/[，。；：？！、,.;:?!]/)[0];

// 「（唐）孟浩然」→ { a: '孟浩然', e: '唐' }
function byline(s) {
  const m = tidy(s).match(/^[（(]([^）)]+)[）)]\s*(.+)$/);
  return m ? { a: m[2], e: m[1] } : { a: tidy(s), e: '' };
}

// 句子里的版本注释拿出来: 「春草明年綠，王孫歸不歸？(明年 一作：年年)」→ 句子「春草明年綠，王孫歸不歸？」, 注「明年 一作：年年」
// (有的注没写完, 像「(回樂」, 不要)
function withNotes(lines) {
  const notes = [];
  const p = lines.map((l) =>
    tidy(
      tidy(l).replace(/\s*[（(]([^（()）]*)(?:[）)]|$)/g, (_, note) => {
        if (note.includes('：')) notes.push(tidy(note));
        return '';
      }),
    ),
  );
  return notes.length ? { p, n: notes } : { p };
}

// 词牌「凤栖梧・蝶恋花」(别名・正名) 用正名
const tune = (s) => tidy(s).split(/[・·]/).pop();

// ---- 宋词三百首的资料丢了一些生僻字 ----
// 「花悰暗省」成了「花暗省」, 作者「张镃」成了「张」。照同一个资料库的《全宋词》补回来:
// 只补丢掉的字; 两边写法不同的地方 (版本不同, 像苏轼「萧瑟 / 潇洒」) 照宋词三百首的
const AUTHOR_FIX = { 韩: '韩疁', 张: '张镃' }; // 《全宋词》里也丢了字的作者 (韩疁《高阳台·除夜》, 张镃《宴山亭·幽梦初回》)

// a 里比 b 少的字: [{ at 在 a 的第几个字前面, text }] (按最长公共子序列对齐, 只要 a 这边什么都没有的空当)
function missing(a, b) {
  const A = [...a];
  const B = [...b];
  const n = A.length;
  const m = B.length;
  const L = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const gaps = [];
  let i = 0;
  let j = 0;
  let ga = 0; // 这个空当里 a 有几个字
  let gb = '';
  const flush = () => {
    if (gb && !ga) gaps.push({ at: i, text: gb });
    ga = 0;
    gb = '';
  };
  while (i < n || j < m) {
    if (i < n && j < m && A[i] === B[j]) {
      flush();
      i++;
      j++;
    } else if (j < m && (i === n || L[i][j + 1] >= L[i + 1][j])) gb += B[j++];
    else {
      ga++;
      i++;
    }
  }
  flush();
  return { gaps, same: L[0][0] / Math.max(n, m, 1) };
}

// 补到一行一行里: 空当正好在两行中间 (上一行以标点结尾) 时补在下一行开头
function fillGaps(lines, gaps) {
  const out = [...lines];
  for (const { at, text } of [...gaps].sort((x, y) => y.at - x.at)) {
    let start = 0;
    for (let k = 0; k < out.length; k++) {
      const len = [...out[k]].length;
      const end = start + len;
      const boundary = at === end && k + 1 < out.length;
      if (at < end || (at === end && !boundary)) {
        const chars = [...out[k]];
        chars.splice(at - start, 0, text);
        out[k] = chars.join('');
        break;
      }
      start = end;
    }
  }
  return out;
}

function fixSongci(list) {
  const dir = join(src, 'ci');
  const full = readdirSync(dir)
    .filter((f) => /^ci\.song\.\d+\.json$/.test(f))
    .flatMap((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')));
  if (!full.length) throw new Error('没找到《全宋词》(ci 文件夹), 补不了字');
  const tunes = (r) => new Set(tidy(r).split(/[・·]/));
  let filled = 0;
  const out = list.map((x) => {
    const a = x.paragraphs.join('');
    const mine = tunes(x.rhythmic);
    let best = null;
    for (const y of full) {
      if (!y.author.startsWith(x.author) || ![...tunes(y.rhythmic)].some((t) => mine.has(t))) continue;
      const r = missing(a, y.paragraphs.join(''));
      if (!best || r.same > best.r.same) best = { y, r };
    }
    const author = AUTHOR_FIX[x.author] ?? (best && best.r.same >= 0.9 ? best.y.author : x.author);
    if (!best || best.r.same < 0.9) return { ...x, author };
    filled += best.r.gaps.length;
    return { ...x, author, paragraphs: fillGaps(x.paragraphs.map(tidy), best.r.gaps) };
  });
  console.log(`宋词三百首: 从《全宋词》补了 ${filled} 处丢掉的字`);
  return out;
}

// 两句一对: 「天地玄黃」「宇宙洪荒」→「天地玄黃，宇宙洪荒。」
const pairs = (items) => {
  const out = [];
  for (let i = 0; i < items.length; i += 2) out.push(items[i + 1] ? `${items[i]}，${items[i + 1]}。` : `${items[i]}。`);
  return out;
};

// 简介是自己写的 (原文资料里的简介太长)。source: 'hans' 原文是简体 (繁体是转回去的)
const BOOKS = [
  {
    id: 'tangshi',
    file: 'tangshisanbaishou.json',
    era: '清',
    unit: '首',
    kind: 'poem',
    intro: '清代蘅塘退士（孙洙）从唐诗里选出的名篇，「床前明月光」「白日依山尽」「红豆生南国」都在里面。分五言绝句、七言绝句、五言律诗、七言律诗、五言古诗、七言古诗、乐府。',
    build: (d) => ({
      author: '蘅塘退士',
      groups: d.content.map((g) => tidy(g.type)),
      pieces: d.content.flatMap((g, gi) => g.content.map((c) => ({ t: tidy(c.chapter), a: tidy(c.author), e: '唐', g: gi, ...withNotes(c.paragraphs) }))),
    }),
  },
  {
    id: 'songci',
    file: 'songci300.json',
    source: 'hans',
    title: '宋词三百首',
    era: '民国',
    unit: '首',
    kind: 'poem',
    intro: '近代朱孝臧（上彊村民）选编的宋词名篇，按词人分组，「明月几时有」「寻寻觅觅，冷冷清清」「十年生死两茫茫」都在里面。原书前后几个版本篇数不同，这里有 280 首。',
    // 题目是「词牌·第一句」; 按词人分组 (照资料里先出现的顺序)
    build: (raw) => {
      const d = fixSongci(raw);
      const groups = [...new Set(d.map((x) => tidy(x.author)))];
      const pieces = d.map((x) => ({ t: `${tune(x.rhythmic)}·${firstClause(tidy(x.paragraphs[0]))}`, a: tidy(x.author), e: '宋', g: groups.indexOf(tidy(x.author)), p: x.paragraphs.map(tidy) }));
      return { author: '朱孝臧', groups, pieces: groups.flatMap((_, gi) => pieces.filter((x) => x.g === gi)) };
    },
  },
  {
    id: 'sanzijing',
    file: 'sanzijing-traditional.json',
    era: '宋',
    unit: '段',
    intro: '三个字一句，讲做人的道理、历史和常识，是古代孩子识字读书的第一本书。相传为南宋王应麟所编，这里是传统版。',
    build: (d) => ({ author: d.author, groups: [], pieces: chunk(d.paragraphs.map(tidy), 12) }),
  },
  {
    id: 'baijiaxing',
    file: 'baijiaxing.json',
    era: '北宋',
    unit: '段',
    intro: '把常见的姓连成四字一句的韵文，「赵钱孙李，周吴郑王」。北宋初年编成。',
    build: (d) => ({ author: d.author, groups: [], pieces: chunk(d.paragraphs.map(tidy), 12) }),
  },
  {
    id: 'qianziwen',
    file: 'qianziwen.json',
    era: '南朝梁',
    unit: '段',
    intro: '一千个字，没有一个重复，四字一句，从天地讲到人事。南朝梁周兴嗣编。',
    build: (d) => ({ author: d.author, groups: [], pieces: chunk(pairs(d.paragraphs.map(tidy)), 12) }),
  },
  {
    id: 'dizigui',
    file: 'dizigui.json',
    era: '清',
    unit: '章',
    intro: '三个字一句，讲孩子在家孝顺父母、出门对人、说话做事的规矩。清代李毓秀作。',
    // 原文三字一组用空格隔开, 加上标点: 「弟子规，圣人训。首孝弟，次谨信。」
    build: (d) => ({ author: d.author, groups: [], pieces: d.content.map((c) => ({ t: tidy(c.chapter), p: c.paragraphs.map((l) => pairs(tidy(l).split(' ')).join('')) })) }),
  },
  {
    id: 'qianjiashi',
    file: 'qianjiashi.json',
    era: '宋·明',
    unit: '首',
    kind: 'poem',
    intro: '古时候孩子学诗的入门诗集，选的多是唐宋名家的诗，「春眠不觉晓」就在里面。分五言绝句、七言绝句、五言律诗、七言律诗。南宋谢枋得、明代王相选编。',
    build: (d) => ({
      author: d.author,
      groups: d.content.map((g) => tidy(g.type)),
      pieces: d.content.flatMap((g, gi) => g.content.map((c) => ({ t: tidy(c.chapter), ...byline(c.author), g: gi, p: c.paragraphs.map(tidy) }))),
    }),
  },
  {
    id: 'shenglvqimeng',
    file: 'shenglvqimeng.json',
    era: '清',
    unit: '章',
    intro: '学对对子、学声韵的书，「云对雨，雪对风，晚照对晴空」。按韵编排，一个韵一章。清代车万育作。',
    build: (d) => ({ author: d.author, groups: d.content.map((v) => tidy(v.title)), pieces: d.content.flatMap((v, gi) => v.content.map((c) => ({ t: tidy(c.chapter), g: gi, p: c.paragraphs.map(tidy) }))) }),
  },
  {
    id: 'zengguangxianwen',
    file: 'zengguangxianwen.json',
    era: '明',
    unit: '段',
    intro: '收集了很多俗语和格言，「一寸光阴一寸金」「路遥知马力，日久见人心」都出自这里。明代编成，作者不详。',
    build: (d) => {
      const groups = d.content.map((c) => tidy(c.chapter));
      return { author: d.author, groups, pieces: d.content.flatMap((c, gi) => chunk(c.paragraphs.map(tidy), 20).map((p) => ({ ...p, g: gi }))) };
    },
  },
  {
    id: 'zhuzijiaxun',
    file: 'zhuzijiaxun.json',
    era: '明末清初',
    unit: '篇',
    intro: '讲怎样持家过日子的格言，「黎明即起，洒扫庭除」「一粥一饭，当思来处不易」。明末清初朱柏庐作，又叫《朱子治家格言》。',
    build: (d) => ({ author: d.author, groups: [], pieces: [{ t: '全文', p: d.paragraphs.map(tidy) }] }),
  },
  {
    id: 'youxueqionglin',
    file: 'youxueqionglin.json',
    era: '明·清',
    unit: '章',
    intro: '用对偶的句子讲天文、地理、人物、典故，读了能知道很多成语的来历。明代程登吉编，清代邹圣脉增补。',
    build: (d) => ({ author: d.author, groups: d.content.map((v) => tidy(v.title)), pieces: d.content.flatMap((v, gi) => v.content.map((c) => ({ t: tidy(c.chapter), g: gi, p: c.paragraphs.map(tidy) }))) }),
  },
];

// 一本书: 每篇 { t 题目, a 作者 (诗才有), e 朝代 (诗才有), g 第几组 (有分组才有), p 一行一行 }
function piecesText(pieces, conv) {
  return pieces.map((x) => {
    const out = { t: conv(x.t) };
    if (x.a) out.a = conv(x.a);
    if (x.e) out.e = conv(x.e);
    if (x.g !== undefined) out.g = x.g;
    out.p = x.p.map(conv);
    if (x.n) out.n = x.n.map(conv);
    return out;
  });
}

function moduleText(head, book) {
  const { pieces, ...rest } = book;
  const body = Object.entries(rest)
    .map(([k, v]) => `  ${k}: ${JSON.stringify(v)},`)
    .join('\n');
  return `${head}\nexport default {\n${body}\n  pieces: [\n${pieces.map((p) => `    ${JSON.stringify(p)},`).join('\n')}\n  ],\n};\n`;
}

mkdirSync(join(root, 'js/library/hant'), { recursive: true });
const catalog = [];
for (const b of BOOKS) {
  const d = read(b.file);
  const built = b.build(d);
  // 原文是繁体: 繁体照原样, 简体转; 原文是简体: 简体也过一遍 (夹着的「後」这种改过来), 繁体转回去
  const title = tidy(b.title ?? d.title);
  const hantOf = b.source === 'hans' ? s2t : (s) => s;
  const hans = { id: b.id, title: t2s(title), author: t2s(tidy(built.author)), groups: built.groups.map(t2s), pieces: piecesText(built.pieces, t2s) };
  const hant = { id: b.id, title: hantOf(title), author: hantOf(tidy(built.author)), groups: built.groups.map(hantOf), pieces: piecesText(b.source === 'hans' ? hans.pieces : built.pieces, hantOf) };
  const head = `// 《${hans.title}》: tools/library.mjs 从 chinese-poetry (MIT, 见 LICENSE-chinese-poetry.txt) 生成, 别手改`;
  writeFileSync(join(root, `js/library/${b.id}.js`), moduleText(`${head}。${b.source === 'hans' ? '简体原文' : '繁体原文自动转的简体'}`, hans));
  writeFileSync(join(root, `js/library/hant/${b.id}.js`), moduleText(`${head}。${b.source === 'hans' ? '简体原文自动转的繁体' : '繁体原文'}`, hant));
  catalog.push({ id: b.id, title: hans.title, author: hans.author, era: b.era, kind: b.kind ?? 'text', unit: b.unit, count: hans.pieces.length, intro: b.intro });
  console.log(`${hans.title}: ${hans.pieces.length} ${b.unit}`);
}

writeFileSync(
  join(root, 'js/library/books.js'),
  `// 书库的书目: tools/library.mjs 生成, 别手改。书的正文在 js/library/<id>.js (简体)、js/library/hant/<id>.js (繁体)\n` +
    `// kind: poem 一首一首的诗 (有作者、朝代), text 文章; unit: 一篇叫什么 (首、段、章、篇)\n` +
    `export const BOOKS = [\n${catalog.map((c) => `  ${JSON.stringify(c)},`).join('\n')}\n];\n` +
    `export const SOURCE = ${JSON.stringify({ name: 'chinese-poetry', url: 'https://github.com/chinese-poetry/chinese-poetry', license: 'MIT' })};\n`,
);
