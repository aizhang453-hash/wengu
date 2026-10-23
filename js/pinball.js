// 弹珠台: 台面、物理、规则 (画在 views/pinball.js)。不碰网页, 能在测试里跑。
//   台面 600 × 1000 (单位随便叫「点」), y 往下; 球受重力往下滚 (台面是斜的)
//   物理: 每 1/600 秒走一步 (球一步最多走 7 点, 比球的半径小, 穿不过墙);
//         墙是线段, 碰到了推出来、法向速度按弹性反过来、切向按摩擦减一点; 挡板是转动的胶囊, 碰撞时算上挡板那一点的速度
//   规则: 3 个球; 蘑菇头 (弹跳柱) 100、弹弓 50; 顶上三条通道都亮 → 奖励倍数 +1 (最多 ×5);
//         左边三个掉落靶都打下 → 3000, 左下的救命弹亮; 中间「温故而知新」五个靶都打亮 → 10000 × 倍数 (一局第一次再奖励一个球);
//         沿顶上的圆弧绕一圈 (回旋) 1000; 黑洞 1500 (吸住一会儿再吐出来); 每个球开始 8 秒内掉了救回来一次; 掉了算奖励分 × 倍数

export const W = 600;
export const H = 1000;
export const BALL_R = 11;
export const BALLS = 3;
const STEP = 1 / 600;
const MAX_STEPS = 24; // 一帧最多走几步 (卡了一下的话宁可慢一点, 别一下子算太多)
const GRAVITY = 1250;
const MAX_SPEED = 4200;
const FLIP_UP = 26; // 挡板往上打, 弧度 / 秒
const FLIP_DOWN = 15;
const SAVE_TIME = 8;
const PULL_TIME = 0.9; // 弹簧拉满要几秒
const LANE_X = 540; // 发射通道在这右边
export const CHARS = ['温', '故', '而', '知', '新'];

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

export function buildTable() {
  // 画出来的那些栏杆 (画面也照这些画): 下面的导轨、出局道上面的小鼓包、顶上三条通道的隔板
  const rails = {
    // 外边是出局道, 里边是回球道。导轨盖过挡板转轴, 球从导轨直接滚到挡板上面, 碰不到转轴的圆头
    // (不然慢慢滚下来的球会停在中间的小坑里)
    guides: [
      [[58, 690], [58, 842], [192, 886]],
      [[mx(58), 690], [mx(58), 842], [mx(192), 886]],
    ],
    // 右边墙上的小鼓包: 贴着墙滚下来的球往里推一点, 不一定掉进出局道
    // (左边不放: 左边有救命弹, 鼓包会挡住弹回去的球)
    bulges: [[[LANE_X, 610], [mx(54), 652], [LANE_X, 690]]],
    dividers: [225, 275, 325, 375].map((x) => [[x, 92], [x, 150]]),
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
  ];
  // 单向门: 只挡从「挡的那一边」(n 指的那边) 过来的球。发射通道口 (从上面掉下来的拨到台面上); 左边回旋道 (往上能过, 从上面下来的拨到台面上)
  const gates = [
    { ...seg(580, 398, LANE_X, 432, { e: 0.3 }), n: norm(-34, -40) },
    { ...seg(20, 340, 82, 392, { e: 0.3 }), n: norm(52, -62) },
  ];
  const posts = [
    { x: 58, y: 690, r: 6 },
    { x: mx(58), y: 690, r: 6 },
  ];
  // 弹弓: 三角形, 朝里的那条边会把球弹出去
  const sling = (a, b, c, i) => [seg(a[0], a[1], b[0], b[1]), seg(b[0], b[1], c[0], c[1]), seg(a[0], a[1], c[0], c[1], { kick: 1000, sling: i, e: 0.6 })];
  // (下边跟导轨之间要留够一个球过去的空)
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
  // 左边三个掉落靶 (朝右), 中间一排「温故而知新」五个站立靶 (中间有空, 球能穿过去)
  const drops = [500, 534, 568].map((y) => ({ ...seg(34, y, 34, y + 28, { e: 0.35 }), up: true }));
  // (只挡从下面打上来的: 从上面掉下来的穿过去, 不然球会停在靶子上面)
  const chars = [184, 232, 280, 328, 376].map((x) => ({ ...seg(x - 11, 470, x + 11, 470, { r: 4, e: 0.4 }), n: { x: 0, y: 1 } }));
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
    chars,
    flippers,
    lanes: [250, 300, 350].map((x) => ({ x, y: 122, r: 14 })),
    inlanes: [{ x: 77, y: 790, r: 13 }, { x: mx(77), y: 790, r: 13 }],
    outlanes: [{ x: 39, y: 880, r: 14 }, { x: mx(39), y: 880, r: 14 }],
    orbit: { x: 300, y: 36, r: 18 }, // 顶上圆弧的最高处
    saucer: { x: 82, y: 432, r: 15 },
    plunger: { x: 560, y: 975, top: 975 },
  };
}

