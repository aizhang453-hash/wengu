// 星际远航的台面美术 (画成一张贴图, 3D 里铺在台面上) 和台面上的灯 (INSERTS)。
// 灯画在贴图上是暗的; 亮的时候 3D 里在同一个地方盖一层会发光的 (pinball3d.js), 两边都照这张表

import { W, H, LANE_X } from './pinball.js';

const FONT = '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif';
const rnd = (seed) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

// 坡道入口往外 (往右下) 一串箭头: 曲速几级
const RAMP_OUT = { x: 0.546, y: 0.838 };
const rampArrow = (k) => ({ x: 150 + RAMP_OUT.x * k, y: 560 + RAMP_OUT.y * k });
const rampAngle = Math.atan2(-RAMP_OUT.y, -RAMP_OUT.x); // 箭头指着坡道里面

// 灯: id, 形状 (circle 圆 | arrow 箭头 | star 星 | ring 圈), 位置 (台面坐标), 大小, 角度 (箭头指的方向), 颜色, 字
export const INSERTS = [
  // 顶上三条再入通道
  ...[250, 300, 350].map((x, i) => ({ id: `lane${i}`, shape: 'circle', x, y: 128, size: 8, color: '#ffd84d' })),
  // 曲速 1–5 级
  ...[52, 72, 92, 112, 132].map((k, i) => ({ id: `warp${i}`, shape: 'arrow', ...rampArrow(k), size: 11 - i * 0.6, angle: rampAngle, color: '#38e8ff' })),
  // 打坡道 (多球的时候是超级大奖)
  { id: 'jackpot', shape: 'star', ...rampArrow(160), size: 14, color: '#ff5ec8', label: '大奖' },
  // 环绕轨道、推进器
  { id: 'orbit', shape: 'arrow', x: 520, y: 600, size: 13, angle: -Math.PI / 2, color: '#ff9b3d', label: '' },
  { id: 'spinner', shape: 'arrow', x: 520, y: 640, size: 10, angle: -Math.PI / 2, color: '#ffcf5e' },
  // 黑洞: 锁球、任务准备好了
  { id: 'lock', shape: 'circle', x: 275, y: 588, size: 11, color: '#9b7bff', label: '锁' },
  { id: 'ready', shape: 'arrow', x: 275, y: 618, size: 12, angle: -Math.PI / 2, color: '#ff4f6d' },
  // 任务靶下面
  ...[[400, 455], [425, 485], [450, 515]].map(([x, y], i) => ({ id: `target${i}`, shape: 'circle', x: x - 16, y: y + 22, size: 7, color: '#ff6b4f' })),
  // 星座 (五颗星, 掉落靶旁边)
  ...[440, 472, 504, 536, 568].map((y, i) => ({ id: `drop${i}`, shape: 'star', x: 64, y: y + 13, size: 8, color: '#fff1a0' })),
  // 奖励倍数
  ...[2, 3, 4, 5].map((n, i) => ({ id: `mult${i}`, shape: 'circle', x: 226 + i * 36, y: 712, size: 13, color: '#5fe0ff', label: `×${n}` })),
  // 救生舱、护盾
  { id: 'kickback', shape: 'arrow', x: 39, y: 918, size: 11, angle: -Math.PI / 2, color: '#6cff8f' },
  { id: 'shield', shape: 'ring', x: 280, y: 962, size: 16, color: '#6cff8f' },
  // 任务箭头 (现在的任务该往哪打)
  { id: 'aimRamp', shape: 'arrow', ...rampArrow(190), size: 16, angle: rampAngle, color: '#ffffff' },
  { id: 'aimOrbit', shape: 'arrow', x: 520, y: 690, size: 14, angle: -Math.PI / 2, color: '#ffffff' },
  { id: 'aimHole', shape: 'arrow', x: 275, y: 650, size: 14, angle: -Math.PI / 2, color: '#ffffff' },
  { id: 'aimDrops', shape: 'arrow', x: 92, y: 520, size: 13, angle: Math.PI, color: '#ffffff' },
  { id: 'aimTargets', shape: 'arrow', x: 395, y: 545, size: 13, angle: -Math.PI * 0.8, color: '#ffffff' },
  { id: 'aimBumpers', shape: 'arrow', x: 280, y: 405, size: 13, angle: -Math.PI / 2, color: '#ffffff' },
];

