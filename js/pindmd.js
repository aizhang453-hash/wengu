// 点阵屏: 真弹珠机顶上那块橙色的屏, 160 × 40 个点。平时显示分数、第几个球、倍数、第几章 (有任务显示任务进度和剩下的时间,
// 危机显示血条, 黑洞里选任务显示选的哪个);
// 台子说话的时候显示那句话 (太长了就滚动); 大事 (跃迁、多球、超级大奖、升军衔、倾斜……) 放一小段动画。
//   画法: 先在 160 × 40 的小画布上写字、画画 (白色), 每个点按亮度分成 4 档涂成橙色, 放大画到屏上,
//         再盖一层「点阵」(圆点透明、点之间黑的), 看起来就是一个一个的灯点

import { BALLS, CHAPTERS, FINAL } from './pinball.js';

export const DMD_W = 160;
export const DMD_H = 40;
const FONT = '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif';
const DIGITS = '"Arial Narrow", "Helvetica Neue", Arial, sans-serif';
const LEVELS = [null, [110, 45, 0], [210, 105, 0], [255, 170, 40]];
const fmt = (n) => n.toLocaleString('en-US');

// 大事的动画: 事件 → 放多久、什么样子
const FX = {
  hyperspace: { len: 2.4, kind: 'stars' },
  multiball: { len: 2.6, kind: 'ships' },
  medic: { len: 1.4, kind: 'flash' },
  jackpot: { len: 2.2, kind: 'flash' },
  missionDone: { len: 2.2, kind: 'burst' },
  bossStart: { len: 2.4, kind: 'flash' },
  bossDown: { len: 2.6, kind: 'burst' },
  travel: { len: 3, kind: 'stars' },
  finalStart: { len: 2.6, kind: 'ships' },
  landing: { len: 5, kind: 'stars' },
  skill: { len: 1.8, kind: 'flash' },
  tilt: { len: 2.5, kind: 'flash' },
  missionStart: { len: 3, kind: 'scan' },
  constellation: { len: 2, kind: 'burst' },
  lock: { len: 1.8, kind: 'scan' },
  save: { len: 1.4, kind: 'flash' },
  kickback: { len: 1.4, kind: 'flash' },
};

