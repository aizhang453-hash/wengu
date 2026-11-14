// 生成 js/chessbook-data.js: 国际象棋的开局谱 (v1.83, 复盘认「开局谱着」用)
// 资料: Lichess 整理的开局表 https://github.com/lichess-org/chess-openings (a.tsv … e.tsv; 作者声明公有领域 / CC0)
// 跑法: node tools/chess-book.mjs <放 a.tsv … e.tsv 的文件夹>
// 每条开局走一遍, 走过的每个局面都算「在谱上」; 局面记成 js/chessbook.js 的 bookKey (短编号), 配上开局的中文名。
// 中文名只翻了常见的开局 (下面的 ZH, 名字里冒号前面那段); 冷门的不写名字, 教练只说「这是开局谱上的走法」。

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Chess } from '../js/vendor/chess.js';
import { bookKey } from '../js/chessbook.js';

const ZH = {
  'Sicilian Defense': '西西里防御',
  'Ruy Lopez': '西班牙开局',
  'French Defense': '法兰西防御',
  "Queen's Gambit Declined": '后翼弃兵拒绝',
  "Queen's Gambit Accepted": '后翼弃兵接受',
  "Queen's Gambit": '后翼弃兵',
  'Italian Game': '意大利开局',
  'English Opening': '英国式开局',
  "King's Gambit Accepted": '王翼弃兵接受',
  "King's Gambit Declined": '王翼弃兵拒绝',
  "King's Gambit": '王翼弃兵',
  "King's Indian Defense": '古印度防御',
  "King's Indian Attack": '古印度进攻',
  'Caro-Kann Defense': '卡罗-康防御',
  'Nimzo-Indian Defense': '尼姆佐维奇印度防御',
  "Queen's Pawn Game": '后兵开局',
  'Semi-Slav Defense': '半斯拉夫防御',
  'Semi-Slav Defense Accepted': '半斯拉夫防御',
  'Slav Defense': '斯拉夫防御',
  'Dutch Defense': '荷兰防御',
  'Benoni Defense': '别诺尼防御',
  'Grünfeld Defense': '格林菲尔德防御',
  'Neo-Grünfeld Defense': '新格林菲尔德防御',
  "Queen's Indian Defense": '新印度防御',
  'Indian Defense': '印度防御',
  'Old Indian Defense': '旧印度防御',
  'Alekhine Defense': '阿廖欣防御',
  'Scotch Game': '苏格兰开局',
  "Petrov's Defense": '彼得罗夫防御',
  'Four Knights Game': '四马开局',
  'Three Knights Opening': '三马开局',
  'Scandinavian Defense': '斯堪的纳维亚防御',
  'Philidor Defense': '菲利多尔防御',
  'Réti Opening': '列蒂开局',
  'Vienna Game': '维也纳开局',
  'Vienna Gambit': '维也纳弃兵',
  'Zukertort Opening': '列蒂开局',
  'Nimzo-Larsen Attack': '拉森开局',
  "Bishop's Opening": '象开局',
  'Modern Defense': '现代防御',
  "King's Pawn Game": '王兵开局',
  "King's Pawn Opening": '王兵开局',
  "King's Knight Opening": '王马开局',
  'Catalan Opening': '卡塔兰开局',
  'Pirc Defense': '皮尔茨防御',
  'Bird Opening': '伯德开局',
  'Tarrasch Defense': '塔拉什防御',
  'Polish Opening': '波兰开局',
  'Hungarian Opening': '匈牙利开局',
  'Center Game': '中心开局',
  'Center Game Accepted': '中心开局',
  'Latvian Gambit': '拉脱维亚弃兵',
  'Latvian Gambit Accepted': '拉脱维亚弃兵',
  'Ponziani Opening': '庞齐亚尼开局',
  'Danish Gambit': '丹麦弃兵',
  'Danish Gambit Accepted': '丹麦弃兵',
  'Danish Gambit Declined': '丹麦弃兵',
  'London System': '伦敦体系',
  'Colle System': '科勒体系',
  'Torre Attack': '托雷进攻',
  'Trompowsky Attack': '特罗姆波夫斯基进攻',
  'Benko Gambit': '伏尔加弃兵',
  'Benko Gambit Accepted': '伏尔加弃兵',
  'Benko Gambit Declined': '伏尔加弃兵',
  'Englund Gambit': '英格伦弃兵',
  'Englund Gambit Declined': '英格伦弃兵',
  'Elephant Gambit': '大象弃兵',
  'Blackmar-Diemer Gambit': '布莱克马-迪默弃兵',
  'Blackmar-Diemer Gambit Accepted': '布莱克马-迪默弃兵',
  'Blackmar-Diemer Gambit Declined': '布莱克马-迪默弃兵',
  'Bogo-Indian Defense': '波哥印度防御',
  'English Defense': '英国式防御',
  'Owen Defense': '欧文防御',
  'Nimzowitsch Defense': '尼姆佐维奇防御',
  'Hippopotamus Defense': '河马防御',
  'Grob Opening': '格罗布开局',
};

