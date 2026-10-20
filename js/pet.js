// 小乌龟温温: 待在网页右下角, 跟着学习长大。这里是它的「脑子」(长到哪了、心情、解锁的装扮、该说什么、论语), 画它在 views/pet.js。
//   喂它 = 学习: 答一题、重做一道错题、玩一局游戏都算一口。一共吃了几口就是打卡记录 (activity) 里每天的数加起来,
//   以前学过的也算; 打卡记录只留一年多, 去掉的那几天先记在 bank 里 (since 以前的都算进 bank 了)
//   data.pet = { name, bank, since 'YYYY-MM-DD', unlocked 解锁了的装扮, wear 现在戴的,
//                cheer { from 这次连续打卡从哪天开始, days 这次庆祝过的天数 } (断了重新连, 到了又放烟花), stageSeen 见过的最大的样子 (长大了庆祝一次), at 改名字、换装扮的时间 }
//   同步: bank 听 since 晚的, 解锁、庆祝过的合起来, 名字和装扮听后改的。没见过温温是 null

export const DEFAULT_NAME = '温温';

// 长大: 一共学了几次
export const STAGES = [
  { name: '蛋', at: 0 },
  { name: '宝宝', at: 20 },
  { name: '小乌龟', at: 300 },
  { name: '大乌龟', at: 1500 },
  { name: '学霸龟', at: 6000 },
];

export function stageOf(xp) {
  let i = 0;
  while (i + 1 < STAGES.length && xp >= STAGES[i + 1].at) i++;
  return i;
}

// 离下一个样子还差多少: { stage, from, to (没有下一个是 null), progress 0–1 }
export function growth(xp) {
  const stage = stageOf(xp);
  const from = STAGES[stage].at;
  const to = STAGES[stage + 1]?.at ?? null;
  return { stage, from, to, progress: to === null ? 1 : (xp - from) / (to - from) };
}

// 装扮: 达到了就解锁, 解锁了一直有
export const OUTFITS = [
  { key: 'scarf', name: '围巾', need: '连续打卡 3 天', test: (c) => c.streak >= 3 },
  { key: 'flower', name: '小红花', need: '把一天的复习全背完', test: (c) => c.cleared },
  { key: 'hat', name: '毛线帽', need: '连续打卡 7 天', test: (c) => c.streak >= 7 },
  { key: 'glasses', name: '眼镜', need: '一共学了 1000 次', test: (c) => c.xp >= 1000 },
  { key: 'cap', name: '学士帽', need: '连续打卡 30 天', test: (c) => c.streak >= 30 },
  { key: 'crown', name: '皇冠', need: '一共学了 10000 次', test: (c) => c.xp >= 10000 },
];
const OUTFIT_KEYS = new Set(OUTFITS.map((o) => o.key));

// 这次新解锁了哪些 (c: { streak, xp, cleared })
export function newUnlocks(pet, c) {
  const have = new Set(pet.unlocked);
  return OUTFITS.filter((o) => !have.has(o.key) && o.test(c));
}

// 连续打卡到这些天放烟花
export const MILESTONES = [3, 7, 14, 30, 50, 100, 200, 365];

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

function cleanCheer(raw) {
  const from = DAY_RE.test(raw?.from) ? raw.from : '';
  const days = Array.isArray(raw?.days) ? raw.days : [];
  return { from, days: [...new Set(days.filter((n) => MILESTONES.includes(n)))].sort((a, b) => a - b) };
}

// 这次连续打卡 (从 from 开始, 连了 days 天) 该放烟花的那个天数, 没有是 0
export function milestoneDue(cheer, from, days) {
  const done = cheer.from === from ? cheer.days : [];
  return MILESTONES.filter((n) => n <= days && !done.includes(n)).pop() ?? 0;
}

// 记下放过了 (到了的都算, 一次连到 30 天只放一次)
export const cheered = (from, days) => ({ from, days: MILESTONES.filter((n) => n <= days) });

export function cleanPet(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const name = String(raw.name ?? '').trim().slice(0, 12);
  return {
    name: name || DEFAULT_NAME,
    bank: Math.max(0, Math.floor(Number(raw.bank) || 0)),
    since: DAY_RE.test(raw.since) ? raw.since : '',
    unlocked: [...new Set((Array.isArray(raw.unlocked) ? raw.unlocked : []).filter((k) => OUTFIT_KEYS.has(k)))],
    wear: OUTFIT_KEYS.has(raw.wear) ? raw.wear : '',
    cheer: cleanCheer(raw.cheer),
    stageSeen: Math.min(STAGES.length - 1, Math.max(0, Math.floor(Number(raw.stageSeen) || 0))),
    at: Number(raw.at) > 0 ? Number(raw.at) : 0,
  };
}

