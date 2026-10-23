// 弹珠台「星际远航」: 台面、物理、规则 (3D 画面在 pinball3d.js, 页面在 views/pinball.js)。不碰网页, 能在测试里跑。
//   台面 600 × 1000 (单位随便叫「点」), x 往右、y 往下 (台面是斜的, 球受重力往下滚), z 是离台面多高 (坡道上)
//   物理: 每 1/600 秒走一步 (球一步最多走 7 点, 比球的半径小, 穿不过墙); 墙是线段, 碰到了推出来、
//         法向速度按弹性反过来、切向按摩擦减一点; 挡板是转动的胶囊, 碰撞时算上挡板那一点的速度; 几个球之间也会撞
//   坡道: 球从入口冲上去就离开台面, 沿着坡道的路线走 (上坡减速、下坡加速), 冲不上去就滚回来; 下来落到右边回球道
//
// 玩法:
//   发射: 顶上三条「再入」通道有一条在闪, 一发射就落进那条 → 技巧射击
//   顶上三条通道都亮 → 奖励倍数 +1 (最多 ×5, 按挡板挪亮着的灯)
//   小行星 (蘑菇头)、弹弓、环绕轨道 (沿顶上圆弧绕一圈)、推进器 (右边的转片)
//   曲速坡道: 打上去一次曲速 +1, 到 5 级「跃迁」大奖; 打上去两次锁球灯亮
//   黑洞: 吸进去从顶上的虫洞吐出来; 锁球灯亮着: 锁住一个球, 锁满两个「舰队出击」三个球一起玩, 坡道是超级大奖
//   星座: 左边五个掉落靶都打倒 → 连成一个星座, 左下的救生舱亮 (球掉进左边出局道弹回去一次)
//   任务: 右边三个任务靶都打亮 → 打进黑洞接任务; 做完升军衔 (学员 → …… → 舰队司令), 军衔越高分越多, 到上尉、上校各送一个球
//   护盾: 每个球开始 10 秒内掉了救回来; 撞台子 (N 键 / 按钮) 能把球撞开, 撞太多倾斜, 这个球挡板不动、不算分

export const W = 600;
export const H = 1000;
export const BALL_R = 11;
export const BALLS = 3;
const STEP = 1 / 600;
const MAX_STEPS = 24; // 一帧最多走几步 (卡了一下的话宁可慢一点, 别一下子算太多)
const GRAVITY = 1250; // 沿着台面往下
const G_UP = 9800; // 坡道往上 (真的重力)
const MAX_SPEED = 4200;
const FLIP_UP = 26; // 挡板往上打, 弧度 / 秒
const FLIP_DOWN = 15;
const SAVE_TIME = 10;
const PULL_TIME = 0.9; // 弹簧拉满要几秒
export const LANE_X = 540; // 发射通道在这右边

export const RANKS = ['学员', '少尉', '中尉', '上尉', '少校', '中校', '上校', '准将', '舰队司令'];
export const EXTRA_BALL_RANKS = [3, 6];
// 任务: 做什么 (事件)、几次
export const MISSIONS = [
  { name: '发射训练', goal: '打上曲速坡道 1 次', event: 'ramp', need: 1 },
  { name: '小行星带', goal: '打小行星 15 下', event: 'bumper', need: 15 },
  { name: '侦察', goal: '环绕轨道 2 圈', event: 'orbit', need: 2 },
  { name: '星座导航', goal: '打倒一整排星座靶', event: 'constellation', need: 1 },
  { name: '推进器', goal: '推进器转 40 圈', event: 'spin', need: 40 },
  { name: '跃迁训练', goal: '打上曲速坡道 3 次', event: 'ramp', need: 3 },
  { name: '黑洞探索', goal: '进黑洞 2 次', event: 'hole', need: 2 },
  { name: '雷达扫描', goal: '打任务靶 6 次', event: 'target', need: 6 },
  { name: '舰队出击', goal: '锁住两个球, 开始多球', event: 'multiball', need: 1 },
];
export const CONSTELLATIONS = ['猎户座', '北斗七星', '天蝎座', '仙后座', '天鹅座', '狮子座'];
export const WARP_MAX = 5;

