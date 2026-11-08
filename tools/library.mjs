// 生成书库 (阅读) 的书: js/library/<书>.js (简体)、js/library/hant/<书>.js (繁体原文)、js/library/books.js (书目)。
// 原文来自开源项目 chinese-poetry (https://github.com/chinese-poetry/chinese-poetry, MIT, 见 js/library/LICENSE-chinese-poetry.txt) 的「蒙学」和宋词三百首,
// 蒙学那里是繁体, 简体用 OpenCC (opencc-js) 自动转; 宋词三百首那里是简体, 繁体用 OpenCC 转回去。只在更新书库时跑, 网页和 App 不用 OpenCC。
//   node tools/library.mjs <放原文的文件夹> [opencc-js 的 dist/esm/full.js]
//   文件夹里要有: 蒙学的那些 json,「宋词/宋词三百首.json」(改名成 songci300.json), 和放《全宋词》(宋词/ci.song.*.json) 的 ci 文件夹 (补字用)
//   opencc-js 用 1.4.2 (别的版本有几个字转得不一样, 像「沈醉 / 沉醉」); 文件夹里还要有论语/lunyu.json
// 每本书的篇目顺序别改: 收藏、读到哪记的是「书:第几篇」

import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { HANT_FIX } from './hant-fix.mjs';

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

// 句子里的版本注释拿出来: 「春草明年綠，王孫歸不歸？(明年 一作：年年)」→ 句子「春草明年綠，王孫歸不歸？」, 注「明年 一作：年年」;
// 「是[通“事”]」也算注。别的括号 (「（地名）」「（選自《左傳》）」、没写完的「(回樂」、空的) 去掉
// 注有时拆在两行里 (「…如霜。(回樂」「一作：回樂」「）」), 所以整首连起来找, 找完再拆回一行一行 (只剩标点的行去掉)
function withNotes(lines) {
  const notes = [];
  const text = lines
    .map(tidy)
    .join('\n')
    .replace(/(\S)\[通“([^”]+)”\]/g, (_, ch, to) => {
      notes.push(`${ch} 通：${to}`);
      return ch;
    })
    .replace(/\s*[（(]([^（()）]*)(?:[）)]|$)/g, (_, note) => {
      if (/一作|通/.test(note)) notes.push(tidy(note));
      return '';
    });
  const p = text
    .split('\n')
    .map(tidy)
    .filter((l) => l && !/^[\s（()）]*$/.test(l));
  return notes.length ? { p, n: notes } : { p };
}