// 一共吃了几口 (学了几次)
export function xpOf(pet, activity = {}) {
  const since = pet?.since ?? '';
  let n = pet?.bank ?? 0;
  for (const [day, v] of Object.entries(activity)) if (day >= since) n += v;
  return n;
}

// 打卡记录要去掉最早的几天 (days: [[day, n]]): 还没算进 bank 的加进去; from: 留下来的最早一天
export function bankDays(pet, days, from) {
  const p = pet ?? cleanPet({});
  const add = days.reduce((n, [day, v]) => n + (day >= p.since ? v : 0), 0);
  return { ...p, bank: p.bank + add, since: from > p.since ? from : p.since };
}

export function mergePet(a, b) {
  if (!a) return b ?? null;
  if (!b) return a;
  const newer = (b.at ?? 0) > (a.at ?? 0) ? b : a;
  const banked = b.since > a.since ? b : a.since > b.since ? a : b.bank > a.bank ? b : a;
  return cleanPet({
    name: newer.name,
    wear: newer.wear,
    at: newer.at,
    bank: banked.bank,
    since: banked.since,
    unlocked: [...a.unlocked, ...b.unlocked],
    cheer: a.cheer.from === b.cheer.from ? { from: a.cheer.from, days: [...a.cheer.days, ...b.cheer.days] } : b.cheer.from > a.cheer.from ? b.cheer : a.cheer,
    stageSeen: Math.max(a.stageSeen, b.stageSeen),
  });
}

// 心情 (c: { hour, today 今天学了几次, due 今天还要背几张, streak, idleDays 几天没学了 }):
// sleepy 困了 (很晚了) | sad 想你了 (好几天没来) | worried 着急 (还有好多没背, 举个牌子) | hungry 饿了 (今天还没学)
// | happy 吃饱了 (今天的背完了、学了不少) | normal
export const LOTS = 40;

export function moodOf(c) {
  if (c.hour >= 23 || c.hour < 6) return 'sleepy';
  if (c.idleDays >= 3) return 'sad';
  if (c.due >= LOTS) return 'worried';
  if (!c.today && (c.due > 0 || c.streak > 0)) return 'hungry';
  if ((c.today && !c.due) || c.today >= 30) return 'happy';
  return 'normal';
}

export const MOOD_TEXT = { sleepy: '困了', sad: '想你了', worried: '有点着急', hungry: '饿了', happy: '吃饱了, 很开心', normal: '挺好的' };

// 几天没学了 (最后学的那天到今天; 今天学了是 0, 从来没学过是 null)
export function idleDays(activity = {}, now = Date.now()) {
  let last = '';
  for (const [day, n] of Object.entries(activity)) if (n > 0 && day > last) last = day;
  if (!last) return null;
  const [y, m, d] = last.split('-').map(Number);
  const today = new Date(now);
  return Math.max(0, Math.round((new Date(today.getFullYear(), today.getMonth(), today.getDate()) - new Date(y, m - 1, d)) / 86400e3));
}

export function greeting(hour) {
  if (hour < 5 || hour >= 23) return '这么晚还在学';
  if (hour < 11) return '早上好';
  if (hour < 13) return '中午好';
  if (hour < 18) return '下午好';
  return '晚上好';
}

// 发生了什么事的时候说的话 (重要的在前)
export function eventLine(e) {
  if (e.kind === 'milestone') return { text: `连续打卡 ${e.days} 天了! 放个烟花庆祝一下!`, fireworks: true };
  if (e.kind === 'stage') {
    if (e.stage === 1) return { text: '蛋壳裂开了……我出来啦! 以后你每学一题就是喂我一口, 我们一起长大。', fireworks: true };
    return { text: `我长大了, 现在是「${STAGES[e.stage].name}」了! 谢谢你天天喂我。`, fireworks: true };
  }
  if (e.kind === 'unlock') return { text: `解锁了新装扮「${e.outfit.name}」(${e.outfit.need})! 去小窝里换上吧。`, action: { label: '去小窝', panel: true } };
  if (e.kind === 'cleared') return { text: `今天的都背完了, 吃得好饱!${e.tomorrow ? ` 明天有 ${e.tomorrow} 张。` : ''}` };
  if (e.kind === 'leech') return { text: `刚才有${e.n > 1 ? ` ${e.n} ` : ''}张卡片忘了好多次了。别灰心! 换个记法: 加个例句、图片, 或者编个谐音, 就好记了。`, action: { label: '看看难记卡', href: '#/stats' } };
  if (e.kind === 'fed') return { text: `刚才吃了 ${e.n} 口, 好香!` };
  return null;
}

