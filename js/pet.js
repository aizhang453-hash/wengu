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
  if (e.kind === 'leech') return { text: `又有${e.n > 1 ? ` ${e.n} ` : ''}张卡片忘了 8 次以上, 成了难记卡。别灰心! 换个记法: 加个例句、图片, 或者编个谐音, 就好记了。`, action: { label: '看看难记卡', href: '#/stats' } };
  if (e.kind === 'fed') return { text: `刚才吃了 ${e.n} 口, 好香!` };
  return null;
}

// 点它说的有用的话, 要紧的在前: [{ id, text, action?: { label, href } | { label, edit: { setId, cardId } } }]
// c: { sets 有几个卡片集, hour, today 今天学了几次, due, reviews, fresh, held, streak, idleDays, mistakes 该重做几道,
//      leeches 难记卡几张, examDays 离考试几天 (没有是 null), tomorrow }
//   下面这些是细算的 (views/pet.js 的 insight), 没算就不说:
//      minutes 今天的大概要几分钟, pace { id, href, title, learned7, need7, perDay } 计划跟不上了,
//      rest { href, title, left } 到了考前只复习还有新词没学, retention { n, ok, target } 最近 7 天复习时记住的,
//      leech { term, lapses, setId, cardId } 忘得最多的那张, neglect { href, title, fresh, days } 很久没碰的卡片集
export function tips(c) {
  const out = [];
  const go = (label, href) => ({ label, href });
  const add = (id, text, action = null) => out.push(action ? { id, text, action } : { id, text });
  if (!c.sets) {
    add('empty', '还没有卡片集呢。先建一个, 或者把已有的导入进来, 我陪你背!', go('新建', '#/new'));
    return out;
  }
  if (c.hour >= 23 || c.hour < 5) add('late', '很晚了, 早点睡吧。睡着的时候, 白天背的会记得更牢; 熬夜硬背反而记不住。');
  if (c.idleDays >= 2 && !c.today) add('back', `${c.idleDays} 天没来了, 好想你! 不用一下补完, 先背今天的${c.held ? ', 积压的我每天给你排一点' : ''}。`, go('去背', '#/review'));
  else if (!c.today && c.streak > 0 && c.hour >= 19) add('streak', `今天还没学! 再不背, 连续 ${c.streak} 天就断了。`, go('去背', '#/review'));
  if (c.due) {
    const parts = [c.reviews ? `复习 ${c.reviews} 张` : '', c.fresh ? `新词 ${c.fresh} 个` : ''].filter(Boolean).join('、');
    add('due', `今天还有 ${c.due} 张要背 (${parts})${c.minutes ? `, 照你平时的速度大概 ${c.minutes} 分钟` : ''}。背完我就吃饱了!`, go('去背', '#/review'));
  }
  if (c.mistakes) add('mistakes', `错题集里有 ${c.mistakes} 道该重做了。过而不改, 是谓过矣!`, go('去重做', '#/mistakes/review'));
  if (c.pace) {
    const p = c.pace;
    add('pace', `最近 7 天「${p.title}」学了 ${p.learned7} 个新词, 按计划该学 ${p.need7} 个左右。少学的会分到以后几天, 现在每天要学 ${p.perDay} 个了, 越拖越多。今天多学几个吧!`, go('去学', '#/review'));
  }
  if (c.rest) add('rest', `「${c.rest.title}」还有 ${c.rest.left} 个新词没学, 已经到了考前只复习的日子, 新词不排了。想学完的话, 在计划里把「最后几天只复习」改少一点。`, go('看计划', c.rest.href));
  if (c.examDays !== null && c.examDays >= 0 && c.examDays <= 7) {
    add('exam', c.examDays === 0 ? '今天考试, 加油! 你准备了这么久, 一定行! 先深呼吸, 会做的先做。' : `离考试只有 ${c.examDays} 天了! 别学太多新的了, 多重做错题集、多过几遍难记卡, 每天早点睡。`, c.examDays ? go('重做错题', '#/mistakes/review/all') : null);
  }
  if (c.retention && c.retention.n >= 30) {
    const pct = Math.round((c.retention.ok / c.retention.n) * 100);
    const target = Math.round(c.retention.target * 100);
    if (pct < target - 8) add('retention', `最近 7 天复习时记住了 ${pct}%, 比你定的 ${target}% 低不少。可能新词学得太快了: 先少学几个新词, 把复习稳住; 翻面之前多想一会儿。`);
  }
  if (c.held) add('held', `还有 ${c.held} 张积压的, 每天多背一点就消化掉了。`, go('接着背', '#/review'));
  if (c.leech) {
    const more = c.leeches > 1 ? ` (一共 ${c.leeches} 张难记卡)` : '';
    add('leech', `「${c.leech.term}」已经忘了 ${c.leech.lapses} 次了${more}。光多背几遍不管用, 换个记法: 加个例句、图片, 拆开词根, 或者编个谐音。`, { label: '改这张', edit: { setId: c.leech.setId, cardId: c.leech.cardId } });
  } else if (c.leeches) add('leech', `有 ${c.leeches} 张老是忘的难记卡。换个记法更好记: 加个例句、图片, 或者编个谐音。`, go('看看', '#/stats'));
  if (c.neglect) {
    const n = c.neglect;
    add('neglect', `「${n.title}」还有 ${n.fresh} 个新词没学, ${n.days ? `已经 ${n.days} 天没碰了` : '还没开始'}。定个每天背几个的计划, 每天自动给你排上。`, go('去定计划', n.href));
  }
  if (c.examDays !== null && c.examDays > 7) add('exam', `离考试还有 ${c.examDays} 天, 一天一天来, 来得及!`);
  if (!c.due && c.today) add('done', `今天的都背完了, 真棒! ${c.tomorrow ? `明天有 ${c.tomorrow} 张。` : '明天没有要复习的。'}`, c.tomorrow ? go('提前复习一点', '#/review') : null);
  if (!c.due && !c.today) add('none', '今天没有要复习的。想多学一点, 可以再学几个新词。', go('去学', '#/review'));
  return out;
}

