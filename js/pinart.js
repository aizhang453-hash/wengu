// 星际远航的台面美术 (画成一张贴图, 3D 里铺在台面上) 和台面上的灯 (INSERTS)。
// 灯画在贴图上是暗的; 亮的时候 3D 里在同一个地方盖一层会发光的 (pinball3d.js), 两边都照这张表
//   台面: 星空 + 下半截是远航号的船体钢板 (铆钉、警戒线), 中间画着远航号; 每条路线口有箭头、字牌, 黑洞旁边是任务 / 危机 / 着陆的灯,
//         下面一排五个星系的灯 (过了的亮、现在的闪)

import { W, H, LANE_X } from './pinball.js';

const FONT = '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif';

// 配色: 冷色的太空 (深蓝的底、冰蓝、白), 点缀只有两种: 琥珀色 = 该打这里 (箭头、任务), 红色 = 危机。3D 那边也照这个
export const COLORS = { ice: '#7fd0ff', white: '#e8f2ff', amber: '#ffb44d', danger: '#ff4a5a', deep: '#050913' };
const { ice: ICE, white: WHITE, amber: AMBER, danger: DANGER } = COLORS;
const rnd = (seed) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

// 坡道入口往外 (往右下) 一串箭头: 曲速几级
const RAMP_OUT = { x: 0.546, y: 0.838 };
const rampArrow = (k) => ({ x: 150 + RAMP_OUT.x * k, y: 560 + RAMP_OUT.y * k });
const rampAngle = Math.atan2(-RAMP_OUT.y, -RAMP_OUT.x); // 箭头指着坡道里面