// 要打的路线 (pinball.js 的 aims()) → 该亮哪几个箭头
export const AIM = { ramp: ['aimRamp'], orbit: ['aimOrbit'], spinner: ['aimOrbit'], hole: ['aimHole'], drops: ['aimDrops'], targets: ['aimTargets'], bumpers: ['aimBumpers'], slings: ['aimBumpers'], combo: ['aimRamp', 'aimOrbit', 'aimHole'] };

// 一盏灯的形状 (画在 ctx 上, 台面坐标)
export function insertPath(ctx, ins) {
  const { x, y, size: r, angle = 0 } = ins;
  ctx.beginPath();
  if (ins.shape === 'circle' || ins.shape === 'ring') ctx.arc(x, y, r, 0, Math.PI * 2);
  else if (ins.shape === 'arrow') {
    const p = (dx, dy) => [x + Math.cos(angle) * dx - Math.sin(angle) * dy, y + Math.sin(angle) * dx + Math.cos(angle) * dy];
    for (const [i, pt] of [p(r, 0), p(-r * 0.7, r * 0.75), p(-r * 0.35, 0), p(-r * 0.7, -r * 0.75)].entries()) (i ? ctx.lineTo(...pt) : ctx.moveTo(...pt));
    ctx.closePath();
  } else if (ins.shape === 'star') {
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const rr = i % 2 ? r * 0.45 : r;
      const pt = [x + Math.cos(a) * rr, y + Math.sin(a) * rr];
      i ? ctx.lineTo(...pt) : ctx.moveTo(...pt);
    }
    ctx.closePath();
  }
}

function glow(ctx, x, y, r, color, alpha = 1) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.globalAlpha = alpha;
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
  ctx.globalAlpha = 1;
}

function planet(ctx, x, y, r, stops, { bands = 0, seed = 1, ring = null } = {}) {
  const rand = rnd(seed);
  if (ring) drawRing(ctx, x, y, r, ring, 'back');
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.clip();
  const g = ctx.createLinearGradient(x - r, y - r, x + r, y + r);
  stops.forEach(([at, c]) => g.addColorStop(at, c));
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
  // 条纹 (气态行星) / 斑点
  for (let i = 0; i < bands; i++) {
    const yy = y - r + (2 * r * (i + rand() * 0.5)) / bands;
    ctx.fillStyle = `rgba(${rand() < 0.5 ? '255,240,220' : '80,40,20'},${0.08 + rand() * 0.12})`;
    ctx.fillRect(x - r, yy, r * 2, (r * 2) / bands / (1.5 + rand()));
  }
  // 背光那边暗下去
  const shade = ctx.createRadialGradient(x - r * 0.4, y - r * 0.45, r * 0.2, x, y, r * 1.05);
  shade.addColorStop(0, 'rgba(255,255,255,0.18)');
  shade.addColorStop(0.55, 'rgba(0,0,0,0)');
  shade.addColorStop(1, 'rgba(0,0,10,0.75)');
  ctx.fillStyle = shade;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
  ctx.restore();
  // 大气层的一圈光
  ctx.strokeStyle = 'rgba(160,210,255,0.35)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(x, y, r + 0.8, Math.PI * 0.75, Math.PI * 1.75);
  ctx.stroke();
  if (ring) drawRing(ctx, x, y, r, ring, 'front');
}

function drawRing(ctx, x, y, r, { tilt = 0.35, color = 'rgba(230,200,150,0.55)', angle = -0.35 }, half) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.scale(1, tilt);
  ctx.beginPath();
  if (half === 'back') ctx.arc(0, 0, r * 1.9, Math.PI, Math.PI * 2);
  else ctx.arc(0, 0, r * 1.9, 0, Math.PI);
  ctx.strokeStyle = color;
  ctx.lineWidth = r * 0.38;
  ctx.stroke();
  ctx.lineWidth = r * 0.08;
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.stroke();
  ctx.restore();
}

