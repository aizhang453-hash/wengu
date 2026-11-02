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
  { key: 'alley', name: '城中村', desc: '楼与楼之间能握手，邻居家炒什么菜你都知道。', stats: { str: 5, kno: 3, soc: 6, mny: 2 }, birth: '你出生在城中村一栋握手楼的四楼。楼下的麻将声陪你度过了第一个夜晚。' },
  { key: 'books', name: '书香门第', desc: '家里的书比家具多，搬家时最重的是纸箱。', stats: { str: 3, kno: 7, soc: 3, mny: 4 }, birth: '你出生在一个书比家具多的家里。你爸为了给你起名字，翻了三天字典。' },
  { key: 'sea', name: '海边渔村', desc: '闻着海风长大，还没学会走路先学会了扑腾。', stats: { str: 7, kno: 2, soc: 4, mny: 2 }, flags: ['sea'], birth: '你出生在海边的渔村。那天风浪很大，你爸的船没出海，正好赶上你出生。' },
  { key: 'county', name: '县城双职工', desc: '父母都在县里上班，日子不紧也不松。', stats: { str: 4, kno: 4, soc: 4, mny: 4 }, birth: '你出生在县医院。你妈请了产假，你爸请了半天假。' },
  { key: 'mine', name: '矿区小镇', desc: '小镇因矿而兴，大人们下班时脸是黑的。', stats: { str: 6, kno: 3, soc: 5, mny: 3 }, flags: ['mine'], birth: '你出生在矿区的职工医院。窗外的天车转了一整夜。' },
  { key: 'rich', name: '新城富户', desc: '家里刚发达，住在新开发的小区，爸妈总不在家。', stats: { str: 3, kno: 4, soc: 2, mny: 9 }, flags: ['richkid'], birth: '你出生在私立医院的单人病房。你爸在走廊里打了一下午电话。' },
  { key: 'hill', name: '山里人家', desc: '上学要翻一座山，下雨天路就没了。', stats: { str: 7, kno: 2, soc: 4, mny: 1 }, flags: ['hill'], birth: '你出生在山里。接生的老奶奶说：这娃哭声响，是个有力气的。' },
  { key: 'grandma', name: '奶奶带大', desc: '爸妈在外地打工，一年回来一次。奶奶什么都依你。', stats: { str: 5, kno: 3, soc: 3, mny: 2 }, flags: ['grandma'], birth: '你出生没多久，爸妈就去了外地。奶奶把你裹在小被子里，说：不怕，有奶奶。' },
  { key: 'yard', name: '大院子弟', desc: '在一个大院里长大，院里的孩子成群结队。', stats: { str: 5, kno: 4, soc: 6, mny: 4 }, birth: '你出生了。满月那天，院里的孩子们挤在门口看你。' },
  {
    key: 'again',
    name: '似曾相识',
    desc: '总觉得这一切好像经历过。',
    stats: { str: 4, kno: 5, soc: 4, mny: 3 },
    flags: ['deja'],
    unlock: (u) => u.runs >= 3,
    lock: '写满 3 稿后出现',
    birth: '你出生了。睁开眼的一瞬间，你有一种奇怪的感觉：又来了。',
  },
];

// ---- 性格 ----
export const TRAITS = [
  { key: 'curious', name: '好奇', desc: '什么都想拆开看看。', stats: { kno: 2 } },
  { key: 'chatty', name: '话多', desc: '跟谁都能聊上半小时。', stats: { soc: 2 } },
  { key: 'stubborn', name: '倔', desc: '认定的事九头牛都拉不回来。', stats: { str: 1, kno: 1, soc: -1 } },
  { key: 'sunny', name: '乐天', desc: '天塌下来当被子盖。老得慢一些。', stats: { str: 1, soc: 1 } },
  { key: 'frugal', name: '节俭', desc: '一个塑料袋能用三回。', stats: { mny: 2 } },
  { key: 'bold', name: '胆大', desc: '越是没人走过的路越想走。', stats: { str: 1 } },
  { key: 'careful', name: '心细', desc: '出门前要检查三遍煤气。躲得过不少坑。', stats: { kno: 1 } },
  { key: 'lazy', name: '懒', desc: '能躺着绝不坐着。不容易累垮。', stats: { str: -1, soc: 1 } },
  { key: 'artsy', name: '文艺', desc: '看见晚霞会停下来。', stats: { kno: 1, soc: 1 } },
];

// ---- 心愿 ---- hint: 没了的时候评语里给的建议
export const WISHES = [
  { key: 'aurora', name: '看一次极光', hint: '攒够钱，找机会出趟远门', done: (c) => c.has('aurora') },
  { key: 'shop', name: '开一家自己的小店', hint: '找个机会自己当老板', done: (c) => c.has('shop') },
  { key: 'book', name: '出一本书', hint: '多读书，闲下来就动笔', done: (c) => c.has('book') },
  { key: 'family', name: '儿孙满堂', hint: '早点成家，好好活着', done: (c) => c.has('grandkid') },
  { key: 'hundred', name: '活到一百岁', hint: '好好锻炼，少操点心', done: (c) => c.age >= 100 },
  { key: 'teach', name: '站上讲台', hint: '报考师范', done: (c) => c.has('teacher') },
  { key: 'home', name: '在老家盖一栋房子', hint: '攒够钱，退休后回老家', done: (c) => c.has('homehouse') },
  { key: 'friend', name: '有一个一辈子的朋友', hint: '早点交个朋友，别走散了', done: (c) => c.has('bestie') && c.age >= 60 && c.age - c.since('bestie') <= 20 },
  { key: 'marathon', name: '跑完一次马拉松', hint: '中年以后开始跑步', done: (c) => c.has('marathon') },
];

