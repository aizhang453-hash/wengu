// 「人生草稿」的内容: 出身、性格、心愿、每年的事、路口、结局。规则在 ./draft.js。
// 事: { id, from, to (不写就是 from), w 权重, once (默认一辈子一次), fixed 条件满足就一定发生, p 每年单独掷骰子的概率 (不常有的事),
//      if(c), text, fx 属性变化, set [标记], mark 记号 (以后的稿能看见), k 种类, do(c) }
//   每年: fixed 的都发生, p 的各掷一次, 再从剩下的里按权重挑一件
// 路口: { id, age, to, if(c), text 问的话, options: [{ key, text, hint, new 前稿解锁的, if(c), fx, set, do(c) }] }
// c 能用的见 draft.js 的 context: c.age / c.str c.kno c.soc c.mny / c.has('标记') c.since('标记') c.flag() c.add({}) c.log() c.chance() c.pick() c.seen('end:结局')……
// 用到的标记 (大概): 上学 kinder primary middle high vocational work college (专业 normal cs med arts plain) repeat;
// 工作 job teacher doctor coder artist office civil worker craftsman fisher expat bigcity; 家 dating married single kid cat dog grandkid;
// 别的 bestie firstlove startup boss bankrupt side shop house mortgage exercise sick writing book runner marathon stock retired homehouse aurora donor deja

const job = (c) => c.has('job');
const inSchool = (c) => !c.has('work');
const inUnit = (c) => c.has('job') && !c.has('shop') && !c.has('boss') && !c.has('fisher') && !c.has('retired'); // 在单位上班 (不是自己当老板、打鱼、退休)

// 一辈子会遇到好几次的事: 几句话轮着说 (每稿从随机一句开始), 不会连着重复
function rotate(c, id, items) {
  const n = c.inc(id) - 1;
  if (n === 0) c.inc(`${id}@`, c.int(0, items.length - 1));
  const [t, fx] = items[(n + c.count(`${id}@`)) % items.length];
  c.log(t);
  c.add(fx);
}

// ---- 出身 ----
export const ORIGINS = [
  { key: 'alley', name: '城中村', desc: '住的是握手楼，邻居家吵架都听得见。', stats: { str: 5, kno: 3, soc: 6, mny: 2 }, birth: '你出生在城中村。楼下的麻将打了一整夜。' },
  { key: 'books', name: '书香门第', desc: '家里书比家具多。', stats: { str: 3, kno: 7, soc: 3, mny: 4 }, birth: '你出生了。你爸翻了三天字典给你起名字。' },
  { key: 'sea', name: '海边渔村', desc: '家里靠打鱼过日子。', stats: { str: 7, kno: 2, soc: 4, mny: 2 }, flags: ['sea'], birth: '你出生在海边的渔村。那天风大，你爸没出海。' },
  { key: 'county', name: '县城双职工', desc: '父母都在县里上班，日子过得去。', stats: { str: 4, kno: 4, soc: 4, mny: 4 }, birth: '你出生在县医院。你妈请了产假，你爸请了半天假。' },
  { key: 'mine', name: '矿区小镇', desc: '镇上的人大多在矿上干活。', stats: { str: 6, kno: 3, soc: 5, mny: 3 }, flags: ['mine'], birth: '你出生在矿区职工医院。' },
  { key: 'rich', name: '新城富户', desc: '家里有钱，爸妈很忙。', stats: { str: 3, kno: 4, soc: 2, mny: 9 }, flags: ['richkid'], birth: '你出生在私立医院。你爸在走廊里打了一下午电话。' },
  { key: 'hill', name: '山里人家', desc: '村子在山里，出门要走很远的路。', stats: { str: 7, kno: 2, soc: 4, mny: 1 }, flags: ['hill'], birth: '你出生在山里。接生的老奶奶说你嗓门大。' },
  { key: 'grandma', name: '奶奶带大', desc: '爸妈在外地打工，一年回来一次。', stats: { str: 5, kno: 3, soc: 3, mny: 2 }, flags: ['grandma'], birth: '你出生没多久，爸妈就去外地打工了。奶奶带着你。' },
  { key: 'yard', name: '大院子弟', desc: '院里小孩多，从小不缺玩伴。', stats: { str: 5, kno: 4, soc: 6, mny: 4 }, birth: '你出生了。满月那天，院里的小孩都跑来看你。' },
  {
    key: 'again',
    name: '似曾相识',
    desc: '总觉得这一切好像经历过。',
    stats: { str: 4, kno: 5, soc: 4, mny: 3 },
    flags: ['deja'],
    unlock: (u) => u.runs >= 3,
    lock: '写满 3 稿后出现',
    birth: '你出生了。你有种感觉：又来了。',
  },
];

// ---- 性格 ----
export const TRAITS = [
  { key: 'curious', name: '好奇', desc: '什么都想拆开看看。', stats: { kno: 2 } },
  { key: 'chatty', name: '话多', desc: '跟谁都能聊。', stats: { soc: 2 } },
  { key: 'stubborn', name: '倔', desc: '认准的事不回头。', stats: { str: 1, kno: 1, soc: -1 } },
  { key: 'sunny', name: '乐天', desc: '想得开。老得慢一些。', stats: { str: 1, soc: 1 } },
  { key: 'frugal', name: '节俭', desc: '一个塑料袋能用三回。', stats: { mny: 2 } },
  { key: 'bold', name: '胆大', desc: '什么都敢试。', stats: { str: 1 } },
  { key: 'careful', name: '心细', desc: '做事小心。不容易出意外。', stats: { kno: 1 } },
  { key: 'lazy', name: '懒', desc: '能躺着就不坐着。不容易累垮。', stats: { str: -1, soc: 1 } },
  { key: 'artsy', name: '文艺', desc: '喜欢写写画画。', stats: { kno: 1, soc: 1 } },
];

// ---- 心愿 ---- hint: 没了的时候评语里给的建议
export const WISHES = [
  { key: 'aurora', name: '看一次极光', hint: '攒够钱，退休后出去旅游', done: (c) => c.has('aurora') },
  { key: 'shop', name: '开一家自己的小店', hint: '攒点钱，辞职开店', done: (c) => c.has('shop') },
  { key: 'book', name: '出一本书', hint: '多读书，老了写本书', done: (c) => c.has('book') },
  { key: 'family', name: '儿孙满堂', hint: '早点结婚生孩子，活得久一点', done: (c) => c.has('grandkid') },
  { key: 'hundred', name: '活到一百岁', hint: '好好锻炼，少操点心', done: (c) => c.age >= 100 },
  { key: 'teach', name: '站上讲台', hint: '报考师范', done: (c) => c.has('teacher') },
  { key: 'home', name: '在老家盖一栋房子', hint: '攒够钱，退休后回老家', done: (c) => c.has('homehouse') },
  { key: 'friend', name: '有一个一辈子的朋友', hint: '小时候交个好朋友，一直别断了联系', done: (c) => c.has('bestie') && c.age >= 60 && c.age - c.since('bestie') <= 20 },
  { key: 'marathon', name: '跑完一次马拉松', hint: '中年以后开始跑步', done: (c) => c.has('marathon') },
];

// ---- 没遇到什么事的年份 ----
export const FILLERS = {
  child: ['你长大了一岁。', '这一年你每天吃了睡、睡了吃。', '你长高了一点。'],
  school: ['你每天上学、放学、写作业。', '这一年没什么事。', '这一年你没惹什么祸，也没得什么奖。'],
  teen: ['你每天写作业、考试。', '你又长高了，饭量也大了。', '你觉得大人都不懂你。'],
  adult: ['这一年没什么事。', '日子照常过。', '这一年很忙，也不知道忙了什么。', '这一年过得还行。'],
  old: ['这一年平平安安。', '你又老了一岁。', '你常坐在门口晒太阳。', '你每天吃饭、散步、睡觉。', '这一年没什么新鲜事。'],
};

