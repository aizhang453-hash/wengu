// 弹珠台「星际远航」: 物理 (发射、挡板、托球、坡道、穿墙、卡住) 和规则 (技巧射击、倍数、星座救生舱、任务升军衔、
// 锁球多球、超级大奖、跃迁、护盾、倾斜、几个球), 成绩怎么存、怎么合
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Pinball, W, H, MISSIONS, RANKS, WARP_MAX } from '../js/pinball.js';
import { cleanArcade, mergeArcade, addScore, bestOf } from '../js/arcade.js';
import { Store, cleanData } from '../js/store.js';
import { mergeData } from '../js/merge.js';

const run = (g, seconds, each = null) => {
  for (let t = 0; t < seconds; t += 1 / 60) {
    each?.(g, t);
    g.update(1 / 60);
  }
};
const seeded = (seed) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const types = (g) => g.events.map((e) => e.type);
// 开始玩了 (跳过发射), 不要技巧射击
function playing(opts) {
  const g = new Pinball(opts);
  g.state.status = 'play';
  g.state.skillLane = -1;
  return g;
}

function memoryStorage() {
  const map = new Map();
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k) };
}

test('发射: 拉满了绕过顶上的圆弧进台面, 护盾开始计时; 拉得太轻掉回通道, 能再发射', () => {
  const g = new Pinball({ rand: seeded(1) });
  assert.equal(g.state.status, 'ready');
  g.input.plunger = true;
  run(g, 1);
  assert.equal(g.state.pull, 1);
  g.input.plunger = false;
  let minY = Infinity;
  let leftSide = false;
  run(g, 1.5, (x) => {
    minY = Math.min(minY, x.ball.y);
    if (x.ball.x < 100) leftSide = true;
  });
  assert.ok(minY < 60, `到了顶上 (${minY})`);
  assert.ok(leftSide, '绕到了左边');
  assert.equal(g.state.status, 'play');
  assert.ok(g.state.saveLeft > 5);
  assert.ok(types(g).includes('launch'));
  const weak = new Pinball();
  weak.input.plunger = true;
  run(weak, 0.04);
  weak.input.plunger = false;
  run(weak, 2);
  assert.equal(weak.state.status, 'ready');
  assert.equal(weak.state.saveLeft, 0);
});

test('挡板: 一按把球打上去很快; 按住能托住球; 不按就从回球道滚过挡板, 从中间掉下去', () => {
  const g = playing();
  Object.assign(g.ball, { x: 240, y: 880, vx: 0, vy: 0 });
  run(g, 0.25);
  g.input.left = true;
  let fastest = 0;
  run(g, 0.15, (x) => (fastest = Math.max(fastest, -x.ball.vy)));
  assert.ok(fastest > 1500, `往上 ${fastest}`);
  for (const side of ['left', 'right']) {
    const start = side === 'left' ? { x: 75, y: 820, vx: 30, vy: 0 } : { x: 485, y: 820, vx: -30, vy: 0 };
    const hold = playing();
    hold.input[side] = true;
    Object.assign(hold.ball, start);
    run(hold, 4);
    assert.ok(Math.hypot(hold.ball.vx, hold.ball.vy) < 5 && hold.ball.y > 850 && hold.ball.y < 900, `${side} 托住了 (${hold.ball.x}, ${hold.ball.y})`);
    const roll = playing();
    Object.assign(roll.ball, start);
    run(roll, 1.8);
    assert.ok(types(roll).includes('drain') && !types(roll).includes('outlane'), `${side} 滚过挡板从中间掉下去`);
  }
});