// 半角标点换成全角 (资料里混着「?」「,」), 去掉中文里的空格
const FULL = { '?': '？', '!': '！', ',': '，', ';': '；', ':': '：', '.': '。', '．': '。', '∶': '：', '"': '”' };
const fullWidth = (s) => String(s).replace(/[?!,;:.．∶"]/g, (ch) => FULL[ch]);
const prose = (s) => fullWidth(s).replace(/\s+/g, '');

// 古文观止资料里的怪地方: 多出来的点、注释符号、乱码 (「髡帣韝鞠跽」的「跽」)、缺字 (只写了偏旁「(魚卷)」, 不猜, 用 □)、
// 错字 (对照维基文库: 《触龙说赵太后》「一旦」写成了破折号「—旦」, 《过秦论》「世非无」写成了「也非无」, 《冯谖客孟尝君》「冯谖曰」后面是分号)
const GUWEN_FIX = [
  ['爲．之', '爲之'],
  ['\ue031', '跽'],
  ['⒅', ''],
  ['(魚卷)', '□'],
  ['—旦山陵崩', '一旦山陵崩'],
  ['也非無深謀', '世非無深謀'],
  ['馮諼曰;', '馮諼曰：'],
  ['馮諼曰；', '馮諼曰：'],
];
const PINYIN = /[（(][a-zāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜü\s]+[）)]/gi; // 「陂(bēi)」

function guwenPiece(c, g) {
  let lines = c.paragraphs.map((l) => GUWEN_FIX.reduce((s, [a, b]) => s.split(a).join(b), String(l)).replace(PINYIN, ''));
  const { p, n = [] } = withNotes(lines);
  lines = p.map(prose);
  const notes = n.map(fullWidth);
  if (lines.some((l) => l.includes('□'))) notes.push('□：资料里缺这个字（鱼字旁加「卷」）');
  const [era, name = ''] = tidy(c.author).split('：'); // 「先秦：左丘明」
  const src = tidy(c.source);
  return { t: tidy(c.chapter), a: tidy(name), e: era.replace(/代$/, ''), ...(src.startsWith('《') ? { s: src } : {}), g, p: lines, ...(notes.length ? { n: notes } : {}) };
}

// 组诗 (资料里正文是 [{ subchapter: '其一', paragraphs }, …]) 还算一篇 (篇的编号不变), 记下每首从第几行开始: k [[行, '其一'], …]
function poemParts(paragraphs) {
  if (paragraphs.every((x) => typeof x === 'string')) return { p: paragraphs.map(tidy) };
  const p = [];
  const k = [];
  for (const sub of paragraphs) {
    k.push([p.length, tidy(sub.subchapter)]);
    p.push(...sub.paragraphs.map(tidy));
  }
  return { p, k };
}

// 千家诗里也在唐诗三百首里的诗, 有几首有错字 (「孤篷万里征」应是「孤蓬」、「因风想玉坷」应是「玉珂」), 照唐诗三百首改;
// 千家诗原来的写法记进注里 (有的只是版本不同, 像「天街 / 天阶」), 一个字都不丢。只改一样长、一行对一行的
const CLAUSE = /[^，。；：？！、]+[，。；：？！、]?/g;
function fixByTang(pieces, tang) {
  let fixed = 0;
  const out = pieces.map((x) => {
    const t = tang.find((y) => y.a === x.a && y.t === x.t);
    if (!t || t.p.length !== x.p.length || x.k) return x;
    const notes = [];
    // 只算转成简体后真的不同的 (「牀 / 床」这种字形、句末的标点不算)
    const bare = (c) => c.replace(/[，。；：？！、]$/, '');
    const plain = (c) => t2s(bare(c));
    const p = x.p.map((line, i) => {
      const right = t.p[i];
      if (line === right || line.length !== right.length) return line;
      const mine = line.match(CLAUSE);
      const theirs = right.match(CLAUSE);
      if (mine.length !== theirs.length) return line;
      const real = mine.map((c, j) => [theirs[j], c]).filter(([r, m]) => plain(r) !== plain(m));
      if (!real.length) return line;
      for (const [r, m] of real) notes.push(`${bare(r)} 一作：${bare(m)}`); // 繁体原文; 简体那份生成时再转
      return right;
    });
    if (!notes.length) return x;
    fixed++;
    return { ...x, p, n: [...(x.n ?? []), ...notes] };
  });
  console.log(`千家诗: 照唐诗三百首改了 ${fixed} 首里的错字 (原来的写法记在注里)`);
  return out;
}

// ---- 组诗里的一首, 题目标上「其几」 ----
// 资料里有的只写了组诗的总题 (王维「君自故乡来」只写「杂诗」, 其实是《杂诗三首》其二), 有的用第一句区分 (「清平调·云想衣裳花想容」),
// 看不出是第几首。对照同一个资料库 chinese-poetry 的《全唐诗》《全宋诗》、维基文库的《全唐诗》核对过:
// 书里只收了这组诗里的几首, 写「杂诗三首·其二」(看得出一共几首); 整组都收了, 写「清平调·其一」。
// 书里另起了题目的 (千家诗把《观书有感》其二叫「泛舟」、唐诗三百首把《长信秋词》其一叫「长信怨」) 照书里的, 不改。
// [作者, 第一句开头 (简体), 题目后面加的, { base 换掉题目, k 组诗每首的「其几」, by 改作者 [作者, 朝代] (繁体) }]; 一条对不上正好一首就报错
const TITLE_FIX = {
  tangshi: [
    ['王建', '三日入厨下', '三首·其三'],
    ['王维', '君自故乡来', '三首·其二'],
    ['张祜', '故国三千里', '二首·其一'],
    ['权德舆', '昨夜裙带解', '十二首·其十一'],
    ['王昌龄', '寒雨连江夜入吴', '二首·其一'],
    ['王翰', '葡萄美酒夜光杯', '二首·其一'],
    ['张泌', '别梦依依到谢家', '二首·其一'],
    ['陈陶', '誓扫匈奴不顾身', '四首·其二'],
    ['贺知章', '少小离家老大回', '二首·其一'],
    ['崔涂', '几行归塞尽', '二首·其二'],
    ['许浑', '遥夜泛清瑟', '三首·其一'],
    ['张九龄', '孤鸿海上来', '十二首·其四'],
    ['张九龄', '兰叶春葳蕤', '十二首·其一'],
    ['张九龄', '幽人归独卧', '十二首·其二'],
    ['张九龄', '江南有丹橘', '十二首·其七'],
    ['王之涣', '黄河远上白云间', '二首·其一'],
    ['王昌龄', '秦时明月汉时关', '二首·其一'],
    ['王昌龄', '饮马渡秋水', '四首·其二'],
    ['李白', '云想衣裳花想容', '·其一'],
    ['李白', '一枝红艳露凝香', '·其二'],
    ['李白', '名花倾国两相欢', '·其三'],
    ['李白', '金樽清酒斗十千', '·其一'],
    ['李白', '大道如青天', '·其二'],
    ['李白', '有耳莫洗颍川水', '·其三'],
    ['李白', '妾发初覆额', '二首·其一'],
    ['崔颢', '君家何处住', '四首·其一'], // 《全唐诗》题作《长干曲四首》
    ['崔颢', '家临九江水', '四首·其二'],
    ['卢纶', '鹫翎金仆姑', '六首·其一'], // 《全唐诗》题作《和张仆射塞下曲六首》
    ['卢纶', '林暗草惊风', '六首·其二'],
    ['卢纶', '月黑雁飞高', '六首·其三'],
    // 杜甫这首的题目资料里截断了, 补全 (维基文库、《全唐诗》)
    ['杜甫', '此道昔归顺', '', { base: '至德二載甫自京金光門出間道歸鳳翔乾元初從左拾遺移華州掾與親故別因出此門有悲往事' }],
    // 七言律诗: 这几首的题目资料里也截断了, 补全 (维基文库、《全唐诗》)
    ['王维', '渭水自萦秦塞曲', '', { base: '奉和聖製從蓬萊向興慶閣道中留春雨中春望之作應制' }],
    ['高适', '嗟君此别意何如', '', { base: '送李少府貶峽中王少府貶長沙' }],
    ['刘长卿', '生涯岂料承优诏', '', { base: '江州重別薛六柳八二員外' }],
    ['刘长卿', '汀洲无浪复无烟', '', { base: '自夏口至鸚鵡洲夕望岳陽寄源中丞' }],
    ['卢纶', '野幕敞琼筵', '六首·其四'],
  ],
  qianjiashi: [
    ['崔颢', '君家在何处', '四首·其一'],
    ['韦应物', '林中观易罢', '三首·其三'],
    ['李白', '白发三千丈', '十七首·其十五'],
    ['陈子昂', '银烛吐青烟', '二首·其一'],
    ['杜甫', '方丈浑连水', '三首·其二'],
    ['杜甫', '凤林戈未息', '二十首·其十九'],
    ['李白', '云想衣裳花想容', '三首·其一'],
    ['杜甫', '两个黄鹂鸣翠柳', '四首·其三'],
    ['杜甫', '肠断春江欲尽头', '九首·其五'],
    ['杜甫', '糁径杨花铺白毡', '九首·其七', { base: '絕句漫興' }], // 书里题作「漫兴」, 跟上一首是同一组
    ['苏轼', '水光潋滟晴方好', '二首·其二'],
    ['朱熹', '半亩方塘一鉴开', '二首·其一', { base: '觀書有感' }], // 原来写「观书有感（其一）」
    ['张文潜', '长夏江村风日清', '三首·其一'],
    ['杜甫', '一片花飞减却春', '二首', { base: '曲江' }], // 资料写成「曲江对酒」, 那是另一首 (「苑外江头坐不归」)
    ['杜甫', '千家山郭静朝晖', '', { k: ['其三', '其五', '其一', '其七'] }], // 秋兴八首选了四首, 资料按选的次序写成其一到其四
    // 下面两条不是组诗, 是资料写错了 (对照维基文库的《千家诗》卷三、卷四):
    ['杜牧', '暮云收尽溢清寒', '', { by: ['蘇軾', '宋'] }], // 《中秋月》是苏轼的 (也作《阳关曲·中秋月》), 资料写成了杜牧
    ['杜甫', '老去悲秋强自宽', '', { base: '九日藍田會飲' }], // 资料写成「九日藍耕會飲」; 杜集题作《九日蓝田崔氏庄》
    ['苏轼', '毕竟西湖六月中', '', { base: '曉出淨慈寺送林子方', by: ['楊萬里', '宋'] }], // 资料写成苏轼《西湖》; 千家诗题作《晓出净慈寺送林子方》, 是杨万里的
    ['范成大', '绿遍山原白满川', '', { by: ['翁卷', '宋'] }], // 千家诗原书就写成范成大 (维基文库「鄉村四月」页注明); 其实是翁卷的《乡村四月》, 题目照书里的
    ['韩愈', '天街小雨润如酥', '', { by: ['韓愈', '唐'] }], // 朝代写成了宋
    ['谢枋得', '子规啼彻四更时', '', { by: ['謝枋得', '宋'] }], // 朝代写成了唐
    ['王维', '游人五陵去', '', { by: ['孟浩然', '唐'] }], // 《送朱大入秦》是孟浩然的 (《全唐诗》卷一六〇), 资料写成了王维
    // 卷二 五言律诗 (v1.61 对照维基文库、古诗文网):
    ['杜审言', '独有宦游人', '', { base: '和晉陵陸丞早春遊望' }], // 资料写成「和晉陵陸承相」, 少了半截; 陆丞是晋陵县丞 (有的千家诗误作「陆丞相」)
    ['王勃', '城阙辅三秦', '', { base: '送杜少府之任蜀州' }], // 资料丢了「送」字
    ['高适', '浩劫因王造', '', { by: ['杜甫', '唐'] }], // 《玉台观》是杜甫的 (《全唐诗》卷二二八), 资料写成了高适
    ['张佑', '山色远含空', '', { by: ['張祜', '唐'] }], // 张祜 (hù) 写成了张佑
    ['李白', '江城如画里', '', { base: '秋登宣城謝朓北樓' }], // 谢朓 (tiǎo) 写成了谢眺
    ['张说', '凉风吹夜雨', '', { base: '幽州夜飲' }], // 写成了「幽州夜歌」
    // 卷三 七言绝句 (v1.61 对照维基文库、古诗文网): 作者、题目
    ['晁无咎', '阊阖千门', '', { by: ['晁說之', '宋'] }], // 《打球图》一般认为是晁说之的 (原题《题明王打球图》), 千家诗写成晁无咎 (晁补之)
    ['王建', '行尽江南', '', { by: ['杜常', '宋'] }], // 《咏华清宫》是北宋杜常的, 资料写成王建
    ['张演', '鹅湖山下', '', { by: ['王駕', '唐'] }], // 《社日》一般认为是晚唐王驾的
    ['僧志安', '古木阴中', '', { by: ['僧志南', '宋'] }], // 南宋诗僧志南 (朱熹称赞过这首)
    ['王驾', '雨前初见', '', { by: ['王駕', '唐'] }], // 王驾是唐人, 朝代写成了宋
    ['朱淑贞', '连理枝头', '', { by: ['朱淑真', '宋'] }],
    ['朱淑贞', '竹摇清影', '', { by: ['朱淑真', '宋'] }],
    ['司马光', '黄梅时节', '', { by: ['趙師秀', '宋'] }], // 其实是赵师秀《约客》
    ['王安石', '四顾山光', '', { by: ['黃庭堅', '宋'] }], // 黄庭坚《鄂州南楼书事》(一名《晚楼闲坐》)
    ['朱熹', '五月榴花', '', { by: ['韓愈', '唐'] }], // 韩愈《题张十一旅舍三咏·榴花》
    ['李嘉佑', '傲吏身闲', '', { by: ['李嘉祐', '唐'] }], // 李嘉祐 (祐) 写成了佑
    ['李白', '一为迁客', '', { base: '與史郎中飲聽黃鶴樓上吹笛' }], // 郎中写成了「朗中」
    ['洪咨夔', '禁门深锁', '', { base: '直玉堂作' }], // 直 (值班) 写成了「真」
    // 卷四 七言律诗
    ['王淇', '雪消华月', '', { by: ['王珪', '宋'] }], // 第二首《上元应制》是王珪的 (原题《恭和御制上元观灯》)
    ['高菊卿', '南北山头', '', { by: ['高翥', '宋'] }], // 高翥号菊磵, 写成了「高菊卿」
  ],
};
// 资料 (繁体) 里地名「长干」成了「長幹」、「长干里」成了「長幹裏」; 千家诗《黄鹤楼》「鹦鹉洲」写成了「鹦鹉州」(维基文库的千家诗是「洲」);
// 《送朱大入秦》「游人五陵去」写成了「避人」(维基文库的千家诗是「遊人」); 《洛阳道》「双双鸣玉珂」写成了「嗚」(口字旁的「呜」, 维基文库也错了; 珂是马笼头上的玉饰, 响的是「鸣」)
const POEM_FIX = [
  ['長幹裏', '長干里'],
  ['長幹', '長干'],
  ['鸚鵡州', '鸚鵡洲'],
  ['避人五陵去', '遊人五陵去'],
  ['雙雙嗚玉珂', '雙雙鳴玉珂'],
  // 卷二 五言律诗: 维基文库 (《全唐诗》)、古诗文网都是右边的写法
  ['雲標金闕回', '雲標金闕迥'], // 迥: 远
  ['升沈應已定', '升沉應已定'], // 简体要显示「升沉」
  ['澧水映園林', '灃水映園林'], // 沣水在长安南边; 澧水在湖南
  ['滿壁畫滄州', '滿壁畫滄洲'], // 沧洲: 水边, 隐士住的地方 (不是河北的沧州)
  ['坐覺煙塵少', '坐覺煙塵掃'],
  ['老去限空聞', '老去恨空聞'],
  ['行矣順風波', '行矣慎風波'],
  ['江深走白沙', '江聲走白沙'],
  ['有客歸歟嘆', '客有歸歟嘆'],
  ['叢青藹', '叢青靄'], // 青霭: 青色的云雾
  // 卷三 七言绝句
  ['夜沈沈', '夜沉沉'], // 简体要显示「沉沉」
  ['與梅井作', '與梅並作'],
  ['夭棘', '天棘'], // 天棘: 天门冬
  // 卷四 七言律诗
  ['花皮潤沾', '花板潤沾'], // 秋千的踏板
  ['落落疏廉', '落落疏簾'],
  ['拂署流', '拂曙流'],
  ['傳與風光', '傳語風光'], // 杜甫《曲江》「传语风光共流转」
  // 唐诗三百首 卷一 五言绝句
  ['疑是地上霜，', '疑是地上霜。'], // 《静夜思》第一联末尾是句号
  // 唐诗三百首 卷二 七言绝句 (对照维基文库、古诗文网)
  // 韦庄《金陵图》: 资料放成了另一首同题的 (「谁谓伤心画不成」); 《唐诗三百首》选的是「江雨霏霏」这首 (又题作《台城》)
  ['誰謂傷心畫不成，畫人心逐世人情。', '江雨霏霏江草齊，六朝如夢鳥空啼。'],
  ['君看六幅南朝事，老木寒雲滿故城。', '無情最是臺城柳，依舊煙籠十里堤。'],
  // 顾况《宫词》: 资料放成了《宫词五首》里的另一首 (「长乐宫连上苑春」); 《唐诗三百首》选的是「玉楼天半起笙歌」
  ['長樂宮連上苑春，玉樓金殿豔歌新。', '玉樓天半起笙歌，風送宮嬪笑語和。'],
  ['君門一入無由出，唯有宮鶯得見人。', '月殿影開聞夜漏，水晶簾卷近秋河。'],
  ['落魄江南載酒行', '落魄江湖載酒行'], // 杜牧《遣怀》, 通行本、维基文库都是「江湖」(一作「江南」)
  ['江南 一作：江湖；纖細', '江湖 一作：江南；纖細'], // 《遣怀》的版本注释跟着倒过来
  ['兩三星火是瓜州', '兩三星火是瓜洲'], // 瓜洲在长江北岸 (甘肃才是瓜州)
  ['雲雨雖亡日月新', '雲雨難忘日月新'], // 郑畋《马嵬坡》, 维基文库、古诗文网都是「难忘」(一作「虽亡」)
  // 唐诗三百首 卷三 五言律诗 (对照维基文库、古诗文网)
  ['至今殘破膽', '至今猶破膽'], // 杜甫《至德二载……》: 犹, 还
  ['近得歸京邑', '近侍歸京邑'], // 同上: 近侍, 皇帝身边的近臣 (杜甫当时是左拾遗)
  ['山暝聞猿愁', '山暝聽猿愁'], // 孟浩然《宿桐庐江寄广陵旧游》
  ['大漢無兵阻', '大漠無兵阻'], // 张乔《书边事》
  ['殘螢委玉露', '殘螢棲玉露'], // 许浑《早秋》
  // 唐诗三百首 卷四 七言律诗
  ['昔日戲言身後事', '昔日戲言身後意'], // 元稹《遣悲怀》其二 (一作「事」)
  ['惟將終夜常開眼', '惟將終夜長開眼'], // 元稹《遣悲怀》其三
  ['何處西南任好風', '何處西南待好風'], // 李商隐《无题》(凤尾香罗)
  ['殘霄猶得夢依稀', '殘宵猶得夢依稀'], // 李商隐《春雨》: 残宵, 天快亮的夜里
  ['武侯祠堂常鄰近', '武侯祠屋常鄰近'], // 杜甫《咏怀古迹》其四
  ['野哭幾家聞戰伐', '野哭千家聞戰伐'], // 杜甫《阁夜》
  ['人事依依漫寂寥', '人事音書漫寂寥'], // 杜甫《阁夜》
];
function fixPoems(id, pieces) {
  const fixes = TITLE_FIX[id];
  if (!fixes) return pieces;
  const fix = (s) => POEM_FIX.reduce((x, [a, b]) => x.split(a).join(b), s);
  const used = new Set();
  const out = pieces.map((x0) => {
    const x = { ...x0, t: fix(x0.t), p: x0.p.map(fix), ...(x0.n ? { n: x0.n.map(fix) } : {}) }; // 版本注释也跟着改
    const i = fixes.findIndex(([a, first]) => t2s(x.a ?? '') === a && t2s(x.p[0]).startsWith(first));
    if (i < 0) return x;
    if (used.has(i)) throw new Error(`${id}: 「${fixes[i][0]} ${fixes[i][1]}」对上了不止一首`);
    used.add(i);
    const [, , add, { base, k, by } = {}] = fixes[i];
    if (k && k.length !== x.k?.length) throw new Error(`${id}「${x.t}」的组诗不是 ${k.length} 首`);
    return { ...x, t: `${base ?? x.t.split('·')[0]}${add}`, ...(by ? { a: by[0], e: by[1] } : {}), ...(k ? { k: x.k.map(([at], j) => [at, k[j]]) } : {}) };
  });
  fixes.forEach(([a, first], i) => {
    if (!used.has(i)) throw new Error(`${id}: 要改题目的「${a} ${first}」没找到`);
  });
  return out;
}

// ---- 资料把两首不同作者的诗合成了一篇 (当成组诗的其一、其二): 拆开 ----
// 千家诗的《宮詞》: 其一「金殿當頭紫閣重」是唐代王建的, 其二「殿上袞衣明日月」才是宋代林洪的 (资料都写成林洪; 对照维基文库《千家詩/卷三》)。
// 拆出来的后一首放到书的最后 (编号不动: 收藏、读到哪记的是「书:第几篇」, 原来的都不受影响), 书目里记上 after: 目录、翻页时排在前一首后面 (reading.js 的 orderOf)
// [题目 (繁体), 第一句开头 (繁体), 前一首改成的 { a 作者, e 朝代 }, 后一首的 { a, e }]
const SPLIT = {
  qianjiashi: [['宮詞', '金殿當頭', { a: '王建', e: '唐' }, { a: '林洪', e: '宋' }]],
};
function splitPoems(id, pieces) {
  const after = [];
  const out = pieces.map((x) => ({ ...x }));
  for (const [t, first, one, two] of SPLIT[id] ?? []) {
    const i = out.findIndex((x) => x.t === t && x.p[0].startsWith(first) && x.k?.length === 2);
    if (i < 0) throw new Error(`${id}: 要拆开的「${t}」没找到`);
    const { k, ...x } = out[i];
    const cut = k[1][0];
    out[i] = { ...x, ...one, p: x.p.slice(0, cut) };
    out.push({ ...x, ...two, p: x.p.slice(cut) });
    after.push([out.length - 1, i]);
  }
  return { pieces: out, after };
}

// 繁体里转错的字 (表在 tools/hant-fix.mjs): 每条是一小段原文和改成的样子, 题目和正文都找; 有一条没用上就报错 (资料变了要重新看)
function fixHant(id, pieces) {
  const fixes = HANT_FIX[id] ?? [];
  const used = fixes.map(() => 0);
  const fix = (s) =>
    fixes.reduce((x, [a, b], i) => {
      const parts = x.split(a);
      used[i] += parts.length - 1;
      return parts.join(b);
    }, s);
  const out = pieces.map((x) => ({ ...x, t: fix(x.t), p: x.p.map(fix) }));
  fixes.forEach(([a], i) => {
    if (!used[i]) throw new Error(`${id}: 繁体要改的「${a}」没找到`);
  });
  return out;
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
// chain: 文章做「接下句」卡片时怎么接 (诗都是一首一首接) —— 'book' 整本连着 (三字经这种切成段的), 'piece' 一篇里连着, 'line' 一行一行 (论语一章一行、增广贤文一句一行, 互不相干)
const BOOKS = [
  {
    id: 'tangshi',
    cat: 'poetry',
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
    cat: 'poetry',
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
    id: 'lunyu',
    cat: 'classic',
    file: 'lunyu.json',
    source: 'hans',
    title: '论语',
    era: '先秦',
    unit: '篇',
    chain: 'line',
    intro: '孔子和弟子的言行记录，共 20 篇。「学而时习之」「三人行，必有我师焉」「己所不欲，勿施于人」都出自这里；温故的名字也来自其中的「温故而知新，可以为师矣」。',
    build: (d) => ({ author: '孔子弟子及再传弟子', groups: [], pieces: d.map((x) => ({ t: tidy(x.chapter), p: x.paragraphs.map(prose) })) }),
  },
  {
    id: 'guwen',
    cat: 'classic',
    file: 'guwenguanzhi.json',
    era: '清',
    unit: '篇',
    chain: 'piece',
    intro: '清代吴楚材、吴调侯选编的古文读本，从先秦到明代共 222 篇，分十二卷。《出师表》《桃花源记》《陋室铭》《师说》《岳阳楼记》《醉翁亭记》《前赤壁赋》都在里面。',
    build: (d) => ({ author: '吴楚材、吴调侯', groups: d.content.map((v) => tidy(v.title).replace(/・/g, '·')), pieces: d.content.flatMap((v, gi) => v.content.map((c) => guwenPiece(c, gi))) }),
  },
  {
    id: 'sanzijing',
    file: 'sanzijing-traditional.json',
    era: '宋',
    unit: '段',
    chain: 'book',
    intro: '三个字一句，讲做人的道理、历史和常识，是古代孩子识字读书的第一本书。相传为南宋王应麟所编，这里是传统版。',
    build: (d) => ({ author: d.author, groups: [], pieces: chunk(d.paragraphs.map(tidy), 12) }),
  },
  {
    id: 'baijiaxing',
    file: 'baijiaxing.json',
    era: '北宋',
    unit: '段',
    chain: 'book',
    intro: '把常见的姓连成四字一句的韵文，「赵钱孙李，周吴郑王」。北宋初年编成。',
    build: (d) => ({ author: d.author, groups: [], pieces: chunk(d.paragraphs.map(tidy), 12) }),
  },
  {
    id: 'qianziwen',
    file: 'qianziwen.json',
    era: '南朝梁',
    unit: '段',
    chain: 'book',
    intro: '一千个字，没有一个重复，四字一句，从天地讲到人事。南朝梁周兴嗣编。',
    build: (d) => ({ author: d.author, groups: [], pieces: chunk(pairs(d.paragraphs.map(tidy)), 12) }),
  },
  {
    id: 'dizigui',
    file: 'dizigui.json',
    era: '清',
    unit: '章',
    chain: 'book',
    intro: '三个字一句，讲孩子在家孝顺父母、出门对人、说话做事的规矩。清代李毓秀作。',
    // 原文三字一组用空格隔开, 加上标点: 「弟子规，圣人训。首孝弟，次谨信。」
    build: (d) => ({ author: d.author, groups: [], pieces: d.content.map((c) => ({ t: tidy(c.chapter), p: c.paragraphs.map((l) => pairs(tidy(l).split(' ')).join('')) })) }),
  },
  {
    id: 'qianjiashi',
    cat: 'poetry',
    file: 'qianjiashi.json',
    era: '宋·明',
    unit: '首',
    kind: 'poem',
    intro: '古时候孩子学诗的入门诗集，选的多是唐宋名家的诗，「春眠不觉晓」就在里面。分五言绝句、七言绝句、五言律诗、七言律诗。南宋谢枋得、明代王相选编。',
    build: (d, built) => ({
      author: d.author,
      groups: d.content.map((g) => tidy(g.type)),
      pieces: fixByTang(
        d.content.flatMap((g, gi) => g.content.map((c) => ({ t: tidy(c.chapter), ...byline(c.author), g: gi, ...poemParts(c.paragraphs) }))),
        built.tangshi.pieces,
      ),
    }),
  },
  {
    id: 'shenglvqimeng',
    file: 'shenglvqimeng.json',
    era: '清',
    unit: '章',
    chain: 'piece',
    intro: '学对对子、学声韵的书，「云对雨，雪对风，晚照对晴空」。按韵编排，一个韵一章。清代车万育作。',
    build: (d) => ({ author: d.author, groups: d.content.map((v) => tidy(v.title)), pieces: d.content.flatMap((v, gi) => v.content.map((c) => ({ t: tidy(c.chapter), g: gi, p: c.paragraphs.map(tidy) }))) }),
  },
  {
    id: 'zengguangxianwen',
    file: 'zengguangxianwen.json',
    era: '明',
    unit: '段',
    chain: 'line',
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
    chain: 'piece',
    intro: '讲怎样持家过日子的格言，「黎明即起，洒扫庭除」「一粥一饭，当思来处不易」。明末清初朱柏庐作，又叫《朱子治家格言》。',
    build: (d) => ({ author: d.author, groups: [], pieces: [{ t: '全文', p: d.paragraphs.map(tidy) }] }),
  },
  {
    id: 'youxueqionglin',
    file: 'youxueqionglin.json',
    era: '明·清',
    unit: '章',
    chain: 'piece',
    intro: '用对偶的句子讲天文、地理、人物、典故，读了能知道很多成语的来历。明代程登吉编，清代邹圣脉增补。',
    // 资料里「膏粱」(精美的饭食)、「粱肉」写成了「膏樑」「樑肉」(简体就成了「膏梁」「梁肉」), 简繁一起改
    build: (d) => ({
      author: d.author,
      groups: d.content.map((v) => tidy(v.title)),
      pieces: d.content.flatMap((v, gi) => v.content.map((c) => ({ t: tidy(c.chapter), g: gi, p: c.paragraphs.map((l) => tidy(l).replace(/膏樑/g, '膏粱').replace(/樑肉/g, '粱肉')) }))),
    }),
  },
];

// 一本书: 每篇 { t 题目, a 作者, e 朝代, s 出处 (古文观止的《左传》), g 第几组 (有分组才有), p 一行一行, n 注, k 组诗每首从第几行开始 }; 没有的不写
function piecesText(pieces, conv) {
  return pieces.map((x) => {
    const out = { t: conv(x.t) };
    if (x.a) out.a = conv(x.a);
    if (x.e) out.e = conv(x.e);
    if (x.s) out.s = conv(x.s);
    if (x.g !== undefined) out.g = x.g;
    out.p = x.p.map(conv);
    if (x.n) out.n = x.n.map(conv);
    if (x.k) out.k = x.k.map(([i, label]) => [i, conv(label)]);
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
const builtById = {}; // 生成过的 (繁体原文那份), 后面的书对照用
for (const b of BOOKS) {
  const d = read(b.file);
  const built = b.build(d, builtById);
  builtById[b.id] = built;
  // 每行都要是文字 (以前组诗的正文是对象, 变成了「[object Object]」); 半角标点换全角, 去掉中文里的空格
  for (const x of built.pieces) {
    if (!x.p.length || x.p.some((l) => typeof l !== 'string' || !l.trim())) throw new Error(`${b.id}「${x.t}」的正文不对`);
    x.p = x.p.map(prose);
  }
  // 组诗标上「其几」(上面 TITLE_FIX); builtById 里的不动, 千家诗对照唐诗三百首时用的是资料原来的题目
  const { pieces, after } = splitPoems(b.id, fixPoems(b.id, built.pieces));
  // 原文是繁体: 繁体照原样, 简体转; 原文是简体: 简体也过一遍 (夹着的「後」这种改过来), 繁体转回去
  const title = tidy(b.title ?? d.title);
  const hantOf = b.source === 'hans' ? s2t : (s) => s;
  const hans = { id: b.id, title: t2s(title), author: t2s(tidy(built.author)), groups: built.groups.map(t2s), pieces: piecesText(pieces, t2s) };
  // 繁体里转错的字改过来 (tools/hant-fix.mjs); 简体已经转好了, 不受影响
  const hant = { id: b.id, title: hantOf(title), author: hantOf(tidy(built.author)), groups: built.groups.map(hantOf), pieces: fixHant(b.id, piecesText(b.source === 'hans' ? hans.pieces : pieces, hantOf)) };
  const head = `// 《${hans.title}》: tools/library.mjs 从 chinese-poetry (MIT, 见 LICENSE-chinese-poetry.txt) 生成, 别手改`;
  writeFileSync(join(root, `js/library/${b.id}.js`), moduleText(`${head}。${b.source === 'hans' ? '简体原文' : '繁体原文自动转的简体'}`, hans));
  writeFileSync(join(root, `js/library/hant/${b.id}.js`), moduleText(`${head}。${b.source === 'hans' ? '简体原文自动转的繁体' : '繁体原文'}`, hant));
  catalog.push({ id: b.id, title: hans.title, author: hans.author, era: b.era, kind: b.kind ?? 'text', unit: b.unit, cat: b.cat ?? 'primer', ...(b.chain ? { chain: b.chain } : {}), count: hans.pieces.length, ...(after.length ? { after } : {}), intro: b.intro });
  console.log(`${hans.title}: ${hans.pieces.length} ${b.unit}`);
}

// ---- 长篇小说: tools/novel.mjs 生成 (一回一个文件), 这里只写进书目。先跑 novel.mjs, 再跑这个 ----
const NOVELS = [
  {
    id: 'xiyouji',
    era: '明',
    intro: '写唐僧师徒四人去西天取经、一路降妖除魔的故事，一百回，作者一般认为是明代吴承恩。这里用的是清代流传的本子：第九回「陈光蕊赴任逢灾」讲唐僧的身世，是清代加进去的；现在常见的人民文学出版社版以明代世德堂本为底本，把这一回放在附录。原文来自维基文库，对照古登堡计划核对过。',
    src: [
      { name: '维基文库', url: 'https://zh.wikisource.org/wiki/西遊記' },
      { name: '古登堡计划', url: 'https://www.gutenberg.org/ebooks/23962' },
    ],
  },
];
for (const nv of NOVELS) {
  const index = (await import(pathToFileURL(join(root, `js/library/${nv.id}.js`)).href)).default;
  catalog.push({ id: nv.id, title: index.title, author: index.author, era: nv.era, kind: 'novel', unit: '回', cat: 'novel', count: index.pieces.length, intro: nv.intro, src: nv.src });
  console.log(`${index.title}: ${index.pieces.length} 回 (tools/novel.mjs 生成的)`);
}

writeFileSync(
  join(root, 'js/library/books.js'),
  `// 书库的书目: tools/library.mjs 生成, 别手改。书的正文在 js/library/<id>.js (简体)、js/library/hant/<id>.js (繁体)\n` +
    `// kind: poem 一首一首的诗 (有作者、朝代), text 文章, novel 长篇小说 (一回一个文件, 见 tools/novel.mjs); unit: 一篇叫什么 (首、段、章、篇、回); chain: 文章做「接下句」卡片时怎么接 (见 tools/library.mjs); cat: 放在书架哪一层 (reading.js 的 SHELVES); src: 原文另有来源的 (小说);\n` +
    `// after: [[第几篇, 排在第几篇后面]] 后来拆出来、放在书最后的篇, 目录和翻页时排在哪 (reading.js 的 orderOf)\n` +
    `export const BOOKS = [\n${catalog.map((c) => `  ${JSON.stringify(c)},`).join('\n')}\n];\n` +
    `export const SOURCE = ${JSON.stringify({ name: 'chinese-poetry', url: 'https://github.com/chinese-poetry/chinese-poetry', license: 'MIT' })};\n`,
);