// 灯: id, 形状 (circle 圆 | arrow 箭头 | star 星 | ring 圈 | rect 字牌), 位置 (台面坐标), 大小, 角度 (箭头指的方向), 颜色, 字
export const INSERTS = [
  // 顶上三条再入通道
  ...[250, 300, 350].map((x, i) => ({ id: `lane${i}`, shape: 'circle', x, y: 128, size: 8, color: ICE })),
  // 曲速 1–5 级
  ...[52, 72, 92, 112, 132].map((k, i) => ({ id: `warp${i}`, shape: 'arrow', ...rampArrow(k), size: 11 - i * 0.6, angle: rampAngle, color: ICE })),
  // 打坡道 (多球的时候是超级大奖)
  { id: 'jackpot', shape: 'star', ...rampArrow(160), size: 14, color: WHITE, label: '大奖' },
  // 环绕轨道、推进器
  { id: 'orbit', shape: 'arrow', x: 520, y: 600, size: 13, angle: -Math.PI / 2, color: ICE, label: '' },
  { id: 'spinner', shape: 'arrow', x: 520, y: 640, size: 10, angle: -Math.PI / 2, color: ICE },
  // 黑洞: 两边任务、危机, 下面锁球、着陆, 有事等着的时候箭头闪
  { id: 'iMission', shape: 'rect', x: 224, y: 538, size: 11, color: AMBER, label: '任务' },
  { id: 'iBoss', shape: 'rect', x: 326, y: 538, size: 11, color: DANGER, label: '危机' },
  { id: 'ready', shape: 'arrow', x: 275, y: 574, size: 11, angle: -Math.PI / 2, color: AMBER },
  { id: 'lock', shape: 'circle', x: 275, y: 602, size: 10, color: ICE, label: '锁' },
  { id: 'iLand', shape: 'rect', x: 275, y: 628, size: 11, color: WHITE, label: '着陆' },
  // 对接坡道: 口子里两个箭头 (对接了几次), 口子下面一个
  { id: 'dock0', shape: 'arrow', x: 262, y: 432, size: 9, angle: -Math.PI / 2, color: ICE },
  { id: 'dock1', shape: 'arrow', x: 288, y: 432, size: 9, angle: -Math.PI / 2, color: ICE },
  { id: 'aimCenter', shape: 'arrow', x: 275, y: 478, size: 12, angle: -Math.PI / 2, color: AMBER },
  // 左边环绕轨道的口、连击
  { id: 'aimOrbitL', shape: 'arrow', x: 74, y: 404, size: 12, angle: -Math.PI * 0.72, color: AMBER },
  { id: 'combo', shape: 'rect', x: 118, y: 404, size: 10, color: ICE, label: '连击' },
  // 五个星系 (过了的亮, 现在的闪)
  ...['柯', '比', '翠', '渊', '曙'].map((label, i) => ({ id: `chapter${i}`, shape: 'circle', x: 208 + i * 36, y: 684, size: 12, color: i < 4 ? ICE : WHITE, label })),
  // 奖励的球
  { id: 'extra', shape: 'rect', x: 280, y: 930, size: 10, color: AMBER, label: '加球' },
  // 任务靶下面
  ...[[400, 455], [425, 485], [450, 515]].map(([x, y], i) => ({ id: `target${i}`, shape: 'circle', x: x - 16, y: y + 22, size: 7, color: AMBER })),
  // 星座 (五颗星, 掉落靶旁边)
  ...[440, 472, 504, 536, 568].map((y, i) => ({ id: `drop${i}`, shape: 'star', x: 64, y: y + 13, size: 8, color: WHITE })),
  // 奖励倍数
  ...[2, 3, 4, 5].map((n, i) => ({ id: `mult${i}`, shape: 'circle', x: 226 + i * 36, y: 712, size: 13, color: ICE, label: `×${n}` })),
  // 救生舱、护盾
  { id: 'kickback', shape: 'arrow', x: 39, y: 918, size: 11, angle: -Math.PI / 2, color: ICE },
  { id: 'shield', shape: 'ring', x: 280, y: 962, size: 16, color: ICE },
  // 任务箭头 (现在的任务该往哪打)
  { id: 'aimRamp', shape: 'arrow', ...rampArrow(190), size: 16, angle: rampAngle, color: AMBER },
  { id: 'aimOrbit', shape: 'arrow', x: 520, y: 690, size: 14, angle: -Math.PI / 2, color: AMBER },
  { id: 'aimHole', shape: 'arrow', x: 275, y: 656, size: 13, angle: -Math.PI / 2, color: AMBER },
  { id: 'aimDrops', shape: 'arrow', x: 92, y: 520, size: 13, angle: Math.PI, color: AMBER },
  { id: 'aimTargets', shape: 'arrow', x: 395, y: 545, size: 13, angle: -Math.PI * 0.8, color: AMBER },
  { id: 'aimBumpers', shape: 'arrow', x: 280, y: 405, size: 13, angle: -Math.PI / 2, color: AMBER },
];

// 要打的路线 (pinball.js 的 aims()) → 该亮哪几个箭头
export const AIM = { ramp: ['aimRamp'], center: ['aimCenter'], orbit: ['aimOrbit', 'aimOrbitL'], spinner: ['aimOrbit'], hole: ['aimHole'], drops: ['aimDrops'], targets: ['aimTargets'], bumpers: ['aimBumpers'], slings: ['aimBumpers'], combo: ['aimRamp', 'aimCenter', 'aimOrbit', 'aimHole'] };

