// 弹珠台「星际远航」: 台面、物理、规则 (3D 画面在 pinball3d.js, 页面在 views/pinball.js)。不碰网页, 能在测试里跑。
//   台面 600 × 1000 「点」, x 往右、y 往下, z 是离台面多高 (坡道上)。球直径 22 点 = 真球 27 毫米, 所以 1 点 ≈ 1.23 毫米
//   物理 (照着 Visual Pinball 的做法, 自己写的):
//     - 台面斜 6.5° (真机的坡度), 重力按真的算。球是滚的: 滚着的时候往下的加速度只有滑的时候的 5/7
//     - 球有转: 被打出去先是滑, 台面的摩擦让它转起来变成滚; 撞墙、撞橡皮的时候摩擦让它绕竖轴转, 转着的球再撞东西方向会偏
//     - 碰撞按冲量算: 弹性跟材料有关 (金属、橡皮、塑料), 撞得越狠弹得越少 (橡皮尤其)
//     - 挡板有重量: 按下是线圈推着加速 (越到后面越快, 什么时候碰到球打出去不一样), 球撞上来挡板也会被撞慢、弹一下;
//       按住的时候是小一点的保持力, 松开是弹簧拉回去
//     - 每 1/1000 秒走一步 (球一步最多走 4 点, 挡板尖一步最多走 6 点, 都比球的半径小, 穿不过去)
//   坡道: 球从入口冲上去就离开台面, 沿着坡道的路线滚 (上坡减速、下坡加速), 冲不上去就滚回来; 下来落进回球道
//
// 故事: 殖民方舟「远航号」载着十万名在冬眠舱里睡着的人, 去找一颗能住的星球。你是新来的舰长。
//   四个星系是四章 (CHAPTERS), 每章三个限时任务, 都做完了来一场危机 (大敌人, 有血条, 两个球一起打);
//   渡过危机跃迁到下一个星系。四章都过了, 打进黑洞「着陆曙光星」(终极模式, 四个球), 着陆了再出发 (分数更高)
//
// 玩法:
//   发射: 顶上三条「再入」通道有一条在闪, 一发射就落进那条 → 技巧射击; 三条都亮 → 奖励倍数 +1 (按挡板挪亮着的灯)
//   任务: 右边三个任务靶都打亮 → 打进黑洞选任务 (按挡板换), 任务开着的时候要打的路线亮箭头; 时间到了没做完先停下, 做到哪留着, 下次接着做
//   连击: 坡道、轨道、黑洞几秒内接着打中
//   曲速坡道 (左边): 打上去一次曲速 +1, 到 5 级「跃迁」大奖; 对接坡道 (中间, 铁丝的): 打上去两次锁球灯亮,
//   锁满两个球「穿梭机出动」三个球, 两条坡道都是超级大奖
//   黑洞: 没别的事的时候是补给舱 (随机奖励); 星座: 五个掉落靶都打倒 → 救生舱亮
//   护盾: 每个球开始 10 秒内掉了救回来; 撞台子 (N 键 / 按钮) 能把球撞开, 撞太多倾斜, 这个球挡板不动、不算分
//   队员 (CREW): 远航模式开局选一个队员, 各有本事, 等级跨局累积 (存在页面那边); 经典模式没有队员, 比分数公平

export const W = 600;
export const H = 1000;
export const BALL_R = 11;
export const BALLS = 3;
const STEP = 1 / 1000;
const MAX_STEPS = 40; // 一帧最多走几步 (卡了一下的话宁可慢一点, 别一下子算太多)
const MM = 27 / 22; // 1 点几毫米
const G = 9810 / MM; // 真的重力, 点 / 秒²
const SLOPE = (6.5 * Math.PI) / 180;
export const GRAVITY = G * Math.sin(SLOPE); // 沿着台面往下 (约 905)
const G_N = G * Math.cos(SLOPE); // 压着台面的那一份 (摩擦用)
const MU_TABLE = 0.06; // 球在台面上滑的摩擦
const ROLL_RES = 0.002; // 滚动阻力
const BALL_I = 0.4; // 实心球的转动惯量 = 0.4 × 质量 × 半径² (质量算 1)
const MAX_SPEED = 4200;
// 挡板: 转动惯量 (相当于挡板尖上有一个球那么重)、线圈的力矩、按住时的保持力矩、弹簧拉回的力矩, 撞到头弹回来多少
const FLIP = { inertia: 85 * 85, coil: 9.5e6, hold: 2.2e6, ret: 3.2e6, max: 75, bounceUp: 0.12, bounceRest: 0.15, eos: 0.04 };
// 材料: 弹性 e、撞得越狠弹得越少 fall (每 1000 点/秒的冲击)、摩擦 mu;
// damp: 橡皮贴着滚的时候会变形吃掉一点 (每秒吃掉几成), 托在挡板上的球才停得下来
const METAL = { e: 0.4, fall: 0.1, mu: 0.15 };
const RUBBER = { e: 0.8, fall: 0.45, mu: 0.5, damp: 2 };
const PLASTIC = { e: 0.45, fall: 0.15, mu: 0.2 };
const FLIPPER_RUBBER = { e: 0.82, fall: 0.5, mu: 0.55, damp: 5 };
const BUMPER = { e: 0.6, fall: 0.3, mu: 0.3 };
const RAMP_DRAG = 0.2; // 坡道 (塑料、铁丝) 上的摩擦
const SAVE_TIME = 10;
const PULL_TIME = 0.9; // 弹簧拉满要几秒
export const LANE_X = 540; // 发射通道在这右边

// ---- 故事 ----
export const STORY = {
  intro: [
    '公元 2387 年, 殖民方舟「远航号」载着十万名在冬眠舱里睡着的人出发, 去找一颗能住的星球。',
    '你是新来的舰长。穿过四个星系, 完成任务、渡过危机, 带大家抵达新家园「曙光星」。',
  ],
  ending: '十万名乘客在曙光星上醒来了! 远航号又出发, 去找下一颗星球',
};

// 能「亮」的路线 (任务、危机、终章要打的), 还有别的算数的东西
export const SHOTS = ['ramp', 'center', 'orbit', 'spinner', 'hole', 'drops', 'targets'];
export const SHOT_NAMES = { ramp: '曲速坡道', center: '对接坡道', orbit: '环绕轨道', spinner: '推进器', hole: '黑洞', drops: '星座靶', targets: '任务靶', bumpers: '小行星', slings: '弹弓', lanes: '顶上通道', combo: '连击' };
const MAJOR = new Set(['ramp', 'center', 'orbit', 'hole']); // 算连击的

// 任务: steps 一步一步 (每步打哪些、几下), each 亮着的路线各打一次, hurry 分数从这么多往下掉 (越快打中越多)
const mission = (name, goal, time, rule) => ({ name, goal, time, ...rule });
export const CHAPTERS = [
  {
    name: '柯伊伯带',
    intro: '远航号离开太阳系, 穿过冰冷的柯伊伯带',
    missions: [
      mission('采冰补水', '打小行星 12 下', 50, { steps: [{ shots: ['bumpers'], need: 12 }] }),
      mission('校准星图', '亮着的三样各打一次', 60, { each: ['targets', 'drops', 'spinner'] }),
      mission('曲速试车', '打上坡道 1 次', 60, { steps: [{ shots: ['ramp'], need: 1 }] }),
    ],
    boss: { kind: 'comet', name: '巨型彗星', hp: 4, say: '一颗巨型彗星冲着远航号来了' },
  },
  {
    name: '比邻星',
    intro: '第一站: 离太阳最近的红色恒星',
    missions: [
      mission('扫描比邻 b', '打小行星 6 下让行星显出来, 再打中间的对接坡道扫描', 65, { steps: [{ shots: ['bumpers'], need: 6 }, { shots: ['center'], need: 1 }] }),
      mission('展开太阳帆', '打倒 5 个星座靶', 60, { steps: [{ shots: ['drops'], need: 5 }] }),
      mission('推进器加速', '推进器转 30 圈', 55, { steps: [{ shots: ['spinner'], need: 30 }] }),
    ],
    boss: { kind: 'flare', name: '恒星耀斑', hp: 5, say: '比邻星爆发了耀斑' },
  },
  {
    name: '翡翠星云',
    intro: '一片绿色的星云, 里面藏着信号',
    missions: [
      mission('星云采气', '绕环绕轨道 2 圈', 70, { steps: [{ shots: ['orbit'], need: 2 }] }),
      mission('冬眠舱故障', '分数一直在掉, 快打进黑洞修好', 45, { hurry: 400000, steps: [{ shots: ['hole'], need: 1 }] }),
      mission('寻找信号', '亮着的四样各打一次', 80, { each: ['ramp', 'center', 'spinner', 'drops'] }),
    ],
    boss: { kind: 'pirate', name: '星际海盗', hp: 6, say: '星际海盗盯上了远航号的货舱' },
  },
  {
    name: '深渊黑洞',
    intro: '曙光星就在黑洞另一边',
    missions: [
      mission('引力弹弓', '连击 2 次 (两条坡道、轨道、黑洞接着打)', 75, { steps: [{ shots: ['combo'], need: 2 }] }),
      mission('穿越小行星带', '打小行星和弹弓 20 下', 50, { steps: [{ shots: ['bumpers', 'slings'], need: 20 }] }),
      mission('穿越虫洞', '进黑洞 2 次', 70, { steps: [{ shots: ['hole'], need: 2 }] }),
    ],
    boss: { kind: 'void', name: '黑洞潮汐', hp: 7, say: '黑洞潮汐! 引力在把球往里拉', gravity: true },
  },
];
export const FINAL = { name: '着陆曙光星', lit: ['ramp', 'center', 'orbit', 'spinner', 'drops', 'targets'] };
export const CONSTELLATIONS = ['猎户座', '北斗七星', '天蝎座', '仙后座', '天鹅座', '狮子座'];
export const WARP_MAX = 5;