// ---- 碰撞 ----
function norm(x, y) {
  const l = Math.hypot(x, y) || 1;
  return { x: x / l, y: y / l };
}

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

const inside = (b, s) => (b.x - s.x) ** 2 + (b.y - s.y) ** 2 < s.r * s.r;

// ---- 一局 ----
export class Pinball {
  constructor({ rand = Math.random } = {}) {
    this.rand = rand;
    this.table = buildTable();
    this.input = { left: false, right: false, plunger: false };
    this.events = []; // 给画面、声音用: { type, ... }
    this.flash = { bumper: [0, 0, 0], sling: [0, 0], char: [0, 0, 0, 0, 0], drop: [0, 0, 0], lane: [0, 0, 0], saucer: 0, orbit: 0 };
    this.acc = 0;
    this.time = 0;
    this.state = {
      status: 'ready', // ready 球在发射通道里 | play | saucer 被黑洞吸住 | drained 掉了 (算奖励分) | over
      score: 0,
      ball: 1, // 第几个球
      extra: 0, // 奖励的球
      mult: 1,
      bonus: 0,
      lanes: [false, false, false],
      chars: [false, false, false, false, false],
      kickback: false,
      saved: false, // 这个球救过了
      extraGiven: false, // 这局奖励过球了 (「温故而知新」一局只奖励一个球)
      saveLeft: 0,
      pull: 0, // 弹簧拉了多少 0–1
      message: '按住空格拉弹簧, 松开发射 (手机上按住右下角「发射」)',
      messageLeft: 6,
    };
    this.ball = { x: 0, y: 0, vx: 0, vy: 0, r: BALL_R };
    this.cool = new Map(); // 同一个东西刚撞过, 一会儿内不再算分
    this.slow = 0; // 球几乎不动了多久 (卡住了推一下)
    this.timer = 0; // 黑洞吸着 / 掉了以后等多久
    this.prevInput = { left: false, right: false, plunger: false };
    this.later = []; // 过一会儿做的事 [{ at 游戏里的时间, fn }] (暂停了也跟着停)
    this.toLane();
  }

  after(seconds, fn) {
    this.later.push({ at: this.time + seconds, fn });
    this.later.sort((a, b) => a.at - b.at);
  }

  emit(type, extra = {}) {
    this.events.push({ type, ...extra });
  }

  say(message, seconds = 2.5) {
    this.state.message = message;
    this.state.messageLeft = seconds;
  }

  add(points) {
    this.state.score += points;
  }

  // 球放回发射通道
  toLane() {
    const p = this.table.plunger;
    Object.assign(this.ball, { x: p.x, y: p.top - BALL_R, vx: 0, vy: 0 });
    this.state.status = 'ready';
    this.state.pull = 0;
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
    for (const list of Object.values(this.flash)) if (Array.isArray(list)) list.forEach((v, i) => (list[i] = Math.max(0, v - dt)));
    this.flash.saucer = Math.max(0, this.flash.saucer - dt);
    this.flash.orbit = Math.max(0, this.flash.orbit - dt);
    for (const [k, t] of this.cool) if (t <= this.time) this.cool.delete(k);
  }

  cooled(key, seconds = 0.08) {
    if (this.cool.has(key)) return false;
    this.cool.set(key, this.time + seconds);
    return true;
  }