// 「我学得怎么样」(r: { days7 这 7 天学了几天, answers7 答了几题, answersPrev 上一个 7 天, fresh7 学了几个新词,
//   retention { n, ok, target }, mature 记牢了几张, studied 背过几张, streak, mastered 错题掌握了几道, mistakesLeft 还在重做几道, examDays })
// 返回 { text 总的一句, list 一条一条 }
export function report(r) {
  let text;
  if (!r.answers7) text = '这 7 天还没学呢。没关系, 从今天开始, 每天一点点!';
  else if (!r.answersPrev) text = '这 7 天开了个好头, 继续!';
  else if (r.answers7 >= r.answersPrev * 1.2) text = '这 7 天比上一个 7 天用功多了, 继续保持!';
  else if (r.answers7 >= r.answersPrev * 0.85) text = '这 7 天很稳, 跟上一个 7 天差不多。';
  else text = '这 7 天比上一个 7 天学得少了一点, 明天多背几张补回来。';
  const list = [];
  list.push(`学了 ${r.days7} 天, 答了 ${r.answers7} 题 (上一个 7 天 ${r.answersPrev} 题)`);
  if (r.fresh7) list.push(`学了 ${r.fresh7} 个新词`);
  if (r.retention?.n >= 10) {
    const pct = Math.round((r.retention.ok / r.retention.n) * 100);
    const target = Math.round(r.retention.target * 100);
    list.push(`复习时记住了 ${pct}% (你定的是 ${target}%)${pct < target - 8 ? ', 有点低, 新词先少学一点' : pct >= target ? ', 很好' : ''}`);
  }
  if (r.studied) list.push(`记牢了 ${r.mature} 张 (隔 21 天以上才复习的), 一共背过 ${r.studied} 张`);
  if (r.mastered || r.mistakesLeft) list.push(`错题集: 掌握了 ${r.mastered} 道, 还在重做 ${r.mistakesLeft} 道`);
  if (r.streak) list.push(`已经连续打卡 ${r.streak} 天`);
  if (r.examDays !== null && r.examDays >= 0) list.push(r.examDays ? `离考试还有 ${r.examDays} 天` : '今天考试, 加油!');
  return { text, list };
}

