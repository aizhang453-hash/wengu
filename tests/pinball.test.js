// 弹珠台: 物理 (发射、挡板、托球、穿墙) 和规则 (得分、倍数、救命弹、温故而知新、救球、几个球), 成绩怎么存、怎么合
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Pinball, W, H } from '../js/pinball.js';
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

function memoryStorage() {
  const map = new Map();
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k) };
}

test('发射: 拉满了绕过顶上的圆弧进台面, 开始计救球的时间; 拉得太轻掉回通道, 能再发射', () => {
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
  assert.ok(types(g).includes('launch'));
  // 轻轻一拉: 上不去, 掉回来等着再发射, 不算开始
  const weak = new Pinball();
  weak.input.plunger = true;
  run(weak, 0.04);
  weak.input.plunger = false;
  run(weak, 2);
  assert.equal(weak.state.status, 'ready');
  assert.equal(weak.state.saveLeft, 0);
});

test('挡板: 球在挡板上, 一按打上去很快; 按住挡板能托住球; 不按就从回球道滚过挡板, 从中间掉下去', () => {
  const g = new Pinball();
  g.state.status = 'play';
  Object.assign(g.ball, { x: 240, y: 880, vx: 0, vy: 0 });
  run(g, 0.25);
  g.input.left = true;
  let fastest = 0;
  run(g, 0.15, (x) => (fastest = Math.max(fastest, -x.ball.vy)));
  assert.ok(fastest > 1500, `往上 ${fastest}`);
  for (const side of ['left', 'right']) {
    const hold = new Pinball();
    hold.state.status = 'play';
    hold.input[side] = true;
    Object.assign(hold.ball, side === 'left' ? { x: 75, y: 820, vx: 30, vy: 0 } : { x: 485, y: 820, vx: -30, vy: 0 });
    run(hold, 4);
    assert.ok(Math.hypot(hold.ball.vx, hold.ball.vy) < 5 && hold.ball.y > 850 && hold.ball.y < 900, `${side} 托住了 (${hold.ball.x}, ${hold.ball.y})`);
    assert.equal(hold.state.status, 'play');
    const roll = new Pinball();
    roll.state.status = 'play';
    Object.assign(roll.ball, side === 'left' ? { x: 75, y: 820, vx: 30, vy: 0 } : { x: 485, y: 820, vx: -30, vy: 0 });
    run(roll, 1.8);
    assert.ok(types(roll).includes('drain') && !types(roll).includes('outlane'), `${side} 滚过挡板从中间掉下去`);
  }
});

test('乱打很久: 球一直在台面里面 (穿不过墙、不会卡住不动)', () => {
  for (let k = 0; k < 6; k++) {
    const rand = seeded(k * 101 + 5);
    const g = new Pinball({ rand });
    let still = 0;
    run(g, 60, (x) => {
      const b = x.ball;
      x.input.plunger = x.state.status === 'ready' ? x.state.pull < 0.5 + rand() * 0.5 : false;
      x.input.left = b.y > 840 && b.x < 280 && rand() < 0.8;
      x.input.right = b.y > 840 && b.x >= 280 && rand() < 0.8;
      assert.ok(b.x > 15 && b.x < W - 15 && b.y > 15 && b.y < H + 60, `球跑出去了: ${b.x}, ${b.y}`);
      if (x.state.status === 'play' && Math.hypot(b.vx, b.vy) < 5 && b.y < 850) still++;
      else still = 0;
      assert.ok(still < 60 * 4, `球停在 ${b.x}, ${b.y} 不动`);
    });
  }
});