// ---- 每年的事 ----
export const EVENTS = [
  // 0–6 岁
  {
    id: 'grab',
    from: 1,
    fixed: true,
    do: (c) => {
      const [t, fx] = c.pick([
        ['抓周时你抓了一本书，你爸很满意。', { kno: 1 }],
        ['抓周时你抓了算盘。', { mny: 1 }],
        ['抓周时你抓了一个鸡腿，直接啃了。', { str: 1 }],
        ['抓周时你抓了一个玩具话筒。', { soc: 1 }],
      ]);
      c.log(t);
      c.add(fx);
    },
  },
  { id: 'walk', from: 1, to: 2, text: '你学会了走路。', fx: { str: 1 } },
  { id: 'word', from: 1, to: 2, text: (c) => `你会说的第一个字是「${c.pick(['饭', '不', '奶', '球'])}」。` },
  { id: 'fever', from: 1, to: 4, text: '你半夜发高烧，被送去了医院。', fx: { str: -1 } },
  { id: 'seaswim', from: 2, to: 5, if: (c) => c.has('sea'), text: '你还走不稳就会在浅滩里游了。', fx: { str: 1 } },
  { id: 'goat', from: 3, to: 6, if: (c) => c.has('hill'), text: '你跟着一只羊上了后山，家里人找了你一下午。', fx: { str: 1 } },
  { id: 'story', from: 3, to: 6, if: (c) => c.has('grandma'), text: '奶奶每晚给你讲故事，翻来覆去就那一个。', fx: { soc: 1 } },
  { id: 'toys', from: 3, to: 6, if: (c) => c.has('richkid'), text: '你的玩具很多，但没人陪你玩。', fx: { soc: -1 } },
  {
    id: 'kinder',
    from: 3,
    fixed: true,
    set: ['kinder'],
    do: (c) => (c.trait === 'chatty' ? (c.log('你上幼儿园了，第一天就交了五个朋友。'), c.add({ soc: 1 })) : c.log('你上幼儿园了，第一天哭了一上午。')),
  },
  { id: 'wall', from: 3, to: 6, text: '你在墙上画画，画得还挺像。', fx: { kno: 1 } },
  { id: 'cartoon', from: 3, to: 6, text: '你每天守着电视看动画片。' },
  { id: 'clock', from: 4, to: 8, if: (c) => c.trait === 'curious', text: '你把家里的闹钟拆了，装回去多了三个零件。', fx: { kno: 1 } },
  { id: 'lost', from: 4, to: 6, text: '你在菜市场走丢了，被卖鱼的阿姨领回了家。', fx: { soc: 1 } },
  { id: 'dogchase', from: 3, to: 6, text: '你被邻居家的狗追了半条街。', fx: { str: 1 } },
  { id: 'minedad', from: 4, to: 8, if: (c) => c.has('mine'), text: '你爸下班回来满脸煤灰，你没认出来。' },
  { id: 'gang', from: 4, to: 9, if: (c) => c.origin === 'yard', text: '你成了院里孩子帮的一员，负责放哨。', fx: { soc: 1 } },
  { id: 'mahjong', from: 4, to: 9, if: (c) => c.origin === 'alley', text: '你天天在楼下看人打麻将，学会了算番。', fx: { kno: 1 } },
  { id: 'dejakid', from: 3, to: 6, if: (c) => c.has('deja'), k: 'deja', text: '你指着一个没去过的地方说：「我来过。」' },

  // 7–12 岁
  {
    id: 'primary',
    from: 7,
    fixed: true,
    set: ['primary'],
    do: (c) => (c.has('hill') ? (c.log('你上小学了，每天走两个小时山路。'), c.add({ str: 1 })) : c.log('你上小学了。')),
  },
  { id: 'hundred', from: 7, to: 9, text: '你第一次考了一百分。', fx: { kno: 1 } },
  { id: 'monitor', from: 8, to: 11, if: (c) => c.soc >= 6, text: '你当上了班长。', fx: { soc: 1 } },
  { id: 'copy', from: 8, to: 12, text: '你抄同桌的作业被发现，两个人一起罚站。', fx: { soc: 1 } },
  { id: 'bestie', from: 7, to: 12, w: 2, if: (c) => !c.has('bestie'), set: ['bestie'], text: '你和同一条街的一个小孩成了好朋友。', fx: { soc: 1 } },
  { id: 'arm', from: 7, to: 12, if: (c) => c.trait !== 'careful', text: '你从单杠上摔下来，胳膊骨折了。', fx: { str: -1, soc: 1 } },
  { id: 'essay', from: 7, to: 12, text: '你的作文拿了全校三等奖。', fx: { kno: 1 } },
  { id: 'piggy', from: 7, to: 12, if: (c) => c.trait === 'frugal', text: '你攒了一年零花钱，有三百块。', fx: { mny: 1 } },
  { id: 'arcade', from: 9, to: 12, text: '你偷偷去游戏厅，被你爸抓了回来。', fx: { soc: 1 } },
  { id: 'glasses', from: 9, to: 14, if: (c) => c.kno >= 7, text: '你近视了，戴上了眼镜。', fx: { kno: 1, str: -1 } },
  { id: 'seasick', from: 8, to: 12, if: (c) => c.has('sea'), text: '你第一次跟大人出海，吐了一路。', fx: { str: 1 } },
  { id: 'oneteacher', from: 8, to: 12, if: (c) => c.has('hill'), text: '村里的学校只有一个老师，所有课都是他教。', fx: { kno: 1 } },
  { id: 'porridge', from: 9, to: 12, if: (c) => c.has('grandma'), text: '奶奶病了，你学会了煮粥。', fx: { soc: 1 } },
  { id: 'newyear', from: 8, to: 12, if: (c) => c.has('grandma'), text: '过年爸妈回来了，你不太敢叫人。', fx: { soc: -1 } },
  { id: 'tutors', from: 7, to: 12, if: (c) => c.has('richkid'), text: '家里给你请了三个家教。', fx: { kno: 2, soc: -1 } },
  { id: 'tree', from: 9, to: 12, text: '学校演节目，你演一棵树。', fx: { soc: 1 } },
  { id: 'mathprize', from: 10, to: 12, if: (c) => c.chose('hobby', 'math'), text: '你拿了市里数学竞赛的二等奖。', fx: { kno: 2 } },
  { id: 'artshow', from: 9, to: 12, if: (c) => c.chose('hobby', 'art'), text: '你画的画被选去区里展览。', fx: { kno: 1, soc: 1 } },
  { id: 'piano', from: 10, to: 12, if: (c) => c.chose('hobby', 'music'), text: '你考过了钢琴八级。', fx: { kno: 1 } },
  { id: 'nest', from: 9, to: 12, if: (c) => c.chose('hobby', 'wild'), text: '你爬树掏鸟窝，被鸟啄了。', fx: { str: 1 } },
  { id: 'stray', from: 7, to: 12, if: (c) => !c.has('dog'), set: ['dog'], text: '你捡了一只流浪狗回家，家里同意养了。', fx: { soc: 1 } },
  { id: 'bully', from: 8, to: 12, if: (c) => c.soc <= 3, text: '高年级的同学找你要钱，你没给，挨了一顿打。', fx: { str: -1, soc: -1 } },
  { id: 'dejaexam', from: 10, to: 12, if: (c) => c.has('deja'), k: 'deja', text: '考试时有道题你没学过，但你知道答案。', fx: { kno: 1 } },

  // 13–18 岁
  {
    id: 'middle',
    from: 13,
    fixed: true,
    set: ['middle'],
    do: (c) => c.log(c.has('boarding') ? '你上了寄宿学校，住八人间。' : '你上初中了。'),
  },
  { id: 'growth', from: 13, to: 14, text: '你一年长了十厘米。', fx: { str: 1 } },
  { id: 'pimple', from: 13, to: 16, text: '你脸上开始长痘。' },
  { id: 'novels', from: 13, to: 16, if: inSchool, text: '你上课看小说，被老师没收了。', fx: { kno: 1 } },
  { id: 'slip', from: 13, to: 17, if: inSchool, text: '月考你掉到了班级中游，被你妈说了一顿。', fx: { kno: 1 } },
  { id: 'hoops', from: 13, to: 17, if: (c) => inSchool(c) && c.str >= 6, text: '你进了校篮球队。', fx: { str: 2, soc: 1 } },
  { id: 'netcafe', from: 13, to: 17, if: (c) => inSchool(c) && c.trait !== 'careful', text: '你通宵去网吧，第二天上课睡着了。', fx: { kno: -1, soc: 1 } },
  { id: 'diary', from: 13, to: 16, if: (c) => c.trait === 'artsy', text: '你开始写日记。', fx: { kno: 1 } },
  {
    id: 'move',
    from: 13,
    to: 16,
    if: (c) => c.has('bestie'),
    text: '你最好的朋友搬去了别的城市。',
    do: (c) => {
      if (c.trait !== 'careful' && c.chance(0.5)) {
        c.log('后来你们慢慢断了联系。');
        c.unflag('bestie');
      }
    },
  },
  { id: 'fight', from: 13, to: 17, if: (c) => c.trait === 'stubborn', text: '你跟人打了一架，被叫了家长。', fx: { str: 1, soc: -1 } },
  { id: 'phone', from: 13, to: 16, text: '你有了第一部手机。', fx: { soc: 1 } },
  { id: 'olymp', from: 14, to: 17, if: (c) => inSchool(c) && c.kno >= 10, text: '你进了竞赛班。', fx: { kno: 2 } },
  { id: 'flu', from: 13, to: 17, if: inSchool, text: '你病了一周没去上课，落下了不少功课。', fx: { kno: -1 } },
  { id: 'teajob', from: 15, to: 17, if: (c) => inSchool(c) && c.mny <= 3, text: '暑假你去奶茶店打工，挣了八百块。', fx: { mny: 1, soc: 1 } },
  { id: 'storm', from: 14, to: 18, if: (c) => c.has('sea'), text: '台风天，你帮你爸在码头拴船。', fx: { str: 1 } },
  { id: 'mineclose', from: 14, to: 20, if: (c) => c.has('mine'), text: '矿上效益不好，你爸下岗了。', fx: { mny: -2 } },
  { id: 'road', from: 15, to: 20, if: (c) => c.has('hill'), text: '村里通了公路，你第一次坐车去了县城。', fx: { kno: 1 } },
  { id: 'party', from: 14, to: 18, if: (c) => c.has('richkid'), text: '你过生日请了全班同学，有一半人你叫不出名字。', fx: { soc: 1 } },
  { id: 'dejateen', from: 14, to: 17, if: (c) => c.has('deja'), k: 'deja', text: '你梦见自己考试一道题都不会，醒来后多做了三套卷子。', fx: { kno: 2 } },
  { id: 'gkfear', from: 14, to: 15, fixed: true, if: (c) => c.seen('m:gaokao-low'), k: 'deja', text: '你总觉得高考会考砸，初三就开始刷题。', fx: { kno: 2 } },
  { id: 'highpress', from: 17, to: 18, if: (c) => c.has('high'), text: '高三了，你每天学到半夜。', fx: { kno: 2, str: -1 } },
  { id: 'run1000', from: 16, to: 18, if: (c) => c.has('high'), text: '体测一千米，你及格了。', fx: { str: 1 } },
  { id: 'engine', from: 16, to: 18, if: (c) => c.has('vocational'), text: '你在实训课上自己装好了一台发动机。', fx: { str: 1, kno: 1 } },
  { id: 'cert', from: 16, to: 18, if: (c) => c.has('vocational'), text: '你考到了电工证。', fx: { mny: 1 } },
  {
    id: 'factory',
    from: 16,
    to: 30,
    fixed: true,
    if: (c) => c.has('work') && !c.has('job'),
    set: ['job'],
    do: (c) => {
      if (c.has('sea')) {
        c.flag('fisher');
        c.log('你没再上学，跟你爸出海打鱼。');
        c.add({ str: 1 });
      } else {
        c.flag('worker');
        c.log('你跟着表哥去南方进了工厂。');
        c.add({ mny: 1 });
      }
    },
  },
  { id: 'line', from: 16, to: 22, if: (c) => c.has('worker'), text: '你在流水线上一天站十二个小时。', fx: { str: -1, mny: 1 } },
  { id: 'remit', from: 16, to: 22, if: (c) => c.has('worker') || c.has('fisher'), text: '你给家里寄了第一笔钱。', fx: { soc: 1 } },
  { id: 'cards', from: 16, to: 25, if: (c) => c.has('worker'), text: '工友教你打牌，你输掉了半个月工资。', fx: { mny: -1, soc: 1 } },
  {
    id: 'trade',
    from: 18,
    fixed: true,
    if: (c) => c.has('vocational') && !c.has('job'),
    set: ['job', 'craftsman'],
    do: (c) => c.log(`你职校毕业了，在一家${c.pick(['汽修店', '饭馆后厨', '装修队'])}当学徒。`),
  },
  {
    id: 'gaokao',
    from: 18,
    fixed: true,
    if: (c) => c.has('high'),
    do: (c) => {
      const s = Math.min(750, 300 + c.kno * 22 + c.int(-25, 25));
      const tier = s >= 580 ? 'gk-top' : s >= 470 ? 'gk-mid' : 'gk-low';
      c.flag(tier);
      c.log(`高考成绩出来了：${s} 分。${{ 'gk-top': '考得不错。', 'gk-mid': '考得一般。', 'gk-low': '没考好。' }[tier]}`, 'milestone');
      if (tier === 'gk-low') c.mark('m:gaokao-low');
    },
  },
  {
    id: 'gaokao2',
    from: 19,
    fixed: true,
    if: (c) => c.has('repeat'),
    do: (c) => {
      c.unflag('gk-top', 'gk-mid', 'gk-low');
      const s = Math.min(750, 300 + c.kno * 22 + c.int(-10, 40));
      const tier = s >= 580 ? 'gk-top' : s >= 470 ? 'gk-mid' : 'gk-low';
      c.flag(tier);
      c.log(`复读一年，你又考了一次：${s} 分。`, 'milestone');
    },
  },

  // 大学
  { id: 'dorm', from: 19, to: 20, if: (c) => c.has('college') && !c.did('dorm'), text: '你上大学了，第一晚和室友聊到凌晨三点。', fx: { soc: 1 } },
  { id: 'club', from: 19, to: 22, if: (c) => c.has('college'), text: '你加入了一个社团，主要参加聚餐。', fx: { soc: 1 } },
  { id: 'cram', from: 19, to: 23, if: (c) => c.has('college') && (c.trait === 'lazy' || c.trait === 'bold'), text: '你一学期没怎么上课，期末熬了三个通宵。', fx: { kno: -1, str: -1 } },
  { id: 'scholar', from: 19, to: 23, if: (c) => c.has('college') && c.kno >= 11, text: '你拿了奖学金，请室友吃了一顿火锅。', fx: { mny: 1, soc: 1 } },
  { id: 'library', from: 19, to: 23, w: 2, if: (c) => c.has('college') && !c.has('dating') && c.soc >= 5, set: ['dating'], text: '你在图书馆认识了一个人，你们在一起了。' },
  { id: 'split', from: 21, to: 23, if: (c) => c.has('college') && c.has('dating') && c.trait !== 'stubborn', text: '毕业时，你们分手了。', fx: { soc: -1 }, do: (c) => c.unflag('dating') },
  { id: 'intern', from: 21, to: 23, if: (c) => c.has('college'), text: '你找了份实习，每天通勤三个小时。', fx: { mny: 1, str: -1 } },
  { id: 'hello', from: 19, to: 22, if: (c) => c.has('cs'), text: '你写出了第一个程序。', fx: { kno: 1 } },
  { id: 'semicolon', from: 20, to: 23, if: (c) => c.has('cs'), text: '你找了一晚上 bug，最后发现少了个分号。', fx: { kno: 1, str: -1 } },
  { id: 'anatomy', from: 19, to: 23, if: (c) => c.has('med'), text: '你第一次上解剖课，中午没吃饭。', fx: { kno: 1 } },
  { id: 'medbooks', from: 20, to: 24, if: (c) => c.has('med'), text: '你每天都在背书。', fx: { kno: 2, str: -1 } },
  { id: 'sketch', from: 19, to: 23, if: (c) => c.has('arts'), text: '你跟着老师出去写生。', fx: { kno: 1 } },
  { id: 'podium', from: 20, to: 23, if: (c) => c.has('normal'), text: '你去中学实习，第一次上讲台很紧张。', fx: { soc: 1 } },
  { id: 'lab', from: 23, to: 25, if: (c) => c.has('grad'), text: '你天天在实验室给导师干活。', fx: { kno: 2, str: -1 } },
  { id: 'soysauce', from: 23, to: 26, if: (c) => c.has('abroad'), text: '你在国外很想家。', fx: { soc: -1 } },
  { id: 'chef', from: 23, to: 26, if: (c) => c.has('abroad'), text: '你学会了做饭，同学常来你家蹭饭。', fx: { soc: 2 } },
  {
    id: 'gradjob',
    from: 25,
    to: 26,
    fixed: true,
    if: (c) => c.has('grad') && c.since('grad') >= 3 && !c.has('job'),
    do: (c) => {
      c.log('你硕士毕业了。', 'milestone');
      c.flag('job');
      if (c.has('med')) (c.flag('doctor'), c.log('你进了一家大医院当医生。'));
      else if (c.has('normal')) (c.flag('teacher'), c.log('你留在学校当了老师。'));
      else if (c.has('cs')) (c.flag('coder', 'bigcity'), c.log('你进了一家大公司写代码，工资不低。'), c.add({ mny: 3 }));
      else (c.flag('office'), c.log('你进了一家研究所。'), c.add({ kno: 1, mny: 1 }));
    },
  },
  {
    id: 'abroadend',
    from: 26,
    fixed: true,
    if: (c) => c.has('abroad') && !c.has('job'),
    set: ['job'],
    do: (c) => {
      if (c.chance(0.5)) {
        c.flag('expat', 'office');
        c.log('你在国外找到了工作，留了下来。');
        c.add({ mny: 3 });
      } else {
        c.flag(c.has('cs') ? 'coder' : 'office', 'bigcity');
        c.log('你回国找了工作。');
        c.add({ mny: 2, soc: 1 });
      }
    },
  },

  // 工作
  { id: 'share', from: 22, to: 30, if: (c) => c.has('bigcity'), text: '你和三个人合租，早上要排队上厕所。', fx: { soc: 1, str: -1 } },
  {
    id: 'overtime',
    from: 23,
    to: 50,
    once: false,
    if: (c) => (c.has('coder') || c.has('office') || c.has('boss') || c.has('doctor')) && c.count('ot') < 6,
    do: (c) => {
      c.log(c.pick(['你连续加班了一个月。', '你周末也在加班。', '你加班到凌晨一点。']));
      c.add({ mny: 1, str: c.trait === 'lazy' ? -1 : -2 });
      c.inc('ot');
    },
  },
  {
    id: 'collapse',
    from: 28,
    to: 59,
    once: false,
    w: 1.5,
    if: (c) => c.count('ot') >= 4 && c.str <= 3 && c.trait !== 'lazy',
    do: (c) => {
      if (c.chance(0.35)) c.die('overwork');
      else (c.log('你在公司晕倒了，被送进医院。'), c.add({ str: 1 }), c.inc('ot', -1));
    },
  },
  { id: 'promote', from: 25, to: 50, if: (c) => inUnit(c) && c.kno + c.soc >= 14, text: '你升职了，工资涨了，头发少了。', fx: { mny: 2, str: -1 } },
  {
    id: 'teaching',
    from: 23,
    to: 59,
    once: false,
    if: (c) => c.has('teacher') && !c.has('retired') && c.count('teach') < 8,
    do: (c) => {
      rotate(c, 'teach', [
        ['你带的班考了全年级第一。', { soc: 2 }],
        ['一个毕业多年的学生回来看你。', { soc: 1 }],
        ['你批作业批到半夜。', { kno: 1, str: -1 }],
        ['教师节你收到了很多贺卡。', { soc: 1 }],
      ]);
    },
  },
  {
    id: 'doctoring',
    from: 25,
    to: 59,
    once: false,
    if: (c) => c.has('doctor') && !c.has('retired') && c.count('doctoring') < 8,
    do: (c) => {
      rotate(c, 'doctoring', [
        ['你一天做了三台手术。', { str: -1, mny: 1 }],
        ['病人给你送了一面锦旗。', { soc: 2 }],
        ['你值完夜班，第二天接着上班。', { str: -1, kno: 1 }],
      ]);
    },
  },
  {
    id: 'coding',
    from: 23,
    to: 45,
    once: false,
    w: 0.8,
    if: (c) => c.has('coder') && c.count('coding') < 6,
    do: (c) => {
      rotate(c, 'coding', [
        ['你做的功能上线了，用的人很多。', { kno: 1, mny: 1 }],
        ['半夜服务器出了问题，你爬起来修。', { str: -1 }],
        ['你看不懂自己五年前写的代码。', { kno: 1 }],
      ]);
    },
  },
  {
    id: 'painting',
    from: 23,
    to: 60,
    once: false,
    w: 0.8,
    if: (c) => c.has('artist') && c.count('painting') < 6,
    do: (c) => {
      rotate(c, 'painting', [
        ['你卖出去了一幅画。', { mny: 2 }],
        ['甲方让你改了二十一版，最后用了第一版。', { mny: 1, soc: -1 }],
        ['你办了个小画展，来的大多是朋友。', { soc: 1 }],
      ]);
    },
  },
  {
    id: 'civilday',
    from: 23,
    to: 59,
    once: false,
    w: 0.5,
    if: (c) => c.has('civil') && !c.has('teacher') && !c.has('doctor') && c.count('civilday') < 5,
    do: (c) => {
      rotate(c, 'civilday', [
        ['你写的材料被领导表扬了。', { kno: 1 }],
        ['每天的工作都差不多。', {}],
        ['单位体检，你一切正常。', { str: 1 }],
      ]);
    },
  },
  {
    id: 'garage',
    from: 19,
    to: 55,
    once: false,
    if: (c) => c.has('craftsman') && !c.has('shop') && c.count('garage') < 6,
    do: (c) => {
      c.inc('garage');
      if (c.mny >= 6 && c.chance(0.3)) {
        c.flag('shop');
        c.log('你攒够了钱，开了自己的店。', 'milestone');
        c.add({ mny: -3 });
      } else (c.log(c.pick(['你修好了一辆别人修不好的车。', '找你干活的人越来越多。'])), c.add({ soc: 1, mny: 1 }));
    },
  },
  { id: 'foreman', from: 20, to: 30, if: (c) => c.has('worker') && c.soc >= 5, text: '你当上了班组长。', fx: { soc: 1, mny: 1 } },
  { id: 'newmachine', from: 20, to: 45, if: (c) => c.has('worker'), text: '厂里换了新机器，你最先学会。', fx: { kno: 1 } },
  {
    id: 'fishing',
    from: 17,
    to: 65,
    once: false,
    w: 0.8,
    if: (c) => c.has('fisher') && c.count('fishing') < 8,
    do: (c) => {
      rotate(c, 'fishing', [
        ['你打到一条大鱼，卖了个好价钱。', { mny: 2, soc: 1 }],
        ['休渔期，你在家补网。', { kno: 1 }],
        ['你出海遇上大风浪，差点没回来。', { str: -1 }],
        ['你换了一条新船。', { mny: -1, soc: 1 }],
      ]);
    },
  },
  {
    id: 'startupend',
    from: 32,
    to: 45,
    fixed: true,
    if: (c) => c.has('startup') && c.since('startup') >= 3 && !c.has('boss') && !c.has('bankrupt'),
    do: (c) => {
      const p = 0.2 + (c.kno + c.soc) / 60 + (c.trait === 'bold' ? 0.1 : 0);
      if (c.chance(p)) {
        c.flag('boss');
        c.log('你的公司拿到了投资。', 'milestone');
        c.add({ mny: 8 });
      } else {
        c.flag('bankrupt');
        c.mark('m:bankrupt');
        c.log('公司倒闭了。你卖了车还债。', 'milestone');
        c.set('mny', 1);
      }
    },
  },
  {
    id: 'sideend',
    from: 32,
    to: 45,
    fixed: true,
    if: (c) => c.has('side') && c.since('side') >= 3 && !c.did('sideend'),
    do: (c) => {
      c.log('副业挣的比工资还多，你辞职专心做副业。', 'milestone');
      c.add({ mny: 5 });
      c.flag('boss');
    },
  },
  {
    id: 'bossing',
    from: 33,
    to: 65,
    once: false,
    w: 0.7,
    if: (c) => c.has('boss') && c.count('bossing') < 6,
    do: (c) => {
      rotate(c, 'bossing', [
        ['公司越做越大，你越来越忙。', { mny: 3, str: -1 }],
        ['你回母校演讲，学生问你成功的秘诀，你说是运气。', { soc: 2 }],
        ['一笔大生意黄了。', { mny: -2 }],
      ]);
    },
  },
  {
    id: 'shopping',
    from: 25,
    to: 75,
    once: false,
    w: 0.7,
    if: (c) => c.has('shop') && c.count('shopping') < 8,
    do: (c) => {
      rotate(c, 'shopping', [
        ['店里有了几个老顾客。', { soc: 1, mny: 1 }],
        ['对面开了家连锁店，你的生意差了。', { mny: -1 }],
        ['你的店上了本地榜单，生意好了。', { mny: 2, soc: 1 }],
        ['你在店里养了只猫，客人都爱来看它。', { soc: 1 }],
      ]);
    },
  },
  { id: 'gig', from: 35, to: 45, if: (c) => c.has('gig'), text: '你每天骑车送外卖，认识了全城的路。', fx: { str: 1, mny: 1 } },
  { id: 'homebound', from: 30, to: 60, if: (c) => c.has('back'), text: '你回到了老家，县城变了很多。', fx: { soc: 1 } },
  {
    id: 'accident',
    from: 18,
    to: 70,
    p: 0.003,
    if: (c) => c.trait !== 'careful',
    do: (c) => {
      if (c.chance(0.3)) c.die('accident');
      else (c.log('你出了车祸，在医院躺了三个月。'), c.add({ str: -2 }));
    },
  },
  // 体魄快没了: 65 岁以前会大病一场然后开始养身体 (隔几年才会再来一次), 不然年纪轻轻就走得太多
  {
    id: 'redlight',
    from: 8,
    to: 64,
    fixed: true,
    once: false,
    if: (c) => c.str <= 2 && (c.count('redlight') === 0 || c.age - c.count('redlight-at') >= 4),
    do: (c) => {
      rotate(c, 'redlight', [
        ['你大病了一场。病好后你开始注意身体。', { str: 3 }],
        ['医生说你再这样下去身体就垮了。你开始按时吃饭。', { str: 3 }],
        ['你爬三楼都喘，请了一个月假养身体。', { str: 3 }],
      ]);
      c.inc('redlight-at', c.age - c.count('redlight-at'));
      c.flag('exercise');
    },
  },
  { id: 'drive', from: 20, to: 35, text: '你考驾照，科目二挂了三次。' },
  { id: 'gym', from: 25, to: 45, if: (c) => !c.has('exercise'), text: '你办了一张健身卡，去了两次。', fx: { mny: -1 } },
  { id: 'whitehair', from: 30, to: 45, text: '你长了第一根白头发。' },
  { id: 'callmom', from: 22, to: 45, text: '你妈打电话问你吃了没，你说吃了，其实没吃。' },
  { id: 'insomnia', from: 30, to: 50, if: (c) => c.count('ot') >= 2, text: '你开始失眠。', fx: { str: -1 } },
  { id: 'midlife', from: 38, to: 48, text: '你想买摩托车，最后买了辆自行车。', fx: { str: 1 } },
  { id: 'moving', from: 24, to: 40, text: '你搬家了，扔了一半东西。' },
  { id: 'lottery', from: 25, to: 70, p: 0.01, text: '你买彩票中了五百块，请客花了六百。', fx: { soc: 1 } },
  {
    id: 'scam',
    from: 40,
    to: 75,
    p: 0.02,
    do: (c) => {
      if (c.trait === 'careful') c.log('你接到一个诈骗电话，听了两句就挂了。');
      else if (c.seen('m:scammed')) c.log('你接到一个诈骗电话。这套话你好像在哪听过，挂了。', 'deja');
      else (c.log('你接到一个电话，说你的快递出了问题。你被骗了一笔钱。'), c.add({ mny: -3 }), c.mark('m:scammed'));
    },
  },
  { id: 'dejaadult', from: 25, to: 45, if: (c) => c.has('deja'), k: 'deja', text: '你总觉得自己以前走过另一条路。' },
  { id: 'cautious', from: 25, to: 35, fixed: true, if: (c) => c.seen('end:young') && !c.did('cautious'), k: 'deja', text: '你莫名地很惜命，不熬夜，按时吃饭。', fx: { str: 2 } },

  // 感情和家
  { id: 'rain', from: 24, to: 40, w: 1.5, if: (c) => !c.has('dating') && !c.has('married') && c.chose('love') && !c.chose('love', 'alone'), set: ['dating'], text: '你在朋友聚会上认识了一个人，你们在一起了。' },
  { id: 'bicker', from: 30, to: 70, if: (c) => c.has('married'), text: '你和爱人吵了一架，第二天就和好了。', fx: { soc: 1 } },
  {
    id: 'divorce',
    from: 33,
    to: 55,
    p: 0.012,
    if: (c) => c.has('married') && c.soc <= 9,
    text: '你离婚了。',
    fx: { soc: -1 },
    do: (c) => (c.unflag('married'), c.flag('divorced')),
  },
  {
    id: 'birth',
    from: 31,
    to: 40,
    fixed: true,
    if: (c) => c.has('kidplan') && c.since('kidplan') >= 1 && !c.has('kid'),
    set: ['kid'],
    k: 'milestone',
    text: '你的孩子出生了。',
    fx: { soc: 1, mny: -1 },
    do: (c) => {
      if (c.chose('kids', 'two')) (c.flag('kid2'), c.log('两年后，你又有了一个孩子。'));
    },
  },
  { id: 'homework', from: 36, to: 48, if: (c) => c.has('kid') && c.since('kid') >= 6, text: '孩子上小学了，你每天陪写作业，血压高了。', fx: { str: -1 } },
  { id: 'teenkid', from: 43, to: 56, if: (c) => c.has('kid') && c.since('kid') >= 13, text: '孩子到了青春期，不太跟你说话了。', fx: { soc: -1 } },
  { id: 'sendoff', from: 48, to: 60, if: (c) => c.has('kid') && c.since('kid') >= 18, text: '孩子考上了大学。', fx: { soc: 1 } },
  { id: 'kidwed', from: 55, to: 70, if: (c) => c.has('kid') && c.since('kid') >= 26, text: '孩子结婚了。', fx: { soc: 1 } },
  {
    id: 'grandkid',
    from: 55,
    to: 95,
    fixed: true,
    if: (c) => c.has('kid') && c.since('kid') >= 27 && !c.has('grandkid'),
    do: (c) => {
      if (!c.chance(c.chose('retire', 'family') ? 0.6 : 0.3)) return;
      c.flag('grandkid');
      c.log('你有了第一个孙辈。', 'milestone');
      c.add({ soc: 2 });
    },
  },
  {
    id: 'catlife',
    from: 30,
    to: 90,
    once: false,
    w: 0.5,
    if: (c) => c.has('cat') && c.count('catlife') < 4,
    do: (c) =>
      rotate(c, 'catlife', [
        ['你的猫把桌上的杯子推了下去，然后看着你。', {}],
        ['猫在你键盘上睡着了。', {}],
        ['你回到家，猫在门口等你开饭。', { soc: 1 }],
        ['你的猫病了，你请了三天假。', {}],
      ]),
  },
  { id: 'dogold', from: 20, to: 26, if: (c) => c.has('dog') && !c.did('dogold'), text: '你小时候养的狗老死了。', fx: { soc: -1 }, do: (c) => c.unflag('dog') },
  { id: 'toast', from: 25, to: 50, if: (c) => c.has('bestie'), text: '老朋友结婚，你上台致了辞。', fx: { soc: 1 } },
  {
    id: 'drift',
    from: 25,
    to: 60,
    p: 0.03,
    if: (c) => c.has('bestie') && c.trait !== 'careful',
    text: '你和老朋友渐渐不联系了。',
    fx: { soc: -1 },
    do: (c) => c.unflag('bestie'),
  },
  { id: 'reunion', from: 35, to: 65, if: (c) => !c.has('bestie') && c.did('drift'), text: '同学聚会上你们又见面了，之后又常联系。', set: ['bestie'], fx: { soc: 1 } },
  { id: 'newfriend', from: 30, to: 60, if: (c) => !c.has('bestie') && c.soc >= 9, set: ['bestie'], text: '你和楼下的邻居成了好朋友。', fx: { soc: 1 } },

  // 中年以后
  { id: 'pta', from: 40, to: 52, if: (c) => c.has('kid') && c.since('kid') >= 8, text: '家长会上，老师点名批评了你的孩子。' },
  { id: 'goji', from: 40, to: 55, text: '你开始每天用保温杯泡枸杞。' },
  { id: 'farsight', from: 44, to: 56, text: '你开始老花眼了。' },
  { id: 'tugofwar', from: 38, to: 55, if: inUnit, text: '单位团建拔河，你闪了腰。', fx: { str: -1, soc: 1 } },
  { id: 'reunion20', from: 38, to: 48, text: '你参加了毕业二十年的同学聚会。', fx: { soc: 1 } },
  { id: 'angling', from: 40, to: 60, text: '你迷上了钓鱼。', fx: { str: 1 } },
  { id: 'photos', from: 40, to: 60, if: (c) => c.has('married'), text: '结婚纪念日，你和爱人去拍了照片。', fx: { soc: 1 } },
  { id: 'birthday70', from: 40, to: 50, text: '你爸过七十大寿，一家人聚了聚。', fx: { soc: 1 } },
  { id: 'farewell', from: 52, to: 65, text: '你爸去世了。' },
  { id: 'cooking', from: 35, to: 50, text: '你学会了做饭。', fx: { soc: 1 } },
  { id: 'wellness', from: 45, to: 60, text: '你被拉进了一个养生群。' },
  { id: 'backache', from: 40, to: 55, if: (c) => !c.has('exercise'), text: '你的腰开始疼了。', fx: { str: -1 } },
  { id: 'bookclub', from: 40, to: 58, if: (c) => c.kno >= 8, text: '你办了个读书会。', fx: { kno: 1, soc: 1 } },
  { id: 'lostelder', from: 35, to: 60, text: '你帮一个迷路的老人找到了家。', fx: { soc: 1 } },
  { id: 'balcony', from: 40, to: 60, text: '你在阳台上养花，养死了三盆。' },
  { id: 'renovate', from: 39, to: 55, if: (c) => c.has('house'), text: '家里装修了三个月。', fx: { mny: -1 } },
  { id: 'teacherhuh', from: 38, to: 50, if: inUnit, text: '单位新来的年轻人都叫你「老师」。' },
  { id: 'insure', from: 40, to: 50, if: (c) => c.trait === 'careful' || c.trait === 'frugal', text: '你给全家买了保险。', fx: { mny: -1 } },
  { id: 'parentstrip', from: 40, to: 55, if: (c) => c.mny >= 8, text: '你带爸妈出国旅游了一趟。', fx: { mny: -2, soc: 1 } },
  { id: 'kidmeal', from: 42, to: 55, if: (c) => c.has('kid') && c.since('kid') >= 10, text: '孩子给你做了顿饭，很咸，你全吃了。', fx: { soc: 1 } },
  { id: 'sabbatical', from: 42, to: 58, if: (c) => c.count('ot') >= 2, text: '你做了个小手术，住院休息了几天。', fx: { str: 1 } },
  { id: 'bp', from: 45, to: 70, p: 0.03, if: (c) => !c.has('exercise') && !c.has('sick'), set: ['sick'], text: '你查出了高血压，开始每天吃药。', fx: { str: -2 } },
  {
    id: 'illness',
    from: 50,
    to: 85,
    p: 0.012,
    do: (c) => {
      c.log('你得了重病。');
      if (c.mny >= 8) (c.log('你做了手术，花了不少钱，治好了。'), c.add({ mny: -4, str: -1 }));
      else (c.log('你没钱做手术，只能吃药。'), c.add({ str: -3 }));
    },
  },
  { id: 'regret', from: 42, to: 55, if: (c) => c.chose('house', 'rent'), do: (c) => c.log(c.pick(['房价涨了一倍，你后悔没买房。', '房价跌了，你庆幸没买房。'])) },
  { id: 'paidoff', from: 50, to: 70, fixed: true, if: (c) => c.has('mortgage') && c.since('mortgage') >= 20, text: '你还完了房贷。', fx: { mny: 1 }, do: (c) => c.unflag('mortgage') },
  { id: 'jog', from: 46, to: 70, if: (c) => c.has('runner') && !c.has('marathon'), text: '你每天早上跑十公里。', fx: { str: 1 } },
  {
    id: 'marathon',
    from: 50,
    to: 75,
    fixed: true,
    if: (c) => c.has('runner') && !c.has('marathon') && c.since('runner') >= 1,
    do: (c) => {
      if (c.str >= 7 && c.chance(0.5)) {
        c.flag('marathon');
        c.log('你跑完了一场全程马拉松。', 'milestone');
        c.add({ str: 1, soc: 1 });
      }
    },
  },
  { id: 'pages', from: 53, to: 80, if: (c) => c.has('writing') && !c.has('book'), text: '你每天写一千字。', fx: { kno: 1 } },
  {
    id: 'book',
    from: 55,
    to: 85,
    fixed: true,
    if: (c) => c.has('writing') && !c.has('book') && c.since('writing') >= 2,
    do: (c) => {
      if (c.kno >= 12 && c.chance(0.5)) {
        c.flag('book');
        c.log('你的书出版了。', 'milestone');
        c.add({ soc: 2 });
      } else if (!c.did('rejected') && c.chance(0.3)) {
        c.log('你投了几家出版社，都没回音。');
        c.flag('rejected');
      }
    },
  },
  {
    id: 'stockend',
    from: 54,
    to: 60,
    fixed: true,
    if: (c) => c.has('stock') && c.since('stock') >= 1 && !c.did('stockend'),
    do: (c) => {
      if (c.chance(0.4)) (c.log('你的股票翻了一倍，你卖了。'), c.add({ mny: 4 }));
      else (c.log('你的股票跌了一半。'), c.add({ mny: -4 }), c.mark('m:stock-lost'));
    },
  },
  { id: 'dancing', from: 53, to: 85, if: (c) => c.has('dance'), text: '你成了广场舞队的领舞。', fx: { soc: 1, str: 1 } },
  { id: 'heart', from: 40, to: 99, fixed: true, if: (c) => c.last && c.last.age === c.age && c.last.age >= 30 && !c.did('heart'), k: 'deja', text: '这一年你总觉得心慌，上一稿好像就是这个岁数走的。' },
  { id: 'video', from: 60, to: 85, if: (c) => c.has('kid'), text: '你学会了视频通话，天天给孩子打。', fx: { soc: 1 } },
  { id: 'chess', from: 60, to: 90, text: '你每天去公园下象棋。', fx: { kno: 1 } },
  { id: 'keys', from: 65, to: 95, text: '你开始忘事，经常找不到钥匙。', fx: { kno: -1 } },
  { id: 'fall', from: 65, to: 95, if: (c) => c.trait !== 'careful', text: '你在浴室摔了一跤，躺了两个月。', fx: { str: -2 } },
  { id: 'funerals', from: 70, to: 95, text: '你的老朋友一个个走了。', fx: { soc: -1 } },
  { id: 'calligraphy', from: 60, to: 85, text: '你上了老年大学的书法班。', fx: { kno: 1 } },
  { id: 'garden', from: 60, to: 85, text: '你在小区空地上种了菜。', fx: { soc: 1, str: 1 } },
  { id: 'students', from: 62, to: 90, if: (c) => c.has('teacher'), text: '你教过的学生来看你。', fx: { soc: 2 } },
  { id: 'fishfriend', from: 60, to: 90, if: (c) => c.has('bestie'), text: '你和老朋友去钓鱼，一条也没钓到。', fx: { soc: 1 } },
  { id: 'photo', from: 70, to: 95, text: '你去照相馆拍了张照片，说以后用得上。' },
  { id: 'tvhome', from: 65, to: 95, text: '你小时候住的地方上了电视，你没认出来。' },
  { id: 'hillback', from: 60, to: 90, if: (c) => c.has('hill'), text: '你回了趟山里，路已经修好了。', fx: { soc: 1 } },
  { id: 'dock', from: 60, to: 90, if: (c) => c.has('sea'), text: '你回了趟渔村。' },
  { id: 'dejaold', from: 60, to: 90, if: (c) => c.has('deja'), k: 'deja', text: '你有时会想，如果重来一次会怎么选。' },
  { id: 'shopping-online', from: 60, to: 85, text: '你学会了网购，天天有快递。' },
  { id: 'choir', from: 60, to: 85, text: '你加入了小区合唱团。', fx: { soc: 1 } },
  { id: 'taichi', from: 60, to: 88, text: '你每天早上去公园打太极。', fx: { str: 1 } },
  { id: 'olddiary', from: 62, to: 90, text: '你翻出了年轻时的日记。' },
  { id: 'readers', from: 60, to: 80, text: '你把手机字体调到了最大。' },
  { id: 'haggle', from: 60, to: 88, text: '你在菜市场为了五毛钱讲了半天价。', fx: { soc: 1 } },
  { id: 'cataract', from: 68, to: 92, text: '你做了白内障手术。' },
  { id: 'goldfish', from: 62, to: 90, text: '你养了一缸金鱼。' },
  { id: 'tales', from: 62, to: 95, if: (c) => c.has('grandkid'), text: '你给孙辈讲你年轻时候的事。', fx: { soc: 1 } },
  { id: 'demolish', from: 60, to: 88, text: '你住过的老房子拆了。' },
  { id: 'clips', from: 62, to: 85, text: '你开始拍短视频，有了三百个粉丝。', fx: { soc: 1 } },
  { id: 'winter', from: 70, to: 100, text: '冬天你病了一场。', fx: { str: -1 } },
  { id: 'classmates', from: 65, to: 90, text: '同学聚会，来的人比上次少了一半。' },
  { id: 'quilt', from: 60, to: 100, text: '你晒了一下午被子，晚上睡得很香。' },
  { id: 'weekday', from: 80, to: 105, text: '你开始分不清星期几了。' },
  { id: 'nap', from: 82, to: 110, text: '你每天下午都要睡一觉。' },
  { id: 'tooth', from: 75, to: 100, text: '你掉了一颗牙。' },
  { id: 'candles', from: 88, to: 110, text: '过生日时，你吹了三次才吹灭蜡烛。', fx: { soc: 1 } },
  { id: 'doorway', from: 85, to: 110, text: '你每天坐在门口看人来人往。' },
  { id: 'familyphoto', from: 90, to: 110, if: (c) => c.has('kid'), text: '你还能叫出全家每个人的名字。', fx: { soc: 1 } },
  { id: 'halfbowl', from: 90, to: 110, text: '你每顿只能吃半碗饭了。' },
  { id: 'interview', from: 95, to: 115, text: '记者来问你长寿秘诀，你说：心大。', fx: { soc: 1 } },
  { id: 'eldest', from: 92, to: 110, if: (c) => c.age >= 92, text: '你成了小区里年纪最大的人。', fx: { soc: 1 } },
  { id: 'memory', from: 88, to: 110, text: '你记不清最近的事，但记得小时候的事。' },
  { id: 'century', from: 100, fixed: true, k: 'milestone', text: '你过了一百岁生日。', fx: { soc: 1 } },
];