// 学习的小窍门 (点它的时候跟有用的话、《论语》轮着说)
export const STUDY_TIPS = [
  '翻面之前先自己想答案, 想不出来再看。自己想过的, 比直接看答案记得牢得多。',
  '每天背一点, 比考前一天背一大堆强: 隔几天复习一次, 忘得最慢。我给你排的复习就是按这个来的。',
  '睡觉的时候, 大脑会把白天学的整理、记牢。熬夜突击反而记不住。',
  '「记得」要按真话点。假装记得, 下次就排得太远, 到时候真忘了。',
  '给难记的词配一个自己造的例句, 比只背中文意思记得牢。',
  '给卡片加一张图: 图和字一起记, 比只有字好记。',
  '长得像的词 (比如 affect 和 effect) 放在一起比一比, 就不容易混了。',
  '拆开词根词缀: un-believ-able。认识一个词根, 能猜出一串词。',
  '编个谐音或者小故事, 越好笑越好记。',
  '背完试着用这个词说一句话、写一句话。用过的词忘得慢。',
  '学 25 分钟, 休息 5 分钟, 比一口气学两个小时效率高。',
  '学的时候把手机通知关掉: 分一次心, 要好几分钟才回得过神来。',
  '把刚学的讲给别人听。讲得出来, 才是真懂了。',
  '做错的题别只看答案: 写下为什么错, 下次碰到同一类的就会想起来。',
  '错题过几天再重做一遍。隔了几天还能做对, 才算真会了。',
  '新词一天别学太多: 今天学的新词, 以后好几天都要复习, 学得越多以后越累。',
  '先背最常考的词, 同样的时间, 分数涨得最多。',
  '读文章碰到不认识的词, 先看上下文猜意思, 再去查。猜过再查的, 记得更牢。',
  '几样东西换着学 (单词、阅读、数学轮着来), 比一直学一样更能分清、记牢。',
  '学累了起来走一走、动一动, 回来脑子更清醒。',
  '早上花几分钟把今天的复习背完, 一天都轻松。',
  '正着背 (词 → 意思) 会了, 也试试反着背 (意思 → 词)。',
  '考前几天别学新的了: 把错题和难记卡多过几遍, 早点睡。',
  '累了就停。硬撑着学记住的很少, 明天再来比今天硬撑强。',
  '不会的题先自己想几分钟再看解析: 想过了, 解析才看得进去。',
  '定个小目标, 比如「背完今天的复习 + 5 个新词」, 做到了就奖励自己一下。',
  '学之前先看一眼要学什么 (标题、重点), 带着问题去学更有效。',
  '一个词记不住, 想想它跟你知道的什么有关系, 把新的挂在旧的上面。',
  '大声读出来: 眼睛看、嘴巴说、耳朵听, 比光看记得牢。',
  '别一直看已经会的, 时间多花在还不会的上面。',
];