  step(h) {
    const s = this.state;
    const b = this.ball;
    const t = this.table;
    this.time += h;
    if (this.later.length && this.later[0].at <= this.time) this.later.shift().fn();
    const input = this.input;
    // 按下挡板: 顶上亮着的通道跟着挪 (像换道)
    for (const side of ['left', 'right']) {
      if (input[side] && !this.prevInput[side]) {
        this.emit('flip', { side });
        if (s.status === 'play') s.lanes = side === 'left' ? [...s.lanes.slice(1), s.lanes[0]] : [s.lanes[2], ...s.lanes.slice(0, 2)];
      }
    }
    for (const f of t.flippers) {
      const target = input[f.side] ? f.up : f.rest;
      const diff = target - f.angle;
      const move = Math.sign(diff) * Math.min(Math.abs(diff), (input[f.side] ? FLIP_UP : FLIP_DOWN) * h);
      f.angle += move;
      f.omega = move / h;
    }
    // 弹簧: 按住拉, 松开发射 (球得在通道底下)
    const atPlunger = b.x > LANE_X && b.y > t.plunger.top - 60;
    if (input.plunger) s.pull = Math.min(1, s.pull + h / PULL_TIME);
    else if (this.prevInput.plunger) {
      if (atPlunger && s.pull > 0.04 && (s.status === 'ready' || s.status === 'play')) {
        b.vy = -(1000 + 2600 * s.pull);
        b.vx = 0;
        if (s.status === 'ready') {
          s.status = 'play';
          s.saveLeft = s.saved ? 0 : SAVE_TIME;
        }
        this.emit('launch', { power: s.pull });
      }
      s.pull = 0;
    }
    this.prevInput = { ...input };

    if (s.status === 'saucer') {
      this.timer -= h;
      if (this.timer <= 0) {
        s.status = 'play';
        b.vx = 420 + this.rand() * 160;
        b.vy = 260;
        this.cool.set('saucer', this.time + 0.8);
        this.emit('eject');
      }
      return;
    }
    if (s.status === 'drained') {
      this.timer -= h;
      if (this.timer <= 0) this.nextBall();
      return;
    }
    if (s.saveLeft > 0) s.saveLeft = Math.max(0, s.saveLeft - h);

    // 动一步
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

    // 弹簧顶着球 (拉的时候往下)
    const top = t.plunger.top + s.pull * 30;
    if (b.x > LANE_X && b.y + b.r > top && b.y < top + 40) {
      b.y = top - b.r;
      if (b.vy > 0) b.vy = -b.vy * 0.15;
    }

    for (let pass = 0; pass < 2; pass++) {
      for (const w of t.walls) hitSegment(b, w);
      for (const g of t.gates) hitSegment(b, g);
      for (const p of t.posts) resolve(b, p.x, p.y, p.r, { e: 0.5 });
      for (const w of t.slings) {
        const hit = hitSegment(b, w);
        if (w.sling !== undefined && hit > 60 && this.cooled(`sling${w.sling}`, 0.1)) {
          this.flash.sling[w.sling] = 0.15;
          this.add(50);
          s.bonus += 5;
          this.emit('sling', { i: w.sling });
        }
      }
      t.bumpers.forEach((p, i) => {
        const hit = resolve(b, p.x, p.y, p.r, { e: 0.5, kick: 900 });
        if (hit > 30 && this.cooled(`bumper${i}`, 0.08)) {
          this.flash.bumper[i] = 0.18;
          this.add(100);
          s.bonus += 10;
          this.emit('bumper', { i });
        }
      });
      t.drops.forEach((d, i) => {
        if (!d.up) return;
        if (hitSegment(b, d) > 120) this.dropHit(i);
      });
      t.chars.forEach((c, i) => {
        if (hitSegment(b, c) > 120 && this.cooled(`char${i}`, 0.2)) this.charHit(i);
      });
      for (const f of t.flippers) hitFlipper(b, f);
    }
    this.sensors();
  }