// ---- 没遇到什么事的年份 ----
export const FILLERS = {
  child: ['你平平安安地长了一岁。', '这一年你每天吃了睡、睡了吃。', '这一年没什么特别的事，你又长高了一点。'],
  school: ['这一年在上学、放学、写作业中过去了。', '寒暑假一眨眼就过去了。', '这一年你没惹什么祸，也没得什么奖。'],
  teen: ['这一年在作业和考试里过去了。', '你又长高了，饭量也大了。', '这一年你觉得大人们都不懂你。'],
  adult: ['这一年平淡地过去了。', '日子一天天过，没什么大起大落。', '这一年忙忙碌碌，回头想想也记不起忙了什么。', '这一年过得还行。'],
  old: ['这一年你过得很安稳。', '你又老了一岁，身体还算硬朗。', '这一年你常坐在窗边晒太阳。', '这一年你每天按时吃饭、散步、睡觉。', '这一年没什么新鲜事，你觉得挺好。'],
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
        ['抓周时你抓了一把算盘，你妈说以后能管钱。', { mny: 1 }],
        ['抓周时你抓了一个鸡腿，啃得满脸是油。', { str: 1 }],
        ['抓周时你抓了一个玩具话筒，咿咿呀呀说个不停。', { soc: 1 }],
      ]);
      c.log(t);
      c.add(fx);
    },
  },
  { id: 'walk', from: 1, to: 2, text: '你学会了走路，第一件事是去够桌上的遥控器。', fx: { str: 1 } },
  { id: 'word', from: 1, to: 2, text: (c) => `你说出了第一个词：「${c.pick(['饭', '不', '奶奶', '球'])}」。全家人激动了一晚上。` },
  { id: 'fever', from: 1, to: 4, text: '你半夜发高烧，家里人抱着你跑了三条街找诊所。', fx: { str: -1 } },
  { id: 'seaswim', from: 2, to: 5, if: (c) => c.has('sea'), text: '你还走不稳，就已经会在浅滩里扑腾了。', fx: { str: 1 } },
  { id: 'goat', from: 3, to: 6, if: (c) => c.has('hill'), text: '你跟着一只山羊爬上了后山，全家人找了你一下午。', fx: { str: 1 } },
  { id: 'story', from: 3, to: 6, if: (c) => c.has('grandma'), text: '奶奶每晚给你讲故事，讲来讲去都是同一个，你每次都听得很认真。', fx: { soc: 1 } },
  { id: 'toys', from: 3, to: 6, if: (c) => c.has('richkid'), text: '你的玩具堆满了一个房间，可是没人陪你玩。', fx: { soc: -1 } },
  {
    id: 'kinder',
    from: 3,
    fixed: true,
    set: ['kinder'],
    do: (c) => (c.trait === 'chatty' ? (c.log('你上幼儿园了，第一天就交了五个朋友。'), c.add({ soc: 1 })) : c.log('你上幼儿园了。第一天哭得最响的就是你。')),
  },
  { id: 'wall', from: 3, to: 6, text: '你在家里的白墙上画了一幅巨作。你爸看了很久，最后没舍得刷掉。', fx: { kno: 1 } },
  { id: 'cartoon', from: 3, to: 6, text: '你守着电视看动画片，片头曲唱得比谁都熟。' },
  { id: 'clock', from: 4, to: 8, if: (c) => c.trait === 'curious', text: '你把家里的闹钟拆了，装回去时多出来三个零件。它居然还能走。', fx: { kno: 1 } },
  { id: 'lost', from: 4, to: 6, text: '你在菜市场走丢了，被卖鱼的阿姨领回了家。', fx: { soc: 1 } },
  { id: 'dogchase', from: 3, to: 6, text: '你被邻居家的狗追了半条街。从此看见狗就绕道走。', fx: { str: 1 } },
  { id: 'minedad', from: 4, to: 8, if: (c) => c.has('mine'), text: '你爸下班回来，脸黑得只剩眼白。你吓哭了，他笑了。' },
  { id: 'gang', from: 4, to: 9, if: (c) => c.origin === 'yard', text: '你成了院里孩子帮的一员，负责放哨。', fx: { soc: 1 } },
  { id: 'mahjong', from: 4, to: 9, if: (c) => c.origin === 'alley', text: '你在楼下麻将桌边看多了，五岁就会算番。', fx: { kno: 1 } },
  { id: 'dejakid', from: 3, to: 6, if: (c) => c.has('deja'), k: 'deja', text: '你指着一个从没去过的地方说：「我来过这里。」大人们面面相觑。' },

  // 7–12 岁
  {
    id: 'primary',
    from: 7,
    fixed: true,
    set: ['primary'],
    do: (c) => (c.has('hill') ? (c.log('你上小学了。每天要翻一座山，来回两个钟头。'), c.add({ str: 1 })) : c.log('你上小学了。书包比你还宽。')),
  },
  { id: 'hundred', from: 7, to: 9, text: '你第一次考了一百分，试卷被你妈贴在了墙上。', fx: { kno: 1 } },
  { id: 'monitor', from: 8, to: 11, if: (c) => c.soc >= 6, text: '你被选为班长，开始学着管别人。', fx: { soc: 1 } },
  { id: 'copy', from: 8, to: 12, text: '你抄同桌作业被发现，两个人一起罚站。从此你们成了朋友。', fx: { soc: 1 } },
  { id: 'bestie', from: 7, to: 12, w: 2, if: (c) => !c.has('bestie'), set: ['bestie'], text: '你认识了一个住在同一条街的小伙伴。你们约好，长大了也要一起玩。', fx: { soc: 1 } },
  { id: 'arm', from: 7, to: 12, if: (c) => c.trait !== 'careful', text: '你从单杠上摔下来，胳膊打了石膏。全班同学都在上面签了名。', fx: { str: -1, soc: 1 } },
  { id: 'essay', from: 7, to: 12, text: '你参加全校作文比赛，拿了三等奖。奖品是一本字典。', fx: { kno: 1 } },
  { id: 'piggy', from: 7, to: 12, if: (c) => c.trait === 'frugal', text: '你把零花钱存进储蓄罐，一年攒了三百块。', fx: { mny: 1 } },
  { id: 'arcade', from: 9, to: 12, text: '你偷偷溜进游戏厅，被你爸当场抓获。', fx: { soc: 1 } },
  { id: 'glasses', from: 9, to: 14, if: (c) => c.kno >= 7, text: '你看书看得太多，戴上了眼镜。', fx: { kno: 1, str: -1 } },
  { id: 'seasick', from: 8, to: 12, if: (c) => c.has('sea'), text: '你第一次跟大人出海，晕得吐了一路。回来后你说：下次还去。', fx: { str: 1 } },
  { id: 'oneteacher', from: 8, to: 12, if: (c) => c.has('hill'), text: '山里的学校只有一个老师，教所有的课。他说你是他见过最用心的学生。', fx: { kno: 1 } },
  { id: 'porridge', from: 9, to: 12, if: (c) => c.has('grandma'), text: '奶奶病了一场。你学会了煮粥，端到她床前。', fx: { soc: 1 } },
  { id: 'newyear', from: 8, to: 12, if: (c) => c.has('grandma'), text: '过年爸妈回来了，你躲在奶奶身后，半天没敢叫人。', fx: { soc: -1 } },
  { id: 'tutors', from: 7, to: 12, if: (c) => c.has('richkid'), text: '家里给你请了三个家教，周末排得满满当当。', fx: { kno: 2, soc: -1 } },
  { id: 'tree', from: 9, to: 12, text: '你在学校的文艺汇演里演一棵树，全程一动不动，被评为「最佳道具」。', fx: { soc: 1 } },
  { id: 'mathprize', from: 10, to: 12, if: (c) => c.chose('hobby', 'math'), text: '你拿了市里数学竞赛的二等奖。', fx: { kno: 2 } },
  { id: 'artshow', from: 9, to: 12, if: (c) => c.chose('hobby', 'art'), text: '你画的画被选去区里展览。', fx: { kno: 1, soc: 1 } },
  { id: 'piano', from: 10, to: 12, if: (c) => c.chose('hobby', 'music'), text: '你考过了钢琴八级。邻居们松了一口气。', fx: { kno: 1 } },
  { id: 'nest', from: 9, to: 12, if: (c) => c.chose('hobby', 'wild'), text: '你爬树掏鸟窝，被鸟啄了脑门。', fx: { str: 1 } },
  { id: 'stray', from: 7, to: 12, if: (c) => !c.has('dog'), set: ['dog'], text: '你捡回来一只流浪狗，跟家里磨了三天，终于把它留下了。', fx: { soc: 1 } },
  { id: 'bully', from: 8, to: 12, if: (c) => c.soc <= 3, text: '你被高年级的同学堵在厕所门口要钱。你没给，挨了一顿打。', fx: { str: -1, soc: -1 } },
  { id: 'dejaexam', from: 10, to: 12, if: (c) => c.has('deja'), k: 'deja', text: '考试时你看到一道题，答案自己就从脑子里冒了出来。', fx: { kno: 1 } },

  // 13–18 岁
  {
    id: 'middle',
    from: 13,
    fixed: true,
    set: ['middle'],
    do: (c) => c.log(c.has('boarding') ? '你住进了寄宿学校的宿舍，第一晚听着七个人的呼噜声睡不着。' : '你升上了初中，教室从一楼搬到了三楼。'),
  },
  { id: 'growth', from: 13, to: 14, text: '你一年蹿了十厘米，裤子全短了一截。', fx: { str: 1 } },
  { id: 'pimple', from: 13, to: 16, text: '你脸上冒了一颗痘，对着镜子照了一晚上。' },
  { id: 'novels', from: 13, to: 16, if: inSchool, text: '你在课桌底下看武侠小说，被老师没收了一整套。', fx: { kno: 1 } },
  { id: 'slip', from: 13, to: 17, if: inSchool, text: '月考你掉到了班级中游。你妈说：「我不骂你，你自己想想。」你想了一晚上。', fx: { kno: 1 } },
  { id: 'hoops', from: 13, to: 17, if: (c) => inSchool(c) && c.str >= 6, text: '你进了校篮球队，每天放学都泡在球场上。', fx: { str: 2, soc: 1 } },
  { id: 'netcafe', from: 13, to: 17, if: (c) => inSchool(c) && c.trait !== 'careful', text: '你通宵泡网吧，第二天在课上睡得口水直流。', fx: { kno: -1, soc: 1 } },
  { id: 'diary', from: 13, to: 16, if: (c) => c.trait === 'artsy', text: '你开始写日记，锁在一个带小锁的本子里。', fx: { kno: 1 } },
  {
    id: 'move',
    from: 13,
    to: 16,
    if: (c) => c.has('bestie'),
    text: '你最好的朋友要搬去别的城市了。你们约好每周写信。',
    do: (c) => {
      if (c.trait !== 'careful' && c.chance(0.5)) {
        c.log('信越写越少，后来就断了。');
        c.unflag('bestie');
      }
    },
  },
  { id: 'fight', from: 13, to: 17, if: (c) => c.trait === 'stubborn', text: '你为了一句话跟人打了一架，两个人都鼻青脸肿，第二天一起被叫了家长。', fx: { str: 1, soc: -1 } },
  { id: 'phone', from: 13, to: 16, text: '你有了第一部手机，晚上躲在被子里发消息。', fx: { soc: 1 } },
  { id: 'olymp', from: 14, to: 17, if: (c) => inSchool(c) && c.kno >= 10, text: '你被选进了竞赛班，开始做大学的题。', fx: { kno: 2 } },
  { id: 'flu', from: 13, to: 17, if: inSchool, text: '你得了一场重感冒，在家躺了一周，回去发现课都听不懂了。', fx: { kno: -1 } },
  { id: 'teajob', from: 15, to: 17, if: (c) => inSchool(c) && c.mny <= 3, text: '暑假你去奶茶店打工，一个月挣了八百块。你给家里买了一桶油。', fx: { mny: 1, soc: 1 } },
  { id: 'storm', from: 14, to: 18, if: (c) => c.has('sea'), text: '台风天，你和你爸在码头上拴了一夜的船。', fx: { str: 1 } },
  { id: 'mineclose', from: 14, to: 20, if: (c) => c.has('mine'), text: '矿上效益不好，你爸下岗了。家里的饭桌上很久没见到肉。', fx: { mny: -2 } },
  { id: 'road', from: 15, to: 20, if: (c) => c.has('hill'), text: '村里通了公路。你第一次坐上了去县城的大巴，扒着车窗看了一路。', fx: { kno: 1 } },
  { id: 'party', from: 14, to: 18, if: (c) => c.has('richkid'), text: '你在生日会上请了全班同学，后来发现有一半人你叫不出名字。', fx: { soc: 1 } },
  { id: 'dejateen', from: 14, to: 17, if: (c) => c.has('deja'), k: 'deja', text: '你梦见自己坐在考场上，一道题也不会。醒来后你多做了三套卷子。', fx: { kno: 2 } },
  { id: 'gkfear', from: 14, to: 15, fixed: true, if: (c) => c.seen('m:gaokao-low'), k: 'deja', text: '你总有种预感：高考会考砸。于是你从初三就开始刷题。', fx: { kno: 2 } },
  { id: 'highpress', from: 17, to: 18, if: (c) => c.has('high'), text: '高三的教室里贴满了倒计时。你的黑眼圈越来越重。', fx: { kno: 2, str: -1 } },
  { id: 'run1000', from: 16, to: 18, if: (c) => c.has('high'), text: '体测跑一千米，跑到一半你想放弃，又咬着牙跑完了。', fx: { str: 1 } },
  { id: 'engine', from: 16, to: 18, if: (c) => c.has('vocational'), text: '你在实训车间第一次独立拆装了一台发动机。', fx: { str: 1, kno: 1 } },
  { id: 'cert', from: 16, to: 18, if: (c) => c.has('vocational'), text: '你考到了电工证，揣在兜里摸了好几天。', fx: { mny: 1 } },
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
        c.log('你没再上学，跟着你爸上了渔船。天很大，海很大，人很小。');
        c.add({ str: 1 });
      } else {
        c.flag('worker');
        c.log('你跟着表哥去了南方的工厂，第一次见到那么长的流水线。');
        c.add({ mny: 1 });
      }
    },
  },
  { id: 'line', from: 16, to: 22, if: (c) => c.has('worker'), text: '流水线上一天站十二个小时，你学会了站着打盹。', fx: { str: -1, mny: 1 } },
  { id: 'remit', from: 16, to: 22, if: (c) => c.has('worker') || c.has('fisher'), text: '你给家里寄了第一笔钱。你妈打电话来，说了两句就哽咽了。', fx: { soc: 1 } },
  { id: 'cards', from: 16, to: 25, if: (c) => c.has('worker'), text: '工友教你打牌，你输掉了半个月工资。', fx: { mny: -1, soc: 1 } },
  {
    id: 'trade',
    from: 18,
    fixed: true,
    if: (c) => c.has('vocational') && !c.has('job'),
    set: ['job', 'craftsman'],
    do: (c) => c.log(`你职校毕业了，在一家${c.pick(['汽修店', '饭馆后厨', '装修队'])}当学徒。师傅话不多，手很快。`),
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
      c.log(`高考成绩出来了：${s} 分。${{ 'gk-top': '你爸放了一挂鞭炮。', 'gk-mid': '不算好，也不算差。', 'gk-low': '你在房间里关了两天。' }[tier]}`, 'milestone');
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
      c.log(`复读一年，你又进了一次考场：${s} 分。`, 'milestone');
    },
  },

  // 大学
  { id: 'dorm', from: 19, to: 20, if: (c) => c.has('college') && !c.did('dorm'), text: '你拖着行李箱走进大学校门。室友来自天南地北，第一晚就聊到了凌晨三点。', fx: { soc: 1 } },
  { id: 'club', from: 19, to: 22, if: (c) => c.has('college'), text: '你加入了一个社团，最后只记住了社团的聚餐。', fx: { soc: 1 } },
  { id: 'cram', from: 19, to: 23, if: (c) => c.has('college') && (c.trait === 'lazy' || c.trait === 'bold'), text: '你连着一周没去上课，期末突击了三个通宵。', fx: { kno: -1, str: -1 } },
  { id: 'scholar', from: 19, to: 23, if: (c) => c.has('college') && c.kno >= 11, text: '你拿了奖学金，请室友吃了一顿火锅。', fx: { mny: 1, soc: 1 } },
  { id: 'library', from: 19, to: 23, w: 2, if: (c) => c.has('college') && !c.has('dating') && c.soc >= 5, set: ['dating'], text: '你在图书馆认识了一个人，后来常常一起去食堂。' },
  { id: 'split', from: 21, to: 23, if: (c) => c.has('college') && c.has('dating') && c.trait !== 'stubborn', text: '毕业季，你们因为去向不同分了手。你在操场上走了很多圈。', fx: { soc: -1 }, do: (c) => c.unflag('dating') },
  { id: 'intern', from: 21, to: 23, if: (c) => c.has('college'), text: '你找了份实习，每天挤一个半小时地铁。', fx: { mny: 1, str: -1 } },
  { id: 'hello', from: 19, to: 22, if: (c) => c.has('cs'), text: '你写的第一个程序只输出了一行「你好，世界」。你盯着它看了很久。', fx: { kno: 1 } },
  { id: 'semicolon', from: 20, to: 23, if: (c) => c.has('cs'), text: '你熬夜找一个错误，天亮时发现是少了一个分号。', fx: { kno: 1, str: -1 } },
  { id: 'anatomy', from: 19, to: 23, if: (c) => c.has('med'), text: '你第一次上解剖课，中午一口饭也没吃下。', fx: { kno: 1 } },
  { id: 'medbooks', from: 20, to: 24, if: (c) => c.has('med'), text: '医学生的书摞起来比你还高，你背完一本又来一本。', fx: { kno: 2, str: -1 } },
  { id: 'sketch', from: 19, to: 23, if: (c) => c.has('arts'), text: '你去写生，路上看见一片麦田，画了一下午。', fx: { kno: 1 } },
  { id: 'podium', from: 20, to: 23, if: (c) => c.has('normal'), text: '你去中学实习，第一次站上讲台，手心里全是汗。', fx: { soc: 1 } },
  { id: 'lab', from: 23, to: 25, if: (c) => c.has('grad'), text: '你跟着导师做项目，常常在实验室过夜。', fx: { kno: 2, str: -1 } },
  { id: 'soysauce', from: 23, to: 26, if: (c) => c.has('abroad'), text: '你在异国的超市里找不到酱油，突然很想家。', fx: { soc: -1 } },
  { id: 'chef', from: 23, to: 26, if: (c) => c.has('abroad'), text: '你学会了做红烧肉，成了留学生圈子里的厨神。', fx: { soc: 2 } },
  {
    id: 'gradjob',
    from: 25,
    to: 26,
    fixed: true,
    if: (c) => c.has('grad') && c.since('grad') >= 3 && !c.has('job'),
    do: (c) => {
      c.log('你硕士毕业了。', 'milestone');
      c.flag('job');
      if (c.has('med')) (c.flag('doctor'), c.log('你进了一家大医院，穿上了白大褂。'));
      else if (c.has('normal')) (c.flag('teacher'), c.log('你留在学校当了老师。'));
      else if (c.has('cs')) (c.flag('coder', 'bigcity'), c.log('你进了一家大公司写代码，工资是你爸的五倍。'), c.add({ mny: 3 }));
      else (c.flag('office'), c.log('你进了一家研究所，每天和资料打交道。'), c.add({ kno: 1, mny: 1 }));
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
        c.log('你回国了。机场出口，你爸妈举着一块写着你名字的纸板。');
        c.add({ mny: 2, soc: 1 });
      }
    },
  },

  // 工作
  { id: 'share', from: 22, to: 30, if: (c) => c.has('bigcity'), text: '你和三个人合租，共用一个卫生间，早上要排队。', fx: { soc: 1, str: -1 } },
  {
    id: 'overtime',
    from: 23,
    to: 50,
    once: false,
    if: (c) => (c.has('coder') || c.has('office') || c.has('boss') || c.has('doctor')) && c.count('ot') < 6,
    do: (c) => {
      c.log(c.pick(['你连续加班一个月，头发掉了一把。', '你又在公司过了一个周末。', '凌晨一点，办公室里只剩你的灯还亮着。']));
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
      else (c.log('你在工位上晕倒了，被同事送进了医院。医生让你好好休息。'), c.add({ str: 1 }), c.inc('ot', -1));
    },
  },
  { id: 'promote', from: 25, to: 50, if: (c) => job(c) && c.kno + c.soc >= 14 && !c.has('fisher'), text: '你升职了。工资涨了一截，头发少了一截。', fx: { mny: 2, str: -1 } },
  {
    id: 'teaching',
    from: 23,
    to: 59,
    once: false,
    if: (c) => c.has('teacher') && !c.has('retired') && c.count('teach') < 8,
    do: (c) => {
      rotate(c, 'teach', [
        ['你带的班考出了全年级第一，学生们把你抛了起来。', { soc: 2 }],
        ['一个毕业多年的学生回来看你，说当年要不是你，自己走不到今天。', { soc: 1 }],
        ['你批了一晚上作业，红笔写干了两支。', { kno: 1, str: -1 }],
        ['教师节那天，你的讲台上堆满了贺卡。', { soc: 1 }],
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
        ['你连着做了三台手术，下台时腿都是软的。', { str: -1, mny: 1 }],
        ['一个病人出院时，给你送来一面锦旗。', { soc: 2 }],
        ['你值了一个通宵的夜班，早上接着出门诊。', { str: -1, kno: 1 }],
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
        ['你写的功能上线了，用的人比你老家县城的人口还多。', { kno: 1, mny: 1 }],
        ['凌晨三点服务器出了故障，你从床上弹了起来。', { str: -1 }],
        ['你发现五年前写的代码现在谁也看不懂，包括你自己。', { kno: 1 }],
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
        ['你的一幅画卖出去了，买家说要挂在客厅里。', { mny: 2 }],
        ['你接了个设计单，甲方改了二十一版，最后用了第一版。', { mny: 1, soc: -1 }],
        ['你在一家小咖啡馆办了个画展，来了二十个人，其中十五个是朋友。', { soc: 1 }],
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
        ['你写的一份材料被领导表扬了文笔。', { kno: 1 }],
        ['日子像复印机，一天和一天差不多。', {}],
        ['单位体检，你的各项指标都很正常。', { str: 1 }],
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
        c.log('你攒够了钱，盘下一个小铺面，挂上了自己的招牌。', 'milestone');
        c.add({ mny: -3 });
      } else (c.log(c.pick(['你修好了一辆别人都说没救的老车，车主请你喝了顿酒。', '你的手艺在街坊里出了名，找你的人越来越多。'])), c.add({ soc: 1, mny: 1 }));
    },
  },
  { id: 'foreman', from: 20, to: 30, if: (c) => c.has('worker') && c.soc >= 5, text: '你当上了班组长，管着二十个人。', fx: { soc: 1, mny: 1 } },
  { id: 'newmachine', from: 20, to: 45, if: (c) => c.has('worker'), text: '厂里换了新机器，你是第一个学会的。', fx: { kno: 1 } },
  {
    id: 'fishing',
    from: 17,
    to: 65,
    once: false,
    w: 0.8,
    if: (c) => c.has('fisher') && c.count('fishing') < 8,
    do: (c) => {
      rotate(c, 'fishing', [
        ['你打到了一条很大的鱼，全村人都来看。', { mny: 2, soc: 1 }],
        ['台风季休渔三个月，你在家补网。', { kno: 1 }],
        ['你在海上遇到了大风浪，回来时腿还在抖。', { str: -1 }],
        ['你换了一条新船，刷上了自己起的名字。', { mny: -1, soc: 1 }],
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
        c.log('你的公司拿到了投资，你坐进了自己的办公室。', 'milestone');
        c.add({ mny: 8 });
      } else {
        c.flag('bankrupt');
        c.mark('m:bankrupt');
        c.log('公司没撑过第三个冬天。你卖掉了车，还清了欠款，回到了起点。', 'milestone');
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
      c.log('副业慢慢做起来了，挣的比工资还多。你辞了职，专心做它。', 'milestone');
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
        ['你的公司越做越大，你却越来越难睡个整觉。', { mny: 3, str: -1 }],
        ['你回母校做演讲，台下的学生问你成功的秘诀。你说：运气。', { soc: 2 }],
        ['一笔大生意黄了，你在办公室里坐到了半夜。', { mny: -2 }],
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
        ['你的小店来了个熟客，每天都点同一样东西。', { soc: 1, mny: 1 }],
        ['街口开了家连锁店，你的生意淡了一阵。', { mny: -1 }],
        ['你的小店上了本地的榜单，门口排起了队。', { mny: 2, soc: 1 }],
        ['你给店里的猫起了名字，它成了店里的招牌。', { soc: 1 }],
      ]);
    },
  },
  { id: 'gig', from: 35, to: 45, if: (c) => c.has('gig'), text: '你骑着电动车穿过大半个城市，记住了每一条小路。', fx: { str: 1, mny: 1 } },
  { id: 'homebound', from: 30, to: 60, if: (c) => c.has('back'), text: '你回到了老家。县城变了很多，街口那家早点铺还在。', fx: { soc: 1 } },
  {
    id: 'accident',
    from: 18,
    to: 70,
    p: 0.003,
    if: (c) => c.trait !== 'careful',
    do: (c) => {
      if (c.chance(0.3)) c.die('accident');
      else (c.log('你出了一场车祸，在医院躺了三个月。出院那天，你觉得天特别蓝。'), c.add({ str: -2 }));
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
        ['你病倒了，躺了一个多月。病好以后，你开始早睡早起，每天出门走一走。', { str: 3 }],
        ['医生看着你的检查单叹了口气：「再这样下去，身体就垮了。」你开始按时吃饭，戒了夜宵。', { str: 3 }],
        ['你爬三层楼就喘得走不动，这才发觉身体出了问题。你请了一个月假，好好养了养。', { str: 3 }],
      ]);
      c.inc('redlight-at', c.age - c.count('redlight-at'));
      c.flag('exercise');
    },
  },
  { id: 'drive', from: 20, to: 35, text: '你考驾照，科目二挂了三次。教练已经不想说话了。' },
  { id: 'gym', from: 25, to: 45, if: (c) => !c.has('exercise'), text: '你办了一张健身卡，去了两次。', fx: { mny: -1 } },
  { id: 'whitehair', from: 30, to: 45, text: '你在镜子里发现了第一根白头发。拔掉以后，第二天又长出来两根。' },
  { id: 'callmom', from: 22, to: 45, text: '你妈打电话问你吃了没有。你说吃了，其实还没。' },
  { id: 'insomnia', from: 30, to: 50, if: (c) => c.count('ot') >= 2, text: '你开始失眠，凌晨三点盯着天花板想人生。', fx: { str: -1 } },
  { id: 'midlife', from: 38, to: 48, text: '你突然很想买一辆摩托车。最后买了一辆自行车。', fx: { str: 1 } },
  { id: 'moving', from: 24, to: 40, text: '你搬了一次家，扔掉了一半的东西，发现根本不需要它们。' },
  { id: 'lottery', from: 25, to: 70, p: 0.01, text: '你买彩票中了五百块，高兴得请全办公室喝了奶茶，花了六百。', fx: { soc: 1 } },
  {
    id: 'scam',
    from: 40,
    to: 75,
    p: 0.02,
    do: (c) => {
      if (c.trait === 'careful') c.log('你接到一个电话，说你的快递出了问题。你听了两句就挂了。');
      else if (c.seen('m:scammed')) c.log('电话那头说你的快递出了问题。这套说辞你好像在哪儿听过。你挂了。', 'deja');
      else (c.log('你接到一个电话，说你的快递出了问题……等你反应过来，钱已经转出去了。'), c.add({ mny: -3 }), c.mark('m:scammed'));
    },
  },
  { id: 'dejaadult', from: 25, to: 45, if: (c) => c.has('deja'), k: 'deja', text: '走在街上，你突然停住了：这个路口，你好像在梦里选过另一条路。' },
  { id: 'cautious', from: 25, to: 35, fixed: true, if: (c) => c.seen('end:young') && !c.did('cautious'), k: 'deja', text: '你莫名地很惜命：不熬夜，按时吃饭，过马路左右看两遍。', fx: { str: 2 } },

  // 感情和家
  { id: 'rain', from: 24, to: 40, w: 1.5, if: (c) => !c.has('dating') && !c.has('married') && c.chose('love') && !c.chose('love', 'alone'), set: ['dating'], text: '一个下雨天，你和一个陌生人共撑了一把伞。后来你们常常一起撑伞。' },
  { id: 'bicker', from: 30, to: 70, if: (c) => c.has('married'), text: '你和爱人为了谁洗碗吵了一架，最后一起出去吃了。', fx: { soc: 1 } },
  {
    id: 'divorce',
    from: 33,
    to: 55,
    p: 0.012,
    if: (c) => c.has('married') && c.soc <= 9,
    text: '你们和平分开了，分东西的时候谁也没争。',
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
    text: '你的孩子出生了。你抱着那团小小的东西，手都不知道往哪儿放。',
    fx: { soc: 1, mny: -1 },
    do: (c) => {
      if (c.chose('kids', 'two')) (c.flag('kid2'), c.log('两年后，家里又多了一个。'));
    },
  },
  { id: 'homework', from: 36, to: 48, if: (c) => c.has('kid') && c.since('kid') >= 6, text: '孩子上小学了。你每天晚上陪写作业，血压明显升高。', fx: { str: -1 } },
  { id: 'teenkid', from: 43, to: 56, if: (c) => c.has('kid') && c.since('kid') >= 13, text: '孩子进入了青春期，一天跟你说的话不超过十句。', fx: { soc: -1 } },
  { id: 'sendoff', from: 48, to: 60, if: (c) => c.has('kid') && c.since('kid') >= 18, text: '孩子考上了大学。送走那天，你在车里坐了很久。', fx: { soc: 1 } },
  { id: 'kidwed', from: 55, to: 70, if: (c) => c.has('kid') && c.since('kid') >= 26, text: '孩子结婚了，你在婚礼上哭得比谁都厉害。', fx: { soc: 1 } },
  {
    id: 'grandkid',
    from: 55,
    to: 95,
    fixed: true,
    if: (c) => c.has('kid') && c.since('kid') >= 27 && !c.has('grandkid'),
    do: (c) => {
      if (!c.chance(c.chose('retire', 'family') ? 0.6 : 0.3)) return;
      c.flag('grandkid');
      c.log('你有了第一个孙辈。小家伙攥着你的手指，怎么也不松开。', 'milestone');
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
        ['猫在你的键盘上睡着了，你等它醒。', {}],
        ['你回到家，猫在门口等你。你知道它只是饿了。', { soc: 1 }],
        ['你的猫生病了，你请了三天假陪它。它好了以后照样不理你。', {}],
      ]),
  },
  { id: 'dogold', from: 20, to: 26, if: (c) => c.has('dog') && !c.did('dogold'), text: '陪你长大的那只狗老了，走的时候趴在你脚边。', fx: { soc: -1 }, do: (c) => c.unflag('dog') },
  { id: 'toast', from: 25, to: 50, if: (c) => c.has('bestie'), text: '你在老朋友的婚礼上致辞，说到一半哽咽了。', fx: { soc: 1 } },
  {
    id: 'drift',
    from: 25,
    to: 60,
    p: 0.03,
    if: (c) => c.has('bestie') && c.trait !== 'careful',
    text: '你和老朋友渐渐不联系了。翻到对方的动态，才发现已经一年没说过话。',
    fx: { soc: -1 },
    do: (c) => c.unflag('bestie'),
  },
  { id: 'reunion', from: 35, to: 65, if: (c) => !c.has('bestie') && c.did('drift'), text: '同学聚会上，你们又碰面了，聊到饭店打烊。从此又常常联系。', set: ['bestie'], fx: { soc: 1 } },
  { id: 'newfriend', from: 30, to: 60, if: (c) => !c.has('bestie') && c.soc >= 9, set: ['bestie'], text: '你和楼下的邻居成了好朋友，周末常常一起钓鱼。', fx: { soc: 1 } },

  // 中年以后
  { id: 'pta', from: 40, to: 52, if: (c) => c.has('kid') && c.since('kid') >= 8, text: '家长会上，老师点名说了你的孩子。回家的路上你想了很多，最后什么也没说。' },
  { id: 'goji', from: 40, to: 55, text: '你开始每天用保温杯泡枸杞。' },
  { id: 'farsight', from: 44, to: 56, text: '你的老花眼来了，看手机要把胳膊伸直。' },
  { id: 'tugofwar', from: 38, to: 55, if: job, text: '单位团建拔河，你闪了腰，在家躺了一个星期。', fx: { str: -1, soc: 1 } },
  { id: 'reunion20', from: 38, to: 48, text: '你参加了毕业二十年的同学聚会。有人发了财，有人发了福。', fx: { soc: 1 } },
  { id: 'angling', from: 40, to: 60, text: '你迷上了钓鱼，每个周末都去水库边坐一整天。', fx: { str: 1 } },
  { id: 'photos', from: 40, to: 60, if: (c) => c.has('married'), text: '结婚纪念日，你和爱人去照相馆补拍了一套照片。', fx: { soc: 1 } },
  { id: 'birthday70', from: 40, to: 52, text: '你爸过七十大寿，一家人难得聚齐，拍了一张全家福。', fx: { soc: 1 } },
  { id: 'farewell', from: 46, to: 62, text: '你送走了你爸。整理遗物时，你在他的抽屉里找到了你小时候的奖状。' },
  { id: 'cooking', from: 35, to: 50, text: '你学会了做饭，最拿手的是红烧排骨。', fx: { soc: 1 } },
  { id: 'wellness', from: 45, to: 60, text: '你被拉进了一个养生群，每天收到五十条转发。' },
  { id: 'backache', from: 40, to: 55, if: (c) => !c.has('exercise'), text: '你的腰开始不好，久坐一会儿就疼。', fx: { str: -1 } },
  { id: 'bookclub', from: 40, to: 58, if: (c) => c.kno >= 8, text: '你办了一个读书会，每个月读一本书，来的人越来越多。', fx: { kno: 1, soc: 1 } },
  { id: 'lostelder', from: 35, to: 60, text: '你在路边帮一个迷路的老人找到了家。几天后，对方的孩子送来一篮水果。', fx: { soc: 1 } },
  { id: 'balcony', from: 40, to: 60, text: '你开始在阳台上养花，死了三盆，活了一盆。你每天给那一盆拍照。' },
  { id: 'renovate', from: 39, to: 55, if: (c) => c.has('house'), text: '家里装修，你和装修队斗智斗勇了三个月。', fx: { mny: -1 } },
  { id: 'teacherhuh', from: 38, to: 50, if: job, text: '单位来了一批年轻人，都管你叫「老师」。你愣了一下，才反应过来是在叫你。' },
  { id: 'insure', from: 40, to: 50, if: (c) => c.trait === 'careful' || c.trait === 'frugal', text: '你给全家人都买了保险，把保单收在一个文件袋里。', fx: { mny: -1 } },
  { id: 'parentstrip', from: 40, to: 55, if: (c) => c.mny >= 8, text: '你第一次带爸妈出国旅游。你爸在免税店门口站了一下午，说什么都不进去。', fx: { mny: -2, soc: 1 } },
  { id: 'kidmeal', from: 42, to: 55, if: (c) => c.has('kid') && c.since('kid') >= 10, text: '孩子第一次给你做了顿饭，咸得发苦。你全吃完了。', fx: { soc: 1 } },
  { id: 'sabbatical', from: 42, to: 58, if: (c) => c.count('ot') >= 2, text: '你做了个小手术，住了三天院，才发现自己好多年没休息过了。', fx: { str: 1 } },
  { id: 'bp', from: 45, to: 70, p: 0.03, if: (c) => !c.has('exercise') && !c.has('sick'), set: ['sick'], text: '你查出了高血压，开始每天吃药。', fx: { str: -2 } },
  {
    id: 'illness',
    from: 50,
    to: 85,
    p: 0.012,
    do: (c) => {
      c.log('你查出了一场大病。');
      if (c.mny >= 8) (c.log('你做了手术，花了不少钱，好在挺了过来。'), c.add({ mny: -4, str: -1 }));
      else (c.log('你选择了保守治疗，每天按时吃药。'), c.add({ str: -3 }));
    },
  },
  { id: 'regret', from: 42, to: 55, if: (c) => c.chose('house', 'rent'), do: (c) => c.log(c.pick(['房价又涨了一倍，你后悔当年没买。', '房价跌了，你庆幸当年没买。'])) },
  { id: 'paidoff', from: 50, to: 70, fixed: true, if: (c) => c.has('mortgage') && c.since('mortgage') >= 20, text: '你还完了最后一笔房贷，那天晚上多喝了两杯。', fx: { mny: 1 }, do: (c) => c.unflag('mortgage') },
  { id: 'jog', from: 46, to: 70, if: (c) => c.has('runner') && !c.has('marathon'), text: '你每天早上绕着河边跑十公里。', fx: { str: 1 } },
  {
    id: 'marathon',
    from: 50,
    to: 75,
    fixed: true,
    if: (c) => c.has('runner') && !c.has('marathon') && c.since('runner') >= 1,
    do: (c) => {
      if (c.str >= 7 && c.chance(0.5)) {
        c.flag('marathon');
        c.log('你跑完了人生第一个全程马拉松。冲线时，你哭成了泪人。', 'milestone');
        c.add({ str: 1, soc: 1 });
      }
    },
  },
  { id: 'pages', from: 53, to: 80, if: (c) => c.has('writing') && !c.has('book'), text: '你每天早上写一千字，写完再去买菜。', fx: { kno: 1 } },
  {
    id: 'book',
    from: 55,
    to: 85,
    fixed: true,
    if: (c) => c.has('writing') && !c.has('book') && c.since('writing') >= 2,
    do: (c) => {
      if (c.kno >= 12 && c.chance(0.5)) {
        c.flag('book');
        c.log('你的书出版了。你在书店里偷偷把它挪到了显眼的位置。', 'milestone');
        c.add({ soc: 2 });
      } else if (!c.did('rejected') && c.chance(0.3)) {
        c.log('你把书稿投给了几家出版社，都石沉大海。');
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
      if (c.chance(0.4)) (c.log('你买的股票翻了一倍，你赶紧卖了。'), c.add({ mny: 4 }));
      else (c.log('你买的股票跌了一半。你决定「长期持有」。'), c.add({ mny: -4 }), c.mark('m:stock-lost'));
    },
  },
  { id: 'dancing', from: 53, to: 85, if: (c) => c.has('dance'), text: '你成了广场舞队的领舞，每天晚上七点准时出现。', fx: { soc: 1, str: 1 } },
  { id: 'heart', from: 40, to: 99, fixed: true, if: (c) => c.last && c.last.age === c.age && c.last.age >= 30 && !c.did('heart'), k: 'deja', text: '这一年你总觉得心里发慌——好像上一稿，就是在这个年纪停下的。' },
  { id: 'video', from: 60, to: 85, if: (c) => c.has('kid'), text: '你学会了用手机视频，每天给孩子打三个电话。孩子开始假装信号不好。', fx: { soc: 1 } },
  { id: 'chess', from: 60, to: 90, text: '你在公园里下象棋，一坐就是一下午。', fx: { kno: 1 } },
  { id: 'keys', from: 65, to: 95, text: '你开始忘事，钥匙经常找不着，最后发现在自己手里。', fx: { kno: -1 } },
  { id: 'fall', from: 65, to: 95, if: (c) => c.trait !== 'careful', text: '你在浴室里摔了一跤，在床上躺了两个月。', fx: { str: -2 } },
  { id: 'funerals', from: 70, to: 95, text: '老伙计们一个个走了。这几年，你参加的葬礼比婚礼多。', fx: { soc: -1 } },
  { id: 'calligraphy', from: 60, to: 85, text: '你报了老年大学的书法班，字写得比年轻时还好。', fx: { kno: 1 } },
  { id: 'garden', from: 60, to: 85, text: '你在小区的空地上种了一片菜，邻居们都来讨。', fx: { soc: 1, str: 1 } },
  { id: 'students', from: 62, to: 90, if: (c) => c.has('teacher'), text: '你教过的学生来看你，一屋子都坐不下。', fx: { soc: 2 } },
  { id: 'fishfriend', from: 60, to: 90, if: (c) => c.has('bestie'), text: '你和老朋友约着去钓鱼，一条没钓到，聊了一整天。', fx: { soc: 1 } },
  { id: 'photo', from: 70, to: 95, text: '你去照相馆给自己拍了张照片，说以后用得上。家里人骂你不吉利。' },
  { id: 'tvhome', from: 65, to: 95, text: '你在电视上看见了你小时候住过的地方，已经认不出来了。' },
  { id: 'hillback', from: 60, to: 90, if: (c) => c.has('hill'), text: '你回了一趟山里。那条你走了六年的山路，已经修成了柏油路。', fx: { soc: 1 } },
  { id: 'dock', from: 60, to: 90, if: (c) => c.has('sea'), text: '你坐在码头上看了一下午的海，想起了你爸。' },
  { id: 'dejaold', from: 60, to: 90, if: (c) => c.has('deja'), k: 'deja', text: '你有时候会想：如果再来一次，你会怎么选？然后你笑了，好像已经来过很多次了。' },
  { id: 'shopping-online', from: 60, to: 85, text: '你学会了网购，快递天天上门，邻居以为你在做生意。' },
  { id: 'choir', from: 60, to: 85, text: '你被拉进了小区合唱团，站在第二排，嗓门最大。', fx: { soc: 1 } },
  { id: 'taichi', from: 60, to: 88, text: '你每天早上去公园打太极，一招一式慢慢悠悠。', fx: { str: 1 } },
  { id: 'olddiary', from: 62, to: 90, text: '你翻出了年轻时的日记本，看着看着笑出了声。' },
  { id: 'readers', from: 60, to: 80, text: '你戴上了老花镜，把手机字体调到了最大。' },
  { id: 'haggle', from: 60, to: 88, text: '你在菜市场为了五毛钱跟摊主聊了二十分钟，最后成了朋友。', fx: { soc: 1 } },
  { id: 'cataract', from: 68, to: 92, text: '你做了个白内障手术。摘下纱布那天，世界一下子清楚了。' },
  { id: 'goldfish', from: 62, to: 90, text: '你养了一缸金鱼，每天早上数一遍。' },
  { id: 'tales', from: 62, to: 95, if: (c) => c.has('grandkid'), text: '你给孙辈讲你年轻时的事，讲着讲着自己都不太信了。', fx: { soc: 1 } },
  { id: 'demolish', from: 60, to: 88, text: '你住过的老房子要拆了。你回去拍了很多照片。' },
  { id: 'clips', from: 62, to: 85, text: '你学会了拍短视频，攒了三百个粉丝，每条都有人点赞。', fx: { soc: 1 } },
  { id: 'winter', from: 70, to: 100, text: '冬天你病了一场。好了以后，走路慢了很多。', fx: { str: -1 } },
  { id: 'classmates', from: 65, to: 90, text: '你去参加同学聚会，来的人比上次少了一半。大家都说：下次还来。' },
  { id: 'quilt', from: 60, to: 100, text: '你在阳台上晒了一下午被子，晚上睡得特别香。' },
  { id: 'weekday', from: 80, to: 105, text: '你开始分不清今天是星期几，可每个孩子的生日都记得。' },
  { id: 'nap', from: 82, to: 110, text: '你常常在午后打盹，梦见很年轻时候的自己。' },
  { id: 'tooth', from: 75, to: 100, text: '你掉了一颗牙。你说正好，省得嚼硬的。' },
  { id: 'candles', from: 88, to: 110, text: '过生日时，你吹了三次才把蜡烛吹灭，全家人一起鼓掌。', fx: { soc: 1 } },
  { id: 'doorway', from: 85, to: 110, text: '你坐在门口看人来人往。谁跟你打招呼，你都笑。' },
  { id: 'familyphoto', from: 90, to: 110, if: (c) => c.has('kid'), text: '你看着墙上的全家福，一个一个叫出了名字。全家人都很高兴。', fx: { soc: 1 } },
  { id: 'halfbowl', from: 90, to: 110, text: '你每顿只吃半碗饭，但每顿都说好吃。' },
  { id: 'interview', from: 95, to: 115, text: '有记者来问你长寿的秘诀。你想了想，说：心大。', fx: { soc: 1 } },
  { id: 'eldest', from: 92, to: 110, if: (c) => c.age >= 92, text: '你成了小区里年纪最大的人，社区每年都来给你过生日。', fx: { soc: 1 } },
  { id: 'memory', from: 88, to: 110, text: '你的记性时好时坏，可小时候的事记得清清楚楚。' },
  { id: 'century', from: 100, fixed: true, k: 'milestone', text: '你过了一百岁生日。蛋糕上的蜡烛插不下，干脆插了一个「100」。', fx: { soc: 1 } },
];