// ---- 队员 ----
//   unlock: 一共渡过几场危机以后加入 (页面那边记着); 等级 1–5, 经验够了升级
export const LEVEL_XP = [0, 100, 300, 700, 1500];
export const MAX_LEVEL = LEVEL_XP.length;
const medicSaves = (lv) => (lv >= 5 ? 3 : lv >= 3 ? 2 : 1);
const navMult = (lv) => 1 + (lv >= 2 ? 1 : 0) + (lv >= 5 ? 1 : 0);
export const CREW = [
  { id: 'pilot', name: '林舟', role: '驾驶员', mark: '舟', color: '#38e8ff', unlock: 0, skill: (lv) => `连击时间 +${(0.4 * lv).toFixed(1)} 秒, 连击分 +${20 * lv}%` },
  { id: 'engineer', name: '阿铁', role: '工程师', mark: '铁', color: '#ffb03d', unlock: 0, skill: (lv) => `护盾 +${2 * lv} 秒; 救生舱开局就亮${lv >= 3 ? ', 每个球都亮' : ''}` },
  { id: 'scientist', name: '苏眠', role: '科学家', mark: '苏', color: '#7dffb0', unlock: 0, skill: (lv) => `任务时间 +${4 * lv} 秒, 任务分 +${10 * lv}%` },
  { id: 'security', name: '雷雅', role: '安全官', mark: '雷', color: '#ff5e7a', unlock: 1, skill: (lv) => `打危机的分 +${25 * lv}%${lv >= 3 ? ', 打一下顶两下' : ''}, 危机的护盾 +${2 * lv} 秒` },
  { id: 'medic', name: '白芷', role: '医生', mark: '芷', color: '#ff9be6', unlock: 2, skill: (lv) => `一局能急救 ${medicSaves(lv)} 次 (护盾过了, 球掉了也救回来)` },
  { id: 'navigator', name: '星野', role: '领航员', mark: '野', color: '#b07dff', unlock: 3, skill: (lv) => `开局奖励倍数 ×${navMult(lv)}, 技巧射击分 +${50 * lv}%` },
];
export const crewById = (id) => CREW.find((c) => c.id === id) ?? null;
export function crewLevel(xp) {
  let lv = 1;
  while (lv < MAX_LEVEL && xp >= LEVEL_XP[lv]) lv++;
  return lv;
}
// 一局得多少经验: 玩了就有 10, 加上分数、做完的任务、渡过的危机、着陆
export const xpFor = ({ score, missions, bosses, landings }) => 10 + Math.floor(score / 10000) + 40 * missions + 150 * bosses + 500 * landings;

// 队员的本事 → 规则里的数 (crew: { id, level } 或 null 经典模式)
export function perks(crew) {
  const p = { saveTime: SAVE_TIME, missionTime: 0, missionMult: 1, comboWindow: 3.5, comboMult: 1, bossDamage: 1, bossScore: 1, bossSave: 15, medic: 0, mult: 1, skillMult: 1, kickback: 0 };
  const lv = crew?.level ?? 0;
  if (crew?.id === 'pilot') Object.assign(p, { comboWindow: 3.5 + 0.4 * lv, comboMult: 1 + 0.2 * lv });
  else if (crew?.id === 'engineer') Object.assign(p, { saveTime: 10 + 2 * lv, kickback: lv >= 3 ? 2 : 1 });
  else if (crew?.id === 'scientist') Object.assign(p, { missionTime: 4 * lv, missionMult: 1 + 0.1 * lv });
  else if (crew?.id === 'security') Object.assign(p, { bossDamage: lv >= 3 ? 2 : 1, bossScore: 1 + 0.25 * lv, bossSave: 15 + 2 * lv });
  else if (crew?.id === 'medic') p.medic = medicSaves(lv);
  else if (crew?.id === 'navigator') Object.assign(p, { mult: navMult(lv), skillMult: 1 + 0.5 * lv });
  return p;
}

// ---- 台面 ----
const seg = (ax, ay, bx, by, o = {}) => ({ ax, ay, bx, by, ...METAL, r: 0, ...o });
const polyline = (pts, o) => pts.slice(1).map((p, i) => seg(pts[i][0], pts[i][1], p[0], p[1], o));
export function arcPoints(cx, cy, r, a0, a1, n) {
  return Array.from({ length: n + 1 }, (_, i) => {
    const a = a0 + ((a1 - a0) * i) / n;
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
  });
}
const mx = (x) => 560 - x; // 左右对称 (发射通道左边那块台面的中线 280)
function norm(x, y) {
  const l = Math.hypot(x, y) || 1;
  return { x: x / l, y: y / l };
}

// 坡道入口: 口子中间 m, 朝里的方向 d, 宽 60, 深 55 → 口子两边的柱子 a、b, 里头的门 a2–b2
const at = (p, v, k) => [p[0] + v.x * k, p[1] + v.y * k];
function mouth(m, d, width = 60, depth = 55) {
  const p = { x: -d.y, y: d.x }; // 跟口子平行
  const a = at(m, p, width / 2);
  const b = at(m, p, -width / 2);
  return { a, b, a2: at(a, d, depth), b2: at(b, d, depth), in: d };
}
const doorMid = (m) => [(m.a2[0] + m.b2[0]) / 2, (m.a2[1] + m.b2[1]) / 2];
const WARP = mouth([150, 560], norm(-0.546, -0.838)); // 曲速坡道 (左边, 右挡板打)
const DOCK = mouth([275, 452], norm(0, -1), 70); // 对接坡道 (中间, 黑洞上面; 宽一点, 正对着挡板不好打)

const DOCK_ROOF = [DOCK.b2, [275, DOCK.a2[1] - 26], DOCK.a2];

// 曲速坡道的路线 (x, y, z): 从入口往左上爬, 从虫洞顶上横过去, 沿右边下来, 落进右边的回球道
const WARP_POINTS = [
  [...doorMid(WARP), 4],
  [96, 440, 40],
  [88, 330, 70],
  [128, 228, 88],
  [208, 176, 98],
  [320, 166, 100],
  [430, 198, 96],
  [494, 290, 86],
  [514, 420, 70],
  [510, 560, 50],
  [493, 680, 26],
  [484, 760, 6],
];
// 对接坡道 (铁丝的): 从中间往上, 弯到左上 (在顶上从曲速坡道上面交叉过去), 沿左边的墙上头下来, 落进左边的回球道
const DOCK_POINTS = [
  [...doorMid(DOCK), 4],
  [267, 345, 34],
  [238, 284, 76],
  [182, 224, 112],
  [118, 200, 118],
  [66, 244, 112],
  [44, 338, 98],
  [42, 450, 82],
  [46, 560, 64],
  [56, 662, 42],
  [67, 736, 20],
  [76, 780, 4],
];

// Catmull-Rom 曲线取点, 算好每一点走了多远
function sampleCurve(points, perSegment = 24) {
  const pts = [];
  const p = (i) => points[Math.max(0, Math.min(points.length - 1, i))];
  for (let i = 0; i < points.length - 1; i++) {
    for (let k = 0; k < perSegment; k++) {
      const t = k / perSegment;
      const [p0, p1, p2, p3] = [p(i - 1), p(i), p(i + 1), p(i + 2)];
      const c = (j) => 0.5 * (2 * p1[j] + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t * t + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t * t * t);
      pts.push([c(0), c(1), c(2)]);
    }
  }
  pts.push([...points.at(-1)]);
  const len = [0];
  for (let i = 1; i < pts.length; i++) len.push(len[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]));
  return { pts, len, total: len.at(-1) };
}

// 路线上走了 s 远的地方: { x, y, z, dx, dy, dz (单位方向) }
export function rampAt(path, s) {
  const { pts, len } = path;
  let i = 1;
  while (i < len.length - 1 && len[i] < s) i++;
  const a = pts[i - 1];
  const b = pts[i];
  const l = len[i] - len[i - 1] || 1;
  const t = Math.max(0, Math.min(1, (s - len[i - 1]) / l));
  return { x: a[0] + (b[0] - a[0]) * t, y: a[1] + (b[1] - a[1]) * t, z: a[2] + (b[2] - a[2]) * t, dx: (b[0] - a[0]) / l, dy: (b[1] - a[1]) / l, dz: (b[2] - a[2]) / l };
}

