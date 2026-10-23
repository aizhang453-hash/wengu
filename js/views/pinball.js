// 弹珠台的画面 (台面、物理、规则在 ../pinball.js):
//   画布上画台面 (不动的先画好一张, 每帧只画灯、挡板、弹簧、球), 用 CSS 的 3D 把整张台面往后倒一点, 像真的弹珠机
//   键盘: ← / Z / 左 Shift 左挡板, → / / / 右 Shift 右挡板, 空格 / ↓ / 回车 拉弹簧 (按住, 松开发射), P / Esc 暂停
//   手机: 点屏幕左半边 / 右半边打挡板 (两个手指能一起), 按住右下角「发射」
//   声音自己合成; 切到别的应用、别的标签页自动暂停

import { h, fill, icon } from '../dom.js';
import { Pinball, W, H, BALL_R, BALLS, CHARS, flipperTip } from '../pinball.js';
import { bestOf, TOP_N } from '../arcade.js';
import { soundOn, soundToggle } from './match.js';
import { holdAudio } from '../unlock.js';

const PREFS_KEY = 'wengu:pinball';
const TILT = 20; // 3D: 往后倒几度
const SQUASH = 0.79; // 倒了以后看起来剩多高 (cos 20° × 透视)

function loadPrefs() {
  try {
    return { flat: false, helped: false, ...JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') };
  } catch {
    return { flat: false, helped: false };
  }
}
function savePrefs(p) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(p));
  } catch {
    // 存不了就算了
  }
}

// ---- 声音 (自己合成) ----
let actx = null;
let noise = null;
function audio() {
  if (!soundOn()) return null;
  try {
    holdAudio(2000); // iPhone 静音开关开着也要有声
    actx ??= new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
    if (!noise) {
      noise = actx.createBuffer(1, actx.sampleRate * 0.5, actx.sampleRate);
      const d = noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    return actx;
  } catch {
    return null;
  }
}
function tone(ctx, { f0, f1 = f0, at = 0, len = 0.1, type = 'sine', vol = 0.1 }) {
  const t = ctx.currentTime + at;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(f1, t + len);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  osc.connect(g).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + len + 0.02);
}
function hiss(ctx, { at = 0, len = 0.06, freq = 1800, q = 1, vol = 0.15, type = 'bandpass' }) {
  const t = ctx.currentTime + at;
  const src = ctx.createBufferSource();
  src.buffer = noise;
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = freq;
  filter.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  src.connect(filter).connect(g).connect(ctx.destination);
  src.start(t);
  src.stop(t + len + 0.02);
}
const notes = (ctx, list, { gap = 0.08, len = 0.14, type = 'triangle', vol = 0.1 } = {}) => list.forEach((f, i) => tone(ctx, { f0: f, at: i * gap, len, type, vol }));