// 《论语》, 带白话 (who: 说的人, 不写是孔子; tags: 什么时候说合适, 见 quoteTags)
//   review 复习 · think 思考、提问 · humble 向人学习 · joy 学习的快乐 · persist 坚持 · mistake 改错 · steady 别急
//   · time 珍惜时间 · self 要求自己 · start 立志
const q = (text, from, plain, tags = [], who = undefined) => (who ? { text, from, plain, tags, who } : { text, from, plain, tags });
export const QUOTES = [
  // 学而
  q('学而时习之，不亦说乎？', '学而', '学了以后按时复习，不也很快乐吗？', ['review', 'joy']),
  q('有朋自远方来，不亦乐乎？人不知而不愠，不亦君子乎？', '学而', '有朋友从远方来，不也很高兴吗？别人不了解我，我也不生气，不也是君子吗？', ['joy']),
  q('吾日三省吾身。', '学而', '我每天多次反省自己。', ['mistake', 'self'], '曾子'),
  q('巧言令色，鲜矣仁！', '学而', '花言巧语、满脸讨好的人，很少是真有仁德的。', ['self']),
  q('弟子入则孝，出则弟，谨而信，泛爱众，而亲仁。行有余力，则以学文。', '学而', '在家孝顺父母，出门尊敬长辈，做事谨慎、说话算数，爱大家，亲近好人。做到了这些还有余力，就去学习文化知识。'),
  q('君子食无求饱，居无求安，敏于事而慎于言，就有道而正焉，可谓好学也已。', '学而', '君子吃饭不求吃饱，住不求舒服，做事勤快，说话小心，向有学问的人请教来改正自己，这就算是好学了。', ['self']),
  q('主忠信。无友不如己者。过则勿惮改。', '学而', '做人要忠诚守信，跟比自己好的人交朋友，有了错不要怕改。', ['mistake']),
  q('与朋友交，言而有信。虽曰未学，吾必谓之学矣。', '学而', '跟朋友交往说话算数，这样的人就算说自己没读过书，我也一定说他是有学问的。', [], '子夏'),
  q('君子务本，本立而道生。', '学而', '君子要在根本上下功夫，根本打好了，路自然就出来了。(基础打牢最要紧)', ['steady'], '有子'),
  q('不患人之不己知，患不知人也。', '学而', '不担心别人不了解自己，只担心自己不了解别人。', ['self']),
  // 为政
  q('温故而知新，可以为师矣。', '为政', '复习学过的，能从中有新的体会，就可以当老师了。(「温故」就是从这儿来的)', ['review']),
  q('学而不思则罔，思而不学则殆。', '为政', '光学不想会越学越糊涂，光想不学就没有根据，靠不住。', ['think']),
  q('知之为知之，不知为不知，是知也。', '为政', '知道就是知道，不知道就是不知道，这才是真的知道。(不会的就点「忘了」，别假装记得)', ['think', 'self']),
  q('吾十有五而志于学。', '为政', '我十五岁就立志学习。', ['start']),
  q('三十而立，四十而不惑，五十而知天命，六十而耳顺，七十而从心所欲，不逾矩。', '为政', '三十岁能自立，四十岁不再迷惑，五十岁懂得了天命，六十岁听什么都能明白，七十岁随心所欲也不会越过规矩。', ['start']),
  q('人而无信，不知其可也。', '为政', '一个人不讲信用，不知道他还能干什么。', ['self']),
  q('多闻阙疑，慎言其余，则寡尤。', '为政', '多听，有怀疑的先放一边，有把握的也小心地说，就少犯错。', ['think']),
  q('见义不为，无勇也。', '为政', '看到该做的事却不去做，就是没有勇气。'),
  q('君子不器。', '为政', '君子不像器具那样只有一种用处。(多学几样本事)'),
  q('先行其言而后从之。', '为政', '想说的先做到，再说出来。', ['self']),
  // 八佾
  q('成事不说，遂事不谏，既往不咎。', '八佾', '做成了的事不再说，已经做了的事不再劝，过去的就不再追究。(昨天没背就算了，从今天重新开始)', ['mistake', 'persist']),
  // 里仁
  q('朝闻道，夕死可矣。', '里仁', '早上懂得了真理，就是晚上死了也值得。(学到真东西有多宝贵)', ['time']),
  q('德不孤，必有邻。', '里仁', '有品德的人不会孤单，一定有志同道合的人跟他做伴。'),
  q('见贤思齐焉，见不贤而内自省也。', '里仁', '看见比自己好的人，就想向他看齐；看见不好的人，就反省自己有没有一样的毛病。', ['humble', 'self']),
  q('君子欲讷于言而敏于行。', '里仁', '君子说话要谨慎，做事要勤快。(少说多做)', ['self']),
  q('君子喻于义，小人喻于利。', '里仁', '君子懂得的是道义，小人懂得的是利益。'),
  q('不患无位，患所以立。不患莫己知，求为可知也。', '里仁', '不愁没有位置，愁的是自己没有站得住的本事；不愁没人知道自己，去做值得别人知道的事。', ['self']),
  // 公冶长
  q('敏而好学，不耻下问。', '公冶长', '聪明又爱学，不觉得向不如自己的人请教是丢脸的事。', ['humble', 'think']),
  q('朽木不可雕也，粪土之墙不可杇也。', '公冶长', '学生宰予大白天睡觉，孔子说：烂木头没法雕刻，粪土垒的墙没法粉刷。(该学的时候别偷懒)', ['persist']),
  q('始吾于人也，听其言而信其行；今吾于人也，听其言而观其行。', '公冶长', '以前我看人，听了他的话就相信他会做到；现在我看人，听了他的话还要看他怎么做。(说到要做到)', ['self']),
  q('十室之邑，必有忠信如丘者焉，不如丘之好学也。', '公冶长', '十户人家的小地方，一定有像我一样忠诚守信的人，只是不如我爱学习罢了。(孔子最得意的是自己好学)', ['joy']),
  // 雍也
  q('贤哉，回也！一箪食，一瓢饮，在陋巷，人不堪其忧，回也不改其乐。贤哉，回也！', '雍也', '颜回真了不起！一竹筐饭，一瓢水，住在破巷子里，别人都受不了那种苦，他却一样快快乐乐地学习。', ['joy', 'persist']),
  q('有颜回者好学，不迁怒，不贰过。', '雍也', '颜回好学：不拿别人出气，同样的错不犯第二次。(这就是错题集要做的)', ['mistake']),
  q('知之者不如好之者，好之者不如乐之者。', '雍也', '知道它不如喜欢它，喜欢它不如以它为乐。', ['joy']),
  q('力不足者，中道而废。今女画。', '雍也', '真是力气不够的人，是走到半路才停下的；你现在是还没走就给自己划了界限。', ['persist']),
  q('质胜文则野，文胜质则史。文质彬彬，然后君子。', '雍也', '朴实多于文采就显得粗野，文采多于朴实就显得浮夸。两样配合得恰到好处，才是君子。'),
  q('知者乐水，仁者乐山。', '雍也', '聪明的人喜欢水，仁德的人喜欢山。'),
  q('己欲立而立人，己欲达而达人。', '雍也', '自己想站得住，也帮别人站得住；自己想走得通，也帮别人走得通。', ['humble']),
  // 述而
  q('默而识之，学而不厌，诲人不倦。', '述而', '默默地记在心里，学习不满足，教别人不嫌累。', ['review', 'joy']),
  q('志于道，据于德，依于仁，游于艺。', '述而', '立志追求真理，做事守住品德，待人依靠仁爱，再在各种技艺里自在地学习。', ['start']),
  q('不愤不启，不悱不发。', '述而', '不到想弄懂又弄不懂的时候不去开导，不到想说又说不出来的时候不去点拨。(先自己想，再看答案)', ['think']),
  q('举一隅不以三隅反，则不复也。', '述而', '教他一个角，他不能自己推想出另外三个角，就先不往下教了。(「举一反三」就是从这儿来的)', ['think']),
  q('饭疏食饮水，曲肱而枕之，乐亦在其中矣。不义而富且贵，于我如浮云。', '述而', '吃粗粮喝白水，弯着胳膊当枕头，乐趣也在这里面。用不正当的手段得来的富贵，对我来说就像天上的浮云。', ['joy']),
  q('发愤忘食，乐以忘忧，不知老之将至云尔。', '述而', '用起功来忘了吃饭，快乐得忘了忧愁，连自己快老了都不知道。', ['joy', 'persist']),
  q('我非生而知之者，好古，敏以求之者也。', '述而', '我不是生下来就什么都懂的，只是喜欢古代的学问，勤快地去求学罢了。(聪明是学出来的)', ['persist', 'humble']),
  q('三人行，必有我师焉。择其善者而从之，其不善者而改之。', '述而', '几个人在一起，一定有我能学的。学他们的长处，看到短处就对照着改自己。', ['humble']),
  q('德之不修，学之不讲，闻义不能徙，不善不能改，是吾忧也。', '述而', '品德不去修养，学问不去讲习，知道了该做的却不去做，有缺点不能改，这些是我担心的。', ['mistake', 'self']),
  q('仁远乎哉？我欲仁，斯仁至矣。', '述而', '仁离我们很远吗？我想做到，它就来了。(想做的事，开始做就近了)', ['start']),
  q('君子坦荡荡，小人长戚戚。', '述而', '君子心里坦坦荡荡，小人总是忧愁不安。', ['self']),
  // 泰伯
  q('士不可以不弘毅，任重而道远。', '泰伯', '读书人不能不心胸宽广、意志坚强，因为担子重、路又远。', ['persist'], '曾子'),
  q('以能问于不能，以多问于寡；有若无，实若虚。', '泰伯', '自己有本事还向没本事的人请教，自己懂得多还向懂得少的人请教；有学问却像没有一样，很充实却像很空虚一样。', ['humble'], '曾子'),
  q('笃信好学，守死善道。', '泰伯', '坚定地相信，努力地学习，一辈子守住正道。', ['persist']),
  q('学如不及，犹恐失之。', '泰伯', '学习像追赶什么一样，生怕赶不上；学到了，又怕忘掉。(所以要复习)', ['review', 'time']),
  // 子罕
  q('三军可夺帅也，匹夫不可夺志也。', '子罕', '三军的主帅可以被抓走，一个普通人的志向却不能被夺走。', ['persist', 'start']),
  q('譬如为山，未成一篑，止，吾止也。', '子罕', '好比堆一座山，只差一筐土了，这时停下来，是我自己停下的。(别在快成的时候放弃)', ['persist']),
  q('譬如平地，虽覆一篑，进，吾往也。', '子罕', '好比平地上堆山，就算才倒下一筐土，只要往前，就是我自己在前进。(再少也比不做强)', ['persist', 'start']),
  q('苗而不秀者有矣夫！秀而不实者有矣夫！', '子罕', '庄稼长了苗却不开花的有啊！开了花却不结果的也有啊！(开了头还要坚持到最后)', ['persist']),
  q('惜乎！吾见其进也，未见其止也。', '子罕', '可惜啊(颜回早早去世了)！我只看见他一直在进步，从没见他停下来过。', ['persist']),
  q('逝者如斯夫，不舍昼夜。', '子罕', '时间就像这河水，日日夜夜不停地流走。', ['time']),
  q('后生可畏，焉知来者之不如今也？', '子罕', '年轻人是可敬畏的，怎么知道他们将来赶不上现在的人呢？', ['start']),
  q('岁寒，然后知松柏之后凋也。', '子罕', '到了一年最冷的时候，才知道松柏是最后凋谢的。(难的时候才看得出谁坚持得住)', ['persist']),
  q('知者不惑，仁者不忧，勇者不惧。', '子罕', '有智慧的人不迷惑，有仁德的人不忧愁，勇敢的人不害怕。', ['steady']),
  // 先进
  q('过犹不及。', '先进', '做过了头，跟做得不够一样，都不好。(一天别学太多新词)', ['steady']),
  // 颜渊
  q('己所不欲，勿施于人。', '颜渊', '自己不想要的，不要强加给别人。'),
  q('内省不疚，夫何忧何惧？', '颜渊', '反省自己，问心无愧，还有什么好忧愁、好害怕的呢？', ['self', 'steady']),
  q('君子以文会友，以友辅仁。', '颜渊', '君子靠学问结交朋友，靠朋友帮助自己进步。(找个同学一起学)', ['humble'], '曾子'),
  q('君子成人之美，不成人之恶。', '颜渊', '君子帮助别人做成好事，不帮别人做坏事。'),
  // 子路
  q('欲速则不达。', '子路', '只想着快，反而达不到目的。(一下背太多不如每天背一点)', ['steady']),
  q('君子和而不同，小人同而不和。', '子路', '君子跟人和睦相处，但不盲目附和；小人盲目附和，却不能真正和睦。'),
  q('君子泰而不骄，小人骄而不泰。', '子路', '君子安详舒泰却不骄傲，小人骄傲却不安详。', ['steady']),
  q('人而无恒，不可以作巫医。', '子路', '孔子引用南方人的话：人没有恒心，连巫医都当不好。(学什么都贵在坚持)', ['persist']),
  // 宪问
  q('古之学者为己，今之学者为人。', '宪问', '古时候的人学习是为了充实自己，现在有的人学习是为了给别人看。', ['self']),
  q('不怨天，不尤人，下学而上达。', '宪问', '不抱怨天，不责怪人，从基础学起，一步步往上走。', ['steady', 'self']),
  q('是知其不可而为之者与？', '宪问', '看城门的人说孔子：就是那个明知道很难做到，还偏要去做的人吧？(难也要试)', ['persist'], '晨门'),
  // 卫灵公
  q('工欲善其事，必先利其器。', '卫灵公', '工匠想把活做好，先要把工具磨快。', ['steady']),
  q('人无远虑，必有近忧。', '卫灵公', '人没有长远的打算，眼前就会有忧愁。(早点定计划)', ['steady', 'time']),
  q('过而不改，是谓过矣。', '卫灵公', '有了错不改，这才叫真正的错。(所以有错题集)', ['mistake']),
  q('吾尝终日不食，终夜不寝，以思，无益，不如学也。', '卫灵公', '我曾经整天不吃、整夜不睡地空想，没有用处，还不如去学习。', ['think']),
  q('君子求诸己，小人求诸人。', '卫灵公', '君子要求自己，小人要求别人。', ['self']),
  q('君子病无能焉，不病人之不己知也。', '卫灵公', '君子只担心自己没有本事，不担心别人不了解自己。', ['self']),
  q('小不忍，则乱大谋。', '卫灵公', '小事上不能忍耐，就会坏了大事。(忍住刷手机，先把今天的背完)', ['steady']),
  q('众恶之，必察焉；众好之，必察焉。', '卫灵公', '大家都讨厌的，一定要自己去看看；大家都喜欢的，也一定要自己去看看。(自己想清楚，别光听别人的)', ['think']),
  q('当仁，不让于师。', '卫灵公', '碰到该做的好事，就是在老师面前也不推让。'),
  q('有教无类。', '卫灵公', '谁都可以受教育，不分贵贱。(每个人都能学好)', ['start']),
  q('辞达而已矣。', '卫灵公', '说话写文章，把意思表达清楚就够了。(写作文先求清楚)'),
  q('不曰「如之何，如之何」者，吾末如之何也已矣。', '卫灵公', '一个人从来不问「怎么办，怎么办」，我也拿他没办法了。(有不懂的就要问)', ['think']),
  // 季氏
  q('益者三友，损者三友。友直，友谅，友多闻，益矣。', '季氏', '有益的朋友有三种，有害的朋友也有三种。跟正直的、诚实的、见多识广的人交朋友，就有好处。', ['humble']),
  q('生而知之者，上也；学而知之者，次也；困而学之，又其次也；困而不学，民斯为下矣。', '季氏', '生来就懂的是上等；学了才懂的是次一等；碰到难处才去学的又次一等；碰到难处还不学的，就是最下等了。', ['persist', 'start']),
  q('视思明，听思聪，色思温，貌思恭，言思忠，事思敬，疑思问，忿思难，见得思义。', '季氏', '君子有九件事要想：看要想看清，听要想听明白，脸色要想温和，态度要想恭敬，说话要想忠诚，做事要想认真，有疑问要想着去问，生气要想到后果，看到好处要想该不该得。', ['think']),
  // 阳货
  q('性相近也，习相远也。', '阳货', '人生来的本性差不多，后来的学习和习惯让人差得远了。(差距是学出来的)', ['start', 'persist']),
  q('好仁不好学，其蔽也愚；好知不好学，其蔽也荡。', '阳货', '喜欢仁德却不爱学习，毛病是容易被人愚弄；喜欢耍聪明却不爱学习，毛病是没有根基。', ['think']),
  q('道听而途说，德之弃也。', '阳货', '路上听来的，不加思考就到处说，这是丢掉了品德。(听到的要自己想一想)', ['think']),
  q('饱食终日，无所用心，难矣哉！', '阳货', '整天吃饱了饭，什么心思都不用，这样的人很难有出息啊！', ['time']),
  // 微子
  q('往者不可谏，来者犹可追。', '微子', '过去的已经挽回不了，未来的还来得及。(前几天没背也没关系，从今天开始追)', ['persist', 'mistake'], '楚狂接舆'),
  // 子张
  q('日知其所亡，月无忘其所能，可谓好学也已矣。', '子张', '每天学一点还不会的，每个月不忘掉已经会的，就可以说是好学了。(这就是每天背新词、按时复习)', ['review'], '子夏'),
  q('博学而笃志，切问而近思，仁在其中矣。', '子张', '广泛地学习，坚定志向，恳切地提问，多想跟眼前有关的事，仁就在这里面了。', ['think'], '子夏'),
  q('百工居肆以成其事，君子学以致其道。', '子张', '工匠在作坊里干活来完成手艺，君子靠学习来掌握道理。', ['steady'], '子夏'),
  q('小人之过也必文。', '子张', '小人犯了错，一定要找借口掩饰。', ['mistake'], '子夏'),
  q('君子之过也，如日月之食焉：过也，人皆见之；更也，人皆仰之。', '子张', '君子的错就像日食月食：犯了错，大家都看得见；改了，大家都敬佩他。(有错不丢人，改了就好)', ['mistake'], '子贡'),
  q('仕而优则学，学而优则仕。', '子张', '做了官有余力就去学习，学习有余力就去做官。(学习是一辈子的事)', [], '子夏'),
];