export function buildTable() {
  // 画出来的栏杆 (画面也照这些画)
  const rails = {
    // 外边是出局道, 里边是回球道。导轨盖过挡板转轴, 球从导轨直接滚到挡板上面, 碰不到转轴的圆头
    guides: [
      [[58, 690], [58, 842], [192, 886]],
      [[mx(58), 690], [mx(58), 842], [mx(192), 886]],
    ],
    // 右边墙上的小鼓包: 贴着墙滚下来的球往里推一点 (左边不放: 左边有救生舱, 鼓包会挡住弹回去的球)
    bulges: [[[LANE_X, 610], [mx(54), 652], [LANE_X, 690]]],
    dividers: [225, 275, 325, 375].map((x) => [[x, 92], [x, 150]]),
    // 两个坡道口两边的栏杆
    ramp: [WARP, DOCK].flatMap((m) => [
      [m.a, m.a2],
      [m.b, m.b2],
    ]),
    roof: DOCK_ROOF,
  };
  const walls = [
    // 顶上的大圆弧, 左右两边的墙, 发射通道
    ...polyline(arcPoints(300, 300, 280, Math.PI, 2 * Math.PI, 40)),
    seg(20, 300, 20, 1060),
    seg(580, 300, 580, 1060),
    seg(LANE_X, 1060, LANE_X, 432),
    ...rails.guides.flatMap((p) => polyline(p)),
    ...rails.bulges.flatMap((p) => polyline(p)),
    ...rails.dividers.map(([[ax, ay], [bx, by]]) => seg(ax, ay, bx, by, { r: 4, e: 0.3 })),
    ...rails.ramp.map(([[ax, ay], [bx, by]]) => seg(ax, ay, bx, by, { r: 3, ...PLASTIC })),
    // 对接坡道口后面的尖顶: 门是平的, 从上面掉下来的球会停在上面, 加个尖顶让它滚下去
    ...polyline(DOCK_ROOF, { r: 3, ...PLASTIC }),
  ];
  // 单向门: 只挡从「挡的那一边」(n 指的那边) 过来的球。发射通道口 (从上面掉下来的拨到台面上); 左边回旋道 (往上能过, 从上面下来的拨到台面上)
  const gates = [
    { ...seg(580, 398, LANE_X, 432, { e: 0.3 }), n: norm(-34, -40) },
    { ...seg(20, 340, 82, 392, { e: 0.3 }), n: norm(52, -62) },
  ];
  const posts = [
    { x: 58, y: 690, r: 6 },
    { x: mx(58), y: 690, r: 6 },
    ...[WARP, DOCK].flatMap((m) => [
      { x: m.a[0], y: m.a[1], r: 7 },
      { x: m.b[0], y: m.b[1], r: 7 },
    ]),
  ];
  // 弹弓: 三角形, 朝里的那条边会把球弹出去 (下边跟导轨之间要留够一个球过去的空)
  const sling = (a, b, c, i) => [seg(a[0], a[1], b[0], b[1], PLASTIC), seg(b[0], b[1], c[0], c[1], PLASTIC), seg(a[0], a[1], c[0], c[1], { ...RUBBER, kick: 1000, sling: i })];
  const slingShapes = [
    [[95, 730], [95, 808], [148, 842]],
    [[mx(95), 730], [mx(95), 808], [mx(148), 842]],
  ];
  const slings = slingShapes.flatMap(([a, b, c], i) => sling(a, b, c, i));
  const bumpers = [
    { x: 220, y: 242, r: 28 },
    { x: 340, y: 242, r: 28 },
    { x: 280, y: 314, r: 28 },
  ];
  // 左边五个星座靶 (掉落靶, 贴着墙, 朝右)
  const drops = [440, 472, 504, 536, 568].map((y) => ({ ...seg(34, y, 34, y + 26, { e: 0.35, fall: 0.2, mu: 0.2 }), up: true }));
  // 右边三个任务靶 (斜着摆, 朝左下的挡板; 斜的, 球不会停在上面)
  const tdir = norm(0.868, 0.496);
  const targets = [[400, 455], [425, 485], [450, 515]].map(([x, y]) => seg(x - tdir.x * 12, y - tdir.y * 12, x + tdir.x * 12, y + tdir.y * 12, { r: 4, e: 0.45, fall: 0.3, mu: 0.3 }));
  const flippers = [
    { side: 'left', px: 185, py: 905, len: 85, r0: 13, r1: 7, rest: 0.52, up: -0.48 },
    { side: 'right', px: mx(185), py: 905, len: 85, r0: 13, r1: 7, rest: Math.PI - 0.52, up: Math.PI + 0.48 },
  ].map((f) => ({ ...f, angle: f.rest, omega: 0, inertia: FLIP.inertia }));
  return {
    rails,
    walls,
    gates,
    posts,
    slings,
    slingShapes,
    bumpers,
    drops,
    targets,
    flippers,
    lanes: [250, 300, 350].map((x) => ({ x, y: 122, r: 14 })),
    wormholes: [250, 300, 350].map((x) => ({ x, y: 72 })),
    inlanes: [{ x: 77, y: 790, r: 13 }, { x: mx(77), y: 790, r: 13 }],
    outlanes: [{ x: 39, y: 880, r: 14 }, { x: mx(39), y: 880, r: 14 }],
    orbit: { x: 300, y: 36, r: 18 }, // 顶上圆弧的最高处
    spinner: { x: 520, y: 470, ax: LANE_X - 42, bx: LANE_X }, // 右边轨道上横着的转片
    hole: { x: 275, y: 530, r: 18 }, // 黑洞
    // 坡道: 0 曲速坡道, 1 对接坡道
    ramps: [
      { name: 'warp', door: [WARP.a2, WARP.b2], in: WARP.in, path: sampleCurve(WARP_POINTS), exit: { vx: 0, vy: 520 } },
      { name: 'dock', door: [DOCK.a2, DOCK.b2], in: DOCK.in, path: sampleCurve(DOCK_POINTS), exit: { vx: 0, vy: 520 } },
    ].map((r) => ({ ...r, doorSeg: { ax: r.door[0][0], ay: r.door[0][1], bx: r.door[1][0], by: r.door[1][1], r: 0, ...PLASTIC } })),
    plunger: { x: 560, y: 975, top: 975 },
  };
}

// ---- 碰撞 ----
function closest(px, py, s) {
  const dx = s.bx - s.ax;
  const dy = s.by - s.ay;
  const l2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((px - s.ax) * dx + (py - s.ay) * dy) / l2));
  return [s.ax + dx * t, s.ay + dy * t, t];
}

// 撞得多狠 → 弹性 (撞得很轻, 就是在上面滚着: 不弹, 免得一直抖)
const elasticity = (m, vn) => (vn < 40 ? 0 : m.e / (1 + (m.fall ?? 0) * (vn / 1000)));

// 球碰到一个点附近 (cx, cy, 加上半径 rad): 推出来, 按冲量反弹, 带摩擦 (球会转)。
// mat: 材料 { e, fall, mu }; kick: 弹出去至少这么快 (弹弓、小行星); body: 碰到的是会转的东西 (挡板 { omega, px, py, inertia }),
// 冲量也反过来作用在它上面。返回撞上去的法向速度, 没碰到返回 -1
function resolve(b, cx, cy, rad, mat, { kick = 0, fallback = null, body = null } = {}) {
  let dx = b.x - cx;
  let dy = b.y - cy;
  const reach = b.r + rad;
  const d2 = dx * dx + dy * dy;
  if (d2 >= reach * reach) return -1;
  const d = Math.sqrt(d2);
  if (d < 1e-6) ({ x: dx, y: dy } = fallback ?? { x: 0, y: -1 });
  else {
    dx /= d;
    dy /= d;
  }
  b.x = cx + dx * reach;
  b.y = cy + dy * reach;
  // 碰到的那一点 (在对面的表面上) 自己的速度: ω × r
  let rx = 0;
  let ry = 0;
  let vfx = 0;
  let vfy = 0;
  if (body) {
    rx = cx + dx * rad - body.px;
    ry = cy + dy * rad - body.py;
    vfx = -body.omega * ry;
    vfy = body.omega * rx;
  }
  const rvx = b.vx - vfx;
  const rvy = b.vy - vfy;
  const vn = rvx * dx + rvy * dy;
  if (vn >= 0) return 0;
  const tx = -dy;
  const ty = dx;
  const rn = rx * dy - ry * dx; // r × n
  const rt = rx * ty - ry * tx; // r × t
  // 法向冲量 (对面有转动惯量的话, 它也分走一点)
  let jn = (-(1 + elasticity(mat, -vn)) * vn) / (1 + (body ? (rn * rn) / body.inertia : 0));
  if (kick && -vn > 60) jn = Math.max(jn, kick - vn);
  // 摩擦: 碰到的那一点在切向滑多快 (球绕竖轴转着, 表面也在动), 摩擦冲量最多 mu × 法向冲量
  const slip = rvx * tx + rvy * ty - b.wz * b.r;
  const kt = 1 + 1 / BALL_I + (body ? (rt * rt) / body.inertia : 0);
  const lim = mat.mu * jn;
  const jt = Math.max(-lim, Math.min(lim, -slip / kt));
  b.vx += dx * jn + tx * jt;
  b.vy += dy * jn + ty * jt;
  b.wz -= jt / (BALL_I * b.r);
  if (body) body.omega -= (jn * rn + jt * rt) / body.inertia;
  if (mat.damp) {
    // 贴着橡皮滚: 沿着表面的速度吃掉一点 (滚的速度一起, 不然又变成在台面上滑)
    const k = Math.min(1, mat.damp * STEP);
    const along = (b.vx - vfx) * tx + (b.vy - vfy) * ty;
    b.vx -= tx * along * k;
    b.vy -= ty * along * k;
    b.rx -= tx * along * k;
    b.ry -= ty * along * k;
  }
  return -vn;
}