function play(e) {
  const ctx = audio();
  if (!ctx) return;
  const k = e.type;
  if (k === 'flip') tone(ctx, { f0: 140, f1: 60, len: 0.05, type: 'square', vol: 0.05 });
  else if (k === 'bumper') {
    tone(ctx, { f0: 560 - e.i * 60, f1: 260, len: 0.13, vol: 0.12 });
    tone(ctx, { f0: 1120, len: 0.04, type: 'triangle', vol: 0.05 });
  } else if (k === 'sling') hiss(ctx, { len: 0.06, freq: 1600, q: 2, vol: 0.2 });
  else if (k === 'lane') notes(ctx, [880, 1320], { gap: 0.06, len: 0.09, type: 'sine', vol: 0.08 });
  else if (k === 'drop') tone(ctx, { f0: 320, f1: 140, len: 0.1, type: 'square', vol: 0.06 });
  else if (k === 'char') notes(ctx, [660 + e.i * 70, 990 + e.i * 105], { gap: 0.07, len: 0.16 });
  else if (k === 'charAgain') tone(ctx, { f0: 660, len: 0.06, type: 'triangle', vol: 0.06 });
  else if (k === 'inlane' || k === 'outlane') tone(ctx, { f0: 440, len: 0.07, type: 'sine', vol: 0.06 });
  else if (k === 'wengu') notes(ctx, [523, 659, 784, 1047, 1319, 1568], { gap: 0.09, len: 0.22 });
  else if (k === 'mult' || k === 'dropsDone') notes(ctx, [523, 784, 1047], { gap: 0.08, len: 0.16 });
  else if (k === 'saucer') tone(ctx, { f0: 360, f1: 70, len: 0.45, vol: 0.12 });
  else if (k === 'eject') {
    hiss(ctx, { len: 0.12, freq: 900, vol: 0.12, type: 'lowpass' });
    tone(ctx, { f0: 180, f1: 620, len: 0.18, vol: 0.06 });
  } else if (k === 'launch') hiss(ctx, { len: 0.18 + e.power * 0.2, freq: 600 + e.power * 1800, q: 0.7, vol: 0.12 + e.power * 0.1 });
  else if (k === 'kickback' || k === 'save') notes(ctx, [392, 784], { gap: 0.07, len: 0.12, type: 'square', vol: 0.05 });
  else if (k === 'drain') notes(ctx, [392, 330, 262], { gap: 0.16, len: 0.24, vol: 0.09 });
  else if (k === 'over') notes(ctx, [523, 440, 349, 294, 262], { gap: 0.18, len: 0.3, vol: 0.09 });
  else if (k === 'nudge') hiss(ctx, { len: 0.05, freq: 300, vol: 0.1, type: 'lowpass' });
}

// ---- 画台面 ----
function rand(seed) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

// 台面的轮廓 (顶上圆弧、左右的墙)
function fieldPath(ctx) {
  ctx.beginPath();
  ctx.moveTo(20, 1000);
  ctx.lineTo(20, 300);
  ctx.arc(300, 300, 280, Math.PI, 2 * Math.PI);
  ctx.lineTo(580, 1000);
  ctx.closePath();
}

function rail(ctx, pts, width = 7) {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.strokeStyle = 'rgba(0,0,0,0.55)';
  ctx.lineWidth = width + 5;
  ctx.stroke();
  ctx.strokeStyle = '#7d8db3';
  ctx.lineWidth = width;
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = Math.max(1.5, width / 3);
  ctx.stroke();
}

function glow(ctx, x, y, r, color, alpha = 1) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.globalAlpha = alpha;
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