// 画整张台面 (ctx 已经按台面坐标缩放好)
export function paintPlayfield(ctx, table) {
  const rand = rnd(42);
  // 底: 深蓝紫
  const base = ctx.createLinearGradient(0, 0, 0, H);
  base.addColorStop(0, '#120a3a');
  base.addColorStop(0.45, '#0a0f35');
  base.addColorStop(1, '#040616');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, W, H);
  // 星云
  ctx.globalCompositeOperation = 'lighter';
  for (const [x, y, r, c] of [
    [150, 240, 300, 'rgba(150,60,255,0.32)'],
    [460, 420, 260, 'rgba(255,60,170,0.22)'],
    [300, 720, 330, 'rgba(20,190,220,0.18)'],
    [90, 860, 220, 'rgba(60,90,255,0.25)'],
    [500, 140, 220, 'rgba(255,140,60,0.16)'],
    [275, 530, 160, 'rgba(120,80,255,0.25)'],
  ])
    glow(ctx, x, y, r, c);
  // 银河: 斜着的一条
  ctx.save();
  ctx.translate(300, 500);
  ctx.rotate(-0.95);
  ctx.scale(1, 0.18);
  glow(ctx, 0, 0, 620, 'rgba(200,190,255,0.16)');
  ctx.restore();
  for (let i = 0; i < 900; i++) {
    const t = rand() * 2 - 1;
    const off = (rand() + rand() + rand() - 1.5) * 60;
    const x = 300 + t * 560 * Math.cos(-0.95) - off * Math.sin(-0.95);
    const y = 500 + t * 560 * Math.sin(-0.95) + off * Math.cos(-0.95);
    ctx.fillStyle = `rgba(230,225,255,${0.15 + rand() * 0.4})`;
    ctx.fillRect(x, y, 0.8, 0.8);
  }
  ctx.globalCompositeOperation = 'source-over';
  // 星星
  for (let i = 0; i < 1300; i++) {
    const x = rand() * W;
    const y = rand() * H;
    const r = rand() < 0.06 ? 1.6 : 0.35 + rand() * 0.8;
    ctx.fillStyle = `rgba(255,255,255,${0.25 + rand() * 0.7})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  // 几颗亮星 (十字光)
  for (let i = 0; i < 26; i++) {
    const x = rand() * W;
    const y = rand() * H;
    const r = 4 + rand() * 8;
    glow(ctx, x, y, r * 1.6, 'rgba(200,220,255,0.55)');
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(x - r, y);
    ctx.lineTo(x + r, y);
    ctx.moveTo(x, y - r);
    ctx.lineTo(x, y + r);
    ctx.stroke();
  }
  // 黑洞周围的旋涡星系
  const ho = table.hole;
  ctx.save();
  ctx.translate(ho.x, ho.y);
  ctx.globalCompositeOperation = 'lighter';
  for (let arm = 0; arm < 3; arm++) {
    for (let i = 0; i < 220; i++) {
      const t = i / 220;
      const a = arm * ((Math.PI * 2) / 3) + t * 5.2;
      const rr = 24 + t * 92;
      const x = Math.cos(a) * rr + (rand() - 0.5) * 8;
      const y = Math.sin(a) * rr * 0.92 + (rand() - 0.5) * 8;
      ctx.fillStyle = `rgba(${150 + rand() * 80},${120 + rand() * 60},255,${0.35 * (1 - t) + 0.08})`;
      ctx.beginPath();
      ctx.arc(x, y, 0.6 + rand() * 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  glow(ctx, 0, 0, 60, 'rgba(255,170,90,0.45)');
  ctx.globalCompositeOperation = 'source-over';
  // 吸积盘 + 黑的洞
  const disk = ctx.createRadialGradient(0, 0, 10, 0, 0, 34);
  disk.addColorStop(0, 'rgba(0,0,0,1)');
  disk.addColorStop(0.45, 'rgba(255,150,60,0.9)');
  disk.addColorStop(0.7, 'rgba(255,90,140,0.5)');
  disk.addColorStop(1, 'rgba(120,60,255,0)');
  ctx.fillStyle = disk;
  ctx.beginPath();
  ctx.arc(0, 0, 34, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.arc(0, 0, ho.r - 1, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  // 行星
  planet(ctx, 112, 178, 44, [[0, '#7ad2ff'], [0.45, '#2b78d8'], [0.7, '#2e9a5a'], [1, '#0a2c5c']], { bands: 0, seed: 3 });
  planet(ctx, 468, 770, 62, [[0, '#ffd79a'], [0.5, '#d88a4a'], [1, '#6a2e1a']], { bands: 9, seed: 5, ring: { tilt: 0.3, angle: -0.3 } });
  planet(ctx, 505, 330, 17, [[0, '#e6e6ef'], [1, '#55556a']], { seed: 9 });
  // 小月亮的坑
  for (const [dx, dy, r] of [[-5, -3, 3], [4, 4, 2.2], [3, -6, 1.6]]) {
    ctx.fillStyle = 'rgba(40,40,60,0.45)';
    ctx.beginPath();
    ctx.arc(505 + dx, 330 + dy, r, 0, Math.PI * 2);
    ctx.fill();
  }
  // 星座的连线 (左边掉落靶旁边)
  ctx.strokeStyle = 'rgba(255,241,160,0.28)';
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  [453, 485, 517, 549, 581].forEach((y, i) => (i ? ctx.lineTo(64 + (i % 2) * 14, y) : ctx.moveTo(64, y)));
  ctx.stroke();
  ctx.setLineDash([]);

  // 台面的字 (金色、发光)
  const title = (text, x, y, size, color = '#ffd884', angle = 0, alpha = 0.95) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.font = `900 ${size}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.globalAlpha = alpha;
    ctx.shadowColor = color;
    ctx.shadowBlur = size * 0.6;
    ctx.fillStyle = color;
    ctx.fillText(text, 0, 0);
    ctx.shadowBlur = 0;
    ctx.restore();
  };
  title('星 际 远 航', 280, 772, 34, '#ffd884');
  title('温故而知新', 280, 806, 12, '#c9b8ff', 0, 0.8);
  title('曲速坡道', 206, 628, 13, '#7ff3ff', Math.atan2(RAMP_OUT.y, RAMP_OUT.x) - Math.PI / 2, 0.9);
  title('环绕轨道', 503, 760, 11, '#ffb070', -Math.PI / 2, 0.85);
  title('推进器', 505, 500, 10, '#ffcf5e', -Math.PI / 2, 0.75);
  title('黑洞', 275, 485, 12, '#ffb36b', 0, 0.85);
  title('任务', 448, 560, 12, '#ff8a6b', -0.5, 0.85);
  title('星座', 86, 610, 11, '#fff1a0', 0, 0.8);
  title('小行星带', 280, 205, 11, '#c9b8ff', 0, 0.7);
  title('再 入', 300, 172, 10, '#ffe58a', 0, 0.75);
  title('奖励倍数', 280, 690, 10, '#9feaff', 0, 0.7);
  title('救生舱', 40, 945, 9, '#9dffb6', 0, 0.75);
  title('护 盾', 280, 990, 9, '#9dffb6', 0, 0.75);

  // 灯 (暗的: 有颜色的塑料片, 一圈细边)
  for (const ins of INSERTS) {
    insertPath(ctx, ins);
    ctx.fillStyle = ins.color;
    ctx.globalAlpha = ins.id.startsWith('aim') ? 0.12 : 0.28;
    ctx.fill();
    ctx.globalAlpha = 0.65;
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = 0.8;
    if (ins.shape === 'ring') {
      ctx.lineWidth = 3;
      ctx.strokeStyle = ins.color;
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
    if (ins.label) {
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.font = `800 ${Math.round(ins.size * 0.85)}px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(ins.label, ins.x, ins.y + 0.5);
    }
  }
  // 发射通道: 一道一道的
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(LANE_X, 380, W - LANE_X, H - 380);
  for (let y = 520; y < 940; y += 46) {
    ctx.fillStyle = 'rgba(255,190,80,0.25)';
    ctx.beginPath();
    ctx.moveTo(560, y);
    ctx.lineTo(570, y + 16);
    ctx.lineTo(550, y + 16);
    ctx.closePath();
    ctx.fill();
  }
  // 下面掉球的地方暗一点
  const drain = ctx.createLinearGradient(0, 900, 0, H);
  drain.addColorStop(0, 'rgba(0,0,0,0)');
  drain.addColorStop(1, 'rgba(0,0,0,0.75)');
  ctx.fillStyle = drain;
  ctx.fillRect(0, 900, W, 100);
}