function hitSegment(b, s) {
  // 先看离线段的方框远不远 (远的不用算)
  const pad = b.r + s.r + 1;
  if (b.x < Math.min(s.ax, s.bx) - pad || b.x > Math.max(s.ax, s.bx) + pad || b.y < Math.min(s.ay, s.by) - pad || b.y > Math.max(s.ay, s.by) + pad) return -1;
  const [cx, cy, at] = closest(b.x, b.y, s);
  if (s.n) {
    // 单向门: 球心在挡的那一边才挡
    if ((b.x - cx) * s.n.x + (b.y - cy) * s.n.y < 0) return -1;
    if ((b.x - s.ax) * s.n.x + (b.y - s.ay) * s.n.y < 0) return -1;
  }
  const hit = resolve(b, cx, cy, s.r, s, { kick: s.kick, fallback: s.n ?? norm(-(s.by - s.ay), s.bx - s.ax) });
  // 几乎不动、正好顶在一段墙的尖头上: 真球在尖上站不住, 往尖头外面推一点点, 让它滚下去
  if (hit >= 0 && (at === 0 || at === 1) && Math.abs(b.vx) + Math.abs(b.vy) < 8) {
    const k = at === 0 ? -1 : 1;
    const l = Math.hypot(s.bx - s.ax, s.by - s.ay) || 1;
    b.vx += ((k * (s.bx - s.ax)) / l) * 3;
    b.vy += ((k * (s.by - s.ay)) / l) * 3;
  }
  return hit;
}

export function flipperTip(f) {
  return [f.px + Math.cos(f.angle) * f.len, f.py + Math.sin(f.angle) * f.len];
}

function hitFlipper(b, f) {
  const [tx, ty] = flipperTip(f);
  const [cx, cy, t] = closest(b.x, b.y, { ax: f.px, ay: f.py, bx: tx, by: ty });
  const rad = f.r0 + (f.r1 - f.r0) * t;
  return resolve(b, cx, cy, rad, FLIPPER_RUBBER, { fallback: { x: 0, y: -1 }, body: f });
}

// 挡板转一步: 按住是线圈推, 快到头了 (真机上的「到头开关」) 换成小一点的保持力; 松开是弹簧拉回;
// 撞到两头的挡块弹回来一点 (很慢的就不弹了, 不然托着球的时候一直抖)
function turnFlipper(f, held, h) {
  const dir = Math.sign(f.up - f.rest);
  const nearUp = (f.angle - f.up) * dir >= -FLIP.eos;
  const torque = held ? (nearUp ? FLIP.hold : FLIP.coil) * dir : -FLIP.ret * dir;
  f.omega = Math.max(-FLIP.max, Math.min(FLIP.max, f.omega + (torque / f.inertia) * h));
  f.angle += f.omega * h;
  const stop = (to, bounce) => {
    f.angle = to;
    f.omega = Math.abs(f.omega) > 3 ? -f.omega * bounce : 0;
  };
  if ((f.angle - f.up) * dir > 0) stop(f.up, FLIP.bounceUp);
  else if ((f.angle - f.rest) * dir < 0) stop(f.rest, FLIP.bounceRest);
}

// 球在台面上: 滑着的时候 (球心的速度 v 跟「滚的速度」r 不一样) 摩擦把两个拉到一样 (v 慢一点, r 快一点, 实心球是 1 : 2.5);
// 滚起来以后只有一点滚动阻力。绕竖轴的转慢慢停下来
function roll(b, h) {
  const sx = b.vx - b.rx;
  const sy = b.vy - b.ry;
  const slip = Math.hypot(sx, sy);
  const f = MU_TABLE * G_N * h;
  if (slip <= f * 3.5) {
    // 这一步就能滚起来: 滚起来的速度 = v - 2/7 × 滑的那一份
    b.vx = b.rx = b.vx - sx * (2 / 7);
    b.vy = b.ry = b.vy - sy * (2 / 7);
  } else {
    b.vx -= (sx / slip) * f;
    b.vy -= (sy / slip) * f;
    b.rx += (sx / slip) * f * 2.5;
    b.ry += (sy / slip) * f * 2.5;
  }
  const v = Math.hypot(b.vx, b.vy);
  if (v > 1e-6) {
    const k = Math.max(0, 1 - (ROLL_RES * G_N * h) / v);
    b.vx *= k;
    b.vy *= k;
    b.rx *= k;
    b.ry *= k;
  }
  b.wz *= 1 - 0.6 * h;
}
// 放到别的地方去 (坡道出口、虫洞): 当它是滚着的
const rolling = (b) => Object.assign(b, { rx: b.vx, ry: b.vy });

// 两个球撞: 一样重, 法向速度交换 (稍微损失一点)
function hitBalls(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d = Math.hypot(dx, dy);
  if (d >= a.r + b.r || d < 1e-6) return;
  const nx = dx / d;
  const ny = dy / d;
  const push = (a.r + b.r - d) / 2;
  a.x -= nx * push;
  a.y -= ny * push;
  b.x += nx * push;
  b.y += ny * push;
  const rel = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
  if (rel <= 0) return;
  const j = rel * 0.95;
  a.vx -= nx * j;
  a.vy -= ny * j;
  b.vx += nx * j;
  b.vy += ny * j;
}

const inside = (b, s) => (b.x - s.x) ** 2 + (b.y - s.y) ** 2 < s.r * s.r;
// 球心这一步从线 a→b 的一边到了另一边 (交点在线段上): 返回 1 或 -1 (往哪边过的), 没过返回 0
function crossed(px, py, qx, qy, a, b) {
  const side = (x, y) => (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]);
  const s1 = side(px, py);
  const s2 = side(qx, qy);
  if (s1 === 0 || Math.sign(s1) === Math.sign(s2)) return 0;
  const t = s1 / (s1 - s2);
  const x = px + (qx - px) * t;
  const y = py + (qy - py) * t;
  const along = ((x - a[0]) * (b[0] - a[0]) + (y - a[1]) * (b[1] - a[1])) / ((b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2);
  return along >= -0.05 && along <= 1.05 ? Math.sign(s2) : 0;
}

// ---- 一局 ----
const fmt = (n) => Math.round(n).toLocaleString('en-US');
// 一个球: 位置、速度、滚的速度 (rx, ry)、绕竖轴转多快 (wz)
const newBall = (id, x, y, vx = 0, vy = 0) => ({ id, x, y, z: 0, vx, vy, rx: vx, ry: vy, wz: 0, r: BALL_R, ramp: null, held: null, slow: 0 });

export class Pinball {
  // crew: { id, level } 远航模式的队员, null 是经典模式
  constructor({ rand = Math.random, crew = null } = {}) {
    this.rand = rand;
    this.table = buildTable();
    this.input = { left: false, right: false, plunger: false, nudge: false };
    this.prevInput = { ...this.input };
    this.events = []; // 给画面、声音用: { type, ... }
    this.flash = { bumper: [0, 0, 0], sling: [0, 0], drop: [0, 0, 0, 0, 0], target: [0, 0, 0], lane: [0, 0, 0], hole: 0, orbit: 0, ramp: 0, dock: 0, spinner: 0, warp: 0, shake: 0, boss: 0 };
    this.acc = 0;
    this.time = 0;
    this.timer = 0;
    this.later = []; // 过一会儿做的事 [{ at 游戏里的时间, fn }] (暂停了也跟着停)
    this.cool = new Map(); // 同一个东西刚撞过, 一会儿内不再算分
    this.nudges = [];
    this.nextId = 1;
    this.balls = [];
    this.state = {
      status: 'ready', // ready 球在发射通道里等着发射 | play | drained 掉了 (算奖励分) | over
      score: 0,
      ball: 1, // 第几个球
      extra: 0, // 奖励的球
      extraGiven: false, // 补给舱的「加一个球」一局一次
      mult: 1, // 奖励倍数 (顶上通道)
      bonus: 0,
      lanes: [false, false, false],
      skillLane: -1, // 技巧射击: 闪的那条
      drops: 0, // 星座连了几个
      kickback: false,
      saved: false, // 这个球用过护盾了
      saveLeft: 0,
      medic: 0, // 还能急救几次
      pull: 0, // 弹簧拉了多少 0–1
      warp: 0, // 曲速几级
      docks: 0, // 这一阵打上对接坡道几次 (两次锁球灯亮)
      lockLit: false,
      locked: 0, // 锁住了几个球
      multiball: false, // 穿梭机出动 (锁球的多球)
      targets: [false, false, false],
      chapter: 0, // 第几章 (CHAPTERS)
      voyage: 0, // 着陆过几次 (又出发了, 分数更高)
      done: [], // 这一章做完的任务
      partial: {}, // 没做完的任务做到哪了 (任务第几个 → { step, have, lit })
      missionReady: false,
      mission: null, // { i 这一章第几个, step, have, lit (each 的), left 还剩几秒, total, value (hurry 的) }
      pick: null, // 黑洞里选任务: { options, i }
      bossReady: false,
      boss: null, // { hp, max, lit }
      finalReady: false,
      final: null, // { lit, landing }
      combo: { n: 0, at: -99 },
      stats: { missions: 0, bosses: 0, landings: 0 },
      tilt: false,
      message: '拉弹簧, 松开发射',
      messageLeft: 6,
    };
    this.setCrew(crew);
    this.addBall();
  }