// ---- 路口 ----
export const CHOICES = [
  {
    id: 'hobby',
    age: 8,
    text: '放暑假了，爸妈问你想报什么班。',
    options: [
      { key: 'art', text: '学画画', fx: { kno: 1 }, do: (c) => c.log('你在画室里待了一个夏天，衣服上全是颜料。') },
      { key: 'math', text: '学奥数', fx: { kno: 2, soc: -1 }, do: (c) => c.log('你开始做比你个头还高的习题册。') },
      { key: 'music', text: '学钢琴', if: (c) => c.mny >= 4, fx: { kno: 1, mny: -1 }, do: (c) => c.log('你开始学钢琴。邻居开始学着关窗。') },
      { key: 'wild', text: '什么都不报，出去野', fx: { str: 2, soc: 1 }, do: (c) => c.log('你漫山遍野地跑了一个夏天，晒得像块炭。') },
    ],
  },
  {
    id: 'school12',
    age: 12,
    text: '小学毕业了。市里的寄宿中学来招生。',
    options: [
      {
        key: 'board',
        text: '去考寄宿中学',
        hint: '学识越高越容易考上',
        do: (c) => {
          if (c.chance(0.2 + c.kno * 0.06)) (c.flag('boarding'), c.add({ kno: 2, soc: -1 }), c.log('你考上了，从此每周背一大包换洗衣服回家。'));
          else (c.log('你没考上，留在了家门口的中学。'), c.add({ soc: 1 }));
        },
      },
      { key: 'local', text: '留在家门口上学', fx: { soc: 1 }, do: (c) => c.log('你和小学同学一起升进了同一所中学。') },
    ],
  },
  {
    id: 'zhongkao',
    age: 15,
    text: '中考快到了，老师找你谈话。',
    options: [
      {
        key: 'push',
        text: '拼一把，考高中',
        hint: '学识越高越稳',
        do: (c) => {
          if (c.chance(0.25 + c.kno * 0.06 + (c.trait === 'stubborn' ? 0.1 : 0))) (c.flag('high'), c.add({ kno: 1 }), c.log('你考上了高中。'));
          else (c.flag('vocational'), c.log('你差了几分，最后去了职校。'));
        },
      },
      { key: 'craft', text: '读职校，学门手艺', set: ['vocational'], fx: { str: 1 }, do: (c) => c.log(`你选了${c.pick(['汽修', '烹饪', '电工'])}专业，第一节课就弄了一手油。`) },
      { key: 'work', text: '不读了，出去挣钱', if: (c) => c.trait === 'bold' || c.mny <= 3 || c.has('sea'), set: ['work'], fx: { mny: 1, kno: -1 }, do: (c) => c.log('你收拾了一个包，跟家里说：我想早点挣钱。') },
    ],
  },
  {
    id: 'crush',
    age: 16,
    if: (c) => c.has('high') || c.has('vocational'),
    text: '你发现自己总在偷看同桌。',
    options: [
      {
        key: 'note',
        text: '递一张纸条',
        do: (c) => {
          if (c.chance(0.3 + c.soc * 0.05)) (c.flag('firstlove'), c.add({ soc: 1 }), c.log('同桌回了一张纸条：「放学一起走？」'));
          else (c.add({ soc: -1 }), c.log('纸条被老师截了，当着全班念了出来。'));
        },
      },
      { key: 'study', text: '把心思放在学习上', fx: { kno: 1 }, do: (c) => c.log('你把心事压进了错题本里。') },
      {
        key: 'friend',
        text: '做朋友就好',
        fx: { soc: 1 },
        do: (c) => {
          c.log('你们成了无话不谈的朋友。');
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
      { key: 'med', text: '学医', if: (c) => c.has('gk-top'), set: ['college', 'med'], do: (c) => c.log('你被一所医科大学录取了。五年本科，你爸说：值。') },
      { key: 'cs', text: '学计算机', if: (c) => !c.has('gk-low'), set: ['college', 'cs'], do: (c) => c.log('你被计算机专业录取了。亲戚们开始找你修电脑。') },
      { key: 'normal', text: '读师范', if: (c) => !c.has('gk-low'), set: ['college', 'normal'], do: (c) => c.log('你去了一所师范大学。') },
      { key: 'arts', text: '考美院', if: (c) => c.chose('hobby', 'art') && !c.has('gk-low'), set: ['college', 'arts'], do: (c) => c.log('你考进了美院，背着画板去报到。') },
      { key: 'plain', text: '随便读个大学', set: ['college', 'plain'], do: (c) => c.log(c.has('gk-low') ? '你去了一所专科学校。' : '你去了一所普通大学，读了一个调剂来的专业。') },
      { key: 'repeat', text: '复读一年', if: (c) => !c.has('gk-top'), set: ['repeat'], fx: { kno: 2, str: -1 }, do: (c) => c.log('你回到了高三的教室，坐在最后一排。') },
      { key: 'job', text: '不读了，去工作', if: (c) => c.has('gk-low'), set: ['work'], fx: { mny: 1 }, do: (c) => c.log('你把录取通知书收进了抽屉，去城里找工作。') },
    ],
  },
  {
    id: 'gaokao2',
    age: 19,
    if: (c) => c.has('repeat') && !c.has('college') && !c.has('work'),
    text: '复读结束，再填一次志愿。',
    options: [
      { key: 'med', text: '学医', if: (c) => c.has('gk-top'), set: ['college', 'med'], do: (c) => c.log('你被一所医科大学录取了。') },
      { key: 'cs', text: '学计算机', if: (c) => !c.has('gk-low'), set: ['college', 'cs'], do: (c) => c.log('你被计算机专业录取了。') },
      { key: 'normal', text: '读师范', if: (c) => !c.has('gk-low'), set: ['college', 'normal'], do: (c) => c.log('你去了一所师范大学。') },
      { key: 'plain', text: '随便读个大学', set: ['college', 'plain'], do: (c) => c.log('你去了一所普通大学。') },
      { key: 'job', text: '不读了，去工作', set: ['work'], fx: { mny: 1 }, do: (c) => c.log('你决定不再耗下去了，去城里找工作。') },
    ],
  },
  {
    id: 'graduate',
    age: 22,
    to: 23,
    if: (c) => c.has('college') && c.since('college') >= 4 && !c.has('job'),
    text: '大学毕业了，下一步去哪儿？',
    options: [
      {
        key: 'civil',
        text: '回老家考编',
        hint: '学识越高越容易考上',
        do: (c) => {
          c.flag('job');
          if (c.chance(0.35 + c.kno * 0.03)) {
            c.flag('civil');
            if (c.has('normal')) (c.flag('teacher'), c.log('你考上了县一中的老师。'));
            else if (c.has('med')) (c.flag('doctor'), c.log('你考进了县医院，成了一名医生。'));
            else c.log('你考进了县里的单位，工作是写材料。');
          } else {
            c.flag('office');
            c.log('你考了两年没考上，最后在老家找了份工作。');
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
          if (c.has('cs')) (c.flag('coder'), c.log('你进了一家互联网公司，工位上贴着你的名字。'), c.add({ mny: 2 }));
          else if (c.has('med')) (c.flag('doctor'), c.log('你进了一家大医院规培，每天睡四个小时。'));
          else if (c.has('normal')) (c.flag('teacher'), c.log('你在一所私立学校当了老师。'));
          else if (c.has('arts')) (c.flag('artist'), c.log('你在一家设计公司画图，偶尔接点私活。'));
          else (c.flag('office'), c.log('你在一栋写字楼里找了份工作，每天打卡。'));
        },
      },
      { key: 'master', text: '读研', if: (c) => c.kno >= 10, set: ['grad'], fx: { kno: 2, mny: -1 }, do: (c) => c.log('你考上了研究生，又背起了书包。') },
      { key: 'abroad', text: '出国留学', if: (c) => c.mny >= 7, set: ['abroad'], fx: { kno: 2, mny: -4 }, do: (c) => c.log('你拖着两个大箱子上了飞机。') },
    ],
  },
  {
    id: 'love',
    age: 25,
    to: 29,
    if: (c) => !c.has('dating') && !c.has('married') && !c.has('expat'),
    text: '过年回家，亲戚们开始问你有没有对象。',
    options: [
      {
        key: 'blind',
        text: '去相亲',
        do: (c) => {
          if (c.chance(0.35 + c.soc * 0.04)) (c.flag('dating'), c.log('第三次相亲，对面的人和你点了同一道菜。你们都笑了。'));
          else (c.log('你相了八次亲，每次都在想什么时候能回家。'), c.add({ soc: -1 }));
        },
      },
      {
        key: 'first',
        text: '联系初恋',
        if: (c) => c.has('firstlove'),
        do: (c) => {
          if (c.chance(0.5)) (c.flag('dating'), c.log('你鼓起勇气发了条消息。对方回：「我也一直在想你。」'));
          else (c.log('对方已经结婚了，还给你发了喜糖的照片。'), c.add({ soc: -1 }));
        },
      },
      { key: 'wait', text: '等一个对的人', do: (c) => c.log('你说：缘分到了自然会来。你妈叹了口气。') },
      { key: 'alone', text: '一个人也挺好', set: ['single'], fx: { mny: 1 }, do: (c) => c.log('你说你一个人挺好的。这是真心话。') },
    ],
  },
  {
    id: 'marry',
    age: 26,
    to: 40,
    if: (c) => c.has('dating') && !c.has('married') && c.since('dating') >= 2,
    text: '你们在一起好几年了。',
    options: [
      { key: 'yes', text: '结婚', set: ['married'], fx: { soc: 1, mny: -2 }, do: (c) => (c.unflag('dating'), c.log('你们办了婚礼。敬酒敬到第十桌，你已经不认识人了。')) },
      {
        key: 'wait',
        text: '再等等',
        do: (c) => {
          if (c.chance(0.5)) (c.unflag('dating'), c.log('等着等着，你们就散了。'), c.add({ soc: -1 }));
          else (c.flag('married'), c.unflag('dating'), c.log('又过了一年，对方说：「别等了。」你们领了证。'));
        },
      },
    ],
  },
  {
    id: 'career',
    age: 30,
    to: 31,
    if: (c) => job(c) && !c.has('civil') && !c.has('teacher') && !c.has('doctor') && !c.has('fisher') && !c.has('shop'),
    text: '工作好几年了，你有点倦了。',
    options: [
      { key: 'startup', text: '辞职创业', hint: '有风险', if: (c) => c.trait === 'bold' || c.mny >= 6 || c.has('coder'), set: ['startup'], fx: { mny: -3 }, do: (c) => c.log('你递了辞呈，拉上两个朋友，在城郊租了间办公室。') },
      { key: 'side', text: '先做副业试试', new: true, if: (c) => c.seen('m:bankrupt'), set: ['side'], do: (c) => c.log('上一稿全押上赔光了。这一次你白天上班，晚上做自己的事。', 'deja') },
      { key: 'shop', text: '辞职开一家小店', if: (c) => c.mny >= 6 || (c.mny >= 4 && c.trait === 'bold'), set: ['shop'], fx: { mny: -3 }, do: (c) => (c.unflag('coder', 'office', 'worker', 'artist'), c.log('你辞了职，在老街上租了个门面，自己当老板。')) },
      { key: 'stay', text: '稳稳当当干下去', fx: { mny: 1 }, do: (c) => c.log('你告诉自己：稳定也是一种本事。') },
      { key: 'hop', text: '跳槽涨工资', fx: { mny: 2, soc: -1 }, do: (c) => c.log('你跳槽了，工资涨了三成，加班也涨了三成。') },
    ],
  },
  {
    id: 'kids',
    age: 31,
    to: 38,
    if: (c) => c.has('married') && !c.has('kidplan') && !c.chose('kids'),
    text: '家里人开始问：什么时候要孩子？',
    options: [
      { key: 'one', text: '要一个', set: ['kidplan'], do: (c) => c.log('你们开始准备了。') },
      { key: 'two', text: '要两个', if: (c) => c.mny >= 7, set: ['kidplan'], fx: { mny: -2 }, do: (c) => c.log('你们说：要就要两个，彼此有个伴。') },
      { key: 'no', text: '不要了', fx: { mny: 2 }, do: (c) => c.log('你们决定过二人世界。') },
      { key: 'cat', text: '先养只猫', set: ['cat'], do: (c) => c.log('你们抱回了一只猫，它第一天就占领了沙发。') },
    ],
  },
  {
    id: 'pet',
    age: 35,
    to: 37,
    if: (c) => !c.has('married') && !c.has('cat'),
    text: '一个人住久了，屋里有点安静。',
    options: [
      { key: 'cat', text: '养只猫', set: ['cat'], fx: { soc: 1 }, do: (c) => c.log('你从救助站抱回一只橘猫。它很快胖成了球。') },
      { key: 'dog', text: '养条狗', set: ['dog'], fx: { str: 1 }, do: (c) => c.log('你养了一条狗，从此每天早晚出门遛两次。') },
      { key: 'none', text: '安静也挺好', do: (c) => c.log('你喜欢这份安静。') },
    ],
  },
  {
    id: 'layoff',
    age: 35,
    to: 36,
    if: (c) => c.has('bigcity') && (c.has('coder') || c.has('office')) && !c.has('boss') && !c.has('startup') && !c.has('shop') && c.chance(0.4),
    text: '公司裁员，名单上有你的名字。',
    options: [
      {
        key: 'exam',
        text: '考公务员',
        hint: '学识越高越容易考上',
        do: (c) => {
          if (c.chance(0.2 + c.kno * 0.03)) (c.flag('civil'), c.unflag('coder', 'office'), c.log('你上岸了，从此朝九晚五。'));
          else (c.log('你考了两年，没考上，又回了另一家公司。'), c.add({ mny: -1 }));
        },
      },
      { key: 'shop', text: '开一家小店', if: (c) => c.mny >= 5, set: ['shop'], fx: { mny: -3 }, do: (c) => (c.unflag('coder', 'office'), c.log('你拿着赔偿金盘下一个小铺面，开了一家小店。')) },
      { key: 'gig', text: '先送外卖过渡', set: ['gig'], fx: { str: 1 }, do: (c) => c.log('你买了辆电动车，开始在城市里穿梭。') },
      { key: 'home', text: '回老家', set: ['back'], fx: { soc: 1 }, do: (c) => (c.unflag('bigcity'), c.log('你退了租，回了老家。')) },
    ],
  },
  {
    id: 'house',
    age: 38,
    to: 42,
    if: (c) => !c.has('house') && c.mny >= 5 && !c.has('expat'),
    text: '房价又涨了，你看中了一套房子。',
    options: [
      { key: 'cash', text: '全款买下', if: (c) => c.mny >= 14, set: ['house'], fx: { mny: -8 }, do: (c) => c.log('你签完字，突然觉得踏实了。') },
      { key: 'loan', text: '贷款买', set: ['house', 'mortgage'], fx: { mny: -3 }, do: (c) => c.log('你背上了三十年的房贷。') },
      { key: 'rent', text: '继续租着', fx: { mny: 1 }, do: (c) => c.log('你说：房子是用来住的，租的也能住。') },
    ],
  },
  {
    id: 'checkup',
    age: 45,
    text: '体检报告上多了几个向上的箭头。',
    options: [
      { key: 'run', text: '开始锻炼', set: ['exercise'], fx: { str: 1 }, do: (c) => c.log('你买了一双跑鞋，第二天腿疼得下不了楼。') },
      { key: 'ignore', text: '没事，还年轻', do: (c) => c.log('你把报告塞进了抽屉。') },
      { key: 'slow', text: '辞掉加班的活', new: true, if: (c) => c.seen('end:overwork') && job(c), set: ['exercise'], fx: { str: 2, mny: -2 }, do: (c) => (c.log('上一稿累垮过一次。这一次，你选择慢下来。', 'deja'), c.inc('ot', -c.count('ot'))) },
    ],
  },
  {
    id: 'parents',
    age: 50,
    text: '爸妈老了，身体大不如前。',
    options: [
      { key: 'back', text: '回去照顾', set: ['back'], fx: { soc: 1, mny: -2 }, do: (c) => c.log('你每周开三个小时车回去，陪他们吃顿饭。') },
      { key: 'nurse', text: '请个护工', fx: { mny: -3 }, do: (c) => c.log('你请了护工，每天晚上打一个视频电话。') },
      { key: 'live', text: '接过来一起住', if: (c) => c.has('house'), fx: { soc: 1, str: -1 }, do: (c) => c.log('你把他们接到身边。家里热闹了，也挤了。') },
    ],
  },
  {
    id: 'pastime',
    age: 53,
    text: '日子闲了下来，你想找点事做。',
    options: [
      { key: 'write', text: '写点东西', if: (c) => c.kno >= 7, set: ['writing'], fx: { kno: 1 }, do: (c) => c.log('你买了一个厚厚的本子，写下了第一行字。') },
      { key: 'run', text: '练长跑', if: (c) => c.str >= 5 || c.has('exercise'), set: ['runner', 'exercise'], fx: { str: 1 }, do: (c) => c.log('你报了一个跑团，每周跑三次。') },
      { key: 'stock', text: '炒股', set: ['stock'], fx: { mny: -1 }, do: (c) => c.log('你开了个股票账户，每天盯着红红绿绿的线。') },
      { key: 'safe', text: '炒股，见好就收', new: true, if: (c) => c.seen('m:stock-lost'), fx: { mny: 2 }, do: (c) => c.log('上一稿在股市里亏过。这一次你小赚一笔就收手了。', 'deja') },
      { key: 'dance', text: '跳广场舞', set: ['dance'], fx: { soc: 2, str: 1 }, do: (c) => c.log('你在楼下的广场上找到了组织。') },
    ],
  },
  {
    id: 'retire',
    age: 60,
    if: (c) => !c.has('retired'),
    text: '你退休了。接下来的日子怎么过？',
    options: [
      {
        key: 'travel',
        text: '出去走走',
        if: (c) => c.mny >= 5,
        do: (c) => {
          if (c.mny >= 9) (c.flag('aurora'), c.add({ mny: -4, soc: 1 }), c.log('你去了很远的北方。夜里，天空亮起了绿色的光，在头顶慢慢流动。', 'milestone'));
          else (c.add({ mny: -2 }), c.log('你去了一趟南方的海边，晒黑了一圈。'));
        },
      },
      { key: 'family', text: '多陪陪家人', if: (c) => c.has('kid'), fx: { soc: 2 }, do: (c) => c.log('你学会了做孩子爱吃的菜，每个周末等他们回来。') },
      { key: 'home', text: '回老家盖房', if: (c) => c.mny >= 10, set: ['homehouse', 'back'], fx: { mny: -6, str: 1 }, do: (c) => c.log('你在老家盖了一栋两层小楼，院子里种了棵枣树。', 'milestone') },
      { key: 'rehire', text: '返聘回去接着干', if: (c) => c.has('teacher') || c.has('doctor'), fx: { mny: 2, str: -1 }, do: (c) => c.log('学校（医院）离不开你，你又回去了。') },
      { key: 'rest', text: '在家歇着', fx: { str: 1 }, do: (c) => c.log('你终于可以睡到自然醒了。') },
    ],
  },
  {
    id: 'will',
    age: 80,
    to: 85,
    if: (c) => c.mny >= 6,
    text: '你开始想身后事。存下的钱怎么办？',
    options: [
      { key: 'donate', text: '捐给山里的学校', set: ['donor'], fx: { soc: 3 }, do: (c) => (c.set('mny', 1), c.log('你把钱捐给了山里的学校。校长寄来一张照片：新教室的门口挂着你的名字。', 'milestone')) },
      { key: 'kids', text: '留给孩子', if: (c) => c.has('kid'), fx: { soc: 1 }, do: (c) => c.log('你立好了遗嘱，心里一块石头落了地。') },
      {
        key: 'spend',
        text: '趁还走得动，花掉',
        fx: { mny: -4, str: -1 },
        do: (c) => {
          if (!c.has('aurora') && c.chance(0.5)) (c.flag('aurora'), c.log('你报了一个旅行团，在极北的夜空下看见了极光。导游说你是团里年纪最大的。', 'milestone'));
          else c.log('你坐邮轮绕了半个地球，在甲板上看了很多次日落。');
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
  { key: 'perfect', name: '定稿', desc: '这一稿，不改了。', hint: '心愿了了，各方面都到过很高的地方，活到七十岁以上。', pts: 120, test: (c) => c.wishDone && c.age >= 70 && ['str', 'kno', 'soc', 'mny'].every((k) => p(c)[k] >= 13) },
  { key: 'hundred', name: '百岁人瑞', desc: '你活过了一百岁，见过了一整个世纪的变化。', hint: '活得足够久。', pts: 60, test: (c) => c.age >= 100 },
  { key: 'overwork', name: '劳碌命', desc: '你一辈子都在忙，还没来得及歇一歇。', hint: '忙得停不下来。', pts: 0, test: (c) => c.dead?.cause === 'overwork' },
  { key: 'young', name: '英年早逝', desc: '故事还没写完，就停了笔。', hint: '走得太早。', pts: 0, test: (c) => c.age < 40 },
  { key: 'donor', name: '散尽家财', desc: '你把钱都捐了出去。有一间教室，用了你的名字。', hint: '晚年把积蓄捐出去。', pts: 40, test: (c) => c.has('donor') },
  { key: 'author', name: '著书立说', desc: '你的名字印在了书脊上，会比你活得更久。', hint: '晚年拿起笔。', pts: 40, test: (c) => c.has('book') },
  { key: 'tycoon', name: '富甲一方', desc: '你的钱多到数不清，但你还记得第一次挣钱的样子。', hint: '创业，而且成功。', pts: 40, test: (c) => p(c).mny >= 18 },
  { key: 'bankrupt', name: '从头再来', desc: '你赔光过一切，又一点一点站了起来。', hint: '创业失败过。', pts: 10, test: (c) => c.has('bankrupt') },
  { key: 'aurora', name: '天空在跳舞', desc: '你在世界的北边，看见了天空在跳舞。', hint: '攒够钱，出一趟远门。', pts: 30, test: (c) => c.has('aurora') },
  { key: 'runner', name: '跑完全程', desc: '冲过终点线的那一刻，你觉得自己还很年轻。', hint: '中年以后开始跑步。', pts: 30, test: (c) => c.has('marathon') },
  { key: 'home', name: '落叶归根', desc: '你回到出发的地方，在自己盖的房子里看了很多次日落。', hint: '回老家盖一栋房子。', pts: 30, test: (c) => c.has('homehouse') },
  { key: 'family', name: '四世同堂', desc: '过年时，一大家子坐满了三张桌子。', hint: '成家，然后活得足够久。', pts: 30, test: (c) => c.has('grandkid') && c.age >= 80 },
  { key: 'teacher', name: '桃李满天下', desc: '你教过的学生遍布各地，逢年过节电话响个不停。', hint: '站上讲台，站很多年。', pts: 30, test: (c) => c.has('teacher') && c.count('teach') >= 4 },
  { key: 'doctor', name: '悬壶济世', desc: '你救过很多人，也送走过很多人。', hint: '学医，然后一直干下去。', pts: 30, test: (c) => c.has('doctor') && c.age >= 55 },
  { key: 'artist', name: '画里画外', desc: '你画了一辈子。有的画卖了，有的留着。', hint: '从小学画，一直画下去。', pts: 20, test: (c) => c.has('artist') },
  { key: 'expat', name: '异乡人', desc: '你在异国生活了大半辈子，说梦话时还是家乡话。', hint: '出国，然后留下来。', pts: 20, test: (c) => c.has('expat') },
  { key: 'sea', name: '海的孩子', desc: '你生在海边，在海上过了一辈子。', hint: '出生在海边，并留在那里。', pts: 20, test: (c) => c.has('fisher') },
  { key: 'coder', name: '代码人生', desc: '你写过的代码，至今还在某台服务器上跑着。', hint: '学计算机，去大城市。', pts: 10, test: (c) => c.has('coder') },
  { key: 'civil', name: '铁饭碗', desc: '你在单位里安安稳稳干到退休，日子像一杯温水。', hint: '回老家考编。', pts: 10, test: (c) => c.has('civil') && c.age >= 60 },
  { key: 'shop', name: '街角小店', desc: '你的小店开了很多年，成了街坊们记忆的一部分。', hint: '开一家自己的店。', pts: 20, test: (c) => c.has('shop') },
  { key: 'iron', name: '铁打的身子', desc: '你一辈子没进过几次医院。', hint: '体魄极好，又活得够久。', pts: 20, test: (c) => p(c).str >= 15 && c.age >= 80 },
  { key: 'cat', name: '猫的仆人', desc: '你和你的猫相依为命。它比你更像这个家的主人。', hint: '一个人，养只猫。', pts: 10, test: (c) => c.has('cat') && !c.has('married') },
  { key: 'peaceful', name: '寿终正寝', desc: '你在一个安静的午后睡着了，没有再醒来。', hint: '平平安安活到老。', pts: 10, test: (c) => c.age >= 88 },
  { key: 'scholar', name: '学富五车', desc: '你读过的书，能堆满一间屋子。', hint: '学识极高。', pts: 20, test: (c) => p(c).kno >= 18 },
  { key: 'friends', name: '朋友遍天下', desc: '你走的那天，来送你的人站满了一条街。', hint: '人缘极好。', pts: 20, test: (c) => p(c).soc >= 18 },
  { key: 'ordinary', name: '平凡的一生', desc: '你过完了普通的一生。普通，也很好。', hint: '怎么都能拿到。', pts: 0, test: () => true },
];