// ---- 台面 ----
const seg = (ax, ay, bx, by, o = {}) => ({ ax, ay, bx, by, e: 0.45, mu: 0.08, r: 0, ...o });
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

// 坡道入口: 口子中间 M, 朝里的方向 d (往左上), 宽 50, 深 55
const RAMP_M = [150, 560];
const RAMP_D = norm(-0.546, -0.838);
const RAMP_P = { x: -RAMP_D.y, y: RAMP_D.x }; // 跟口子平行
const at = (p, v, k) => [p[0] + v.x * k, p[1] + v.y * k];
const RAMP_A = at(RAMP_M, RAMP_P, 25);
const RAMP_B = at(RAMP_M, RAMP_P, -25);
const RAMP_A2 = at(RAMP_A, RAMP_D, 55);
const RAMP_B2 = at(RAMP_B, RAMP_D, 55);

// 坡道的路线 (x, y, z): 从入口往左上爬, 从虫洞顶上横过去, 沿右边下来, 落进右边的回球道
const RAMP_POINTS = [
  [(RAMP_A2[0] + RAMP_B2[0]) / 2, (RAMP_A2[1] + RAMP_B2[1]) / 2, 4],
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
    ramp: [
      [RAMP_A, RAMP_A2],
      [RAMP_B, RAMP_B2],
    ],
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
    ...rails.ramp.map(([[ax, ay], [bx, by]]) => seg(ax, ay, bx, by, { r: 3, e: 0.35 })),
  ];
  // 单向门: 只挡从「挡的那一边」(n 指的那边) 过来的球。发射通道口 (从上面掉下来的拨到台面上); 左边回旋道 (往上能过, 从上面下来的拨到台面上)
  const gates = [
    { ...seg(580, 398, LANE_X, 432, { e: 0.3 }), n: norm(-34, -40) },
    { ...seg(20, 340, 82, 392, { e: 0.3 }), n: norm(52, -62) },
  ];
  const posts = [
    { x: 58, y: 690, r: 6 },
    { x: mx(58), y: 690, r: 6 },
    { x: RAMP_A[0], y: RAMP_A[1], r: 7 },
    { x: RAMP_B[0], y: RAMP_B[1], r: 7 },
  ];
  // 弹弓: 三角形, 朝里的那条边会把球弹出去 (下边跟导轨之间要留够一个球过去的空)
  const sling = (a, b, c, i) => [seg(a[0], a[1], b[0], b[1]), seg(b[0], b[1], c[0], c[1]), seg(a[0], a[1], c[0], c[1], { kick: 1000, sling: i, e: 0.6 })];
  const slingShapes = [
    [[95, 730], [95, 808], [148, 842]],
    [[mx(95), 730], [mx(95), 808], [mx(148), 842]],
  ];
  const slings = slingShapes.flatMap(([a, b, c], i) => sling(a, b, c, i));
  const bumpers = [
    { x: 220, y: 250, r: 28 },
    { x: 340, y: 250, r: 28 },
    { x: 280, y: 335, r: 28 },
  ];
  // 左边五个星座靶 (掉落靶, 贴着墙, 朝右)
  const drops = [440, 472, 504, 536, 568].map((y) => ({ ...seg(34, y, 34, y + 26, { e: 0.35 }), up: true }));
  // 右边三个任务靶 (斜着摆, 朝左下的挡板; 斜的, 球不会停在上面)
  const tdir = norm(0.868, 0.496);
  const targets = [[400, 455], [425, 485], [450, 515]].map(([x, y]) => seg(x - tdir.x * 12, y - tdir.y * 12, x + tdir.x * 12, y + tdir.y * 12, { r: 4, e: 0.4 }));
  const flippers = [
    { side: 'left', px: 185, py: 905, len: 85, r0: 13, r1: 7, rest: 0.52, up: -0.48 },
    { side: 'right', px: mx(185), py: 905, len: 85, r0: 13, r1: 7, rest: Math.PI - 0.52, up: Math.PI + 0.48 },
  ].map((f) => ({ ...f, angle: f.rest, omega: 0 }));
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
    ramp: { door: [RAMP_A2, RAMP_B2], in: RAMP_D, path: sampleCurve(RAMP_POINTS), exit: { vx: 0, vy: 520 } },
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