  // 换队员 (只有开局还没发射的时候能换)
  setCrew(crew) {
    const s = this.state;
    if (s.score > 0 || s.ball > 1 || s.status !== 'ready') return false;
    this.crew = crew;
    this.perk = perks(crew);
    s.mult = this.perk.mult;
    s.kickback = this.perk.kickback > 0;
    s.medic = this.perk.medic;
    return true;
  }

  // 第一个球 (只有一个球的时候就是它)
  get ball() {
    return this.balls[0] ?? null;
  }

  // 越往后越值钱: 第几章 + 着陆过几次
  get tier() {
    return this.state.chapter + 1 + this.state.voyage * CHAPTERS.length;
  }

  get chapter() {
    return CHAPTERS[this.state.chapter];
  }

  missionDef(m = this.state.mission) {
    return m ? this.chapter.missions[m.i] : null;
  }

  emit(type, extra = {}) {
    this.events.push({ type, ...extra });
  }

  say(message, seconds = 2.5) {
    this.state.message = message;
    this.state.messageLeft = seconds;
  }

  add(points) {
    if (!this.state.tilt) this.state.score += Math.round(points);
  }

  after(seconds, fn) {
    this.later.push({ at: this.time + seconds, fn });
    this.later.sort((a, b) => a.at - b.at);
  }

  cooled(key, seconds = 0.08) {
    if (this.cool.has(key)) return false;
    this.cool.set(key, this.time + seconds);
    return true;
  }

  // 现在该打哪些路线 (画面上亮箭头): 任务、危机、终章, 还有黑洞里等着的事
  aims() {
    const s = this.state;
    const out = new Set();
    const m = s.mission;
    if (m) for (const x of m.lit ?? this.missionDef().steps[m.step].shots) out.add(x);
    if (s.boss) for (const x of s.boss.lit) out.add(x);
    if (s.final) for (const x of s.final.landing ? ['hole'] : s.final.lit) out.add(x);
    if (!s.mission && !s.boss && !s.final && (s.missionReady || s.bossReady || s.finalReady)) out.add('hole');
    if (s.lockLit) out.add('hole');
    if (s.multiball) out.add('ramp');
    return out;
  }

  // 一个新球放进发射通道 (auto: 自己发射, 多球、锁球、护盾以后用)
  addBall({ auto = false } = {}) {
    const p = this.table.plunger;
    const b = newBall(this.nextId++, p.x, p.top - BALL_R);
    this.balls.push(b);
    if (auto) {
      this.after(0.7, () => {
        if (!this.balls.includes(b)) return;
        b.vy = -3400;
        this.emit('launch', { power: 1 });
      });
    } else {
      this.state.status = 'ready';
      this.state.pull = 0;
      this.state.skillLane = Math.floor(this.rand() * 3);
    }
    return b;
  }

  // 过了 dt 秒 (画面一帧)
  update(dt) {
    const s = this.state;
    if (s.status === 'over') return;
    this.acc = Math.min(this.acc + dt, STEP * MAX_STEPS);
    while (this.acc >= STEP) {
      this.acc -= STEP;
      this.step(STEP);
    }
    if (s.messageLeft > 0) s.messageLeft -= dt;
    for (const [k, v] of Object.entries(this.flash)) {
      if (Array.isArray(v)) v.forEach((x, i) => (v[i] = Math.max(0, x - dt)));
      else this.flash[k] = Math.max(0, v - dt);
    }
    for (const [k, t] of this.cool) if (t <= this.time) this.cool.delete(k);
  }

  step(h) {
    const s = this.state;
    const t = this.table;
    this.time += h;
    while (this.later.length && this.later[0].at <= this.time) this.later.shift().fn();
    const input = this.input;
    const live = !s.tilt;
    // 按下挡板: 顶上亮着的通道跟着挪; 黑洞里选任务的时候是换任务
    for (const side of ['left', 'right']) {
      if (input[side] && !this.prevInput[side] && live) {
        this.emit('flip', { side });
        if (s.pick) {
          const n = s.pick.options.length;
          s.pick.i = (s.pick.i + (side === 'left' ? n - 1 : 1)) % n;
          const def = this.chapter.missions[s.pick.options[s.pick.i]];
          this.say(`选任务: ${def.name} · ${def.goal}`, 3);
          this.emit('pick');
        } else if (s.status === 'play') s.lanes = side === 'left' ? [...s.lanes.slice(1), s.lanes[0]] : [s.lanes[2], ...s.lanes.slice(0, 2)];
      }
    }
    for (const f of t.flippers) turnFlipper(f, input[f.side] && live, h);
    if (input.nudge && !this.prevInput.nudge) this.nudge();
    // 弹簧: 按住拉, 松开发射 (发射通道底下的球)
    if (input.plunger) s.pull = Math.min(1, s.pull + h / PULL_TIME);
    else if (this.prevInput.plunger) {
      const b = this.balls.find((x) => x.x > LANE_X && x.y > t.plunger.top - 60 && !x.held);
      if (b && s.pull > 0.04) {
        // 弹簧推出去 (速度跟拉了多少成正比; 刚推出去是滑的, 还没转)
        b.vy = -(450 + 2450 * s.pull);
        b.vx = 0;
        if (s.status === 'ready') {
          s.status = 'play';
          if (!s.saved) s.saveLeft = Math.max(s.saveLeft, this.perk.saveTime);
        }
        this.emit('launch', { power: s.pull });
      }
      s.pull = 0;
    }
    this.prevInput = { ...input };
    if (s.status === 'drained') {
      this.timer -= h;
      if (this.timer <= 0) this.nextBall();
      return;
    }
    if (s.status === 'play') {
      if (s.saveLeft > 0) s.saveLeft = Math.max(0, s.saveLeft - h);
      // 任务的时间 (球都在黑洞里的时候不走)
      const m = s.mission;
      if (m && this.balls.some((b) => !b.held)) {
        m.left -= h;
        if (m.value) m.value = Math.max(m.value * 0.25, m.value - (m.start * 0.75 * h) / m.total);
        if (m.left <= 0) this.missionFail();
      }
    }

    for (const b of [...this.balls]) this.moveBall(b, h);
    // 球跟球
    for (let i = 0; i < this.balls.length; i++) {
      for (let j = i + 1; j < this.balls.length; j++) {
        const a = this.balls[i];
        const c = this.balls[j];
        if (!a.ramp && !c.ramp && !a.held && !c.held) hitBalls(a, c);
      }
    }
  }

