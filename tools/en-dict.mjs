// 生成 js/endict/<字母>.js: 邸报英文文章「点一个词看中文意思」用的英汉小词典 (v1.81)。
// 资料是 ECDICT (https://github.com/skywind3000/ECDICT, MIT 许可, 许可写在 js/LICENSE-ecdict.txt) 的 ecdict.csv (77 万条, 66 MB):
//   只留常用的 (英国国家语料库 BNC / 当代美国英语语料库 COCA 前 4 万、考试词表里有的、柯林斯星级、牛津 3000、有英文解释的专有名词), 只要单个的词;
//   中文意思只留前三行 (先要一般的意思, [医] [计] [网络] 这种专门的往后放)
//   动词、名词的变形 (went、children、bigger) 指到原形 (exchange 一栏), 点 went 也能查到 go
//   node tools/en-dict.mjs <ecdict.csv>
// 一个字母一个文件 (export default { 词: [音标, 中文意思, 原形?, 变形的种类?] 或 '=原形:变形的种类' }; 种类: p 过去式 d 过去分词 i 现在分词 3 第三人称单数 r 比较级 t 最高级 s 复数), 网页上点到哪个字母的词才下载那个 (sw.js 的 LAZY)

import { readFileSync, writeFileSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs';

const [src] = process.argv.slice(2);
if (!src) {
  console.error('用法: node tools/en-dict.mjs <ecdict.csv>');
  process.exit(1);
}
const RANK = 40000;
const LINES = 3;
const LINE_MAX = 60;
const WORD = /^[A-Za-z][A-Za-z'-]{0,24}$/;

// CSV: 双引号括起来的一栏里可以有逗号、换行 ("" 是一个双引号)
function* rows(text) {
  let i = 0;
  const n = text.length;
  while (i < n) {
    const row = [];
    for (;;) {
      let v = '';
      if (text[i] === '"') {
        i++;
        for (;;) {
          const q = text.indexOf('"', i);
          if (q < 0) throw new Error('引号没配对');
          v += text.slice(i, q);
          if (text[q + 1] === '"') {
            v += '"';
            i = q + 2;
          } else {
            i = q + 1;
            break;
          }
        }
      } else {
        let e = i;
        while (e < n && text[e] !== ',' && text[e] !== '\n' && text[e] !== '\r') e++;
        v = text.slice(i, e);
        i = e;
      }
      row.push(v);
      if (text[i] === ',') {
        i++;
        continue;
      }
      if (text[i] === '\r') i++;
      if (text[i] === '\n') i++;
      break;
    }
    yield row;
  }
}

// 中文意思: 一行一个词性; [网络] [医] 这种专门的放后面, 最多三行
export function shortTrans(raw) {
  const lines = String(raw)
    .split(/\\n|\n/)
    .map((x) => x.trim())
    .filter(Boolean);
  const plain = lines.filter((x) => !/^\[[^\]]+\]/.test(x));
  const special = lines.filter((x) => /^\[[^\]]+\]/.test(x) && !/^\[网络\]/.test(x));
  const web = lines.filter((x) => /^\[网络\]/.test(x));
  return [...plain, ...special, ...web]
    .slice(0, LINES)
    .map((x) => (x.length > LINE_MAX ? `${x.slice(0, LINE_MAX - 1)}…` : x))
    .join('\n');
}

const text = readFileSync(src, 'utf8');
const it = rows(text);
const head = it.next().value;
const col = Object.fromEntries(head.map((k, i) => [k, i]));
for (const k of ['word', 'phonetic', 'definition', 'translation', 'collins', 'oxford', 'tag', 'bnc', 'frq', 'exchange']) if (!(k in col)) throw new Error(`ecdict.csv 没有「${k}」这一栏`);

const all = new Map(); // 词 → { ph, tr, ex }
const keep = new Set();
let total = 0;
for (const r of it) {
  total++;
  const w = r[col.word];
  if (!WORD.test(w)) continue;
  const tr = shortTrans(r[col.translation] ?? '');
  if (!tr) continue;
  const bnc = Number(r[col.bnc]) || 0;
  const frq = Number(r[col.frq]) || 0;
  // 大写开头的专有名词 (NATO、Kremlin、Taliban): 有英文解释的 (在 WordNet 里, 算有名的) 也留着, 新闻里常见
  const proper = /^[A-Z]/.test(w) && Boolean(r[col.definition]?.trim());
  const common = (bnc > 0 && bnc <= RANK) || (frq > 0 && frq <= RANK) || Boolean(r[col.tag]?.trim()) || r[col.oxford] === '1' || Number(r[col.collins]) > 0 || proper;
  all.set(w, { ph: (r[col.phonetic] ?? '').trim(), tr, ex: r[col.exchange] ?? '' });
  if (common) keep.add(w);
}

// exchange: 'p:went/d:gone/i:going/3:goes' (原形那条), '0:go/1:p' (变形那条: 0 是原形, 1 是哪种变形)
const exOf = (ex) => Object.fromEntries(String(ex).split('/').map((p) => p.split(':')).filter((p) => p.length === 2 && p[1]));
const out = new Map();
for (const w of keep) {
  const e = all.get(w);
  const ex = exOf(e.ex);
  const v = [e.ph, e.tr];
  // 这个词本身是别的词的变形 (left 是 leave 的过去式): 也写上原形, 网页上两个意思都给
  if (ex['0'] && ex['0'] !== w && keep.has(ex['0'])) v.push(ex['0'], ex['1'] ?? '');
  out.set(w, v);
}
// 变形指到原形: 只给没有自己一条的 ('=go:p': went 是 go 的过去式)
const forms = new Map(); // 变形 → { lemma, kinds }
for (const w of keep) {
  const ex = exOf(all.get(w).ex);
  for (const k of ['p', 'd', 'i', '3', 'r', 't', 's']) {
    for (const f of String(ex[k] ?? '').split(',')) {
      if (!WORD.test(f) || out.has(f)) continue;
      const got = forms.get(f);
      if (!got) forms.set(f, { lemma: w, kinds: k });
      else if (got.lemma === w && !got.kinds.includes(k)) got.kinds += k;
    }
  }
}
for (const [f, { lemma, kinds }] of forms) out.set(f, `=${lemma}:${kinds}`);
const links = forms.size;

const dir = new URL('../js/endict/', import.meta.url);
mkdirSync(dir, { recursive: true });
for (const f of readdirSync(dir)) if (f.endsWith('.js')) unlinkSync(new URL(f, dir));
const groups = {};
for (const [w, v] of [...out].sort((a, b) => (a[0] < b[0] ? -1 : 1))) (groups[w[0].toLowerCase()] ??= []).push([w, v]);
let bytes = 0;
for (const [letter, list] of Object.entries(groups)) {
  const body = `// ${letter} 开头的词: tools/en-dict.mjs 从 ECDICT (MIT 许可, 见 js/LICENSE-ecdict.txt) 生成, 别手改\nexport default {\n${list.map(([w, v]) => `${JSON.stringify(w)}:${JSON.stringify(v)},`).join('\n')}\n};\n`;
  writeFileSync(new URL(`${letter}.js`, dir), body);
  bytes += Buffer.byteLength(body);
}
console.log(`ECDICT ${total} 条, 留 ${keep.size} 个词 + ${links} 个变形, ${Object.keys(groups).length} 个文件, 共 ${(bytes / 1048576).toFixed(1)} MB`);