// 球碰到一个点附近 (cx, cy, 加上半径 rad): 推出来, 反弹。vx0, vy0: 碰到的那一点自己在动的速度 (挡板)。
// 返回撞上去的速度 (法向), 没碰到返回 -1
function resolve(b, cx, cy, rad, { e = 0.45, mu = 0.08, kick = 0, vx0 = 0, vy0 = 0, fallback = null }) {
  let dx = b.x - cx;
  let dy = b.y - cy;
  const reach = b.r + rad;
  const d2 = dx * dx + dy * dy;
  if (d2 >= reach * reach) return -1;
  let d = Math.sqrt(d2);
  if (d < 1e-6) {
    ({ x: dx, y: dy } = fallback ?? { x: 0, y: -1 });
    d = 0;
  } else {
    dx /= d;
    dy /= d;
  }
  b.x = cx + dx * reach;
  b.y = cy + dy * reach;
  const rvx = b.vx - vx0;
  const rvy = b.vy - vy0;
  const vn = rvx * dx + rvy * dy;
  if (vn >= 0) return 0;
  const tx = -dy;
  const ty = dx;
  let vt = rvx * tx + rvy * ty;
  // 撞得很轻 (就是在上面滚): 不弹, 免得一直抖
  let out = -vn < 40 ? 0 : -vn * e;
  if (kick && -vn > 60) out = Math.max(out, kick);
  // 摩擦: 跟撞得多重成正比 (滚的时候几乎不减速)
  const dvt = Math.min(Math.abs(vt), mu * (out - vn));
  vt -= Math.sign(vt) * dvt;
  b.vx = vx0 + dx * out + tx * vt;
  b.vy = vy0 + dy * out + ty * vt;
  return -vn;
}

function hitSegment(b, s) {
  const [cx, cy] = closest(b.x, b.y, s);
  if (s.n) {
    // 单向门: 球心在挡的那一边才挡
    if ((b.x - cx) * s.n.x + (b.y - cy) * s.n.y < 0) return -1;
    if ((b.x - s.ax) * s.n.x + (b.y - s.ay) * s.n.y < 0) return -1;
  }
  return resolve(b, cx, cy, s.r, { e: s.e, mu: s.mu, kick: s.kick, fallback: s.n ?? norm(-(s.by - s.ay), s.bx - s.ax) });
}

export function flipperTip(f) {
  return [f.px + Math.cos(f.angle) * f.len, f.py + Math.sin(f.angle) * f.len];
}