test('乱打很久: 球一直在台面里面 (穿不过墙), 不会卡住不动, 坡道、黑洞、靶子都打得到', () => {
  const seen = new Set();
  for (let k = 0; k < 6; k++) {
    const rand = seeded(k * 101 + 5);
    const g = new Pinball({ rand });
    const still = new Map();
    run(g, 90, (x) => {
      x.input.plunger = x.state.status === 'ready' ? x.state.pull < 0.6 + rand() * 0.4 : false;
      const near = (left) => x.balls.some((b) => !b.ramp && b.y > 835 && b.vy > 0 && b.x < 540 && (left ? b.x < 280 : b.x >= 280));
      x.input.left = near(true) ? rand() < 0.6 : x.input.left && rand() < 0.75;
      x.input.right = near(false) ? rand() < 0.6 : x.input.right && rand() < 0.75;
      for (const e of x.events) seen.add(e.type);
      x.events.length = 0;
      for (const b of x.balls) {
        assert.ok(b.x > 15 && b.x < W - 15 && b.y > 15 && b.y < H + 60, `球跑出去了: ${b.x}, ${b.y}`);
        const slow = x.state.status === 'play' && !b.held && !b.ramp && Math.hypot(b.vx, b.vy) < 5 && b.y < 850 && b.x < 540;
        still.set(b.id, slow ? (still.get(b.id) ?? 0) + 1 : 0);
        assert.ok(still.get(b.id) < 60 * 4, `球停在 ${b.x}, ${b.y} 不动`);
      }
    });
  }
  for (const t of ['bumper', 'sling', 'orbit', 'spinner', 'hole', 'wormhole', 'rampEnter', 'drop', 'target']) assert.ok(seen.has(t), `乱打也打到了 ${t}`);
});

test('得分: 小行星 100 还会弹; 顶上三条通道都亮 → 倍数 +1, 按挡板挪亮着的灯; 发射落进闪着的通道 → 技巧射击', () => {
  const g = playing();
  Object.assign(g.ball, { x: 220, y: 200, vx: 0, vy: 500 });
  run(g, 0.2);
  assert.ok(g.state.score >= 100);
  assert.ok(types(g).includes('bumper'));
  const lanes = playing();
  lanes.state.lanes = [true, false, false];
  lanes.input.right = true;
  run(lanes, 0.05);
  assert.deepEqual(lanes.state.lanes, [false, true, false]);
  lanes.input.right = false;
  lanes.state.lanes = [true, false, true];
  Object.assign(lanes.ball, { x: 300, y: 95, vx: 0, vy: 200 });
  run(lanes, 0.3);
  assert.equal(lanes.state.mult, 2);
  assert.deepEqual(lanes.state.lanes, [false, false, false]);
  const skill = playing();
  skill.state.skillLane = 1;
  Object.assign(skill.ball, { x: 300, y: 95, vx: 0, vy: 200 });
  run(skill, 0.3);
  assert.ok(types(skill).includes('skill'));
  assert.ok(skill.state.score >= 15000);
  assert.equal(skill.state.skillLane, -1);
});

test('曲速坡道: 冲得够快上去、绕一圈落进右边回球道, 曲速 +1; 太慢滚回来; 两次锁球灯亮, 5 级跃迁', () => {
  const shoot = (speed) => {
    const g = playing();
    const d = g.table.ramp.in;
    Object.assign(g.ball, { x: 150 - d.x * 20, y: 560 - d.y * 20, vx: d.x * speed, vy: d.y * speed });
    let end = null;
    run(g, 3, (x) => {
      if (!end && x.events.some((e) => e.type === 'ramp' || e.type === 'rampFail')) end = { x: x.ball.x, y: x.ball.y };
    });
    return { g, end };
  };
  const up = shoot(2400);
  assert.ok(types(up.g).includes('rampEnter') && types(up.g).includes('ramp'));
  assert.ok(up.end.x > 470 && up.end.y > 740, `落在右边 (${up.end.x}, ${up.end.y})`);
  assert.equal(up.g.state.warp, 1);
  const slow = shoot(1200);
  assert.ok(types(slow.g).includes('rampFail') && !types(slow.g).includes('ramp'));
  assert.ok(slow.end.x < 200 && slow.end.y > 500, '滚回入口');
  const g = playing();
  g.rampDone();
  assert.equal(g.state.lockLit, false);
  g.rampDone();
  assert.equal(g.state.lockLit, true);
  assert.ok(types(g).includes('lockLit'));
  for (let i = 0; i < WARP_MAX - 2; i++) g.rampDone();
  assert.ok(types(g).includes('hyperspace'));
  assert.equal(g.state.warp, 0);
});