// ---- 路口 ----
export const CHOICES = [
  {
    id: 'hobby',
    age: 8,
    text: '放暑假了，爸妈要给你报班。',
    options: [
      { key: 'art', text: '学画画', fx: { kno: 1 }, do: (c) => c.log('你学了一暑假画画。') },
      { key: 'math', text: '学奥数', fx: { kno: 2, soc: -1 }, do: (c) => c.log('你开始学奥数。') },
      { key: 'music', text: '学钢琴', if: (c) => c.mny >= 4, fx: { kno: 1, mny: -1 }, do: (c) => c.log('你开始学钢琴。') },
      { key: 'wild', text: '什么都不报，出去野', fx: { str: 2, soc: 1 }, do: (c) => c.log('你在外面玩了一暑假，晒得很黑。') },
    ],
  },
  {
    id: 'school12',
    age: 12,
    text: '小学毕业了，市里的寄宿中学在招生。',
    options: [
      {
        key: 'board',
        text: '去考寄宿中学',
        hint: '学识越高越容易考上',
        do: (c) => {
          if (c.chance(0.2 + c.kno * 0.06)) (c.flag('boarding'), c.add({ kno: 2, soc: -1 }), c.log('你考上了寄宿中学。'));
          else (c.log('你没考上，在家附近上中学。'), c.add({ soc: 1 }));
        },
      },
      { key: 'local', text: '留在家门口上学', fx: { soc: 1 }, do: (c) => c.log('你和小学同学上了同一所中学。') },
    ],
  },
  {
    id: 'zhongkao',
    age: 15,
    text: '要中考了。',
    options: [
      {
        key: 'push',
        text: '拼一把，考高中',
        hint: '学识越高越稳',
        do: (c) => {
          if (c.chance(0.25 + c.kno * 0.06 + (c.trait === 'stubborn' ? 0.1 : 0))) (c.flag('high'), c.add({ kno: 1 }), c.log('你考上了高中。'));
          else (c.flag('vocational'), c.log('你差几分没考上，去了职校。'));
        },
      },
      { key: 'craft', text: '读职校，学门手艺', set: ['vocational'], fx: { str: 1 }, do: (c) => c.log(`你去职校学了${c.pick(['汽修', '烹饪', '电工'])}。`) },
      { key: 'work', text: '不读了，出去挣钱', if: (c) => c.trait === 'bold' || c.mny <= 3 || c.has('sea'), set: ['work'], fx: { mny: 1, kno: -1 }, do: (c) => c.log('你不上学了，出去打工。') },
    ],
  },
  {
    id: 'crush',
    age: 16,
    if: (c) => c.has('high') || c.has('vocational'),
    text: '你喜欢上了同桌。',
    options: [
      {
        key: 'note',
        text: '递一张纸条',
        do: (c) => {
          if (c.chance(0.3 + c.soc * 0.05)) (c.flag('firstlove'), c.add({ soc: 1 }), c.log('同桌答应了。'));
          else (c.add({ soc: -1 }), c.log('纸条被老师没收了，还当着全班念了出来。'));
        },
      },
      { key: 'study', text: '把心思放在学习上', fx: { kno: 1 }, do: (c) => c.log('你决定好好学习。') },
      {
        key: 'friend',
        text: '做朋友就好',
        fx: { soc: 1 },
        do: (c) => {
          c.log('你们成了好朋友。');
          c.flag('bestie');
        },
      },
    ],
  },
  {
    id: 'gaokao',
    age: 18,
    if: (c) => c.has('high'),
    text: '要填志愿了。',
    options: [
      { key: 'med', text: '学医', if: (c) => c.has('gk-top'), set: ['college', 'med'], do: (c) => c.log('你被医科大学录取了。') },
      { key: 'cs', text: '学计算机', if: (c) => !c.has('gk-low'), set: ['college', 'cs'], do: (c) => c.log('你被计算机专业录取了。') },
      { key: 'normal', text: '读师范', if: (c) => !c.has('gk-low'), set: ['college', 'normal'], do: (c) => c.log('你去了一所师范大学。') },
      { key: 'arts', text: '考美院', if: (c) => c.chose('hobby', 'art') && !c.has('gk-low'), set: ['college', 'arts'], do: (c) => c.log('你考上了美院。') },
      { key: 'plain', text: '随便读个大学', set: ['college', 'plain'], do: (c) => c.log(c.has('gk-low') ? '你去了一所专科学校。' : '你去了一所普通大学，专业是调剂的。') },
      { key: 'repeat', text: '复读一年', if: (c) => !c.has('gk-top'), set: ['repeat'], fx: { kno: 2, str: -1 }, do: (c) => c.log('你回去复读了。') },
      { key: 'job', text: '不读了，去工作', if: (c) => c.has('gk-low'), set: ['work'], fx: { mny: 1 }, do: (c) => c.log('你没去上学，进城找工作了。') },
    ],
  },
  {
    id: 'gaokao2',
    age: 19,
    if: (c) => c.has('repeat') && !c.has('college') && !c.has('work'),
    text: '复读结束，又要填志愿了。',
    options: [
      { key: 'med', text: '学医', if: (c) => c.has('gk-top'), set: ['college', 'med'], do: (c) => c.log('你被医科大学录取了。') },
      { key: 'cs', text: '学计算机', if: (c) => !c.has('gk-low'), set: ['college', 'cs'], do: (c) => c.log('你被计算机专业录取了。') },
      { key: 'normal', text: '读师范', if: (c) => !c.has('gk-low'), set: ['college', 'normal'], do: (c) => c.log('你去了一所师范大学。') },
      { key: 'plain', text: '随便读个大学', set: ['college', 'plain'], do: (c) => c.log('你去了一所普通大学。') },
      { key: 'job', text: '不读了，去工作', set: ['work'], fx: { mny: 1 }, do: (c) => c.log('你不读了，进城找工作。') },
    ],
  },
  {
    id: 'graduate',
    age: 22,
    to: 23,
    if: (c) => c.has('college') && c.since('college') >= 4 && !c.has('job'),
    text: '大学毕业了。',
    options: [
      {
        key: 'civil',
        text: '回老家考编',
        hint: '学识越高越容易考上',
        do: (c) => {
          c.flag('job');
          if (c.chance(0.35 + c.kno * 0.03)) {
            c.flag('civil');
            if (c.has('normal')) (c.flag('teacher'), c.log('你考上了县一中的老师编制。'));
            else if (c.has('med')) (c.flag('doctor'), c.log('你考进了县医院当医生。'));
            else c.log('你考进了县里的单位。');
          } else {
            c.flag('office');
            c.log('你考了两年没考上，在老家找了份工作。');
            c.add({ kno: 1 });
          }
        },
      },
      {
        key: 'city',
        text: '去大城市闯一闯',
        fx: { mny: 2, str: -1 },
        do: (c) => {
          c.flag('job', 'bigcity');
          if (c.has('cs')) (c.flag('coder'), c.log('你进了一家互联网公司。'), c.add({ mny: 2 }));
          else if (c.has('med')) (c.flag('doctor'), c.log('你进了一家大医院规培。'));
          else if (c.has('normal')) (c.flag('teacher'), c.log('你在一所私立学校当了老师。'));
          else if (c.has('arts')) (c.flag('artist'), c.log('你进了一家设计公司。'));
          else (c.flag('office'), c.log('你在写字楼里找了份工作。'));
        },
      },
      { key: 'master', text: '读研', if: (c) => c.kno >= 10, set: ['grad'], fx: { kno: 2, mny: -1 }, do: (c) => c.log('你考上了研究生。') },
      { key: 'abroad', text: '出国留学', if: (c) => c.mny >= 7, set: ['abroad'], fx: { kno: 2, mny: -4 }, do: (c) => c.log('你出国留学了。') },
    ],
  },
  {
    id: 'love',
    age: 25,
    to: 29,
    if: (c) => !c.has('dating') && !c.has('married') && !c.has('expat'),
    text: '过年回家，亲戚问你有没有对象。',
    options: [
      {
        key: 'blind',
        text: '去相亲',
        do: (c) => {
          if (c.chance(0.35 + c.soc * 0.04)) (c.flag('dating'), c.log('相亲相到第三个，你们看对眼了。'));
          else (c.log('你相了八次亲，一个都没成。'), c.add({ soc: -1 }));
        },
      },
      {
        key: 'first',
        text: '联系初恋',
        if: (c) => c.has('firstlove'),
        do: (c) => {
          if (c.chance(0.5)) (c.flag('dating'), c.log('你联系了初恋，对方也还单着。你们在一起了。'));
          else (c.log('对方已经结婚了。'), c.add({ soc: -1 }));
        },
      },
      { key: 'wait', text: '等一个对的人', do: (c) => c.log('你说缘分到了自然会来。') },
      { key: 'alone', text: '一个人也挺好', set: ['single'], fx: { mny: 1 }, do: (c) => c.log('你觉得一个人挺好。') },
    ],
  },
  {
    id: 'marry',
    age: 26,
    to: 40,
    if: (c) => c.has('dating') && !c.has('married') && c.since('dating') >= 2,
    text: '你们在一起好几年了。',
    options: [
      { key: 'yes', text: '结婚', set: ['married'], fx: { soc: 1, mny: -2 }, do: (c) => (c.unflag('dating'), c.log('你们结婚了。')) },
      {
        key: 'wait',
        text: '再等等',
        do: (c) => {
          if (c.chance(0.5)) (c.unflag('dating'), c.log('等着等着，你们分手了。'), c.add({ soc: -1 }));
          else (c.flag('married'), c.unflag('dating'), c.log('又过了一年，你们还是结婚了。'));
        },
      },
    ],
  },
  {
    id: 'career',
    age: 30,
    to: 31,
    if: (c) => job(c) && !c.has('civil') && !c.has('teacher') && !c.has('doctor') && !c.has('fisher') && !c.has('shop'),
    text: '工作好几年了，你有点干腻了。',
    options: [
      { key: 'startup', text: '辞职创业', hint: '有风险', if: (c) => c.trait === 'bold' || c.mny >= 6 || c.has('coder'), set: ['startup'], fx: { mny: -3 }, do: (c) => c.log('你辞职和朋友一起创业了。') },
      { key: 'side', text: '先做副业试试', new: true, if: (c) => c.seen('m:bankrupt'), set: ['side'], do: (c) => c.log('上一稿创业赔光了。这次你先下班后做副业。', 'deja') },
      { key: 'shop', text: '辞职开一家小店', if: (c) => c.mny >= 6 || (c.mny >= 4 && c.trait === 'bold'), set: ['shop'], fx: { mny: -3 }, do: (c) => (c.unflag('coder', 'office', 'worker', 'artist'), c.log('你辞职开了一家小店。')) },
      { key: 'stay', text: '稳稳当当干下去', fx: { mny: 1 }, do: (c) => c.log('你决定继续干下去。') },
      { key: 'hop', text: '跳槽涨工资', fx: { mny: 2, soc: -1 }, do: (c) => c.log('你跳槽了，工资涨了三成。') },
    ],
  },
  {
    id: 'kids',
    age: 31,
    to: 38,
    if: (c) => c.has('married') && !c.has('kidplan') && !c.chose('kids'),
    text: '家里催你们要孩子。',
    options: [
      { key: 'one', text: '要一个', set: ['kidplan'], do: (c) => c.log('你们决定要一个孩子。') },
      { key: 'two', text: '要两个', if: (c) => c.mny >= 7, set: ['kidplan'], fx: { mny: -2 }, do: (c) => c.log('你们决定要两个孩子。') },
      { key: 'no', text: '不要了', fx: { mny: 2 }, do: (c) => c.log('你们决定不要孩子。') },
      { key: 'cat', text: '先养只猫', set: ['cat'], do: (c) => c.log('你们养了一只猫。') },
    ],
  },
  {
    id: 'pet',
    age: 35,
    to: 37,
    if: (c) => !c.has('married') && !c.has('cat'),
    text: '你一个人住，有点冷清。',
    options: [
      { key: 'cat', text: '养只猫', set: ['cat'], fx: { soc: 1 }, do: (c) => c.log('你养了一只橘猫。') },
      { key: 'dog', text: '养条狗', set: ['dog'], fx: { str: 1 }, do: (c) => c.log('你养了一条狗，每天早晚遛两次。') },
      { key: 'none', text: '安静也挺好', do: (c) => c.log('你什么也没养。') },
    ],
  },
  {
    id: 'layoff',
    age: 35,
    to: 36,
    if: (c) => c.has('bigcity') && (c.has('coder') || c.has('office')) && !c.has('boss') && !c.has('startup') && !c.has('shop') && c.chance(0.4),
    text: '公司裁员，你被裁了。',
    options: [
      {
        key: 'exam',
        text: '考公务员',
        hint: '学识越高越容易考上',
        do: (c) => {
          if (c.chance(0.2 + c.kno * 0.03)) (c.flag('civil'), c.unflag('coder', 'office'), c.log('你考上了公务员。'));
          else (c.log('你考了两年没考上，又找了家公司上班。'), c.add({ mny: -1 }));
        },
      },
      { key: 'shop', text: '开一家小店', if: (c) => c.mny >= 5, set: ['shop'], fx: { mny: -3 }, do: (c) => (c.unflag('coder', 'office'), c.log('你拿赔偿金开了一家小店。')) },
      { key: 'gig', text: '先送外卖过渡', set: ['gig'], fx: { str: 1 }, do: (c) => c.log('你开始送外卖。') },
      { key: 'home', text: '回老家', set: ['back'], fx: { soc: 1 }, do: (c) => (c.unflag('bigcity'), c.log('你回老家了。')) },
    ],
  },
  {
    id: 'house',
    age: 38,
    to: 42,
    if: (c) => !c.has('house') && c.mny >= 5 && !c.has('expat'),
    text: '你看中了一套房子。',
    options: [
      { key: 'cash', text: '全款买下', if: (c) => c.mny >= 14, set: ['house'], fx: { mny: -8 }, do: (c) => c.log('你全款买了房。') },
      { key: 'loan', text: '贷款买', set: ['house', 'mortgage'], fx: { mny: -3 }, do: (c) => c.log('你背上了三十年的房贷。') },
      { key: 'rent', text: '继续租着', fx: { mny: 1 }, do: (c) => c.log('你决定继续租房。') },
    ],
  },
  {
    id: 'checkup',
    age: 45,
    text: '体检报告上好几项指标不正常。',
    options: [
      { key: 'run', text: '开始锻炼', set: ['exercise'], fx: { str: 1 }, do: (c) => c.log('你开始每天锻炼。') },
      { key: 'ignore', text: '没事，还年轻', do: (c) => c.log('你没当回事。') },
      { key: 'slow', text: '辞掉加班的活', new: true, if: (c) => c.seen('end:overwork') && job(c), set: ['exercise'], fx: { str: 2, mny: -2 }, do: (c) => (c.log('上一稿你是累死的。这次你换了个不加班的工作。', 'deja'), c.inc('ot', -c.count('ot'))) },
    ],
  },
  {
    id: 'parents',
    age: 50,
    text: '爸妈老了，身体越来越差。',
    options: [
      { key: 'back', text: '回去照顾', set: ['back'], fx: { soc: 1, mny: -2 }, do: (c) => c.log('你经常回去照顾爸妈。') },
      { key: 'nurse', text: '请个护工', fx: { mny: -3 }, do: (c) => c.log('你给爸妈请了护工。') },
      { key: 'live', text: '接过来一起住', if: (c) => c.has('house'), fx: { soc: 1, str: -1 }, do: (c) => c.log('你把爸妈接来一起住。') },
    ],
  },
  {
    id: 'pastime',
    age: 53,
    text: '你闲了下来，想找点事做。',
    options: [
      { key: 'write', text: '写点东西', if: (c) => c.kno >= 7, set: ['writing'], fx: { kno: 1 }, do: (c) => c.log('你开始写书。') },
      { key: 'run', text: '练长跑', if: (c) => c.str >= 5 || c.has('exercise'), set: ['runner', 'exercise'], fx: { str: 1 }, do: (c) => c.log('你开始练长跑。') },
      { key: 'stock', text: '炒股', set: ['stock'], fx: { mny: -1 }, do: (c) => c.log('你开始炒股。') },
      { key: 'safe', text: '炒股，见好就收', new: true, if: (c) => c.seen('m:stock-lost'), fx: { mny: 2 }, do: (c) => c.log('上一稿炒股亏过。这次你赚了一点就收手了。', 'deja') },
      { key: 'dance', text: '跳广场舞', set: ['dance'], fx: { soc: 2, str: 1 }, do: (c) => c.log('你开始跳广场舞。') },
    ],
  },
  {
    id: 'retire',
    age: 60,
    if: (c) => !c.has('retired'),
    text: '你退休了。',
    options: [
      {
        key: 'travel',
        text: '出去走走',
        if: (c) => c.mny >= 5,
        do: (c) => {
          if (c.mny >= 9) (c.flag('aurora'), c.add({ mny: -4, soc: 1 }), c.log('你去北欧旅游，看到了极光。', 'milestone'));
          else (c.add({ mny: -2 }), c.log('你去海边玩了一趟。'));
        },
      },
      { key: 'family', text: '多陪陪家人', if: (c) => c.has('kid'), fx: { soc: 2 }, do: (c) => c.log('你经常去孩子家帮忙。') },
      { key: 'home', text: '回老家盖房', if: (c) => c.mny >= 10, set: ['homehouse', 'back'], fx: { mny: -6, str: 1 }, do: (c) => c.log('你在老家盖了一栋两层小楼。', 'milestone') },
      { key: 'rehire', text: '返聘回去接着干', if: (c) => c.has('teacher') || c.has('doctor'), fx: { mny: 2, str: -1 }, do: (c) => c.log('你被返聘回去继续上班。') },
      { key: 'rest', text: '在家歇着', fx: { str: 1 }, do: (c) => c.log('你每天睡到自然醒。') },
    ],
  },
  {
    id: 'will',
    age: 80,
    to: 85,
    if: (c) => c.mny >= 6,
    text: '你开始考虑身后事。',
    options: [
      { key: 'donate', text: '捐给山里的学校', set: ['donor'], fx: { soc: 3 }, do: (c) => (c.set('mny', 1), c.log('你把钱捐给了山区的学校。', 'milestone')) },
      { key: 'kids', text: '留给孩子', if: (c) => c.has('kid'), fx: { soc: 1 }, do: (c) => c.log('你立了遗嘱，钱留给孩子。') },
      {
        key: 'spend',
        text: '趁还走得动，花掉',
        fx: { mny: -4, str: -1 },
        do: (c) => {
          if (!c.has('aurora') && c.chance(0.5)) (c.flag('aurora'), c.log('你跟团去北欧看了极光，是团里年纪最大的。', 'milestone'));
          else c.log('你坐邮轮绕了半个地球。');
        },
      },
    ],
  },
];
// 退休: 选什么都算退休了
for (const o of CHOICES.find((x) => x.id === 'retire').options) o.set = [...(o.set ?? []), 'retired'];