// 点它说的有用的话, 重要的在前: [{ text, action?: { label, href } }]
// c: { sets 有几个卡片集, hour, today, due, reviews, fresh, held, streak, mistakes 该重做几道, leeches 难记卡几张, examDays 离考试几天 (没有是 null), tomorrow }
export function tips(c) {
  const out = [];
  const go = (label, href) => ({ label, href });
  if (!c.sets) {
    out.push({ text: '还没有卡片集呢。先建一个, 或者把已有的导入进来, 我陪你背!', action: go('新建', '#/new') });
    return out;
  }
  const late = c.hour >= 23 || c.hour < 5;
  if (!c.today && c.streak > 0 && c.hour >= 19) out.push({ text: `今天还没学! 再不背, 连续 ${c.streak} 天就断了。`, action: go('去背', '#/review') });
  if (c.due) {
    const parts = [c.reviews ? `复习 ${c.reviews} 张` : '', c.fresh ? `新词 ${c.fresh} 个` : ''].filter(Boolean).join('、');
    out.push({ text: `今天还有 ${c.due} 张要背 (${parts})。背完我就吃饱了!`, action: go('去背', '#/review') });
  }
  if (c.mistakes) out.push({ text: `错题集里有 ${c.mistakes} 道该重做了。过而不改, 是谓过矣!`, action: go('去重做', '#/mistakes/review') });
  if (c.held) out.push({ text: `还有 ${c.held} 张积压的, 每天多背一点就消化掉了。`, action: go('接着背', '#/review') });
  if (c.examDays !== null && c.examDays >= 0) out.push({ text: c.examDays === 0 ? '今天考试, 加油! 你准备了这么久, 一定行!' : `离考试还有 ${c.examDays} 天, 一天一天来, 来得及!` });
  if (c.leeches) out.push({ text: `有 ${c.leeches} 张老是忘的难记卡。换个记法更好记: 加个例句、图片, 或者编个谐音。`, action: go('看看', '#/stats') });
  if (!c.due && c.today) out.push({ text: `今天的都背完了, 真棒! ${c.tomorrow ? `明天有 ${c.tomorrow} 张。` : '明天没有要复习的。'}`, action: c.tomorrow ? go('提前复习一点', '#/review') : null });
  if (!c.due && !c.today) out.push({ text: '今天没有要复习的。想多学一点, 可以再学几个新词。', action: go('去学', '#/review') });
  if (late) out.unshift({ text: '很晚了, 早点睡吧。睡着的时候, 白天背的会记得更牢。' });
  return out.map((t) => (t.action ? t : { text: t.text }));
}