function hitFlipper(b, f) {
  const [tx, ty] = flipperTip(f);
  const [cx, cy, t] = closest(b.x, b.y, { ax: f.px, ay: f.py, bx: tx, by: ty });
  const rad = f.r0 + (f.r1 - f.r0) * t;
  // 挡板那一点的速度: ω × r
  const vx0 = -f.omega * (cy - f.py);
  const vy0 = f.omega * (cx - f.px);
  return resolve(b, cx, cy, rad, { e: 0.28, mu: 0.25, vx0, vy0, fallback: { x: 0, y: -1 } });
}

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
export class Pinball {
  constructor({ rand = Math.random } = {}) {
    this.rand = rand;
    this.table = buildTable();
    this.input = { left: false, right: false, plunger: false, nudge: false };
    this.prevInput = { ...this.input };
    this.events = []; // 给画面、声音用: { type, ... }
    this.flash = { bumper: [0, 0, 0], sling: [0, 0], drop: [0, 0, 0, 0, 0], target: [0, 0, 0], lane: [0, 0, 0], hole: 0, orbit: 0, ramp: 0, spinner: 0, warp: 0, shake: 0 };
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
      mult: 1, // 奖励倍数 (顶上通道)
      bonus: 0,
      lanes: [false, false, false],
      skillLane: -1, // 技巧射击: 闪的那条
      drops: 0, // 星座连了几个
      kickback: false,
      saved: false, // 这个球用过护盾了
      saveLeft: 0,
      pull: 0, // 弹簧拉了多少 0–1
      warp: 0, // 曲速几级
      ramps: 0, // 这一阵打上坡道几次 (两次锁球灯亮)
      lockLit: false,
      locked: 0, // 锁住了几个球
      multiball: false,
      rank: 0,
      targets: [false, false, false],
      missionReady: false,
      mission: null, // { i 第几个任务, have 做了几次 }
      missionIndex: 0, // 下一个是第几个任务
      tilt: false,
      message: '拉弹簧, 松开发射',
      messageLeft: 6,
    };
    this.addBall();
  }

  // 第一个球 (只有一个球的时候就是它)
  get ball() {
    return this.balls[0] ?? null;
  }

  emit(type, extra = {}) {
    this.events.push({ type, ...extra });
  }

  say(message, seconds = 2.5) {
    this.state.message = message;
    this.state.messageLeft = seconds;
  }

  add(points) {
    if (!this.state.tilt) this.state.score += points;
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

  // 一个新球放进发射通道 (auto: 自己发射, 多球、锁球、护盾以后用)
  addBall({ auto = false } = {}) {
    const p = this.table.plunger;
    const b = { id: this.nextId++, x: p.x, y: p.top - BALL_R, z: 0, vx: 0, vy: 0, r: BALL_R, ramp: null, held: null, slow: 0 };
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
    // 按下挡板: 顶上亮着的通道跟着挪
    for (const side of ['left', 'right']) {
      if (input[side] && !this.prevInput[side] && live) {
        this.emit('flip', { side });
        if (s.status === 'play') s.lanes = side === 'left' ? [...s.lanes.slice(1), s.lanes[0]] : [s.lanes[2], ...s.lanes.slice(0, 2)];
      }
    }
    for (const f of t.flippers) {
      const held = input[f.side] && live;
      const target = held ? f.up : f.rest;
      const diff = target - f.angle;
      const move = Math.sign(diff) * Math.min(Math.abs(diff), (held ? FLIP_UP : FLIP_DOWN) * h);
      f.angle += move;
      f.omega = move / h;
    }
    if (input.nudge && !this.prevInput.nudge) this.nudge();
    // 弹簧: 按住拉, 松开发射 (发射通道底下的球)
    if (input.plunger) s.pull = Math.min(1, s.pull + h / PULL_TIME);
    else if (this.prevInput.plunger) {
      const b = this.balls.find((x) => x.x > LANE_X && x.y > t.plunger.top - 60 && !x.held);
      if (b && s.pull > 0.04) {
        b.vy = -(1000 + 2600 * s.pull);
        b.vx = 0;
        if (s.status === 'ready') {
          s.status = 'play';
          if (!s.saved) s.saveLeft = SAVE_TIME;
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
    if (s.saveLeft > 0 && s.status === 'play') s.saveLeft = Math.max(0, s.saveLeft - h);

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
    const speed = Math.hypot(b.vx, b.vy);
    if (speed > MAX_SPEED) {
      b.vx *= MAX_SPEED / speed;
      b.vy *= MAX_SPEED / speed;
    }
    b.vx *= 1 - 0.08 * h;
    b.vy *= 1 - 0.08 * h;
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
    const door = t.ramp.door;
    const doorSeg = { ax: door[0][0], ay: door[0][1], bx: door[1][0], by: door[1][1], r: 0, e: 0.3, mu: 0.1 };
    const [dcx, dcy] = closest(b.x, b.y, doorSeg);
    if ((b.x - dcx) ** 2 + (b.y - dcy) ** 2 < (b.r + 2) ** 2) {
      const inward = b.vx * t.ramp.in.x + b.vy * t.ramp.in.y;
      if (inward > 300) {
        b.ramp = { s: 0, v: Math.min(inward, 2800) };
        this.emit('rampEnter');
        return;
      }
    }

    for (let pass = 0; pass < 2; pass++) {
      for (const w of t.walls) hitSegment(b, w);
      hitSegment(b, doorSeg);
      for (const g of t.gates) hitSegment(b, g);
      for (const p of t.posts) resolve(b, p.x, p.y, p.r, { e: 0.5 });
      for (const w of t.slings) {
        const hit = hitSegment(b, w);
        if (w.sling !== undefined && hit > 60 && this.cooled(`sling${w.sling}`, 0.1)) {
          this.flash.sling[w.sling] = 0.15;
          this.add(50);
          s.bonus += 5;
          this.emit('sling', { i: w.sling, x: b.x, y: b.y });
        }
      }
      t.bumpers.forEach((p, i) => {
        const hit = resolve(b, p.x, p.y, p.r, { e: 0.5, kick: s.tilt ? 0 : 900 });
        if (hit > 30 && this.cooled(`bumper${i}`, 0.08)) {
          this.flash.bumper[i] = 0.18;
          this.add(100 * (s.rank + 1));
          s.bonus += 10;
          this.emit('bumper', { i, x: b.x, y: b.y });
          this.progress('bumper');
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

  // 在坡道上: 沿路线走; 上坡减速 (真的重力) 下坡加速, 冲不上去就滚回来
  rideRamp(b, h) {
    const t = this.table;
    const r = b.ramp;
    const path = t.ramp.path;
    const p = rampAt(path, r.s);
    r.v += (-G_UP * p.dz + GRAVITY * p.dy) * h;
    r.v *= 1 - 0.25 * h;
    r.v = Math.min(r.v, 3000);
    r.s += r.v * h;
    if (r.s <= 0) {
      // 滚回入口: 放回台面, 往外滚
      const back = Math.max(200, -r.v);
      b.ramp = null;
      const d = t.ramp.door;
      Object.assign(b, { x: (d[0][0] + d[1][0]) / 2 - t.ramp.in.x * 4, y: (d[0][1] + d[1][1]) / 2 - t.ramp.in.y * 4, z: 0, vx: -t.ramp.in.x * back, vy: -t.ramp.in.y * back });
      this.emit('rampFail');
      return;
    }
    if (r.s >= path.total) {
      // 下来了: 落进右边的回球道
      const end = rampAt(path, path.total);
      b.ramp = null;
      Object.assign(b, { x: end.x, y: end.y, z: 0, vx: t.ramp.exit.vx, vy: Math.max(t.ramp.exit.vy, r.v * 0.4) });
      this.rampDone();
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
      this.add(500);
      s.bonus += 20;
      if (s.skillLane >= 0) {
        if (s.skillLane === i) {
          this.add(15000);
          this.say('技巧射击! +15,000', 3);
          this.emit('skill');
        }
        s.skillLane = -1;
      }
      s.lanes[i] = true;
      this.emit('lane', { i });
      if (s.lanes.every(Boolean)) {
        s.lanes = [false, false, false];
        if (s.mult < 5) s.mult++;
        this.add(2000);
        this.say(`再入大气层! 奖励 ×${s.mult}`);
        this.emit('mult', { mult: s.mult });
      }
    });
    // 球掉下来过了顶上通道还没进: 技巧射击就算了
    if (s.skillLane >= 0 && play && b.y > 400 && b.x < LANE_X) s.skillLane = -1;
    // 环绕轨道
    if (play && inside(b, t.orbit) && Math.abs(b.vx) > 500 && this.cooled(`orbit${b.id}`, 1.5)) {
      this.flash.orbit = 0.6;
      const points = 1500 * (s.rank + 1);
      this.add(points);
      s.bonus += 30;
      this.say(`环绕轨道! +${points.toLocaleString('en-US')}`, 1.5);
      this.emit('orbit');
      this.progress('orbit');
    }
    // 推进器 (转片): 冲过去转几圈
    const sp = t.spinner;
    if (crossed(px, py, b.x, b.y, [sp.ax, sp.y], [sp.bx, sp.y]) && this.cooled(`spin${b.id}`, 0.3)) {
      const spins = Math.max(1, Math.min(20, Math.round(Math.abs(b.vy) / 160)));
      this.flash.spinner = Math.min(2, spins * 0.08);
      this.add(100 * spins);
      s.bonus += spins;
      this.emit('spinner', { spins });
      this.progress('spin', spins);
    }
    t.inlanes.forEach((l, i) => {
      if (inside(b, l) && this.cooled(`in${b.id}:${i}`, 0.6)) {
        this.add(200);
        this.emit('inlane', { i });
      }
    });
    t.outlanes.forEach((l, i) => {
      if (!inside(b, l) || !this.cooled(`out${b.id}:${i}`, 0.6)) return;
      this.add(500);
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

  dropHit(i) {
    const s = this.state;
    const d = this.table.drops[i];
    d.up = false;
    this.flash.drop[i] = 0.3;
    this.add(500 * (s.rank + 1));
    s.bonus += 30;
    this.emit('drop', { i });
    if (this.table.drops.every((x) => !x.up)) {
      const name = CONSTELLATIONS[s.drops % CONSTELLATIONS.length];
      s.drops++;
      this.add(5000 * (s.rank + 1));
      s.kickback = true;
      this.say(`连成了${name}! 救生舱准备好了`);
      this.emit('constellation', { name });
      this.progress('constellation');
      this.after(1.5, () => {
        this.table.drops.forEach((x) => (x.up = true));
        this.emit('dropsReset');
      });
    }
  }

  targetHit(i) {
    const s = this.state;
    this.flash.target[i] = 0.3;
    this.add(300 * (s.rank + 1));
    s.bonus += 20;
    this.emit('target', { i });
    this.progress('target');
    if (s.mission || s.missionReady) return;
    s.targets[i] = true;
    if (s.targets.every(Boolean)) {
      s.missionReady = true;
      this.say(`任务准备好了: 打进黑洞接「${MISSIONS[s.missionIndex].name}」`, 3);
      this.emit('missionReady');
    }
  }

  rampDone() {
    const s = this.state;
    this.flash.ramp = 0.8;
    s.ramps++;
    if (s.multiball) {
      const jackpot = 30000 * (s.rank + 1);
      this.add(jackpot);
      this.say(`超级大奖! +${jackpot.toLocaleString('en-US')}`, 3);
      this.emit('jackpot', { points: jackpot });
    }
    s.warp = Math.min(WARP_MAX, s.warp + 1);
    this.add(2000 * s.warp);
    s.bonus += 50;
    this.flash.warp = 1;
    if (s.warp >= WARP_MAX) {
      const prize = 25000 * (s.rank + 1);
      this.add(prize);
      s.warp = 0;
      this.say(`跃迁! +${prize.toLocaleString('en-US')}`, 3);
      this.emit('hyperspace', { points: prize });
    } else if (!s.multiball) this.say(`曲速 ${s.warp} 级`, 1.5);
    if (!s.multiball && !s.lockLit && s.locked < 2 && s.ramps >= 2) {
      s.lockLit = true;
      s.ramps = 0;
      this.say('锁球灯亮了: 打进黑洞锁住一个球', 2.5);
      this.emit('lockLit');
    }
    this.emit('ramp', { warp: s.warp });
    this.progress('ramp');
  }

  // 进了黑洞: 锁球 / 接任务 / 吸住一会儿从虫洞出来
  holeIn(b) {
    const s = this.state;
    const ho = this.table.hole;
    Object.assign(b, { x: ho.x, y: ho.y, vx: 0, vy: 0 });
    this.flash.hole = 1.4;
    this.add(2500 * (s.rank + 1));
    s.bonus += 50;
    this.emit('hole');
    this.progress('hole');
    if (s.lockLit && !s.multiball) {
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
    if (s.missionReady && !s.mission) {
      s.missionReady = false;
      s.targets = [false, false, false];
      s.mission = { i: s.missionIndex, have: 0 };
      const m = MISSIONS[s.missionIndex];
      this.say(`任务「${m.name}」: ${m.goal}`, 4);
      this.emit('missionStart', { name: m.name });
    } else this.say('黑洞! 从虫洞出来了', 1.5);
    b.held = { left: 1.3, then: () => this.wormhole(b) };
  }

  // 从顶上随便一个虫洞吐出来, 掉进下面那条通道
  wormhole(b) {
    const w = this.table.wormholes[Math.floor(this.rand() * 3)];
    Object.assign(b, { x: w.x, y: w.y, vx: (this.rand() - 0.5) * 40, vy: 150 });
    this.emit('wormhole', { x: w.x });
  }

  startMultiball() {
    const s = this.state;
    s.multiball = true;
    s.locked = 0;
    s.saveLeft = SAVE_TIME;
    const ho = this.table.hole;
    // 锁住的两个从黑洞吐出来, 再发射一个
    for (let k = 0; k < 2; k++) {
      this.after(0.3 + k * 0.5, () => {
        this.balls.push({ id: this.nextId++, x: ho.x, y: ho.y, z: 0, vx: (k ? 1 : -1) * 380, vy: 300, r: BALL_R, ramp: null, held: null, slow: 0 });
        this.emit('eject');
      });
    }
    this.addBall({ auto: true });
    this.say('舰队出击! 三个球, 坡道是超级大奖', 4);
    this.emit('multiball');
    this.progress('multiball');
  }

  // 任务进度
  progress(event, n = 1) {
    const s = this.state;
    if (!s.mission || s.tilt) return;
    const m = MISSIONS[s.mission.i];
    if (m.event !== event) return;
    s.mission.have += n;
    if (s.mission.have < m.need) {
      this.emit('missionStep', { have: s.mission.have, need: m.need });
      return;
    }
    // 做完了: 升军衔
    const award = 10000 * (s.rank + 1);
    this.add(award);
    s.mission = null;
    s.missionIndex = (s.missionIndex + 1) % MISSIONS.length;
    if (s.rank < RANKS.length - 1) {
      s.rank++;
      const ball = EXTRA_BALL_RANKS.includes(s.rank);
      if (ball) s.extra++;
      this.say(`任务完成! 升为${RANKS[s.rank]} +${award.toLocaleString('en-US')}${ball ? ' · 奖励一个球' : ''}`, 4);
      this.emit('rankUp', { rank: s.rank, name: RANKS[s.rank] });
    } else {
      this.say(`任务完成! +${award.toLocaleString('en-US')}`, 3);
      this.emit('missionDone');
    }
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

  drainBall(b) {
    const s = this.state;
    this.balls.splice(this.balls.indexOf(b), 1);
    // 护盾: 救回来 (多球的时候每个都救)
    if (s.saveLeft > 0 && !s.tilt) {
      if (!s.multiball) {
        s.saveLeft = 0;
        s.saved = true;
      }
      this.say('护盾! 再来一次');
      this.emit('save');
      this.addBall({ auto: s.multiball });
      return;
    }
    if (this.balls.length) {
      if (s.multiball && this.balls.length === 1) {
        s.multiball = false;
        this.say('舰队回来了', 2);
        this.emit('multiballEnd');
      }
      return;
    }
    s.multiball = false;
    const bonus = s.tilt ? 0 : s.bonus * s.mult;
    this.add(bonus);
    s.status = 'drained';
    this.timer = 2;
    this.say(s.tilt ? '倾斜了, 这个球没有奖励分' : bonus ? `球掉了 · 奖励分 ${s.bonus.toLocaleString('en-US')} × ${s.mult} = ${bonus.toLocaleString('en-US')}` : '球掉了', 2);
    this.emit('drain', { bonus });
  }

  nextBall() {
    const s = this.state;
    s.mult = 1;
    s.bonus = 0;
    s.saved = false;
    s.tilt = false;
    s.warp = 0;
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