// ---- 结局 ---- 从上往下, 第一个对上的就是。pts: 结算时另加的分; hint: 图鉴里没解锁时给的提示
const p = (c) => c.peak;
export const ENDINGS = [
  { key: 'perfect', name: '定稿', desc: '这一稿，不改了。', hint: '心愿达成，四项属性都到过 13 以上，活过 70 岁。', pts: 120, test: (c) => c.wishDone && c.age >= 70 && ['str', 'kno', 'soc', 'mny'].every((k) => p(c)[k] >= 13) },
  { key: 'hundred', name: '百岁人瑞', desc: '你活过了一百岁。', hint: '活得足够久。', pts: 60, test: (c) => c.age >= 100 },
  { key: 'overwork', name: '劳碌命', desc: '你是累死的。', hint: '加班太多。', pts: 0, test: (c) => c.dead?.cause === 'overwork' },
  { key: 'young', name: '英年早逝', desc: '你走得太早了。', hint: '走得太早。', pts: 0, test: (c) => c.age < 40 },
  { key: 'donor', name: '散尽家财', desc: '你把钱都捐了。', hint: '晚年把积蓄捐出去。', pts: 40, test: (c) => c.has('donor') },
  { key: 'author', name: '著书立说', desc: '你出过一本书。', hint: '晚年拿起笔。', pts: 40, test: (c) => c.has('book') },
  { key: 'tycoon', name: '富甲一方', desc: '你很有钱。', hint: '创业成功。', pts: 40, test: (c) => p(c).mny >= 18 },
  { key: 'bankrupt', name: '从头再来', desc: '你创业赔光过。', hint: '创业失败过。', pts: 10, test: (c) => c.has('bankrupt') },
  { key: 'aurora', name: '看过极光', desc: '你看过极光。', hint: '攒够钱，退休后出去旅游。', pts: 30, test: (c) => c.has('aurora') },
  { key: 'runner', name: '跑完全程', desc: '你跑完过一场马拉松。', hint: '中年以后开始跑步。', pts: 30, test: (c) => c.has('marathon') },
  { key: 'home', name: '落叶归根', desc: '你在老家盖了房子，在那里养老。', hint: '回老家盖一栋房子。', pts: 30, test: (c) => c.has('homehouse') },
  { key: 'family', name: '四世同堂', desc: '过年时，一大家子坐满了三桌。', hint: '有孩子，并且活得够久。', pts: 30, test: (c) => c.has('grandkid') && c.age >= 80 },
  { key: 'teacher', name: '桃李满天下', desc: '你教了一辈子书。', hint: '当很多年老师。', pts: 30, test: (c) => c.has('teacher') && c.count('teach') >= 4 },
  { key: 'doctor', name: '悬壶济世', desc: '你当了一辈子医生。', hint: '学医，当很多年医生。', pts: 30, test: (c) => c.has('doctor') && c.age >= 55 },
  { key: 'artist', name: '画家', desc: '你画了一辈子画。', hint: '从小学画画，长大当画家。', pts: 20, test: (c) => c.has('artist') },
  { key: 'expat', name: '异乡人', desc: '你在国外过了大半辈子。', hint: '出国留学，留在国外。', pts: 20, test: (c) => c.has('expat') },
  { key: 'sea', name: '渔民', desc: '你打了一辈子鱼。', hint: '出生在渔村，长大接着打鱼。', pts: 20, test: (c) => c.has('fisher') },
  { key: 'coder', name: '代码人生', desc: '你写了一辈子代码。', hint: '学计算机，去大城市。', pts: 10, test: (c) => c.has('coder') },
  { key: 'civil', name: '铁饭碗', desc: '你在单位安安稳稳干到了退休。', hint: '回老家考编。', pts: 10, test: (c) => c.has('civil') && c.age >= 60 },
  { key: 'shop', name: '街角小店', desc: '你的小店开了很多年。', hint: '开一家自己的店。', pts: 20, test: (c) => c.has('shop') },
  { key: 'iron', name: '铁打的身子', desc: '你一辈子没进过几次医院。', hint: '体魄很高，活过 80 岁。', pts: 20, test: (c) => p(c).str >= 15 && c.age >= 80 },
  { key: 'cat', name: '猫奴', desc: '你一个人，和猫过了一辈子。', hint: '不结婚，养只猫。', pts: 10, test: (c) => c.has('cat') && !c.has('married') },
  { key: 'peaceful', name: '寿终正寝', desc: '你在睡梦中走了。', hint: '活过 88 岁。', pts: 10, test: (c) => c.age >= 88 },
  { key: 'scholar', name: '学富五车', desc: '你读了一辈子书。', hint: '学识极高。', pts: 20, test: (c) => p(c).kno >= 18 },
  { key: 'friends', name: '朋友遍天下', desc: '你的葬礼来了很多人。', hint: '人缘极好。', pts: 20, test: (c) => p(c).soc >= 18 },
  { key: 'ordinary', name: '平凡的一生', desc: '你过完了普通的一生。', hint: '怎么都能拿到。', pts: 0, test: () => true },
];