test('黑洞: 慢慢滚进去吸住, 过一会儿从顶上的虫洞出来; 锁两个球 → 多球, 坡道是超级大奖, 剩一个球多球结束', () => {
  const g = playing();
  Object.assign(g.ball, { x: 275, y: 505, vx: 0, vy: 150 });
  run(g, 0.3);
  assert.ok(types(g).includes('hole'));
  assert.ok(g.ball.held);
  run(g, 1.3);
  assert.ok(types(g).includes('wormhole'));
  assert.ok(g.ball.y < 200, '从顶上出来');
  // 锁球
  const m = playing();
  m.state.lockLit = true;
  m.holeIn(m.ball);
  assert.equal(m.state.locked, 1);
  assert.equal(m.balls.length, 1, '锁住的拿走了, 发射通道里放一个新的');
  assert.ok(m.ball.x > 540);
  run(m, 1);
  assert.ok(m.ball.vy < 0 || m.ball.y < 900, '新球自己发射');
  m.state.lockLit = true;
  m.holeIn(m.ball);
  assert.equal(m.state.multiball, true);
  assert.ok(types(m).includes('multiball'));
  run(m, 1.2);
  assert.equal(m.balls.length, 3);
  const before = m.state.score;
  m.rampDone();
  assert.ok(types(m).includes('jackpot'));
  assert.ok(m.state.score - before >= 30000);
  // 掉了两个 (护盾过了以后): 多球结束, 这个球还在玩
  m.state.saveLeft = 0;
  m.drainBall(m.balls[0]);
  m.drainBall(m.balls[0]);
  assert.equal(m.state.multiball, false);
  assert.ok(types(m).includes('multiballEnd'));
  assert.equal(m.state.status, 'play');
});

test('星座: 五个靶都打倒 → 救生舱亮, 一会儿靶子起来; 救生舱把左边出局道的球弹回去一次', () => {
  const g = playing();
  [0, 1, 2, 3, 4].forEach((i) => g.dropHit(i));
  assert.equal(g.state.kickback, true);
  assert.equal(g.state.drops, 1);
  assert.ok(types(g).includes('constellation'));
  assert.ok(g.table.drops.every((d) => !d.up));
  Object.assign(g.ball, { x: 39, y: 860, vx: 0, vy: 300 });
  run(g, 0.1);
  assert.ok(types(g).includes('kickback'));
  assert.equal(g.state.kickback, false);
  assert.ok(g.ball.vy < -1000);
  run(g, 1.6);
  assert.ok(types(g).includes('dropsReset'));
});

test('任务: 三个任务靶都亮 → 进黑洞接任务, 做完升军衔; 到上尉送一个球', () => {
  const g = playing();
  [0, 1, 2].forEach((i) => g.targetHit(i));
  assert.equal(g.state.missionReady, true);
  g.holeIn(g.ball);
  assert.deepEqual(g.state.mission, { i: 0, have: 0 });
  assert.equal(MISSIONS[0].event, 'ramp');
  assert.ok(types(g).includes('missionStart'));
  const before = g.state.score;
  g.rampDone();
  assert.equal(g.state.mission, null);
  assert.equal(g.state.rank, 1);
  assert.equal(RANKS[g.state.rank], '少尉');
  assert.ok(g.state.score - before >= 10000);
  // 一步一步: 小行星 15 下
  const b = playing();
  b.state.mission = { i: 1, have: 0 };
  for (let i = 0; i < 14; i++) b.progress('bumper');
  assert.equal(b.state.mission.have, 14);
  assert.ok(types(b).includes('missionStep'));
  b.state.rank = 2;
  b.progress('bumper');
  assert.equal(b.state.rank, 3);
  assert.equal(b.state.extra, 1, '升上尉送一个球');
  assert.equal(b.state.missionIndex, 1, '下一个任务');
});