// 《论语》里讲学习的话, 带白话 (who: 说的人, 不写是孔子)
export const QUOTES = [
  { text: '学而时习之，不亦说乎？', from: '学而', plain: '学了以后按时复习，不也很快乐吗？' },
  { text: '温故而知新，可以为师矣。', from: '为政', plain: '复习学过的，能从中有新的体会，就可以当老师了。(「温故」就是从这儿来的)' },
  { text: '学而不思则罔，思而不学则殆。', from: '为政', plain: '光学不想会越学越糊涂，光想不学就没有根据，靠不住。' },
  { text: '知之为知之，不知为不知，是知也。', from: '为政', plain: '知道就是知道，不知道就是不知道，这才是真的知道。' },
  { text: '吾十有五而志于学。', from: '为政', plain: '我十五岁就立志学习。' },
  { text: '三人行，必有我师焉。择其善者而从之，其不善者而改之。', from: '述而', plain: '几个人在一起，一定有我能学的。学他们的长处，看到短处就对照着改自己。' },
  { text: '默而识之，学而不厌，诲人不倦。', from: '述而', plain: '默默地记在心里，学习不满足，教别人不嫌累。' },
  { text: '不愤不启，不悱不发。', from: '述而', plain: '不到想弄懂又弄不懂的时候不去开导，不到想说又说不出来的时候不去点拨。(先自己想，再看答案)' },
  { text: '发愤忘食，乐以忘忧，不知老之将至云尔。', from: '述而', plain: '用起功来忘了吃饭，快乐得忘了忧愁，连自己快老了都不知道。' },
  { text: '君子坦荡荡，小人长戚戚。', from: '述而', plain: '君子心里坦坦荡荡，小人总是忧愁不安。' },
  { text: '敏而好学，不耻下问。', from: '公冶长', plain: '聪明又爱学，不觉得向不如自己的人请教是丢脸的事。' },
  { text: '知之者不如好之者，好之者不如乐之者。', from: '雍也', plain: '知道它不如喜欢它，喜欢它不如以它为乐。' },
  { text: '力不足者，中道而废。今女画。', from: '雍也', plain: '真是力气不够的人，是走到半路才停下的；你现在是还没走就给自己划了界限。' },
  { text: '学如不及，犹恐失之。', from: '泰伯', plain: '学习像追赶什么一样，生怕赶不上；学到了，又怕忘掉。(所以要复习)' },
  { text: '譬如为山，未成一篑，止，吾止也。', from: '子罕', plain: '好比堆一座山，只差一筐土了，这时停下来，是我自己停下的。(别在快成的时候放弃)' },
  { text: '逝者如斯夫，不舍昼夜。', from: '子罕', plain: '时间就像这河水，日日夜夜不停地流走。' },
  { text: '后生可畏，焉知来者之不如今也？', from: '子罕', plain: '年轻人是可敬畏的，怎么知道他们将来赶不上现在的人呢？' },
  { text: '岁寒，然后知松柏之后凋也。', from: '子罕', plain: '到了一年最冷的时候，才知道松柏是最后凋谢的。(难的时候才看得出谁坚持得住)' },
  { text: '知者不惑，仁者不忧，勇者不惧。', from: '子罕', plain: '有智慧的人不迷惑，有仁德的人不忧愁，勇敢的人不害怕。' },
  { text: '见贤思齐焉，见不贤而内自省也。', from: '里仁', plain: '看见比自己好的人，就想向他看齐；看见不好的人，就反省自己有没有一样的毛病。' },
  { text: '欲速则不达。', from: '子路', plain: '只想着快，反而达不到目的。(一下背太多不如每天背一点)' },
  { text: '工欲善其事，必先利其器。', from: '卫灵公', plain: '工匠想把活做好，先要把工具磨快。' },
  { text: '人无远虑，必有近忧。', from: '卫灵公', plain: '人没有长远的打算，眼前就会有忧愁。' },
  { text: '过而不改，是谓过矣。', from: '卫灵公', plain: '有了错不改，这才叫真正的错。(所以有错题集)' },
  { text: '吾尝终日不食，终夜不寝，以思，无益，不如学也。', from: '卫灵公', plain: '我曾经整天不吃、整夜不睡地空想，没有用处，还不如去学习。' },
  { text: '君子求诸己，小人求诸人。', from: '卫灵公', plain: '君子要求自己，小人要求别人。' },
  { text: '古之学者为己，今之学者为人。', from: '宪问', plain: '古时候的人学习是为了充实自己，现在有的人学习是为了给别人看。' },
  { text: '不患人之不己知，患不知人也。', from: '学而', plain: '不担心别人不了解自己，只担心自己不了解别人。' },
  { text: '吾日三省吾身。', from: '学而', who: '曾子', plain: '我每天多次反省自己。' },
  { text: '日知其所亡，月无忘其所能，可谓好学也已矣。', from: '子张', who: '子夏', plain: '每天学一点还不会的，每个月不忘掉已经会的，就可以说是好学了。(这就是每天背新词、按时复习)' },
];

export const quoteSource = (q) => `${q.who ?? '孔子'}《论语·${q.from}》`;

// 随机一句 (不跟上一句一样)
export function randomQuote(last = null, rand = Math.random) {
  if (QUOTES.length < 2) return QUOTES[0];
  let q;
  do q = QUOTES[Math.floor(rand() * QUOTES.length)];
  while (q === last);
  return q;
}