// 一盏灯的形状 (画在 ctx 上, 台面坐标)
export function insertPath(ctx, ins) {
  const { x, y, size: r, angle = 0 } = ins;
  ctx.beginPath();
  if (ins.shape === 'circle' || ins.shape === 'ring') ctx.arc(x, y, r, 0, Math.PI * 2);
  else if (ins.shape === 'rect') {
    // 字牌: 两头斜着切的长条 (只用直线, 3D 那边照着它做形状)
    const w = r * 2.4;
    const hh = r * 0.95;
    [[x - w, y - hh], [x + w - 4, y - hh], [x + w, y - hh + 4], [x + w, y + hh], [x - w + 4, y + hh], [x - w, y + hh - 4]].forEach((pt, i) => (i ? ctx.lineTo(...pt) : ctx.moveTo(...pt)));
    ctx.closePath();
  }
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
    ctx.fillStyle = `rgba(${rand() < 0.5 ? '235,240,255' : '30,40,70'},${0.08 + rand() * 0.12})`;
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
  base.addColorStop(0, '#071026');
  base.addColorStop(0.45, '#050b1d');
  base.addColorStop(1, '#03060f');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, W, H);
  // 星云
  ctx.globalCompositeOperation = 'lighter';
  for (const [x, y, r, c] of [
    [150, 240, 300, 'rgba(50,100,220,0.28)'],
    [460, 420, 260, 'rgba(40,140,220,0.16)'],
    [300, 720, 330, 'rgba(30,120,200,0.14)'],
    [90, 860, 220, 'rgba(50,80,200,0.18)'],
    [500, 140, 220, 'rgba(120,170,255,0.1)'],
    [275, 530, 160, 'rgba(80,140,255,0.2)'],
  ])
    glow(ctx, x, y, r, c);
  // 银河: 斜着的一条
  ctx.save();
  ctx.translate(300, 500);
  ctx.rotate(-0.95);
  ctx.scale(1, 0.18);
  glow(ctx, 0, 0, 620, 'rgba(200,215,255,0.16)');
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
      ctx.fillStyle = `rgba(${170 + rand() * 60},${200 + rand() * 40},255,${0.35 * (1 - t) + 0.08})`;
      ctx.beginPath();
      ctx.arc(x, y, 0.6 + rand() * 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  glow(ctx, 0, 0, 60, 'rgba(150,200,255,0.35)');
  ctx.globalCompositeOperation = 'source-over';
  // 吸积盘 + 黑的洞
  const disk = ctx.createRadialGradient(0, 0, 10, 0, 0, 34);
  disk.addColorStop(0, 'rgba(0,0,0,1)');
  disk.addColorStop(0.45, 'rgba(220,240,255,0.9)');
  disk.addColorStop(0.7, 'rgba(120,180,255,0.45)');
  disk.addColorStop(1, 'rgba(60,100,255,0)');
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
  planet(ctx, 468, 770, 62, [[0, '#e4e8f0'], [0.5, '#9aa6bc'], [1, '#2e3648']], { bands: 9, seed: 5, ring: { tilt: 0.3, angle: -0.3, color: 'rgba(200,215,240,0.5)' } });
  planet(ctx, 505, 330, 17, [[0, '#e6e6ef'], [1, '#55556a']], { seed: 9 });
  // 小月亮的坑
  for (const [dx, dy, r] of [[-5, -3, 3], [4, 4, 2.2], [3, -6, 1.6]]) {
    ctx.fillStyle = 'rgba(40,40,60,0.45)';
    ctx.beginPath();
    ctx.arc(505 + dx, 330 + dy, r, 0, Math.PI * 2);
    ctx.fill();
  }
  // 星座的连线 (左边掉落靶旁边)
  ctx.strokeStyle = 'rgba(200,225,255,0.3)';
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  [453, 485, 517, 549, 581].forEach((y, i) => (i ? ctx.lineTo(64 + (i % 2) * 14, y) : ctx.moveTo(64, y)));
  ctx.stroke();
  ctx.setLineDash([]);

  // 下半截: 远航号的甲板钢板 (从上往下慢慢显出来), 接缝、铆钉、甲板编号
  ctx.save();
  const deckFade = ctx.createLinearGradient(0, 620, 0, 720);
  deckFade.addColorStop(0, 'rgba(0,0,0,0)');
  deckFade.addColorStop(1, 'rgba(0,0,0,1)');
  {
    const deck = document.createElement('canvas');
    deck.width = W;
    deck.height = H;
    const d = deck.getContext('2d');
    for (let y = 620; y < H; y += 44) {
      for (let x = (Math.floor((y - 620) / 44) % 2) * -32; x < W; x += 64) {
        const g = d.createLinearGradient(x, y, x + 64, y + 44);
        g.addColorStop(0, 'rgba(70,86,130,0.4)');
        g.addColorStop(1, 'rgba(30,38,70,0.4)');
        d.fillStyle = g;
        d.fillRect(x + 1, y + 1, 62, 42);
        d.strokeStyle = 'rgba(10,14,30,0.9)';
        d.lineWidth = 1.5;
        d.strokeRect(x + 1, y + 1, 62, 42);
        d.fillStyle = 'rgba(190,205,240,0.35)';
        for (const [rx, ry] of [[5, 5], [59, 5], [5, 39], [59, 39]]) {
          d.beginPath();
          d.arc(x + rx, y + ry, 1.3, 0, Math.PI * 2);
          d.fill();
        }
      }
    }
    // 上边慢慢淡出去
    d.globalCompositeOperation = 'destination-in';
    d.fillStyle = deckFade;
    d.fillRect(0, 620, W, H - 620);
    ctx.drawImage(deck, 0, 0);
  }
  ctx.restore();
  // 甲板上的小字、电路一样的线
  ctx.save();
  ctx.font = `700 7px ${FONT}`;
  ctx.fillStyle = 'rgba(200,215,255,0.32)';
  ctx.textAlign = 'left';
  for (const [t, x, y] of [['甲板 A-07', 170, 870], ['冬眠舱区 · 十万人', 318, 870], ['远航号 · 殖民方舟', 184, 958], ['注意: 别靠近黑洞', 324, 958]]) ctx.fillText(t, x, y);
  ctx.strokeStyle = 'rgba(80,230,255,0.28)';
  ctx.lineWidth = 1.2;
  for (const pts of [
    [[150, 640], [150, 700], [196, 700], [196, 684]],
    [[410, 640], [410, 700], [364, 700], [364, 684]],
    [[226, 556], [226, 600], [252, 626]],
    [[326, 556], [326, 600], [298, 626]],
    [[118, 416], [118, 470], [175, 520]],
  ]) {
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.stroke();
    const [ex, ey] = pts.at(-1);
    ctx.fillStyle = 'rgba(120,240,255,0.6)';
    ctx.beginPath();
    ctx.arc(ex, ey, 2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  // 出局道、掉球的地方: 黄黑警戒线
  const hazard = (x0, y0, w, h) => {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x0, y0, w, h);
    ctx.clip();
    ctx.fillStyle = 'rgba(4,8,20,0.55)';
    ctx.fillRect(x0, y0, w, h);
    ctx.fillStyle = 'rgba(127,208,255,0.28)';
    for (let k = -h; k < w + h; k += 14) {
      ctx.beginPath();
      ctx.moveTo(x0 + k, y0 + h);
      ctx.lineTo(x0 + k + 7, y0 + h);
      ctx.lineTo(x0 + k + 7 + h, y0);
      ctx.lineTo(x0 + k + h, y0);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  };
  hazard(20, 905, 38, 8);
  hazard(502, 905, 38, 8);
  hazard(222, 985, 116, 8);
  // 黑洞外面的星图圈
  ctx.save();
  ctx.translate(ho.x, ho.y);
  ctx.strokeStyle = 'rgba(140,220,255,0.28)';
  ctx.lineWidth = 1;
  for (const r of [46, 58]) {
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  for (let i = 0; i < 36; i++) {
    const a = (i / 36) * Math.PI * 2;
    const r0 = i % 3 ? 56 : 52;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
    ctx.lineTo(Math.cos(a) * 60, Math.sin(a) * 60);
    ctx.stroke();
  }
  ctx.restore();
  // 远航号 (侧面): 长长的船身、转着的环、后面的发动机
  ctx.save();
  ctx.translate(280, 768);
  glow(ctx, -96, 0, 34, 'rgba(90,180,255,0.6)');
  const hull = ctx.createLinearGradient(0, -12, 0, 12);
  hull.addColorStop(0, '#e6eefc');
  hull.addColorStop(0.5, '#8d9bc0');
  hull.addColorStop(1, '#3b4566');
  ctx.fillStyle = hull;
  ctx.beginPath();
  ctx.moveTo(-92, -9);
  ctx.lineTo(70, -9);
  ctx.quadraticCurveTo(108, -6, 116, 0);
  ctx.quadraticCurveTo(108, 6, 70, 9);
  ctx.lineTo(-92, 9);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#5a6690';
  ctx.fillRect(-104, -7, 12, 14); // 发动机
  ctx.fillRect(-28, -15, 46, 6); // 太阳能板
  ctx.fillRect(-28, 9, 46, 6);
  ctx.strokeStyle = 'rgba(255,255,255,0.75)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(-50, 0, 9, 26, 0, 0, Math.PI * 2); // 转着的环 (冬眠舱)
  ctx.stroke();
  ctx.fillStyle = 'rgba(200,235,255,0.9)';
  for (let x = -20; x < 66; x += 9) ctx.fillRect(x, -2, 4, 3); // 窗
  ctx.restore();

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
  // 字牌: 深色的底 + 一圈亮边, 上面写路线的名字
  const banner = (text, x, y, size, color, angle = 0) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.font = `900 ${size}px ${FONT}`;
    const w = ctx.measureText(text).width / 2 + size * 0.7;
    const hh = size * 0.85;
    ctx.beginPath();
    ctx.moveTo(-w, -hh + 3);
    ctx.lineTo(-w + 3, -hh);
    ctx.lineTo(w - 3, -hh);
    ctx.lineTo(w, -hh + 3);
    ctx.lineTo(w, hh - 3);
    ctx.lineTo(w - 3, hh);
    ctx.lineTo(-w + 3, hh);
    ctx.lineTo(-w, hh - 3);
    ctx.closePath();
    ctx.fillStyle = 'rgba(6,8,28,0.78)';
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.7;
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.restore();
    title(text, x, y + 0.5, size, color, angle, 0.95);
  };
  title('星 际 远 航', 280, 806, 22, WHITE);
  title('温故而知新', 280, 826, 9, ICE, 0, 0.7);
  banner('曲速坡道', 206, 628, 12, ICE, Math.atan2(RAMP_OUT.y, RAMP_OUT.x) - Math.PI / 2);
  banner('对接坡道', 352, 456, 10, ICE);
  banner('环绕轨道', 503, 760, 10, ICE, -Math.PI / 2);
  banner('推进器', 505, 520, 9, ICE, -Math.PI / 2);
  title('黑洞', 275, 500, 11, WHITE, 0, 0.85);
  banner('任务靶', 458, 562, 10, AMBER, -0.5);
  banner('星座', 86, 612, 10, ICE);
  title('小行星带', 280, 266, 10, ICE, 0, 0.65);
  title('再 入', 300, 172, 10, ICE, 0, 0.7);
  title('奖励倍数', 280, 734, 9, ICE, 0, 0.65);
  title('五 个 星 系', 280, 664, 8, ICE, 0, 0.6);
  title('救生舱', 40, 945, 9, ICE, 0, 0.7);
  title('护 盾', 280, 990, 9, ICE, 0, 0.7);

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
      ctx.font = `800 ${Math.round(ins.size * (ins.shape === 'rect' ? 1 : 0.85))}px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(ins.label, ins.x, ins.y + 0.5);
    }
  }
  // 发射通道: 一道一道的
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(LANE_X, 380, W - LANE_X, H - 380);
  for (let y = 520; y < 940; y += 46) {
    ctx.fillStyle = 'rgba(127,208,255,0.22)';
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