export function createDmd(canvas) {
  const src = document.createElement('canvas');
  src.width = DMD_W;
  src.height = DMD_H;
  const sctx = src.getContext('2d', { willReadFrequently: true });
  const lit = document.createElement('canvas');
  lit.width = DMD_W;
  lit.height = DMD_H;
  const lctx = lit.getContext('2d');
  const ctx = canvas.getContext('2d');
  let mask = null;
  let pitch = 1;
  let fx = null; // { kind, start, len }
  let lastKey = '';
  const stars = Array.from({ length: 40 }, () => ({ a: Math.random() * Math.PI * 2, r: Math.random() * 80, v: 40 + Math.random() * 120 }));

  // 屏多大: 按 CSS 的宽量出来, 点阵那层跟着重画
  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = canvas.clientWidth || DMD_W * 2;
    pitch = Math.max(1, (w * dpr) / DMD_W);
    canvas.width = Math.round(DMD_W * pitch);
    canvas.height = Math.round(DMD_H * pitch);
    mask = document.createElement('canvas');
    mask.width = canvas.width;
    mask.height = canvas.height;
    const m = mask.getContext('2d');
    m.fillStyle = '#0b0602';
    m.fillRect(0, 0, mask.width, mask.height);
    m.globalCompositeOperation = 'destination-out';
    m.beginPath();
    const r = pitch * 0.42;
    for (let y = 0; y < DMD_H; y++) for (let x = 0; x < DMD_W; x++) {
      m.moveTo((x + 0.5) * pitch + r, (y + 0.5) * pitch);
      m.arc((x + 0.5) * pitch, (y + 0.5) * pitch, r, 0, Math.PI * 2);
    }
    m.fill();
    lastKey = '';
  }

  function text(str, x, y, size, { font = FONT, weight = 800, align = 'center', alpha = 1 } = {}) {
    sctx.font = `${weight} ${size}px ${font}`;
    sctx.textAlign = align;
    sctx.textBaseline = 'middle';
    sctx.globalAlpha = alpha;
    sctx.fillText(str, x, y);
    sctx.globalAlpha = 1;
    return sctx.measureText(str).width;
  }

  // 一行字, 放不下就从右往左滚
  function line(str, y, size, t) {
    sctx.font = `800 ${size}px ${FONT}`;
    const w = sctx.measureText(str).width;
    if (w <= DMD_W - 6) return text(str, DMD_W / 2, y, size);
    const span = w + 40;
    const off = ((t * 45) % span) - 6;
    text(str, -off, y, size, { align: 'left' });
    text(str, -off + span, y, size, { align: 'left' });
    return w;
  }

  function event(e, now) {
    const f = FX[e.type];
    if (f) fx = { kind: f.kind, start: now, len: f.len * 1000 };
  }

  // 平时: 大的分数 + 下面一行小字 (+ 一条进度: 任务剩下的时间、危机的血)
  function info(s) {
    if (s.status === 'over') return { text: '游戏结束 · 按「再来一局」' };
    const ch = CHAPTERS[s.chapter];
    if (s.pick) return { text: `◀ ${ch.missions[s.pick.options[s.pick.i]].name} ▶` };
    if (s.mission) {
      const def = ch.missions[s.mission.i];
      const m = s.mission;
      const left = Math.max(0, Math.ceil(m.left));
      if (m.value) return { text: `${def.name} ${Math.round(m.value).toLocaleString('en-US')} · ${left}秒`, bar: m.left / m.total };
      if (m.lit) return { text: `${def.name} 还剩${m.lit.length}样 · ${left}秒`, bar: m.left / m.total };
      const step = def.steps[m.step];
      return { text: `${def.name} ${m.have}/${step.need} · ${left}秒`, bar: m.left / m.total };
    }
    if (s.boss) return { text: `危机 ${ch.boss.name}`, bar: s.boss.hp / s.boss.max, hp: true };
    if (s.final) return { text: s.final.landing ? '打进黑洞 着陆!' : `着陆准备 ${FINAL.lit.length - s.final.lit.length}/${FINAL.lit.length}` };
    const ball = `球 ${s.ball}/${BALLS}${s.extra ? `+${s.extra}` : ''}`;
    const where = s.finalReady ? '终章' : `第${'一二三四'[s.chapter]}章${s.voyage ? `·${s.voyage + 1}航` : ''}`;
    return { text: `${ball}  ×${s.mult}  ${where}${s.multiball ? '  多球' : ''}` };
  }

  function draw(game, now) {
    if (!mask) resize();
    const s = game.state;
    const t = now / 1000;
    if (fx && now - fx.start > fx.len) fx = null;
    const msg = s.messageLeft > 0 ? s.message : '';
    // 什么都没变就不重画 (滚动、动画的时候每帧画)
    const inf = info(s);
    const key = `${s.score}|${msg}|${inf.text}|${inf.bar?.toFixed(2)}|${s.status}|${s.pull > 0}`;
    const moving = fx || (msg && measure(msg) > DMD_W - 6) || s.status === 'ready';
    if (!moving && key === lastKey) return;
    lastKey = key;

    sctx.clearRect(0, 0, DMD_W, DMD_H);
    sctx.fillStyle = '#fff';
    sctx.strokeStyle = '#fff';
    const p = fx ? (now - fx.start) / fx.len : 0;
    if (fx?.kind === 'stars') {
      // 跃迁: 星星从中间往外冲
      for (const st of stars) {
        const r = (st.r + st.v * p * 3) % 90;
        const x = DMD_W / 2 + Math.cos(st.a) * r * 1.6;
        const y = DMD_H / 2 + Math.sin(st.a) * r * 0.5;
        sctx.globalAlpha = Math.min(1, r / 30);
        sctx.fillRect(x, y, 1 + r / 30, 1);
      }
      sctx.globalAlpha = 1;
    } else if (fx?.kind === 'ships') {
      // 舰队出击: 三艘小飞船从左飞到右
      for (let i = 0; i < 3; i++) {
        const x = -30 + ((p * 1.3 - i * 0.12) % 1.3) * 170;
        const y = 8 + i * 12;
        sctx.beginPath();
        sctx.moveTo(x + 10, y);
        sctx.lineTo(x - 6, y - 4);
        sctx.lineTo(x - 3, y);
        sctx.lineTo(x - 6, y + 4);
        sctx.closePath();
        sctx.fill();
        sctx.globalAlpha = 0.5;
        sctx.fillRect(x - 16, y - 0.5, 9, 1);
        sctx.globalAlpha = 1;
      }
    } else if (fx?.kind === 'burst') {
      // 一圈一圈往外的光
      for (let k = 0; k < 3; k++) {
        const r = ((p * 3 + k / 3) % 1) * 90;
        sctx.globalAlpha = 1 - r / 90;
        sctx.lineWidth = 1.5;
        sctx.beginPath();
        sctx.ellipse(DMD_W / 2, DMD_H / 2, r, r * 0.4, 0, 0, Math.PI * 2);
        sctx.stroke();
      }
      sctx.globalAlpha = 1;
    } else if (fx?.kind === 'scan') {
      // 雷达扫一下
      const x = (p * 2 % 1) * DMD_W;
      const g = sctx.createLinearGradient(x - 30, 0, x, 0);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(1, 'rgba(255,255,255,0.55)');
      sctx.fillStyle = g;
      sctx.fillRect(x - 30, 0, 30, DMD_H);
      sctx.fillStyle = '#fff';
    }

    const flash = fx?.kind === 'flash' && Math.floor(now / 120) % 2 === 0;
    if (flash) {
      // 整块亮, 字是暗的
      sctx.fillRect(0, 0, DMD_W, DMD_H);
      sctx.globalCompositeOperation = 'destination-out';
    }
    if (msg) {
      line(msg, fx && fx.kind !== 'flash' ? 20 : 15, 14, t);
      if (!fx || fx.kind === 'flash') text(fmt(s.score), DMD_W / 2, 33, 11, { font: DIGITS, weight: 700 });
    } else if (s.status === 'ready' && s.score === 0 && s.ball === 1) {
      // 还没开始: 名字一闪一闪, 下面写怎么发射
      text('星 际 远 航', DMD_W / 2, 14, 18, { alpha: 0.6 + 0.4 * Math.sin(t * 4) });
      line(s.pull > 0 ? '松开发射!' : '拉弹簧 · 松开发射', 32, 11, t);
    } else {
      text(fmt(s.score), DMD_W / 2, 14, 24, { font: DIGITS, weight: 900 });
      line(s.status === 'ready' ? (s.pull > 0 ? '松开发射!' : `${inf.text} · 发射`) : inf.text, inf.bar != null ? 31 : 33, 11, t);
    }
    // 进度条 (任务的时间、危机的血): 最下面两行
    if (inf.bar != null && !msg) {
      const w = Math.round((DMD_W - 8) * Math.max(0, Math.min(1, inf.bar)));
      sctx.globalAlpha = 0.35;
      sctx.fillRect(4, 37, DMD_W - 8, 2);
      sctx.globalAlpha = 1;
      if (inf.hp) for (let x = 4; x < 4 + w; x += 3) sctx.fillRect(x, 37, 2, 2);
      else sctx.fillRect(4, 37, w, 2);
    }
    sctx.globalCompositeOperation = 'source-over';

    // 4 档亮度, 涂成橙色
    const img = sctx.getImageData(0, 0, DMD_W, DMD_H);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const a = d[i + 3];
      const lv = a > 190 ? 3 : a > 110 ? 2 : a > 40 ? 1 : 0;
      const c = LEVELS[lv];
      if (c) {
        d[i] = c[0];
        d[i + 1] = c[1];
        d[i + 2] = c[2];
        d[i + 3] = 255;
      } else d[i + 3] = 0;
    }
    lctx.putImageData(img, 0, 0);
    ctx.fillStyle = '#2a1504'; // 不亮的点也看得见一点
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(lit, 0, 0, canvas.width, canvas.height);
    ctx.drawImage(mask, 0, 0);
  }

  function measure(str) {
    sctx.font = `800 14px ${FONT}`;
    return sctx.measureText(str).width;
  }

  return { draw, event, resize };
}