test('得分: 蘑菇头 100 还会弹; 顶上三条通道都亮 → 倍数 +1; 按挡板挪亮着的通道', () => {
  const g = new Pinball();
  g.state.status = 'play';
  Object.assign(g.ball, { x: 220, y: 200, vx: 0, vy: 500 });
  run(g, 0.2);
  assert.equal(g.state.score >= 100, true);
  assert.ok(types(g).includes('bumper'));
  const lanes = new Pinball();
  lanes.state.status = 'play';
  lanes.state.lanes = [true, false, false];
  lanes.input.right = true;
  run(lanes, 0.05);
  assert.deepEqual(lanes.state.lanes, [false, true, false]);
  lanes.input.right = false;
  lanes.state.lanes = [true, false, true];
  Object.assign(lanes.ball, { x: 300, y: 100, vx: 0, vy: 200 });
  run(lanes, 0.3);
  assert.equal(lanes.state.mult, 2);
  assert.deepEqual(lanes.state.lanes, [false, false, false]);
});

test('三个掉落靶都打下 → 3000, 救命弹亮, 一会儿靶子起来; 救命弹把左边出局道的球弹回去', () => {
  const g = new Pinball();
  g.state.status = 'play';
  [0, 1, 2].forEach((i) => g.dropHit(i));
  assert.equal(g.state.kickback, true);
  assert.ok(g.state.score >= 3900);
  assert.ok(g.table.drops.every((d) => !d.up));
  Object.assign(g.ball, { x: 39, y: 860, vx: 0, vy: 300 });
  run(g, 0.1);
  assert.ok(types(g).includes('kickback'));
  assert.equal(g.state.kickback, false);
  assert.ok(g.ball.vy < -1000);
  run(g, 1.6);
  assert.ok(types(g).includes('dropsReset')); // (弹回去的球可能又把靶子打下来)
});

test('温故而知新: 五个字都打亮 → 10000 × 倍数, 一局第一次奖励一个球; 打过的再打只有 100', () => {
  const g = new Pinball();
  g.state.status = 'play';
  g.state.mult = 3;
  [0, 1, 2, 3].forEach((i) => g.charHit(i));
  g.charHit(1);
  assert.ok(types(g).includes('charAgain'));
  const before = g.state.score;
  g.charHit(4);
  assert.equal(g.state.score - before, 300 + 30000);
  assert.equal(g.state.extra, 1);
  assert.deepEqual(g.state.chars, [false, false, false, false, false]);
  [0, 1, 2, 3, 4].forEach((i) => g.charHit(i));
  assert.equal(g.state.extra, 1); // 第二次不再给球
});

test('救球: 发射以后 8 秒内掉了放回通道 (还是这个球), 救过一次就不救了; 三个球掉完结束', () => {
  const g = new Pinball();
  g.state.status = 'play';
  g.state.saveLeft = 5;
  g.state.bonus = 100;
  g.drain();
  assert.equal(g.state.status, 'ready');
  assert.equal(g.state.ball, 1);
  assert.equal(g.state.saved, true);
  g.state.status = 'play';
  g.drain();
  assert.equal(g.state.status, 'drained');
  assert.equal(g.state.score, 100); // 奖励分 × 倍数
  run(g, 2.1);
  assert.equal(g.state.status, 'ready');
  assert.equal(g.state.ball, 2);
  assert.equal(g.state.mult, 1);
  for (const ball of [2, 3]) {
    g.state.status = 'play';
    g.drain();
    run(g, 2.1);
    if (ball < 3) assert.equal(g.state.ball, 3);
  }
  assert.equal(g.state.status, 'over');
  assert.ok(types(g).includes('over'));
  // 奖励的球先用
  const e = new Pinball();
  e.state.extra = 1;
  e.state.status = 'play';
  e.drain();
  run(e, 2.1);
  assert.deepEqual([e.state.ball, e.state.extra, e.state.status], [1, 0, 'ready']);
});

test('黑洞: 慢慢滚进去吸住, 加 1500, 过一会儿吐出来', () => {
  const g = new Pinball();
  g.state.status = 'play';
  Object.assign(g.ball, { x: 82, y: 420, vx: 0, vy: 100 });
  run(g, 0.2);
  assert.equal(g.state.status, 'saucer');
  assert.equal(g.state.score, 1500);
  run(g, 1.2);
  assert.equal(g.state.status, 'play');
  assert.ok(types(g).includes('eject'));
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
  // 存、同步、备份
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