  moveBall(b, h) {
    const s = this.state;
    const t = this.table;
    if (b.held) {
      b.held.left -= h;
      if (b.held.left <= 0) {
        const then = b.held.then;
        b.held = null;
        then();
      }
      return;
    }
    if (b.ramp) {
      this.rideRamp(b, h);
      return;
    }
    const px = b.x;
    const py = b.y;
    b.vy += GRAVITY * h;
    roll(b, h);
    // 黑洞潮汐: 黑洞附近的球被往里拉
    if (s.boss && this.chapter.boss.gravity && b.x < LANE_X) {
      const dx = t.hole.x - b.x;
      const dy = t.hole.y - b.y;
      const d = Math.hypot(dx, dy);
      if (d > 1 && d < 220) {
        const a = 2200 * (1 - d / 220);
        b.vx += (dx / d) * a * h;
        b.vy += (dy / d) * a * h;
      }
    }
    const speed = Math.hypot(b.vx, b.vy);
    if (speed > MAX_SPEED) {
      b.vx *= MAX_SPEED / speed;
      b.vy *= MAX_SPEED / speed;
    }
    b.x += b.vx * h;
    b.y += b.vy * h;
    b.z = 0;

    // 弹簧顶着球 (拉的时候往下)
    const top = t.plunger.top + s.pull * 30;
    if (b.x > LANE_X && b.y + b.r > top && b.y < top + 40) {
      b.y = top - b.r;
      if (b.vy > 0) b.vy = -b.vy * 0.15;
    }

    // 冲进坡道入口: 碰到入口、往里冲得够快就上坡道; 太慢入口当墙, 弹回来
    for (let k = 0; k < t.ramps.length; k++) {
      const ramp = t.ramps[k];
      const [dcx, dcy] = closest(b.x, b.y, ramp.doorSeg);
      if ((b.x - dcx) ** 2 + (b.y - dcy) ** 2 >= (b.r + 2) ** 2) continue;
      const inward = b.vx * ramp.in.x + b.vy * ramp.in.y;
      if (inward > 300) {
        b.ramp = { k, s: 0, v: Math.min(inward, 2800) };
        this.emit('rampEnter', { k });
        return;
      }
    }

    for (let pass = 0; pass < 2; pass++) {
      for (const w of t.walls) hitSegment(b, w);
      for (const ramp of t.ramps) hitSegment(b, ramp.doorSeg);
      for (const g of t.gates) hitSegment(b, g);
      for (const p of t.posts) resolve(b, p.x, p.y, p.r, RUBBER);
      for (const w of t.slings) {
        const hit = hitSegment(b, w);
        if (w.sling !== undefined && hit > 60 && this.cooled(`sling${w.sling}`, 0.1)) {
          this.flash.sling[w.sling] = 0.15;
          this.add(50 * this.tier);
          s.bonus += 5;
          this.emit('sling', { i: w.sling, x: b.x, y: b.y });
          this.shot('slings');
        }
      }
      t.bumpers.forEach((p, i) => {
        const hit = resolve(b, p.x, p.y, p.r, BUMPER, { kick: s.tilt ? 0 : 900 });
        if (hit > 30 && this.cooled(`bumper${i}`, 0.08)) {
          this.flash.bumper[i] = 0.18;
          this.add(100 * this.tier);
          s.bonus += 10;
          this.emit('bumper', { i, x: b.x, y: b.y });
          this.shot('bumpers');
        }
      });
      t.drops.forEach((d, i) => {
        if (d.up && hitSegment(b, d) > 120) this.dropHit(i);
      });
      t.targets.forEach((c, i) => {
        if (hitSegment(b, c) > 120 && this.cooled(`target${i}`, 0.2)) this.targetHit(i);
      });
      for (const f of t.flippers) hitFlipper(b, f);
    }
    this.sensors(b, px, py);
  }

  // 在坡道上: 沿路线滚; 上坡减速、下坡加速 (滚着的球是重力沿路线那一份的 5/7), 冲不上去就滚回来
  rideRamp(b, h) {
    const t = this.table;
    const r = b.ramp;
    const ramp = t.ramps[r.k];
    const path = ramp.path;
    const p = rampAt(path, r.s);
    r.v += (5 / 7) * (GRAVITY * p.dy - G_N * p.dz) * h;
    r.v *= 1 - RAMP_DRAG * h;
    r.v = Math.min(r.v, 3000);
    r.s += r.v * h;
    if (r.s <= 0) {
      // 滚回入口: 放回台面, 往外滚
      const back = Math.max(200, -r.v);
      b.ramp = null;
      const d = ramp.door;
      Object.assign(b, { x: (d[0][0] + d[1][0]) / 2 - ramp.in.x * 4, y: (d[0][1] + d[1][1]) / 2 - ramp.in.y * 4, z: 0, vx: -ramp.in.x * back, vy: -ramp.in.y * back });
      rolling(b);
      this.emit('rampFail', { k: r.k });
      return;
    }
    if (r.s >= path.total) {
      // 下来了: 落进右边的回球道
      const end = rampAt(path, path.total);
      b.ramp = null;
      Object.assign(b, { x: end.x, y: end.y, z: 0, vx: ramp.exit.vx, vy: Math.max(ramp.exit.vy, r.v * 0.4) });
      rolling(b);
      if (r.k === 1) this.dockDone();
      else this.rampDone();
      return;
    }
    const q = rampAt(path, r.s);
    b.x = q.x;
    b.y = q.y;
    b.z = q.z;
    b.vx = q.dx * r.v;
    b.vy = q.dy * r.v;
  }

  sensors(b, px, py) {
    const s = this.state;
    const t = this.table;
    const play = s.status === 'play';
    // 顶上三条通道
    t.lanes.forEach((l, i) => {
      if (!inside(b, l) || !this.cooled(`lane${b.id}:${i}`, 0.6)) return;
      this.flash.lane[i] = 0.4;
      this.add(500 * this.tier);
      s.bonus += 20;
      if (s.skillLane >= 0) {
        if (s.skillLane === i) {
          const pts = 15000 * this.tier * this.perk.skillMult;
          this.add(pts);
          this.say(`技巧射击! +${fmt(pts)}`, 3);
          this.emit('skill');
        }
        s.skillLane = -1;
      }
      s.lanes[i] = true;
      this.emit('lane', { i });
      this.shot('lanes');
      if (s.lanes.every(Boolean)) {
        s.lanes = [false, false, false];
        if (s.mult < 5) s.mult++;
        this.add(2000 * this.tier);
        this.say(`再入大气层! 奖励 ×${s.mult}`);
        this.emit('mult', { mult: s.mult });
      }
    });
    // 球掉下来过了顶上通道还没进: 技巧射击就算了
    if (s.skillLane >= 0 && play && b.y > 400 && b.x < LANE_X) s.skillLane = -1;
    // 环绕轨道
    if (play && inside(b, t.orbit) && Math.abs(b.vx) > 500 && this.cooled(`orbit${b.id}`, 1.5)) {
      this.flash.orbit = 0.6;
      const points = 1500 * this.tier;
      this.add(points);
      s.bonus += 30;
      if (!s.mission && !s.boss && !s.final) this.say(`环绕轨道! +${fmt(points)}`, 1.5);
      this.emit('orbit');
      this.shot('orbit');
    }
    // 推进器 (转片): 冲过去转几圈
    const sp = t.spinner;
    if (crossed(px, py, b.x, b.y, [sp.ax, sp.y], [sp.bx, sp.y]) && this.cooled(`spin${b.id}`, 0.3)) {
      const spins = Math.max(1, Math.min(20, Math.round(Math.abs(b.vy) / 160)));
      this.flash.spinner = Math.min(2, spins * 0.08);
      this.add(100 * spins * this.tier);
      s.bonus += spins;
      this.emit('spinner', { spins });
      this.shot('spinner', spins);
    }
    t.inlanes.forEach((l, i) => {
      if (inside(b, l) && this.cooled(`in${b.id}:${i}`, 0.6)) {
        this.add(200 * this.tier);
        this.emit('inlane', { i });
      }
    });
    t.outlanes.forEach((l, i) => {
      if (!inside(b, l) || !this.cooled(`out${b.id}:${i}`, 0.6)) return;
      this.add(500 * this.tier);
      if (i === 0 && s.kickback) {
        s.kickback = false;
        Object.assign(b, { x: l.x, y: l.y, vx: 0, vy: -2300 });
        this.say('救生舱! 弹回去了');
        this.emit('kickback');
      } else this.emit('outlane', { i });
    });
    // 黑洞
    if (play && inside(b, t.hole) && Math.hypot(b.vx, b.vy) < 1500 && this.cooled(`hole${b.id}`, 1)) {
      this.holeIn(b);
      return;
    }
    // 发射失败掉回通道: 等着再发射
    if (play && this.balls.length === 1 && b.x > LANE_X && b.y > t.plunger.top - 40 && Math.abs(b.vy) < 80 && !this.later.length) {
      s.status = 'ready';
      s.saveLeft = 0;
    }
    // 卡住了 (几乎不动、又不在通道里, 也不是托在挡板上): 推一下
    if (play && Math.hypot(b.vx, b.vy) < 6 && b.x < LANE_X && b.y < 850) {
      b.slow += STEP;
      if (b.slow > 2.5) {
        b.slow = 0;
        b.vx = (this.rand() - 0.5) * 400;
        b.vy = -300;
        this.say('球卡住了, 帮你推一下');
        this.emit('nudge');
      }
    } else b.slow = 0;
    if (b.y > H + 20 && play) this.drainBall(b);
  }

  // ---- 打中了什么 ----

  // 打中了一条路线: 连击、任务、危机、终章都看这个
  shot(name, n = 1) {
    const s = this.state;
    if (s.tilt) return;
    if (MAJOR.has(name)) this.comboShot();
    if (s.mission) this.missionShot(name, n);
    if (s.boss?.lit.includes(name)) this.bossHit(name);
    if (s.final) this.finalShot(name);
  }

  comboShot() {
    const s = this.state;
    const c = s.combo;
    c.n = this.time - c.at < this.perk.comboWindow ? c.n + 1 : 1;
    c.at = this.time;
    if (c.n < 2) return;
    const pts = 10000 * c.n * this.tier * this.perk.comboMult;
    this.add(pts);
    this.say(`连击 ×${c.n}! +${fmt(pts)}`, 1.8);
    this.emit('combo', { n: c.n });
    this.shot('combo');
  }

