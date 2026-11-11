// 广播的播放条 (v1.78): 放着广播时, 屏幕最下面浮着一条 (台名、正在播放、暂停、关掉); 换到别的页面也接着响 (用户要的)。
// <audio> 只有一个, 放在页面外面 (不在 main 里), 换页面不会被换掉。游戏页 (全屏的) 上不显示这一条, 声音照样响。
// 锁屏、耳机上的播放 / 暂停按钮 (Media Session) 也能控制。
// v1.79: 睡觉定时 (几分钟后自己停)、音量 (iPad / iPhone 上网页改不了音量, 用机器的音量键); 在广播页上这一条不显示 (页面上有大面板)

import { h, fill, icon } from '../dom.js';
import { countClick } from '../radio.js';

let audio = null;
let bar = null;
let station = null; // 正在放的台
let state = 'idle'; // idle | loading | playing | paused | error
const listeners = new Set();

const STATUS = { loading: '正在连接……', playing: '正在播放', paused: '暂停了', error: '这个台现在放不了' };
const VOLUME_KEY = 'wengu:radio-volume';
let sleepAt = 0; // 睡觉定时: 几点停 (0: 没定)
let sleepTimer = null;
let tick = null; // 定了时: 每半分钟刷新一下「还剩几分钟」
const busy = () => state === 'playing' || state === 'loading';

function ensure() {
  if (audio) return;
  audio = new Audio();
  audio.preload = 'none';
  try {
    const v = Number(localStorage.getItem(VOLUME_KEY));
    if (v > 0 && v <= 1) audio.volume = v;
  } catch {
    // 拿不到就用默认的
  }
  audio.addEventListener('playing', () => station && set('playing'));
  audio.addEventListener('waiting', () => station && state === 'playing' && set('loading'));
  audio.addEventListener('pause', () => station && state !== 'error' && set('paused'));
  audio.addEventListener('error', () => station && audio.getAttribute('src') && set('error'));
  bar = h('div', { class: 'radio-bar', hidden: true, role: 'region', 'aria-label': '广播' });
  document.body.append(bar);
}

function set(next) {
  state = next;
  draw();
  for (const fn of listeners) fn();
}

function draw() {
  bar.hidden = !station;
  document.body.classList.toggle('radio-on', Boolean(station));
  if (!station) return fill(bar);
  fill(
    bar,
    h(
      'a',
      { class: 'radio-bar-main', href: '#/radio', title: '去广播那一页' },
      stationIcon(station, 34),
      h('span', { class: 'radio-bar-text' }, h('strong', {}, station.name), h('span', { class: `radio-bar-status${state === 'error' ? ' bad' : ''}` }, statusText())),
    ),
    h('button', { class: 'icon-btn radio-bar-btn', type: 'button', 'aria-label': busy() ? '暂停' : '播放', title: busy() ? '暂停' : '播放', onclick: togglePlay }, icon(busy() ? 'pause' : 'play', 22)),
    h('button', { class: 'icon-btn radio-bar-btn', type: 'button', 'aria-label': '关掉广播', title: '关掉广播', onclick: stopRadio }, icon('x', 20)),
  );
}

// 状态那一行: 「正在播放 · 还剩 23 分钟」
export function statusText() {
  const left = sleepLeft();
  return [STATUS[state] ?? '', left ? `还剩 ${left} 分钟` : ''].filter(Boolean).join(' · ');
}

// 电台的小图: 拿不到就用收音机的图标
export function stationIcon(s, size = 32) {
  const fallback = () => h('span', { class: 'radio-icon radio-icon-empty', style: `width:${size}px;height:${size}px` }, icon('radio', Math.round(size * 0.6)));
  if (!s.icon) return fallback();
  return h('img', { class: 'radio-icon', src: s.icon, alt: '', width: size, height: size, loading: 'lazy', referrerpolicy: 'no-referrer', onerror: (e) => e.target.replaceWith(fallback()) });
}

function start() {
  audio.src = station.url; // 直播: 每次从现在开始 (暂停再放也重新连, 不接着放几分钟前缓存的)
  set('loading');
  audio.play().catch((e) => {
    if (e?.name !== 'AbortError') set('error');
  });
}

// 放这个台; 正在放的就是它: 暂停 / 接着放
export function playStation(s) {
  ensure();
  if (station?.id === s.id && state !== 'error') return togglePlay();
  station = s;
  start();
  countClick(s.id);
  mediaSession(s);
}

export function togglePlay() {
  if (!station) return;
  if (busy()) {
    audio.pause();
    set('paused');
  } else start();
}

export function stopRadio() {
  if (!audio || !station) return;
  setSleep(0, { quiet: true });
  station = null;
  audio.pause();
  audio.removeAttribute('src');
  audio.load();
  set('idle');
}

export const radioNow = () => ({ station, state });

// ---- 睡觉定时: minutes 分钟后暂停 (0: 取消) ----
export function setSleep(minutes, { quiet = false } = {}) {
  clearTimeout(sleepTimer);
  clearInterval(tick);
  sleepTimer = null;
  tick = null;
  sleepAt = minutes > 0 ? Date.now() + minutes * 60000 : 0;
  if (sleepAt) {
    sleepTimer = setTimeout(() => {
      sleepAt = 0;
      clearInterval(tick);
      if (audio && station && busy()) audio.pause();
      if (station) set('paused');
    }, minutes * 60000);
    tick = setInterval(() => station && set(state), 30000);
  }
  if (!quiet && station) set(state);
}
// 还剩几分钟 (没定: 0)
export const sleepLeft = () => (sleepAt ? Math.max(1, Math.ceil((sleepAt - Date.now()) / 60000)) : 0);

// ---- 音量 (0–1) ----
export const radioVolume = () => audio?.volume ?? (Number(globalThis.localStorage?.getItem(VOLUME_KEY)) || 1);
export function setRadioVolume(v) {
  ensure();
  audio.volume = Math.min(1, Math.max(0, v));
  try {
    localStorage.setItem(VOLUME_KEY, String(audio.volume));
  } catch {
    // 存不了就算了
  }
}
// 这里能不能用网页改音量 (iPad、iPhone 不行: 改了也还是 1, 只能按机器的音量键)
export function canSetVolume() {
  try {
    const a = new Audio();
    a.volume = 0.5;
    return Math.abs(a.volume - 0.5) < 0.01;
  } catch {
    return false;
  }
}

// 广播页用: 播放的台、状态变了就叫一下; 返回取消的函数
export function onRadioChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// 锁屏、控制中心上显示台名, 那里的按钮也能暂停
function mediaSession(s) {
  const ms = globalThis.navigator?.mediaSession;
  if (!ms || typeof MediaMetadata !== 'function') return;
  try {
    ms.metadata = new MediaMetadata({ title: s.name, artist: '温故 · 广播', artwork: s.icon ? [{ src: s.icon }] : [] });
    ms.setActionHandler('play', () => !busy() && togglePlay());
    ms.setActionHandler('pause', () => busy() && togglePlay());
    ms.setActionHandler('stop', stopRadio);
  } catch {
    // 不支持就算了
  }
}