// 不动的: 台面的底、星空、字、墙、导轨、弹弓、蘑菇头的底座、黑洞
function drawStatic(ctx, t) {
  ctx.fillStyle = '#05061a';
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  fieldPath(ctx);
  const floor = ctx.createLinearGradient(0, 0, 0, H);
  floor.addColorStop(0, '#1d1458');
  floor.addColorStop(0.55, '#12245a');
  floor.addColorStop(1, '#0a1838');
  ctx.fillStyle = floor;
  ctx.fill();
  ctx.clip();
  // 星云
  for (const [x, y, r, c] of [
    [200, 300, 260, 'rgba(160,80,255,0.28)'],
    [430, 640, 240, 'rgba(40,200,220,0.18)'],
    [120, 760, 200, 'rgba(255,70,160,0.16)'],
    [300, 120, 200, 'rgba(255,190,80,0.10)'],
  ])
    glow(ctx, x, y, r, c);
  // 星星
  const rnd = rand(7);
  for (let i = 0; i < 160; i++) {
    const x = 20 + rnd() * 560;
    const y = rnd() * 980;
    const r = rnd() < 0.08 ? 1.8 : 0.5 + rnd();
    ctx.fillStyle = `rgba(255,255,255,${0.25 + rnd() * 0.6})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  // 中间的大印章「温故」
  ctx.save();
  ctx.translate(280, 575);
  ctx.rotate(-0.08);
  ctx.strokeStyle = 'rgba(255,90,90,0.28)';
  ctx.lineWidth = 5;
  ctx.strokeRect(-62, -62, 124, 124);
  ctx.fillStyle = 'rgba(255,90,90,0.16)';
  ctx.font = '900 54px "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('温', 0, -24);
  ctx.fillText('故', 0, 30);
  ctx.restore();
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ctx.font = '600 13px "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('温故而知新, 可以为师矣', 280, 665);
  // 发射通道的地板
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(540, 400, 40, 600);
  for (let y = 520; y < 940; y += 46) {
    ctx.fillStyle = 'rgba(255,200,90,0.18)';
    ctx.beginPath();
    ctx.moveTo(560, y);
    ctx.lineTo(570, y + 16);
    ctx.lineTo(550, y + 16);
    ctx.closePath();
    ctx.fill();
  }
  // 下面掉球的地方暗一点
  const drain = ctx.createLinearGradient(0, 900, 0, 1000);
  drain.addColorStop(0, 'rgba(0,0,0,0)');
  drain.addColorStop(1, 'rgba(0,0,0,0.7)');
  ctx.fillStyle = drain;
  ctx.fillRect(20, 900, 520, 100);
  // 倍数的灯、救命弹、通道的底座 (暗的, 亮了每帧再画)
  ctx.font = '700 12px system-ui, sans-serif';
  ctx.textBaseline = 'middle';
  [2, 3, 4, 5].forEach((n, i) => {
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.beginPath();
    ctx.arc(226 + i * 36, 712, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.fillText(`×${n}`, 226 + i * 36, 712);
  });
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.font = '600 10px "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.fillText('奖励倍数', 280, 688);
  ctx.fillText('救命弹', 41, 930);
  ctx.fillText('救球', 280, 975);
  ctx.restore();

  // 外圈的墙 (镀铬)
  ctx.save();
  fieldPath(ctx);
  ctx.strokeStyle = 'rgba(0,0,0,0.6)';
  ctx.lineWidth = 16;
  ctx.stroke();
  ctx.strokeStyle = '#9fb0d4';
  ctx.lineWidth = 9;
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.6)';
  ctx.lineWidth = 2.5;
  ctx.stroke();
  ctx.restore();
  // 发射通道的墙、单向门、导轨、通道隔板
  rail(ctx, [[540, 1000], [540, 432]]);
  for (const g of t.gates) rail(ctx, [[g.ax, g.ay], [g.bx, g.by]], 5);
  for (const pts of t.rails.guides) rail(ctx, pts);
  for (const pts of t.rails.bulges) rail(ctx, pts, 6);
  for (const pts of t.rails.dividers) rail(ctx, pts, 8);
  for (const p of t.posts) {
    ctx.fillStyle = '#d8deea';
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r + 1, 0, Math.PI * 2);
    ctx.fill();
  }
  // 弹弓
  for (const [a, b, c] of t.slingShapes) {
    const g = ctx.createLinearGradient(a[0], a[1], c[0], c[1]);
    g.addColorStop(0, '#ff4f8b');
    g.addColorStop(1, '#a3195b');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(...a);
    ctx.lineTo(...b);
    ctx.lineTo(...c);
    ctx.closePath();
    ctx.fill();
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#2a0f22';
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.strokeStyle = '#f4f4f6';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(...a);
    ctx.lineTo(...c);
    ctx.stroke();
  }
  // 蘑菇头的底座 (影子、外圈)
  for (const b of t.bumpers) {
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath();
    ctx.ellipse(b.x + 5, b.y + 8, b.r + 6, b.r + 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#20223a';
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r + 4, 0, Math.PI * 2);
    ctx.fill();
  }
  // 黑洞
  const s = t.saucer;
  const hole = ctx.createRadialGradient(s.x, s.y, 2, s.x, s.y, s.r + 6);
  hole.addColorStop(0, '#000');
  hole.addColorStop(0.7, '#0b0b18');
  hole.addColorStop(1, '#5a4bd0');
  ctx.fillStyle = hole;
  ctx.beginPath();
  ctx.arc(s.x, s.y, s.r + 6, 0, Math.PI * 2);
  ctx.fill();
}

// 挡板: 一头粗一头细的圆头长条
function drawFlipper(ctx, f) {
  const [tx, ty] = flipperTip(f);
  const a = Math.atan2(ty - f.py, tx - f.px);
  const shape = (dx, dy) => {
    ctx.beginPath();
    ctx.arc(f.px + dx, f.py + dy, f.r0, a + Math.PI / 2, a - Math.PI / 2);
    ctx.arc(tx + dx, ty + dy, f.r1, a - Math.PI / 2, a + Math.PI / 2);
    ctx.closePath();
  };
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  shape(4, 7);
  ctx.fill();
  const g = ctx.createLinearGradient(f.px, f.py - 14, f.px, f.py + 14);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(1, '#ffb3b3');
  ctx.fillStyle = g;
  shape(0, 0);
  ctx.fill();
  ctx.strokeStyle = '#c2183a';
  ctx.lineWidth = 3.5;
  ctx.stroke();
  ctx.fillStyle = '#7a8aa8';
  ctx.beginPath();
  ctx.arc(f.px, f.py, 4, 0, Math.PI * 2);
  ctx.fill();
}

// 三个蘑菇头: 亮的颜色、暗的颜色、闪的光
const BUMPER_COLORS = [
  ['#ffd36b', '#e07b00', 'rgba(255,211,107,0.7)'],
  ['#7ff0ff', '#0892b8', 'rgba(127,240,255,0.7)'],
  ['#ff9be6', '#c2187e', 'rgba(255,155,230,0.7)'],
];

// 每帧: 灯、靶、蘑菇头、挡板、弹簧、球
function drawDynamic(ctx, game, trail, now) {
  const t = game.table;
  const s = game.state;
  const fl = game.flash;
  const blink = Math.floor(now / 250) % 2 === 0;
  // 顶上通道的灯
  t.lanes.forEach((l, i) => {
    const on = s.lanes[i] || fl.lane[i] > 0;
    ctx.fillStyle = on ? '#ffe066' : 'rgba(255,224,102,0.16)';
    ctx.beginPath();
    ctx.arc(l.x, l.y + 6, 7, 0, Math.PI * 2);
    ctx.fill();
    if (on) glow(ctx, l.x, l.y + 6, 22, 'rgba(255,224,102,0.6)');
  });
  // 倍数
  [2, 3, 4, 5].forEach((n, i) => {
    if (s.mult < n) return;
    const x = 226 + i * 36;
    glow(ctx, x, 712, 24, 'rgba(80,220,255,0.55)');
    ctx.fillStyle = '#5fe0ff';
    ctx.beginPath();
    ctx.arc(x, 712, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#04263a';
    ctx.font = '800 12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`×${n}`, x, 712);
  });
  // 救命弹、救球
  if (s.kickback) glow(ctx, 41, 912, 22, 'rgba(120,255,140,0.8)');
  if (s.saveLeft > 0 && (s.saveLeft > 2 || blink)) glow(ctx, 280, 960, 30, 'rgba(120,255,140,0.75)');
  // 掉落靶
  t.drops.forEach((d, i) => {
    if (d.up) {
      ctx.fillStyle = fl.drop[i] > 0 ? '#fff' : '#ff8a3d';
      ctx.fillRect(d.ax - 4, d.ay, 9, d.by - d.ay);
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillRect(d.ax + 1, d.ay + 2, 2, d.by - d.ay - 4);
    } else {
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(d.ax - 4, d.ay, 9, d.by - d.ay);
    }
  });
  // 温故而知新: 中间一排靶子, 下面一盏写着字的灯
  t.chars.forEach((c, i) => {
    const on = s.chars[i];
    const hit = fl.char[i] > 0;
    const x = (c.ax + c.bx) / 2;
    if (on || hit) glow(ctx, x, c.ay + 22, 30, 'rgba(255,215,90,0.65)');
    ctx.fillStyle = hit ? '#fff' : on ? '#ffd34d' : '#6a74b8';
    ctx.beginPath();
    ctx.roundRect(c.ax - 3, c.ay - 5, c.bx - c.ax + 6, 10, 3);
    ctx.fill();
    ctx.fillStyle = on || hit ? '#ffd34d' : 'rgba(255,255,255,0.1)';
    ctx.beginPath();
    ctx.arc(x, c.ay + 22, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = on || hit ? '#3a2400' : 'rgba(255,255,255,0.45)';
    ctx.font = '800 15px "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(CHARS[i], x, c.ay + 23);
  });
  // 回旋: 顶上一盏灯
  const o = t.orbit;
  if (fl.orbit > 0) glow(ctx, o.x, o.y + 30, 36, 'rgba(255,140,60,0.7)');
  ctx.fillStyle = fl.orbit > 0 ? '#ffb070' : 'rgba(255,255,255,0.3)';
  ctx.font = '700 11px "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('回旋 1000', o.x, o.y + 32);
  // 蘑菇头
  t.bumpers.forEach((b, i) => {
    const f = fl.bumper[i];
    const [light, dark, halo] = BUMPER_COLORS[i];
    if (f > 0) {
      glow(ctx, b.x, b.y, b.r + 34, halo);
      ctx.strokeStyle = `rgba(255,255,255,${f * 4})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r + 6 + (0.18 - f) * 120, 0, Math.PI * 2);
      ctx.stroke();
    }
    const g = ctx.createRadialGradient(b.x - 8, b.y - 10, 3, b.x, b.y, b.r);
    g.addColorStop(0, f > 0 ? '#ffffff' : light);
    g.addColorStop(1, dark);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#f4f4f6';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = '800 13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('100', b.x, b.y + 1);
  });
  // 弹弓弹的时候闪一下
  t.slingShapes.forEach(([a, , c], i) => {
    if (!(fl.sling[i] > 0)) return;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(...a);
    ctx.lineTo(...c);
    ctx.stroke();
    glow(ctx, (a[0] + c[0]) / 2, (a[1] + c[1]) / 2, 50, 'rgba(255,120,190,0.6)');
  });
  // 黑洞吸着球: 一圈光
  if (fl.saucer > 0) glow(ctx, t.saucer.x, t.saucer.y, 46, `rgba(150,120,255,${0.4 + 0.4 * Math.sin(now / 60)})`);
  // 挡板
  for (const f of t.flippers) drawFlipper(ctx, f);
  // 弹簧
  const top = t.plunger.top + s.pull * 30;
  ctx.strokeStyle = '#c9d2e3';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  for (let i = 0; i <= 10; i++) {
    const y = top + 8 + ((1000 - top - 8) * i) / 10;
    ctx.lineTo(i % 2 ? 568 : 552, y);
  }
  ctx.stroke();
  ctx.fillStyle = '#e04f5f';
  ctx.fillRect(546, top, 28, 8);
  // 球: 拖一点影子, 镀铬的
  const b = game.ball;
  trail.forEach(([x, y], i) => {
    ctx.fillStyle = `rgba(190,210,255,${(i / trail.length) * 0.18})`;
    ctx.beginPath();
    ctx.arc(x, y, BALL_R * (0.5 + (0.5 * i) / trail.length), 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.beginPath();
  ctx.ellipse(b.x + 5, b.y + 8, BALL_R, BALL_R * 0.8, 0, 0, Math.PI * 2);
  ctx.fill();
  const g = ctx.createRadialGradient(b.x - 4, b.y - 4, 1, b.x, b.y, BALL_R);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.35, '#dfe4ee');
  g.addColorStop(0.8, '#7b8496');
  g.addColorStop(1, '#3a4152');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(b.x, b.y, BALL_R, 0, Math.PI * 2);
  ctx.fill();
}

// ---- 页面 ----

export function renderPinball({ store }) {
  let prefs = loadPrefs();
  let game = new Pinball();
  let paused = !prefs.helped; // 第一次玩先看怎么玩
  let raf = 0;
  let last = 0;
  let recorded = null; // 这局记下的 { rank, best }
  const trail = [];

  const scoreEl = h('strong', { class: 'pb-score' }, '0');
  const ballEl = h('span', { class: 'pb-chip' });
  const multEl = h('span', { class: 'pb-chip' });
  const bestEl = h('span', { class: 'pb-chip muted' });
  const msgEl = h('div', { class: 'pb-msg', role: 'status', 'aria-live': 'polite' });
  const canvas = h('canvas', { class: 'pb-canvas', 'aria-label': '弹珠台' });
  const ctx = canvas.getContext('2d');
  const bg = document.createElement('canvas');
  const launchBtn = h('button', { class: 'pb-launch', type: 'button', 'aria-label': '发射 (按住拉弹簧, 松开发射)' }, '发射');
  const touch = h('div', { class: 'pb-touch', 'aria-hidden': 'true' }, h('span', { class: 'pb-touch-l' }), h('span', { class: 'pb-touch-r' }));
  const overlay = h('div', { class: 'pb-overlay', hidden: true });
  // 竖着的屏幕上台面上面空着: 放一块像真弹珠机那样的顶箱, 写着名字, 亮着打亮了的字和倍数
  const glassChars = CHARS.map((c) => h('span', {}, c));
  const glassMult = [1, 2, 3, 4, 5].map((n) => h('span', {}, `×${n}`));
  const backglass = h(
    'div',
    { class: 'pb-backglass', hidden: true, 'aria-hidden': 'true' },
    h('div', { class: 'pb-glass-title' }, '温故弹珠台'),
    h('div', { class: 'pb-glass-chars' }, glassChars),
    h('div', { class: 'pb-glass-mult' }, glassMult),
  );
  let glassKey = '';
  function drawBackglass(s) {
    const key = `${s.chars.join()}|${s.mult}`;
    if (backglass.hidden || key === glassKey) return;
    glassKey = key;
    glassChars.forEach((el, i) => el.classList.toggle('on', s.chars[i]));
    glassMult.forEach((el, i) => el.classList.toggle('on', s.mult >= i + 1));
  }
  const stage = h('div', { class: 'pb-stage' }, backglass, h('div', { class: 'pb-table' }, canvas), touch, launchBtn, overlay);
  const pauseBtn = h('button', { class: 'icon-btn tool', type: 'button', title: '暂停 (P)', 'aria-label': '暂停', onclick: () => pause() }, icon('pause', 22));
  const root = h(
    'section',
    { class: 'pinball-page' },
    h(
      'div',
      { class: 'pb-head' },
      h('a', { class: 'icon-btn tool', href: '#/arcade', title: '不玩了', 'aria-label': '不玩了, 回游戏厅' }, icon('x', 22)),
      h('div', { class: 'pb-info' }, scoreEl, h('div', { class: 'pb-chips' }, ballEl, multEl, bestEl)),
      pauseBtn,
      soundToggle(),
    ),
    msgEl,
    stage,
  );

  // ---- 大小 ----
  let k = 1;
  function layout() {
    const rect = stage.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const squash = prefs.flat ? 1 : SQUASH;
    k = Math.min(rect.width / W, (rect.height - 8) / (H * squash));
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cw = Math.round(W * k);
    const ch = Math.round(H * k);
    canvas.style.width = `${cw}px`;
    canvas.style.height = `${ch}px`;
    canvas.style.transform = prefs.flat ? 'none' : `perspective(${Math.round(ch * 1.8)}px) rotateX(${TILT}deg)`;
    canvas.width = bg.width = Math.round(cw * dpr);
    canvas.height = bg.height = Math.round(ch * dpr);
    const bctx = bg.getContext('2d');
    bctx.setTransform(k * dpr, 0, 0, k * dpr, 0, 0);
    drawStatic(bctx, game.table);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    root.classList.toggle('flat', Boolean(prefs.flat));
    // 台面上面还空着多少: 够的话放顶箱
    const room = rect.height - ch * squash - 16;
    backglass.hidden = room < 110;
    if (!backglass.hidden) {
      backglass.style.height = `${Math.min(room - 6, 230)}px`;
      glassKey = '';
    }
    draw(performance.now());
  }

  function draw(now) {
    const dpr = canvas.width / (W * k);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(bg, 0, 0);
    ctx.setTransform(k * dpr, 0, 0, k * dpr, 0, 0);
    drawDynamic(ctx, game, trail, now);
  }

  // ---- 上面那一条 ----
  let shownScore = -1;
  let shownMsg = null;
  function hud() {
    const s = game.state;
    if (s.score !== shownScore) {
      shownScore = s.score;
      scoreEl.textContent = s.score.toLocaleString('en-US');
    }
    ballEl.textContent = s.status === 'over' ? '结束' : `球 ${s.ball}/${BALLS}${s.extra ? ` +${s.extra}` : ''}`;
    multEl.textContent = `×${s.mult}`;
    multEl.classList.toggle('on', s.mult > 1);
    const best = bestOf(store.data.arcade, 'pinball');
    bestEl.hidden = !best;
    bestEl.textContent = `最高 ${best.toLocaleString('en-US')}`;
    drawBackglass(s);
    const msg = s.messageLeft > 0 ? s.message : s.status === 'ready' ? '按住空格 (手机: 右下角「发射」) 拉弹簧, 松开发射' : '';
    if (msg !== shownMsg) {
      shownMsg = msg;
      msgEl.textContent = msg;
    }
    launchBtn.hidden = s.status !== 'ready' && !(game.ball.x > 540 && game.ball.y > 880);
    launchBtn.classList.toggle('pulling', game.input.plunger);
  }

  // ---- 一帧 ----
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000 || 0);
    last = now;
    if (!paused) {
      game.update(dt);
      for (const e of game.events) {
        play(e);
        if (e.type === 'over') gameOver(e.score);
      }
      game.events.length = 0;
      const speed = Math.hypot(game.ball.vx, game.ball.vy);
      trail.push([game.ball.x, game.ball.y]);
      while (trail.length > (speed > 1500 ? 6 : 0)) trail.shift();
    }
    draw(now);
    hud();
  }

  // ---- 暂停、怎么玩、结束 ----
  const helpText = () =>
    h(
      'ul',
      { class: 'pb-help' },
      h('li', {}, h('b', {}, '挡板: '), '键盘 ← 或 Z 左边, → 或 / 右边; 手机、平板点屏幕左半边 / 右半边 (两边能一起按)'),
      h('li', {}, h('b', {}, '发射: '), '按住空格 (手机: 右下角「发射」) 拉弹簧, 拉得越久打得越远, 松开发射'),
      h('li', {}, h('b', {}, '得分: '), '蘑菇头 100, 弹弓 50; 顶上三条通道都亮 → 奖励倍数 +1 (按挡板能挪亮着的灯); 左边三个靶打下来 → 3000, 救命弹亮'),
      h('li', {}, h('b', {}, '温故而知新: '), '右边五个字都打亮 → 10000 × 倍数, 再奖励一个球'),
      h('li', {}, h('b', {}, '黑洞: '), '1500, 吸住一会儿再吐出来。每个球开始 8 秒内掉了救回来一次'),
    );

  function showOverlay(...children) {
    fill(overlay, h('div', { class: 'pb-panel' }, ...children));
    overlay.hidden = false;
    overlay.querySelector('button')?.focus();
  }

  function resume() {
    paused = false;
    overlay.hidden = true;
    last = performance.now();
    canvas.focus?.();
  }

  function pause() {
    if (game.state.status === 'over' || paused) return;
    paused = true;
    release();
    showOverlay(
      h('h2', {}, '暂停'),
      h('div', { class: 'pb-buttons' }, h('button', { class: 'btn primary', type: 'button', onclick: resume }, '继续'), h('button', { class: 'btn', type: 'button', onclick: restart }, '重新开始')),
      h(
        'label',
        { class: 'pb-check' },
        h('input', {
          type: 'checkbox',
          checked: !prefs.flat,
          onchange: (e) => {
            prefs = { ...prefs, flat: !e.target.checked };
            savePrefs(prefs);
            layout();
          },
        }),
        ' 3D 视角 (台面往后倒, 像真的弹珠机)',
      ),
      helpText(),
      h('a', { class: 'btn ghost', href: '#/arcade' }, '回游戏厅'),
    );
  }

  function restart() {
    game = new Pinball();
    recorded = null;
    trail.length = 0;
    shownScore = -1;
    layout();
    resume();
  }

  function gameOver(score) {
    recorded = store.recordArcade('pinball', score);
    const top = store.data.arcade?.pinball?.top ?? [];
    release();
    showOverlay(
      h('h2', {}, recorded.best ? '新纪录! 🎉' : '游戏结束'),
      h('p', { class: 'pb-final' }, score.toLocaleString('en-US')),
      top.length
        ? h(
            'ol',
            { class: 'pb-top' },
            top.slice(0, TOP_N).map((r, i) => h('li', { class: recorded.rank === i + 1 ? 'me' : '' }, h('span', {}, r.score.toLocaleString('en-US')), h('span', { class: 'muted small' }, new Date(r.at).toLocaleDateString('zh-CN')))),
          )
        : null,
      h('div', { class: 'pb-buttons' }, h('button', { class: 'btn primary', type: 'button', onclick: restart }, '再来一局'), h('a', { class: 'btn', href: '#/arcade' }, '回游戏厅')),
    );
  }

  // ---- 键盘 ----
  const LEFT = new Set(['ArrowLeft', 'KeyZ', 'ShiftLeft']);
  const RIGHT = new Set(['ArrowRight', 'Slash', 'ShiftRight', 'KeyM']);
  const PLUNGER = new Set(['Space', 'ArrowDown', 'Enter', 'NumpadEnter']);
  function onKey(e) {
    if (e.target.closest?.('input, textarea, select')) return;
    const down = e.type === 'keydown';
    const code = e.code;
    if (down && (code === 'KeyP' || code === 'Escape')) {
      e.preventDefault();
      return paused ? game.state.status !== 'over' && resume() : pause();
    }
    if (paused) return;
    let used = true;
    if (LEFT.has(code)) game.input.left = down;
    else if (RIGHT.has(code)) game.input.right = down;
    else if (PLUNGER.has(code)) game.input.plunger = down;
    else used = false;
    if (used) e.preventDefault();
  }

  // ---- 手指、鼠标 ----
  const pointers = new Map(); // pointerId → 'left' | 'right'
  function syncTouch() {
    const sides = [...pointers.values()];
    game.input.left = sides.includes('left');
    game.input.right = sides.includes('right');
    touch.classList.toggle('l', game.input.left);
    touch.classList.toggle('r', game.input.right);
  }
  touch.addEventListener('pointerdown', (e) => {
    if (paused) return;
    e.preventDefault();
    const rect = touch.getBoundingClientRect();
    pointers.set(e.pointerId, e.clientX - rect.left < rect.width / 2 ? 'left' : 'right');
    touch.setPointerCapture?.(e.pointerId);
    syncTouch();
  });
  const up = (e) => {
    pointers.delete(e.pointerId);
    syncTouch();
  };
  touch.addEventListener('pointerup', up);
  touch.addEventListener('pointercancel', up);
  touch.addEventListener('contextmenu', (e) => e.preventDefault());
  launchBtn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (paused) return;
    launchBtn.setPointerCapture?.(e.pointerId);
    game.input.plunger = true;
  });
  const launchUp = () => (game.input.plunger = false);
  launchBtn.addEventListener('pointerup', launchUp);
  launchBtn.addEventListener('pointercancel', launchUp);
  launchBtn.addEventListener('contextmenu', (e) => e.preventDefault());

  function release() {
    pointers.clear();
    Object.assign(game.input, { left: false, right: false, plunger: false });
    syncTouch();
  }

  // 切走了: 暂停
  const onHide = () => document.visibilityState === 'hidden' && pause();
  const onBlur = () => pause();
  const onResize = () => layout();
  document.addEventListener('keydown', onKey);
  document.addEventListener('keyup', onKey);
  document.addEventListener('visibilitychange', onHide);
  window.addEventListener('blur', onBlur);
  window.addEventListener('resize', onResize);

  // 放进页面以后才量得出大小
  requestAnimationFrame(() => {
    layout();
    last = performance.now();
    raf = requestAnimationFrame(frame);
    if (paused) {
      showOverlay(
        h('h2', {}, '弹珠台 · 怎么玩'),
        helpText(),
        h(
          'div',
          { class: 'pb-buttons' },
          h(
            'button',
            {
              class: 'btn primary',
              type: 'button',
              onclick: () => {
                prefs = { ...prefs, helped: true };
                savePrefs(prefs);
                resume();
              },
            },
            '开始',
          ),
        ),
      );
    }
  });

  return {
    title: '弹珠台',
    el: root,
    cleanup: () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('keyup', onKey);
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('resize', onResize);
    },
  };
}