  sensors() {
    const s = this.state;
    const b = this.ball;
    const t = this.table;
    t.lanes.forEach((l, i) => {
      if (inside(b, l) && this.cooled(`lane${i}`, 0.6)) {
        this.flash.lane[i] = 0.4;
        this.add(500);
        s.bonus += 20;
        s.lanes[i] = true;
        this.emit('lane', { i });
        if (s.lanes.every(Boolean)) {
          s.lanes = [false, false, false];
          if (s.mult < 5) s.mult++;
          this.add(2000);
          this.say(`三条通道都亮了! 奖励 ×${s.mult}`);
          this.emit('mult', { mult: s.mult });
        }
      }
    });
    if (inside(b, t.orbit) && s.status === 'play' && Math.abs(b.vx) > 500 && this.cooled('orbit', 1.5)) {
      this.flash.orbit = 0.6;
      this.add(1000);
      s.bonus += 20;
      this.say('回旋! +1,000', 1.5);
      this.emit('orbit');
    }
    t.inlanes.forEach((l, i) => {
      if (inside(b, l) && this.cooled(`in${i}`, 0.6)) {
        this.add(200);
        this.emit('inlane', { i });
      }
    });
    t.outlanes.forEach((l, i) => {
      if (!inside(b, l) || !this.cooled(`out${i}`, 0.6)) return;
      this.add(500);
      if (i === 0 && s.kickback) {
        s.kickback = false;
        Object.assign(b, { x: l.x, y: l.y, vx: 0, vy: -2300 });
        this.say('救命弹! 弹回去了');
        this.emit('kickback');
      } else this.emit('outlane', { i });
    });
    const sc = t.saucer;
    if (s.status === 'play' && inside(b, sc) && Math.hypot(b.vx, b.vy) < 1300 && this.cooled('saucer', 0.8)) {
      Object.assign(b, { x: sc.x, y: sc.y, vx: 0, vy: 0 });
      s.status = 'saucer';
      this.timer = 1.1;
      this.flash.saucer = 1.1;
      this.add(1500);
      s.bonus += 50;
      this.say('黑洞! +1,500');
      this.emit('saucer');
      return;
    }
    // 发射失败掉回通道: 等着再发射
    if (s.status === 'play' && b.x > LANE_X && b.y > t.plunger.top - 40 && Math.abs(b.vy) < 80) {
      s.status = 'ready';
      s.saveLeft = 0;
    }
    // 卡住了 (几乎不动、又不在通道里, 也不是托在挡板上): 推一下
    if (s.status === 'play' && Math.hypot(b.vx, b.vy) < 6 && b.x < LANE_X && b.y < 850) {
      this.slow += STEP;
      if (this.slow > 2.5) {
        this.slow = 0;
        b.vx = (this.rand() - 0.5) * 400;
        b.vy = -300;
        this.say('球卡住了, 帮你推一下');
        this.emit('nudge');
      }
    } else this.slow = 0;
    if (b.y > H + 20 && s.status === 'play') this.drain();
  }

  dropHit(i) {
    const s = this.state;
    const d = this.table.drops[i];
    d.up = false;
    this.flash.drop[i] = 0.3;
    this.add(300);
    s.bonus += 30;
    this.emit('drop', { i });
    if (this.table.drops.every((x) => !x.up)) {
      this.add(3000);
      s.kickback = true;
      this.say('三个靶都打下来了! 左下的救命弹准备好了');
      this.emit('dropsDone');
      this.after(1.5, () => {
        this.table.drops.forEach((x) => (x.up = true));
        this.emit('dropsReset');
      });
    }
  }

  charHit(i) {
    const s = this.state;
    this.flash.char[i] = 0.3;
    if (s.chars[i]) {
      this.add(100);
      this.emit('charAgain', { i });
      return;
    }
    s.chars[i] = true;
    this.add(300);
    s.bonus += 30;
    this.emit('char', { i });
    if (s.chars.every(Boolean)) {
      s.chars = [false, false, false, false, false];
      this.add(10000 * s.mult);
      const ball = !s.extraGiven;
      if (ball) {
        s.extra++;
        s.extraGiven = true;
      }
      this.say(`温故而知新! +${(10000 * s.mult).toLocaleString('en-US')}${ball ? ' · 奖励一个球' : ''}`, 4);
      this.emit('wengu');
    } else this.say(`「${CHARS.filter((_, k) => s.chars[k]).join('')}」还差 ${s.chars.filter((x) => !x).length} 个字`);
  }

  drain() {
    const s = this.state;
    if (s.saveLeft > 0) {
      s.saveLeft = 0;
      s.saved = true;
      this.toLane();
      this.say('救球! 再来一次');
      this.emit('save');
      return;
    }
    const bonus = s.bonus * s.mult;
    this.add(bonus);
    s.status = 'drained';
    this.timer = 2;
    this.say(bonus ? `球掉了 · 奖励分 ${s.bonus.toLocaleString('en-US')} × ${s.mult} = ${bonus.toLocaleString('en-US')}` : '球掉了', 2);
    this.emit('drain', { bonus });
  }

  nextBall() {
    const s = this.state;
    s.mult = 1;
    s.bonus = 0;
    s.saved = false;
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
    this.toLane();
  }
}