test('护盾: 开始 10 秒内掉了救回来 (还是这个球), 救过一次就不救了; 奖励分 × 倍数; 三个球掉完结束; 奖励的球先用', () => {
  const g = playing();
  g.state.saveLeft = 5;
  g.drainBall(g.ball);
  assert.ok(types(g).includes('save'));
  assert.equal(g.state.status, 'ready');
  assert.equal(g.state.ball, 1);
  assert.equal(g.state.saved, true);
  g.state.status = 'play';
  g.state.bonus = 100;
  g.state.mult = 2;
  g.drainBall(g.ball);
  assert.equal(g.state.status, 'drained');
  assert.equal(g.state.score, 200);
  run(g, 2.1);
  assert.equal(g.state.status, 'ready');
  assert.deepEqual([g.state.ball, g.state.mult, g.state.saved], [2, 1, false]);
  for (const ball of [2, 3]) {
    g.state.status = 'play';
    g.drainBall(g.ball);
    run(g, 2.1);
    if (ball < 3) assert.equal(g.state.ball, 3);
  }
  assert.equal(g.state.status, 'over');
  assert.ok(types(g).includes('over'));
  const e = playing();
  e.state.extra = 1;
  e.drainBall(e.ball);
  run(e, 2.1);
  assert.deepEqual([e.state.ball, e.state.extra, e.state.status], [1, 0, 'ready']);
});

test('撞台子: 把球撞开; 8 秒内撞三次倾斜, 挡板不动、不算分、没有奖励分, 下一个球好了', () => {
  const g = playing();
  Object.assign(g.ball, { x: 300, y: 600, vx: 0, vy: 0 });
  const nudge = () => {
    g.input.nudge = true;
    run(g, 1 / 60);
    g.input.nudge = false;
    run(g, 0.3);
  };
  nudge();
  assert.ok(types(g).includes('bump'));
  nudge();
  assert.ok(types(g).includes('tiltWarn'));
  nudge();
  assert.equal(g.state.tilt, true);
  const score = g.state.score;
  g.input.left = true;
  run(g, 0.2);
  assert.equal(g.table.flippers[0].angle, g.table.flippers[0].rest, '挡板不动');
  g.add(1000);
  assert.equal(g.state.score, score);
  g.input.left = false;
  g.state.bonus = 500;
  g.drainBall(g.ball);
  assert.equal(g.state.score, score, '没有奖励分');
  run(g, 2.1);
  assert.equal(g.state.tilt, false);
  // 慢慢撞 (8 秒以上一次) 不会倾斜
  const s = playing();
  for (let i = 0; i < 4; i++) {
    s.input.nudge = true;
    run(s, 1 / 60);
    s.input.nudge = false;
    run(s, 8.5, (x) => Object.assign(x.ball, { x: 300, y: 600, vx: 0, vy: 0, slow: 0 }));
  }
  assert.equal(s.state.tilt, false);
});

test('游戏厅的成绩: 留最高的 5 次, 两台设备的合起来, 破纪录和排第几', () => {
  let arcade = null;
  const scores = [500, 9000, 1200, 30000, 800, 4500];
  let last;
  scores.forEach((score, i) => {
    last = addScore(arcade, 'pinball', score, 1000 + i);
    arcade = last.arcade;
  });
  assert.deepEqual(arcade.pinball.top.map((r) => r.score), [30000, 9000, 4500, 1200, 800]);
  assert.deepEqual([last.rank, last.best], [3, false]);
  assert.equal(addScore(arcade, 'pinball', 40000, 2000).best, true);
  assert.equal(addScore(arcade, 'pinball', 0, 2000).rank, 0);
  const other = { pinball: { top: [{ score: 50000, at: 5 }, { score: 30000, at: 1003 }] } };
  const merged = mergeArcade(arcade, other);
  assert.deepEqual(merged.pinball.top.map((r) => r.score), [50000, 30000, 9000, 4500, 1200]);
  assert.equal(bestOf(merged, 'pinball'), 50000);
  assert.equal(cleanArcade({ pinball: { top: [{ score: -1, at: 1 }, { score: 'x' }] }, tetris: {} }), null);
  const store = new Store(memoryStorage());
  assert.deepEqual(store.recordArcade('pinball', 1234, 10), { rank: 1, best: true });
  const remote = cleanData({ arcade: other });
  const data = cleanData(mergeData(store.data, remote));
  assert.deepEqual(data.arcade.pinball.top.map((r) => r.score), [50000, 30000, 1234]);
  const b = new Store(memoryStorage());
  b.importBackup(store.exportBackup());
  assert.equal(bestOf(b.data.arcade, 'pinball'), 1234);
  assert.equal(cleanData({}).arcade, null);
});