  dropHit(i) {
    const s = this.state;
    const d = this.table.drops[i];
    d.up = false;
    this.flash.drop[i] = 0.3;
    this.add(500 * this.tier);
    s.bonus += 30;
    this.emit('drop', { i });
    this.shot('drops');
    if (this.table.drops.every((x) => !x.up)) {
      const name = CONSTELLATIONS[s.drops % CONSTELLATIONS.length];
      s.drops++;
      this.add(5000 * this.tier);
      s.kickback = true;
      this.say(`连成了${name}! 救生舱准备好了`);
      this.emit('constellation', { name });
      this.after(1.5, () => {
        this.table.drops.forEach((x) => (x.up = true));
        this.emit('dropsReset');
      });
    }
  }

  targetHit(i) {
    const s = this.state;
    this.flash.target[i] = 0.3;
    this.add(300 * this.tier);
    s.bonus += 20;
    this.emit('target', { i });
    this.shot('targets');
    // 任务开着、危机、终章、这一章任务都做完了: 不亮任务
    if (s.mission || s.missionReady || s.boss || s.final || s.bossReady || s.finalReady || s.done.length >= 3) return;
    s.targets[i] = true;
    if (s.targets.every(Boolean)) {
      s.missionReady = true;
      this.say('任务准备好了: 打进黑洞选任务', 3);
      this.emit('missionReady');
    }
  }

  // 多球的时候两条坡道都是超级大奖
  jackpot() {
    if (!this.state.multiball) return;
    const jackpot = 30000 * this.tier;
    this.add(jackpot);
    this.say(`超级大奖! +${fmt(jackpot)}`, 3);
    this.emit('jackpot', { points: jackpot });
  }

  // 对接坡道: 打上去两次锁球灯亮
  dockDone() {
    const s = this.state;
    this.flash.dock = 0.8;
    this.jackpot();
    this.add(3000 * this.tier);
    s.bonus += 50;
    const quiet = s.multiball || s.mission || s.boss || s.final;
    if (!s.multiball && !s.lockLit && s.locked < 2) {
      s.docks++;
      if (s.docks >= 2) {
        s.lockLit = true;
        s.docks = 0;
        this.say('锁球灯亮了: 打进黑洞锁住一个球', 2.5);
        this.emit('lockLit');
      } else if (!quiet) this.say(`对接 ${s.docks}/2 · 再打一次锁球灯亮`, 1.8);
    }
    this.emit('dock');
    this.shot('center');
  }

  rampDone() {
    const s = this.state;
    this.flash.ramp = 0.8;
    this.jackpot();
    s.warp = Math.min(WARP_MAX, s.warp + 1);
    this.add(2000 * s.warp * this.tier);
    s.bonus += 50;
    this.flash.warp = 1;
    const quiet = s.multiball || s.mission || s.boss || s.final;
    if (s.warp >= WARP_MAX) {
      const prize = 25000 * this.tier;
      this.add(prize);
      s.warp = 0;
      this.say(`跃迁! +${fmt(prize)}`, 3);
      this.emit('hyperspace', { points: prize });
    } else if (!quiet) this.say(`曲速 ${s.warp} 级`, 1.5);
    this.emit('ramp', { warp: s.warp });
    this.shot('ramp');
  }

  // 进了黑洞: 先算打中 (任务、危机、终章), 再看有什么事: 锁球 / 终章 / 危机 / 选任务 / 补给舱; 吸住一会儿从虫洞出来
  holeIn(b) {
    const s = this.state;
    const ho = this.table.hole;
    Object.assign(b, { x: ho.x, y: ho.y, vx: 0, vy: 0 });
    this.flash.hole = 1.4;
    this.add(2500 * this.tier);
    s.bonus += 50;
    this.emit('hole');
    const was = { busy: Boolean(s.mission || s.boss || s.final), mission: s.missionReady, boss: s.bossReady, final: s.finalReady, landing: s.voyage };
    this.shot('hole');
    const out = () => (b.held = { left: 1.3, then: () => this.wormhole(b) });
    if (s.voyage !== was.landing) return out(); // 刚着陆
    if (s.lockLit && !s.multiball && !s.boss && !s.final) {
      s.lockLit = false;
      s.locked++;
      this.balls.splice(this.balls.indexOf(b), 1);
      if (s.locked >= 2) this.startMultiball();
      else {
        this.say(`锁住了 ${s.locked} 个球!`, 2.5);
        this.emit('lock', { n: s.locked });
        this.addBall({ auto: true });
      }
      return;
    }
    if (!s.boss && !s.final && !s.mission) {
      if (was.final) {
        this.startFinal();
        return out();
      }
      if (was.boss) {
        this.startBoss();
        return out();
      }
      if (was.mission) {
        // 选任务: 剩下几个就按挡板换 (多球的时候不选, 直接接第一个)
        const options = this.chapter.missions.map((_, i) => i).filter((i) => !s.done.includes(i));
        s.missionReady = false;
        if (options.length > 1 && this.balls.length === 1) {
          s.pick = { options, i: 0 };
          const def = this.chapter.missions[options[0]];
          this.say(`选任务 (按挡板换): ${def.name} · ${def.goal}`, 3);
          this.emit('pickStart');
          b.held = {
            left: 3,
            then: () => {
              const i = s.pick.options[s.pick.i];
              s.pick = null;
              this.startMission(i);
              this.wormhole(b);
            },
          };
          return;
        }
        this.startMission(options[0]);
        return out();
      }
    }
    if (!was.busy) this.mystery();
    else if (!s.messageLeft || s.messageLeft < 1) this.say('黑洞! 从虫洞出来了', 1.5);
    out();
  }

  // 补给舱: 随便给一样
  mystery() {
    const s = this.state;
    const awards = [
      [3, `补给舱: +${fmt(50000 * this.tier)}`, () => this.add(50000 * this.tier)],
      [2, '补给舱: 护盾 10 秒', () => (s.saveLeft = Math.max(s.saveLeft, 10))],
      [2, '补给舱: 救生舱亮了', () => (s.kickback = true)],
      [2, '补给舱: 奖励倍数 +1', () => (s.mult = Math.min(5, s.mult + 1))],
      [s.multiball || s.locked >= 2 || s.lockLit ? 0 : 1, '补给舱: 锁球灯亮了', () => (s.lockLit = true)],
      [s.done.length >= 3 || s.bossReady || s.finalReady ? 0 : 1, '补给舱: 任务靶全亮', () => ((s.targets = [true, true, true]), (s.missionReady = true))],
      [s.extraGiven ? 0 : 0.4, '补给舱: 加一个球!', () => ((s.extra += 1), (s.extraGiven = true))],
    ];
    const total = awards.reduce((n, a) => n + a[0], 0);
    let r = this.rand() * total;
    const pick = awards.find((a) => (r -= a[0]) < 0) ?? awards[0];
    pick[2]();
    this.say(pick[1], 2);
    this.emit('mystery');
  }

  // 从顶上随便一个虫洞吐出来, 掉进下面那条通道
  wormhole(b) {
    const w = this.table.wormholes[Math.floor(this.rand() * 3)];
    Object.assign(b, { x: w.x, y: w.y, vx: (this.rand() - 0.5) * 40, vy: 150 });
    rolling(b);
    this.emit('wormhole', { x: w.x });
  }

  // 穿梭机出动: 锁住的两个从黑洞吐出来, 再发射一个
  startMultiball() {
    const s = this.state;
    s.multiball = true;
    s.locked = 0;
    s.saveLeft = Math.max(s.saveLeft, 10);
    const ho = this.table.hole;
    for (let k = 0; k < 2; k++) {
      this.after(0.3 + k * 0.5, () => {
        this.balls.push(newBall(this.nextId++, ho.x, ho.y, (k ? 1 : -1) * 380, 300));
        this.emit('eject');
      });
    }
    this.addBall({ auto: true });
    this.say('穿梭机出动! 三个球, 两条坡道都是超级大奖', 4);
    this.emit('multiball');
  }

  // ---- 任务 ----

  startMission(i) {
    const s = this.state;
    const def = this.chapter.missions[i];
    const time = def.time + this.perk.missionTime;
    const was = s.partial[i]; // 上次做到哪了
    delete s.partial[i];
    s.mission = { i, step: was?.step ?? 0, have: was?.have ?? 0, lit: was?.lit ?? (def.each ? [...def.each] : null), left: time, total: time, value: def.hurry ? def.hurry * this.tier : 0, start: def.hurry ? def.hurry * this.tier : 0 };
    s.missionReady = false;
    s.targets = [false, false, false];
    this.say(`任务「${def.name}」: ${def.goal}`, 4);
    this.emit('missionStart', { name: def.name });
  }

  missionShot(name, n) {
    const s = this.state;
    const m = s.mission;
    const def = this.missionDef();
    const each = Math.round(3000 * this.tier * this.perk.missionMult);
    if (m.lit) {
      if (!m.lit.includes(name)) return;
      m.lit = m.lit.filter((x) => x !== name);
      this.add(each);
      if (m.lit.length) {
        this.say(`${def.name}: 还剩 ${m.lit.map((x) => SHOT_NAMES[x]).join('、')}`, 2);
        this.emit('missionStep');
      } else this.missionDone();
      return;
    }
    const step = def.steps[m.step];
    if (!step.shots.includes(name)) return;
    m.have = Math.min(step.need, m.have + n);
    if (!m.value) this.add(each);
    if (m.have < step.need) {
      this.emit('missionStep', { have: m.have, need: step.need });
      return;
    }
    if (m.step + 1 < def.steps.length) {
      m.step++;
      m.have = 0;
      this.say(`${def.name}: 下一步, 打${def.steps[m.step].shots.map((x) => SHOT_NAMES[x]).join('、')}`, 2.5);
      this.emit('missionStep');
      return;
    }
    this.missionDone();
  }