export const quoteSource = (x) => `${x.who ?? '孔子'}《论语·${x.from}》`;

// 现在说哪类《论语》合适 (心情、今天的情况)
export function quoteTags(c) {
  const tags = [];
  if (c.mistakes) tags.push('mistake');
  if (c.idleDays >= 2 || c.mood === 'sad' || c.mood === 'hungry') tags.push('persist');
  if (c.mood === 'worried' || (c.examDays !== null && c.examDays <= 30)) tags.push('steady');
  if (c.mood === 'happy') tags.push('joy', 'review');
  if (c.leeches) tags.push('think');
  if (!c.today && c.hour < 11) tags.push('start', 'time');
  return tags;
}

// 不重复地挑一个: 一轮里每个都说过一遍才从头来 (heard: 这一轮说过的第几个)。
// tags: 合适的话题, 一半的时候挑这些里面的。返回 { index, heard }
export function pickNext(list, heard = [], { tags = [], rand = Math.random } = {}) {
  const seen = new Set(heard.filter((i) => Number.isInteger(i) && i >= 0 && i < list.length));
  let left = list.map((_, i) => i).filter((i) => !seen.has(i));
  if (!left.length) {
    // 一轮说完了: 从头来, 只是别马上又说刚才那个
    const last = heard.at(-1);
    left = list.map((_, i) => i).filter((i) => i !== last || list.length < 2);
    seen.clear();
  }
  if (tags.length && rand() < 0.5) {
    const fit = left.filter((i) => list[i].tags?.some((t) => tags.includes(t)));
    if (fit.length) left = fit;
  }
  const index = left[Math.floor(rand() * left.length)];
  return { index, heard: [...seen, index] };
}

// 随机一句 (不跟上一句一样)
export function randomQuote(last = null, rand = Math.random) {
  let x;
  do x = QUOTES[Math.floor(rand() * QUOTES.length)];
  while (x === last);
  return x;
}