// 冒号前面那段是开局的大名; 「…, with e3」这种逗号后面的也去掉再找一次
function zhName(name) {
  const fam = name.split(':')[0].trim();
  return ZH[fam] ?? ZH[fam.split(',')[0].trim()] ?? '';
}

const dir = process.argv[2];
if (!dir) {
  console.error('用法: node tools/chess-book.mjs <放 a.tsv … e.tsv 的文件夹>');
  process.exit(1);
}

const lines = [];
for (const f of ['a', 'b', 'c', 'd', 'e']) {
  for (const row of readFileSync(join(dir, `${f}.tsv`), 'utf8').split(/\r?\n/).slice(1)) {
    const [eco, name, pgn] = row.split('\t');
    if (eco && name && pgn) lines.push({ name, pgn });
  }
}

// 先认每条开局走完的那个局面叫什么 (同一个局面有几个名字的, 留第一个)
const games = [];
const exact = new Map();
for (const l of lines) {
  const g = new Chess();
  g.loadPgn(l.pgn);
  const fens = g.history({ verbose: true }).map((m) => m.after);
  games.push({ ...l, fens });
  const k = bookKey(fens.at(-1));
  if (!exact.has(k)) exact.set(k, zhName(l.name));
}

// 再把每条开局走过的局面都记上: 自己有名字的用自己的, 没有的用这条线上前面最近的名字
const names = [''];
const idOf = new Map([['', 0]]);
const book = new Map();
for (const g of games) {
  let cur = '';
  for (const fen of g.fens) {
    const k = bookKey(fen);
    if (exact.has(k) && exact.get(k)) cur = exact.get(k);
    if (book.has(k)) continue;
    const name = exact.has(k) ? exact.get(k) : cur;
    if (!idOf.has(name)) {
      idOf.set(name, names.length);
      names.push(name);
    }
    book.set(k, idOf.get(name));
  }
}

const body = [...book].map(([k, id]) => `${k}:${id}`).join(',');
const out = `// 自动生成, 别手改: node tools/chess-book.mjs <lichess chess-openings 的文件夹>
// 国际象棋开局谱 (${lines.length} 条开局, ${book.size} 个局面); 资料来自 Lichess 的 chess-openings (公有领域 / CC0)
export const names = ${JSON.stringify(names)};
export const book = '${body}';
`;
writeFileSync(new URL('../js/chessbook-data.js', import.meta.url), out);
console.log(`${lines.length} 条开局, ${book.size} 个局面, ${names.length - 1} 个中文名, ${(out.length / 1024).toFixed(0)} KB`);
const missing = new Map();
for (const l of lines) {
  if (!zhName(l.name)) {
    const fam = l.name.split(':')[0];
    missing.set(fam, (missing.get(fam) ?? 0) + 1);
  }
}
console.log('没有中文名的:', [...missing].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([f, n]) => `${f} ${n}`).join('、'));