  missionDone() {
    const s = this.state;
    const m = s.mission;
    const def = this.missionDef();
    const award = m.value ? m.value : (40000 + 1000 * Math.ceil(m.left)) * this.tier * this.perk.missionMult;
    this.add(award);
    s.mission = null;
    s.done.push(m.i);
    s.stats.missions++;
    this.say(`任务完成: ${def.name} +${fmt(award)}`, 3);
    this.emit('missionDone', { name: def.name });
    if (s.done.length >= this.chapter.missions.length) {
      s.bossReady = true;
      s.targets = [false, false, false];
      this.after(3, () => this.say(`危机! ${this.chapter.boss.say}。打进黑洞迎战`, 4));
      this.emit('bossReady');
    }
  }

  missionFail() {
    const s = this.state;
    const def = this.missionDef();
    const m = s.mission;
    s.mission = null;
    if (!def.hurry) s.partial[m.i] = { step: m.step, have: m.have, lit: m.lit };
    this.say(`时间到: ${def.name} 没做完${def.hurry ? '' : ', 做到哪留着'} (再打亮任务靶接着做)`, 3);
    this.emit('missionFail', { name: def.name });
  }

  // ---- 危机 (大敌人) ----

  // 随便挑 n 条路线亮 (不要刚打过的)
  pickShots(n, not = []) {
    const pool = SHOTS.filter((x) => !not.includes(x));
    const out = [];
    while (out.length < n && pool.length) out.push(pool.splice(Math.floor(this.rand() * pool.length), 1)[0]);
    return out;
  }

  startBoss() {
    const s = this.state;
    const def = this.chapter.boss;
    s.bossReady = false;
    s.boss = { hp: def.hp, max: def.hp, lit: this.pickShots(2) };
    s.saveLeft = Math.max(s.saveLeft, this.perk.bossSave);
    this.addBall({ auto: true }); // 两个球一起打
    this.say(`危机: ${def.name}! 打亮着的路线`, 4);
    this.emit('bossStart', { kind: def.kind, name: def.name });
  }

  bossHit(name) {
    const s = this.state;
    const def = this.chapter.boss;
    const boss = s.boss;
    boss.hp = Math.max(0, boss.hp - this.perk.bossDamage);
    this.flash.boss = 0.5;
    this.add(15000 * this.tier * this.perk.bossScore);
    this.emit('bossHit', { hp: boss.hp });
    if (boss.hp > 0) {
      boss.lit = this.pickShots(2, [name]);
      this.say(`${def.name} 还剩 ${boss.hp}/${boss.max}`, 1.5);
      return;
    }
    s.boss = null;
    s.stats.bosses++;
    const award = 250000 * this.tier * this.perk.bossScore;
    this.add(award);
    this.say(`渡过危机: ${def.name}! +${fmt(award)}`, 3);
    this.emit('bossDown', { kind: def.kind });
    this.after(2.5, () => this.travel());
  }

  // 跃迁到下一个星系; 四章都过了: 终章准备好了
  travel() {
    const s = this.state;
    if (s.chapter < CHAPTERS.length - 1) {
      s.chapter++;
      s.done = [];
      s.partial = {};
      s.targets = [false, false, false];
      const extra = s.chapter === 1 || s.chapter === 3;
      if (extra) s.extra++;
      this.say(`第 ${s.chapter + 1} 章 · ${this.chapter.name}: ${this.chapter.intro}${extra ? ' · 奖励一个球' : ''}`, 4);
      this.emit('travel', { chapter: s.chapter });
    } else {
      s.finalReady = true;
      this.say('前方就是曙光星! 打进黑洞准备着陆', 4);
      this.emit('finalReady');
    }
  }

  // ---- 终章: 着陆曙光星 ----

  startFinal() {
    const s = this.state;
    s.finalReady = false;
    s.final = { lit: [...FINAL.lit], landing: false };
    s.saveLeft = Math.max(s.saveLeft, 20);
    for (let k = 0; k < 3; k++) this.after(0.2 + k * 1.1, () => s.final && this.addBall({ auto: true }));
    this.say('终章: 着陆曙光星! 四个球, 亮着的路线都是大奖', 4);
    this.emit('finalStart');
  }

  finalShot(name) {
    const s = this.state;
    const f = s.final;
    if (f.landing) {
      if (name === 'hole') this.landing();
      return;
    }
    if (!f.lit.includes(name)) return;
    f.lit = f.lit.filter((x) => x !== name);
    const jackpot = 100000 * this.tier;
    this.add(jackpot);
    this.emit('finalJackpot', { points: jackpot });
    if (f.lit.length) this.say(`着陆准备 ${FINAL.lit.length - f.lit.length}/${FINAL.lit.length} +${fmt(jackpot)}`, 2);
    else {
      f.landing = true;
      this.say('都准备好了: 打进黑洞, 着陆!', 4);
      this.emit('landingReady');
    }
  }

  landing() {
    const s = this.state;
    const award = 2000000 * (s.voyage + 1);
    this.add(award);
    s.stats.landings++;
    s.final = null;
    s.voyage++;
    s.chapter = 0;
    s.done = [];
    s.partial = {};
    s.targets = [false, false, false];
    this.say(`${STORY.ending} +${fmt(award)}`, 6);
    this.emit('landing', { points: award });
  }

  // 撞台子: 把球撞开一点; 8 秒内撞第 3 次就倾斜
  nudge() {
    const s = this.state;
    if (s.status !== 'play' || s.tilt) return;
    this.flash.shake = 0.25;
    for (const b of this.balls) {
      if (b.ramp || b.held || b.x > LANE_X) continue;
      b.vx += (this.rand() - 0.5) * 300;
      b.vy -= 260;
    }
    const now = this.time;
    this.nudges = this.nudges.filter((x) => now - x < 8);
    this.nudges.push(now);
    this.emit('bump');
    if (this.nudges.length >= 3) {
      s.tilt = true;
      this.nudges = [];
      this.say('倾斜了! 这个球挡板不动, 不算分', 4);
      this.emit('tilt');
    } else if (this.nudges.length === 2) {
      this.say('小心! 再撞就倾斜', 2);
      this.emit('tiltWarn');
    }
  }

  // 多球剩一个了
  endMulti() {
    const s = this.state;
    if (s.multiball) {
      s.multiball = false;
      this.say('穿梭机回来了', 2);
      this.emit('multiballEnd');
    }
    if (s.final) {
      s.final = null;
      s.finalReady = true;
      this.say('着陆失败, 再打进黑洞重来', 3);
      this.emit('finalEnd');
    }
  }

  drainBall(b) {
    const s = this.state;
    this.balls.splice(this.balls.indexOf(b), 1);
    const others = this.balls.length > 0;
    // 护盾: 救回来 (多球的时候每个都救, 自己发射)
    if (s.saveLeft > 0 && !s.tilt) {
      if (!others) {
        s.saveLeft = 0;
        s.saved = true;
      }
      this.say('护盾! 再来一次');
      this.emit('save');
      this.addBall({ auto: others });
      return;
    }
    if (others) {
      if (this.balls.length === 1) this.endMulti();
      return;
    }
    // 医生急救
    if (s.medic > 0 && !s.tilt) {
      s.medic--;
      this.say(`急救! ${crewById('medic').name}把球救回来了${s.medic ? ` (还能 ${s.medic} 次)` : ''}`, 2.5);
      this.emit('medic');
      this.addBall();
      return;
    }
    // 这个球没了: 任务失败, 终章没成 (危机还在, 下个球接着打)
    if (s.mission) this.missionFail();
    s.pick = null;
    this.endMulti();
    const bonus = s.tilt ? 0 : s.bonus * s.mult;
    this.add(bonus);
    s.status = 'drained';
    this.timer = 2;
    this.say(s.tilt ? '倾斜了, 这个球没有奖励分' : bonus ? `球掉了 · 奖励分 ${fmt(s.bonus)} × ${s.mult} = ${fmt(bonus)}` : '球掉了', 2);
    this.emit('drain', { bonus });
  }

  nextBall() {
    const s = this.state;
    s.mult = this.perk.mult;
    s.bonus = 0;
    s.saved = false;
    s.tilt = false;
    s.warp = 0;
    s.combo = { n: 0, at: -99 };
    if (this.perk.kickback >= 2) s.kickback = true;
    if (s.extra > 0) {
      s.extra--;
      this.say('奖励的球, 再来!');
    } else if (s.ball < BALLS) {
      s.ball++;
      this.say(s.ball === BALLS ? '最后一个球了, 加油!' : `第 ${s.ball} 个球`);
    } else {
      s.status = 'over';
      this.say('游戏结束', 99);
      this.emit('over', { score: s.score });
      return;
    }
    this.addBall();
  }
}
